import os, sys, json
sys.path.append('backend')
os.environ['GEE_KEY_FILE'] = 'secrets/my-gee-key.json'
os.environ['GEE_PROJECT_ID'] = 'terrasynapse'
os.environ['GEE_SERVICE_ACCOUNT_EMAIL'] = 'ahsis-152@terrasynapse.iam.gserviceaccount.com'
from backend.gee_pipeline import extract_indices

polygon_wkt = 'POLYGON((-122.085 37.422, -122.085 37.423, -122.084 37.423, -122.084 37.422, -122.085 37.422))'
try:
    res = extract_indices(polygon_wkt)
    print(json.dumps(res, indent=2))
except Exception as e:
    import traceback
    traceback.print_exc()
