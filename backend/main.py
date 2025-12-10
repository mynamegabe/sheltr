
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

app = FastAPI()

from fastapi.middleware.cors import CORSMiddleware

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"], # Allow all for dev, or specific ["http://localhost:5173"]
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- Filesystem Persistence for Reports ---
import json
REPORTS_FILE = "data/reports.json"

def load_reports():
    if not os.path.exists(REPORTS_FILE):
        return []
    try:
        with open(REPORTS_FILE, "r") as f:
            return json.load(f)
    except Exception:
        return []

def save_reports(reports):
    os.makedirs(os.path.dirname(REPORTS_FILE), exist_ok=True)
    with open(REPORTS_FILE, "w") as f:
        json.dump(reports, f, indent=2)

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
    
    return analyzed_routes

weather_service = WeatherService()

@app.get("/weather")
async def get_weather(lat: float, lon: float):
    return weather_service.fetch_nearby_forecasts(lat, lon)

# --- Report Endpoints ---

@app.get("/reports", response_model=List[Report])
async def get_reports():
    return load_reports()

@app.post("/reports", response_model=Report)
async def create_report(report: ReportCreate):
    reports = load_reports()
    
    # Create new report object
    new_report = report.dict()
    # Generate ID if not present (though frontend might handle temporary ID, backend should probably finalize it or accept it)
    # The schema has ID in Report but not ReportCreate? 
    # Wait, ReportCreate inherits ReportBase. Report inherits ReportBase + has ID.
    # So we need to generate ID.
    import uuid
    new_report_id = str(uuid.uuid4())
    
    final_report = {
        "id": new_report_id,
        **new_report,
        "confirmations": 1,
        "denials": 0
    }
    
    reports.append(final_report)
    save_reports(reports)
    return final_report

@app.post("/reports/{report_id}/confirm", response_model=Report)
async def confirm_report(report_id: str):
    reports = load_reports()
    for r in reports:
        if r["id"] == report_id:
            r["confirmations"] += 1
            save_reports(reports)
            return r
    raise HTTPException(status_code=404, detail="Report not found")

@app.post("/reports/{report_id}/deny", response_model=Report)
async def deny_report(report_id: str):
    reports = load_reports()
    updated_reports = []
    found = False
    returned_report = None
    
    for r in reports:
        if r["id"] == report_id:
            found = True
            r["denials"] += 1
            if r["denials"] < 3:
                updated_reports.append(r)
                returned_report = r
            else:
                # Removed
                returned_report = r # return it even if removed? Or raise 404? 
                # Let's return it with status? Or just return success.
                pass
        else:
            updated_reports.append(r)
            
    if not found:
        raise HTTPException(status_code=404, detail="Report not found")
        
    save_reports(updated_reports)
    return returned_report

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)