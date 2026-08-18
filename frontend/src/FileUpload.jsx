import React, { useRef } from "react";
import { kml } from "@tmcw/togeojson";

export default function FileUpload({ onGeojsonUpload, onZipUpload }) {
  const fileInput = useRef(null);

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (file.name.endsWith(".zip")) {
      onZipUpload(file);
    } else if (file.name.endsWith(".kml")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        const text = ev.target.result;
        const dom = new DOMParser().parseFromString(text, "text/xml");
        const geojson = kml(dom);
        onGeojsonUpload(geojson);
      };
      reader.readAsText(file);
    } else if (file.name.endsWith(".geojson") || file.name.endsWith(".json")) {
      const reader = new FileReader();
      reader.onload = (ev) => {
        try {
          const geojson = JSON.parse(ev.target.result);
          onGeojsonUpload(geojson);
        } catch (err) {
          alert("Invalid GeoJSON file.");
        }
      };
      reader.readAsText(file);
    } else {
      alert("Unsupported file type. Please upload .zip, .kml, or .geojson");
    }
  };

  return (
    <div className="bg-white p-3 rounded shadow-md w-full">
      <h2 className="text-sm font-bold mb-2">Upload Field Boundary</h2>
      <input 
        type="file" 
        ref={fileInput}
        accept=".zip,.kml,.geojson,.json"
        onChange={handleFileChange} 
        className="w-full text-sm"
      />
      <p className="text-xs text-gray-500 mt-1">.zip (Shapefile), .kml, .geojson</p>
    </div>
  );
}
