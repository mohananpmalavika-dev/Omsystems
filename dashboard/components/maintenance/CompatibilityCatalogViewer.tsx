"use client";

import React, { useState, useEffect } from "react";
import {
  Library,
  Server,
  Search,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  RefreshCw,
  Cpu,
  Layers,
  ChevronDown,
  Info,
} from "lucide-react";

export interface CompatibilityCatalogEntry {
  manufacturer: string;
  model: string;
  firmwareRange: string;
  observedCount: number;
  likelyApis: { family: string; probability: number }[];
  likelyCapabilities: Record<string, number>;
  lastObservedAt: string;
}

export function CompatibilityCatalogViewer() {
  const [catalog, setCatalog] = useState<CompatibilityCatalogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedMfr, setSelectedMfr] = useState<string>("ALL");

  useEffect(() => {
    loadCatalog();
  }, []);

  async function loadCatalog() {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/control/v1/compatibility/models", { credentials: "include" });
      if (!res.ok) throw new Error(`Failed to load catalog (${res.status})`);
      const json = await res.json();
      setCatalog(json.data ?? []);
    } catch (err: any) {
      setError(err?.message ?? "Error fetching compatibility catalog");
    } finally {
      setLoading(false);
    }
  }

  const manufacturers = ["ALL", ...Array.from(new Set(catalog.map((c) => c.manufacturer)))];

  const filtered = catalog.filter((entry) => {
    const matchesMfr = selectedMfr === "ALL" || entry.manufacturer === selectedMfr;
    const matchesSearch =
      entry.manufacturer.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.model.toLowerCase().includes(searchTerm.toLowerCase()) ||
      entry.firmwareRange.toLowerCase().includes(searchTerm.toLowerCase());
    return matchesMfr && matchesSearch;
  });

  return (
    <div className="space-y-6">
      {/* Header & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-white p-5 rounded-2xl border border-slate-200 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="p-3 bg-blue-50 text-blue-600 rounded-xl">
            <Library size={24} />
          </div>
          <div>
            <h3 className="text-base font-bold text-slate-900">Recorder Compatibility Catalog</h3>
            <p className="text-xs text-slate-500">
              Aggregated anonymous device profiles & empirical protocol distributions across your enterprise fleet.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search className="absolute left-3 top-2.5 text-slate-400" size={15} />
            <input
              type="text"
              placeholder="Filter model, vendor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9 pr-3 py-1.5 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-blue-500/20 w-48"
            />
          </div>

          <select
            value={selectedMfr}
            onChange={(e) => setSelectedMfr(e.target.value)}
            className="text-xs border border-slate-200 rounded-xl px-3 py-1.5 bg-slate-50 font-medium text-slate-700"
          >
            {manufacturers.map((m) => (
              <option key={m} value={m}>
                {m === "ALL" ? "All Vendors" : m}
              </option>
            ))}
          </select>

          <button
            onClick={loadCatalog}
            className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-xl border border-slate-200 transition"
            title="Refresh catalog"
          >
            <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
          </button>
        </div>
      </div>

      {loading && (
        <div className="flex items-center justify-center py-12 gap-3 text-slate-500 text-sm">
          <RefreshCw className="animate-spin text-blue-600" size={24} />
          <span>Loading catalog intelligence...</span>
        </div>
      )}

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-xl text-red-700 text-xs">
          {error}
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {filtered.map((entry, idx) => (
            <div
              key={idx}
              className="p-5 bg-white border border-slate-200 rounded-2xl shadow-sm hover:border-blue-300 transition space-y-4"
            >
              {/* Card Header */}
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[10px] font-bold rounded uppercase tracking-wider">
                      {entry.manufacturer}
                    </span>
                    <span className="text-xs text-slate-400">FW {entry.firmwareRange}</span>
                  </div>
                  <h4 className="text-base font-bold text-slate-900 mt-1">{entry.model}</h4>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-slate-900">{entry.observedCount}</span>
                  <span className="block text-[10px] text-slate-500 uppercase tracking-wider">Enrolled Fleet</span>
                </div>
              </div>

              {/* Likely Protocols */}
              <div className="space-y-1.5">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Empirical Protocol Compatibility
                </span>
                <div className="grid grid-cols-2 gap-2">
                  {entry.likelyApis.map((api) => (
                    <div
                      key={api.family}
                      className="flex items-center justify-between p-2 bg-slate-50 border border-slate-100 rounded-lg text-xs"
                    >
                      <span className="font-medium text-slate-700">{api.family.replace("_", " ")}</span>
                      <strong className="text-emerald-700 font-bold">{Math.round(api.probability * 100)}%</strong>
                    </div>
                  ))}
                </div>
              </div>

              {/* Capability Matrix Preview */}
              <div className="space-y-1.5 pt-2 border-t border-slate-100">
                <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                  Verified Capabilities
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(entry.likelyCapabilities).map(([cap, score]) => (
                    <span
                      key={cap}
                      className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                        score >= 0.85
                          ? "bg-emerald-50 text-emerald-800 border-emerald-200"
                          : score >= 0.5
                          ? "bg-amber-50 text-amber-800 border-amber-200"
                          : "bg-slate-50 text-slate-600 border-slate-200"
                      }`}
                    >
                      {formatCap(cap)} ({Math.round(score * 100)}%)
                    </span>
                  ))}
                </div>
              </div>
            </div>
          ))}

          {filtered.length === 0 && (
            <div className="col-span-2 p-12 bg-white rounded-2xl border border-dashed border-slate-300 text-center text-slate-500 text-xs">
              No matching model profiles found in the compatibility catalog.
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function formatCap(key: string): string {
  switch (key) {
    case "deviceInfo": return "Device Info";
    case "channels": return "Channels";
    case "liveStream": return "Live Stream";
    case "recordingStatus": return "Recording";
    case "playbackSearch": return "Archive Search";
    case "storageStatus": return "Storage";
    case "smartTelemetry": return "S.M.A.R.T.";
    case "deviceTime": return "Clock";
    case "events": return "Events";
    case "ptz": return "PTZ";
    default: return key;
  }
}
