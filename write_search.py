import sys

content = '''import React, { useState } from "react";
import axios from "axios";

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
      const res = await axios.get(\https://nominatim.openstreetmap.org/search?q=\&format=json&limit=5\, {
        headers: { "User-Agent": "TerraSynapse/1.0" }
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
    <div className="bg-white p-3 rounded shadow-md w-full">
      <h2 className="text-sm font-bold mb-2">Search Location</h2>
      <input 
        type="text" 
        value={query} 
        onChange={handleChange} 
        placeholder="Village, City..." 
        className="w-full border p-2 rounded"
      />
      {results.length > 0 && (
        <ul className="mt-2 max-h-40 overflow-y-auto border-t">
          {results.map(r => (
            <li 
              key={r.place_id} 
              onClick={() => {
                onSelect(parseFloat(r.lon), parseFloat(r.lat));
                setResults([]);
                setQuery(r.display_name);
              }}
              className="p-2 border-b cursor-pointer hover:bg-gray-100 text-sm"
            >
              {r.display_name}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
'''
with open('frontend/src/SearchBar.jsx', 'w', encoding='utf-8') as f:
    f.write(content)
