import requests
import json
import os
from datetime import datetime

# Configuration
API_URL = "http://localhost:8000/routes"
RESULTS_DIR = "results"

# Ensure results directory exists
if not os.path.exists(RESULTS_DIR):
    os.makedirs(RESULTS_DIR)

# Payload from user request (or adapted)
payload = {
  "origin": "Singapore Management University, Singapore",
  "destination": "National Museum of Singapore, Singapore",
  "travel_mode": "WALK",
  "start_time": "2025-12-08T08:00:00.000Z", # UTC -> SGT = 16:00
  "prefer_shade": True
}

def run_test():
    print(f"Sending request to {API_URL}...")
    try:
        response = requests.post(API_URL, json=payload)
        response.raise_for_status()
        
        data = response.json()
        print(f"Received response with {len(data)} routes.")
        
        # Save results
        timestamp_str = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{RESULTS_DIR}/routes_{timestamp_str}.json"
        
        with open(filename, 'w') as f:
            json.dump(data, f, indent=2)
            
        print(f"Results saved to {filename}")
        print("-" * 40)

        # Analyze and print details
        best_route = None
        best_ratio = -1.0

        for idx, route in enumerate(data):
            ratio = route.get('shadow_ratio', 0)
            print(f"\nRoute {idx + 1}: {route.get('summary', 'No Summary')}")
            print(f"  Total Distance: {route.get('distance', 'N/A')}")
            print(f"  Total Duration: {route.get('duration', 'N/A')}")
            print(f"  Overall Shadow Ratio: {ratio:.2%}")
            
            print("  Steps:")
            steps = route.get('steps_analysis', [])
            for step in steps:
                instr = step.get('instruction', 'Unknown')
                dist = step.get('distance_text', '')
                step_ratio = step.get('shadow_ratio', 0)
                print(f"    - {instr} ({dist}): {step_ratio:.2%} shaded")
            
            if ratio > best_ratio:
                best_ratio = ratio
                best_route = idx + 1
        
        print("-" * 40)
        if best_route:
             print(f"Best Shaded Route: Route {best_route} with {best_ratio:.2%} coverage.")
        else:
             print("No valid routes found.")

    except requests.exceptions.RequestException as e:
        print(f"Error making request: {e}")
        if hasattr(e, 'response') and e.response is not None:
             print(f"Response content: {e.response.text}")

if __name__ == "__main__":
    run_test()
