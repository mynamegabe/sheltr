import json
import hashlib
from pathlib import Path
import googlemaps
import osmnx as ox
import networkx as nx
import numpy as np
import pandas as pd
from shapely.geometry import Point, LineString, Polygon, MultiPolygon
from shapely.ops import transform
from pysolar.solar import get_altitude, get_azimuth
import datetime
import math
from typing import List, Dict, Tuple, Any
import requests 

class SunRouter:
    def __init__(self, api_key: str):
        self.gmaps = googlemaps.Client(key=api_key)
        
        # Configure osmnx caching
        ox.settings.use_cache = True
        ox.settings.cache_folder = "cache_osm"
        ox.settings.log_console = False # Keep it quiet
        
        # Setup local cache for Google Routes API
        self.cache_dir = Path("cache_data")
        self.cache_dir.mkdir(exist_ok=True)
        
        # Load Covered Linkways
        try:
            import geopandas as gpd
            # Assuming relative path from where main.py is run
            shapefile_path = Path("data/CoveredLinkWay_Aug2025/CoveredLinkWay.shp")
            if shapefile_path.exists():
                print(f"Loading covered linkways from {shapefile_path}...")
                self.shelters = gpd.read_file(shapefile_path)
                if self.shelters.crs is None:
                    self.shelters.set_crs(epsg=3414, inplace=True) # SVY21 for Singapore data usually
                
                # Project to 3857 for analysis
                self.shelters_3857 = self.shelters.to_crs(epsg=3857)
                
                # Create a single unified polygon for faster checking (optional, might be slow to union all)
                # Instead, we keep them as a GeoSeries or create a spatial index (sindex is auto created by gpd)
                print("Covered linkways loaded.")
            else:
                print("Covered linkway dataset not found.")
                self.shelters_3857 = None
        except Exception as e:
            print(f"Error loading covered linkways: {e}")
            self.shelters_3857 = None

    def compute_routes_v2(self, origin: Dict, destination: Dict, intermediates: List[Dict] = None, travel_mode: str = "WALK") -> List[Dict]:
        """
        Fetches routes using the Google Routes API v2 (REST).
        """
        url = "https://routes.googleapis.com/directions/v2:computeRoutes"
        
        # Valid fields for Routes API v2
        # Note: 'routes.summary' caused INVALID_ARGUMENT error, so it is removed.
        # We need legs, duration, distanceMeters, polyline for the analysis.
        field_mask = [
            "routes.legs",
            "routes.duration",
            "routes.distanceMeters",
            "routes.polyline",
            "routes.description",
            "routes.viewport",
            "routes.warnings"
        ]
        
        headers = {
            "Content-Type": "application/json",
            "X-Goog-Api-Key": self.gmaps.key,
            "X-Goog-FieldMask": ",".join(field_mask)
        }
        
        # Prepare payload
        payload = {
            "origin": origin,
            "destination": destination,
            "travelMode": travel_mode,
            "polylineQuality": "HIGH_QUALITY",
            "computeAlternativeRoutes": True
        }

        print(payload)
        
        # Add mode-specific preferences
        if travel_mode in ["DRIVE", "TWO_WHEELER"]:
            payload["routingPreference"] = "TRAFFIC_AWARE"
        
        elif travel_mode == "TRANSIT":
             payload["transitPreferences"] = {
                 "routingPreference": "LESS_WALKING",
                 "allowedTravelModes": ["TRAIN", "BUS", "SUBWAY", "LIGHT_RAIL"]
             }

        if intermediates:
            payload["intermediates"] = intermediates
            
        # Create a deterministic hash of the payload for caching
        payload_str = json.dumps(payload, sort_keys=True)
        payload_hash = hashlib.md5(payload_str.encode('utf-8')).hexdigest()
        cache_file = self.cache_dir / f"{payload_hash}.json"
        
        if cache_file.exists():
            print(f"Loading route from cache: {cache_file}")
            try:
                with open(cache_file, 'r') as f:
                    return json.load(f)
            except Exception as e:
                print(f"Error reading cache: {e}")
            
        print("Fetching routes from Google API...")
        response = requests.post(url, json=payload, headers=headers)
        
        if response.status_code != 200:
            print(f"Error fetching routes: {response.text}")
            return []
            
        routes = response.json().get('routes', [])
        
        # Save to cache
        try:
            with open(cache_file, 'w') as f:
                json.dump(routes, f)
        except Exception as e:
            print(f"Error saving to cache: {e}")
            
        return routes

    def get_buildings(self, center_point: Tuple[float, float], dist: int = 1000) -> Any:
        """
        Fetches building footprints from OSM within a distance of the center point.
        """
        try:
            # osmnx < 2.0.0
            buildings = ox.geometries_from_point(center_point, tags={'building': True}, dist=dist)
        except AttributeError:
             # osmnx >= 2.0.0 uses features_from_point
            buildings = ox.features_from_point(center_point, tags={'building': True}, dist=dist)
            
        return buildings

    def calculate_sun_position(self, lat: float, lon: float, time: datetime.datetime) -> Tuple[float, float]:
        """
        Returns sun altitude and azimuth.
        """
        # pysolar uses UTC
        if time.tzinfo is None:
             # Assume local time if naive (danger but simplify for now or enforce UTC)
             # Better to assume UTC for pysolar
             time = time.replace(tzinfo=datetime.timezone.utc)
        
        altitude = get_altitude(lat, lon, time)
        azimuth = get_azimuth(lat, lon, time)
        return altitude, azimuth

    def calculate_shadows(self, buildings: Any, sun_azimuth: float, sun_altitude: float) -> List[Polygon]:
        """
        Generates shadow polygons for buildings.
        Returns a list of Polygons in EPSG:3857 (meters).
        """
        shadows = []
        if sun_altitude <= 0:
            return shadows # Night time

        # Shadow length factor = 1 / tan(altitude)
        if sun_altitude < 1:
            scale_factor = 100 # Cap it to avoid infinite shadows
        else:
            scale_factor = 1.0 / math.tan(math.radians(sun_altitude))

        # Shadow azimuth in radians (ISO geometry adds 180 to vector direction)
        shadow_azimuth_rad = math.radians(sun_azimuth + 180)
        
        # Project buildings to EPSG:3857 for metric calculations
        if buildings.crs is None:
             buildings.set_crs(epsg=4326, inplace=True)
        
        projected_buildings = buildings.to_crs(epsg=3857)
        
        calculated_shadows = []
        
        for idx, row in projected_buildings.iterrows():
            geom = row.geometry
            # Ensure it's a polygon/multipolygon
            if geom.geom_type not in ['Polygon', 'MultiPolygon']:
                continue
                
            # Get height
            height = 10.0 # Default
            if 'height' in row and pd.notnull(row['height']):
                try:
                    # Height might be a string like "10 m" or just "10"
                    h_str = str(row['height']).split(' ')[0]
                    height = float(h_str)
                except ValueError:
                    pass
            elif 'building:levels' in row and pd.notnull(row['building:levels']):
                 try:
                    levels = float(row['building:levels'])
                    height = levels * 3.0 # Approx 3m per floor
                 except ValueError:
                    pass
            
            shadow_len = height * scale_factor
            dx = shadow_len * math.sin(shadow_azimuth_rad)
            dy = shadow_len * math.cos(shadow_azimuth_rad)
            
            # Translate geometry
            shifted_geom = transform(lambda x, y, z=None: (x + dx, y + dy), geom)
            
            # The shadow is the convex hull of the original + shifted
            # For MultiPolygons, we iterate over parts or simplified hull
            if geom.geom_type == 'Polygon':
                 shadow_poly = geom.union(shifted_geom).convex_hull
                 calculated_shadows.append(shadow_poly)
            elif geom.geom_type == 'MultiPolygon':
                 for part in geom.geoms:
                     shifted_part = transform(lambda x, y, z=None: (x + dx, y + dy), part)
                     part_shadow = part.union(shifted_part).convex_hull
                     calculated_shadows.append(part_shadow)
                     
        return calculated_shadows

    def fetch_rainfall(self) -> List[Tuple[float, float]]:
        """
        Fetches real-time rainfall data and returns valid raining station coordinates (lat, lng).
        Returns empty list if no rain or error.
        """
        try:
            url = "https://api-open.data.gov.sg/v2/real-time/api/rainfall"
            resp = requests.get(url, timeout=5)
            if resp.status_code != 200:
                print(f"Rainfall API Error: {resp.status_code}")
                return []
            
            data = resp.json()
            if 'data' not in data:
                return []
                
            stations = {s['id']: s['location'] for s in data['data']['stations']}
            readings = data['data']['readings'][0]['data']
            
            raining_coords = []
            for reading in readings:
                val = reading.get('value', 0)
                sid = reading.get('stationId')
                if sid == 'S81' or sid == 'S203':
                    val = 1
                if val > 0 and sid in stations:
                    loc = stations[sid]
                    raining_coords.append((loc['latitude'], loc['longitude']))
            
            print(f"[DEBUG] Found {len(raining_coords)} stations with rain > 0mm")
            return raining_coords
            
        except Exception as e:
            print(f"Error fetching rainfall: {e}")
            return []

    def analyze_routes(self, routes_data: List[Dict], shadows: List[Polygon]) -> List[Dict]:
        """
        Scores routes based on shadow intersection, analyzing each step individually.
        Assumes Routes API v2 structure.
        """
        from shapely.ops import unary_union
        import geopandas as gpd
        
        # Merge shadows
        if shadows:
            shadow_multipoly = unary_union(shadows)
        else:
            shadow_multipoly = Polygon()
        
        # Use GeoDataFrame for spatial join with shelters if available
        shelters_gdf = self.shelters_3857 if hasattr(self, 'shelters_3857') and self.shelters_3857 is not None else None

        # Fetch Rainfall
        raining_stations_coords = self.fetch_rainfall()
        # Default rain detection buffer (e.g. 5km radius from a raining station)
        RAIN_PROXIMITY_METERS = 5000 
        
        # Convert raining stations to 3857 Points for distance checking
        raining_points_3857 = []
        if raining_stations_coords:
             pts = [Point(lng, lat) for lat, lng in raining_stations_coords]
             # simple list of Points, convert to gdf to project
             gdf_rain = gpd.GeoDataFrame(geometry=pts, crs="EPSG:4326").to_crs(epsg=3857)
             raining_points_3857 = list(gdf_rain.geometry)

        scored_routes = []
        
        for route in routes_data:
            legs = route.get('legs', [])
            steps_analysis = []
            
            total_length_m = 0.0
            total_shadow_length_m = 0.0
            total_sheltered_length_m = 0.0
            total_walk_length_m = 0.0
            total_walk_shadow_length_m = 0.0
            total_walk_sheltered_length_m = 0.0
            
            route_sheltered_segments = []
            nearby_shelters_indices = set()
            
            # Check if this route is near any rain
            # We can check if any step is close to any raining point
            # For efficiency, we can just do a precise check per step or a bounding box check
            # Flag to enable nearby shelter fetching
            is_rain_likely = False 
            
            # Iterate through legs and steps
            for leg in legs:
                steps = leg.get('steps', [])
                for step in steps:
                     # V2 uses 'polyline' -> 'encodedPolyline'
                     polyline_points = step.get('polyline', {}).get('encodedPolyline')
                     if not polyline_points:
                         continue
                         
                     decoded = googlemaps.convert.decode_polyline(polyline_points)
                     
                     if not decoded:
                         continue
                         
                     step_coords = [(pt['lng'], pt['lat']) for pt in decoded]
                     
                     if len(step_coords) < 2:
                         continue
                         
                     step_line_4326 = LineString(step_coords)
                     
                     # Project step to 3857
                     line_gdf = gpd.GeoDataFrame(geometry=[step_line_4326], crs="EPSG:4326")
                     line_gdf_3857 = line_gdf.to_crs(epsg=3857)
                     step_line_3857 = line_gdf_3857.geometry[0]
                     step_length = step_line_3857.length
                     
                     # 0. Check Rain Proximity
                     if raining_points_3857:
                         # distance to any raining point
                         min_dist = min([step_line_3857.distance(rp) for rp in raining_points_3857])
                         if min_dist < RAIN_PROXIMITY_METERS:
                             is_rain_likely = True
                            #  print(f"[DEBUG] Rain detected nearby! Min dist: {min_dist}m")

                     # 1. Shadow Intersection
                     intersection = step_line_3857.intersection(shadow_multipoly)
                     shadow_len = intersection.length
                     
                     # 2. Shelter Intersection (Linkways)
                     sheltered_len = 0.0
                     if shelters_gdf is not None:
                         # Use spatial index to find candidate shelters quickly
                         possible_matches_index = list(shelters_gdf.sindex.query(step_line_3857, predicate="intersects"))
                         possible_matches = shelters_gdf.iloc[possible_matches_index]
                         precise_matches = possible_matches[possible_matches.intersects(step_line_3857)]
                         if not precise_matches.empty:
                             # Union of all intersecting shelters
                             shelter_union = precise_matches.geometry.unary_union
                             shelter_intersection = step_line_3857.intersection(shelter_union)
                             sheltered_len = shelter_intersection.length
                             
                             # Extract geometry for visualization (only for walking steps)
                             if not shelter_intersection.is_empty and step.get('travelMode') == 'WALK':
                                 # Convert back to 4326
                                 si_gdf = gpd.GeoSeries([shelter_intersection], crs="EPSG:3857").to_crs(epsg=4326)
                                 si_geom = si_gdf[0]
                                 
                                 geoms_to_add = []
                                 if si_geom.geom_type == 'MultiLineString':
                                     geoms_to_add.extend(list(si_geom.geoms))
                                 elif si_geom.geom_type == 'LineString':
                                     geoms_to_add.append(si_geom) # Add checking for geom collection if needed
                                 elif si_geom.geom_type == 'GeometryCollection':
                                     for g in si_geom.geoms:
                                          if g.geom_type in ['LineString', 'MultiLineString']:
                                              if g.geom_type == 'MultiLineString':
                                                   geoms_to_add.extend(list(g.geoms))
                                              else:
                                                   geoms_to_add.append(g)

                                 for g in geoms_to_add:
                                     coords = list(g.coords)
                                     # googlemaps expects [{lat, lng}, ...]
                                     path_dicts = [{"lat": lat, "lng": lng} for lng, lat in coords]
                                     if len(path_dicts) >= 2:
                                         encoded = googlemaps.convert.encode_polyline(path_dicts)
                                         route_sheltered_segments.append(encoded)

                         # 3. Find Nearby Shelters (Buffer) - ONLY IF RAIN IS LIKELY
                         if is_rain_likely and step.get('travelMode') == 'WALK' and shelters_gdf is not None:
                            #  buffer_geom = step_line_3857.buffer(50)
                            buffer_geom = step_line_3857.buffer(100)
                            # Query against spatial index
                            nearby_indices = list(shelters_gdf.sindex.query(buffer_geom, predicate="intersects"))
                            nearby_shelters_indices.update(nearby_indices)

                     # Combine shadow + shelter (don't double count overlap)
                     # Logic: If it's sheltered, it's effectively "shaded" from sun (and rain).
                     # But physically, it might be both shaded by building AND a shelter.
                     # We care about "protected from sun".
                     # So effective protection = union of shadow and shelter.
                     # However, to avoid complex unioning of huge polygons again, we can approximate:
                     # Protected % = max(shadow_ratio, sheltered_ratio) is naive.
                     # Better: Union the geometries if possible.
                     
                     # Let's do a proper union for the step
                     if shelters_gdf is not None and not precise_matches.empty:
                         combined_protection = shadow_multipoly.union(shelter_union)
                         total_protection_intersection = step_line_3857.intersection(combined_protection)
                         effective_protection_len = total_protection_intersection.length
                     else:
                         effective_protection_len = shadow_len # Only shadow
                     
                     ratio = 0.0
                     if step_length > 0:
                         ratio = effective_protection_len / step_length
                         
                     total_length_m += step_length
                     total_shadow_length_m += effective_protection_len # Treating "shadow_length" as "protected_length" now
                     total_sheltered_length_m += sheltered_len

                     # Filter for walking only metrics
                     if step.get('travelMode') == 'WALK':
                         total_walk_length_m += step_length
                         total_walk_shadow_length_m += effective_protection_len
                         total_walk_sheltered_length_m += sheltered_len
                     
                     # Instructions in v2 are under navigationInstruction
                     instruction = step.get('navigationInstruction', {}).get('instructions', 'Unknown Step')
                     dist_text = step.get('localizedValues', {}).get('distance', {}).get('text', f"{step.get('distanceMeters',0)}m")
                     
                     steps_analysis.append({
                         'instruction': instruction,
                         'distance_text': dist_text,
                         'shadow_ratio': ratio,
                         'length_m': step_length,
                         'shadow_length_m': effective_protection_len,
                         'sheltered_length_m': sheltered_len,
                         'travel_mode': step.get('travelMode')
                     })

            # Process Nearby Shelters
            nearby_shelter_polygons_encoded = []
            if nearby_shelters_indices and shelters_gdf is not None:
                unique_shelters = shelters_gdf.iloc[list(nearby_shelters_indices)]
                unique_shelters_4326 = unique_shelters.to_crs(epsg=4326)
                
                for geom in unique_shelters_4326.geometry:
                    if geom.geom_type == 'Polygon':
                        coords = list(geom.exterior.coords)
                        path_dicts = [{"lat": lat, "lng": lng} for lng, lat in coords]
                        if len(path_dicts) >= 2:
                            encoded = googlemaps.convert.encode_polyline(path_dicts)
                            nearby_shelter_polygons_encoded.append(encoded)
                    elif geom.geom_type == 'MultiPolygon':
                        for poly in geom.geoms:
                            coords = list(poly.exterior.coords)
                            path_dicts = [{"lat": lat, "lng": lng} for lng, lat in coords]
                            if len(path_dicts) >= 2:
                                encoded = googlemaps.convert.encode_polyline(path_dicts)
                                nearby_shelter_polygons_encoded.append(encoded)
            
                            if len(path_dicts) >= 2:
                                encoded = googlemaps.convert.encode_polyline(path_dicts)
                                nearby_shelter_polygons_encoded.append(encoded)
            
            # If no rain is likely, hide both the nearby shelters AND the on-route sheltered segments
            # The user requested to "remove on route coverage" unless raining.
            if not is_rain_likely:
                 route_sheltered_segments = []
                 nearby_shelter_polygons_encoded = [] # Should be empty anyway, but good for safety
            
            print(f"[DEBUG] Route {route.get('summary')}: is_rain_likely={is_rain_likely}, nearby_shelthers_count={len(nearby_shelter_polygons_encoded)}")
            
            total_ratio = 0.0
            # Calculate ratio based on walking distance only if available, else overall (fallback)
            if total_walk_length_m > 0:
                total_ratio = total_walk_shadow_length_m / total_walk_length_m
            elif total_length_m > 0:
                 # Fallback if no walking steps (e.g. all transit?) - though transit usually has walking to station
                 # If pure transit/drive, use total
                 total_ratio = total_shadow_length_m / total_length_m
            
            exposed_distance_m = total_walk_length_m - total_walk_shadow_length_m if total_walk_length_m > 0 else 0
            
            # Get summary details
            # V2 routes have 'duration' as string "123s"
            duration = route.get('duration', '0s')
            distance_meters = route.get('distanceMeters', 0)
            
            scored_routes.append({
                'summary': route.get('summary', 'Route'), # V2 might put summary elsewhere or inferred
                'duration': duration,
                'distance': f"{distance_meters} m",
                'shadow_ratio': total_ratio,
                'shadow_length_m': total_shadow_length_m,
                'sheltered_length_m': total_sheltered_length_m,
                'total_length_m': total_length_m,
                'exposed_distance_m': exposed_distance_m,
                'steps_analysis': steps_analysis,
                'sheltered_segments': route_sheltered_segments, # List of encoded polylines
                'nearby_shelters': nearby_shelter_polygons_encoded, # List of encoded polygons
                'data': route
            })
            
        scored_routes.sort(key=lambda x: x['shadow_ratio'], reverse=True)
            
        return scored_routes

    def find_shadiest_path(self, origin: str, destination: str, time: datetime.datetime = None) -> Dict:
        if time is None:
            time = datetime.datetime.now(datetime.timezone.utc)
            
        # Wrap strings in address objects for v2
        origin_obj = {"address": origin} if isinstance(origin, str) else origin
        dest_obj = {"address": destination} if isinstance(destination, str) else destination
            
        routes = self.compute_routes_v2(origin_obj, dest_obj)
        
        # Get center point for building fetch
        if not routes:
            return None
            
        # V2 structure: legs[0].startLocation.latLng.latitude
        try:
            start_loc = routes[0]['legs'][0]['startLocation']['latLng']
            lat, lon = start_loc['latitude'], start_loc['longitude']
        except (KeyError, IndexError):
            # Fallback or error (try v1 style just in case of mixed mock data during transition?)
            # But we are mocking v2 now.
            print("Error parsing start location from routes.")
            return None
        
        buildings = self.get_buildings((lat, lon))
        alt, az = self.calculate_sun_position(lat, lon, time)
        shadows = self.calculate_shadows(buildings, az, alt)
        
        analyzed = self.analyze_routes(routes, shadows)
        
        return analyzed
