import os
import sys
import datetime
from backend.sun_router import SunRouter
import googlemaps

# Mock response using exact Google Routes API (v2) structure
MOCK_ROUTES = [
    {
        "description": "Route via West St to North Ave",
        "legs": [
            {
                "distanceMeters": 2000,
                "duration": "1200s",
                "startLocation": {
                    "latLng": {"latitude": 40.748817, "longitude": -73.985428}
                },
                "endLocation": {
                    "latLng": {"latitude": 40.7580, "longitude": -73.995428}
                },
                "steps": [
                    {
                        "distanceMeters": 1000,
                        "staticDuration": "600s",
                        "polyline": {
                            "encodedPolyline": "cwuwF|gqbM?n}@"
                        },
                        "startLocation": {
                            "latLng": {"latitude": 40.748817, "longitude": -73.985428}
                        },
                        "endLocation": {
                            "latLng": {"latitude": 40.748817, "longitude": -73.995428}
                        },
                        "navigationInstruction": {
                            "maneuver": "TURN_LEFT",
                            "instructions": "Head West on West St"
                        },
                        "localizedValues": {
                            "distance": {"text": "1.0 km"},
                            "staticDuration": {"text": "10 mins"}
                        }
                    },
                    {
                        "distanceMeters": 1000,
                        "staticDuration": "600s",
                        "polyline": {
                            "encodedPolyline": "cwuwFlfsbMkx@?"
                        },
                        "startLocation": {
                            "latLng": {"latitude": 40.748817, "longitude": -73.995428}
                        },
                        "endLocation": {
                            "latLng": {"latitude": 40.7580, "longitude": -73.995428}
                        },
                        "navigationInstruction": {
                            "maneuver": "TURN_RIGHT",
                            "instructions": "Turn Right onto North Ave"
                        },
                        "localizedValues": {
                            "distance": {"text": "1.0 km"},
                            "staticDuration": {"text": "10 mins"}
                        }
                    }
                ]
            }
        ],
        "polyline": {
            "encodedPolyline": "cwuwF|gqbM?n}@kx@?"
        },
        "summary": "Route 1 (West then North)"
    },
    {
         "description": "Route via Mock Ave to West St",
        "legs": [
            {
                "distanceMeters": 2000,
                "duration": "1200s",
                "startLocation": {
                    "latLng": {"latitude": 40.748817, "longitude": -73.985428}
                },
                "endLocation": {
                    "latLng": {"latitude": 40.7580, "longitude": -73.995428}
                },
                "steps": [
                    {
                        "distanceMeters": 1000,
                        "staticDuration": "600s",
                        "polyline": {
                            "encodedPolyline": "cwuwF|gqbMkx@?"
                        },
                        "startLocation": {
                            "latLng": {"latitude": 40.748817, "longitude": -73.985428}
                        },
                        "endLocation": {
                            "latLng": {"latitude": 40.7580, "longitude": -73.985428}
                        },
                        "navigationInstruction": {
                            "maneuver": "DEPART",
                            "instructions": "Head North on Mock Ave"
                        },
                         "localizedValues": {
                            "distance": {"text": "1.0 km"},
                            "staticDuration": {"text": "10 mins"}
                        }
                    },
                    {
                        "distanceMeters": 1000,
                        "staticDuration": "600s",
                        "polyline": {
                            "encodedPolyline": "opwwF|gqbM?n}@"
                        },
                        "startLocation": {
                            "latLng": {"latitude": 40.7580, "longitude": -73.985428}
                        },
                        "endLocation": {
                            "latLng": {"latitude": 40.7580, "longitude": -73.995428}
                        },
                        "navigationInstruction": {
                            "maneuver": "TURN_LEFT",
                            "instructions": "Turn Left onto West St"
                        },
                        "localizedValues": {
                            "distance": {"text": "1.0 km"},
                            "staticDuration": {"text": "10 mins"}
                        }
                    }
                ]
            }
        ],
        "polyline": {
             "encodedPolyline": "cwuwF|gqbMkx@?n}@"
        },
        "summary": "Route 2 (North then West)"
    }
]

def mock_compute_routes_v2(self, origin, destination, intermediates=None, travel_mode="WALK"):
    print("Using MOCK Routes API v2 response.")
    return MOCK_ROUTES

def main():
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY")
    
    if not api_key:
        print("No GOOGLE_MAPS_API_KEY found. Using mock mode.")
        # Monkey patch compute_routes_v2
        SunRouter.compute_routes_v2 = mock_compute_routes_v2
        
        # Mock googlemaps.Client to avoid validation error
        class MockGmaps:
            def __init__(self, key=None, **kwargs):
                self.key = "mock_key"
        
        googlemaps.Client = MockGmaps
        api_key = "mock_key"
    
    router = SunRouter(api_key)
    
    # Manhattan example
    origin = "Empire State Building, New York, NY"
    destination = "Times Square, New York, NY"
    time = datetime.datetime(2023, 6, 21, 21, 0, 0, tzinfo=datetime.timezone.utc) # 5 PM NY time (Long shadows)
    
    print(f"Finding shadiest path from {origin} to {destination} at {time}...")
    
    try:
        results = router.find_shadiest_path(origin, destination, time)
        
        if not results:
            print("No results found.")
            return

        print("\nResults:")
        for idx, res in enumerate(results):
            print(f"Route {idx+1}: {res['summary']}")
            print(f"  Total Shadow Ratio: {res['shadow_ratio']:.2%}")
            print(f"  Total Shadow Length: {res['shadow_length_m']:.1f}m / {res['total_length_m']:.1f}m")
            print("  Steps Analysis:")
            for step in res['steps_analysis']:
                print(f"    - {step['instruction']} ({step['distance_text']}): {step['shadow_ratio']:.2%} shadow")
            print()
            
        best = results[0]
        print(f"\nBest Route: {best['summary']} with {best['shadow_ratio']:.2%} shadow coverage.")
        
    except Exception as e:
        print(f"Error during execution: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
