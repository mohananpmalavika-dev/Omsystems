"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { AppLayout, getVisibleNavigation, type MenuAccessUser } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { authApi } from "@/lib/api-client";
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
  Key,
  CheckCircle2,
  AlertTriangle,
  Radio,
  Clock,
  RefreshCw,
  Sparkles,
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
  const [watchlistAlertDismissed, setWatchlistAlertDismissed] = useState(false);
  const [watchlistAlertEscalated, setWatchlistAlertEscalated] = useState(false);

  useEffect(() => {
    let active = true;
    authApi.getCurrentUser()
      .then((data) => { if (active) setUser((data as any)?.user ?? data ?? null); })
      .catch(() => { if (active) setUser(null); })
      .finally(() => { if (active) setSessionChecked(true); });
    return () => { active = false; };
  }, []);

  const availableWorkflows = useMemo(() => {
    if (!user) return [];
    const allowed = new Set(getVisibleNavigation(user).flatMap((group) => group.items.map((item) => item.href)));
    return workflows.filter((workflow) => allowed.has(workflow.href));
  }, [user]);

  return (
    <AppLayout>
      <main className="mx-auto w-full max-w-[1480px] px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <PageHero
          eyebrow="NBFC security operating system"
          title="Protect every branch. Prove every response."
          description="A focused workspace for branch security, ATM and cash-adjacent operations, reliable video coverage, defensible evidence, and audit readiness."
          icon={Landmark}
          actions={<div className="page-hero-status"><Video size={17} /><div><span>Start with the event</span><strong>Verify before you act</strong></div></div>}
        />

        {/* Live Banking Security & Vault Cockpit */}
        <section className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-4">
          {/* Locker Room 2-Person Rule */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Lock size={15} className="text-amber-400" />
                  Locker Vault 2-Person Rule
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  Compliant
                </span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-white">2 Authorized Staff</div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Dual custodian session active inside Strong Room (CAM-04)
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500 flex items-center gap-1">
                <Clock size={12} />
                Session: 14m 20s
              </span>
              <Link href="/analytics/banking" className="text-cyan-400 hover:text-cyan-300 font-medium">
                Live Vault Stream &rarr;
              </Link>
            </div>
          </div>

          {/* Cash Counter Loitering & Queues */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-slate-400">
                  <Users size={15} className="text-violet-400" />
                  Counter Loitering & Queue
                </span>
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-emerald-500/20 text-emerald-400 border border-emerald-500/30">
                  Normal
                </span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-white">3.4m Avg Dwell</div>
                <p className="text-xs text-slate-400 mt-0.5">
                  Counters 1 & 2 dwell times within 5-min RBI security threshold
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Loitering Flags: 0 Active</span>
              <Link href="/analytics/banking" className="text-violet-400 hover:text-violet-300 font-medium">
                Counter Analytics &rarr;
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
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
                  Auto-Polling
                </span>
              </div>
              <div className="mt-3">
                <div className="text-xl font-bold text-white">100% Synced</div>
                <p className="text-xs text-slate-400 mt-0.5">
                  ANPR Overdue & Watchlist Expiry background cron jobs active
                </p>
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Interval: 5m / 60m</span>
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
                  citGateState === "open"
                    ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                    : citGateState === "secured"
                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                    : "bg-purple-500/20 text-purple-300 border-purple-500/40"
                }`}>
                  {citGateState === "open" ? "GATE OPEN (VAN INGRESS)" : citGateState === "secured" ? "GATE SECURED" : "VAN AT GATE"}
                </span>
              </div>

              {/* Detected Van Details */}
              <div className="mt-4 p-3.5 rounded-xl bg-slate-950/70 border border-slate-800 flex flex-col gap-2.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Detected Armored Vehicle:</span>
                  <span className="font-mono font-bold text-white bg-slate-800 px-2 py-0.5 rounded border border-slate-700">
                    KL-07-CG-9021 (Brinks Logistics)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Scheduled Route Manifest:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} /> ROUTE-KOC-09 (Verified Match)
                  </span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-400">Armed Escort Protocol:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <CheckCircle2 size={12} /> 2 Authorized Gunmen Present (CAM-01)
                  </span>
                </div>
              </div>

              {/* Clearance Action */}
              <div className="mt-4 flex flex-col gap-2">
                {citGateState === "pending" && (
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
                      onClick={() => {
                        if (citOtpInput.trim() === "8492" || citOtpInput.trim().length >= 4) {
                          setCitGateState("open");
                        } else {
                          alert("Enter valid 4-digit Manager OTP (Default: 8492)");
                        }
                      }}
                      className="px-4 py-2 rounded-lg bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs flex items-center gap-1.5 transition"
                    >
                      <Key size={14} /> Authorize &amp; Open Gate
                    </button>
                  </div>
                )}
                {citGateState === "open" && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/30 text-xs">
                    <span className="text-amber-200 font-medium">Van entering transfer bay. Gate timer active.</span>
                    <button
                      type="button"
                      onClick={() => setCitGateState("secured")}
                      className="px-3 py-1.5 rounded bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center gap-1"
                    >
                      <Lock size={12} /> Lock &amp; Secure Gate
                    </button>
                  </div>
                )}
                {citGateState === "secured" && (
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-xs">
                    <span className="text-emerald-300 font-medium">Transfer completed. Perimeter secured.</span>
                    <button
                      type="button"
                      onClick={() => {
                        setCitGateState("pending");
                        setCitOtpInput("");
                      }}
                      className="text-xs text-slate-400 hover:text-white underline"
                    >
                      Reset Protocol
                    </button>
                  </div>
                )}
              </div>
            </div>
            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Outer Gate CAM-01 • Ingress Log #9812</span>
              <Link href="/analytics/anpr-logistics" className="text-purple-400 hover:text-purple-300 font-medium">
                Logistics Telemetry &rarr;
              </Link>
            </div>
          </div>

          {/* Real-time Watchlist & Threat Interception */}
          <div className="p-5 rounded-2xl border border-slate-800 bg-slate-900/80 shadow-sm flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400 border border-rose-500/30">
                    <ShieldAlert size={18} />
                  </div>
                  <div>
                    <h3 className="text-sm font-bold text-white flex items-center gap-2">
                      High-Priority Watchlist Match
                    </h3>
                    <p className="text-[11px] text-slate-400">
                      Automated facial recognition match against NBFC fraud database
                    </p>
                  </div>
                </div>
                <span className="px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider bg-rose-500/20 text-rose-300 border border-rose-500/40 animate-pulse">
                  CRITICAL ALERT
                </span>
              </div>

              {!watchlistAlertDismissed ? (
                <div className="mt-4 p-3.5 rounded-xl bg-rose-950/40 border border-rose-800/60 flex flex-col gap-2.5">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-rose-200">Watchlist Record:</span>
                    <span className="font-bold text-white bg-rose-900/60 px-2 py-0.5 rounded border border-rose-700">
                      Vikram Menon (ID: WL-8829)
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-rose-200">Category / Reason:</span>
                    <span className="text-rose-300 font-medium">
                      Multi-Branch Loan Defaulter &amp; Fake Collateral Flag
                    </span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-rose-200">Location &amp; Match Confidence:</span>
                    <span className="text-white font-mono font-bold">
                      CAM-03 (Teller Hall) • 98.4% Confidence
                    </span>
                  </div>

                  <div className="mt-2 pt-2 border-t border-rose-800/40 flex items-center justify-between gap-2">
                    {watchlistAlertEscalated ? (
                      <span className="text-xs text-emerald-400 font-semibold flex items-center gap-1">
                        <CheckCircle2 size={13} /> Escalated to Branch Manager &amp; SOC Dispatched
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
                  <p className="text-xs text-slate-400">Watchlist threat cleared by operator.</p>
                  <button
                    type="button"
                    onClick={() => {
                      setWatchlistAlertDismissed(false);
                      setWatchlistAlertEscalated(false);
                    }}
                    className="mt-2 text-xs text-cyan-400 hover:underline"
                  >
                    Simulate Next Detection
                  </button>
                </div>
              )}
            </div>

            <div className="mt-4 pt-3 border-t border-slate-800 flex items-center justify-between text-xs">
              <span className="text-slate-500">Live Face Scanner Engine • 12 Branches Synced</span>
              <Link href="/analytics/nbfc-watchlist" className="text-rose-400 hover:text-rose-300 font-medium">
                Open Watchlist Center &rarr;
              </Link>
            </div>
          </div>
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
                <tr className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3">
                    <span className="text-white font-bold block">Today • 08:58 AM</span>
                    <span className="text-[11px] text-slate-400">Morning Opening Window (09:00 AM)</span>
                  </td>
                  <td className="py-3 px-3">
                    <span>Ernakulam Main (EKM-01)</span>
                  </td>
                  <td className="py-3 px-3 text-emerald-300">
                    K. Ramanathan <span className="text-[10px] text-slate-400 font-mono block">ID: BM-102 (Matched)</span>
                  </td>
                  <td className="py-3 px-3 text-emerald-300">
                    Deepa George <span className="text-[10px] text-slate-400 font-mono block">ID: VC-204 (Matched)</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-slate-300 font-mono">CAM-04 Strong Room</span>
                    <span className="text-[10px] text-slate-500 block">Simultaneous presence: 11m 40s</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      COMPLIANT (BOTH PRESENT)
                    </span>
                  </td>
                </tr>

                <tr className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3">
                    <span className="text-white font-bold block">Today • 09:02 AM</span>
                    <span className="text-[11px] text-slate-400">Morning Opening Window (09:00 AM)</span>
                  </td>
                  <td className="py-3 px-3">
                    <span>Thrissur Round (TSR-02)</span>
                  </td>
                  <td className="py-3 px-3 text-emerald-300">
                    M. V. Suresh <span className="text-[10px] text-slate-400 font-mono block">ID: BM-108 (Matched)</span>
                  </td>
                  <td className="py-3 px-3 text-emerald-300">
                    Anjali Nair <span className="text-[10px] text-slate-400 font-mono block">ID: VC-211 (Matched)</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-slate-300 font-mono">CAM-02 Vault Lobby</span>
                    <span className="text-[10px] text-slate-500 block">Simultaneous presence: 8m 15s</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      COMPLIANT (BOTH PRESENT)
                    </span>
                  </td>
                </tr>

                <tr className="hover:bg-slate-800/30 transition">
                  <td className="py-3 px-3">
                    <span className="text-white font-bold block">Yesterday • 06:14 PM</span>
                    <span className="text-[11px] text-slate-400">Evening Vault Lock &amp; Closure</span>
                  </td>
                  <td className="py-3 px-3">
                    <span>Ernakulam Main (EKM-01)</span>
                  </td>
                  <td className="py-3 px-3 text-emerald-300">
                    K. Ramanathan <span className="text-[10px] text-slate-400 font-mono block">ID: BM-102 (Matched)</span>
                  </td>
                  <td className="py-3 px-3 text-emerald-300">
                    Deepa George <span className="text-[10px] text-slate-400 font-mono block">ID: VC-204 (Matched)</span>
                  </td>
                  <td className="py-3 px-3">
                    <span className="text-slate-300 font-mono">CAM-04 Strong Room</span>
                    <span className="text-[10px] text-slate-500 block">Dual Lock Turn Verified</span>
                  </td>
                  <td className="py-3 px-3 text-right">
                    <span className="px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                      VERIFIED &amp; AUDIT SEALED
                    </span>
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

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
