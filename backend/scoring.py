from database import SessionLocal
import models

def classify(index_name: str, value: float, crop_type: str = "default"):
    db = SessionLocal()
    try:
        threshold = db.query(models.IndexThreshold).filter_by(crop_type=crop_type, index_name=index_name).first()
        if not threshold:
            threshold = db.query(models.IndexThreshold).filter_by(crop_type="default", index_name=index_name).first()
            
        if not threshold:
            return "moderate", 0.5, True
            
        is_default = (threshold.crop_type == "default")
        
        if value <= threshold.poor_max:
            return "poor", 0.0, is_default
        elif value <= threshold.moderate_max:
            return "moderate", 0.5, is_default
        else:
            return "healthy", 1.0, is_default
    finally:
        db.close()

def compute_health_score(indices: dict, crop_type: str = "default"):
    db = SessionLocal()
    try:
        score_sum = 0
        weight_sum = 0
        breakdown = []
        
        for index_name, data in indices.items():
            if index_name in ["ndvi", "savi", "evi", "ndmi", "ndwi"]:
                val = data.get("mean")
                if val is not None:
                    label, norm_score, is_default = classify(index_name, val, crop_type)
                    
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
        return health_score_pct, breakdown, indices
    finally:
        db.close()
