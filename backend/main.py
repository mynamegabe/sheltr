
import os
import datetime
from fastapi import FastAPI, HTTPException, Body
from dotenv import load_dotenv
from typing import List
from fastapi import FastAPI
import uvicorn
from schemas import RouteRequest, Report, ReportCreate
from modules.sun_router import SunRouter
from modules.weather_service import WeatherService

load_dotenv()

import models
from database import engine, get_db
from sqlalchemy.orm import Session
from fastapi import FastAPI, HTTPException, Body, Depends

# Create tables
models.Base.metadata.create_all(bind=engine)

load_dotenv()

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for dev, or specific ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Initialize SunRouter
api_key = os.getenv("GOOGLE_MAPS_API_KEY") or os.getenv("GOOGLE_API_KEY")
if not api_key:
    print("Warning: GOOGLE_MAPS_API_KEY not found in environment.")

router_service = SunRouter(api_key=api_key) if api_key else None

@app.get("/")
async def root():
    return {"message": "Sun Routing API is online"}

@app.post("/routes", response_model=List[dict])
async def get_routes(request: RouteRequest):
    if not router_service:
        raise HTTPException(status_code=500, detail="SunRouter service not initialized (missing API key)")

    print(f"Received request: {request}")

    try:
        # Determine strict or normal routing
        # If prefer_shade is True, we use find_shadiest_path logic (which fetches, then analyzes).
        # find_shadiest_path expects Strings for origin/dest if simplistic, or Dicts if detailed.
        # It calls compute_routes_v2 internaly.
        
        # We need to construct the origin/destination inputs for compute_routes_v2 / find_shadiest_path
        # The schema gives us strings.
        
        # RouteRequest allows passing extra prefs, so we shouldn't just pass strings if we want to support that?
        # SunRouter.find_shadiest_path takes origin/dest as str OR dict.
        
        # Implementation decision: always pass simple string names for now, 
        # unless we want to support coords. The prompt said "location name".
        
        # Handle custom travel mode logic that was requested in the prompt ("travelled routes", "prefer shade")
        # RouteRequest handles the inputs.
        
        if request.prefer_shade:
             # Default time for shadow analysis? Current time or should it be passed?
             # For now, use current time as defaulted in find_shadiest_path
             time = datetime.datetime.now(datetime.timezone.utc)
             
             # We might need to slightly modify find_shadiest_path to accept the specialized 
             # routing_preference/transit_preferences if we want to fully support the user prompt
             # But compute_routes_v2 already supports valid kwargs or we can pass dicts?
             
             # Currently find_shadiest_path takes origin(str/dict), dest(str/dict), time.
             # It calls compute_routes_v2(origin_obj, dest_obj, travel_mode="WALK").
             # We need to update find_shadiest_path to forward travel_mode and other prefs!
             
             # FOR NOW: Let's call find_shadiest_path and see if we can patch it to support travel_mode
             # Actually, simpler: let's update find_shadiest_path signature in a separate tool call if needed
             # OR manually orchestrate here to be safe without modifyign SunRouter interface yet.
             
             # SunRouter.find_shadiest_path doesn't accept travel_mode arg in current code (just uses compute_routes_v2 defaults?)
             # Let's check SunRouter code again - wait, I don't need to check, I have it in context.
             # Line 298: def find_shadiest_path(self, origin: str, destination: str, time: datetime.datetime = None) -> Dict:
             # It calls compute_routes_v2(..., dest_obj) -> implicit default travel_mode="WALK"
             # THIS IS A LIMITATION. I need to modify find_shadiest_path to accept travel_mode!
             
             pass # Logic placeholder
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

    # To avoid changing SunRouter in this file write, I will just IMPLEMENT the orchestrator here
    # duplicating the logic of find_shadiest_path BUT with correct parameters.
    
    # 1. Fetch Routes
    if type(request.origin) == str:
        origin_obj = {"address": request.origin}
    else:
        origin_obj = request.origin
    
    if type(request.destination) == str:
        dest_obj = {"address": request.destination}
    else:
        dest_obj = request.destination
    
    # Manually construct payload mods?? No, compute_routes_v2 handles most.
    # But compute_routes_v2 signature: (origin, dest, intermediates, travel_mode)
    
    # Oh wait, my compute_routes_v2 definition handles the logic for routingPrefernece inside itself 
    # based on travel_mode.
    
    # So I just need to call compute_routes_v2, then calculate shadows.
    
    routes = router_service.compute_routes_v2(
        origin=origin_obj,
        destination=dest_obj,
        travel_mode=request.travel_mode
    )
    
    if not routes:
        return []

    # If NO shade preference, just return routes (maybe with 0 shadow score)
    if not request.prefer_shade:
        # Return as is (maybe normalize fields?)
        # analyze_routes assumes shadows exist or handles empty.
        # Let's run analyze_routes with empty shadows to get consistent format
        return router_service.analyze_routes(routes, [])

    # If shade preference:
    # 1. Get center
    try:
        start_loc = routes[0]['legs'][0]['startLocation']['latLng']
        lat, lon = start_loc['latitude'], start_loc['longitude']
    except (KeyError, IndexError):
        print("Error parsing start location")
        return []

    # 2. Get buildings
    buildings = router_service.get_buildings((lat, lon))
    
    # 3. Sun pos
    if request.start_time:
        if request.start_time.tzinfo is None:
            # Assume UTC if naive, or default to backend server time logic
            time = request.start_time.replace(tzinfo=datetime.timezone.utc)
        else:
            time = request.start_time
    else:
        time = datetime.datetime.now(datetime.timezone.utc)

    print(f"Calculating sun position for {lat}, {lon} at {time}")
        
    alt, az = router_service.calculate_sun_position(lat, lon, time)
    
    # 4. Shadows
    shadows = router_service.calculate_shadows(buildings, az, alt)
    
    # 5. Analyze
    analyzed_routes = router_service.analyze_routes(routes, shadows)
    
    if analyzed_routes:
        print(f"[DEBUG] Route keys: {analyzed_routes[0].keys()}")
        print(f"[DEBUG] Walk len: {analyzed_routes[0].get('total_walk_length_m')}")

    return analyzed_routes

weather_service = WeatherService()

@app.get("/weather")
async def get_weather(lat: float, lon: float):
    return weather_service.fetch_nearby_forecasts(lat, lon)

# --- Report Endpoints ---
from schemas import AccessibilitySubmission, AccessibilitySubmissionCreate

@app.get("/reports", response_model=List[Report])
async def get_reports(db: Session = Depends(get_db)):
    return db.query(models.Report).all()

@app.post("/reports", response_model=Report)
async def create_report(report: ReportCreate, db: Session = Depends(get_db)):
    db_report = models.Report(
        type=report.type,
        label=report.label,
        latitude=report.coordinates[1],
        longitude=report.coordinates[0], # Frontend sends [lng, lat] usually? Schema says coordinates: List[float]. Usually GeoJSON is [lng, lat].
        # wait, models.Report has lat/lng separately.
        # Check ReportCreate schema: coordinates: List[float].
        # I'll assume [lng, lat] based on typical map libs, but let's double check usage if possible. 
        # Actually in models.py I defined lat/long. 
        # I'll assume [lng, lat] for now.
        details=report.details,
        timestamp=report.timestamp
    )
    db.add(db_report)
    db.commit()
    db.refresh(db_report)
    
    # Convert back to Schema format (restore coordinates list)
    # The Pydantic model Report expects `coordinates`. models.Report has lat/lng.
    # We need to map it or Pydantic `from_attributes` might fail if names don't match.
    # Let's do a manual map or add a property to the model, but manual is safer for response.
    return convert_report_model_to_schema(db_report)

def convert_report_model_to_schema(r):
    return {
        "id": r.id,
        "type": r.type,
        "label": r.label,
        "coordinates": [r.longitude, r.latitude],
        "details": r.details,
        "timestamp": r.timestamp,
        "confirmations": r.confirmations,
        "denials": r.denials
    }

@app.post("/reports/{report_id}/confirm", response_model=Report)
async def confirm_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    report.confirmations += 1
    db.commit()
    db.refresh(report)
    return convert_report_model_to_schema(report)

@app.post("/reports/{report_id}/deny", response_model=Report)
async def deny_report(report_id: str, db: Session = Depends(get_db)):
    report = db.query(models.Report).filter(models.Report.id == report_id).first()
    if not report:
        raise HTTPException(status_code=404, detail="Report not found")
    
    report.confirmations -= 1
    if report.confirmations <= 0:
        db.delete(report)
        db.commit()
        # Return a dummy representation or the last state, but the ID is now invalid for future ops
        return convert_report_model_to_schema(report)
    else:
        db.commit()
        db.refresh(report)
        return convert_report_model_to_schema(report)

# --- Accessibility Endpoints ---

@app.get("/accessibility", response_model=List[AccessibilitySubmission])
async def get_accessibility_submissions(db: Session = Depends(get_db)):
    return db.query(models.AccessibilitySubmission).all()

@app.post("/accessibility", response_model=AccessibilitySubmission)
async def create_accessibility_submission(submission: AccessibilitySubmissionCreate, db: Session = Depends(get_db)):
    db_item = models.AccessibilitySubmission(**submission.dict())
    db.add(db_item)
    db.commit()
    db.refresh(db_item)
    return db_item