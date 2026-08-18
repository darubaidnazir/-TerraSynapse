import ee
import os

key_file = r"C:\TerraSynapse\secrets\tribal-flux-505906-u2-7872cbe52eea.json"
credentials = ee.ServiceAccountCredentials("darubaidnazir@tribal-flux-505906-u2.iam.gserviceaccount.com", key_file)
ee.Initialize(credentials, project="tribal-flux-505906-u2")

ee_geom = ee.Geometry.Point([-122.082, 37.422]).buffer(50)

soil = ee.Image("projects/soilgrids-isric/soc_mean").select(0).rename('organic_carbon')

stats = soil.reduceRegion(
    reducer=ee.Reducer.mean(),
    geometry=ee_geom,
    scale=10
).getInfo()

print("Stats:", stats)
