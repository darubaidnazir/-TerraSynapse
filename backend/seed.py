from database import SessionLocal
import models

def seed():
    db = SessionLocal()
    defaults = [
        {"crop_type": "default", "index_name": "ndvi", "poor_max": 0.2, "moderate_max": 0.5, "weight": 0.4},
        {"crop_type": "default", "index_name": "savi", "poor_max": 0.2, "moderate_max": 0.4, "weight": 0.2},
        {"crop_type": "default", "index_name": "evi", "poor_max": 0.2, "moderate_max": 0.4, "weight": 0.2},
        {"crop_type": "default", "index_name": "ndmi", "poor_max": 0.1, "moderate_max": 0.3, "weight": 0.1},
        {"crop_type": "default", "index_name": "ndwi", "poor_max": 0.1, "moderate_max": 0.3, "weight": 0.1},
    ]
    
    for d in defaults:
        exists = db.query(models.IndexThreshold).filter_by(crop_type=d["crop_type"], index_name=d["index_name"]).first()
        if not exists:
            threshold = models.IndexThreshold(**d)
            db.add(threshold)
    
    db.commit()
    db.close()
    print("Seeded successfully.")

if __name__ == '__main__':
    seed()
