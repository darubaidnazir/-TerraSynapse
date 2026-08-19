import React, { useRef, useEffect, useState } from "react";
import * as maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import MapboxDraw from "@mapbox/mapbox-gl-draw";
import "@mapbox/mapbox-gl-draw/dist/mapbox-gl-draw.css";
import * as turf from "@turf/turf";
import { theme as drawTheme } from './drawTheme';

export default function MapComponent({center, zoom, userLocation, onPolygonSubmit}) {
  const mapContainer = useRef(null);
  const map = useRef(null);
  const draw = useRef(null);
  const markerRef = useRef(null);
  const [error, setError] = useState(null);
  const [activeFeature, setActiveFeature] = useState(null);
  const [cropType, setCropType] = useState("default");
  const [plantingDate, setPlantingDate] = useState("");

  const [isWalking, setIsWalking] = useState(false);
  const [walkPath, setWalkPath] = useState([]);
  const [gpsWarning, setGpsWarning] = useState(null);
  const [currentAccuracy, setCurrentAccuracy] = useState(null);
  const watchIdRef = useRef(null);

  const [isDrawing, setIsDrawing] = useState(false);

  const validateAndSet = (e) => {
    setError(null);
    if (!draw.current) return;
    const data = draw.current.getAll();
    if (data.features.length > 1) {
      draw.current.delete(data.features[0].id); // Keep only one
    }
    if (data.features.length === 0) {
      setActiveFeature(null);
      return;
    }
    
    const feature = data.features[data.features.length - 1];
    const area = turf.area(feature); // in sq meters
    const areaHa = area / 10000;
    
    if (areaHa < 0.01) {
      setError("Field is too small. Please draw a larger area.");
    } else if (areaHa > 5000) {
      setError("Field is too large. Please draw a smaller area.");
    } else {
      setActiveFeature(feature);
    }
  };

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
        displayControlsDefault: false
      });
      map.current.addControl(draw.current, "top-right");

      map.current.on("draw.create", validateAndSet);
      map.current.on("draw.update", validateAndSet);
      map.current.on("draw.delete", () => setActiveFeature(null));
      map.current.on("draw.modechange", (e) => setIsDrawing(e.mode === 'draw_polygon'));

    } catch (err) {
      console.error("Map initialization failed", err);
      setError("Failed to load map.");
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

  useEffect(() => {
    if (map.current && userLocation) {
      if (!markerRef.current) {
        markerRef.current = new maplibregl.Marker({ color: "#FF0000" })
          .setLngLat(userLocation)
          .addTo(map.current);
      } else {
        markerRef.current.setLngLat(userLocation);
      }
    }
  }, [userLocation]);

  useEffect(() => {
    if (!map.current) return;
    
    const updateWalkPathLayer = () => {
      if (!map.current.getSource('walk-path')) {
        map.current.addSource('walk-path', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: walkPath } }
        });
        map.current.addLayer({
          id: 'walk-path-layer',
          type: 'line',
          source: 'walk-path',
          layout: { 'line-join': 'round', 'line-cap': 'round' },
          paint: { 'line-color': '#3b82f6', 'line-width': 4 } // Blue line
        });
      } else {
        map.current.getSource('walk-path').setData({
          type: 'Feature', geometry: { type: 'LineString', coordinates: walkPath }
        });
      }
    };

    if (map.current.isStyleLoaded()) {
       updateWalkPathLayer();
    } else {
       map.current.on('load', updateWalkPathLayer);
    }
  }, [walkPath]);

  const startWalking = () => {
    if (!("geolocation" in navigator)) return alert("Geolocation not supported by your phone.");
    
    setWalkPath([]);
    setIsWalking(true);
    setError(null);
    setGpsWarning("Getting GPS Signal...");
    setCurrentAccuracy(null);
    
    watchIdRef.current = navigator.geolocation.watchPosition(
      (position) => {
        const accuracy = position.coords.accuracy;
        setCurrentAccuracy(accuracy);
        
        // Only accept points with high accuracy (less than 10 meters)
        if (accuracy > 10) {
          setGpsWarning(`Low GPS precision. Please wait...`);
          return;
        }
        
        setGpsWarning(null); // Clear warning on good fix
        const coords = [position.coords.longitude, position.coords.latitude];
        
        setWalkPath(prev => {
          if (prev.length > 0 && prev[prev.length-1][0] === coords[0] && prev[prev.length-1][1] === coords[1]) return prev;
          return [...prev, coords];
        });
      },
      (error) => {
        console.warn("Watch position error:", error);
        setGpsWarning("GPS Signal Lost.");
        setCurrentAccuracy(null);
      },
      { enableHighAccuracy: true, maximumAge: 0 }
    );
  };

  const stopWalking = () => {
    if (watchIdRef.current) {
      navigator.geolocation.clearWatch(watchIdRef.current);
      watchIdRef.current = null;
    }
    setIsWalking(false);
    setCurrentAccuracy(null);
    
    if (walkPath.length > 2) {
      const closedPath = [...walkPath, walkPath[0]];
      const feature = {
        type: 'Feature',
        properties: {},
        geometry: { type: 'Polygon', coordinates: [closedPath] }
      };
      
      draw.current.deleteAll(); // clear existing
      draw.current.add(feature);
      
      validateAndSet();
      setWalkPath([]); // Hide the blue line once polygon is drawn
    } else {
      setError("Please walk further to create a boundary.");
      setWalkPath([]);
    }
  };

  const startDrawing = () => {
    if (draw.current) {
      draw.current.changeMode('draw_polygon');
      setIsDrawing(true);
    }
  };

  const cancelDrawing = () => {
    if (draw.current) {
      draw.current.changeMode('simple_select');
      setIsDrawing(false);
    }
  };

  const clearDrawing = () => {
    if (draw.current) {
      draw.current.deleteAll();
      validateAndSet();
    }
  };

  const handleSubmit = () => {
    if (activeFeature && !error) {
      onPolygonSubmit(activeFeature, cropType, plantingDate);
    }
  };

  const renderGpsSignal = () => {
    if (currentAccuracy === null) return null;
    let bars = 0;
    if (currentAccuracy <= 5) bars = 3;
    else if (currentAccuracy <= 10) bars = 2;
    else if (currentAccuracy <= 20) bars = 1;

    return (
      <div className="flex items-center gap-2 bg-white/95 border border-gray-200 backdrop-blur px-4 py-2 rounded-full shadow-md text-sm font-bold text-gray-800">
        <div className="flex items-end gap-1 h-5">
          <div className={`w-1.5 rounded-sm ${bars >= 1 ? (bars === 1 ? 'bg-yellow-500' : 'bg-green-500') : 'bg-gray-300'} h-3`} />
          <div className={`w-1.5 rounded-sm ${bars >= 2 ? 'bg-green-500 h-4' : 'bg-gray-300 h-4'}`} />
          <div className={`w-1.5 rounded-sm ${bars >= 3 ? 'bg-green-500 h-5' : 'bg-gray-300 h-5'}`} />
        </div>
        <span>GPS Accuracy: {Math.round(currentAccuracy)}m</span>
      </div>
    );
  };

  return (
    <div className="w-full h-full absolute inset-0">
      <div ref={mapContainer} className="w-full h-full" />
      
      {/* Bottom Floating Controls */}
      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 z-10 w-[calc(100%-2rem)] max-w-lg flex flex-col gap-3">
        
        {/* Step 1: Draw or Walk */}
        {!activeFeature && (
          <div className="flex flex-col items-center w-full pointer-events-auto gap-3 bg-white/90 p-4 rounded-2xl shadow-2xl border border-gray-100">
            <h3 className="text-lg font-bold text-gray-800 text-center w-full">Step 1: Add Your Field</h3>
            
            {isWalking && renderGpsSignal()}
            {isWalking && gpsWarning && (
              <div className="bg-yellow-100 text-yellow-800 text-sm font-bold px-4 py-2 rounded-xl shadow w-full text-center">
                ⚠️ {gpsWarning}
              </div>
            )}
            
            {isDrawing && (
              <div className="bg-orange-100 text-orange-900 text-sm font-bold px-4 py-3 rounded-xl shadow w-full text-center border border-orange-200">
                👆 Tap the corners of your field on the map to draw the boundary.
              </div>
            )}
            
            <div className="flex flex-col sm:flex-row w-full gap-3">
              <button 
                onClick={isWalking ? stopWalking : startWalking}
                disabled={isDrawing}
                className={`py-4 rounded-xl font-bold text-white shadow-lg flex-1 flex justify-center items-center gap-2 transition-all text-lg ${isWalking ? 'bg-red-500 hover:bg-red-600 animate-pulse' : isDrawing ? 'bg-gray-400 opacity-50 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700'}`}
              >
                {isWalking ? (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="6" width="12" height="12" rx="2" ry="2"></rect></svg>
                    Finish Walking ({walkPath.length})
                  </>
                ) : (
                  <>
                    <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2a2 2 0 1 0 0 4 2 2 0 0 0 0-4z"></path><path d="M14 8a4 4 0 0 0-4 4v9a1 1 0 0 0 2 0v-4h2v4a1 1 0 0 0 2 0v-6"></path><path d="M10 11H8"></path><path d="M16 11h2"></path></svg>
                    Walk Boundary
                  </>
                )}
              </button>

              <button 
                onClick={isDrawing ? cancelDrawing : startDrawing}
                disabled={isWalking}
                className={`py-4 rounded-xl font-bold text-white shadow-lg flex-1 flex justify-center items-center gap-2 transition-all text-lg ${isDrawing ? 'bg-red-500 hover:bg-red-600' : isWalking ? 'bg-gray-400 opacity-50 cursor-not-allowed' : 'bg-orange-500 hover:bg-orange-600'}`}
              >
                {isDrawing ? "Cancel Drawing" : "Tap to Draw"}
              </button>
            </div>
            {error && <div className="text-red-500 text-sm font-bold w-full text-center bg-red-50 py-2 rounded-xl mt-2">{error}</div>}
          </div>
        )}

        {/* Step 2: Details & Submit (Visible only when field is drawn) */}
        {activeFeature && (
          <div className="bg-white/95 backdrop-blur-md p-4 rounded-2xl shadow-2xl border border-gray-100 flex flex-col gap-4 w-full pointer-events-auto">
            
            <div className="flex justify-between items-center border-b pb-2">
              <h3 className="text-lg font-bold text-gray-800">Step 2: Field Details</h3>
              <button onClick={clearDrawing} className="text-red-500 text-sm font-bold hover:underline">
                Redraw Field
              </button>
            </div>

            <div className="flex flex-col gap-3">
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Crop Type</label>
                <select 
                  value={cropType} 
                  onChange={e => setCropType(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-lg font-medium rounded-xl focus:ring-2 focus:ring-green-500 block w-full p-3 outline-none shadow-sm"
                >
                  <option value="default">Generic / Mixed Crop</option>
                  <option value="Wheat">Wheat</option>
                  <option value="Corn">Corn</option>
                </select>
              </div>
              
              <div>
                <label className="block text-sm font-bold text-gray-700 mb-1">Planting Date (Optional)</label>
                <input 
                  type="date"
                  value={plantingDate}
                  onChange={e => setPlantingDate(e.target.value)}
                  className="bg-gray-50 border border-gray-300 text-gray-900 text-lg font-medium rounded-xl focus:ring-2 focus:ring-green-500 block w-full p-3 outline-none shadow-sm"
                />
              </div>

              <button 
                onClick={handleSubmit}
                disabled={error}
                className={`${error ? "bg-gray-300 text-gray-500" : "bg-green-600 hover:bg-green-700 text-white shadow-lg active:scale-95"} py-4 mt-2 rounded-xl font-bold text-xl transition-all w-full flex items-center justify-center gap-2`}
              >
                Analyze Field Health
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14"></path><path d="m12 5 7 7-7 7"></path></svg>
              </button>
            </div>
            
            {error && <div className="text-red-500 text-sm font-bold w-full text-center bg-red-50 py-2 rounded">{error}</div>}
          </div>
        )}
      </div>
    </div>
  );
}
