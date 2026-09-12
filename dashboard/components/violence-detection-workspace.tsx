"use client";

import { useState, useEffect, useCallback } from "react";
import {
  AlertOctagon,
  ShieldAlert,
  Flame,
  Activity,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  Sliders,
  Eye,
  Camera,
  Users,
  Zap,
} from "lucide-react";
import { violenceApi, type ViolenceEvent, type ViolenceStats, type ViolenceCameraConfig } from "@/lib/api-client";

export function ViolenceDetectionWorkspace({ cameraId, tenantId }: { cameraId?: string; tenantId?: string }) {
  const [events, setEvents] = useState<ViolenceEvent[]>([]);
  const [stats, setStats] = useState<ViolenceStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<ViolenceEvent | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [cameraConfig, setCameraConfig] = useState<ViolenceCameraConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, statsRes] = await Promise.all([
        violenceApi.listEvents({
          cameraId,
          severity: severityFilter !== "ALL" ? (severityFilter as 'P1' | 'P2' | 'P3') : undefined,
          reviewStatus: statusFilter !== "ALL" ? (statusFilter as any) : undefined,
          limit: 50,
        }),
        violenceApi.getStats(),
      ]);

      if (eventsRes.success) setEvents(eventsRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load violence detection events:", err);
    } finally {
      setLoading(false);
    }
  }, [cameraId, severityFilter, statusFilter]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000); // 10s auto-refresh for live altercation alerts
    return () => clearInterval(interval);
  }, [loadData]);

  const handleReview = async (reviewStatus: 'confirmed' | 'false_positive' | 'escalated') => {
    if (!selectedEvent) return;
    setSubmittingReview(true);
    try {
      const res = await violenceApi.reviewEvent(selectedEvent.id, {
        reviewStatus,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      if (res.success) {
        setSelectedEvent(null);
        setReviewNotes("");
        await loadData();
      }
    } catch (err) {
      console.error("Failed to submit event review:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  const openConfigModal = async () => {
    if (!cameraId) return;
    try {
      const res = await violenceApi.getCameraConfig(cameraId);
      if (res.success) setCameraConfig(res.data);
      setConfigModalOpen(true);
    } catch (err) {
      console.error("Failed to load camera config:", err);
    }
  };

  const saveCameraConfig = async () => {
    if (!cameraId || !cameraConfig) return;
    setSavingConfig(true);
    try {
      const res = await violenceApi.updateCameraConfig(cameraId, cameraConfig);
      if (res.success) {
        setCameraConfig(res.data);
        setConfigModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to update camera config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header & Stats Strip */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-slate-900/80 border border-slate-800 rounded-xl p-6 backdrop-blur-md">
        <div>
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-rose-500/20 text-rose-400 border border-rose-500/30 rounded-lg">
              <AlertOctagon className="w-6 h-6 animate-pulse" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-white flex items-center gap-2">
                Physical Violence & Fight Detection
                <span className="text-xs px-2.5 py-0.5 rounded-full bg-rose-500/20 text-rose-300 border border-rose-500/40">
                  REAL-TIME OPTICAL KINEMATICS
                </span>
              </h2>
              <p className="text-sm text-slate-400 mt-0.5">
                Dense optical flow turbulence & rapid limb acceleration heuristics for physical altercations
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {cameraId && (
            <button
              onClick={openConfigModal}
              className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
            >
              <Sliders className="w-4 h-4" />
              Tune Sensitivity
            </button>
          )}
          <button
            onClick={loadData}
            disabled={loading}
            className="flex items-center gap-2 px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold rounded-lg border border-slate-700 transition"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {/* Metrics Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Total Encounters</span>
            <Flame className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-white mt-2">
            {stats ? stats.totalIncidents : "..."}
          </div>
          <div className="text-xs text-slate-500 mt-1">Recorded physical incidents</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Critical (P1) Alerts</span>
            <ShieldAlert className="w-4 h-4 text-rose-400" />
          </div>
          <div className="text-2xl font-bold text-rose-400 mt-2">
            {stats ? stats.p1Count : "..."}
          </div>
          <div className="text-xs text-slate-500 mt-1">High-acceleration strikes</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Pending Review</span>
            <Clock className="w-4 h-4 text-amber-400" />
          </div>
          <div className="text-2xl font-bold text-amber-400 mt-2">
            {stats ? stats.pendingReviews : "..."}
          </div>
          <div className="text-xs text-slate-500 mt-1">Awaiting human review</div>
        </div>

        <div className="bg-slate-900/60 border border-slate-800/80 rounded-xl p-4">
          <div className="text-xs text-slate-400 font-medium flex items-center justify-between">
            <span>Confirmed Rate</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-2xl font-bold text-emerald-400 mt-2">
            {stats && stats.totalIncidents > 0
              ? `${Math.round((stats.confirmedCount / stats.totalIncidents) * 100)}%`
              : "100%"}
          </div>
          <div className="text-xs text-slate-500 mt-1">True positive accuracy</div>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-slate-900/40 border border-slate-800/60 rounded-xl p-3">
        <div className="flex items-center gap-3">
          <Filter className="w-4 h-4 text-slate-400 ml-1" />
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">Severity:</span>
            {["ALL", "P1", "P2"].map((sev) => (
              <button
                key={sev}
                onClick={() => setSeverityFilter(sev)}
                className={`px-2.5 py-1 rounded text-xs font-semibold transition ${
                  severityFilter === sev
                    ? "bg-slate-700 text-white"
                    : "bg-slate-800/50 text-slate-400 hover:text-white"
                }`}
              >
                {sev}
              </button>
            ))}
          </div>

          <div className="h-4 w-px bg-slate-700 mx-1" />

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-400">Review:</span>
            {["ALL", "pending", "confirmed", "false_positive"].map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 rounded text-xs font-semibold capitalize transition ${
                  statusFilter === st
                    ? "bg-slate-700 text-white"
                    : "bg-slate-800/50 text-slate-400 hover:text-white"
                }`}
              >
                {st === "false_positive" ? "False Positive" : st}
              </button>
            ))}
          </div>
        </div>

        <div className="text-xs text-slate-400">
          Showing {events.length} incident(s)
        </div>
      </div>

      {/* Events Table */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-950/80 border-b border-slate-800 text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3 px-4">Time & Camera</th>
                <th className="py-3 px-4">Severity / Confidence</th>
                <th className="py-3 px-4">Kinetic Telemetry</th>
                <th className="py-3 px-4">Limb Acceleration</th>
                <th className="py-3 px-4">Participants</th>
                <th className="py-3 px-4">Review Status</th>
                <th className="py-3 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-800/60">
              {events.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-slate-500">
                    {loading ? "Analyzing surveillance telemetry..." : "No physical altercations detected for this criteria."}
                  </td>
                </tr>
              ) : (
                events.map((ev) => (
                  <tr key={ev.id} className="hover:bg-slate-800/40 transition">
                    <td className="py-3 px-4">
                      <div className="font-semibold text-slate-200">
                        {new Date(ev.occurred_at).toLocaleTimeString()}
                      </div>
                      <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                        <Camera className="w-3 h-3" />
                        {ev.camera_name || ev.camera_id.slice(0, 8)}
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-2">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                            ev.severity === 'P1'
                              ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                              : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                          }`}
                        >
                          {ev.severity}
                        </span>
                        <span className="text-slate-300 font-mono">
                          {(ev.confidence * 100).toFixed(1)}%
                        </span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="space-y-0.5 font-mono text-[11px]">
                        <div className="text-slate-300">
                          Energy: <span className="text-orange-400">{ev.optical_flow_energy}</span>
                        </div>
                        <div className="text-slate-400">
                          Turbulence: <span className="text-violet-400">{ev.turbulence_score}</span>
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="font-mono text-[11px]">
                        <div className="text-slate-200 font-bold flex items-center gap-1">
                          <Zap className="w-3 h-3 text-amber-400" />
                          {ev.max_limb_acceleration} px/s²
                        </div>
                        <div className="text-slate-400 text-[10px]">
                          {ev.strike_count} ballistic strike(s)
                        </div>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <div className="flex items-center gap-1.5 text-slate-300">
                        <Users className="w-3.5 h-3.5 text-slate-400" />
                        <span>{ev.participant_count} person(s)</span>
                      </div>
                    </td>

                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold capitalize ${
                          ev.review_status === 'confirmed'
                            ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            : ev.review_status === 'false_positive'
                            ? 'bg-slate-700/50 text-slate-400'
                            : ev.review_status === 'escalated'
                            ? 'bg-rose-500/20 text-rose-400 border border-rose-500/30'
                            : 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                        }`}
                      >
                        {ev.review_status === 'pending' && <Clock className="w-2.5 h-2.5" />}
                        {ev.review_status === 'confirmed' && <CheckCircle2 className="w-2.5 h-2.5" />}
                        {ev.review_status === 'false_positive' && <XCircle className="w-2.5 h-2.5" />}
                        {ev.review_status === 'escalated' && <ShieldAlert className="w-2.5 h-2.5" />}
                        {ev.review_status === 'false_positive' ? 'False Positive' : ev.review_status}
                      </span>
                    </td>

                    <td className="py-3 px-4 text-right">
                      <button
                        onClick={() => setSelectedEvent(ev)}
                        className="px-3 py-1 bg-slate-800 hover:bg-slate-700 text-slate-200 rounded text-xs font-semibold border border-slate-700 transition flex items-center gap-1 ml-auto"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Inspect
                      </button>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Event Details & Review Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl overflow-hidden shadow-2xl">
            <div className="p-5 border-b border-slate-800 flex justify-between items-center bg-slate-950/60">
              <div className="flex items-center gap-2.5">
                <div className="p-2 bg-rose-500/20 text-rose-400 rounded-lg">
                  <AlertOctagon className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">
                    Altercation Forensic Dossier: {selectedEvent.id.slice(0, 8)}
                  </h3>
                  <p className="text-xs text-slate-400">
                    Occurred at {new Date(selectedEvent.occurred_at).toLocaleString()}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="text-slate-400 hover:text-white text-lg font-bold p-1"
              >
                ✕
              </button>
            </div>

            <div className="p-6 space-y-5">
              {/* Telemetry Radar Cards */}
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Optical Flow Energy</div>
                  <div className="text-xl font-bold text-orange-400 mt-1 font-mono">
                    {selectedEvent.optical_flow_energy}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Kinetic motion power</div>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Turbulence Index</div>
                  <div className="text-xl font-bold text-violet-400 mt-1 font-mono">
                    {selectedEvent.turbulence_score}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">Angular directional entropy</div>
                </div>

                <div className="p-3 bg-slate-950/80 rounded-lg border border-slate-800 text-center">
                  <div className="text-[10px] text-slate-400 uppercase font-semibold">Peak Limb Acceleration</div>
                  <div className="text-xl font-bold text-rose-400 mt-1 font-mono">
                    {selectedEvent.max_limb_acceleration}
                  </div>
                  <div className="text-[10px] text-slate-500 mt-0.5">px/s² strike ballistic</div>
                </div>
              </div>

              {/* Interaction Details */}
              <div className="p-4 bg-slate-950/40 rounded-lg border border-slate-800/80 space-y-2 text-xs">
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400">Interaction Box:</span>
                  <span className="font-mono">
                    {selectedEvent.interaction_box
                      ? `[x:${selectedEvent.interaction_box.x}, y:${selectedEvent.interaction_box.y}, w:${selectedEvent.interaction_box.width}, h:${selectedEvent.interaction_box.height}]`
                      : "Unbounded"}
                  </span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400">Track Participants:</span>
                  <span className="font-mono">{selectedEvent.participant_track_ids.join(", ") || "Unknown"}</span>
                </div>
                <div className="flex justify-between text-slate-300">
                  <span className="text-slate-400">Strike Count:</span>
                  <span className="font-mono text-amber-400 font-bold">{selectedEvent.strike_count} impulse strike(s)</span>
                </div>
              </div>

              {/* Human-in-the-Loop Review Section */}
              <div className="border-t border-slate-800 pt-4 space-y-3">
                <h4 className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                  Security Operator Human Review
                </h4>
                <textarea
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Optional review notes or dispatch details..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-3 text-xs text-slate-200 focus:outline-none focus:border-rose-500"
                  rows={2}
                />

                <div className="flex items-center justify-end gap-2 pt-1">
                  <button
                    disabled={submittingReview}
                    onClick={() => handleReview('false_positive')}
                    className="px-3.5 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold transition"
                  >
                    Mark False Positive
                  </button>
                  <button
                    disabled={submittingReview}
                    onClick={() => handleReview('confirmed')}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    Confirm Altercation
                  </button>
                  <button
                    disabled={submittingReview}
                    onClick={() => handleReview('escalated')}
                    className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold transition flex items-center gap-1.5"
                  >
                    <ShieldAlert className="w-3.5 h-3.5" />
                    Escalate to Dispatch
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Sensitivity Tuning Modal */}
      {configModalOpen && cameraConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-lg overflow-hidden shadow-2xl p-6 space-y-4">
            <h3 className="text-base font-bold text-white flex items-center gap-2">
              <Sliders className="w-5 h-5 text-rose-400" />
              Camera Violence Thresholds
            </h3>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-300 block mb-1">
                  Sensitivity ({cameraConfig.sensitivity})
                </label>
                <input
                  type="range"
                  min="0.2"
                  max="1.0"
                  step="0.05"
                  value={cameraConfig.sensitivity}
                  onChange={(e) =>
                    setCameraConfig({ ...cameraConfig, sensitivity: parseFloat(e.target.value) })
                  }
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">
                  Minimum Limb Acceleration ({cameraConfig.min_limb_acceleration} px/s²)
                </label>
                <input
                  type="range"
                  min="15"
                  max="80"
                  step="5"
                  value={cameraConfig.min_limb_acceleration}
                  onChange={(e) =>
                    setCameraConfig({
                      ...cameraConfig,
                      min_limb_acceleration: parseFloat(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>

              <div>
                <label className="text-slate-300 block mb-1">
                  Optical Flow Energy Threshold ({cameraConfig.min_optical_flow_energy})
                </label>
                <input
                  type="range"
                  min="10"
                  max="70"
                  step="5"
                  value={cameraConfig.min_optical_flow_energy}
                  onChange={(e) =>
                    setCameraConfig({
                      ...cameraConfig,
                      min_optical_flow_energy: parseFloat(e.target.value),
                    })
                  }
                  className="w-full"
                />
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-4 border-t border-slate-800">
              <button
                onClick={() => setConfigModalOpen(false)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-lg text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                onClick={saveCameraConfig}
                disabled={savingConfig}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white rounded-lg text-xs font-semibold"
              >
                {savingConfig ? "Saving..." : "Save Thresholds"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
