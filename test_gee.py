import os
import sys
sys.path.append('backend')
from gee_pipeline import extract_indices

polygon_wkt = "POLYGON((-122.085 37.422, -122.085 37.423, -122.084 37.423, -122.084 37.422, -122.085 37.422))"
try:
    res = extract_indices(polygon_wkt)
    import json
    print(json.dumps(res, indent=2))
except Exception as e:
    print("ERROR:", e)
