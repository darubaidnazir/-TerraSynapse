from llm_recommender import generate_recommendations
import os
from celery import Celery
from database import SessionLocal
import models
from gee_pipeline import extract_indices
from geoalchemy2.shape import to_shape
from scoring import compute_health_score

REDIS_URL = os.environ.get("REDIS_URL", "redis://localhost:6379/0")

celery_app = Celery("tasks", broker=REDIS_URL, backend=REDIS_URL)

@celery_app.task(bind=True)
def run_gee_analysis(self, field_id: str):
    db = SessionLocal()
    run = None
    try:
        run = db.query(models.AnalysisRun).filter(models.AnalysisRun.job_id == self.request.id).first()
            
        field = db.query(models.Field).filter(models.Field.id == field_id).first()
        if not field:
            raise ValueError(f"Field {field_id} not found.")
            
        geom_shape = to_shape(field.geometry)
        wkt_geom = geom_shape.wkt
        
        soil_overrides = {
            "override_ph": field.override_ph,
            "override_organic_carbon": field.override_organic_carbon,
            "override_cec": field.override_cec,
            "override_n_proxy": field.override_n_proxy
        }
        
        results = extract_indices(wkt_geom, soil_overrides)
        
        crop_type = field.crop_type or "default"
        planting_date = field.planting_date
        
        health_score_pct, breakdown, updated_indices = compute_health_score(results.get("indices", {}), crop_type, planting_date)
        
        recs = generate_recommendations(updated_indices, crop_type, health_score_pct)
        
        if run:
            run.acquisition_date = results.get("acquisition_date")
            run.cloud_cover_pct = results.get("cloud_cover_pct")
            run.indices = updated_indices
            run.health_score_pct = health_score_pct
            run.recommendations = recs
            run.status = "done"
            db.commit()
            
        return results
    except Exception as e:
        if run:
            run.status = "failed"
            db.commit()
        raise e
    finally:
        db.close()


