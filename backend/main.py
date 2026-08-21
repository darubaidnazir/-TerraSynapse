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

# Create tables automatically on startup
models.Base.metadata.create_all(bind=engine)

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
        area_ha=geo_info["area_ha"],
        crop_type=field_in.crop_type,
        planting_date=field_in.planting_date,
        override_ph=field_in.override_ph,
        override_organic_carbon=field_in.override_organic_carbon,
        override_cec=field_in.override_cec,
        override_n_proxy=field_in.override_n_proxy
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
async def upload_field(
    file: UploadFile = File(...), 
    name: str = Form(None), 
    owner_id: str = Form(None), 
    crop_type: str = Form("default"),
    planting_date: str = Form(None),
    override_ph: float = Form(None),
    override_organic_carbon: float = Form(None),
    override_cec: float = Form(None),
    override_n_proxy: float = Form(None),
    db: Session = Depends(get_db)
):
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
        area_ha=geo_info["area_ha"],
        crop_type=crop_type,
        planting_date=planting_date,
        override_ph=override_ph,
        override_organic_carbon=override_organic_carbon,
        override_cec=override_cec,
        override_n_proxy=override_n_proxy
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
        return {"status": "failed", "error": "Analysis failed"}
    else:
        # Check if celery picked it up
        from tasks import celery_app
        task_res = celery_app.AsyncResult(job_id)
        if task_res.state == "STARTED" and run.status != "running":
            run.status = "running"
            db.commit()
        elif task_res.state == "FAILURE":
            if run.status != "failed":
                run.status = "failed"
                db.commit()
            return {"status": "failed", "error": str(task_res.info)}
            
        # If Celery says SUCCESS but DB isn't updated yet, just keep reporting running
        # until the worker finishes its DB commit.
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
        title = f"TerraSynapse Analysis Report: {field.name}".encode('latin-1', 'replace').decode('latin-1')
        pdf.cell(0, 10, title, new_x="LMARGIN", new_y="NEXT", align="C")
        
        pdf.set_font("helvetica", "", 12)
        pdf.cell(0, 10, f"Date: {run.acquisition_date}", new_x="LMARGIN", new_y="NEXT")
        pdf.cell(0, 10, f"Area: {field.area_ha:.2f} ha", new_x="LMARGIN", new_y="NEXT")
        
        health_text = f"Overall Health Score: {run.health_score_pct:.1f}%" if run.health_score_pct else "Overall Health Score: N/A"
        pdf.cell(0, 10, health_text, new_x="LMARGIN", new_y="NEXT")
        
        pdf.ln(5)
        pdf.set_font("helvetica", "B", 14)
        pdf.cell(0, 10, "Key Metrics", new_x="LMARGIN", new_y="NEXT")
        
        pdf.set_font("helvetica", "", 12)
        for key, data in (run.indices or {}).items():
            if "mean" in data:
                mean_val = data["mean"]
                mean_str = f"{mean_val:.3f}" if mean_val is not None else "N/A"
                label = data.get("label", "N/A")
                text = f"- {key.upper()}: {mean_str} ({label})".encode('latin-1', 'replace').decode('latin-1')
                pdf.cell(0, 8, text, new_x="LMARGIN", new_y="NEXT")
                
        pdf.ln(5)
        pdf.set_font("helvetica", "B", 14)
        pdf.cell(0, 10, "Agronomic Recommendations", new_x="LMARGIN", new_y="NEXT")
        pdf.set_font("helvetica", "", 12)
        
        for idx, rec in enumerate(run.recommendations or []):
            pdf.set_font("helvetica", "B", 12)
            title = f"{idx+1}. {rec.get('title')} [{rec.get('priority').upper()}]".encode('latin-1', 'replace').decode('latin-1')
            pdf.cell(0, 8, title, new_x="LMARGIN", new_y="NEXT")
            pdf.set_font("helvetica", "", 11)
            desc = str(rec.get('description')).encode('latin-1', 'replace').decode('latin-1')
            pdf.multi_cell(0, 6, desc)
            pdf.ln(2)
            
        pdf.ln(10)
        pdf.set_font("helvetica", "I", 10)
        pdf.set_text_color(128, 128, 128)
        pdf.cell(0, 10, "Built with <3 by Dar Ubaid Nazir", new_x="LMARGIN", new_y="NEXT", align="C")
            
        pdf_bytes = bytes(pdf.output())
        return StreamingResponse(
            io.BytesIO(pdf_bytes), 
            media_type="application/pdf", 
            headers={"Content-Disposition": f"attachment; filename=field_{field.id}_report.pdf"}
        )




