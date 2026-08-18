import React, { useState } from "react";
import axios from "axios";
import { Search, MapPin } from "lucide-react";

export default function SearchBar({ onSelect }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [timer, setTimer] = useState(null);

  const search = async (val) => {
    if (!val || val.length < 3) {
      setResults([]);
      return;
    }
    try {
      const res = await axios.get(`https://nominatim.openstreetmap.org/search?q=${val}&format=json&limit=5&email=admin@terrasynapse.local`, {
        headers: { "Accept": "application/json" }
      });
      setResults(res.data);
    } catch (err) {
      console.error(err);
    }
  };

  const handleChange = (e) => {
    const val = e.target.value;
    setQuery(val);
    clearTimeout(timer);
    setTimer(setTimeout(() => search(val), 300));
  };

  return (
    <div className="bg-white/90 backdrop-blur-md p-4 rounded-xl shadow-lg border border-gray-100 w-full transition-all">
      <div className="flex items-center gap-2 mb-3">
        <Search className="w-4 h-4 text-green-700" />
        <h2 className="text-sm font-bold text-gray-800">Search Location</h2>
      </div>
      <div className="relative">
        <input 
          type="text" 
          value={query} 
          onChange={handleChange} 
          placeholder="Enter village, city, or region..." 
          className="w-full bg-gray-50/50 border border-gray-200 focus:border-green-500 focus:ring-2 focus:ring-green-200 transition-all p-2.5 pl-3 rounded-lg text-sm outline-none text-gray-800"
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-2 max-h-48 overflow-y-auto bg-white border border-gray-100 rounded-lg shadow-sm">
          {results.map(r => (
            <li 
              key={r.place_id} 
              onClick={() => {
                onSelect(parseFloat(r.lon), parseFloat(r.lat));
                setResults([]);
                setQuery(r.display_name.split(',')[0]);
              }}
              className="p-3 border-b last:border-0 border-gray-50 cursor-pointer hover:bg-green-50 transition-colors flex items-start gap-2 group"
            >
              <MapPin className="w-4 h-4 text-gray-400 group-hover:text-green-600 shrink-0 mt-0.5 transition-colors" />
              <span className="text-sm text-gray-700 leading-tight">{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}


