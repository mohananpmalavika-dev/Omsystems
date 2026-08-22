"use client";

/**
 * Sentinel Grid Mobile Command Center
 * Production-ready mobile operations interface
 */

import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  ShieldAlert,
  AlertOctagon,
  PhoneCall,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Building2,
  ChevronRight,
  Send,
  ArrowLeft,
  Flame,
  User,
  Activity,
  MapPin,
  Users,
  TrendingUp,
  Zap,
  Bell,
  BellOff,
  Wifi,
  WifiOff,
  Search,
  Home,
  List,
  Settings,
  Eye,
  Video,
  FileText,
  MoreVertical,
} from "lucide-react";

interface ConnectionState {
  status: "connected" | "connecting" | "disconnected" | "stale";
  lastUpdate: Date | null;
  error?: string;
}

type BottomNavTab = "home" | "alerts" | "incidents" | "more";

export function MobileCommandCenter() {
  // ============ STATE ============
  const [homeData, setHomeData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [selectedIncident, setSelectedIncident] = useState<any | null>(null);
  const [customNote, setCustomNote] = useState("");
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [toastMsg, setToastMsg] = useState<string | null>(null);
  const [connectionState, setConnectionState] = useState<ConnectionState>({
    status: "disconnected",
    lastUpdate: null,
  });
  const [bottomTab, setBottomTab] = useState<BottomNavTab>("home");
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  
  const sseRef = useRef<EventSource | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // ============ REAL-TIME SSE CONNECTION ============
  
  const connectSSE = useCallback(() => {
    if (sseRef.current) {
      sseRef.current.close();
    }

    setConnectionState({ status: "connecting", lastUpdate: null });

    const eventSource = new EventSource("/api/mobile/v1/events");
    sseRef.current = eventSource;

    eventSource.addEventListener("HEARTBEAT", (e) => {
      const data = JSON.parse(e.data);
      setConnectionState({
        status: "connected",
        lastUpdate: new Date(data.timestamp),
      });
    });

    eventSource.addEventListener("ALERT_CREATED", (e) => {
      const event = JSON.parse(e.data);
      console.log("[MobileCommand] New alert:", event);
      
      // Show toast notification
      if (event.priority === "HIGH") {
        setToastMsg(`🚨 NEW P1 ALERT: ${event.payload.branch?.name || "Unknown branch"}`);
      }
      
      // Refresh home data
      fetchHomeData();
    });

    eventSource.addEventListener("ALERT_ACKNOWLEDGED", (e) => {
      const event = JSON.parse(e.data);
      console.log("[MobileCommand] Alert acknowledged:", event);
      fetchHomeData();
    });

    eventSource.addEventListener("SLA_WARNING", (e) => {
      const event = JSON.parse(e.data);
      setToastMsg(`⏰ SLA WARNING: ${event.payload.remainingSeconds}s remaining`);
    });

    eventSource.addEventListener("SLA_BREACHED", (e) => {
      const event = JSON.parse(e.data);
      setToastMsg(`🔴 SLA BREACHED: Alert requires immediate attention`);
      fetchHomeData();
    });

    eventSource.addEventListener("OPERATOR_ASSIGNED", (e) => {
      const event = JSON.parse(e.data);
      setToastMsg(`📋 ${event.payload.message}`);
      fetchHomeData();
    });

    eventSource.onerror = () => {
      setConnectionState({
        status: "disconnected",
        lastUpdate: null,
        error: "Connection lost",
      });
      
      // Attempt reconnection
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
      
      reconnectTimeoutRef.current = setTimeout(() => {
        console.log("[MobileCommand] Attempting to reconnect SSE...");
        connectSSE();
      }, 5000);
    };

    eventSource.onopen = () => {
      console.log("[MobileCommand] SSE connection established");
    };
  }, []);

  useEffect(() => {
    connectSSE();

    return () => {
      if (sseRef.current) {
        sseRef.current.close();
      }
      if (reconnectTimeoutRef.current) {
        clearTimeout(reconnectTimeoutRef.current);
      }
    };
  }, [connectSSE]);

  // ============ DATA FETCHING ============

  const fetchHomeData = async () => {
    try {
      const res = await fetch("/api/mobile/v1/home");
      const data = await res.json();
      if (data.success && data.data) {
        setHomeData(data.data);
        
        // Update selected incident if viewing one
        if (selectedIncident) {
          const updated = data.data.incidents.find((i: any) => i.id === selectedIncident.id);
          if (updated) {
            setSelectedIncident(updated);
          }
        }
      }
    } catch (error) {
      console.error("[MobileCommand] Error fetching home data:", error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHomeData();
    // Polling as backup to SSE
    const timer = setInterval(fetchHomeData, 30000);
    return () => clearInterval(timer);
  }, []);

  // ============ INCIDENT ACTIONS ============

  const handleAcknowledge = async (incidentId: string) => {
    setActionLoading("ack");
    try {
      const res = await fetch(`/api/mobile/v1/incidents/${incidentId}/acknowledge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ deviceId: navigator.userAgent }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg("✅ Incident acknowledged! SLA timer stopped.");
        await fetchHomeData();
      } else {
        setToastMsg(`❌ ${data.message || "Failed to acknowledge"}`);
      }
    } catch (error) {
      setToastMsg("❌ Network error");
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
        setToastMsg(`📞 Calling ${data.managerName || "branch"}...`);
        window.location.href = data.dialerUrl;
      }
    } catch (error) {
      setToastMsg("❌ Failed to initiate call");
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
        body: JSON.stringify({
          reason: "Critical incident escalated from mobile command center",
        }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg("🚨 Incident escalated to supervisor");
        await fetchHomeData();
      }
    } catch (error) {
      setToastMsg("❌ Failed to escalate");
    } finally {
      setActionLoading(null);
    }
  };

  const handleAddNote = async (incidentId: string, noteType: string, text?: string) => {
    setActionLoading(`note-${noteType}`);
    try {
      const res = await fetch(`/api/mobile/v1/incidents/${incidentId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ noteType, text }),
      });
      const data = await res.json();
      if (data.success) {
        setToastMsg(`📝 ${data.message}`);
        setCustomNote("");
        await fetchHomeData();
      }
    } catch (error) {
      setToastMsg("❌ Failed to add note");
    } finally {
      setActionLoading(null);
    }
  };

  // ============ AUTO-DISMISS TOAST ============

  useEffect(() => {
    if (toastMsg) {
      const timer = setTimeout(() => setToastMsg(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [toastMsg]);

  // ============ CONNECTION STATUS INDICATOR ============

  const ConnectionIndicator = () => {
    const getStatusColor = () => {
      switch (connectionState.status) {
        case "connected": return "bg-emerald-500";
        case "connecting": return "bg-yellow-500 animate-pulse";
        case "stale": return "bg-orange-500";
        case "disconnected": return "bg-red-500";
      }
    };

    const getStatusText = () => {
      if (connectionState.status === "connected" && connectionState.lastUpdate) {
        const secondsAgo = Math.floor((Date.now() - connectionState.lastUpdate.getTime()) / 1000);
        if (secondsAgo < 30) {
          return "LIVE";
        } else {
          return `STALE ${secondsAgo}s`;
        }
      }
      return connectionState.status.toUpperCase();
    };

    return (
      <div className="flex items-center gap-1.5 px-2 py-0.5 rounded-full bg-slate-900/80 border border-slate-800 text-[10px] font-mono">
        <span className={`w-1.5 h-1.5 rounded-full ${getStatusColor()}`} />
        <span className="text-slate-300">{getStatusText()}</span>
      </div>
    );
  };

  // ============ LOADING STATE ============

  if (loading && !homeData) {
    return (
      <div className="min-h-screen bg-slate-950 flex flex-col items-center justify-center text-slate-300 p-6 space-y-3">
        <div className="w-10 h-10 border-4 border-rose-500 border-t-transparent rounded-full animate-spin" />
        <p className="text-xs font-mono">Connecting to Mobile Command...</p>
      </div>
    );
  }

  // ============ INCIDENT DETAIL VIEW ============

  if (selectedIncident) {
    const isAck = selectedIncident.acknowledged;
    const slaExpired = selectedIncident.slaRemainingSeconds <= 0;

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col max-w-md mx-auto border-x border-slate-800 shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-50 p-4 bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 border-b border-rose-900/50 backdrop-blur-md space-y-2">
          <div className="flex items-center justify-between">
            <button
              onClick={() => setSelectedIncident(null)}
              className="flex items-center gap-1 text-xs text-slate-400 hover:text-white font-mono px-2 py-1 rounded bg-slate-900/60 border border-slate-800"
            >
              <ArrowLeft className="w-4 h-4" />
              Back
            </button>

            <div className="flex items-center gap-2">
              <ConnectionIndicator />
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold bg-rose-600 text-white shadow-sm flex items-center gap-1.5">
                <span className="w-2 h-2 rounded-full bg-white animate-pulse" />
                {selectedIncident.severity}
              </span>
            </div>
          </div>

          <div>
            <h1 className="text-lg font-bold text-white tracking-tight">{selectedIncident.title}</h1>
            <div className="flex items-center gap-1.5 text-xs text-slate-300 font-mono mt-0.5">
              <Building2 className="w-3.5 h-3.5 text-blue-400" />
              <span className="font-bold text-slate-200">{selectedIncident.branch.name}</span>
              <span>•</span>
              <span className="text-slate-400">{selectedIncident.branch.code}</span>
            </div>
            {selectedIncident.camera && (
              <div className="text-xs text-slate-400 mt-1">
                📹 {selectedIncident.camera.name}
              </div>
            )}
          </div>

          {/* SLA Status */}
          <div className={`p-2 rounded-lg ${slaExpired ? "bg-red-950/50 border border-red-800" : "bg-slate-900/50"}`}>
            <div className="flex items-center justify-between text-xs font-mono">
              <span className="text-slate-400">SLA</span>
              <span className={slaExpired ? "text-red-400 font-bold" : "text-slate-300"}>
                {slaExpired ? "BREACHED" : `${selectedIncident.slaRemainingSeconds}s remaining`}
              </span>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 pb-20">
          {/* Primary Actions */}
          <div className="grid grid-cols-3 gap-2">
            <button
              onClick={() => handleAcknowledge(selectedIncident.id)}
              disabled={isAck || actionLoading === "ack"}
              className={`p-3 rounded-xl font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition-all ${
                isAck
                  ? "bg-emerald-950 text-emerald-300 border border-emerald-800"
                  : "bg-emerald-600 hover:bg-emerald-500 text-white active:scale-95"
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              {isAck ? "Acknowledged" : "Acknowledge"}
            </button>

            <button
              onClick={() => handleCallBranch(selectedIncident.id)}
              disabled={actionLoading === "call"}
              className="p-3 rounded-xl bg-blue-600 hover:bg-blue-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition-all active:scale-95"
            >
              <PhoneCall className="w-4 h-4" />
              Call Branch
            </button>

            <button
              onClick={() => handleEscalate(selectedIncident.id)}
              disabled={actionLoading === "escalate"}
              className="p-3 rounded-xl bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex flex-col items-center justify-center gap-1 shadow-md transition-all active:scale-95"
            >
              <AlertOctagon className="w-4 h-4" />
              Escalate
            </button>
          </div>

          {/* Evidence */}
          {(selectedIncident.snapshotUrl || selectedIncident.clipUrl || selectedIncident.camera) && (
            <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
                Evidence & Live View
              </div>
              <div className="grid grid-cols-2 gap-2">
                {selectedIncident.snapshotUrl && (
                  <button className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5">
                    <Eye className="w-3.5 h-3.5" />
                    Snapshot
                  </button>
                )}
                {selectedIncident.clipUrl && (
                  <button className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5">
                    <Video className="w-3.5 h-3.5" />
                    45s Clip
                  </button>
                )}
                {selectedIncident.camera && (
                  <button className="px-3 py-2 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-xs font-medium flex items-center gap-1.5">
                    <Activity className="w-3.5 h-3.5 text-rose-500" />
                    Live View
                  </button>
                )}
              </div>
            </div>
          )}

          {/* AI Diagnosis */}
          {selectedIncident.aiConfidence && (
            <div className="p-3 rounded-xl bg-blue-950/30 border border-blue-900/50 space-y-2">
              <div className="text-xs font-bold uppercase tracking-wider text-blue-400 font-mono flex items-center gap-1.5">
                <Zap className="w-3.5 h-3.5" />
                AI Analysis
              </div>
              <div className="text-xs text-slate-300">
                <div className="flex justify-between mb-1">
                  <span className="text-slate-400">Confidence</span>
                  <span className="font-bold">{selectedIncident.aiConfidence}%</span>
                </div>
                {selectedIncident.aiDiagnosis && (
                  <p className="text-slate-400 mt-2">{selectedIncident.aiDiagnosis}</p>
                )}
              </div>
            </div>
          )}

          {/* Quick Action Chips */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
              Quick Actions
            </div>
            <div className="flex flex-wrap gap-1.5">
              {[
                { type: "FALSE_ALARM", label: "❌ False Alarm" },
                { type: "BRANCH_CONTACTED", label: "📞 Branch Contacted" },
                { type: "POLICE_CONTACTED", label: "🚓 Police (112)" },
                { type: "SECURITY_DISPATCHED", label: "🛡️ QRT Dispatched" },
                { type: "PERSON_CONFIRMED", label: "👤 Person Confirmed" },
                { type: "MAINTENANCE_ACTIVITY", label: "🔧 Maintenance" },
              ].map((chip) => (
                <button
                  key={chip.type}
                  onClick={() => handleAddNote(selectedIncident.id, chip.type)}
                  disabled={actionLoading === `note-${chip.type}`}
                  className="px-2.5 py-1.5 rounded-lg bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 text-[11px] font-medium transition-all active:scale-95 disabled:opacity-50"
                >
                  {chip.label}
                </button>
              ))}
            </div>

            {/* Custom Note */}
            <div className="flex gap-1.5 pt-1">
              <input
                type="text"
                value={customNote}
                onChange={(e) => setCustomNote(e.target.value)}
                placeholder="Add custom note..."
                className="flex-1 px-3 py-1.5 bg-slate-950 border border-slate-800 rounded-lg text-xs text-slate-200 focus:outline-none focus:border-rose-500"
              />
              <button
                onClick={() => handleAddNote(selectedIncident.id, "CUSTOM_NOTE", customNote)}
                disabled={!customNote.trim()}
                className="px-3 py-1.5 rounded-lg bg-rose-600 disabled:bg-slate-800 text-white text-xs font-bold active:scale-95"
              >
                <Send className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {/* Timeline */}
          <div className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="text-xs font-bold uppercase tracking-wider text-slate-400 font-mono">
              Incident Timeline
            </div>
            <div className="space-y-2 font-mono text-[11px]">
              {selectedIncident.timeline?.map((event: any, idx: number) => (
                <div key={idx} className="p-2 rounded bg-slate-950/60 border border-slate-800/60 space-y-0.5">
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

        {/* Toast */}
        {toastMsg && (
          <div className="fixed top-20 left-1/2 transform -translate-x-1/2 z-50 px-4 py-2 bg-slate-900 border border-slate-700 rounded-lg shadow-lg text-sm text-white font-mono animate-in fade-in slide-in-from-top">
            {toastMsg}
          </div>
        )}
      </div>
    );
  }

  // ============ HOME DASHBOARD ============

  const p1Count = homeData?.incidents?.filter((i: any) => i.severity === "P1").length || 0;

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 max-w-md mx-auto border-x border-slate-800 shadow-2xl flex flex-col">
      {/* Header */}
      <div className="sticky top-0 z-40 p-4 bg-gradient-to-r from-slate-900 via-slate-900 to-rose-950/30 border-b border-slate-800 backdrop-blur-md space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-bold text-white">Mobile Command</h1>
            <p className="text-[10px] text-slate-400 font-mono">Real-time operations center</p>
          </div>
          <ConnectionIndicator />
        </div>

        {/* Critical P1 Badge */}
        {p1Count > 0 && (
          <div className="p-2 rounded-lg bg-rose-950/50 border border-rose-800 flex items-center justify-between">
            <span className="text-xs font-bold text-rose-400 flex items-center gap-1.5">
              <Flame className="w-4 h-4" />
              {p1Count} CRITICAL P1
            </span>
            <span className="text-xs text-rose-300 font-mono">
              {homeData?.unacknowledgedCount || 0} unack
            </span>
          </div>
        )}

        {/* Search Bar */}
        {showSearch && (
          <div className="flex gap-2">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search branch, camera, incident..."
              className="flex-1 px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-rose-500"
              autoFocus
            />
            <button
              onClick={() => setShowSearch(false)}
              className="px-3 py-2 bg-slate-900 border border-slate-800 rounded-lg text-slate-400 hover:text-white"
            >
              ✕
            </button>
          </div>
        )}
        {!showSearch && (
          <button
            onClick={() => setShowSearch(true)}
            className="w-full px-3 py-2 bg-slate-900/60 border border-slate-800 rounded-lg text-sm text-slate-400 flex items-center gap-2"
          >
            <Search className="w-4 h-4" />
            Search branch, camera, incident...
          </button>
        )}
      </div>

      {/* Main Content - Scrollable */}
      <div className="flex-1 overflow-y-auto pb-20">
        {bottomTab === "home" && (
          <div className="p-4 space-y-4">
            {/* Operator Status */}
            <div className="p-3 rounded-xl bg-slate-900/90 border border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-rose-950 border border-rose-800 flex items-center justify-center">
                  <User className="w-4 h-4 text-rose-400" />
                </div>
                <div>
                  <div className="text-xs font-bold text-white">{homeData?.operator?.name || "Operator"}</div>
                  <div className="text-[10px] text-slate-400 font-mono">{homeData?.operator?.shift || "Active"}</div>
                </div>
              </div>
              {homeData?.operator?.onCall && (
                <span className="px-2.5 py-1 rounded-full text-[10px] font-mono font-bold bg-emerald-950 text-emerald-300 border border-emerald-800 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  ON CALL
                </span>
              )}
            </div>

            {/* P1 Incidents */}
            {homeData?.incidents && homeData.incidents.length > 0 && (
              <div className="space-y-3">
                {homeData.incidents.map((incident: any) => (
                  <div
                    key={incident.id}
                    onClick={() => setSelectedIncident(incident)}
                    className="p-4 rounded-xl bg-slate-900/90 border border-rose-900/60 hover:border-rose-500/80 shadow-lg cursor-pointer transition-all active:scale-[0.98] space-y-3"
                  >
                    <div className="flex items-center justify-between">
                      <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-600 text-white">
                        {incident.severity}
                      </span>
                      <span className="text-[11px] font-mono text-rose-400 font-bold flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {incident.slaRemainingSeconds <= 0 ? "BREACHED" : `${incident.slaRemainingSeconds}s`}
                      </span>
                    </div>

                    <div>
                      <h3 className="font-bold text-sm text-white">{incident.title}</h3>
                      <div className="text-xs text-slate-300 font-mono mt-0.5">
                        {incident.branch.name} • <span className="text-slate-400">{incident.camera?.name || "No camera"}</span>
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
                        View
                        <ChevronRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* No Incidents - All Clear */}
            {homeData?.incidents?.length === 0 && (
              <div className="p-6 rounded-xl bg-emerald-950/20 border border-emerald-900/30 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-950/60 border border-emerald-800 flex items-center justify-center mx-auto">
                  <CheckCircle2 className="w-6 h-6 text-emerald-400" />
                </div>
                <div className="text-sm font-bold text-emerald-400">ALL CLEAR</div>
                <p className="text-xs text-slate-400">No critical incidents require attention</p>
                <div className="pt-2 text-xs text-slate-500 font-mono space-y-0.5">
                  <div>{homeData?.branchHealthSummary?.total || 0} branches monitored</div>
                  <div>Last update: {homeData?.lastUpdated ? new Date(homeData.lastUpdated).toLocaleTimeString() : "—"}</div>
                </div>
              </div>
            )}

            {/* Fleet Health */}
            <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Fleet Health
                </h3>
                <span className="text-[10px] font-mono text-slate-500">{homeData?.branchHealthSummary?.total || 0} branches</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center font-mono">
                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Healthy</div>
                  <div className="text-base font-bold text-emerald-400">{homeData?.branchHealthSummary?.healthy || 0}</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Warning</div>
                  <div className="text-base font-bold text-amber-400">{homeData?.branchHealthSummary?.warning || 0}</div>
                </div>

                <div className="p-2.5 rounded-xl bg-slate-950 border border-slate-800">
                  <div className="text-[10px] text-slate-400">Critical</div>
                  <div className="text-base font-bold text-rose-400">{homeData?.branchHealthSummary?.critical || 0}</div>
                </div>
              </div>
            </div>

            {/* My Incidents */}
            {homeData?.myIncidentsCount > 0 && (
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                  <Users className="w-4 h-4 text-purple-400" />
                  My Incidents
                </h3>
                <div className="text-2xl font-bold text-purple-400">{homeData.myIncidentsCount}</div>
                <p className="text-xs text-slate-400">Assigned to you</p>
                <button className="w-full mt-2 px-3 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-xs font-bold">
                  View All
                </button>
              </div>
            )}

            {/* Predicted Risks */}
            {homeData?.predictedRisks && homeData.predictedRisks.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                  <TrendingUp className="w-4 h-4 text-orange-400" />
                  Predicted Risks
                </h3>
                {homeData.predictedRisks.map((risk: any, idx: number) => (
                  <div key={idx} className="p-3 rounded-lg bg-orange-950/20 border border-orange-900/30 space-y-1">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-bold text-orange-400">{risk.branchName}</span>
                      <span className="text-xs font-mono text-orange-300">{risk.probability}%</span>
                    </div>
                    <p className="text-xs text-slate-400">{risk.riskType}</p>
                    <p className="text-[10px] text-slate-500">{risk.timeframe}</p>
                  </div>
                ))}
              </div>
            )}

            {/* Live Events Feed */}
            {homeData?.liveEvents && homeData.liveEvents.length > 0 && (
              <div className="p-4 rounded-xl bg-slate-900/90 border border-slate-800 space-y-2">
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-300 font-mono flex items-center gap-2">
                  <Zap className="w-4 h-4 text-cyan-400" />
                  Live Operations
                </h3>
                <div className="space-y-1.5 max-h-64 overflow-y-auto">
                  {homeData.liveEvents.map((event: any) => (
                    <div key={event.id} className="text-xs font-mono text-slate-400 flex items-start gap-2">
                      <span className="text-slate-500 whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleTimeString()}
                      </span>
                      <span className={`
                        ${event.severity === "P1" ? "text-rose-400" : ""}
                        ${event.severity === "P2" ? "text-orange-400" : ""}
                        ${event.severity === "P3" ? "text-yellow-400" : ""}
                      `}>
                        {event.branchName ? `${event.branchName} · ` : ""}{event.message}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {bottomTab === "alerts" && (
          <div className="p-4 space-y-3">
            <h2 className="text-sm font-bold text-white">Active Alerts</h2>
            {homeData?.incidents && homeData.incidents.length > 0 ? (
              homeData.incidents.map((incident: any) => (
                <div
                  key={incident.id}
                  onClick={() => setSelectedIncident(incident)}
                  className="p-3 rounded-lg bg-slate-900/90 border border-slate-800 cursor-pointer hover:border-rose-500/50"
                >
                  <div className="flex justify-between items-start mb-1">
                    <span className="text-xs font-bold text-white">{incident.title}</span>
                    <span className="px-2 py-0.5 rounded text-[10px] font-mono font-bold bg-rose-600 text-white">
                      {incident.severity}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">{incident.branch.name}</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-slate-400 text-center py-8">No active alerts</p>
            )}
          </div>
        )}

        {bottomTab === "incidents" && (
          <div className="p-4 space-y-3">
            <h2 className="text-sm font-bold text-white">My Incidents</h2>
            <p className="text-sm text-slate-400 text-center py-8">
              {homeData?.myIncidentsCount || 0} incidents assigned to you
            </p>
          </div>
        )}

        {bottomTab === "more" && (
          <div className="p-4 space-y-3">
            <h2 className="text-sm font-bold text-white mb-4">More Options</h2>
            <button className="w-full p-3 rounded-lg bg-slate-900 border border-slate-800 text-left flex items-center gap-3">
              <Bell className="w-5 h-5 text-slate-400" />
              <div>
                <div className="text-sm font-medium text-white">Notifications</div>
                <div className="text-xs text-slate-400">Manage push notifications</div>
              </div>
            </button>
            <button className="w-full p-3 rounded-lg bg-slate-900 border border-slate-800 text-left flex items-center gap-3">
              <Settings className="w-5 h-5 text-slate-400" />
              <div>
                <div className="text-sm font-medium text-white">Settings</div>
                <div className="text-xs text-slate-400">App preferences</div>
              </div>
            </button>
            <button className="w-full p-3 rounded-lg bg-slate-900 border border-slate-800 text-left flex items-center gap-3">
              <FileText className="w-5 h-5 text-slate-400" />
              <div>
                <div className="text-sm font-medium text-white">Reports</div>
                <div className="text-xs text-slate-400">View incident reports</div>
              </div>
            </button>
          </div>
        )}
      </div>

      {/* Bottom Navigation */}
      <div className="sticky bottom-0 z-40 bg-slate-900 border-t border-slate-800 px-2 py-2 grid grid-cols-4 gap-1">
        <button
          onClick={() => setBottomTab("home")}
          className={`flex flex-col items-center justify-center py-2 rounded-lg transition-colors ${
            bottomTab === "home"
              ? "bg-rose-600 text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <Home className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">Home</span>
        </button>

        <button
          onClick={() => setBottomTab("alerts")}
          className={`flex flex-col items-center justify-center py-2 rounded-lg transition-colors relative ${
            bottomTab === "alerts"
              ? "bg-rose-600 text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          {p1Count > 0 && (
            <span className="absolute top-1 right-1 w-4 h-4 bg-rose-500 text-white text-[8px] font-bold rounded-full flex items-center justify-center">
              {p1Count}
            </span>
          )}
          <AlertTriangle className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">Alerts</span>
        </button>

        <button
          onClick={() => setBottomTab("incidents")}
          className={`flex flex-col items-center justify-center py-2 rounded-lg transition-colors ${
            bottomTab === "incidents"
              ? "bg-rose-600 text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <List className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">Incidents</span>
        </button>

        <button
          onClick={() => setBottomTab("more")}
          className={`flex flex-col items-center justify-center py-2 rounded-lg transition-colors ${
            bottomTab === "more"
              ? "bg-rose-600 text-white"
              : "text-slate-400 hover:text-white hover:bg-slate-800"
          }`}
        >
          <MoreVertical className="w-5 h-5" />
          <span className="text-[10px] font-medium mt-0.5">More</span>
        </button>
      </div>

      {/* Toast Notification */}
      {toastMsg && (
        <div className="fixed top-4 left-1/2 transform -translate-x-1/2 z-50 px-4 py-3 bg-slate-900 border border-slate-700 rounded-lg shadow-xl text-sm text-white font-mono max-w-sm animate-in fade-in slide-in-from-top">
          {toastMsg}
        </div>
      )}
    </div>
  );
}
