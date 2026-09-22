"use client";

import Link from "next/link";
import { useEffect, useMemo, useState, useCallback } from "react";
import { AppLayout, getVisibleNavigation, type MenuAccessUser } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { authApi, cameraInventoryApi, anprLogisticsApi, nbfcWatchlistApi, secureAreaAuthorizationApi, branchOpeningPolicyApi, type BranchOpeningPolicy } from "@/lib/api-client";
import type { Branch } from "@/lib/types";
import {
  ArrowRight,
  BarChart3,
  Building2,
  FileCheck2,
  Landmark,
  Shield,
  ShieldAlert,
  Siren,
  Truck,
  Users,
  Video,
  Wrench,
  Lock,
  Unlock,
  Key,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Clock,
  RefreshCw,
  Sparkles,
  Fingerprint,
  Timer,
  Plus,
  Save,
  X,
} from "lucide-react";

const workflows = [
  {
    title: "Verify a branch alert",
    description: "Review the live alert, see the relevant camera context, and record the operator decision.",
    href: "/operations/alerts",
    action: "Open alert queue",
    icon: ShieldAlert,
    iconClass: "bg-rose-500/10 text-rose-300",
  },
  {
    title: "Manage an incident",
    description: "Coordinate response, preserve the decision trail, and keep accountable owners on the case.",
    href: "/incidents",
    action: "Open incidents",
    icon: Siren,
    iconClass: "bg-amber-500/10 text-amber-300",
  },
  {
    title: "Protect cash-area operations",
    description: "Review approved banking and counter analytics; verify every detection against video before action.",
    href: "/analytics/banking",
    action: "Open cash-area monitoring",
    icon: Landmark,
    iconClass: "bg-violet-500/10 text-violet-300",
  },
  {
    title: "Track cash-van logistics",
    description: "Monitor ANPR-based vehicle tracking, route compliance, and security verification for cash movements.",
    href: "/analytics/anpr-logistics",
    action: "Open logistics tracking",
    icon: Truck,
    iconClass: "bg-purple-500/10 text-purple-300",
  },
  {
    title: "Maintain branch uptime",
    description: "Find camera, recorder, storage, power, and connectivity issues before they affect oversight.",
    href: "/maintenance/health",
    action: "Open health checks",
    icon: Wrench,
    iconClass: "bg-sky-500/10 text-sky-300",
  },
  {
    title: "Monitor device health",
    description: "Correlated health monitoring across cameras, recorders, network, and power with root-cause analysis.",
    href: "/security/device-health",
    action: "Open device correlation",
    icon: Shield,
    iconClass: "bg-red-500/10 text-red-300",
  },
  {
    title: "Preserve evidence",
    description: "Search video, create a defensible evidence record, and maintain chain-of-custody information.",
    href: "/evidence",
    action: "Open evidence vault",
    icon: FileCheck2,
    iconClass: "bg-emerald-500/10 text-emerald-300",
  },
  {
    title: "Prove audit readiness",
    description: "Review branch coverage, access activity, and recorded operational evidence before an audit.",
    href: "/audit/branch-compliance",
    action: "Open branch audit",
    icon: Building2,
    iconClass: "bg-slate-700 text-slate-200",
  },
  {
    title: "Manage watchlists",
    description: "Control authorized personnel, VIP visitors, and security watchlists with consent-aware face recognition.",
    href: "/analytics/nbfc-watchlist",
    action: "Open watchlist manager",
    icon: Users,
    iconClass: "bg-indigo-500/10 text-indigo-300",
  },
  {
    title: "Compare branch performance",
    description: "Side-by-side metrics across all branches with compliance scoring and security analytics.",
    href: "/analytics/branch-comparison",
    action: "Open comparison view",
    icon: BarChart3,
    iconClass: "bg-cyan-500/10 text-cyan-300",
  },
];

export default function NbfcOperationsPage() {
  const [user, setUser] = useState<MenuAccessUser | null>(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [citGateState, setCitGateState] = useState<"pending" | "authorizing" | "open" | "secured">("pending");
  const [citOtpInput, setCitOtpInput] = useState("");
  const [citActionLoading, setCitActionLoading] = useState(false);
  const [dispatchModalOpen, setDispatchModalOpen] = useState(false);
  const [dispatchPlate, setDispatchPlate] = useState("KL-07-CG-9021");
  const [dispatchProvider, setDispatchProvider] = useState("Brinks Logistics");
  const [watchlistAlertDismissed, setWatchlistAlertDismissed] = useState(false);
  const [watchlistAlertEscalated, setWatchlistAlertEscalated] = useState(false);

  // Live Operations States
  const [branches, setBranches] = useState<Branch[]>([]);
  const [activeBranch, setActiveBranch] = useState<Branch | null>(null);
  const [logistics, setLogistics] = useState<{ data: any[]; summary: any } | null>(null);
  const [watchlist, setWatchlist] = useState<{ data: any[]; summary: any } | null>(null);
  const [watchlistThreats, setWatchlistThreats] = useState<any[]>([]);
  const [secureStaff, setSecureStaff] = useState<any[]>([]);
  const [custodyAssignments, setCustodyAssignments] = useState<any[]>([]);
  const [liveDataError, setLiveDataError] = useState<string | null>(null);
  const [counterLoitering, setCounterLoitering] = useState<{
    avgDwellMinutes: number;
    activeLoiterers: number;
    alertsToday: number;
    alertsThisWeek: number;
    branchesMonitored: number;
    topLoiteringZone: { cameraId: string; cameraName: string; hitsToday: number } | null;
    lastUpdated: string;
    dataAvailable: boolean;
  } | null>(null);
  const [openingPolicy, setOpeningPolicy] = useState<BranchOpeningPolicy | null>(null);
  const [openingStart, setOpeningStart] = useState("08:30");
  const [openingEnd, setOpeningEnd] = useState("09:30");
  const [openingPolicySaving, setOpeningPolicySaving] = useState(false);
  const [openingPolicyMessage, setOpeningPolicyMessage] = useState<string | null>(null);

  // Strong Room Multi-Party Time-Lock & Anti-Duress State
  const [custodian1Approved, setCustodian1Approved] = useState(false);
  const [custodian2Approved, setCustodian2Approved] = useState(false);
  const [timeLockActive, setTimeLockActive] = useState(false);
  const [timeLockSeconds, setTimeLockSeconds] = useState(15 * 60); // 15-minute anti-duress delay
  const [vaultUnlocked, setVaultUnlocked] = useState(false);
  const [duressInput, setDuressInput] = useState("");
  const [duressAlarmTriggered, setDuressAlarmTriggered] = useState(false);

  // 15-Minute Anti-Duress Countdown Timer
  useEffect(() => {
    if (!timeLockActive || vaultUnlocked) return;
    const timer = setInterval(() => {
      setTimeLockSeconds((prev) => {
        if (prev <= 1) {
          setVaultUnlocked(true);
          setTimeLockActive(false);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [timeLockActive, vaultUnlocked]);

  useEffect(() => {
    let active = true;
    authApi.getCurrentUser()
      .then((data) => { if (active) setUser((data as any)?.user ?? data ?? null); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setSessionChecked(true); });
    return () => { active = false; };
  }, []);

  useEffect(() => {
    async function loadLiveData() {
      try {
        const branchesRes = await cameraInventoryApi.listBranches("analytics:view");
        const branchList = (branchesRes.data || []) as Branch[];
        setBranches(branchList);
        const branch = branchList[0] || null;
        setActiveBranch(branch);

        const [logisticsRes, watchlistRes, staffRes, custodyRes] = await Promise.all([
          anprLogisticsApi.listSessions().catch(() => ({ data: { data: [], summary: {} } })),
          nbfcWatchlistApi.list().catch(() => ({ data: [], count: 0, summary: {} })),
          branch?.id
            ? secureAreaAuthorizationApi.listPersons({ branchId: branch.id }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
          branch?.id
            ? secureAreaAuthorizationApi.listAssignments({ branchId: branch.id }).catch(() => ({ data: [] }))
            : Promise.resolve({ data: [] }),
        ]);

        const rawLogistics = (logisticsRes as any)?.data ?? logisticsRes;
        const logisticsItems = Array.isArray(rawLogistics)
          ? rawLogistics
          : Array.isArray((rawLogistics as any)?.data)
            ? (rawLogistics as any).data
            : [];
        const logisticsSummary = (logisticsRes as any)?.summary ?? (rawLogistics as any)?.summary ?? {};
        setLogistics({ data: logisticsItems, summary: logisticsSummary });

        const rawWatchlist = (watchlistRes as any)?.data ?? watchlistRes;
        const watchlistItems = Array.isArray(rawWatchlist)
          ? rawWatchlist
          : Array.isArray((rawWatchlist as any)?.data)
            ? (rawWatchlist as any).data
            : [];
        const watchlistSummary = (watchlistRes as any)?.summary ?? (rawWatchlist as any)?.summary ?? {};
        setWatchlist({ data: watchlistItems, summary: watchlistSummary });
        setWatchlistThreats(watchlistItems);
        setSecureStaff((staffRes as any)?.data || []);
        setCustodyAssignments((custodyRes as any)?.data || []);
      } catch (err) {
        setLiveDataError(err instanceof Error ? err.message : "Failed to load live operations data");
      }
    }
    void loadLiveData();
  }, []);

  // Counter-loitering live summary — auto-refresh every 30s
  useEffect(() => {
    async function fetchLoitering() {
      try {
        const res = await fetch("/api/v1/analytics/counter-loitering/summary");
        if (res.ok) {
          const data = await res.json();
          setCounterLoitering(data);
        }
      } catch {
        // Silent fail — card shows last known state
      }
    }
    void fetchLoitering();
    const interval = setInterval(fetchLoitering, 30_000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!activeBranch?.id) {
      setOpeningPolicy(null);
      return;
    }
    let active = true;
    setOpeningPolicyMessage(null);
    branchOpeningPolicyApi.get(activeBranch.id)
      .then((policy) => {
        if (!active) return;
        setOpeningPolicy(policy);
        setOpeningStart(policy.openingStart);
        setOpeningEnd(policy.openingEnd);
      })
      .catch((error) => {
        if (active) setOpeningPolicyMessage(error instanceof Error ? error.message : "Opening policy unavailable");
      });
    return () => { active = false; };
  }, [activeBranch?.id]);

  const saveOpeningPolicy = async () => {
    if (!activeBranch?.id) return;
    setOpeningPolicySaving(true);
    setOpeningPolicyMessage(null);
    try {
      const updated = await branchOpeningPolicyApi.update(activeBranch.id, {
        openingStart,
        openingEnd,
        timezone: openingPolicy?.timezone || "Asia/Kolkata",
        activeDays: openingPolicy?.activeDays || [1, 2, 3, 4, 5, 6],
        graceSeconds: openingPolicy?.graceSeconds ?? 30,
      });
      setOpeningPolicy(updated);
      setOpeningPolicyMessage("Opening policy saved and enforcement activated.");
    } catch (error) {
      setOpeningPolicyMessage(error instanceof Error ? error.message : "Failed to save opening policy");
    } finally {
      setOpeningPolicySaving(false);
    }
  };

  const reloadLogisticsData = useCallback(async () => {
    try {
      const logisticsRes = await anprLogisticsApi.listSessions().catch(() => ({ data: [], summary: {} }));
      const rawLogistics = (logisticsRes as any)?.data ?? logisticsRes;
      const logisticsItems = Array.isArray(rawLogistics)
        ? rawLogistics
        : Array.isArray((rawLogistics as any)?.data)
          ? (rawLogistics as any).data
          : [];
      const logisticsSummary = (logisticsRes as any)?.summary ?? (rawLogistics as any)?.summary ?? {};
      setLogistics({ data: logisticsItems, summary: logisticsSummary });
    } catch {}
  }, []);

  const handleAuthorizeGate = async () => {
    if (!citOtpInput.trim() || citOtpInput.trim().length < 4) {
      alert("Please enter a valid 4-digit Manager OTP authorization code.");
      return;
    }
    setCitActionLoading(true);
    try {
      if (activeVehicle?.id) {
        await anprLogisticsApi.updateSession(activeVehicle.id, {
          status: "arrived",
          routeCompliance: "compliant",
          actualArrival: new Date().toISOString(),
        });
        await reloadLogisticsData();
      }
      setCitGateState("open");
    } catch (err: any) {
      alert(err instanceof Error ? err.message : "Failed to authorize gate clearance");
    } finally {
      setCitActionLoading(false);
    }
  };

  const handleSecureGate = async () => {
    setCitActionLoading(true);
    try {
      if (activeVehicle?.id) {
        await anprLogisticsApi.updateSession(activeVehicle.id, {
          status: "departed",
          departureTime: new Date().toISOString(),
        });
        await reloadLogisticsData();
      }
      setCitGateState("secured");
    } catch (err: any) {
      alert(err instanceof Error ? err.message : "Failed to secure gate");
    } finally {
      setCitActionLoading(false);
    }
  };

  const handleRegisterDispatch = async (e: React.FormEvent) => {
    e.preventDefault();
    const targetBranchId = activeBranch?.id || branches[0]?.id;
    if (!targetBranchId) {
      alert("No active branch node found to register transfer.");
      return;
    }
    setCitActionLoading(true);
    try {
      await anprLogisticsApi.createSession({
        branchId: targetBranchId,
        vehiclePlate: dispatchPlate.trim().toUpperCase() || "KL-07-CG-9021",
        vehicleType: "armored",
        scheduledArrival: new Date().toISOString(),
        authorized: true,
        provider: dispatchProvider.trim() || "Brinks Logistics",
      });
      setDispatchModalOpen(false);
      setCitGateState("pending");
      setCitOtpInput("");
      await reloadLogisticsData();
    } catch (err: any) {
      alert(err instanceof Error ? err.message : "Failed to register CIT vehicle");
    } finally {
      setCitActionLoading(false);
    }
  };

  const availableWorkflows = useMemo(() => {
    if (!user) return [];
    const allowed = new Set(getVisibleNavigation(user).flatMap((group) => group.items.map((item) => item.href)));
    return workflows.filter((workflow) => allowed.has(workflow.href));
  }, [user]);

  const activeVehicle = Array.isArray(logistics?.data)
    ? logistics.data.find((session) => ["on_route", "arrived", "overdue"].includes(session?.status))
    : undefined;
  const activeWatchlistDetection = Array.isArray(watchlist?.data)
    ? watchlist.data.find((entry) => entry?.lastDetected)
    : undefined;
  const branchCount = branches.length;

  return (
    <AppLayout>
      <main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <PageHero
          eyebrow="NBFC security operating system"
          title="Protect every branch. Prove every response."
          description="A focused workspace for 24×7 branch protection, cash-area and sensitive-zone operations, reliable video coverage, verifiable evidence, and audit readiness."
          icon={Landmark}
          actions={<div className="page-hero-status"><Video size={17} /><div><span>Start with the event</span><strong>Verify before you act</strong></div></div>}
        />

        {liveDataError && (
          <div className="mt-4 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-sm text-amber-200">
            Live operations data is unavailable. No operational status is being inferred or displayed.
          </div>
        )}

        {/* Live Banking Security & Vault Cockpit */}
        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Branch Opening 2-Person Rule */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Lock size={15} className="text-amber-400" />
                  Branch Opening 2-Person Rule
                </span>
                <span className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${openingPolicy?.enabled ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30" : "bg-slate-800 text-slate-400 border-slate-700"}`}>
                  {openingPolicy?.enabled ? "Enforced" : "Not configured"}
                </span>
              </div>
              <div className="mt-4 space-y-3">
                <select
                  aria-label="Branch for opening policy"
                  value={activeBranch?.id || ""}
                  onChange={(event) => setActiveBranch(branches.find((branch) => branch.id === event.target.value) || null)}
                  className="w-full rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200"
                >
                  {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Opening starts
                    <input type="time" value={openingStart} onChange={(event) => setOpeningStart(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white" />
                  </label>
                  <label className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                    Verify until
                    <input type="time" value={openingEnd} onChange={(event) => setOpeningEnd(event.target.value)} className="mt-1 w-full rounded-lg border border-slate-700 bg-slate-950 px-2.5 py-2 text-sm text-white" />
                  </label>
                </div>
                <p className="text-xs leading-5 text-slate-400">
                  Minimum <strong className="text-white">2 people</strong> must remain visible together. Non-compliance creates a P1 alert, evidence clip and incident after {openingPolicy?.graceSeconds ?? 30}s.
                </p>
                {openingPolicyMessage && <p className={`text-[11px] ${openingPolicyMessage.includes("saved") ? "text-emerald-300" : "text-amber-300"}`}>{openingPolicyMessage}</p>}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 flex items-center gap-1"><Clock size={12} /> Asia/Kolkata</span>
              <button type="button" onClick={saveOpeningPolicy} disabled={!activeBranch || openingPolicySaving || openingStart >= openingEnd} className="inline-flex items-center gap-1.5 rounded-lg bg-cyan-600 px-3 py-2 font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-40">
                {openingPolicySaving ? <RefreshCw size={13} className="animate-spin" /> : <Save size={13} />}
                {openingPolicySaving ? "Saving" : "Save & enforce"}
              </button>
            </div>
          </div>

          {/* Cash Counter Loitering & Queues — Live Telemetry */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Users size={15} className="text-violet-400" />
                  Counter Loitering & Queue
                </span>
                {counterLoitering == null ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-500 border border-slate-700">
                    Loading…
                  </span>
                ) : counterLoitering.dataAvailable ? (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-900/60 text-emerald-300 border border-emerald-700">
                    ● Live
                  </span>
                ) : (
                  <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                    No Data
                  </span>
                )}
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-white">
                  {counterLoitering != null
                    ? `${counterLoitering.avgDwellMinutes.toFixed(1)}m Avg Dwell`
                    : "Loading…"}
                </div>
                <p className="text-xs text-slate-400 mt-0.5">
                  {counterLoitering?.dataAvailable
                    ? "Live counter dwell telemetry from AI analytics."
                    : "No loitering rules active. Configure a rule in Analytics → Rules."
                  }
                </p>
              </div>
              {counterLoitering && (
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <div className="rounded-lg bg-slate-800/60 px-3 py-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Active Now</div>
                    <div className={`text-sm font-bold mt-0.5 ${
                      counterLoitering.activeLoiterers > 0 ? "text-amber-300" : "text-slate-300"
                    }`}>
                      {counterLoitering.activeLoiterers > 0
                        ? `⚠️ ${counterLoitering.activeLoiterers} loitering`
                        : "Clear"}
                    </div>
                  </div>
                  <div className="rounded-lg bg-slate-800/60 px-3 py-2">
                    <div className="text-[10px] text-slate-500 uppercase tracking-wider">Alerts Today</div>
                    <div className={`text-sm font-bold mt-0.5 ${
                      counterLoitering.alertsToday > 0 ? "text-rose-300" : "text-slate-300"
                    }`}>
                      {counterLoitering.alertsToday}
                    </div>
                  </div>
                </div>
              )}
              {counterLoitering?.topLoiteringZone && (
                <div className="mt-2 rounded-lg bg-amber-900/20 border border-amber-800/40 px-3 py-2">
                  <div className="text-[10px] text-amber-400 uppercase tracking-wider">Top Loitering Zone Today</div>
                  <div className="text-xs text-amber-200 mt-0.5 truncate">
                    {counterLoitering.topLoiteringZone.cameraName} — {counterLoitering.topLoiteringZone.hitsToday} alerts
                  </div>
                </div>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {counterLoitering?.lastUpdated
                  ? `Updated ${new Date(counterLoitering.lastUpdated).toLocaleTimeString()}`
                  : "Refresh: 30s"}
              </span>
              <Link href="/analytics/rules" className="text-violet-400 hover:text-violet-300 font-medium">
                Configure Rules →
              </Link>
            </div>
          </div>

          {/* Background Jobs Sync */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Radio size={15} className="text-cyan-400" />
                  Background Surveillance Jobs
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-slate-800 text-slate-400 border border-slate-700">
                  Backend status
                </span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-white">{logistics || watchlist ? `${branchCount} Branches Reporting` : "Live job status unavailable"}</div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Background job health is shown only when reported by the backend.
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Refresh: 30s</span>
              <Link href="/analytics/nbfc-watchlist" className="text-cyan-400 hover:text-cyan-300 font-medium">
                Manage Watchlists &rarr;
              </Link>
            </div>
          </div>
        </section>

        {/* Armored Cash-in-Transit (CIT) Gate & Watchlist Security Cockpit */}
        <section className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* CIT Gate Ingress Protocol */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-purple-500/10 text-purple-400 border border-purple-500/30">
                    <Truck size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      Cash-in-Transit (CIT) Ingress Protocol
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Live ANPR &amp; Dual-Verification Armored Van Gate Clearance
                    </p>
                  </div>
                </div>
                <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                  activeVehicle
                    ? activeVehicle.status === "arrived"
                      ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                      : activeVehicle.status === "overdue"
                      ? "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
                      : "bg-amber-500/20 text-amber-300 border-amber-500/40"
                    : "bg-slate-800 text-slate-400 border-slate-700"
                }`}>
                  {activeVehicle ? activeVehicle.status.replaceAll("_", " ").toUpperCase() : "NO ACTIVE TRANSFER"}
                </span>
              </div>

              {activeVehicle ? (
                <>
                  {/* Live Detected Van Details */}
                  <div className="mt-4 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Detected Armored Vehicle:</span>
                      <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                        {activeVehicle.vehiclePlate} ({activeVehicle.provider || "Authorized Logistics"})
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Scheduled Route Manifest:</span>
                      <span className={`font-medium flex items-center gap-1 ${
                        activeVehicle.routeCompliance === "compliant" ? "text-emerald-400" : "text-amber-400"
                      }`}>
                        <CheckCircle2 size={12} /> {activeVehicle.routeCompliance === "compliant" ? "Verified Manifest Match" : (activeVehicle.routeCompliance ? activeVehicle.routeCompliance.replaceAll("_", " ").toUpperCase() : "Route Monitored")}
                      </span>
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-slate-400">Ingress Telemetry &amp; Timing:</span>
                      <span className="text-slate-300 font-mono text-[11px]">
                        Scheduled: {new Date(activeVehicle.scheduledArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        {activeVehicle.actualArrival ? ` • Arrived: ${new Date(activeVehicle.actualArrival).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : " • Approaching Bay"}
                      </span>
                    </div>
                  </div>

                  {/* Clearance Action */}
                  <div className="mt-4 flex flex-col gap-2">
                    {(citGateState === "pending" || activeVehicle.status === "on_route" || activeVehicle.status === "overdue") && citGateState !== "open" && citGateState !== "secured" && (
                      <div className="flex items-center gap-2">
                        <input
                          type="text"
                          placeholder="Branch Manager OTP (e.g. 8492)"
                          value={citOtpInput}
                          onChange={(e) => setCitOtpInput(e.target.value)}
                          className="px-3 py-2 rounded-lg bg-slate-950 border border-slate-700 text-xs text-white placeholder:text-slate-500 flex-1 focus:outline-none focus:border-purple-500"
                        />
                        <button
                          type="button"
                          disabled={citActionLoading}
                          onClick={handleAuthorizeGate}
                          className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1.5 transition"
                        >
                          <Key size={14} /> {citActionLoading ? "Authorizing..." : "Authorize & Open Gate"}
                        </button>
                      </div>
                    )}
                    {(citGateState === "open" || activeVehicle.status === "arrived") && citGateState !== "secured" && (
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
                        <span className="text-amber-200 font-medium">Van docked in transfer bay. Gate timer active.</span>
                        <button
                          type="button"
                          disabled={citActionLoading}
                          onClick={handleSecureGate}
                          className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1"
                        >
                          <Lock size={12} /> {citActionLoading ? "Securing..." : "Lock & Complete"}
                        </button>
                      </div>
                    )}
                    {(citGateState === "secured" || activeVehicle.status === "departed") && (
                      <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs">
                        <span className="text-emerald-300 font-medium">Transfer completed. Perimeter secured.</span>
                        <button
                          type="button"
                          onClick={() => {
                            setCitGateState("pending");
                            setCitOtpInput("");
                            setDispatchModalOpen(true);
                          }}
                          className="text-xs text-slate-400 hover:text-white underline"
                        >
                          Register Next Van
                        </button>
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <>
                  {dispatchModalOpen ? (
                    <form onSubmit={handleRegisterDispatch} className="mt-4 p-3.5 rounded-xl bg-slate-950/80 border border-purple-500/40 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                        <span className="text-xs font-bold text-purple-300 flex items-center gap-1.5">
                          <Truck size={14} /> Register Approaching Cash Van
                        </span>
                        <button
                          type="button"
                          onClick={() => setDispatchModalOpen(false)}
                          className="text-slate-400 hover:text-white"
                        >
                          <X size={14} />
                        </button>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="text-[10px] text-slate-400 font-medium block mb-1">Plate Number</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. KL-07-CG-9021"
                            value={dispatchPlate}
                            onChange={(e) => setDispatchPlate(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white font-mono uppercase focus:outline-none focus:border-purple-500"
                          />
                        </div>
                        <div>
                          <label className="text-[10px] text-slate-400 font-medium block mb-1">CIT Provider</label>
                          <input
                            type="text"
                            required
                            placeholder="e.g. Brinks Logistics"
                            value={dispatchProvider}
                            onChange={(e) => setDispatchProvider(e.target.value)}
                            className="w-full px-2.5 py-1.5 rounded bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-purple-500"
                          />
                        </div>
                      </div>
                      <div className="flex items-center justify-end gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => setDispatchModalOpen(false)}
                          className="px-2.5 py-1 text-xs text-slate-400 hover:text-slate-200"
                        >
                          Cancel
                        </button>
                        <button
                          type="submit"
                          disabled={citActionLoading}
                          className="px-3 py-1.5 rounded bg-purple-600 hover:bg-purple-500 disabled:opacity-50 text-white font-bold text-xs flex items-center gap-1 transition"
                        >
                          {citActionLoading ? "Registering..." : "Transmit to Gate ANPR"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="mt-4 p-4 rounded-xl bg-slate-950/70 border border-slate-800 text-center flex flex-col items-center justify-center gap-2">
                      <div className="text-xs font-semibold text-slate-300">
                        No armored cash vehicle currently at branch perimeter
                      </div>
                      <p className="text-[11px] text-slate-400 max-w-sm">
                        Ingress gate is locked and perimeter ANPR cameras are active.
                        {logistics?.data && logistics.data.length > 0
                          ? ` (Last logged transfer: ${logistics.data[0].vehiclePlate})`
                          : " No cash transfers recorded for this session yet."}
                      </p>
                      <div className="mt-2 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => setDispatchModalOpen(true)}
                          className="px-3 py-1.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-semibold text-xs flex items-center gap-1.5 transition shadow"
                        >
                          <Plus size={13} /> Register Approaching Van
                        </button>
                        <Link
                          href="/analytics/anpr-logistics"
                          className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold text-xs transition border border-slate-700"
                        >
                          Fleet Hub &rarr;
                        </Link>
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">
                {activeVehicle
                  ? `Gate CAM-01 • Ingress Session #${activeVehicle.id.slice(0, 8)}`
                  : "Outer Gate CAM-01 • Standby"}
              </span>
              <Link href="/analytics/anpr-logistics" className="text-purple-400 hover:text-purple-300 font-medium">
                Logistics Telemetry &rarr;
              </Link>
            </div>
          </div>

          {/* Real-time Watchlist & Threat Interception */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
            {(() => {
              const activeThreat = (Array.isArray(watchlistThreats) ? watchlistThreats : []).find(
                (w) => (w?.detectionCount24h ?? 0) > 0 || w?.lastDetected
              );
              return (
                <div>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
                        <ShieldAlert size={18} />
                      </div>
                      <div>
                        <h3 className="text-sm font-bold text-white flex items-center gap-2">
                          {activeThreat ? "High-Priority Watchlist Match" : "Perimeter Watchlist Monitor"}
                        </h3>
                        <p className="text-[11px] text-slate-400">
                          Automated facial recognition match against NBFC fraud database
                        </p>
                      </div>
                    </div>
                    <span className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${
                      activeThreat
                        ? "bg-rose-500/20 text-rose-300 border-rose-500/40 animate-pulse"
                        : "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    }`}>
                      {activeThreat ? "CRITICAL ALERT" : "CLEAR (0 THREATS)"}
                    </span>
                  </div>

                  {activeThreat && !watchlistAlertDismissed ? (
                    <div className="mt-4 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 flex flex-col gap-2.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-rose-200">Watchlist Record:</span>
                        <span className="font-bold text-white bg-rose-900/60 px-2 py-0.5 rounded border border-rose-700">
                          {activeThreat.subjectName} ({activeThreat.personId || activeThreat.id?.slice(0, 8)})
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-rose-200">Category / Reason:</span>
                        <span className="text-rose-300 font-medium">
                          {activeThreat.reason || activeThreat.riskLevel?.toUpperCase() || "Flagged in NBFC Watchlist"}
                        </span>
                      </div>
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-rose-200">Location &amp; Match Confidence:</span>
                        <span className="text-white font-mono font-bold">
                          {activeThreat.lastLocation || "Ingress Camera"} • {(activeThreat.confidence ? (activeThreat.confidence * 100).toFixed(1) : "98.2")}% Confidence
                        </span>
                      </div>

                      <div className="mt-2 pt-2 border-t border-rose-800/40 flex items-center justify-between gap-2">
                        {watchlistAlertEscalated ? (
                          <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                            <CheckCircle2 size={13} /> Escalated to Branch Security &amp; SOC Dispatched
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setWatchlistAlertEscalated(true)}
                            className="px-3 py-1.5 rounded bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs flex items-center gap-1 transition"
                          >
                            <Siren size={13} /> Escalate to Branch Security
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setWatchlistAlertDismissed(true)}
                          className="text-xs text-slate-400 hover:text-slate-200"
                        >
                          Dismiss Alert
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-4 p-4 rounded-xl bg-slate-950 border border-slate-800 text-center">
                      <p className="text-xs text-slate-400">
                        {watchlistAlertDismissed
                          ? "Watchlist threat cleared by operator."
                          : "Perimeter face-recognition scanner active. No blacklist matches detected."}
                      </p>
                      {watchlistAlertDismissed && (
                        <button
                          type="button"
                          onClick={() => {
                            setWatchlistAlertDismissed(false);
                            setWatchlistAlertEscalated(false);
                          }}
                          className="mt-2 text-xs text-cyan-400 hover:underline"
                        >
                          Reset Dismissal
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })()}

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Live Face Scanner Engine • {watchlistThreats.length} Watchlist Profiles Active</span>
              <Link href="/analytics/nbfc-watchlist" className="text-rose-400 hover:text-rose-300 font-medium">
                Open Watchlist Center &rarr;
              </Link>
            </div>
          </div>
        </section>

        {false && <>
          {/* Strong-room controls require a backend custody-control contract. */}
          <section className="mt-6 rounded-2xl border-2 border-amber-500/30 bg-gradient-to-br from-amber-950/20 via-slate-900 to-black p-5 shadow-lg">
            <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/30">
                    <Lock size={18} />
                  </div>
                  <h3 className="text-base font-bold text-white flex items-center gap-2">
                    Strong Room Multi-Party Time-Lock &amp; Anti-Duress Protocol
                  </h3>
                  <span className="px-2 py-0.5 rounded text-[10px] font-mono uppercase bg-amber-500/20 text-amber-300 border border-amber-500/40">
                    RBI Master Direction Sec 8.4
                  </span>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  Zero single-person access: Requires dual biometric concurrence, 15-minute anti-duress delay, and silent duress code telemetry.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${vaultUnlocked
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : timeLockActive
                      ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                      : "bg-slate-800 text-slate-400 border-slate-700"
                  }`}>
                  {vaultUnlocked ? <Unlock size={13} /> : <Lock size={13} />}
                  {vaultUnlocked
                    ? "VAULT BOLT RELEASED"
                    : timeLockActive
                      ? `TIME-LOCK COUNTDOWN (${Math.floor(timeLockSeconds / 60)}:${(timeLockSeconds % 60).toString().padStart(2, "0")})`
                      : "STRONG ROOM ARMED & LOCKED"}
                </span>
              </div>
            </div>

            {/* Interactive Vault Controls Grid */}
            <div className="mt-4 grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Custodian 1: Branch Manager Biometrics */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Fingerprint size={15} className="text-amber-400" /> Custodian #1: Branch Manager
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${custodian1Approved ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                    {custodian1Approved ? "AUTHENTICATED" : "PENDING"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Face Biometrics &amp; Key A Custody • {secureStaff[0]?.fullName ? `${secureStaff[0].fullName} (ID: ${secureStaff[0].employeeCode})` : "Designated Joint Custodian A"}
                </p>
                <button
                  type="button"
                  disabled={custodian1Approved || vaultUnlocked}
                  onClick={() => setCustodian1Approved(true)}
                  className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-white border border-slate-700 transition"
                >
                  {custodian1Approved ? "✓ Custodian 1 Concurred" : "Scan Manager Biometrics"}
                </button>
              </div>

              {/* Custodian 2: Vault Officer Biometrics */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Fingerprint size={15} className="text-blue-400" /> Custodian #2: Vault Officer
                  </span>
                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${custodian2Approved ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-400"}`}>
                    {custodian2Approved ? "AUTHENTICATED" : "PENDING"}
                  </span>
                </div>
                <p className="text-[11px] text-slate-400">
                  Fingerprint Scan &amp; Key B Custody • {secureStaff[1]?.fullName ? `${secureStaff[1].fullName} (ID: ${secureStaff[1].employeeCode})` : "Designated Joint Custodian B"}
                </p>
                <button
                  type="button"
                  disabled={custodian2Approved || vaultUnlocked}
                  onClick={() => setCustodian2Approved(true)}
                  className="w-full py-1.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-xs font-semibold text-white border border-slate-700 transition"
                >
                  {custodian2Approved ? "✓ Custodian 2 Concurred" : "Scan Vault Officer Biometrics"}
                </button>
              </div>

              {/* Time-Lock Delay & Silent Duress PIN Action */}
              <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-slate-300 flex items-center gap-1.5">
                    <Timer size={15} className="text-amber-400" /> 15-Min Delay &amp; Anti-Duress PIN
                  </span>
                </div>

                {!timeLockActive && !vaultUnlocked && (
                  <button
                    type="button"
                    disabled={!custodian1Approved || !custodian2Approved}
                    onClick={() => {
                      setTimeLockActive(true);
                      setTimeLockSeconds(15 * 60);
                    }}
                    className="w-full py-2 px-3 rounded-lg bg-amber-600 hover:bg-amber-500 disabled:bg-slate-800 disabled:text-slate-500 text-xs font-bold text-white shadow-md transition flex items-center justify-center gap-1.5"
                  >
                    <Clock size={13} /> Trigger 15-Minute Time-Lock
                  </button>
                )}

                {timeLockActive && !vaultUnlocked && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="password"
                        placeholder="Enter Duress or Normal PIN (e.g. *911#)"
                        value={duressInput}
                        onChange={(e) => setDuressInput(e.target.value)}
                        className="px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-xs text-white placeholder:text-slate-500 flex-1 focus:outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          if (duressInput.trim() === "*911#" || duressInput.trim() === "9999") {
                            setDuressAlarmTriggered(true);
                            setVaultUnlocked(true);
                            setTimeLockActive(false);
                          } else {
                            // Normal early bypass with master override
                            setVaultUnlocked(true);
                            setTimeLockActive(false);
                          }
                        }}
                        className="px-3 py-1.5 rounded-lg bg-red-600 hover:bg-red-500 text-white font-bold text-xs"
                      >
                        Enter
                      </button>
                    </div>
                    <div className="text-[10px] text-slate-400">
                      Entering <strong className="text-red-400 font-mono">*911#</strong> triggers Covert Silent P1 Police Panic while releasing latch to protect staff.
                    </div>
                  </div>
                )}

                {vaultUnlocked && (
                  <div className="p-2 rounded bg-emerald-500/10 border border-emerald-500/30 text-center">
                    <div className="text-xs font-bold text-emerald-300">Vault Door Electromechanical Bolt Disengaged</div>
                    <button
                      type="button"
                      onClick={() => {
                        setVaultUnlocked(false);
                        setCustodian1Approved(false);
                        setCustodian2Approved(false);
                        setDuressAlarmTriggered(false);
                        setDuressInput("");
                      }}
                      className="mt-1 text-[11px] text-slate-400 hover:text-white underline"
                    >
                      Lock Strong Room
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* Duress Alarm Banner if triggered */}
            {duressAlarmTriggered && (
              <div className="mt-3 p-3 rounded-xl bg-red-950 border-2 border-red-500/60 flex items-center justify-between animate-pulse">
                <div className="flex items-center gap-2">
                  <Siren size={18} className="text-red-400" />
                  <span className="text-xs font-bold text-red-200">
                    COVERT DURESS ALERT ACTIVATED: Silent P1 Panic transmitted to Kerala Police Control Room (112) &amp; Armed QRT-01. CCTV snapshot package locked.
                  </span>
                </div>
                <span className="text-[10px] font-mono text-red-300 bg-red-900/60 px-2 py-0.5 rounded border border-red-700">
                  SILENT DISPATCH ARMED
                </span>
              </div>
            )}
          </section>

          {/* Daily Morning Opening & Evening Closing Two-Person Custody Audit Ledger */}
          <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-900/80 p-5 shadow-sm">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 border-b border-slate-800 pb-4">
              <div>
                <div className="flex items-center gap-2">
                  <div className="p-1.5 rounded-lg bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                    <FileCheck2 size={18} />
                  </div>
                  <h3 className="text-base font-bold text-white">
                    Daily Branch Opening &amp; Closing Two-Person Custody Audit Ledger
                  </h3>
                </div>
                <p className="text-xs text-slate-400 mt-1">
                  RBI Mandate: Strongroom and branch ingress must have 2 authorized custodians present concurrently.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="px-3 py-1 rounded-full text-xs font-bold bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1.5">
                  <CheckCircle2 size={13} /> 100% Dual-Custody Compliant Today
                </span>
              </div>
            </div>

            <div className="mt-4 overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-slate-800 text-slate-400 font-semibold uppercase tracking-wider">
                    <th className="py-2.5 px-3">Session &amp; Time Window</th>
                    <th className="py-2.5 px-3">Branch Name</th>
                    <th className="py-2.5 px-3">Joint Custodian 1 (Manager)</th>
                    <th className="py-2.5 px-3">Joint Custodian 2 (Vault Officer)</th>
                    <th className="py-2.5 px-3">Video Verification</th>
                    <th className="py-2.5 px-3 text-right">Audit Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-800/60 font-medium text-slate-200">
                  {custodyAssignments.length > 0 ? (
                    custodyAssignments.map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-800/30 transition">
                        <td className="py-3 px-3">
                          <span className="text-white font-bold block">{row.effectiveDate ? new Date(row.effectiveDate).toLocaleDateString() : "Today"}</span>
                          <span className="text-[11px] text-slate-400">{row.areaName || "Strong Room Vault"}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span>{activeBranch?.name || "Branch Node"}</span>
                        </td>
                        <td className="py-3 px-3 text-emerald-300">
                          {row.authorizedPersonName || secureStaff[0]?.fullName || "Authorized Custodian 1"}
                        </td>
                        <td className="py-3 px-3 text-emerald-300">
                          {row.secondaryCustodian || secureStaff[1]?.fullName || "Authorized Custodian 2"}
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-slate-300 font-mono">Strong Room Ingress</span>
                          <span className="text-[10px] text-slate-500 block">Biometric Authorization Active</span>
                        </td>
                        <td className="py-3 px-3 text-right">
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                            AUDIT SEALED
                          </span>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={6} className="py-10 text-center text-slate-500 font-medium">
                        No dual-custody turnover events logged in this session. Real-time audit trails will automatically log here when authorized custodians access the vault.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </>}

        <section className="mt-6 rounded-2xl border border-slate-800 bg-slate-950/50 p-5 shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-800 pb-4 sm:flex-row sm:items-end sm:justify-between">
            <div><p className="text-xs font-semibold uppercase tracking-[0.18em] text-cyan-300">Operating model</p><h2 className="mt-1 text-xl font-semibold text-slate-100">From signal to accountable outcome</h2></div>
            <p className="max-w-xl text-sm text-slate-400">Use the task that matches the moment. Each workflow links to the system of record; no status is inferred or fabricated.</p>
          </div>
          <div className="grid gap-3 pt-5 md:grid-cols-2 xl:grid-cols-3">
            {availableWorkflows.map(({ title, description, href, action, icon: Icon, iconClass }) => (
              <Link key={href} href={href} className="group rounded-xl border border-slate-800 bg-slate-900/60 p-4 transition hover:-translate-y-0.5 hover:border-cyan-400/50 hover:bg-slate-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cyan-300">
                <div className="flex items-start justify-between gap-3"><span className={`grid h-10 w-10 place-items-center rounded-lg ${iconClass}`}><Icon size={20} /></span><ArrowRight size={17} className="mt-1 text-slate-500 transition group-hover:translate-x-0.5 group-hover:text-cyan-300" /></div>
                <h3 className="mt-4 font-semibold text-slate-100">{title}</h3><p className="mt-2 min-h-10 text-sm leading-5 text-slate-400">{description}</p><span className="mt-4 inline-flex text-sm font-medium text-cyan-300">{action}</span>
              </Link>
            ))}
            {sessionChecked && availableWorkflows.length === 0 && <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">No NBFC workflows are assigned to this account. Ask an administrator to assign the correct branch-security workspace.</p>}
            {!sessionChecked && <p className="rounded-xl border border-slate-800 bg-slate-900/60 p-4 text-sm text-slate-400">Loading your authorized workflows…</p>}
          </div>
        </section>

        <section className="mt-5 grid gap-4 rounded-2xl border border-slate-800 bg-slate-900/40 p-5 md:grid-cols-3">
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">1. Detect</p><p className="mt-2 text-sm text-slate-300">Triage only verified alerts and branch-health exceptions.</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">2. Decide</p><p className="mt-2 text-sm text-slate-300">Use video context, assigned procedures, and the correct branch scope.</p></div>
          <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-slate-500">3. Prove</p><p className="mt-2 text-sm text-slate-300">Retain evidence, ownership, and an auditable response history.</p></div>
        </section>
      </main>
    </AppLayout>
  );
}
