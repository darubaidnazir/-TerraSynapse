from pydantic import BaseModel
from typing import Optional, Any

class FieldCreate(BaseModel):
    name: Optional[str] = None
    owner_id: Optional[str] = None
    geometry: Any  # Expected to be a GeoJSON Polygon dictionary
    crop_type: Optional[str] = "default"

class FieldResponse(BaseModel):
    field_id: str
    area_ha: float
    centroid: list[float]

