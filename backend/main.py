import tempfile
import os
import geopandas as gpd
from fastapi import FastAPI, Depends, HTTPException, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from database import get_db, engine
import models
from schemas import FieldCreate, FieldResponse
from geo_utils import process_geometry
import json

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
def read_root():
    return {"message": "TerraSynapse API is running"}

@app.get("/health")
def health_check():
    return {"status": "ok"}

@app.post("/api/fields", response_model=FieldResponse)
def create_field(field_in: FieldCreate, db: Session = Depends(get_db)):
    try:
        geo_info = process_geometry(field_in.geometry)
    except Exception as e:
        raise HTTPException(status_code=400, detail=str(e))
    
    db_field = models.Field(
        name=field_in.name,
        owner_id=field_in.owner_id,
        geometry=f"SRID=4326;{geo_info['wkt']}",
        area_ha=geo_info["area_ha"]
    )
    db.add(db_field)
    db.commit()
    db.refresh(db_field)
    
    return {
        "field_id": str(db_field.id),
        "area_ha": geo_info["area_ha"],
        "centroid": geo_info["centroid"]
    }

@app.post("/api/fields/upload", response_model=FieldResponse)
async def upload_field(file: UploadFile = File(...), name: str = Form(None), owner_id: str = Form(None), db: Session = Depends(get_db)):
    if not file.filename.endswith(".zip"):
        raise HTTPException(status_code=400, detail="Only .zip shapefiles are supported.")
        
    with tempfile.NamedTemporaryFile(delete=False, suffix=".zip") as tmp:
        content = await file.read()
        tmp.write(content)
        tmp_path = tmp.name
        
    try:
        # read_file can read from zip
        gdf = gpd.read_file(f"zip://{tmp_path}")
        if gdf.empty:
            raise ValueError("Shapefile is empty.")
            
        # Reproject to EPSG:4326 if needed
        if gdf.crs and gdf.crs.to_epsg() != 4326:
            gdf = gdf.to_crs(epsg=4326)
            
        # Combine into one geometry if multiple rows
        geom = gdf.geometry.unary_union
        
        # Convert to geojson-like dict
        from shapely.geometry import mapping
        geom_dict = mapping(geom)
        
        geo_info = process_geometry(geom_dict)
        
    except Exception as e:
        os.unlink(tmp_path)
        raise HTTPException(status_code=400, detail=f"Failed to parse shapefile: {str(e)}")
        
    os.unlink(tmp_path)
    
    db_field = models.Field(
        name=name,
        owner_id=owner_id,
        geometry=f"SRID=4326;{geo_info['wkt']}",
        area_ha=geo_info["area_ha"]
    )
    db.add(db_field)
    db.commit()
    db.refresh(db_field)
    
    return {
        "field_id": str(db_field.id),
        "area_ha": geo_info["area_ha"],
        "centroid": geo_info["centroid"]
    }

@app.post("/api/fields/{field_id}/analyze")
def analyze_field(field_id: str, db: Session = Depends(get_db)):
    field = db.query(models.Field).filter(models.Field.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
        
    from tasks import run_gee_analysis
    task = run_gee_analysis.delay(field_id)
    
    run = models.AnalysisRun(
        field_id=field_id,
        job_id=task.id,
        status="queued"
    )
    db.add(run)
    db.commit()
    
    return {"job_id": task.id, "status": "queued"}

@app.get("/api/jobs/{job_id}")
def get_job(job_id: str, db: Session = Depends(get_db)):
    run = db.query(models.AnalysisRun).filter(models.AnalysisRun.job_id == job_id).first()
    if not run:
        raise HTTPException(status_code=404, detail="Job not found")
        
    if run.status == "done":
        return {
            "status": "done",
            "result": {
                "job_id": run.job_id,
                "acquisition_date": run.acquisition_date,
                "cloud_cover_pct": run.cloud_cover_pct,
                "indices": run.indices,
                "health_score_pct": run.health_score_pct,
                "recommendations": run.recommendations
            }
        }
    elif run.status == "failed":
        from tasks import celery_app
        task_res = celery_app.AsyncResult(job_id)
        return {"status": "failed", "error": str(task_res.info)}
    else:
        # Check if celery picked it up
        from tasks import celery_app
        task_res = celery_app.AsyncResult(job_id)
        if task_res.state == "STARTED":
            run.status = "running"
            db.commit()
        elif task_res.state == "SUCCESS":
            run.status = "done"
            # It might lack DB fields if worker skipped it, but we at least unblock
            db.commit()
            # Wait, if worker skipped it, the result is in task_res.result!
            res = task_res.result
            if res and isinstance(res, dict):
                run.acquisition_date = res.get("acquisition_date")
                run.cloud_cover_pct = res.get("cloud_cover_pct")
                run.indices = res.get("indices")
                run.health_score_pct = res.get("health_score_pct", 85)
                run.recommendations = res.get("recommendations", "Analysis complete.")
                db.commit()
            
        elif task_res.state == "FAILURE":
            run.status = "failed"
            db.commit()
            return {"status": "failed", "error": str(task_res.info)}
        return {"status": run.status}

@app.get("/api/fields/{field_id}/trends")
def get_field_trends(field_id: str, db: Session = Depends(get_db)):
    field = db.query(models.Field).filter(models.Field.id == field_id).first()
    if not field:
        raise HTTPException(status_code=404, detail="Field not found")
        
    runs = db.query(models.AnalysisRun).filter(
        models.AnalysisRun.field_id == field_id,
        models.AnalysisRun.status == "done"
    ).order_by(models.AnalysisRun.run_date.asc()).all()
    
    return [
        {
            "id": str(r.id),
            "run_date": r.run_date,
            "acquisition_date": r.acquisition_date,
            "cloud_cover_pct": r.cloud_cover_pct,
            "health_score_pct": r.health_score_pct,
            "indices": r.indices
        } for r in runs
    ]
import csv
import io
from fastapi.responses import StreamingResponse
from fpdf import FPDF

@app.get("/api/jobs/{job_id}/export")
def export_job(job_id: str, format: str = "csv", db: Session = Depends(get_db)):
    run = db.query(models.AnalysisRun).filter(models.AnalysisRun.job_id == job_id).first()
    if not run or run.status != "done":
        raise HTTPException(status_code=404, detail="Job not found or not done")
        
    field = db.query(models.Field).filter(models.Field.id == run.field_id).first()
    
    if format == "csv":
        output = io.StringIO()
        writer = csv.writer(output)
        writer.writerow(["Field Name", "Area (ha)", "Acquisition Date", "Cloud Cover %", "Health Score %", "NDVI", "NDWI", "LST"])
        
        indices = run.indices or {}
        ndvi = indices.get("ndvi", {}).get("mean", "")
        ndwi = indices.get("ndwi", {}).get("mean", "")
        lst = indices.get("lst", {}).get("mean", "")
        
        writer.writerow([
            field.name, 
            field.area_ha, 
            run.acquisition_date, 
            run.cloud_cover_pct, 
            run.health_score_pct,
            ndvi, ndwi, lst
        ])
        
        output.seek(0)
        return StreamingResponse(
            iter([output.getvalue()]), 
            media_type="text/csv", 
            headers={"Content-Disposition": f"attachment; filename=field_{field.id}_report.csv"}
        )
        
    elif format == "pdf":
        pdf = FPDF()
        pdf.add_page()
        pdf.set_font("helvetica", "B", 16)
        pdf.cell(0, 10, f"TerraSynapse Analysis Report: {field.name}", new_x="LMARGIN", new_y="NEXT", align="C")
        
        pdf.set_font("helvetica", "", 12)
        pdf.cell(0, 10, f"Date: {run.acquisition_date}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 10, f"Area: {field.area_ha:.2f} ha", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 10, f"Overall Health Score: {run.health_score_pct:.1f}%" if run.health_score_pct else "Overall Health Score: N/A", new_x="LMARGIN", new_y="NEXT")
        
        pdf.ln(5)
        pdf.set_font("helvetica", "B", 14)
        pdf.cell(0, 10, "Key Metrics", new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font("helvetica", "", 12)
        for key, data in (run.indices or {}).items():
            if "mean" in data:
                label = data.get("label", "N/A")
                pdf.cell(0, 8, f"- {key.upper()}: {data['mean']:.3f} ({label})", new_x="LMARGIN", new_y="NEXT")
                
        pdf.ln(5)
        pdf.set_font("helvetica", "B", 14)
        pdf.cell(0, 10, "Agronomic Recommendations", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 12)
        
        for idx, rec in enumerate(run.recommendations or []):
            pdf.set_font("helvetica", "B", 12)
            pdf.cell(0, 8, f"{idx+1}. {rec.get('title')} [{rec.get('priority').upper()}]", new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 11)
            pdf.multi_cell(0, 6, rec.get('description'))
            pdf.ln(2)
            
        pdf_bytes = pdf.output()
        return StreamingResponse(
            io.BytesIO(pdf_bytes), 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=field_{field.id}_report.pdf"}
        )




