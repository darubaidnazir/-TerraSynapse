import React, { useState, useEffect } from "react";
import axios from "axios";
import MapComponent from "./MapComponent";
import SearchBar from "./SearchBar";
import FileUpload from "./FileUpload";
import Dashboard from "./Dashboard";
import { Menu, X } from "lucide-react";

function App() {
  const [center, setCenter] = useState([0, 0]);
  const [zoom, setZoom] = useState(2);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState("");
  
  const [currentField, setCurrentField] = useState(null);
  const [analysisResult, setAnalysisResult] = useState(null);
  const [userLocation, setUserLocation] = useState(null);
  const [locationError, setLocationError] = useState(false);
  
  // UI States
  const [showMenu, setShowMenu] = useState(false);

  const fetchLocation = () => {
    setLocationError(false);
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const coords = [position.coords.longitude, position.coords.latitude];
          setCenter(coords);
          setZoom(18); // Zoom in closely to their location
          setUserLocation(coords);
          setShowMenu(false);
        },
        (error) => {
          console.warn("Geolocation error or denied:", error);
          setLocationError(true);
        },
        { enableHighAccuracy: true }
      );
    } else {
      setLocationError(true);
      alert("Geolocation is not supported by your phone.");
    }
  };

  const handleSearchSelect = (lon, lat) => {
    setCenter([lon, lat]);
    setZoom(14);
    setShowMenu(false);
  };

  const handlePolygonSubmit = async (feature, cropType = "default", plantingDate = null, overrides = {}) => {
    try {
      setLoading(true);
      setStatusMsg("Saving your field...");
      
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
      alert("Error saving field. Please try again.");
      setLoading(false);
    }
  };

  const handleGeojsonUpload = (geojson, overrides = {}) => {
    if (geojson.features && geojson.features.length > 0) {
      handlePolygonSubmit(geojson.features[0], overrides.crop_type || "default", overrides.planting_date || null, overrides);
    } else {
      alert("Error: No boundary found in the file.");
    }
  };

  const handleZipUpload = async (file, overrides = {}) => {
    try {
      setLoading(true);
      setStatusMsg("Uploading field...");
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
      alert("Error uploading field.");
      setLoading(false);
    }
  };

  const startAnalysis = async (fieldId) => {
    try {
      setStatusMsg("Looking at your field from space...");
      const res = await axios.post(`http://${window.location.hostname}:8000/api/fields/${fieldId}/analyze`);
      const jobId = res.data.job_id;
      pollJob(jobId);
    } catch (err) {
      console.error(err);
      alert("Error analyzing field.");
      setLoading(false);
    }
  };

  const pollJob = async (jobId) => {
    setStatusMsg("Checking crop health...");
    const interval = setInterval(async () => {
      try {
        const res = await axios.get(`http://${window.location.hostname}:8000/api/jobs/${jobId}`);
        if (res.data.status === "done") {
          clearInterval(interval);
          setAnalysisResult(res.data.result);
          setLoading(false);
        } else if (res.data.status === "failed") {
          clearInterval(interval);
          alert("Analysis failed. Please try again.");
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
    <div className="flex flex-col h-screen w-full relative bg-gray-50 overflow-hidden">
      
      {/* Top App Bar */}
      <header className="bg-green-800 text-white p-4 shadow-md z-30 flex justify-between items-center absolute top-0 w-full h-16">
        <div className="flex items-center gap-3">
          <span className="text-xl font-bold tracking-tight">TerraSynapse</span>
        </div>
        <button 
          onClick={() => setShowMenu(!showMenu)} 
          className="p-2 bg-green-700 rounded-full hover:bg-green-600 active:scale-95 transition-all"
        >
          {showMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </header>

      {/* Slide-over Menu for Advanced/Search features */}
      <div className={`absolute top-0 right-0 w-full md:w-96 h-full bg-white z-20 shadow-2xl transition-transform duration-300 ease-in-out transform pt-16 ${showMenu ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 space-y-6 overflow-y-auto h-full pb-24">
          <h2 className="text-xl font-bold text-gray-800 mb-2">Find a Location</h2>
          
          <button 
             onClick={fetchLocation}
             className="w-full bg-blue-600 hover:bg-blue-700 text-white p-4 rounded-xl font-bold shadow-md flex items-center justify-center gap-3 transition-all active:scale-95 text-lg"
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M12 2v2M12 20v2M2 12h2M20 12h2" />
              <circle cx="12" cy="12" r="6" />
            </svg>
            Use My Current Location
          </button>
          
          {locationError && (
            <p className="text-red-500 text-sm font-bold text-center">Please enable GPS/Location services on your phone.</p>
          )}

          <div className="text-center text-gray-400 font-bold">OR</div>
          
          <SearchBar onSelect={handleSearchSelect} />
          
          <hr className="my-6 border-gray-200" />
          
          {/* File Upload is now visually de-prioritized as an "Advanced" option */}
          <details className="group">
            <summary className="font-bold text-gray-600 cursor-pointer list-none flex items-center justify-between p-4 bg-gray-50 rounded-xl border border-gray-200">
              Advanced: Upload File
              <span className="transition group-open:rotate-180">
                <svg fill="none" height="24" shapeRendering="geometricPrecision" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="1.5" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
              </span>
            </summary>
            <div className="mt-4">
              <FileUpload onGeojsonUpload={handleGeojsonUpload} onZipUpload={handleZipUpload} />
            </div>
          </details>
        </div>
      </div>
      
      {/* Main Map Area */}
      <main className="flex-1 w-full h-full relative pt-16">
        {loading && (
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center">
            <div className="bg-white p-8 rounded-2xl shadow-2xl text-center max-w-sm w-11/12">
              <div className="animate-spin rounded-full h-16 w-16 border-4 border-green-200 border-t-green-700 mx-auto mb-6"></div>
              <p className="text-xl font-bold text-gray-800">{statusMsg}</p>
              <p className="text-gray-500 mt-2 text-sm">Please wait a moment...</p>
            </div>
          </div>
        )}
        
        <MapComponent center={center} zoom={zoom} userLocation={userLocation} onPolygonSubmit={handlePolygonSubmit} />
      </main>
    </div>
  );
}

export default App;
