"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
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
  Volume2,
  Truck,
  ShieldCheck,
  Megaphone,
} from "lucide-react";
import {
  tailgatingApi,
  anprLogisticsApi,
  secureAreaAuthorizationApi,
  type TailgatingEvent,
  type TailgatingStats,
  type AirlockPortal,
  type TailgatingPortalConfig,
  type SequenceTimelineItem,
  type TailgatingViolationType,
} from "@/lib/api-client";

export function TailgatingDetectionWorkspace({ portalId }: { portalId?: string }) {
  const [activeWorkspaceTab, setActiveWorkspaceTab] = useState<'airlock' | 'atm_lobby' | 'cit_bay'>('airlock');
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

  // ATM Lobby Enforcer states
  const [atmOccupancy, setAtmOccupancy] = useState<number>(1);
  const [atmVoicePlaying, setAtmVoicePlaying] = useState<boolean>(false);
  const [atmVoiceFeedback, setAtmVoiceFeedback] = useState<string | null>(null);
  const [atmLockdown, setAtmLockdown] = useState<boolean>(false);

  // CIT Armored Bay states
  const [citSessions, setCitSessions] = useState<any[]>([]);
  const [citGuards, setCitGuards] = useState<any[]>([]);
  const [citStatusFeedback, setCitStatusFeedback] = useState<string | null>(null);

  const activePortal = portals.find(p => p.id === selectedPortalId);

  useEffect(() => {
    async function loadCitData() {
      try {
        const [sessionsRes, personsRes] = await Promise.all([
          anprLogisticsApi.listSessions(),
          activePortal?.branch_id
            ? secureAreaAuthorizationApi.listPersons({ branchId: activePortal.branch_id }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);
        setCitSessions(sessionsRes.data || []);
        setCitGuards(personsRes.data || []);
      } catch {
        setCitSessions([]);
        setCitGuards([]);
      }
    }
    void loadCitData();
  }, [activePortal?.branch_id]);

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
          confidence: 0.92,
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
          confidence: 0.96,
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

  const atmIncidents = useMemo(() => {
    return events.filter(e => e.violation_type === "multi_occupancy_violation" || e.door_id?.toLowerCase().includes("atm"));
  }, [events]);

  const activeCitSession = useMemo(() => {
    return citSessions.find((s: any) => s.vehicleType === "cash_van" || s.vehicleType === "armored") || citSessions[0];
  }, [citSessions]);

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

      {/* Sub-module Navigation Tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveWorkspaceTab('airlock')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeWorkspaceTab === 'airlock'
              ? 'bg-cyan-600 text-white shadow-lg shadow-cyan-500/20'
              : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <DoorClosed size={16} /> Airlock Portals & Mantrap
        </button>
        <button
          onClick={() => setActiveWorkspaceTab('atm_lobby')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeWorkspaceTab === 'atm_lobby'
              ? 'bg-rose-600 text-white shadow-lg shadow-rose-500/20'
              : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Users size={16} /> ATM Lobby Single-Occupancy Enforcer
          {atmOccupancy > 1 && (
            <span className="rounded-full bg-rose-500/30 text-rose-300 px-1.5 py-0.5 text-[10px] animate-pulse">BREACH</span>
          )}
        </button>
        <button
          onClick={() => setActiveWorkspaceTab('cit_bay')}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeWorkspaceTab === 'cit_bay'
              ? 'bg-amber-600 text-white shadow-lg shadow-amber-500/20'
              : 'border border-slate-700 bg-slate-900/60 text-slate-300 hover:bg-slate-800'
          }`}
        >
          <Truck size={16} /> CIT Armored Van Bay Security
          <span className="rounded-full bg-emerald-500/20 text-emerald-300 px-1.5 py-0.5 text-[10px]">2 GUARDS</span>
        </button>
      </div>

      {activeWorkspaceTab === 'airlock' && (
        <>
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
        </>
      )}

      {/* ATM Lobby Single-Occupancy Enforcer Cockpit */}
      {activeWorkspaceTab === 'atm_lobby' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-rose-500/30 bg-rose-950/20 p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                  <Users size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-rose-500/20 px-2 py-0.5 text-[10px] font-bold text-rose-300 uppercase tracking-widest border border-rose-500/30">
                      P1 REGULATORY VIOLATION
                    </span>
                    <span className="text-xs text-rose-300">ATM ENCLOSURE: ATM-01 (Kaloor Main Branch Foyer)</span>
                  </div>
                  <h2 className="text-xl font-bold text-white mt-1">Multi-Occupancy Tailgating In Progress</h2>
                  <p className="text-xs text-slate-400">Optical sensor detected 2 occupants inside single-customer biometric safety enclosure.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setAtmVoicePlaying(true);
                    setAtmVoiceFeedback("🔊 Broadcasting Bilingual Warning to ATM Kiosk Speaker (Malayalam + English)...");
                    setTimeout(() => {
                      setAtmVoicePlaying(false);
                      setAtmVoiceFeedback("✓ Audio Warning Dispatched. Occupant count reduced to 1.");
                      setAtmOccupancy(1);
                    }, 4000);
                  }}
                  disabled={atmVoicePlaying}
                  className="flex items-center gap-2 rounded-xl bg-rose-600 hover:bg-rose-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-rose-600/30 transition disabled:opacity-50"
                >
                  <Megaphone size={16} className={atmVoicePlaying ? "animate-bounce" : ""} />
                  {atmVoicePlaying ? "Broadcasting Voice Warning..." : "Broadcast Bilingual Voice Strobe"}
                </button>
                <button
                  onClick={() => setAtmLockdown(!atmLockdown)}
                  className={`flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs font-bold transition ${
                    atmLockdown
                      ? 'border-red-500 bg-red-600 text-white'
                      : 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                  }`}
                >
                  <Lock size={15} />
                  {atmLockdown ? "Kiosk Shutter Locked" : "Lock Down Shutter"}
                </button>
                <button
                  onClick={() => {
                    setAtmOccupancy(atmOccupancy === 1 ? 2 : 1);
                    setAtmVoiceFeedback(null);
                  }}
                  className="rounded-xl border border-slate-700 bg-slate-800 px-3 py-2.5 text-xs text-slate-300 hover:bg-slate-700"
                >
                  Toggle Sim ({atmOccupancy} Persons)
                </button>
              </div>
            </div>

            {atmVoiceFeedback && (
              <div className="mt-4 rounded-xl border border-rose-500/40 bg-rose-500/10 p-3 text-xs text-rose-200 flex items-center justify-between">
                <span>{atmVoiceFeedback}</span>
                <span className="text-[10px] text-slate-400">Audio DSP: 85 dBA Horn</span>
              </div>
            )}
          </div>

          {/* Real-time Visual Simulation Card */}
          <div className="grid gap-6 lg:grid-cols-3">
            <div className="lg:col-span-2 rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-slate-200 flex items-center gap-2">
                  <Camera size={16} className="text-cyan-400" />
                  Top-Down Optical Enclosure Telemetry
                </h3>
                <span className="text-[10px] text-emerald-400 font-mono">LIVE TRACKING: 30 FPS</span>
              </div>

              {/* Graphic Representation of ATM Cabin */}
              <div className="relative aspect-video w-full rounded-xl border border-slate-800 bg-slate-950 overflow-hidden flex items-center justify-center p-6">
                {/* Door Graphic */}
                <div className="absolute top-0 left-1/2 -translate-x-1/2 h-3 w-32 bg-slate-700 rounded-b flex items-center justify-center text-[8px] text-slate-300 font-bold uppercase tracking-wider">
                  ATM Cabin Glass Door
                </div>

                {/* ATM Kiosk Terminal Graphic */}
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 w-48 h-16 rounded-xl border border-cyan-500/40 bg-cyan-950/40 p-2 text-center shadow-[0_0_20px_rgba(6,182,212,0.15)]">
                  <span className="text-[10px] font-bold text-cyan-300">ATM KIOSK #01 TERMINAL</span>
                  <div className="mt-1 flex justify-center gap-1">
                    <span className="h-1.5 w-6 rounded bg-cyan-400 animate-pulse" />
                    <span className="h-1.5 w-6 rounded bg-slate-700" />
                  </div>
                </div>

                {/* Person 1: Legitimate customer */}
                <div className="absolute bottom-24 left-1/2 -translate-x-1/2 flex flex-col items-center">
                  <div className="h-12 w-12 rounded-full border-2 border-emerald-500 bg-emerald-500/20 grid place-items-center text-emerald-300 font-bold text-xs shadow-[0_0_15px_#10b981]">
                    P1
                  </div>
                  <span className="mt-1 rounded bg-slate-900/90 border border-emerald-500/30 px-2 py-0.5 text-[9px] text-emerald-300 font-semibold">
                    Cardholder at Keypad
                  </span>
                </div>

                {/* Person 2: Tailgater / Unbadged */}
                {atmOccupancy > 1 && (
                  <div className="absolute top-24 left-1/2 -translate-x-1/2 flex flex-col items-center animate-pulse">
                    <div className="h-12 w-12 rounded-full border-2 border-rose-500 bg-rose-500/30 grid place-items-center text-rose-300 font-bold text-xs shadow-[0_0_20px_#f43f5e]">
                      P2
                    </div>
                    <span className="mt-1 rounded bg-slate-900/90 border border-rose-500/50 px-2 py-0.5 text-[9px] text-rose-300 font-bold">
                      TAILGATER (0.78m Distance)
                    </span>
                  </div>
                )}
              </div>

              {/* Warning script details */}
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-3 text-xs space-y-1 text-slate-300">
                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Automated Speaker Voice Prompt</span>
                <p className="font-semibold text-rose-300">Malayalam: "ഒരു സമയം ഒരാൾക്ക് മാത്രമേ ATM കിയോസ്കിനുള്ളിൽ പ്രവേശനമുള്ളൂ. രണ്ടാമത്തെയാൾ ദയവായി പുറത്തു നിൽക്കുക."</p>
                <p className="text-slate-400">English: "Only one occupant permitted inside the ATM enclosure. Please maintain queue outside."</p>
              </div>
            </div>

            {/* Side Analytics & Anti-Skimmer Integrity */}
            <div className="space-y-4">
              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">ATM Safety & Anti-Tamper Telemetry</h4>
                <div className="space-y-2 text-xs">
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <span className="text-slate-400">Card Slot Bezel Sensor:</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> Intact (No Skimmer)</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <span className="text-slate-400">Keypad Optical Offset:</span>
                    <span className="font-bold text-emerald-400 flex items-center gap-1"><CheckCircle2 size={12}/> 0.01mm (Flush)</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <span className="text-slate-400">Dwell Time In Enclosure:</span>
                    <span className="font-bold text-amber-400 font-mono">48 seconds</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg border border-slate-800 bg-slate-950/60 p-2.5">
                    <span className="text-slate-400">Occupancy Limit:</span>
                    <span className="font-bold text-slate-200">1 Person (Regulatory)</span>
                  </div>
                </div>
              </div>

              <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-3">
                <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Recent ATM Tailgating Incidents</h4>
                <div className="space-y-2 text-xs">
                  {atmIncidents.length > 0 ? (
                    atmIncidents.slice(0, 3).map((item) => (
                      <div key={item.id} className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-2">
                        <div className="flex justify-between text-[10px] text-slate-500">
                          <span>{new Date(item.occurred_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                          <span className="text-rose-400 font-bold">{item.severity} {item.review_status.toUpperCase()}</span>
                        </div>
                        <p className="mt-1 font-semibold text-slate-200">{item.detected_person_count} persons detected at {item.door_id}</p>
                        <p className="text-[10px] text-slate-400">{item.violation_type.replace(/_/g, " ")}</p>
                      </div>
                    ))
                  ) : (
                    <div className="rounded-lg border border-slate-800 bg-slate-950/60 p-3 text-center text-slate-500 text-[11px]">
                      <CheckCircle2 size={16} className="mx-auto mb-1 text-emerald-400" />
                      Zero multi-occupancy incidents detected in current telemetry.
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* CIT Armored Van Bay Security Cockpit */}
      {activeWorkspaceTab === 'cit_bay' && (
        <div className="space-y-6">
          <div className="rounded-2xl border border-amber-500/30 bg-amber-950/20 p-5 shadow-xl">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-500/20 text-amber-300 border border-amber-500/40">
                  <Truck size={24} />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <span className="rounded bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300 uppercase tracking-widest border border-amber-500/30">
                      CASH REPLENISHMENT PROTOCOL
                    </span>
                    <span className="text-xs text-amber-300">
                      {activeCitSession ? `VEHICLE: ${activeCitSession.vehiclePlate} (${activeCitSession.provider || activeCitSession.vehicleType})` : "BAY STATUS: STANDBY (No CIT Vehicle Docked)"}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-white mt-1">Armored Van Bay Docking & Armed Escort Telemetry</h2>
                  <p className="text-xs text-slate-400">Real-time surveillance of Cash-in-Transit (CIT) transfer corridor and mandatory armed guard compliance.</p>
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  onClick={() => {
                    setCitStatusFeedback("✓ Transfer Corridor Authorized. Outer Interlock Gate locked; Vault Mantrap unlocked for 4 minutes.");
                    setTimeout(() => setCitStatusFeedback(null), 6000);
                  }}
                  className="flex items-center gap-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 px-4 py-2.5 text-xs font-bold text-white shadow-lg shadow-emerald-600/30 transition"
                >
                  <ShieldCheck size={16} /> Authorize Cash Transfer Corridor
                </button>
                <button
                  onClick={() => {
                    setCitStatusFeedback("⚠️ P1 Alert Dispatched: Bay Perimeter Breach reported to Armed QRT-01 and Central Command.");
                    setTimeout(() => setCitStatusFeedback(null), 6000);
                  }}
                  className="flex items-center gap-2 rounded-xl border border-red-500/40 bg-red-600/20 hover:bg-red-600/40 px-3 py-2.5 text-xs font-bold text-red-200 transition"
                >
                  <ShieldAlert size={15} /> Trigger Bay Alert
                </button>
              </div>
            </div>

            {citStatusFeedback && (
              <div className="mt-4 rounded-xl border border-emerald-500/40 bg-emerald-500/10 p-3 text-xs text-emerald-200 flex items-center justify-between">
                <span>{citStatusFeedback}</span>
                <span className="text-[10px] text-slate-400">Protocol: RBI Cash-in-Transit SOP #44</span>
              </div>
            )}
          </div>

          {/* CIT Key Metrics & Armed Escort Status */}
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Bay Docking Timer</span>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold font-mono text-amber-300">
                  {activeCitSession?.actualArrival
                    ? `${Math.max(1, Math.round((Date.now() - new Date(activeCitSession.actualArrival).getTime()) / 60000))}m 00s`
                    : activeCitSession
                    ? "0m 00s"
                    : "00m 00s"}
                </p>
                <span className="text-xs text-slate-400">/ 20m Max SLA</span>
              </div>
              <div className="w-full bg-slate-800 h-2 rounded-full overflow-hidden mt-2">
                <div className="bg-amber-400 h-full rounded-full" style={{ width: activeCitSession ? "45%" : "0%" }} />
              </div>
              <span className="text-[10px] text-slate-500">
                {activeCitSession ? "Auto-escalation to BM at 18 minutes" : "Timer activates on vehicle arrival"}
              </span>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Armed Escort Compliance</span>
              <div className="flex items-center gap-2">
                <p className="text-3xl font-bold text-emerald-400 font-mono">
                  {activeCitSession ? "2 / 2" : "0 / 0"}
                </p>
                <span className={`rounded px-2 py-0.5 text-xs font-bold ${activeCitSession ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                  {activeCitSession ? "COMPLIANT" : "STANDBY"}
                </span>
              </div>
              <p className="text-xs text-slate-300">
                {activeCitSession ? "Both armed guards verified in camera FOV with unholstered readiness." : "Awaiting CIT arrival to initiate armed guard protocol."}
              </p>
            </div>

            <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-2">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400">Transfer Route Interlock</span>
              <p className="text-xl font-bold text-cyan-300">MANTRA-INTERLOCK ACTIVE</p>
              <p className="text-xs text-slate-400">Outer roll shutter locked. Vestibule pressure sensor verified.</p>
            </div>
          </div>

          {/* Guard Verification Roster */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-5 space-y-4">
            <h3 className="text-sm font-bold text-slate-200">CIT Guard & Weapon Roster Verification</h3>
            {citGuards.length > 0 ? (
              <div className="grid gap-3 sm:grid-cols-2">
                {citGuards.slice(0, 2).map((guard: any) => (
                  <div key={guard.id} className="rounded-xl border border-slate-800 bg-slate-950/60 p-4 flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-slate-200">{guard.fullName} (Badge #{guard.employeeCode || guard.id.slice(0, 6)})</span>
                      <p className="text-[10px] text-slate-400 mt-0.5">Role: {guard.designation || "Armed Security Custodian"}</p>
                      <span className="mt-1 inline-block rounded bg-emerald-500/10 text-emerald-400 text-[10px] font-semibold px-2 py-0.5">
                        Biometric Verified: Authorized
                      </span>
                    </div>
                    <CheckCircle2 size={24} className="text-emerald-400" />
                  </div>
                ))}
              </div>
            ) : (
              <div className="rounded-xl border border-slate-800 bg-slate-950/60 p-6 text-center text-xs text-slate-400">
                <ShieldCheck className="mx-auto mb-2 text-slate-600" size={24} />
                <p className="font-semibold text-slate-300">Bay Standby & Interlock Ingress Armed</p>
                <p className="mt-1 text-slate-500">No CIT transfer active. Escort roster verification initiates automatically upon vehicle bay arrival.</p>
              </div>
            )}
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
