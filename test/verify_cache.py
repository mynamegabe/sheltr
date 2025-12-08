
import os
import time
import sys
from dotenv import load_dotenv
from sun_router import SunRouter

# Load environment variables from .env file
load_dotenv()

api_key = os.getenv("GOOGLE_MAPS_API_KEY")
if not api_key:
    api_key = os.getenv("GOOGLE_API_KEY") 

if not api_key:
    print("Error: GOOGLE_MAPS_API_KEY not found in environment.")
    print("Available keys:", [k for k in os.environ.keys() if "KEY" in k])
    sys.exit(1)

def run_verification():
    print("Initializing SunRouter...")
    router = SunRouter(api_key=api_key)
    
    origin = "Singapore Management University, Singapore"
    destination = "National Museum of Singapore, Singapore"
    
    print(f"\n--- Run 1: Fetching route from {origin} to {destination} ---")
    start_time = time.time()
    result1 = router.find_shadiest_path(origin, destination)
    duration1 = time.time() - start_time
    print(f"Run 1 completed in {duration1:.4f} seconds.")
    
    if not result1:
        print("Error: No result returned from Run 1.")
        return

    print(f"\n--- Run 2: Fetching same route (should be cached) ---")
    start_time = time.time()
    result2 = router.find_shadiest_path(origin, destination)
    duration2 = time.time() - start_time
    print(f"Run 2 completed in {duration2:.4f} seconds.")
    
    if not result2:
        print("Error: No result returned from Run 2.")
        return

    # Basic content check
    if len(result1) != len(result2):
        print("Warning: Results length mismatch!")
    
    print("\nVerification Summary:")
    print(f"Run 1 Duration: {duration1:.4f}s")
    print(f"Run 2 Duration: {duration2:.4f}s")
    
    if duration2 < duration1:
         print("SUCCESS: Run 2 was faster, indicating caching likely worked.")
    else:
         print("WARNING: Run 2 was not faster. Check console logs for 'Loading route from cache'.")

if __name__ == "__main__":
    run_verification()
