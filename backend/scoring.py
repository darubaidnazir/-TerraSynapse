from sqlalchemy.orm import Session
import models
from datetime import datetime
from pytz import utc

def get_phenology_multiplier(planting_date):
    if not planting_date:
        return 1.0
    
    # Ensure planting_date is timezone-aware
    if planting_date.tzinfo is None:
        planting_date = planting_date.replace(tzinfo=utc)
        
    now = datetime.now(utc)
    days_since_planting = (now - planting_date).days
    
    if days_since_planting < 30:
        return 0.5  # Early germination: expected NDVI is very low
    elif days_since_planting < 60:
        return 0.8  # Vegetative stage
    elif days_since_planting > 120:
        return 0.7  # Senescence (drying out for harvest)
    return 1.0  # Peak maturity

def classify(db: Session, index_name: str, value: float, crop_type: str, phenology_multiplier: float):
    threshold = db.query(models.IndexThreshold).filter_by(crop_type=crop_type, index_name=index_name).first()
    if not threshold:
        threshold = db.query(models.IndexThreshold).filter_by(crop_type="default", index_name=index_name).first()
        
    if not threshold:
        return "moderate", 0.5, True
        
    is_default = (threshold.crop_type == "default")
    
    poor_max = threshold.poor_max * phenology_multiplier
    moderate_max = threshold.moderate_max * phenology_multiplier
    
    if value <= poor_max:
        return "poor", 0.0, is_default
    elif value <= moderate_max:
        return "moderate", 0.5, is_default
    else:
        return "healthy", 1.0, is_default

def compute_health_score(db: Session, indices: dict, crop_type: str = "default", planting_date: datetime = None):
    score_sum = 0
    weight_sum = 0
    breakdown = []
    
    phenology_multiplier = get_phenology_multiplier(planting_date)
    
    for index_name, data in indices.items():
        if index_name in ["ndvi", "savi", "evi", "ndmi", "ndwi"]:
            val = data.get("mean")
            if val is not None:
                label, norm_score, is_default = classify(db, index_name, val, crop_type, phenology_multiplier)
                
                threshold = db.query(models.IndexThreshold).filter_by(crop_type=crop_type, index_name=index_name).first()
                if not threshold:
                    threshold = db.query(models.IndexThreshold).filter_by(crop_type="default", index_name=index_name).first()
                    
                weight = threshold.weight if threshold else 1.0
                
                score_sum += norm_score * weight
                weight_sum += weight
                
                data["label"] = label
                if is_default:
                    data["needs_calibration"] = True
                    
                breakdown.append({
                    "index": index_name,
                    "label": label,
                    "weight": weight
                })
    
    health_score_pct = (score_sum / weight_sum * 100) if weight_sum > 0 else None
    
    # Multi-sensor penalty: If LST (temperature) > 35 Celsius, impose a heat stress penalty of -15%
    lst_val = indices.get("lst", {}).get("mean")
    if lst_val and lst_val > 35 and health_score_pct is not None:
        health_score_pct = max(0, health_score_pct - 15)
        
    return health_score_pct, breakdown, indices
