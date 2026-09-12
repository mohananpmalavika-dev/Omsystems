"use client";

import { useState, useEffect, useCallback } from "react";
import {
  ShieldAlert,
  AlertTriangle,
  DoorClosed,
  DoorOpen,
  Lock,
  Unlock,
  Users,
  CheckCircle2,
  XCircle,
  Clock,
  Filter,
  RefreshCw,
  Sliders,
  Eye,
  Camera,
  Zap,
  Activity,
  ChevronRight,
  UserCheck,
  UserX,
  Play,
} from "lucide-react";
import {
  tailgatingApi,
  type TailgatingEvent,
  type TailgatingStats,
  type AirlockPortal,
  type TailgatingPortalConfig,
  type SequenceTimelineItem,
  type TailgatingViolationType,
} from "@/lib/api-client";

export function TailgatingDetectionWorkspace({ portalId }: { portalId?: string }) {
  const [portals, setPortals] = useState<AirlockPortal[]>([]);
  const [selectedPortalId, setSelectedPortalId] = useState<string>(portalId || "");
  const [events, setEvents] = useState<TailgatingEvent[]>([]);
  const [stats, setStats] = useState<TailgatingStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [selectedEvent, setSelectedEvent] = useState<TailgatingEvent | null>(null);
  const [reviewNotes, setReviewNotes] = useState("");
  const [submittingReview, setSubmittingReview] = useState(false);
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [violationTypeFilter, setViolationTypeFilter] = useState<string>("ALL");
  const [configModalOpen, setConfigModalOpen] = useState(false);
  const [portalConfig, setPortalConfig] = useState<TailgatingPortalConfig | null>(null);
  const [savingConfig, setSavingConfig] = useState(false);
  const [testingSequence, setTestingSequence] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);

  // Load Portals
  useEffect(() => {
    async function loadPortals() {
      try {
        const res = await tailgatingApi.listPortals();
        if (res.success && res.data.length > 0) {
          setPortals(res.data);
          if (!selectedPortalId) {
            setSelectedPortalId(res.data[0]!.id);
          }
        }
      } catch (err) {
        console.error("Failed to load airlock portals:", err);
      }
    }
    loadPortals();
  }, [selectedPortalId]);

  // Load Events & Stats
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [eventsRes, statsRes] = await Promise.all([
        tailgatingApi.listEvents({
          portalId: selectedPortalId || undefined,
          severity: severityFilter !== "ALL" ? (severityFilter as 'P1' | 'P2' | 'P3') : undefined,
          reviewStatus: statusFilter !== "ALL" ? (statusFilter as any) : undefined,
          violationType: violationTypeFilter !== "ALL" ? (violationTypeFilter as TailgatingViolationType) : undefined,
          limit: 50,
        }),
        tailgatingApi.getStats(),
      ]);

      if (eventsRes.success) setEvents(eventsRes.data);
      if (statsRes.success) setStats(statsRes.data);
    } catch (err) {
      console.error("Failed to load tailgating events:", err);
    } finally {
      setLoading(false);
    }
  }, [selectedPortalId, severityFilter, statusFilter, violationTypeFilter]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Review Event
  const handleReview = async (reviewStatus: 'confirmed' | 'false_positive' | 'escalated') => {
    if (!selectedEvent) return;
    setSubmittingReview(true);
    try {
      const res = await tailgatingApi.reviewEvent(selectedEvent.id, {
        reviewStatus,
        reviewNotes: reviewNotes.trim() || undefined,
      });
      if (res.success) {
        setSelectedEvent(null);
        setReviewNotes("");
        await loadData();
      }
    } catch (err) {
      console.error("Failed to review tailgating incident:", err);
    } finally {
      setSubmittingReview(false);
    }
  };

  // Open Config
  const openConfigModal = async () => {
    if (!selectedPortalId) return;
    try {
      const res = await tailgatingApi.getPortalConfig(selectedPortalId);
      if (res.success) setPortalConfig(res.data);
      setConfigModalOpen(true);
    } catch (err) {
      console.error("Failed to load portal config:", err);
    }
  };

  // Save Config
  const saveConfig = async () => {
    if (!selectedPortalId || !portalConfig) return;
    setSavingConfig(true);
    try {
      const res = await tailgatingApi.updatePortalConfig(selectedPortalId, portalConfig);
      if (res.success) {
        setPortalConfig(res.data);
        setConfigModalOpen(false);
      }
    } catch (err) {
      console.error("Failed to update portal config:", err);
    } finally {
      setSavingConfig(false);
    }
  };

  // Run Test Correlation
  const runTestSequence = async (scenario: 'single_authorized' | 'piggyback' | 'unbadged' | 'denied_breach') => {
    if (!selectedPortalId) return;
    setTestingSequence(true);
    setTestResult(null);

    const now = Date.now();
    const activePortal = portals.find(p => p.id === selectedPortalId);
    const outerDoorId = activePortal?.outer_door_id || "DOOR-VAULT-OUTER";

    let badgeSwipes: any[] = [];
    let cameraObservations: any[] = [];
    let doorEvents: any[] = [
      { doorId: outerDoorId, state: 'opened', timestamp: now - 3000 },
      { doorId: outerDoorId, state: 'closed', timestamp: now - 500 },
    ];

    if (scenario === 'single_authorized') {
      badgeSwipes = [
        {
          doorId: outerDoorId,
          badgeId: 'BADGE-AUTH-901',
          personName: 'R. Sen (Vault Custodian)',
          eventType: 'granted',
          authorizedCount: 1,
          timestamp: now - 4000,
        },
      ];
      cameraObservations = [
        {
          trackId: 'track-custodian-1',
          timestamp: now - 2000,
          confidence: 0.95,
          boundingBox: { x: 0.35, y: 0.30, width: 0.20, height: 0.45 },
        },
      ];
    } else if (scenario === 'piggyback') {
      badgeSwipes = [
        {
          doorId: outerDoorId,
          badgeId: 'BADGE-AUTH-104',
          personName: 'D. Sharma (Manager)',
          eventType: 'granted',
          authorizedCount: 1,
          timestamp: now - 5000,
        },
      ];
      cameraObservations = [
        {
          trackId: 'track-manager-1',
          timestamp: now - 3500,
          confidence: 0.94,
          boundingBox: { x: 0.25, y: 0.25, width: 0.18, height: 0.45 },
        },
        {
          trackId: 'track-tailgater-2',
          timestamp: now - 2500,
          confidence: 0.91,
          boundingBox: { x: 0.55, y: 0.30, width: 0.18, height: 0.45 },
        },
      ];
    } else if (scenario === 'unbadged') {
      badgeSwipes = [];
      cameraObservations = [
        {
          trackId: 'track-intruder-1',
          timestamp: now - 1500,
          confidence: 0.93,
          boundingBox: { x: 0.40, y: 0.35, width: 0.20, height: 0.45 },
        },
      ];
    } else if (scenario === 'denied_breach') {
      badgeSwipes = [
        {
          doorId: outerDoorId,
          badgeId: 'BADGE-REVOKED-77',
          personName: 'Unknown Credential',
          eventType: 'denied',
          authorizedCount: 0,
          timestamp: now - 4500,
        },
      ];
      cameraObservations = [
        {
          trackId: 'track-forced-1',
          timestamp: now - 2000,
          confidence: 0.94,
          boundingBox: { x: 0.40, y: 0.35, width: 0.20, height: 0.45 },
        },
      ];
    }

    try {
      const res = await tailgatingApi.correlatePassage({
        portalId: selectedPortalId,
        badgeSwipes,
        doorEvents,
        cameraObservations,
      });
      if (res.success) {
        setTestResult(res.data);
        await loadData();
      }
    } catch (err) {
      console.error("Test sequence correlation failed:", err);
    } finally {
      setTestingSequence(false);
    }
  };

  const activePortal = portals.find(p => p.id === selectedPortalId);

  return (
    <div className="space-y-6">
      {/* Top Header & Portal Selector */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between rounded-2xl border border-slate-800 bg-slate-900/90 p-5 shadow-xl">
        <div className="flex items-center gap-3">
          <div className="grid h-12 w-12 place-items-center rounded-xl bg-red-500/10 text-red-400 border border-red-500/20">
            <DoorClosed size={24} />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">PHYSICAL ACCESS CONTROL (PACS)</span>
              <span className="rounded bg-emerald-500/10 px-2 py-0.5 text-[10px] font-semibold text-emerald-300 border border-emerald-500/20">
                ACTIVE CORRELATION
              </span>
            </div>
            <h1 className="text-xl font-bold text-slate-100">Access Control Tailgating & Airlock Portal Detection</h1>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <select
            value={selectedPortalId}
            onChange={(e) => setSelectedPortalId(e.target.value)}
            className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 focus:outline-none focus:ring-2 focus:ring-cyan-500"
          >
            {portals.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}
              </option>
            ))}
          </select>

          <button
            onClick={openConfigModal}
            className="flex items-center gap-1.5 rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 transition"
          >
            <Sliders size={14} /> Portal Settings
          </button>

          <button
            onClick={() => loadData()}
            disabled={loading}
            className="grid h-9 w-9 place-items-center rounded-xl border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-cyan-400" : ""} />
          </button>
        </div>
      </div>

      {/* Active Portal Banner */}
      {activePortal && (
        <div className="grid gap-3 sm:grid-cols-4 rounded-xl border border-slate-800 bg-slate-950/60 p-4 text-xs">
          <div>
            <span className="text-slate-500">Outer Entry Door:</span>
            <p className="font-semibold text-slate-200">{activePortal.outer_door_id}</p>
          </div>
          <div>
            <span className="text-slate-500">Inner Secure Door:</span>
            <p className="font-semibold text-slate-200">{activePortal.inner_door_id}</p>
          </div>
          <div>
            <span className="text-slate-500">Interlock Safety Mode:</span>
            <p className="font-semibold text-cyan-300 uppercase">{activePortal.interlock_mode.replace("_", " ")}</p>
          </div>
          <div>
            <span className="text-slate-500">Auto Inner Lock on Tailgate:</span>
            <p className="font-semibold text-emerald-400">{activePortal.auto_lock_inner_door ? "ENABLED (Locked on breach)" : "WARNING ONLY"}</p>
          </div>
        </div>
      )}

      {/* Key Metrics Row */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <MetricCard
          label="Tailgating Breaches"
          value={stats?.totalIncidents ?? 0}
          detail="Total incidents recorded"
          icon={<ShieldAlert size={20} className="text-red-400" />}
          border="border-red-500/20"
        />
        <MetricCard
          label="Pending Reviews"
          value={stats?.pendingReviews ?? 0}
          detail="Operator triage needed"
          icon={<Clock size={20} className="text-amber-400" />}
          border="border-amber-500/20"
        />
        <MetricCard
          label="Confirmed Breaches"
          value={stats?.confirmedCount ?? 0}
          detail="Verified tailgating events"
          icon={<CheckCircle2 size={20} className="text-emerald-400" />}
          border="border-emerald-500/20"
        />
        <MetricCard
          label="Interlock Lockdowns"
          value={stats?.interlockLockdowns ?? 0}
          detail="Inner doors locked"
          icon={<Lock size={20} className="text-indigo-400" />}
          border="border-indigo-500/20"
        />
        <MetricCard
          label="Confidence Avg"
          value={stats?.avgConfidence ? `${Math.round(stats.avgConfidence * 100)}%` : "92%"}
          detail="AI sequence accuracy"
          icon={<Zap size={20} className="text-cyan-400" />}
          border="border-cyan-500/20"
        />
      </div>

      {/* Live Sequence Correlation Simulator Panel */}
      <div className="rounded-2xl border border-slate-800 bg-slate-900/80 p-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between mb-4">
          <div>
            <div className="flex items-center gap-2">
              <Play size={16} className="text-cyan-400" />
              <h2 className="text-base font-semibold text-slate-100">Live Sequence Correlation Simulator</h2>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              Fire test badge swipe and camera detection sequences against the authoritative airlock correlator.
            </p>
          </div>
          {testingSequence && (
            <span className="flex items-center gap-1.5 text-xs text-cyan-400 font-semibold">
              <RefreshCw size={12} className="animate-spin" /> Correlating Sequence...
            </span>
          )}
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <button
            disabled={testingSequence}
            onClick={() => runTestSequence('single_authorized')}
            className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 hover:border-emerald-500/50 hover:bg-slate-950 transition text-left"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 mb-1">
              <UserCheck size={15} /> Normal 1-to-1 Passage
            </div>
            <p className="text-[11px] text-slate-400">1 valid badge swipe, 1 person detected. Expects NO breach, inner door unlocked.</p>
          </button>

          <button
            disabled={testingSequence}
            onClick={() => runTestSequence('piggyback')}
            className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 hover:border-red-500/50 hover:bg-slate-950 transition text-left"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-red-400 mb-1">
              <Users size={15} /> Piggybacking / Follow-in
            </div>
            <p className="text-[11px] text-slate-400">1 badge swipe, 2 persons enter together. Expects P1 alert + inner door lockdown.</p>
          </button>

          <button
            disabled={testingSequence}
            onClick={() => runTestSequence('unbadged')}
            className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 hover:border-amber-500/50 hover:bg-slate-950 transition text-left"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-amber-400 mb-1">
              <UserX size={15} /> Unbadged Entry Breach
            </div>
            <p className="text-[11px] text-slate-400">0 badge swipes, person slips into airlock. Expects P1 breach + lock engagement.</p>
          </button>

          <button
            disabled={testingSequence}
            onClick={() => runTestSequence('denied_breach')}
            className="flex flex-col items-start rounded-xl border border-slate-800 bg-slate-950/60 p-3.5 hover:border-purple-500/50 hover:bg-slate-950 transition text-left"
          >
            <div className="flex items-center gap-2 text-xs font-bold text-purple-400 mb-1">
              <XCircle size={15} /> Denied Badge Breach
            </div>
            <p className="text-[11px] text-slate-400">1 badge denied, person forces/walks in. Expects P1 security incident alert.</p>
          </button>
        </div>

        {testResult && (
          <div className="mt-4 rounded-xl border border-cyan-500/20 bg-cyan-950/20 p-4 text-xs">
            <div className="flex items-center justify-between">
              <span className="font-bold text-cyan-300">
                Simulation Result: {testResult.result.detected ? "BREACH CONFIRMED" : "AUTHORIZED NORMAL PASSAGE"}
              </span>
              <span className={`px-2 py-0.5 rounded font-bold text-[10px] ${testResult.result.detected ? "bg-red-500/20 text-red-300" : "bg-emerald-500/20 text-emerald-300"}`}>
                {testResult.result.detected ? testResult.result.violationType?.toUpperCase() : "CLEAR"}
              </span>
            </div>
            <p className="mt-1 text-slate-300">{testResult.result.explanation}</p>
            <div className="mt-2 flex items-center gap-4 text-[11px] text-slate-400">
              <span>Detected Persons: <strong className="text-white">{testResult.result.detectedPersonCount}</strong></span>
              <span>Authorized Badges: <strong className="text-white">{testResult.result.authorizedCount}</strong></span>
              <span>Interlock Lockdown: <strong className={testResult.interlockLockdownEngaged ? "text-red-400" : "text-emerald-400"}>
                {testResult.interlockLockdownEngaged ? "LOCKED (Door B Inhibited)" : "UNLOCKED"}
              </strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Incident Ledger Section */}
      <section className="rounded-2xl border border-slate-800 bg-slate-900/80 overflow-hidden shadow-xl">
        {/* Filters Header */}
        <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between border-b border-slate-800 p-5">
          <div>
            <span className="text-[10px] font-bold tracking-widest text-cyan-400">SECURITY AUDIT LEDGER</span>
            <h2 className="text-lg font-semibold text-slate-100">Tailgating Incidents & Airlock Breaches</h2>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Filter size={14} className="text-slate-500" />
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300"
            >
              <option value="ALL">All Severities</option>
              <option value="P1">P1 - Critical</option>
              <option value="P2">P2 - High</option>
              <option value="P3">P3 - Medium</option>
            </select>

            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300"
            >
              <option value="ALL">All Review Statuses</option>
              <option value="pending">Pending</option>
              <option value="confirmed">Confirmed</option>
              <option value="false_positive">False Positive</option>
              <option value="escalated">Escalated</option>
            </select>

            <select
              value={violationTypeFilter}
              onChange={(e) => setViolationTypeFilter(e.target.value)}
              className="rounded-lg border border-slate-700 bg-slate-800 px-2.5 py-1.5 text-xs text-slate-300"
            >
              <option value="ALL">All Violations</option>
              <option value="piggyback_tailgating">Piggybacking</option>
              <option value="unbadged_entry">Unbadged Entry</option>
              <option value="denied_entry_breach">Denied Entry Breach</option>
              <option value="multi_occupancy_violation">Multi-Occupancy</option>
              <option value="door_held_breach">Door Held Open</option>
            </select>
          </div>
        </header>

        {/* Table / List */}
        {events.length === 0 ? (
          <div className="grid min-h-48 place-items-center p-8 text-center text-sm text-slate-500">
            <div>
              <DoorClosed className="mx-auto mb-3 text-slate-700" size={32} />
              <p>No tailgating incidents found matching the selected filters.</p>
            </div>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-800 bg-slate-950/40 text-[11px] font-semibold text-slate-400">
                <tr>
                  <th className="p-3.5">Time</th>
                  <th className="p-3.5">Severity</th>
                  <th className="p-3.5">Violation Type</th>
                  <th className="p-3.5">Badge / Person</th>
                  <th className="p-3.5">Persons vs Badges</th>
                  <th className="p-3.5">Interlock State</th>
                  <th className="p-3.5">Status</th>
                  <th className="p-3.5 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-800">
                {events.map((evt) => (
                  <tr key={evt.id} className="hover:bg-slate-800/40 transition">
                    <td className="p-3.5 whitespace-nowrap text-slate-300">
                      {new Date(evt.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                      <span className="block text-[10px] text-slate-500">
                        {new Date(evt.occurred_at).toLocaleDateString()}
                      </span>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span
                        className={`rounded px-2 py-0.5 text-[10px] font-bold ${
                          evt.severity === "P1"
                            ? "bg-red-500/15 text-red-300 border border-red-500/30"
                            : evt.severity === "P2"
                            ? "bg-amber-500/15 text-amber-300 border border-amber-500/30"
                            : "bg-slate-700 text-slate-300"
                        }`}
                      >
                        {evt.severity}
                      </span>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="font-semibold text-slate-200">
                        {evt.violation_type.replace(/_/g, " ").toUpperCase()}
                      </span>
                      <span className="block text-[10px] text-slate-500">
                        Door: {evt.door_id}
                      </span>
                    </td>
                    <td className="p-3.5 whitespace-nowrap text-slate-300">
                      {evt.badge_id ? (
                        <div>
                          <strong className="text-slate-100">{evt.badge_holder_name || evt.badge_id}</strong>
                          <span className="block text-[10px] text-slate-500">Badge: {evt.badge_id}</span>
                        </div>
                      ) : (
                        <span className="text-rose-400 italic">No Badge Swiped</span>
                      )}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span className="text-red-400 font-bold">{evt.detected_person_count} detected</span>
                      <span className="text-slate-500 text-[10px] block">
                        {evt.authorized_count} authorized ({evt.tailgater_count} excess)
                      </span>
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      {evt.interlock_lockdown_engaged ? (
                        <span className="inline-flex items-center gap-1 rounded bg-red-500/10 px-2 py-0.5 text-[10px] font-bold text-red-400 border border-red-500/20">
                          <Lock size={11} /> LOCKED DOWN
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-[10px] text-slate-400">
                          <Unlock size={11} /> Normal
                        </span>
                      )}
                    </td>
                    <td className="p-3.5 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                          evt.review_status === "confirmed"
                            ? "bg-emerald-500/15 text-emerald-300"
                            : evt.review_status === "false_positive"
                            ? "bg-slate-700 text-slate-400"
                            : evt.review_status === "escalated"
                            ? "bg-purple-500/15 text-purple-300"
                            : "bg-amber-500/15 text-amber-300"
                        }`}
                      >
                        {evt.review_status.toUpperCase()}
                      </span>
                    </td>
                    <td className="p-3.5 whitespace-nowrap text-right">
                      <button
                        onClick={() => setSelectedEvent(evt)}
                        className="rounded-lg bg-cyan-600/80 px-2.5 py-1 text-xs font-semibold text-white hover:bg-cyan-500 transition"
                      >
                        Inspect & Review
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Incident Review & Sequence Inspection Modal */}
      {selectedEvent && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-5 my-8">
            <div className="flex items-start justify-between">
              <div>
                <span className="text-[10px] font-bold uppercase tracking-widest text-cyan-400">INCIDENT DETAILS</span>
                <h3 className="text-lg font-bold text-slate-100 mt-0.5">
                  {selectedEvent.violation_type.replace(/_/g, " ").toUpperCase()}
                </h3>
                <p className="text-xs text-slate-400">
                  Occurred on {new Date(selectedEvent.occurred_at).toLocaleString()} at Door {selectedEvent.door_id}
                </p>
              </div>
              <button
                onClick={() => setSelectedEvent(null)}
                className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-slate-800 hover:text-white"
              >
                <XCircle size={18} />
              </button>
            </div>

            {/* Metrics summary */}
            <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs">
              <div>
                <span className="text-slate-500 text-[10px]">Detected / Authorized:</span>
                <p className="font-bold text-slate-200">
                  {selectedEvent.detected_person_count} vs {selectedEvent.authorized_count}
                </p>
              </div>
              <div>
                <span className="text-slate-500 text-[10px]">AI Confidence:</span>
                <p className="font-bold text-cyan-300">
                  {Math.round(selectedEvent.confidence * 100)}%
                </p>
              </div>
              <div>
                <span className="text-slate-500 text-[10px]">Interlock Lockdown:</span>
                <p className="font-bold text-red-400">
                  {selectedEvent.interlock_lockdown_engaged ? "ACTIVE" : "INACTIVE"}
                </p>
              </div>
            </div>

            {/* Sequence Timeline */}
            <div>
              <h4 className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                Airlock Sequence Timeline (Correlated Events)
              </h4>
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {selectedEvent.sequence_timeline && selectedEvent.sequence_timeline.length > 0 ? (
                  selectedEvent.sequence_timeline.map((step: SequenceTimelineItem, idx: number) => (
                    <div key={idx} className="flex items-start gap-3 rounded-lg border border-slate-800/80 bg-slate-950/40 p-2 text-xs">
                      <span className="font-mono text-[10px] text-cyan-400 mt-0.5 whitespace-nowrap">
                        +{step.relativeOffsetMs}ms
                      </span>
                      <div className="flex-1">
                        <strong className="text-slate-200 block">{step.label}</strong>
                        <span className="text-[10px] text-slate-500">{step.type}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <p className="text-xs text-slate-500 italic">No timeline telemetry recorded.</p>
                )}
              </div>
            </div>

            {/* Review Notes Input */}
            <div>
              <label className="block text-xs font-semibold text-slate-300 mb-1">Operator Notes / Triage Rationale</label>
              <textarea
                value={reviewNotes}
                onChange={(e) => setReviewNotes(e.target.value)}
                placeholder="Document guard dispatch, CCTV verification, or operator findings..."
                rows={3}
                className="w-full rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-xs text-slate-100 placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-cyan-500"
              />
            </div>

            {/* Action Buttons */}
            <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-slate-800">
              <button
                disabled={submittingReview}
                onClick={() => handleReview('false_positive')}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700 transition disabled:opacity-50"
              >
                Mark False Positive
              </button>
              <button
                disabled={submittingReview}
                onClick={() => handleReview('escalated')}
                className="rounded-xl bg-purple-600 px-3 py-2 text-xs font-semibold text-white hover:bg-purple-500 transition disabled:opacity-50"
              >
                Escalate Breach
              </button>
              <button
                disabled={submittingReview}
                onClick={() => handleReview('confirmed')}
                className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-500 transition disabled:opacity-50"
              >
                Confirm Tailgating Violation
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Portal Settings Modal */}
      {configModalOpen && portalConfig && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <h3 className="text-base font-bold text-slate-100">Portal Tailgating Policy Overrides</h3>
              <button onClick={() => setConfigModalOpen(false)} className="text-slate-400 hover:text-white">
                <XCircle size={18} />
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label className="text-slate-400 block mb-1">Correlation Window (seconds):</label>
                <input
                  type="number"
                  min={2}
                  max={30}
                  value={portalConfig.correlation_window_seconds}
                  onChange={(e) => setPortalConfig({ ...portalConfig, correlation_window_seconds: parseInt(e.target.value, 10) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">Max Allowed Chamber Occupancy:</label>
                <input
                  type="number"
                  min={1}
                  max={4}
                  value={portalConfig.max_allowed_occupancy}
                  onChange={(e) => setPortalConfig({ ...portalConfig, max_allowed_occupancy: parseInt(e.target.value, 10) })}
                  className="w-full rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-slate-100"
                />
              </div>

              <div>
                <label className="text-slate-400 block mb-1">AI Detection Sensitivity ({Math.round(portalConfig.sensitivity * 100)}%):</label>
                <input
                  type="range"
                  min={0.1}
                  max={1.0}
                  step={0.05}
                  value={portalConfig.sensitivity}
                  onChange={(e) => setPortalConfig({ ...portalConfig, sensitivity: parseFloat(e.target.value) })}
                  className="w-full"
                />
              </div>

              <div className="flex items-center gap-2 pt-2">
                <input
                  type="checkbox"
                  id="autoLock"
                  checked={portalConfig.auto_lock_inner_door}
                  onChange={(e) => setPortalConfig({ ...portalConfig, auto_lock_inner_door: e.target.checked })}
                  className="rounded border-slate-700 bg-slate-800 text-cyan-500"
                />
                <label htmlFor="autoLock" className="text-slate-300 font-semibold cursor-pointer">
                  Auto-lock inner door when tailgating breach detected
                </label>
              </div>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
              <button
                onClick={() => setConfigModalOpen(false)}
                className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
              >
                Cancel
              </button>
              <button
                disabled={savingConfig}
                onClick={saveConfig}
                className="rounded-xl bg-cyan-600 px-4 py-2 text-xs font-bold text-white hover:bg-cyan-500 transition disabled:opacity-50"
              >
                {savingConfig ? "Saving..." : "Save Policy"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function MetricCard({
  label,
  value,
  detail,
  icon,
  border = "border-slate-800",
}: {
  label: string;
  value: string | number;
  detail: string;
  icon: React.ReactNode;
  border?: string;
}) {
  return (
    <div className={`flex items-center gap-4 rounded-2xl border ${border} bg-slate-900/90 p-4 shadow-lg`}>
      <span className="grid h-12 w-12 place-items-center rounded-xl bg-slate-800/80">{icon}</span>
      <div>
        <p className="text-2xl font-bold text-slate-100">{value}</p>
        <strong className="block text-xs text-slate-300">{label}</strong>
        <span className="text-[10px] text-slate-500">{detail}</span>
      </div>
    </div>
  );
}
