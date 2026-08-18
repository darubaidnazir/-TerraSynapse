from shapely.geometry import shape, Polygon, MultiPolygon
from shapely.validation import make_valid
from pyproj import Geod
import json

def process_geometry(geom_dict: dict):
    from shapely import force_2d
    geom = force_2d(shape(geom_dict))
    
    if not geom.is_valid:
        geom = make_valid(geom)
    
    # After make_valid, it might be a GeometryCollection. We need Polygon or MultiPolygon.
    if geom.geom_type not in ["Polygon", "MultiPolygon"]:
        # Try to extract polygons
        if hasattr(geom, "geoms"):
            polys = [g for g in geom.geoms if g.geom_type in ["Polygon", "MultiPolygon"]]
            if not polys:
                raise ValueError("No valid polygon could be extracted from the geometry.")
            # Simplification: just take the largest or wrap in MultiPolygon
            geom = MultiPolygon(polys) if len(polys) > 1 else polys[0]
        else:
            raise ValueError(f"Invalid geometry type after fix: {geom.geom_type}")
    
    # Calculate area using pyproj (WGS84)
    geod = Geod(ellps="WGS84")
    area_m2, _ = geod.geometry_area_perimeter(geom)
    area_ha = abs(area_m2) / 10000.0
    
    if area_ha < 0.01:
        raise ValueError("Field area is too small (< 100 m^2).")
    if area_ha > 5000:
        raise ValueError("Field area is too large (> 5000 ha).")
    
    centroid = geom.centroid
    
    # Convert back to WKT for insertion
    return {
        "wkt": geom.wkt,
        "area_ha": area_ha,
        "centroid": [centroid.x, centroid.y]
    }


