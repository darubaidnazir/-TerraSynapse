import ee
import os
from shapely.wkt import loads as load_wkt
import datetime

def init_gee():
    project_id = os.environ.get("GEE_PROJECT_ID")
    key_file = os.environ.get("GEE_KEY_FILE", "/secrets/gee-key.json")
    email = os.environ.get("GEE_SERVICE_ACCOUNT_EMAIL")
    
    if project_id == "your-project-id" or not os.path.exists(key_file):
        raise ValueError("GEE credentials not configured in .env or missing gee-key.json")
        
    credentials = ee.ServiceAccountCredentials(email=email, key_file=key_file)
    ee.Initialize(credentials, project=project_id)

def add_indices(image):
    ndvi = image.normalizedDifference(['B8', 'B4']).rename('ndvi')
    savi = image.expression(
        '((B8 - B4) / (B8 + B4 + 0.5)) * (1.5)', {
            'B8': image.select('B8'),
            'B4': image.select('B4')
        }).rename('savi')
    evi = image.expression(
        '2.5 * ((B8 - B4) / (B8 + 6 * B4 - 7.5 * B2 + 1))', {
            'B8': image.select('B8'),
            'B4': image.select('B4'),
            'B2': image.select('B2')
        }).rename('evi')
    ndmi = image.normalizedDifference(['B8', 'B11']).rename('ndmi')
    ndwi = image.normalizedDifference(['B3', 'B8']).rename('ndwi')
    return image.addBands([ndvi, savi, evi, ndmi, ndwi])

def extract_indices(wkt_geometry: str):
    init_gee()

    
    if "SRID=" in wkt_geometry:
        wkt_geometry = wkt_geometry.split(";")[-1]
        
    geom = load_wkt(wkt_geometry)
    coords = list(geom.exterior.coords)
    ee_geom = ee.Geometry.Polygon([coords])
    
    end_date = ee.Date(datetime.datetime.now())
    start_date = end_date.advance(-90, "day")
    
    col = (ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(ee_geom)
          .filterDate(start_date, end_date)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)))
    
    if col.size().getInfo() == 0:
        raise ValueError("No low-cloud Sentinel-2 imagery found for this period.")
        
    image = col.sort('system:time_start', False).first()
    image = add_indices(image)
    
    lst_col = (ee.ImageCollection('MODIS/061/MOD11A1')
              .filterBounds(ee_geom)
              .filterDate(start_date, end_date)
              .select('LST_Day_1km'))
    lst_img = lst_col.mean()
    lst_celsius = lst_img.multiply(0.02).subtract(273.15).rename('lst')
    
    dem = ee.Image('USGS/SRTMGL1_003').clip(ee_geom)
    elevation = dem.rename('elevation')
    slope = ee.Terrain.slope(dem).rename('slope')
    
    soil = ee.Image("projects/soilgrids-isric/soc_mean").select(0).rename('organic_carbon')
    ph = ee.Image("projects/soilgrids-isric/phh2o_mean").select(0).rename('ph')
    cec = ee.Image("projects/soilgrids-isric/cec_mean").select(0).rename('cec')
    nitrogen = ee.Image("projects/soilgrids-isric/nitrogen_mean").select(0).rename('n_proxy')
    
    combined = image.addBands([lst_celsius, elevation, slope, soil, ph, cec, nitrogen])
    
    reducer = ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True)
    stats = combined.reduceRegion(
        reducer=reducer,
        geometry=ee_geom,
        scale=10,
        maxPixels=1e9,
        bestEffort=True
    ).getInfo()
    
    cloud_cover = image.get('CLOUDY_PIXEL_PERCENTAGE').getInfo()
    acq_date = ee.Date(image.get('system:time_start')).format('YYYY-MM-dd').getInfo()
    
    return {
        "acquisition_date": acq_date,
        "cloud_cover_pct": cloud_cover,
        "indices": {
            "ndvi": {"mean": stats.get('ndvi_mean'), "min": stats.get('ndvi_min'), "max": stats.get('ndvi_max'), "unit": "index", "source": "Sentinel-2 (10m)", "confidence": "High"},
            "savi": {"mean": stats.get('savi_mean'), "min": stats.get('savi_min'), "max": stats.get('savi_max'), "unit": "index", "source": "Sentinel-2 (10m)", "confidence": "High"},
            "evi":  {"mean": stats.get('evi_mean'), "min": stats.get('evi_min'), "max": stats.get('evi_max'), "unit": "index", "source": "Sentinel-2 (10m)", "confidence": "High"},
            "ndmi": {"mean": stats.get('ndmi_mean'), "min": stats.get('ndmi_min'), "max": stats.get('ndmi_max'), "unit": "index", "source": "Sentinel-2 (10m)", "confidence": "High"},
            "ndwi": {"mean": stats.get('ndwi_mean'), "min": stats.get('ndwi_min'), "max": stats.get('ndwi_max'), "unit": "index", "source": "Sentinel-2 (10m)", "confidence": "High"},
            "lst":  {"mean": stats.get('lst_mean'), "unit": "celsius", "source": "MODIS (1km)", "confidence": "Moderate"},
            "elevation": {"mean": stats.get('elevation_mean'), "unit": "m", "source": "SRTM (30m)", "confidence": "High"},
            "slope": {"mean": stats.get('slope_mean'), "unit": "degrees", "source": "SRTM (30m)", "confidence": "High"},
            "organic_carbon": {"mean": stats.get('organic_carbon_mean'), "unit": "dg/kg", "source": "SoilGrids (250m)", "confidence": "Estimated"},
            "ph": {"mean": stats.get('ph_mean'), "unit": "ph*10", "source": "SoilGrids (250m)", "confidence": "Estimated"},
            "cec": {"mean": stats.get('cec_mean'), "unit": "mmol(c)/kg", "source": "SoilGrids (250m)", "confidence": "Estimated"},
            "n_proxy": {"mean": stats.get('n_proxy_mean'), "unit": "cg/kg", "source": "SoilGrids (250m)", "confidence": "Estimated"}
        }
    }
