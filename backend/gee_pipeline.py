import ee
import os
import httpx
from shapely.wkt import loads as load_wkt
import datetime

_IS_INITIALIZED = False

def init_gee():
    global _IS_INITIALIZED
    if _IS_INITIALIZED:
        return
        
    project_id = os.environ.get("GEE_PROJECT_ID")
    key_file = os.environ.get("GEE_KEY_FILE", "/secrets/gee-key.json")
    email = os.environ.get("GEE_SERVICE_ACCOUNT_EMAIL")
    
    if project_id == "your-project-id" or not os.path.exists(key_file):
        raise ValueError("GEE credentials not configured in .env or missing gee-key.json")
        
    credentials = ee.ServiceAccountCredentials(email=email, key_file=key_file)
    ee.Initialize(credentials, project=project_id)
    _IS_INITIALIZED = True

def add_indices(image):
    scaled = image.select(['B2', 'B3', 'B4', 'B8', 'B11']).divide(10000)
    
    ndvi = scaled.normalizedDifference(['B8', 'B4']).rename('ndvi')
    savi = scaled.expression(
        '((B8 - B4) / (B8 + B4 + 0.5)) * (1.5)', {
            'B8': scaled.select('B8'),
            'B4': scaled.select('B4')
        }).rename('savi')
    evi = scaled.expression(
        '2.5 * ((B8 - B4) / (B8 + 6 * B4 - 7.5 * B2 + 1))', {
            'B8': scaled.select('B8'),
            'B4': scaled.select('B4'),
            'B2': scaled.select('B2')
        }).rename('evi')
    ndmi = scaled.normalizedDifference(['B8', 'B11']).rename('ndmi')
    ndwi = scaled.normalizedDifference(['B3', 'B8']).rename('ndwi')
    return image.addBands([ndvi, savi, evi, ndmi, ndwi])

def extract_indices(wkt_geometry: str, soil_overrides: dict = None, planting_date: datetime.datetime = None):
    init_gee()

    if soil_overrides is None:
        soil_overrides = {}
    
    if "SRID=" in wkt_geometry:
        wkt_geometry = wkt_geometry.split(";")[-1]
        
    geom = load_wkt(wkt_geometry)
    coords = list(geom.exterior.coords)
    ee_geom = ee.Geometry.Polygon([coords])
    
    now = datetime.datetime.now()
    end_date = ee.Date(now)
    
    # Base start date is 15 days ago
    start_dt = now - datetime.timedelta(days=15)
    
    # Constrain start_dt by planting_date if provided
    if planting_date:
        if planting_date.tzinfo is not None:
            planting_date = planting_date.replace(tzinfo=None)
        if start_dt < planting_date:
            start_dt = planting_date
            
    start_date = ee.Date(start_dt)
    
    s2_sr_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(ee_geom).filterDate(start_date, end_date)
    s2_cloudless_col = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY').filterBounds(ee_geom).filterDate(start_date, end_date)

    inner_join = ee.Join.inner()
    join_filter = ee.Filter.equals(leftField='system:index', rightField='system:index')
    joined_col = inner_join.apply(s2_sr_col, s2_cloudless_col, join_filter)

    def mask_clouds(image):
        img = ee.Image(image.get('primary'))
        cld = ee.Image(image.get('secondary'))
        is_clear = cld.select('probability').lt(50)
        return img.updateMask(is_clear)
        
    masked_col = ee.ImageCollection(joined_col.map(mask_clouds))
    
    if masked_col.size().getInfo() == 0:
        # Fallback window: 90 days ago, bounded by planting_date
        fallback_start_dt = now - datetime.timedelta(days=90)
        if planting_date and fallback_start_dt < planting_date:
            fallback_start_dt = planting_date
            
        start_date = ee.Date(fallback_start_dt)
        s2_sr_col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED').filterBounds(ee_geom).filterDate(start_date, end_date)
        s2_cloudless_col = ee.ImageCollection('COPERNICUS/S2_CLOUD_PROBABILITY').filterBounds(ee_geom).filterDate(start_date, end_date)
        joined_col = inner_join.apply(s2_sr_col, s2_cloudless_col, join_filter)
        masked_col = ee.ImageCollection(joined_col.map(mask_clouds))
        
        if masked_col.size().getInfo() == 0:
            raise ValueError("No low-cloud Sentinel-2 imagery found for this period.")

    image = masked_col.median()
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
    aspect = ee.Terrain.aspect(dem).rename('aspect')
    
    soil = ee.Image("projects/soilgrids-isric/soc_mean").select(0).rename('organic_carbon')
    ph = ee.Image("projects/soilgrids-isric/phh2o_mean").select(0).rename('ph')
    cec = ee.Image("projects/soilgrids-isric/cec_mean").select(0).rename('cec')
    nitrogen = ee.Image("projects/soilgrids-isric/nitrogen_mean").select(0).rename('n_proxy')
    sand = ee.Image("projects/soilgrids-isric/sand_mean").select(0).rename('sand')
    silt = ee.Image("projects/soilgrids-isric/silt_mean").select(0).rename('silt')
    clay = ee.Image("projects/soilgrids-isric/clay_mean").select(0).rename('clay')

    # Sentinel-1 SAR
    s1_col = (ee.ImageCollection('COPERNICUS/S1_GRD')
             .filterBounds(ee_geom)
             .filterDate(start_date, end_date)
             .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VV'))
             .filter(ee.Filter.listContains('transmitterReceiverPolarisation', 'VH'))
             .filter(ee.Filter.eq('instrumentMode', 'IW')))
    s1_img = ee.Algorithms.If(s1_col.size().gt(0), 
                              s1_col.median().select(['VV', 'VH']).rename(['sar_vv', 'sar_vh']), 
                              ee.Image.constant([0, 0]).rename(['sar_vv', 'sar_vh']).updateMask(ee.Image.constant(0)))
    s1_img = ee.Image(s1_img)

    # GPM IMERG Rainfall
    gpm_col = (ee.ImageCollection('NASA/GPM_L3/IMERG_V06')
              .filterBounds(ee_geom)
              .filterDate(start_date, end_date)
              .select('precipitationCal'))
    gpm_img = ee.Algorithms.If(gpm_col.size().gt(0),
                               gpm_col.sum().rename('rainfall_sum'),
                               ee.Image.constant(0).rename('rainfall_sum').updateMask(ee.Image.constant(0)))
    gpm_img = ee.Image(gpm_img)

    # SMAP Soil Moisture
    smap_col = (ee.ImageCollection('NASA_USDA/HSL/SMAP10KM_soil_moisture')
               .filterBounds(ee_geom)
               .filterDate(start_date, end_date)
               .select('ssm'))
    smap_img = ee.Algorithms.If(smap_col.size().gt(0),
                                smap_col.mean().rename('soil_moisture'),
                                ee.Image.constant(0).rename('soil_moisture').updateMask(ee.Image.constant(0)))
    smap_img = ee.Image(smap_img)

    # ERA5-Land Historical Climate
    era5_col = (ee.ImageCollection('ECMWF/ERA5_LAND/HOURLY')
               .filterBounds(ee_geom)
               .filterDate(start_date, end_date)
               .select(['temperature_2m', 'total_precipitation']))
    era5_img_raw = ee.Algorithms.If(era5_col.size().gt(0),
                                    era5_col.mean(),
                                    ee.Image.constant([0, 0]).rename(['temperature_2m', 'total_precipitation']).updateMask(ee.Image.constant(0)))
    era5_img_raw = ee.Image(era5_img_raw)
    era5_temp = era5_img_raw.select('temperature_2m').subtract(273.15).rename('era5_temp_c')
    era5_precip = era5_img_raw.select('total_precipitation').rename('era5_precip_m')

    combined = image.addBands([
        lst_celsius, elevation, slope, aspect, 
        soil, ph, cec, nitrogen, sand, silt, clay, 
        s1_img, gpm_img, smap_img, era5_temp, era5_precip
    ])
    
    reducer = ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True)
    stats = combined.reduceRegion(
        reducer=reducer,
        geometry=ee_geom,
        scale=10,
        maxPixels=1e9,
        bestEffort=True
    ).getInfo()
    
    cloud_cover = 0.0 # Handled by pixel masking
    acq_date = end_date.format('YYYY-MM-dd').getInfo()

    # Process SoilGrids values to standard units
    raw_ph = stats.get('ph_mean')
    raw_oc = stats.get('organic_carbon_mean')
    raw_cec = stats.get('cec_mean')
    raw_n = stats.get('n_proxy_mean')
    raw_sand = stats.get('sand_mean')
    raw_silt = stats.get('silt_mean')
    raw_clay = stats.get('clay_mean')
    
    std_ph = (raw_ph / 10.0) if raw_ph is not None else None
    std_oc = (raw_oc / 100.0) if raw_oc is not None else None # dg/kg to %
    std_cec = (raw_cec / 10.0) if raw_cec is not None else None # mmol(c)/kg to cmol(c)/kg
    std_n = (raw_n / 100.0) if raw_n is not None else None # cg/kg to g/kg
    
    # SoilGrids texture values are returned in g/kg or cg/kg depending on version, 
    # but the v2 mapping states division by 10 for g/kg to %.
    std_sand = (raw_sand / 10.0) if raw_sand is not None else None
    std_silt = (raw_silt / 10.0) if raw_silt is not None else None
    std_clay = (raw_clay / 10.0) if raw_clay is not None else None

    # Fetch Open-Meteo Weather (Live/Forecast)
    centroid = geom.centroid
    lat, lon = centroid.y, centroid.x
    weather_data = {}
    try:
        om_url = f"https://api.open-meteo.com/v1/forecast?latitude={lat}&longitude={lon}&current=temperature_2m,relative_humidity_2m,precipitation,wind_speed_10m"
        with httpx.Client(timeout=5.0) as client:
            om_res = client.get(om_url)
            if om_res.status_code == 200:
                weather_data["open_meteo_current"] = om_res.json().get("current", {})
    except Exception as e:
        print(f"Open-Meteo API Error: {e}")

    # Fetch NASA POWER Weather (Historical/Daily)
    nasa_power_data = {}
    try:
        start_date_str = start_dt.strftime('%Y%m%d')
        end_date_str = now.strftime('%Y%m%d')
        power_url = f"https://power.larc.nasa.gov/api/temporal/daily/point?parameters=T2M,PRECTOTCORR,RH2M,WS10M,ALLSKY_SFC_SW_DWN&community=AG&longitude={lon}&latitude={lat}&start={start_date_str}&end={end_date_str}&format=JSON"
        with httpx.Client(timeout=10.0) as client:
            power_res = client.get(power_url)
            if power_res.status_code == 200:
                nasa_power_data = power_res.json().get("properties", {}).get("parameter", {})
                weather_data["nasa_power_daily"] = nasa_power_data
    except Exception as e:
        print(f"NASA POWER API Error: {e}")

    # Apply overrides
    ph_mean = soil_overrides.get('override_ph') if soil_overrides.get('override_ph') is not None else std_ph
    ph_source = "Ground-Truth" if soil_overrides.get('override_ph') is not None else "SoilGrids (250m)"
    ph_conf = "High" if soil_overrides.get('override_ph') is not None else "Estimated"

    oc_mean = soil_overrides.get('override_organic_carbon') if soil_overrides.get('override_organic_carbon') is not None else std_oc
    oc_source = "Ground-Truth" if soil_overrides.get('override_organic_carbon') is not None else "SoilGrids (250m)"
    oc_conf = "High" if soil_overrides.get('override_organic_carbon') is not None else "Estimated"

    cec_mean = soil_overrides.get('override_cec') if soil_overrides.get('override_cec') is not None else std_cec
    cec_source = "Ground-Truth" if soil_overrides.get('override_cec') is not None else "SoilGrids (250m)"
    cec_conf = "High" if soil_overrides.get('override_cec') is not None else "Estimated"

    n_mean = soil_overrides.get('override_n_proxy') if soil_overrides.get('override_n_proxy') is not None else std_n
    n_source = "Ground-Truth" if soil_overrides.get('override_n_proxy') is not None else "SoilGrids (250m)"
    n_conf = "High" if soil_overrides.get('override_n_proxy') is not None else "Estimated"

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
            "aspect": {"mean": stats.get('aspect_mean'), "unit": "degrees", "source": "SRTM (30m)", "confidence": "High"},
            "organic_carbon": {"mean": oc_mean, "unit": "%", "source": oc_source, "confidence": oc_conf},
            "ph": {"mean": ph_mean, "unit": "pH", "source": ph_source, "confidence": ph_conf},
            "cec": {"mean": cec_mean, "unit": "cmol(c)/kg", "source": cec_source, "confidence": cec_conf},
            "n_proxy": {"mean": n_mean, "unit": "g/kg", "source": n_source, "confidence": n_conf},
            "sand": {"mean": std_sand, "unit": "%", "source": "SoilGrids (250m)", "confidence": "Estimated"},
            "silt": {"mean": std_silt, "unit": "%", "source": "SoilGrids (250m)", "confidence": "Estimated"},
            "clay": {"mean": std_clay, "unit": "%", "source": "SoilGrids (250m)", "confidence": "Estimated"},
            "sar_vv": {"mean": stats.get('sar_vv_mean'), "unit": "dB", "source": "Sentinel-1 (10m)", "confidence": "High"},
            "sar_vh": {"mean": stats.get('sar_vh_mean'), "unit": "dB", "source": "Sentinel-1 (10m)", "confidence": "High"},
            "rainfall_sum": {"mean": stats.get('rainfall_sum_mean'), "unit": "mm", "source": "GPM IMERG (10km)", "confidence": "Moderate"},
            "soil_moisture": {"mean": stats.get('soil_moisture_mean'), "unit": "mm", "source": "SMAP (10km)", "confidence": "Moderate"},
            "era5_temp": {"mean": stats.get('era5_temp_c_mean'), "unit": "celsius", "source": "ERA5-Land", "confidence": "Moderate"},
            "era5_precip": {"mean": stats.get('era5_precip_m_mean'), "unit": "m", "source": "ERA5-Land", "confidence": "Moderate"}
        },
        "current_weather": weather_data
    }
