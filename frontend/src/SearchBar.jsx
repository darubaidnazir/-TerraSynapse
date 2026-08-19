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
    <div className="w-full">
      <div className="relative">
        <div className="absolute inset-y-0 left-0 pl-4 flex items-center pointer-events-none">
          <Search className="h-6 w-6 text-gray-400" />
        </div>
        <input 
          type="text" 
          value={query} 
          onChange={handleChange} 
          placeholder="Type a village or city name..." 
          className="w-full bg-gray-100 border border-gray-300 focus:border-blue-500 focus:ring-2 focus:ring-blue-200 transition-all p-4 pl-12 rounded-xl text-lg font-medium outline-none text-gray-800 shadow-sm"
        />
      </div>
      {results.length > 0 && (
        <ul className="mt-3 max-h-64 overflow-y-auto bg-white border border-gray-200 rounded-xl shadow-lg">
          {results.map(r => (
            <li 
              key={r.place_id} 
              onClick={() => {
                onSelect(parseFloat(r.lon), parseFloat(r.lat));
                setResults([]);
                setQuery(r.display_name.split(',')[0]);
              }}
              className="p-4 border-b last:border-0 border-gray-100 cursor-pointer active:bg-gray-50 transition-colors flex items-center gap-3"
            >
              <MapPin className="w-5 h-5 text-gray-400 shrink-0" />
              <span className="text-base font-medium text-gray-700">{r.display_name}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
