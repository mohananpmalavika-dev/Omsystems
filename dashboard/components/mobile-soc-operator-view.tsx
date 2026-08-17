"use client";

import React, { useState, useEffect } from "react";
import {
  ShieldAlert,
  AlertOctagon,
  PhoneCall,
  Video,
  CheckCircle2,
  AlertTriangle,
  Play,
  Pause,
  RotateCcw,
  Clock,
  Building2,
  ChevronRight,
  RefreshCw,
  Send,
  X,
  Radio,
  ArrowLeft,
  Flame,
  User,
  Shield,
  Activity,
  Navigation,
  FileText,
  Volume2,
} from "lucide-react";

export function MobileSocOperatorView() {
  const [homeData, setHomeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [activeTab, setActiveTab] = useState<"SNAPSHOT" | "CLIP" | "LIVE">("SNAPSHOT");
  const [clipPlaying, setClipPlaying] = useState(false);
  const [clipPosition, setClipPosition] = useState(15);
  const [customNote, setCustomNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);

  const fetchHomeData = async () => {
    try {
      const res = await fetch("/api/mobile/v1/home");
      const data = await res.json();
      if (data.success && data.data) {
        setHomeData(data.data);
        // If an incident was selected, update its state
        if (selectedIncident) {
          const updated = data.data.incidents.find((i: any) => i.id === selectedIncident.id);
          if (updated) setSelectedIncident(updated);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHomeData();
    const timer = setInterval(fetchHomeData, 4000);
    return () => clearInterval(timer);
  }, []);

  // Clip Player Scrubber simulation
  useEffect(() => {
    let interval: any;
    if (clipPlaying) {
      interval = setInterval(() => {
        setClipPosition((prev) => (prev >= 45 ? 0 : prev + 1));
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [clipPlaying]);

  const handleAcknowledge = async (incidentId: string) => {
    setActionLoading("ack");
    try {
      const res = await fetch(`/api/mobile/v1/incidents/${incidentId}/acknowledge`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg("✅ Incident acknowledged! SLA timer stopped.");
        await fetchHomeData();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleCallBranch = async (incidentId: string) => {
    setActionLoading("call");
    try {
      const res = await fetch(`/api/mobile/v1/incidents/${incidentId}/call-branch`, {
        method: "POST",
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg(`📞 Initiating call to ${data.managerName} (${data.phone})`);
        window.location.href = data.dialerUrl;
        await fetchHomeData();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddStructuredNote = async (incidentId: string, noteType: string, text?: string) => {
    setActionLoading(`note-${noteType}`);
    try {
      const res = await fetch(`/api/mobile/v1/incidents/${incidentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteType, text }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg(`📝 Timeline updated: ${data.message}`);
        setCustomNote("");
        await fetchHomeData();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  const handleEscalate = async (incidentId: string) => {
    setActionLoading("escalate");
    try {
      const res = await fetch(`/api/mobile/v1/incidents/${incidentId}/escalate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason: "Critical perimeter breach escalated from mobile PWA." }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg("🚨 Incident escalated to Regional Security Manager!");
        await fetchHomeData();
      }
    } catch {
      // ignore
    } finally {
      setActionLoading(null);
    }
  };

  if (loading && !homeData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-6 space-y-3">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono">Connecting to Mobile SOC Gateway...</p>
      </div>
    );
  }

  // ==========================================
  // SCREEN 2: INCIDENT ACTION SCREEN (MOBILE FIRST)
  // ==========================================
  if (selectedIncident) {
    const isAck = selectedIncident.acknowledged;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between max-w-md mx-auto border-x border-slate-800 shadow-2xl pb-6">
        {/* Mobile Header Bar */}
        <div className="p-4 bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 border-b border-rose-900/50 space-y-2 sticky top-0 z-40 backdrop-blur-md">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedIncident(null)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white font-mono p-1 rounded bg-slate-900/60 border border-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white shadow-sm flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
              {selectedIncident.severity} CRITICAL
            </span>
          </div>

          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">{selectedIncident.title}</h1>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono mt-0.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-bold text-slate-200">{selectedIncident.branch.name}</span>
              <span>•</span>
              <span className="text-slate-400">{selectedIncident.branch.code}</span>
            </div>
          </div>
        </div>

        {/* Media Viewport (Snapshot vs 45-Sec Clip vs WebRTC Live) */}
        <div className="p-4 space-y-4 flex-1">
          <div className="relative aspect-video rounded-xl bg-black border border-slate-800 overflow-hidden shadow-2xl flex flex-col justify-between">
            {/* Viewport Overlay Controls */}
            <div className="absolute top-2 left-2 right-2 flex items-center justify-between z-20">
              <div className="flex items-center gap-1 p-0.5 rounded-lg bg-slate-950/80 border border-slate-800 text-[10px] font-mono">
                <button
                  onClick={() => setActiveTab("SNAPSHOT")}
                  className={`px-2 py-1 rounded font-bold ${activeTab === "SNAPSHOT" ? "bg-rose-600 text-white" : "text-slate-400"}`}
                >
                  Snapshot
                </button>
                <button
                  onClick={() => setActiveTab("CLIP")}
                  className={`px-2 py-1 rounded font-bold ${activeTab === "CLIP" ? "bg-rose-600 text-white" : "text-slate-400"}`}
                >
                  45s Clip
                </button>
                <button
                  onClick={() => setActiveTab("LIVE")}
                  className={`px-2 py-1 rounded font-bold ${activeTab === "LIVE" ? "bg-rose-600 text-white" : "text-slate-400"}`}
                >
                  Live WebRTC
                </button>
              </div>

              <span className="px-2 py-0.5 rounded bg-slate-950/80 border border-slate-800 text-[10px] font-mono text-emerald-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                ONLINE
              </span>
            </div>

            {/* Media Content Display */}
            <div className="w-full h-full flex items-center justify-center bg-slate-950">
              {activeTab === "SNAPSHOT" && (
                <div className="flex flex-col items-center justify-center text-center p-4 space-y-2">
                  <div className="w-14 h-14 rounded-2xl bg-rose-950/60 border border-rose-800 flex items-center justify-center text-rose-400">
                    <ShieldAlert className="w-8 h-8" />
                  </div>
                  <div className="text-xs font-mono text-slate-300">
                    <div>Encrypted SHA-256 Vault Snapshot</div>
                    <div className="text-[10px] text-slate-500">Captured at {new Date(selectedIncident.occurredAt).toLocaleTimeString()}</div>
                  </div>
                </div>
              )}

              {activeTab === "CLIP" && (
                <div className="w-full h-full flex flex-col justify-between p-4 bg-slate-950/90 text-slate-300">
                  <div />
                  <div className="flex flex-col items-center justify-center space-y-2">
                    <button
                      onClick={() => setClipPlaying(!clipPlaying)}
                      className="w-12 h-12 rounded-full bg-rose-600 hover:bg-rose-500 text-white flex items-center justify-center shadow-lg transition-transform active:scale-95"
                    >
                      {clipPlaying ? <Pause className="w-6 h-6" /> : <Play className="w-6 h-6 ml-0.5" />}
                    </button>
                    <div className="text-xs font-mono">
                      -15s ➔ +30s Evidence Clip ({clipPosition}s / 45s)
                    </div>
                  </div>

                  {/* Scrubber Controls */}
                  <div className="space-y-1.5">
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div className="bg-rose-500 h-full transition-all" style={{ width: `${(clipPosition / 45) * 100}%` }} />
                    </div>
                    <div className="flex justify-between items-center text-[10px] font-mono text-slate-400">
                      <button onClick={() => setClipPosition((p) => Math.max(0, p - 10))} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        ⏪ -10s
                      </button>
                      <span>{selectedIncident.camera.name}</span>
                      <button onClick={() => setClipPosition((p) => Math.min(45, p + 10))} className="px-2 py-0.5 rounded bg-slate-900 border border-slate-800">
                        +10s ⏩
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {activeTab === "LIVE" && (
                <div className="flex flex-col items-center justify-center text-center p-4 space-y-2">
                  <Radio className="w-8 h-8 text-rose-500 animate-pulse" />
                  <div className="text-xs font-mono text-slate-300">
                    <div>Adaptive 720p WebRTC Substream</div>
                    <div className="text-[10px] text-slate-500">700 kbps • Privacy Redaction Active</div>
                  </div>
                </div>
              )}
            </div>

            {/* Bottom Stream Status */}
            <div className="p-2 bg-slate-950/80 border-t border-slate-900 flex justify-between items-center text-[10px] font-mono text-slate-400">
              <span>{selectedIncident.camera.name}</span>
              <span className="text-slate-300">SLA: {selectedIncident.slaRemainingSeconds}s</span>
            </div>
          </div>

          {/* Primary 1-Tap Operator Actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleAcknowledge(selectedIncident.id)}
              disabled={isAck || actionLoading === "ack"}
              className={`p-3 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition-all ${
                isAck
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isAck ? "Acknowledged" : "Acknowledge"}</span>
            </button>

            <button
              onClick={() => handleCallBranch(selectedIncident.id)}
              disabled={actionLoading === "call"}
              className="p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition-all"
            >
              <PhoneCall className="w-4 h-4" />
              <span>Call Branch</span>
            </button>

            <button
              onClick={() => handleEscalate(selectedIncident.id)}
              disabled={actionLoading === "escalate"}
              className="p-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition-all"
            >
              <AlertOctagon className="w-4 h-4" />
              <span>Escalate</span>
            </button>
          </div>

          {/* 1-Tap Structured Note Action Chips */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2.5">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              1-Tap Structured Classification & Notes
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { type: "FALSE_ALARM", label: "❌ False Alarm" },
                { type: "BRANCH_CONTACTED", label: "📞 Branch Contacted" },
                { type: "POLICE_CONTACTED", label: "🚓 Police 112" },
                { type: "SECURITY_DISPATCHED", label: "🛡️ QRT Dispatched" },
                { type: "PERSON_CONFIRMED", label: "👤 Person Confirmed" },
                { type: "MAINTENANCE_ACTIVITY", label: "🔧 Maintenance" },
              ].map((chip) => (
                <button
                  key={chip.type}
                  onClick={() => handleAddStructuredNote(selectedIncident.id, chip.type)}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-medium transition-all active:scale-95"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Custom text note */}
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Type additional note..."
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
              <button
                onClick={() => handleAddStructuredNote(selectedIncident.id, "CUSTOM_NOTE", customNote)}
                disabled={!customNote.trim()}
                className="px-3 py-1.5 rounded-lg bg-rose-600 disabled:bg-slate-800 text-white text-xs font-bold"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Immutable Incident Timeline */}
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-[11px] font-bold uppercase tracking-wider text-slate-400 font-mono">
              Audit Timeline & Actions
            </div>
            <div className="space-y-2 divide-y divide-slate-800/60 font-mono text-[11px]">
              {selectedIncident.timeline?.map((event: any, idx: number) => (
                <div key={idx} className="pt-2 first:pt-0 space-y-0.5">
                  <div className="flex justify-between text-slate-400 text-[10px]">
                    <span className="text-cyan-400 font-bold">{event.actor}</span>
                    <span>{new Date(event.timestamp).toLocaleTimeString()}</span>
                  </div>
                  <div className="text-slate-200">{event.message}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  }

  // ==========================================
  // SCREEN 1: MOBILE HOME SCREEN ("What requires attention right now?")
  // ==========================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 max-w-md mx-auto border-x border-slate-800 shadow-2xl pb-10 flex flex-col justify-between">
      <div className="space-y-4 p-4">
        {/* Top Shift & Operator Status */}
        <div className="p-3.5 rounded-2xl bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/30 border border-slate-800 flex items-center justify-between shadow-md">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-rose-950 border border-rose-800 flex items-center justify-center text-rose-400 font-bold text-xs">
              <User className="w-4 h-4" />
            </div>
            <div>
              <div className="text-xs font-bold text-white">{homeData?.operator?.name}</div>
              <div className="text-[10px] text-slate-400 font-mono">{homeData?.operator?.shift}</div>
            </div>
          </div>

          <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
            ON CALL
          </span>
        </div>

        {/* P1 Alerts Section Header */}
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2">
            <Flame className="w-4 h-4 text-rose-500" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-rose-400 font-mono">
              {homeData?.criticalIncidentCount || 2} Critical P1 Incidents
            </h2>
          </div>
          <span className="text-[10px] font-mono text-slate-400">
            {homeData?.unacknowledgedCount} Unacknowledged
          </span>
        </div>

        {/* P1 Incident Action Cards */}
        <div className="space-y-3">
          {homeData?.incidents?.map((incident: any) => (
            <div
              key={incident.id}
              onClick={() => setSelectedIncident(incident)}
              className="p-4 rounded-2xl bg-slate-900/90 border border-rose-900/60 hover:border-rose-500/80 shadow-lg cursor-pointer transition-all active:scale-[0.98] space-y-3"
            >
              <div className="flex items-center justify-between">
                <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-600 text-white">
                  P1 CRITICAL
                </span>
                <span className="text-[11px] font-mono text-rose-400 font-bold flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  <span>SLA: {incident.slaRemainingSeconds}s</span>
                </span>
              </div>

              <div>
                <h3 className="font-bold text-sm text-white">{incident.title}</h3>
                <div className="text-xs text-slate-300 font-mono mt-0.5">
                  {incident.branch.name} • <span className="text-slate-400">{incident.camera.name}</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-1 border-t border-slate-800/80">
                <span
                  className={`text-[10px] font-mono font-bold ${
                    incident.acknowledged ? "text-emerald-400" : "text-amber-400 animate-pulse"
                  }`}
                >
                  {incident.acknowledged ? "✓ Acknowledged" : "⚠️ UNACKNOWLEDGED"}
                </span>

                <button className="px-3 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center gap-1 shadow-md">
                  <span>View Incident</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>

        {/* Compact Branch Health Overview Card */}
        <div className="p-4 rounded-2xl bg-slate-900/90 border border-slate-800 space-y-3 shadow-md">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
              <Activity className="w-4 h-4 text-blue-400" />
              <span>400-Branch Health Summary</span>
            </h3>
            <span className="text-[10px] font-mono text-slate-400">Real-time</span>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center font-mono">
            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">Healthy</div>
              <div className="text-base font-bold text-emerald-400">{homeData?.branchHealthSummary?.healthy || 374}</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">Warning</div>
              <div className="text-base font-bold text-amber-400">{homeData?.branchHealthSummary?.warning || 18}</div>
            </div>

            <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
              <div className="text-[10px] text-slate-400">Critical</div>
              <div className="text-base font-bold text-rose-400">{homeData?.branchHealthSummary?.critical || 8}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Footer Branding */}
      <div className="p-3 text-center text-[10px] text-slate-500 font-mono border-t border-slate-900">
        Sentinel Grid Mobile PWA • Milestone/Nx Class Emergency Response Surface
      </div>
    </div>
  );
}
