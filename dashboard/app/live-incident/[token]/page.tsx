"use client";

import React, { useState, useEffect } from "react";
import { useParams } from "next/navigation";
import {
  ShieldAlert,
  MapPin,
  Clock,
  Radio,
  CheckCircle2,
  AlertTriangle,
  Send,
  Navigation,
  PhoneCall,
  Video,
} from "lucide-react";

export default function QrtLiveIncidentPage() {
  const params = useParams();
  const token = params?.token as string;

  const [incident, setIncident] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responderName, setResponderName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) return;
    const fetchIncident = async () => {
      try {
        const res = await fetch(`/api/control/v1/public/live-incident/${encodeURIComponent(token)}`);
        const data = await res.json();
        if (data.success && data.data) {
          setIncident(data.data);
          if (data.data.status === "ACKNOWLEDGED_ON_SCENE") {
            setAcknowledged(true);
          }
        } else {
          setError(data.message || "This QRT incident dispatch link has expired or is invalid.");
        }
      } catch (err: any) {
        setError("Failed to connect to Surveillance Command Center.");
      } finally {
        setLoading(false);
      }
    };
    fetchIncident();
  }, [token]);

  const handleAcknowledgeArrival = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!responderName.trim()) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/control/v1/public/live-incident/${encodeURIComponent(token)}/arrive`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ responderName: responderName.trim() }),
      });
      const data = await res.json();
      if (data.success) {
        setAcknowledged(true);
      }
    } catch {
      // ignore
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-6 space-y-4">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm font-mono">Securing Live Incident Stream...</p>
      </div>
    );
  }

  if (error || !incident) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-6 text-center">
        <div className="p-4 bg-rose-950/60 border border-rose-800/80 rounded-2xl max-w-md space-y-3">
          <AlertTriangle className="w-10 h-10 text-rose-400 mx-auto" />
          <h1 className="text-lg font-bold text-white">Incident Link Expired</h1>
          <p className="text-xs text-slate-400">
            {error || "This secure dispatch token has expired for security compliance. Please contact Headquarters."}
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-xl mx-auto border-x border-slate-800/80 shadow-2xl">
      {/* Header Banner */}
      <div className="p-4 bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 border-b border-rose-900/40 space-y-2">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="flex h-3 w-3 relative">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-rose-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-3 w-3 bg-rose-500"></span>
            </span>
            <span className="font-mono text-xs font-bold uppercase tracking-wider text-rose-300">
              QRT Live Dispatch
            </span>
          </div>
          <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white shadow-sm">
            {incident.severity} CRITICAL
          </span>
        </div>

        <h1 className="text-xl font-bold text-white tracking-tight">{incident.alertType.replaceAll("_", " ")}</h1>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <MapPin className="w-3.5 h-3.5 text-blue-400 shrink-0" />
          <span className="font-semibold text-slate-200">{incident.branchName}</span>
          <span>•</span>
          <span className="text-slate-400 text-[11px] truncate">{incident.branchAddress}</span>
        </div>
      </div>

      {/* Live Stream / Camera Viewport */}
      <div className="p-4 space-y-4 flex-1">
        <div className="relative aspect-video rounded-xl bg-black border border-slate-800 overflow-hidden shadow-xl flex items-center justify-center">
          <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-0.5 rounded bg-rose-950/80 border border-rose-600/60 text-rose-300 font-mono text-[10px] font-bold z-10">
            <Radio className="w-3 h-3 text-rose-400 animate-pulse" />
            <span>LIVE HO FEED</span>
          </div>

          {/* Fallback Simulated Live Feed Frame */}
          <div className="flex flex-col items-center justify-center text-slate-400 space-y-2">
            <Video className="w-10 h-10 text-slate-500 animate-pulse" />
            <div className="text-xs font-mono text-center">
              <div>Secure Encrypted RTSP Tunnel</div>
              <div className="text-[10px] text-slate-500">{incident.branchName} • Vault Main Camera</div>
            </div>
          </div>
        </div>

        {/* GPS Navigation and Action Bar */}
        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={`https://www.google.com/maps/search/?api=1&query=${incident.gpsCoordinates.lat},${incident.gpsCoordinates.lng}`}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-medium text-xs shadow-md transition-colors"
          >
            <Navigation className="w-4 h-4" />
            <span>Google Maps GPS</span>
          </a>

          <a
            href="tel:112"
            className="flex items-center justify-center gap-2 p-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-medium text-xs transition-colors"
          >
            <PhoneCall className="w-4 h-4 text-emerald-400" />
            <span>Emergency Police</span>
          </a>
        </div>

        {/* Responder Arrival Acknowledgement */}
        <div className="p-4 rounded-xl bg-slate-900/80 border border-slate-800 space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
              Field Responder Status
            </h2>
            {acknowledged ? (
              <span className="flex items-center gap-1 text-emerald-400 text-xs font-semibold">
                <CheckCircle2 className="w-3.5 h-3.5" />
                <span>On Scene Acknowledged</span>
              </span>
            ) : (
              <span className="text-amber-400 text-xs font-mono">En Route</span>
            )}
          </div>

          {acknowledged ? (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-emerald-200 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>Headquarters SOC notified of your on-site presence. Maintain perimeter containment.</span>
            </div>
          ) : (
            <form onSubmit={handleAcknowledgeArrival} className="space-y-2.5">
              <input
                type="text"
                value={responderName}
                onChange={(e) => setResponderName(e.target.value)}
                placeholder="Enter Guard Name / Unit ID (e.g. Officer Vinod - Unit 4)"
                required
                className="w-full px-3 py-2 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
              <button
                type="submit"
                disabled={submitting || !responderName.trim()}
                className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs shadow-md transition-colors flex items-center justify-center gap-2"
              >
                <CheckCircle2 className="w-4 h-4" />
                <span>{submitting ? "Updating SOC..." : "I Have Arrived on Scene"}</span>
              </button>
            </form>
          )}
        </div>
      </div>

      {/* Footer Audit Signature */}
      <div className="p-3 text-center text-[10px] text-slate-500 font-mono border-t border-slate-900">
        Sentinel Grid Enterprise SOC • Token valid until {new Date(incident.expiresAt).toLocaleTimeString()}
      </div>
    </div>
  );
}
