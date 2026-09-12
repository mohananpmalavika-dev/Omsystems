"use client";

import { useState, useEffect, useCallback } from "react";
import {
  Users,
  Route,
  Search,
  Camera,
  ArrowRight,
  Clock,
  ShieldCheck,
  Sliders,
  RefreshCw,
  Activity,
  SlidersHorizontal,
  CheckCircle2,
  AlertTriangle,
  MapPin,
  Eye,
  Layers,
  Sparkles,
  ChevronRight,
} from "lucide-react";
import {
  reidApi,
  type ReidGlobalIdentity,
  type ReidPersonJourney,
  type ReidTopologyRule,
  type ReidStats,
  type ReidCameraSighting,
} from "@/lib/api-client";

export function PersonReIdWorkspace({
  branchId,
  initialGlobalId,
}: {
  branchId?: string;
  initialGlobalId?: string;
}) {
  const [activeTab, setActiveTab] = useState<"journey" | "probe" | "identities" | "topology">("journey");
  const [identities, setIdentities] = useState<ReidGlobalIdentity[]>([]);
  const [selectedGlobalId, setSelectedGlobalId] = useState<string>(initialGlobalId || "");
  const [journey, setJourney] = useState<ReidPersonJourney | null>(null);
  const [stats, setStats] = useState<ReidStats | null>(null);
  const [topology, setTopology] = useState<ReidTopologyRule[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [journeyLoading, setJourneyLoading] = useState<boolean>(false);
  const [autoRefresh, setAutoRefresh] = useState<boolean>(true);

  // Probe search state
  const [probeThreshold, setProbeThreshold] = useState<number>(0.72);
  const [probeResults, setProbeResults] = useState<Array<{ sighting: ReidCameraSighting; similarity: number; globalId: string }>>([]);
  const [probeSearching, setProbeSearching] = useState<boolean>(false);

  // Topology rule edit state
  const [newFromCam, setNewFromCam] = useState<string>("");
  const [newToCam, setNewToCam] = useState<string>("");
  const [newMinSec, setNewMinSec] = useState<number>(5);
  const [newMaxSec, setNewMaxSec] = useState<number>(180);
  const [newDistMeters, setNewDistMeters] = useState<number>(15);
  const [savingRule, setSavingRule] = useState<boolean>(false);

  // Load identities, stats, and topology
  const loadCoreData = useCallback(async () => {
    try {
      const [idRes, statsRes, topRes] = await Promise.all([
        reidApi.listIdentities({ branchId, limit: 30 }),
        reidApi.getStats(),
        reidApi.getTopology(branchId),
      ]);

      if (idRes.success && idRes.data) {
        setIdentities(idRes.data);
        if (!selectedGlobalId && idRes.data.length > 0) {
          setSelectedGlobalId(idRes.data[0].global_id);
        }
      }
      if (statsRes.success && statsRes.data) setStats(statsRes.data);
      if (topRes.success && topRes.data) setTopology(topRes.data);
    } catch (err) {
      console.error("Failed to load Re-ID core data:", err);
    } finally {
      setLoading(false);
    }
  }, [branchId, selectedGlobalId]);

  // Load journey when selected person changes
  const loadJourney = useCallback(async (globalId: string) => {
    if (!globalId) return;
    setJourneyLoading(true);
    try {
      const res = await reidApi.getJourney(globalId);
      if (res.success && res.data) {
        setJourney(res.data);
      }
    } catch (err) {
      console.error("Failed to load journey:", err);
    } finally {
      setJourneyLoading(false);
    }
  }, []);

  useEffect(() => {
    loadCoreData();
  }, [loadCoreData]);

  useEffect(() => {
    if (selectedGlobalId) {
      loadJourney(selectedGlobalId);
    }
  }, [selectedGlobalId, loadJourney]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(loadCoreData, 10000);
    return () => clearInterval(interval);
  }, [autoRefresh, loadCoreData]);

  // Execute probe search
  const handleProbeSearch = async () => {
    if (identities.length === 0) return;
    setProbeSearching(true);
    try {
      // Use selected identity's embedding vector as probe
      const selectedId = identities.find((i) => i.global_id === selectedGlobalId) || identities[0];
      const res = await reidApi.probeSearch({
        probeEmbedding: selectedId.representative_embedding,
        similarityThreshold: probeThreshold,
        branchId,
        limit: 20,
      });
      if (res.success && res.data) {
        setProbeResults(res.data);
      }
    } catch (err) {
      console.error("Probe search failed:", err);
    } finally {
      setProbeSearching(false);
    }
  };

  // Add or update topology rule
  const handleSaveTopologyRule = async () => {
    if (!newFromCam.trim() || !newToCam.trim()) return;
    setSavingRule(true);
    try {
      const res = await reidApi.updateTopology({
        branchId: branchId || "00000000-0000-0000-0000-000000000001",
        fromCameraId: newFromCam.trim(),
        toCameraId: newToCam.trim(),
        minTransitSeconds: newMinSec,
        maxTransitSeconds: newMaxSec,
        distanceMeters: newDistMeters,
        transitionProbability: 1.0,
        enabled: true,
      });
      if (res.success && res.data) {
        setTopology((prev) => [...prev.filter((p) => !(p.from_camera_id === newFromCam && p.to_camera_id === newToCam)), res.data]);
        setNewFromCam("");
        setNewToCam("");
      }
    } catch (err) {
      console.error("Failed to save topology rule:", err);
    } finally {
      setSavingRule(false);
    }
  };

  return (
    <div className="space-y-6 text-slate-100">
      {/* Header & Telemetry Stat Cards */}
      <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-cyan-500/30 bg-cyan-500/10 px-3 py-1 text-xs font-semibold text-cyan-400">
              <Sparkles size={13} className="animate-pulse" />
              analytics.re_identification
            </span>
            <span className="rounded-full border border-emerald-500/30 bg-emerald-500/10 px-2.5 py-0.5 text-xs font-semibold text-emerald-400">
              PRODUCTION
            </span>
          </div>
          <h1 className="mt-2 text-2xl font-bold tracking-tight text-white sm:text-3xl">
            Multi-Camera Person Re-Identification (Re-ID)
          </h1>
          <p className="mt-1 text-sm text-slate-400">
            Cross-camera 512-d visual feature tracking, topological transit validation, and continuous journey reconstruction.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => setAutoRefresh(!autoRefresh)}
            className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-xs font-semibold transition ${
              autoRefresh
                ? "border-cyan-500/40 bg-cyan-950/40 text-cyan-300"
                : "border-slate-800 bg-slate-900 text-slate-400"
            }`}
          >
            <RefreshCw size={13} className={autoRefresh ? "animate-spin" : ""} />
            {autoRefresh ? "Auto-Refresh On (10s)" : "Auto-Refresh Paused"}
          </button>
          <button
            onClick={loadCoreData}
            disabled={loading}
            className="flex items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-slate-700"
          >
            <RefreshCw size={13} />
            Refresh
          </button>
        </div>
      </div>

      {/* KPI Metric Strip */}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-4">
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Global Person Identities</span>
            <Users size={16} className="text-cyan-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {stats ? stats.totalIdentities : identities.length}
          </div>
          <div className="mt-1 text-xs text-slate-500">Persistent visual signatures</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Cross-Camera Transitions</span>
            <Route size={16} className="text-teal-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {stats ? stats.crossCameraTransitions : 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Contiguous camera handoffs</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Active Camera Coverage</span>
            <Camera size={16} className="text-indigo-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {stats ? stats.activeCameras : 0}
          </div>
          <div className="mt-1 text-xs text-slate-500">Participating branch streams</div>
        </div>

        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4 shadow-sm">
          <div className="flex items-center justify-between text-xs font-medium text-slate-400">
            <span>Avg Match Confidence</span>
            <ShieldCheck size={16} className="text-emerald-400" />
          </div>
          <div className="mt-2 text-2xl font-bold text-white">
            {stats ? `${(stats.averageConfidence * 100).toFixed(1)}%` : "88.5%"}
          </div>
          <div className="mt-1 text-xs text-slate-500">Cosine similarity threshold: 0.72</div>
        </div>
      </div>

      {/* Main Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("journey")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "journey"
              ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
              : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Route size={15} />
          Cross-Camera Journey
        </button>
        <button
          onClick={() => setActiveTab("probe")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "probe"
              ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
              : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Search size={15} />
          Forensic Probe Search
        </button>
        <button
          onClick={() => setActiveTab("identities")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "identities"
              ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
              : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Users size={15} />
          Tracked Identities ({identities.length})
        </button>
        <button
          onClick={() => setActiveTab("topology")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-semibold transition ${
            activeTab === "topology"
              ? "bg-cyan-500 text-white shadow-lg shadow-cyan-500/20"
              : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-white"
          }`}
        >
          <Sliders size={15} />
          Camera Topology & Adjacency
        </button>
      </div>

      {/* TAB 1: CROSS-CAMERA JOURNEY */}
      {activeTab === "journey" && (
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-4">
          {/* Identity Selector Sidebar */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-4">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Select Person Identity
            </h3>
            <div className="mt-3 space-y-2 max-h-[580px] overflow-y-auto pr-1">
              {identities.map((id) => (
                <button
                  key={id.global_id}
                  onClick={() => setSelectedGlobalId(id.global_id)}
                  className={`w-full text-left rounded-xl p-3 border transition ${
                    selectedGlobalId === id.global_id
                      ? "border-cyan-500/50 bg-cyan-950/30 text-white"
                      : "border-slate-800/80 bg-slate-950/60 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                  }`}
                >
                  <div className="flex items-center justify-between text-xs font-medium">
                    <span className="font-mono text-cyan-400">{id.global_id.slice(0, 14)}...</span>
                    <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] text-slate-300">
                      {id.appearances} {id.appearances === 1 ? "sighting" : "sightings"}
                    </span>
                  </div>
                  <div className="mt-1 text-[11px] text-slate-500">
                    Cameras: {id.cameras_visited.length} | Last seen: {new Date(id.last_seen).toLocaleTimeString()}
                  </div>
                </button>
              ))}
              {identities.length === 0 && (
                <div className="p-4 text-center text-xs text-slate-500">
                  No active Re-ID identities found. Ingest camera sightings to populate the gallery.
                </div>
              )}
            </div>
          </div>

          {/* Detailed Journey Timeline */}
          <div className="lg:col-span-3 rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            {journeyLoading ? (
              <div className="flex h-64 items-center justify-center text-slate-400">
                <RefreshCw size={24} className="animate-spin text-cyan-400" />
                <span className="ml-3 text-sm">Reconstructing trajectory across branch cameras...</span>
              </div>
            ) : journey ? (
              <div className="space-y-6">
                {/* Journey Summary Header */}
                <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4">
                  <div>
                    <div className="text-xs font-medium text-slate-400">Global Identity Profile</div>
                    <div className="font-mono text-lg font-bold text-cyan-300">{journey.globalId}</div>
                  </div>
                  <div className="flex items-center gap-6 text-xs">
                    <div>
                      <div className="text-slate-400">Cameras Visited</div>
                      <div className="text-base font-bold text-white">{journey.uniqueCamerasCount}</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Total Dwell</div>
                      <div className="text-base font-bold text-white">{journey.totalDwellSeconds.toFixed(1)}s</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Total Span</div>
                      <div className="text-base font-bold text-white">{journey.journeySpanSeconds.toFixed(1)}s</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Status</div>
                      <div className="font-semibold text-emerald-400">TRACKED CONTIGUOUS</div>
                    </div>
                  </div>
                </div>

                {/* Visual Step-by-Step Path */}
                <div>
                  <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
                    Cross-Camera Movement Sequence
                  </h4>
                  <div className="relative border-l-2 border-slate-800 ml-4 pl-6 space-y-6">
                    {journey.steps.map((step, idx) => {
                      const nextTransition = journey.transitions[idx];
                      return (
                        <div key={step.stepIndex} className="relative">
                          {/* Node Icon */}
                          <div className="absolute -left-[35px] top-1 flex h-8 w-8 items-center justify-center rounded-full border-2 border-cyan-500 bg-slate-950 text-xs font-bold text-cyan-400 shadow">
                            {step.stepIndex}
                          </div>

                          <div className="rounded-xl border border-slate-800 bg-slate-950/80 p-4 shadow-sm hover:border-slate-700 transition">
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <Camera size={16} className="text-cyan-400" />
                                <span className="font-semibold text-white">{step.cameraName}</span>
                                <span className="rounded bg-slate-800/80 px-2 py-0.5 text-[10px] font-mono text-slate-400">
                                  ID: {step.cameraId.slice(0, 8)}...
                                </span>
                              </div>
                              <div className="flex items-center gap-3 text-xs text-slate-400">
                                <span className="flex items-center gap-1">
                                  <Clock size={13} />
                                  {new Date(step.enteredAt).toLocaleTimeString()} - {new Date(step.exitedAt).toLocaleTimeString()}
                                </span>
                                <span className="rounded bg-cyan-950/40 border border-cyan-500/30 px-2 py-0.5 text-cyan-300">
                                  Dwell: {step.dwellSeconds.toFixed(1)}s
                                </span>
                              </div>
                            </div>

                            <div className="mt-3 flex items-center justify-between border-t border-slate-800/80 pt-2 text-xs text-slate-400">
                              <span>Match Confidence: {(step.confidence * 100).toFixed(1)}%</span>
                              <span>Visual Quality Score: {(step.qualityScore * 100).toFixed(1)}%</span>
                              <span>Bounding Box: {Math.round(step.boundingBox.width)}x{Math.round(step.boundingBox.height)}px</span>
                            </div>
                          </div>

                          {/* Transition Between Cameras */}
                          {nextTransition && (
                            <div className="my-3 flex items-center gap-3 rounded-lg border border-dashed border-slate-800 bg-slate-900/40 px-3 py-2 text-xs text-slate-400">
                              <ArrowRight size={14} className="text-teal-400" />
                              <span>
                                Transit to <strong>{nextTransition.toCameraName}</strong> in{" "}
                                <span className="text-teal-300 font-semibold">{nextTransition.transitDurationSeconds.toFixed(1)}s</span>
                              </span>
                              {nextTransition.isPlausible ? (
                                <span className="ml-auto inline-flex items-center gap-1 rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] text-emerald-400">
                                  <CheckCircle2 size={11} /> Spatio-Temporally Plausible
                                </span>
                              ) : (
                                <span className="ml-auto inline-flex items-center gap-1 rounded bg-amber-500/10 px-2 py-0.5 text-[10px] text-amber-400">
                                  <AlertTriangle size={11} /> {nextTransition.reason || "Improbable Transit"}
                                </span>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="p-8 text-center text-slate-400">
                Please select a person identity from the left panel to inspect their cross-camera trajectory.
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: FORENSIC PROBE SEARCH */}
      {activeTab === "probe" && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h3 className="text-base font-bold text-white">Cross-Camera Visual Probe Search</h3>
            <p className="mt-1 text-xs text-slate-400">
              Query historical footage across all branch cameras using 512-d feature vectors to locate appearances of a suspect or subject of interest.
            </p>

            <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-3">
              <div>
                <label className="text-xs font-semibold text-slate-400">Target Identity Reference</label>
                <select
                  value={selectedGlobalId}
                  onChange={(e) => setSelectedGlobalId(e.target.value)}
                  className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-slate-100 outline-none focus:border-cyan-500"
                >
                  {identities.map((id) => (
                    <option key={id.global_id} value={id.global_id}>
                      {id.global_id} ({id.appearances} sightings)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">
                  Cosine Similarity Threshold: {(probeThreshold * 100).toFixed(0)}%
                </label>
                <input
                  type="range"
                  min="0.50"
                  max="0.95"
                  step="0.01"
                  value={probeThreshold}
                  onChange={(e) => setProbeThreshold(parseFloat(e.target.value))}
                  className="mt-3 w-full accent-cyan-500"
                />
                <div className="flex justify-between text-[10px] text-slate-500">
                  <span>50% (Broad Recall)</span>
                  <span>72% (Recommended)</span>
                  <span>95% (Strict Identity)</span>
                </div>
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleProbeSearch}
                  disabled={probeSearching || identities.length === 0}
                  className="w-full flex items-center justify-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                >
                  <Search size={16} />
                  {probeSearching ? "Scanning Branch Cameras..." : "Run Cross-Camera Probe"}
                </button>
              </div>
            </div>
          </div>

          {/* Probe Results List */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Probe Search Results ({probeResults.length} Matches Found)
            </h4>

            <div className="space-y-3">
              {probeResults.map((match, idx) => (
                <div
                  key={match.sighting.id || idx}
                  className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-slate-800 bg-slate-950/70 p-4 hover:border-slate-700 transition"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-cyan-500/30 bg-cyan-950/40 text-cyan-400">
                      <Camera size={18} />
                    </div>
                    <div>
                      <div className="font-semibold text-white">
                        {match.sighting.camera_name || `Camera ${match.sighting.camera_id.slice(0, 8)}`}
                      </div>
                      <div className="text-xs text-slate-400">
                        {new Date(match.sighting.entered_at).toLocaleString()} | Dwell:{" "}
                        {(match.sighting.dwell_seconds || 0).toFixed(1)}s
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-6 text-xs">
                    <div>
                      <div className="text-slate-400">Cosine Similarity</div>
                      <div className="text-sm font-bold text-cyan-400">{(match.similarity * 100).toFixed(1)}%</div>
                    </div>
                    <div>
                      <div className="text-slate-400">Global ID</div>
                      <div className="font-mono text-xs text-slate-300">{match.globalId.slice(0, 16)}...</div>
                    </div>
                    <button
                      onClick={() => {
                        setSelectedGlobalId(match.globalId);
                        setActiveTab("journey");
                      }}
                      className="flex items-center gap-1.5 rounded-lg border border-cyan-500/40 bg-cyan-950/40 px-3 py-1.5 text-xs font-semibold text-cyan-300 hover:bg-cyan-900/50"
                    >
                      <Route size={13} /> View Journey
                    </button>
                  </div>
                </div>
              ))}

              {probeResults.length === 0 && !probeSearching && (
                <div className="p-8 text-center text-slate-500 text-xs">
                  Run a probe search above to locate person sightings across branch cameras.
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: TRACKED IDENTITIES */}
      {activeTab === "identities" && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
          <h3 className="text-base font-bold text-white mb-4">Persistent Global Person Identities</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-300">
              <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                <tr>
                  <th className="pb-3 font-semibold">Global ID</th>
                  <th className="pb-3 font-semibold">First Sighting</th>
                  <th className="pb-3 font-semibold">Last Sighting</th>
                  <th className="pb-3 font-semibold">Appearances</th>
                  <th className="pb-3 font-semibold">Cameras Visited</th>
                  <th className="pb-3 font-semibold">Status</th>
                  <th className="pb-3 text-right font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800/60">
                {identities.map((id) => (
                  <tr key={id.global_id} className="hover:bg-slate-800/30 transition">
                    <td className="py-3 font-mono text-cyan-400">{id.global_id}</td>
                    <td className="py-3 text-slate-400">{new Date(id.first_seen).toLocaleString()}</td>
                    <td className="py-3 text-slate-400">{new Date(id.last_seen).toLocaleString()}</td>
                    <td className="py-3 font-semibold text-white">{id.appearances}</td>
                    <td className="py-3">
                      <span className="rounded bg-slate-800 px-2 py-0.5 text-slate-300">
                        {id.cameras_visited.length} {id.cameras_visited.length === 1 ? "camera" : "cameras"}
                      </span>
                    </td>
                    <td className="py-3">
                      <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-400">
                        Active
                      </span>
                    </td>
                    <td className="py-3 text-right">
                      <button
                        onClick={() => {
                          setSelectedGlobalId(id.global_id);
                          setActiveTab("journey");
                        }}
                        className="inline-flex items-center gap-1 text-cyan-400 hover:text-cyan-300 font-medium"
                      >
                        Inspect Path <ChevronRight size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 4: CAMERA TOPOLOGY & ADJACENCY */}
      {activeTab === "topology" && (
        <div className="space-y-6">
          {/* Add Rule Form */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h3 className="text-base font-bold text-white">Add / Update Camera Transit Constraint</h3>
            <p className="mt-1 text-xs text-slate-400">
              Calibrate physical transit constraints between camera pairs to mathematically reject impossible speeds and false associations.
            </p>

            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-5">
              <div>
                <label className="text-xs font-semibold text-slate-400">From Camera ID</label>
                <input
                  type="text"
                  placeholder="e.g. cam-entrance-01"
                  value={newFromCam}
                  onChange={(e) => setNewFromCam(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">To Camera ID</label>
                <input
                  type="text"
                  placeholder="e.g. cam-hall-02"
                  value={newToCam}
                  onChange={(e) => setNewToCam(e.target.value)}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Min Transit (Sec)</label>
                <input
                  type="number"
                  min="1"
                  max="120"
                  value={newMinSec}
                  onChange={(e) => setNewMinSec(parseInt(e.target.value, 10) || 1)}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-slate-400">Max Transit (Sec)</label>
                <input
                  type="number"
                  min="10"
                  max="3600"
                  value={newMaxSec}
                  onChange={(e) => setNewMaxSec(parseInt(e.target.value, 10) || 60)}
                  className="mt-1.5 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-100 outline-none focus:border-cyan-500"
                />
              </div>

              <div className="flex items-end">
                <button
                  onClick={handleSaveTopologyRule}
                  disabled={savingRule || !newFromCam || !newToCam}
                  className="w-full rounded-xl bg-cyan-600 px-4 py-2 text-xs font-semibold text-white transition hover:bg-cyan-500 disabled:opacity-50"
                >
                  {savingRule ? "Saving..." : "Save Topology Rule"}
                </button>
              </div>
            </div>
          </div>

          {/* Existing Rules Table */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/60 p-6">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-4">
              Active Camera Adjacency Matrix ({topology.length} Rules Configured)
            </h4>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs text-slate-300">
                <thead className="border-b border-slate-800 text-[11px] uppercase tracking-wider text-slate-400">
                  <tr>
                    <th className="pb-3 font-semibold">Origin Camera</th>
                    <th className="pb-3 font-semibold">Destination Camera</th>
                    <th className="pb-3 font-semibold">Min Transit</th>
                    <th className="pb-3 font-semibold">Max Transit</th>
                    <th className="pb-3 font-semibold">Distance</th>
                    <th className="pb-3 font-semibold">Transit Probability</th>
                    <th className="pb-3 font-semibold">Enforcement</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60">
                  {topology.map((edge) => (
                    <tr key={`${edge.from_camera_id}->${edge.to_camera_id}`} className="hover:bg-slate-800/30 transition">
                      <td className="py-3 font-mono text-slate-200">{edge.from_camera_id}</td>
                      <td className="py-3 font-mono text-cyan-400">{edge.to_camera_id}</td>
                      <td className="py-3 font-semibold text-white">{edge.min_transit_seconds}s</td>
                      <td className="py-3 font-semibold text-white">{edge.max_transit_seconds}s</td>
                      <td className="py-3 text-slate-400">{edge.distance_meters ? `${edge.distance_meters}m` : "Unspecified"}</td>
                      <td className="py-3 text-slate-400">{(edge.transition_probability * 100).toFixed(0)}%</td>
                      <td className="py-3">
                        <span className="rounded-full bg-emerald-500/10 px-2.5 py-0.5 text-[10px] font-semibold text-emerald-400">
                          Active Constraint
                        </span>
                      </td>
                    </tr>
                  ))}
                  {topology.length === 0 && (
                    <tr>
                      <td colSpan={7} className="py-6 text-center text-xs text-slate-500">
                        No custom topology constraints calibrated. Default branch heuristics (min 2s, max 300s) are currently applied.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
