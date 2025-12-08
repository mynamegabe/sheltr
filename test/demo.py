import os
import sys
import datetime
from sun_router import SunRouter
from dotenv import load_dotenv

load_dotenv()

def main():
    api_key = os.environ.get("GOOGLE_MAPS_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    
    if not api_key:
        print("No GOOGLE_MAPS_API_KEY found.")
        return

    router = SunRouter(api_key)
    
    # Singapore example (matches cached data)
    origin = "Singapore Management University, Singapore"
    destination = "National Museum of Singapore, Singapore"
    
    # Time: 4pm Singapore time (UTC+8) -> 8am UTC
    # Using fixed daytime to ensure shadows are generated
    time = datetime.datetime.now(datetime.timezone.utc).replace(hour=8, minute=0, second=0, microsecond=0)
    
    print(f"Finding shadiest path from {origin} to {destination}...")
    
    try:
        results = router.find_shadiest_path(origin, destination, time)
        
        if not results:
            print("No results found.")
            return

        print(f"\nFound {len(results)} routes.")
        print("-" * 40)
        
        for idx, res in enumerate(results):
            print(f"Route {idx+1}")
            print(f"  Summary: {res.get('summary', 'N/A')}")
            print(f"  Distance: {res.get('distance')}")
            print(f"  Duration: {res.get('duration')}")
            print(f"  Shadow Score: {res.get('shadow_score', 0)}") # sun_router might use shadow_score or shadow_ratio
            print(f"  Shadow Ratio: {res.get('shadow_ratio', 0):.2%}")
            print(f"  Shadow Length: {res.get('shadow_length_m', 0):.1f}m / {res.get('total_length_m', 0):.1f}m")
            print("-" * 40)
            
        if results:
            best = results[0]
            print(f"\nBest Route: Route 1 with {best.get('shadow_ratio', 0):.2%} shadow coverage.")
        
    except Exception as e:
        print(f"Error during execution: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()
