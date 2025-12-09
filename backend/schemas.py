from pydantic import BaseModel, Field
from typing import Optional, Dict, List, Any, Union
from datetime import datetime

class RouteRequest(BaseModel):
    # origin: str = Field(..., description="Origin address or location name")
    origin: Union[str, Dict[str, Any]] = Field(..., description="Origin address or location name")
    # destination: str = Field(..., description="Destination address or location name")
    destination: Union[str, Dict[str, Any]] = Field(..., description="Destination address or location name")
    travel_mode: str = Field("WALK", description="Travel mode (WALK, TRANSIT, DRIVE, TWO_WHEELER)")
    start_time: Optional[datetime] = Field(None, description="Start time for shadow calculation (ISO 8601)")
    prefer_shade: bool = Field(True, description="Whether to prioritize shady routes")
    routing_preference: Optional[str] = Field(None, description="Routing preference (e.g., TRAFFIC_AWARE, LESS_WALKING)")
    transit_preferences: Optional[Dict[str, Any]] = Field(None, description="Transit preferences dictionary")
