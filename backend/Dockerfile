FROM python:3.11-slim

# geopandas/rasterio need GDAL system libs
RUN apt-get update && apt-get install -y --no-install-recommends \
    gdal-bin libgdal-dev g++ && \
    rm -rf /var/lib/apt/lists/*

ENV GDAL_VERSION=3.6.2
WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
