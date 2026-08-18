import React, { useRef, useEffect, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import * as turf from "@turf/turf";
import { theme as drawTheme } from './drawTheme';

export default function MapComponent({center, zoom, onPolygonSubmit}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const draw = useRef(null);
  const [error, setError] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);

  useEffect(() => {
    if (map.current) return;
    
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          "version": 8,
          "sources": {
            "osm": {
              "type": "raster",
              "tiles": [
                "https://a.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://b.tile.openstreetmap.org/{z}/{x}/{y}.png",
                "https://c.tile.openstreetmap.org/{z}/{x}/{y}.png"
              ],
              "tileSize": 256,
              "attribution": "&copy; OpenStreetMap contributors"
            }
          },
          "layers": [
            {
              "id": "osm",
              "type": "raster",
              "source": "osm",
              "minzoom": 0,
              "maxzoom": 19
            }
          ]
        },
        center: center,
        zoom: zoom,
        maxZoom: 19
      });

      draw.current = new MapboxDraw({
        styles: drawTheme,
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

    } catch (err) {
      console.error("Map initialization failed", err);
      setError("Failed to load map.");
    }

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
    if (map.current && center && zoom) {
      try {
        map.current.flyTo({ center: center, zoom: zoom });
      } catch (err) {
        console.error("FlyTo failed", err);
      }
    }
  }, [center, zoom]);

  const handleSubmit = () => {
    if (activeFeature && !error) {
      onPolygonSubmit(activeFeature);
    }
  };

  return (
    <div className="w-full h-full absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="absolute bottom-4 left-1/2 transform -translate-x-1/2 z-10">
        <div className="bg-white p-4 rounded shadow-lg flex flex-col items-center">
          <div className="text-red-500 mb-2">{error}</div>
          <button 
            onClick={handleSubmit}
            disabled={!activeFeature || error}
            className={`${!activeFeature || error ? "bg-gray-400 cursor-not-allowed" : "bg-green-600 hover:bg-green-700"} text-white px-4 py-2 rounded font-bold`}
          >
            Save Field
          </button>
        </div>
      </div>
    </div>
  );
}

