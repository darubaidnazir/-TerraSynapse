import React, { useState } from "react";
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

  const handleSearchSelect = (lon, lat) => {
    setCenter([lon, lat]);
    setZoom(14);
  };

  const handlePolygonSubmit = async (feature) => {
    try {
      setLoading(true);
      setStatusMsg("Saving field...");
      
      const res = await axios.post("http://localhost:8000/api/fields", {
        name: "My Field",
        geometry: feature.geometry
      });
      
      const fieldData = res.data;
      setCurrentField(fieldData);
      
      startAnalysis(fieldData.field_id);
    } catch (err) {
      console.error(err);
      alert("Error saving field.");
      setLoading(false);
    }
  };

  const handleGeojsonUpload = (geojson) => {
    if (geojson.features && geojson.features.length > 0) { handlePolygonSubmit(geojson.features[0]); } else { alert("Error: No polygons found in the file. Ensure the shapefile/KML contains valid geometries."); }
  };

  const handleZipUpload = async (file) => {
    try {
      setLoading(true);
      setStatusMsg("Uploading shapefile...");
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", "Uploaded Field");
      
      const res = await axios.post("http://localhost:8000/api/fields/upload", formData);
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
      const res = await axios.post(`http://localhost:8000/api/fields/${fieldId}/analyze`);
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
        const res = await axios.get(`http://localhost:8000/api/jobs/${jobId}`);
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
      <header className="bg-green-700 text-white p-4 font-bold shadow-md z-10 flex justify-between items-center">
        <span>TerraSynapse</span>
        {loading && <span className="text-sm font-normal animate-pulse">{statusMsg}</span>}
      </header>
      
      <main className="flex-1 relative">
        {loading && (
          <div className="absolute inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center">
            <div className="bg-white p-6 rounded shadow-lg text-center">
              <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-green-700 mx-auto mb-4"></div>
              <p className="font-bold text-gray-800">{statusMsg}</p>
            </div>
          </div>
        )}
        
        <MapComponent center={center} zoom={zoom} onPolygonSubmit={handlePolygonSubmit} />
        
        <div className="absolute top-4 left-4 z-10 w-80 space-y-4 pointer-events-auto">
          <SearchBar onSelect={handleSearchSelect} />
          <FileUpload onGeojsonUpload={handleGeojsonUpload} onZipUpload={handleZipUpload} />
        </div>
      </main>
    </div>
  );
}

export default App;

