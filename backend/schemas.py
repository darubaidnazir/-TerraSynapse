from pydantic import BaseModel
from typing import Optional, Any

class FieldCreate(BaseModel):
    name: Optional[str] = None
    owner_id: Optional[str] = None
    geometry: Any  # Expected to be a GeoJSON Polygon dictionary
    crop_type: Optional[str] = "default"
    planting_date: Optional[str] = None
    override_ph: Optional[float] = None
    override_organic_carbon: Optional[float] = None
    override_cec: Optional[float] = None
    override_n_proxy: Optional[float] = None

class FieldResponse(BaseModel):
    field_id: str
    area_ha: float
    centroid: list[float]

