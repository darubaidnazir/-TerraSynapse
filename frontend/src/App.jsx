import React, { useState, useEffect } from "react";
import axios from "axios";
import MapComponent from "./MapComponent";
import SearchBar from "./SearchBar";
import FileUpload from "./FileUpload";
import Dashboard from "./Dashboard";
import { Menu, X, MapPin } from "lucide-react";

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
  
  // GPS Initial State
  const [gpsStatus, setGpsStatus] = useState("prompt"); // 'prompt', 'checking', 'granted', 'denied'
  const [gpsErrorMsg, setGpsErrorMsg] = useState("");

  const requestLocation = () => {
    setGpsStatus("checking");
    setGpsErrorMsg("");
    
    // Some mobile browsers block geolocation over HTTP (unless localhost)
    if (!navigator.geolocation) {
      setGpsStatus("denied");
      setGpsErrorMsg("Geolocation is not supported by your browser or is blocked due to an insecure connection (HTTP).");
      return;
    }

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const coords = [position.coords.longitude, position.coords.latitude];
        setCenter(coords);
        setZoom(18); // Zoom in closely to their location
        setUserLocation(coords);
        setGpsStatus("granted");
        setShowMenu(false);
      },
      (error) => {
        console.warn("Geolocation error or denied:", error);
        setGpsStatus("denied");
        if (error.code === error.PERMISSION_DENIED) {
          setGpsErrorMsg("Location permission denied. Please allow GPS access in your browser settings and try again.");
        } else if (error.code === error.POSITION_UNAVAILABLE) {
          setGpsErrorMsg("Location information is unavailable. Please turn on your device's GPS and try again.");
        } else if (error.code === error.TIMEOUT) {
          setGpsErrorMsg("Location request timed out. Please check your signal and try again.");
        } else {
          setGpsErrorMsg("An error occurred while detecting your location.");
        }
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  };

  const fetchLocation = () => {
    // This can still be used from the menu if needed
    requestLocation();
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
    // Keep user at current location if possible, rather than resetting to [0,0]
    if (userLocation) {
      setCenter(userLocation);
      setZoom(18);
    }
  };

  // ----------------------------------------------------
  // GPS Initial Screens
  // ----------------------------------------------------
  if (gpsStatus === "prompt") {
    return (
      <div className="flex flex-col h-screen w-full bg-green-50 items-center justify-center p-6 text-center">
        <div className="bg-green-100 p-4 rounded-full mb-6">
          <MapPin className="w-12 h-12 text-green-700" />
        </div>
        <h1 className="text-4xl font-extrabold text-green-900 mb-4">Welcome to TerraSynapse</h1>
        <p className="text-lg text-gray-700 mb-8 max-w-md">
          To provide the best experience and map your fields accurately, we need access to your current location.
        </p>
        
        {!window.isSecureContext && window.location.hostname !== 'localhost' && (
          <div className="bg-yellow-100 text-yellow-800 p-4 rounded-lg mb-8 max-w-md text-sm text-left font-medium shadow-sm border border-yellow-200">
            ⚠️ <strong>Note:</strong> You are accessing this site over an insecure connection (HTTP). Mobile browsers often block location access unless the site uses HTTPS. If it fails, try using localhost or an HTTPS tunnel.
          </div>
        )}

        <button 
          onClick={requestLocation}
          className="bg-green-600 hover:bg-green-700 text-white font-bold py-4 px-10 rounded-full shadow-xl transition-transform active:scale-95 text-xl flex items-center gap-2"
        >
          <MapPin className="w-6 h-6" />
          Allow Location Access
        </button>
      </div>
    );
  }

  if (gpsStatus === "checking") {
    return (
      <div className="flex flex-col h-screen w-full bg-green-50 items-center justify-center p-6 text-center">
        <div className="animate-bounce bg-green-100 p-4 rounded-full mb-6">
          <MapPin className="w-12 h-12 text-green-700" />
        </div>
        <h1 className="text-3xl font-extrabold text-green-900 mb-2">TerraSynapse</h1>
        <p className="text-lg text-gray-700 mb-8 max-w-md">
          Detecting your current location...<br/>
          Please allow GPS access when prompted.
        </p>
        <div className="animate-spin rounded-full h-12 w-12 border-4 border-green-200 border-t-green-700"></div>
      </div>
    );
  }

  if (gpsStatus === "denied") {
    return (
      <div className="flex flex-col h-screen w-full bg-red-50 items-center justify-center p-6 text-center">
        <div className="bg-red-100 p-4 rounded-full mb-6">
          <MapPin className="w-12 h-12 text-red-600" />
        </div>
        <h1 className="text-3xl font-extrabold text-red-900 mb-2">Location Required</h1>
        <p className="text-lg text-red-700 mb-8 max-w-md font-medium">
          {gpsErrorMsg}
        </p>
        <p className="text-md text-gray-600 mb-8 max-w-md">
          TerraSynapse requires your location to map your fields accurately. Please turn on GPS and allow location access in your browser settings.
        </p>
        <button 
          onClick={requestLocation}
          className="bg-red-600 hover:bg-red-700 text-white font-bold py-3 px-8 rounded-xl shadow-lg transition-transform active:scale-95"
        >
          Try Again
        </button>
      </div>
    );
  }

  // ----------------------------------------------------
  // Main App (GPS Granted)
  // ----------------------------------------------------
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
            <MapPin className="w-6 h-6" />
            Recenter on My Location
          </button>
          
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
          
          <div className="mt-8 text-center text-sm text-gray-400 font-medium">
            Built with ❤️ by Dar Ubaid Nazir
          </div>
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

