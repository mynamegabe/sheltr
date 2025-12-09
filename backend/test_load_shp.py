
import geopandas as gpd
from pathlib import Path
import os

try:
    path = Path("c:/Users/Gabriel/Desktop/Competitions/2025-hackrift/hackrift25/backend/data/CoveredLinkWay_Aug2025/CoveredLinkWay.shp")
    print(f"Checking path: {path}")
    if path.exists():
        print("File exists.")
        gdf = gpd.read_file(path)
        print(f"Loaded successfully. Rows: {len(gdf)}")
        print(f"CRS: {gdf.crs}")
    else:
        print("File not found.")
except Exception as e:
    print(f"Error: {e}")
