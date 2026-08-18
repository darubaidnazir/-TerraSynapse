import React, { useState, useEffect } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Dashboard({ field, result, onReset }) {
  const [trends, setTrends] = useState([]);

  useEffect(() => {
    if (field?.field_id) {
      axios.get(`http://localhost:8000/api/fields/${field.field_id}/trends`)
        .then(res => {
          // Format data for recharts
          const chartData = res.data.map(run => {
            const date = run.acquisition_date || new Date(run.run_date).toISOString().split('T')[0];
            return {
              date: date,
              health: run.health_score_pct || 0,
              ndvi: run.indices?.ndvi?.mean || 0
            };
          });
          setTrends(chartData);
        })
        .catch(err => console.error("Error fetching trends", err));
    }
  }, [field]);

  if (!result) return null;

  const score = result.health_score_pct || 0;
  let scoreColor = "text-green-600";
  if (score < 50) scoreColor = "text-red-600";
  else if (score < 80) scoreColor = "text-yellow-600";

  return (
    <div className="min-h-screen bg-gray-50 p-6 overflow-auto">
      <div className="max-w-6xl mx-auto space-y-6 pb-12">
        
        {/* Header */}
        <div className="flex justify-between items-center bg-white p-6 rounded-lg shadow">
          <div>
            <h1 className="text-2xl font-bold text-gray-800">Field Analysis</h1>
            <p className="text-gray-500">Area: {field.area_ha?.toFixed(2)} ha</p>
          </div>
          <div className="text-right">
            <p className="text-sm text-gray-500 uppercase tracking-wide">Overall Health</p>
            <p className={`text-4xl font-extrabold ${scoreColor}`}>
              {score.toFixed(1)}%
            </p>
          </div>
                              <div className="flex space-x-2">
            <button 
              onClick={() => window.open(`http://localhost:8000/api/jobs/${result.job_id}/export?format=csv`)}
              className="px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700 text-sm font-bold"
            >
              CSV
            </button>
            <button 
              onClick={() => window.open(`http://localhost:8000/api/jobs/${result.job_id}/export?format=pdf`)}
              className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 text-sm font-bold"
            >
              PDF
            </button>
            <button 
              onClick={onReset}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-bold"
            >
              New Field
            </button>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Metrics Grid */}
          <div className="md:col-span-2 grid grid-cols-2 gap-4">
            {Object.entries(result.indices || {}).map(([key, data]) => {
              if (!data.mean) return null;
              
              let badgeColor = "bg-gray-200 text-gray-800";
              if (data.label === "poor") badgeColor = "bg-red-100 text-red-800";
              if (data.label === "moderate") badgeColor = "bg-yellow-100 text-yellow-800";
              if (data.label === "healthy") badgeColor = "bg-green-100 text-green-800";

              return (
                <div key={key} className="bg-white p-4 rounded-lg shadow border-l-4 border-blue-500">
                  <div className="flex justify-between items-start mb-2">
                    <h3 className="font-bold text-gray-700 uppercase">{key}</h3>
                    {data.label && (
                      <span className={`text-xs px-2 py-1 rounded-full uppercase font-bold ${badgeColor}`}>
                        {data.label}
                      </span>
                    )}
                  </div>
                  <p className="text-2xl font-semibold text-gray-900">
                    {data.mean.toFixed(3)} <span className="text-sm text-gray-500 font-normal">{data.unit}</span>
                  </p>
                  
                  {/* Data Source & Confidence */}
                  {data.source && (
                    <div className="mt-3 flex items-center justify-between text-[10px] font-semibold tracking-wide uppercase">
                      <span className="text-gray-400">Src: {data.source}</span>
                      {data.confidence && (
                        <span className={`px-1.5 py-0.5 rounded ${
                          data.confidence === 'High' ? 'bg-green-50 text-green-600' :
                          data.confidence === 'Moderate' ? 'bg-yellow-50 text-yellow-600' :
                          'bg-gray-100 text-gray-500'
                        }`}>
                          {data.confidence}
                        </span>
                      )}
                    </div>
                  )}

                  {data.needs_calibration && (
                    <p className="text-xs text-red-500 mt-2">* Default thresholds used</p>
                  )}
                </div>
              );
            })}
          </div>

          {/* Recommendations Panel */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">AI Recommendations</h2>
            <div className="space-y-4">
              {(result.recommendations || []).map((rec, i) => {
                let pColor = "bg-gray-100";
                if (rec.priority === "high") pColor = "bg-red-100 border-l-4 border-red-500";
                if (rec.priority === "medium") pColor = "bg-yellow-100 border-l-4 border-yellow-500";
                if (rec.priority === "low") pColor = "bg-green-100 border-l-4 border-green-500";

                return (
                  <div key={i} className={`p-3 rounded ${pColor}`}>
                    <div className="flex justify-between items-center mb-1">
                      <h4 className="font-bold text-sm text-gray-800">{rec.title}</h4>
                      <span className="text-[10px] uppercase tracking-wider text-gray-600 font-bold">{rec.priority}</span>
                    </div>
                    <p className="text-xs text-gray-700">{rec.description}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
        
        {/* Historical Trends Chart */}
        <div className="bg-white rounded-lg shadow p-6 w-full">
            <h2 className="text-lg font-bold text-gray-800 mb-4 border-b pb-2">Historical Trends</h2>
            <div className="h-64 w-full">
              {trends.length > 0 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trends} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" />
                    <XAxis dataKey="date" />
                    <YAxis yAxisId="left" domain={[0, 100]} />
                    <YAxis yAxisId="right" orientation="right" domain={[-1, 1]} />
                    <Tooltip />
                    <Legend />
                    <Line yAxisId="left" type="monotone" dataKey="health" stroke="#16a34a" name="Health Score %" activeDot={{ r: 8 }} />
                    <Line yAxisId="right" type="monotone" dataKey="ndvi" stroke="#2563eb" name="NDVI" />
                  </LineChart>
                </ResponsiveContainer>
              ) : (
                <div className="flex h-full items-center justify-center text-gray-400 italic">
                  No historical data available yet.
                </div>
              )}
            </div>
        </div>

      </div>
    </div>
  );
}



