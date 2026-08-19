import React, { useState, useEffect } from "react";
import axios from "axios";
import MapComponent from "./MapComponent";
import SearchBar from "./SearchBar";
import FileUpload from "./FileUpload";
import Dashboard from "./Dashboard";

function App() {
  const [center, setCenter] = useState([0, 0]);
  const [zoom, setZoom] = useState(2);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  
  const [currentField, setCurrentField] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [showMapMobile, setShowMapMobile] = useState(false);
  const [locationError, setLocationError] = useState(false);

  const fetchLocation = () => {
    setLocationError(false);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = [position.coords.longitude, position.coords.latitude];
          setCenter(coords);
          setZoom(18); // Zoom in closely to their location
          setUserLocation(coords);
          setShowMapMobile(true); // Auto-open map if location fetched successfully
        },
        (error) => {
          console.warn("Geolocation error or denied:", error);
          setLocationError(true);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLocationError(true);
      alert("Geolocation is not supported by your browser.");
    }
  };

  useEffect(() => {
    fetchLocation();
  }, []);

  const handleSearchSelect = (lon, lat) => {
    setCenter([lon, lat]);
    setZoom(14);
  };

  const handlePolygonSubmit = async (feature, cropType = "default", plantingDate = null, overrides = {}) => {
    try {
      setLoading(true);
      setStatusMsg("Saving field...");
      
      const payload = {
        name: "My Field",
        geometry: feature.geometry,
        crop_type: cropType,
        ...overrides
      };
      
      if (plantingDate) payload.planting_date = plantingDate;

      const res = await axios.post(`http://${window.location.hostname}:8000/api/fields`, payload);
      
      const fieldData = res.data;
      setCurrentField(fieldData);
      
      startAnalysis(fieldData.field_id);
    } catch (err) {
      console.error(err);
      alert("Error saving field.");
      setLoading(false);
    }
  };

  const handleGeojsonUpload = (geojson, overrides = {}) => {
    if (geojson.features && geojson.features.length > 0) {
      handlePolygonSubmit(geojson.features[0], overrides.crop_type || "default", overrides.planting_date || null, overrides);
    } else {
      alert("Error: No polygons found in the file. Ensure the shapefile/KML contains valid geometries.");
    }
  };

  const handleZipUpload = async (file, overrides = {}) => {
    try {
      setLoading(true);
      setStatusMsg("Uploading shapefile...");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", "Uploaded Field");
      if (overrides.crop_type) formData.append("crop_type", overrides.crop_type);
      if (overrides.planting_date) formData.append("planting_date", overrides.planting_date);
      if (overrides.override_ph) formData.append("override_ph", overrides.override_ph);
      if (overrides.override_organic_carbon) formData.append("override_organic_carbon", overrides.override_organic_carbon);
      if (overrides.override_cec) formData.append("override_cec", overrides.override_cec);
      if (overrides.override_n_proxy) formData.append("override_n_proxy", overrides.override_n_proxy);
      
      const res = await axios.post(`http://${window.location.hostname}:8000/api/fields/upload`, formData);
      const fieldData = res.data;
      setCurrentField(fieldData);
      
      startAnalysis(fieldData.field_id);
    } catch (err) {
      console.error(err);
      alert("Error uploading zip.");
      setLoading(false);
    }
  };

  const startAnalysis = async (fieldId) => {
    try {
      setStatusMsg("Starting GEE analysis...");
      const res = await axios.post(`http://${window.location.hostname}:8000/api/fields/${fieldId}/analyze`);
      const jobId = res.data.job_id;
      pollJob(jobId);
    } catch (err) {
      console.error(err);
      alert("Error starting analysis.");
      setLoading(false);
    }
  };

  const pollJob = async (jobId) => {
    setStatusMsg("Analyzing satellite imagery...");
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`http://${window.location.hostname}:8000/api/jobs/${jobId}`);
        if (res.data.status === "done") {
          clearInterval(interval);
          setAnalysisResult(res.data.result);
          setLoading(false);
        } else if (res.data.status === "failed") {
          clearInterval(interval);
          alert("Analysis failed: " + res.data.error);
          setLoading(false);
        }
      } catch (err) {
        console.error(err);
      }
    }, 3000);
  };

  const handleReset = () => {
    setCurrentField(null);
    setAnalysisResult(null);
    setCenter([0, 0]);
    setZoom(2);
  };

  if (analysisResult) {
    return <Dashboard field={currentField} result={analysisResult} onReset={handleReset} />;
  }

  return (
    <div className="flex flex-col h-screen">
      <header className="bg-green-800/95 backdrop-blur-md text-white p-4 shadow-md z-20 flex justify-between items-center sticky top-0 border-b border-green-700">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-white/10 rounded-lg flex items-center justify-center border border-white/20">
            <svg className="w-5 h-5 text-green-100" fill="none" stroke="currentColor" viewBox="0 0 24 24" strokeWidth="2">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.055 11H5a2 2 0 012 2v1a2 2 0 002 2 2 2 0 012 2v2.945M8 3.935V5.5A2.5 2.5 0 0010.5 8h.5a2 2 0 012 2 2 2 0 104 0 2 2 0 012-2h1.064M15 20.488V18a2 2 0 012-2h3.064M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path>
            </svg>
          </div>
          <span className="text-xl font-bold tracking-tight text-white">TerraSynapse</span>
        </div>
        {loading && (
          <div className="flex items-center gap-2 bg-green-900/50 px-3 py-1.5 rounded-full border border-green-700/50">
            <div className="w-4 h-4 border-2 border-green-200 border-t-transparent rounded-full animate-spin"></div>
            <span className="text-sm font-medium text-green-100">{statusMsg}</span>
          </div>
        )}
      </header>
      
      <main className="flex-1 flex flex-col md:flex-row overflow-hidden bg-white">
        
        {/* Sidebar Controls - Separated from Map */}
        <div className={`${showMapMobile ? 'hidden md:block' : 'block'} w-full md:w-96 bg-gray-50 border-r border-gray-200 p-4 space-y-4 overflow-y-auto flex-shrink-0 z-10 shadow-lg md:shadow-none`}>
          {locationError && (
            <button onClick={fetchLocation} className="w-full bg-red-50 text-red-600 p-3 rounded-lg font-bold border border-red-200 hover:bg-red-100 transition-all flex items-center justify-center gap-2">
              <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"></path><line x1="12" y1="9" x2="12" y2="13"></line><line x1="12" y1="17" x2="12.01" y2="17"></line></svg>
              Enable Location / Retry
            </button>
          )}
          
          <button onClick={() => setShowMapMobile(true)} className="md:hidden w-full bg-green-700 hover:bg-green-800 text-white font-bold p-3 rounded-lg shadow-md transition-all">
            Open Map Fullscreen
          </button>

          <SearchBar onSelect={handleSearchSelect} />
          <FileUpload onGeojsonUpload={handleGeojsonUpload} onZipUpload={handleZipUpload} />
        </div>

        {/* Map Area */}
        <div className={`${showMapMobile ? 'block' : 'hidden md:block'} flex-1 relative min-h-[50vh]`}>
          {loading && (
            <div className="absolute inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
              <div className="bg-white p-6 rounded shadow-lg text-center">
                <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-700 mx-auto mb-4"></div>
                <p className="font-bold text-gray-800">{statusMsg}</p>
              </div>
            </div>
          )}
          
          <MapComponent center={center} zoom={zoom} userLocation={userLocation} onPolygonSubmit={handlePolygonSubmit} />
          
          {/* Mobile Back Button */}
          {showMapMobile && (
            <button onClick={() => setShowMapMobile(false)} className="md:hidden absolute top-4 left-4 z-20 bg-white px-4 py-2 rounded-full shadow-lg font-bold text-gray-700 border border-gray-100 flex items-center gap-1">
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="19" y1="12" x2="5" y2="12"></line><polyline points="12 19 5 12 12 5"></polyline></svg>
              Menu
            </button>
          )}

          {/* Fetch Location Button */}
          <button 
             onClick={fetchLocation}
             className={`absolute ${showMapMobile ? 'top-20' : 'top-4'} left-4 md:top-4 md:left-4 z-10 bg-white p-3 rounded-full shadow-lg ${locationError ? 'text-red-500 hover:bg-red-50' : 'text-blue-600 hover:bg-blue-50'} border border-gray-100 transition-all hover:scale-105 active:scale-95`}
             title="Find My Location"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
              <circle cx="12" cy="12" r="6" />
            </svg>
          </button>
        </div>
      </main>
    </div>
  );
}

export default App;

