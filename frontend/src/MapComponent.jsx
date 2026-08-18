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

  const [cropType, setCropType] = useState("default");

  useEffect(() => {
    if (map.current) return;
    
    try {
      map.current = new maplibregl.Map({
        container: mapContainer.current,
        style: {
          "version": 8,
          "sources": {
            "satellite": {
              "type": "raster",
              "tiles": [
                "https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}"
              ],
              "tileSize": 256,
              "attribution": "Map data &copy; Google"
            }
          },
          "layers": [
            {
              "id": "satellite",
              "type": "raster",
              "source": "satellite",
              "minzoom": 0,
              "maxzoom": 22
            }
          ]
        },
        center: center,
        zoom: zoom,
        maxZoom: 21
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
      onPolygonSubmit(activeFeature, cropType);
    }
  };

  return (
    <div className="w-full h-full absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10 w-80">
        <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-xl border border-gray-100 flex flex-col items-center gap-3 w-full">
          <div className="flex items-center gap-2 w-full">
            <select 
              value={cropType} 
              onChange={e => setCropType(e.target.value)}
              className="bg-white border border-gray-200 text-gray-800 text-sm font-medium rounded-lg focus:ring-2 focus:ring-green-500 focus:border-green-500 block w-full p-2.5 outline-none transition-all shadow-sm cursor-pointer"
            >
              <option value="default">Generic Crop</option>
              <option value="Wheat">Wheat</option>
              <option value="Corn">Corn</option>
            </select>
            
            <button 
              onClick={handleSubmit}
              disabled={!activeFeature || error}
              className={`${!activeFeature || error ? "bg-gray-300 text-gray-500 cursor-not-allowed" : "bg-green-600 hover:bg-green-700 text-white shadow-md active:scale-95"} px-5 py-2.5 rounded-lg font-bold text-sm transition-all whitespace-nowrap`}
            >
              Save Field
            </button>
          </div>
          {error && <div className="text-red-500 text-xs font-bold w-full text-center bg-red-50 py-1 rounded">{error}</div>}
        </div>
      </div>
    </div>
  );
}

