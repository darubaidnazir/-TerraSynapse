import uuid
from sqlalchemy import Column, String, Float, DateTime, text, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import declarative_base
from geoalchemy2 import Geography

Base = declarative_base()

class Field(Base):
    __tablename__ = "fields"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    owner_id = Column(String, nullable=True)
    name = Column(String, nullable=True)
    geometry = Column(Geography("POLYGON", srid=4326), nullable=False)
    area_ha = Column(Float, nullable=True)
    crop_type = Column(String, nullable=True)
    planting_date = Column(DateTime(timezone=True), nullable=True)
    override_ph = Column(Float, nullable=True)
    override_organic_carbon = Column(Float, nullable=True)
    override_cec = Column(Float, nullable=True)
    override_n_proxy = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=text("now()"))

class AnalysisRun(Base):
    __tablename__ = "analysis_runs"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    field_id = Column(UUID(as_uuid=True), ForeignKey("fields.id"), nullable=False)
    run_date = Column(DateTime(timezone=True), server_default=text("now()"))
    acquisition_date = Column(String, nullable=True)
    cloud_cover_pct = Column(Float, nullable=True)
    indices = Column(JSONB, nullable=True)
    health_score_pct = Column(Float, nullable=True)
    recommendations = Column(JSONB, nullable=True)
    status = Column(String, default="running")
    job_id = Column(String, nullable=True)

class IndexThreshold(Base):
    __tablename__ = "index_thresholds"
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4, server_default=text("gen_random_uuid()"))
    crop_type = Column(String, nullable=False)
    index_name = Column(String, nullable=False)
    poor_max = Column(Float, nullable=True)
    moderate_max = Column(Float, nullable=True)
    weight = Column(Float, default=1.0)
    
    __table_args__ = (UniqueConstraint("crop_type", "index_name", name="uix_crop_index"),)
