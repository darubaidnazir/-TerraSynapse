import React, { useState, useEffect } from "react";
import axios from "axios";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";

export default function Dashboard({ field, result, onReset }) {
  const [trends, setTrends] = useState([]);

  useEffect(() => {
    if (field?.field_id) {
      axios.get(`http://${window.location.hostname}:8000/api/fields/${field.field_id}/trends`)
        .then(res => {
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
  let scoreBg = "bg-green-100 border-green-300";
  let scoreMessage = "Looking Good!";
  
  if (score < 50) {
    scoreColor = "text-red-600";
    scoreBg = "bg-red-100 border-red-300";
    scoreMessage = "Needs Attention";
  } else if (score < 80) {
    scoreColor = "text-yellow-600";
    scoreBg = "bg-yellow-100 border-yellow-300";
    scoreMessage = "Fair Condition";
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Header */}
      <header className="bg-green-800 text-white p-4 shadow-md flex justify-between items-center sticky top-0 z-20 h-16">
        <h1 className="text-xl font-bold">Field Analysis</h1>
        <button 
          onClick={onReset}
          className="px-4 py-2 bg-white text-green-800 rounded-lg font-bold text-sm shadow active:scale-95"
        >
          Back to Map
        </button>
      </header>

      <div className="flex-1 overflow-auto p-4 pb-20 space-y-6">
        
        {/* Massive Health Score Card */}
        <div className={`rounded-2xl shadow-lg border-2 p-6 text-center ${scoreBg}`}>
          <p className="text-gray-600 font-bold uppercase tracking-wider text-sm mb-2">Overall Crop Health</p>
          <div className={`text-7xl font-extrabold ${scoreColor}`}>
            {score.toFixed(0)}<span className="text-4xl">%</span>
          </div>
          <p className={`text-xl font-bold mt-2 ${scoreColor}`}>{scoreMessage}</p>
          <p className="text-gray-500 text-sm mt-3">Area: {field.area_ha?.toFixed(2)} ha</p>
        </div>

        {/* AI Recommendations - Front and Center */}
        <div className="bg-white rounded-2xl shadow border border-gray-100 p-5">
          <h2 className="text-xl font-extrabold text-gray-800 mb-4 flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-blue-500"><path d="M12 2v4"></path><path d="m16.2 7.8 2.9-2.9"></path><path d="M18 12h4"></path><path d="m16.2 16.2 2.9 2.9"></path><path d="M12 18v4"></path><path d="m4.9 19.1 2.9-2.9"></path><path d="M2 12h4"></path><path d="m4.9 4.9 2.9 2.9"></path></svg>
            What Should I Do?
          </h2>
          <div className="space-y-4">
            {(result.recommendations || []).map((rec, i) => {
              let pColor = "bg-gray-100 border-gray-300";
              let icon = "💡";
              if (rec.priority === "high") {
                pColor = "bg-red-50 border-red-300";
                icon = "🚨";
              }
              if (rec.priority === "medium") {
                pColor = "bg-yellow-50 border-yellow-300";
                icon = "⚠️";
              }
              if (rec.priority === "low") {
                pColor = "bg-green-50 border-green-300";
                icon = "✅";
              }

              return (
                <div key={i} className={`p-4 rounded-xl border-l-4 ${pColor}`}>
                  <h4 className="font-bold text-lg text-gray-900 flex items-start gap-2 mb-2">
                    <span>{icon}</span> {rec.title}
                  </h4>
                  <p className="text-base text-gray-700 leading-relaxed ml-7">{rec.description}</p>
                </div>
              );
            })}
          </div>
        </div>

        {/* Advanced Scientific Data - Hidden by default */}
        <details className="bg-white rounded-2xl shadow border border-gray-100 group">
          <summary className="font-bold text-gray-700 cursor-pointer list-none flex items-center justify-between p-5">
            View Advanced Scientific Data
            <span className="transition group-open:rotate-180">
              <svg fill="none" height="24" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" viewBox="0 0 24 24" width="24"><path d="M6 9l6 6 6-6"></path></svg>
            </span>
          </summary>
          
          <div className="p-5 pt-0 border-t border-gray-100 mt-2 space-y-6">
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(result.indices || {}).map(([key, data]) => {
                if (!data.mean) return null;
                
                let badgeColor = "text-gray-500";
                if (data.label === "poor") badgeColor = "text-red-500";
                if (data.label === "moderate") badgeColor = "text-yellow-600";
                if (data.label === "healthy") badgeColor = "text-green-500";

                return (
                  <div key={key} className="bg-gray-50 p-3 rounded-xl border border-gray-200">
                    <h3 className="font-bold text-gray-600 uppercase text-xs mb-1">{key}</h3>
                    <p className={`text-lg font-bold ${badgeColor}`}>
                      {data.mean.toFixed(2)} <span className="text-xs text-gray-400 font-normal">{data.unit}</span>
                    </p>
                  </div>
                );
              })}
            </div>
            
            <div>
              <h3 className="font-bold text-gray-700 mb-3">Historical Trends</h3>
              <div className="h-48 w-full bg-gray-50 rounded-xl p-2 border border-gray-200">
                {trends.length > 0 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={trends} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
                      <CartesianGrid strokeDasharray="3 3" vertical={false} />
                      <XAxis dataKey="date" tick={{fontSize: 10}} />
                      <YAxis yAxisId="left" domain={[0, 100]} tick={{fontSize: 10}} />
                      <Tooltip />
                      <Line yAxisId="left" type="monotone" dataKey="health" stroke="#16a34a" strokeWidth={3} dot={{ r: 4 }} />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="flex h-full items-center justify-center text-gray-400 text-sm italic">
                    No historical data available.
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex gap-2 pt-2">
              <button 
                onClick={() => window.open(`http://${window.location.hostname}:8000/api/jobs/${result.job_id}/export?format=pdf`)}
                className="flex-1 py-3 bg-gray-800 text-white rounded-xl font-bold text-sm text-center"
              >
                Download PDF Report
              </button>
            </div>
          </div>
        </details>
        
        <div className="mt-8 text-center text-sm text-gray-400 font-medium pb-8">
          Built with ❤️ by Dar Ubaid Nazir
        </div>
      </div>
    </div>
  );
}
