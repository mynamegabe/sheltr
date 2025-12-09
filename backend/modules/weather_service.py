# modules/weather_service.py
import requests
import math
import os

class WeatherService:
    def __init__(self):
        # Load the X-Api-Key specifically for weather
        self.api_key = os.getenv("X-Api-Key")
        # Base URL (Data.gov.sg)
        self.url = "https://api-open.data.gov.sg/v2/real-time/api/two-hr-forecast"

    def fetch_nearby_forecasts(self, lat: float, lon: float, limit: int = 5):
        try:
            # Prepare Headers (If the API requires the key in the header)
            headers = {}
            if self.api_key:
                headers["X-Api-Key"] = self.api_key

            # Make the request
            resp = requests.get(self.url, headers=headers, timeout=5)
            
            if resp.status_code != 200:
                print(f"Weather API Error: {resp.status_code}")
                return [{"city": "Error", "distance": 0, "description": f"API Error {resp.status_code}"}]

            data = resp.json()
            
            raw_forecasts = data["data"]["items"][0]["forecasts"]
            forecast_map = {item["area"]: item["forecast"] for item in raw_forecasts}

            areas_metadata = data["data"]["area_metadata"]
            scored_areas = []

            for area in areas_metadata:
                name = area["name"]
                area_lat = area["label_location"]["latitude"]
                area_lon = area["label_location"]["longitude"]
                
                dist = math.sqrt((lat - area_lat)**2 + (lon - area_lon)**2)
                
                scored_areas.append({
                    "city": name,
                    "distance": dist,
                    "description": forecast_map.get(name, "Unknown")
                })

            # Sort and take top 5
            return sorted(scored_areas, key=lambda x: x["distance"])[:limit]

        except Exception as e:
            print(f"Weather Service Exception: {e}")
            return [{"city": "Backend Error", "distance": 0, "description": str(e)}]