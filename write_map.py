import sys

content = '''import React, { useRef, useEffect, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import * as turf from "@turf/turf";

export default function MapComponent({center, zoom, onPolygonSubmit}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const draw = useRef(null);
  const [error, setError] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);

  useEffect(() => {
    if (map.current) return;
    map.current = new maplibregl.Map({
      container: mapContainer.current,
      style: "https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json", // Free basemap
      center: center,
      zoom: zoom
    });

    draw.current = new MapboxDraw({
      displayControlsDefault: false,
      controls: {
        polygon: true,
        trash: true
      }
    });
    map.current.addControl(draw.current, "top-right");

    map.current.on("draw.create", validateAndSet);
    map.current.on("draw.update", validateAndSet);
    map.current.on("draw.delete", () => setActiveFeature(null));

    function validateAndSet(e) {
      setError(null);
      const data = draw.current.getAll();
      if (data.features.length > 1) {
        draw.current.delete(data.features[0].id); // Keep only one
      }
      const feature = data.features[data.features.length - 1];
      
      const area = turf.area(feature); // in sq meters
      const areaHa = area / 10000;
      if (areaHa < 0.01) {
        setError("Area is too small ( < 100 mq )");
      } else if (areaHa > 5000) {
        setError("Area is too large (> 5000 ha)");
      } else {
        setActiveFeature(feature);
      }
    }
  }, []);

  useEffect(() => {
    if (map.current) {
      map.current.flyTo({ center: center, zoom: zoom });
    }
  }, [center, zoom]);

  const handleSubmit = () => {
    if (activeFeature && !error) {
      onPolygonSubmit(activeFeature);
    }
  };

  return (
    <div className="w-full h-full relative">
      <div ref={mapContainer} className="absolute inset-0" />
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-white p-4 rounded shadow-lg flex flex-col items-center">
          <div className="text-red-500 mb-2">{error}</div>
          <button 
            onClick={handleSubmit}
            disabled={!activeFeature || error}
            className={\\ text-white px-4 py-2 rounded font-bold\}
          >
            Save Field
          </button>
        </div>
      </div>
    </div>
  );
}
'''
with open('frontend/src/MapComponent.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
