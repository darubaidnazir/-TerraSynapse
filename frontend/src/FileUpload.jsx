import React, { useRef, useState } from "react";
import { kml } from "@tmcw/togeojson";
import { UploadCloud, FileJson, FileArchive, Map } from "lucide-react";

export default function FileUpload({ onGeojsonUpload, onZipUpload }) {
  const fileInput = useRef(null);
  const [isDragging, setIsDragging] = useState(false);
  const [overrides, setOverrides] = useState({
    override_ph: "", override_organic_carbon: "", override_cec: "", override_n_proxy: "", crop_type: "default", planting_date: ""
  });

  const processFile = (file) => {
    if (!file) return;

    if (file.name.endsWith(".zip")) {
      onZipUpload(file, overrides);
    } else if (file.name.endsWith(".kml")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        const dom = new DOMParser().parseFromString(text, "text/xml");
        const geojson = kml(dom);
        onGeojsonUpload(geojson, overrides);
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const geojson = JSON.parse(ev.target.result);
          onGeojsonUpload(geojson, overrides);
        } catch (err) {
          alert("Invalid GeoJSON file.");
        }
      };
      reader.readAsText(file);
    } else {
      alert("Unsupported file type. Please upload .zip, .kml, or .geojson");
    }
  };

  const handleFileChange = (e) => {
    processFile(e.target.files[0]);
  };

  const handleOverrideChange = (e) => {
    setOverrides({...overrides, [e.target.name]: e.target.value});
  };

  return (
    <div className="w-full">
      <div 
        className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all mb-4
          ${isDragging ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-gray-400 bg-white'}`}
        onClick={() => fileInput.current.click()}
        onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setIsDragging(false);
          if (e.dataTransfer.files && e.dataTransfer.files[0]) {
            processFile(e.dataTransfer.files[0]);
          }
        }}
      >
        <UploadCloud className={`w-12 h-12 mx-auto mb-3 transition-colors ${isDragging ? 'text-blue-500' : 'text-gray-400'}`} />
        <p className="text-lg font-bold text-gray-700">Tap to select a file</p>
        <div className="flex justify-center gap-4 mt-4 text-xs font-bold tracking-wide text-gray-500 uppercase">
          <span className="flex items-center gap-1"><FileArchive className="w-4 h-4"/> ZIP</span>
          <span className="flex items-center gap-1"><Map className="w-4 h-4"/> KML</span>
          <span className="flex items-center gap-1"><FileJson className="w-4 h-4"/> GEOJSON</span>
        </div>
      </div>
      
      <details className="bg-gray-100 rounded-lg p-3">
        <summary className="text-sm font-bold text-gray-600 cursor-pointer">Technical Soil Overrides</summary>
        <div className="mt-3 grid grid-cols-1 gap-3 text-sm">
          <input name="crop_type" placeholder="Crop (Wheat/Corn)" className="p-3 border rounded-lg w-full" onChange={handleOverrideChange}/>
          <input name="planting_date" type="date" title="Planting Date" className="p-3 border rounded-lg w-full" onChange={handleOverrideChange}/>
          <input name="override_ph" type="number" step="0.1" placeholder="pH (*10)" className="p-3 border rounded-lg w-full" onChange={handleOverrideChange}/>
          <input name="override_organic_carbon" type="number" placeholder="Org Carbon (dg/kg)" className="p-3 border rounded-lg w-full" onChange={handleOverrideChange}/>
          <input name="override_cec" type="number" placeholder="CEC (mmol/kg)" className="p-3 border rounded-lg w-full" onChange={handleOverrideChange}/>
          <input name="override_n_proxy" type="number" placeholder="Nitrogen (cg/kg)" className="p-3 border rounded-lg w-full" onChange={handleOverrideChange}/>
        </div>
      </details>
      
      <input 
        type="file" 
        ref={fileInput}
        accept=".zip,.kml,.geojson,.json"
        onChange={handleFileChange} 
        className="hidden"
      />
    </div>
  );
}
