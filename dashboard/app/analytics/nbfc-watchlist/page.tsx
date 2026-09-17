"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import {
  Users,
  UserCheck,
  UserX,
  Shield,
  AlertTriangle,
  CheckCircle2,
  Plus,
  Search,
  Filter,
  RefreshCw,
  Eye,
  EyeOff,
  Building2,
  Clock,
  FileText,
} from "lucide-react";
import { cameraInventoryApi } from "@/lib/api-client";
import type { Branch } from "@/lib/types";

type WatchlistType = "authorized" | "blacklist" | "vip" | "visitor";
type WatchlistStatus = "active" | "expired" | "suspended";

interface WatchlistEntry {
  id: string;
  personId: string;
  fullName: string;
  employeeCode?: string;
  designation?: string;
  watchlistType: WatchlistType;
  status: WatchlistStatus;
  branchIds: string[];
  areaAccess: Array<"vault" | "cash_counter" | "atm" | "locker" | "branch_entry">;
  validFrom: string;
  validUntil?: string;
  addedBy: string;
  addedAt: string;
  reason: string;
  faceEnrolled: boolean;
  lastDetected?: {
    timestamp: string;
    cameraName: string;
    branchName: string;
    confidence: number;
  };
  detectionCount24h: number;
  notes?: string;
}

interface WatchlistSummary {
  totalEntries: number;
  authorizedPersons: number;
  blacklistedPersons: number;
  vipPersons: number;
  visitors: number;
  activeEntries: number;
  expiredEntries: number;
  recentDetections24h: number;
}

const emptySummary: WatchlistSummary = {
  totalEntries: 0,
  authorizedPersons: 0,
  blacklistedPersons: 0,
  vipPersons: 0,
  visitors: 0,
  activeEntries: 0,
  expiredEntries: 0,
  recentDetections24h: 0,
};

export default function NbfcWatchlistPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string>("ALL");
  const [entries, setEntries] = useState<WatchlistEntry[]>([]);
  const [summary, setSummary] = useState<WatchlistSummary>(emptySummary);
  const [selectedEntry, setSelectedEntry] = useState<WatchlistEntry>();
  const [filter, setFilter] = useState<"all" | "authorized" | "blacklist" | "vip">("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();

  const refresh = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    try {
      // Build query parameters
      const params = new URLSearchParams();
      if (branchId !== "ALL") params.set("branchId", branchId);
      if (filter !== "all") params.set("type", filter);

      // Fetch watchlist entries from real API
      const response = await fetch(`/v1/watchlist/nbfc?${params}`);
      if (!response.ok) {
        throw new Error(`API error: ${response.status} ${response.statusText}`);
      }
      
      const data = await response.json();
      
      if (!data.success) {
        throw new Error(data.error || "Failed to load watchlist data");
      }

      // Set entries and summary from API response
      setEntries(data.data || []);
      setSummary(data.summary || emptySummary);
      setMessage(undefined);
    } catch (error) {
      if (!quiet) setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load watchlist data" });
      // Set empty data on error
      setEntries([]);
      setSummary(emptySummary);
    } finally {
      if (!quiet) setLoading(false);
    }
  }, [branchId, filter]);

  useEffect(() => {
    void cameraInventoryApi.listBranches("analytics:view")
      .then(({ data }) => {
        const next = data as Branch[];
        setBranches(next);
      })
      .catch((error) => setMessage({ kind: "error", text: error instanceof Error ? error.message : "Failed to load branches" }))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (branches.length === 0) return;
    void refresh();
    const timer = window.setInterval(() => void refresh(true), 30_000);
    return () => window.clearInterval(timer);
  }, [branchId, branches, refresh]);

  const visibleEntries = entries.filter(entry => {
    if (filter !== "all" && entry.watchlistType !== filter) return false;
    if (searchQuery && !entry.fullName.toLowerCase().includes(searchQuery.toLowerCase()) && !entry.employeeCode?.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-slate-950 p-4 text-slate-100 xl:p-6">
      <header className="relative mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6">
        <div className="absolute -right-16 -top-24 h-64 w-64 rounded-full bg-indigo-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl border border-indigo-500/25 bg-indigo-500/10 text-indigo-300">
              <Shield size={24} />
            </span>
            <div>
              <p className="text-[11px] font-bold tracking-[.22em] text-indigo-300">NBFC FACE RECOGNITION</p>
              <h1 className="mt-2 text-3xl font-bold">Watchlist Management</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                Manage authorized personnel, VIP visitors, and security watchlists for cash-adjacent areas with consent-aware face recognition.
              </p>
            </div>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs font-semibold text-slate-400">
              Branch scope
              <select
                value={branchId}
                onChange={(e) => setBranchId(e.target.value)}
                className="mt-2 block min-w-56 rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100"
              >
                <option value="ALL">All branches</option>
                {branches.map((branch) => (
                  <option key={branch.id} value={branch.id}>
                    {branch.name}
                  </option>
                ))}
              </select>
            </label>
            <button
              onClick={() => void refresh()}
              disabled={loading}
              className="grid h-10 w-10 place-items-center rounded-xl border border-slate-700 bg-slate-800 hover:border-indigo-500 disabled:opacity-40"
              aria-label="Refresh watchlist"
            >
              <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
            </button>
          </div>
        </div>
      </header>

      {message && (
        <div
          className={`mb-4 flex items-center gap-2 rounded-xl border p-3 text-sm ${
            message.kind === "error"
              ? "border-red-500/30 bg-red-500/10 text-red-200"
              : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"
          }`}
        >
          {message.kind === "error" ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          {message.text}
        </div>
      )}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard label="Total entries" value={summary.totalEntries} icon={<Users />} tone="indigo" />
        <MetricCard label="Authorized" value={summary.authorizedPersons} icon={<UserCheck />} tone="emerald" />
        <MetricCard label="Blacklisted" value={summary.blacklistedPersons} icon={<UserX />} tone="red" />
        <MetricCard label="Detections (24h)" value={summary.recentDetections24h} icon={<Eye />} tone="amber" />
      </section>

      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <nav className="flex flex-wrap gap-2 rounded-2xl border border-slate-800 bg-slate-900/80 p-2">
          {(["all", "authorized", "blacklist", "vip"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold capitalize ${
                filter === f ? "bg-indigo-600 text-white" : "text-slate-400 hover:bg-slate-800 hover:text-white"
              }`}
            >
              {f === "authorized" && <UserCheck size={15} />}
              {f === "blacklist" && <UserX size={15} />}
              {f === "vip" && <Shield size={15} />}
              {f === "all" && <Filter size={15} />}
              {f}
              <span className={`rounded-full px-2 py-0.5 text-[9px] ${filter === f ? "bg-white/15" : "bg-slate-800"}`}>
                {f === "all" ? entries.length : entries.filter(e => e.watchlistType === f).length}
              </span>
            </button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <div className="relative">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search by name or code..."
              className="w-64 rounded-xl border border-slate-700 bg-slate-950 py-2 pl-10 pr-3 text-sm text-slate-100 placeholder:text-slate-600"
            />
          </div>
          <Link
            href="/analytics/banking/authorized-persons"
            className="flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-xs font-bold hover:bg-indigo-500"
          >
            <Plus size={14} />
            Add person
          </Link>
        </div>
      </div>

      <div className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,.65fr)]">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
          <header className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 p-4">
            <div>
              <p className="text-[10px] font-bold tracking-[.18em] text-indigo-300">FACE WATCHLIST</p>
              <h2 className="mt-1 font-semibold">Recognition entries</h2>
            </div>
          </header>
          {loading && entries.length === 0 ? (
            <Empty icon={<RefreshCw className="animate-spin" />} text="Loading watchlist…" />
          ) : visibleEntries.length === 0 ? (
            <Empty icon={<Users />} text="No entries match your filter." />
          ) : (
            <div className="divide-y divide-slate-800">
              {visibleEntries.map((entry) => (
                <button
                  key={entry.id}
                  onClick={() => setSelectedEntry(entry)}
                  className={`grid w-full gap-3 p-4 text-left transition hover:bg-slate-800/60 sm:grid-cols-[minmax(180px,1fr)_minmax(100px,0.6fr)_minmax(120px,0.7fr)_auto] ${
                    selectedEntry?.id === entry.id ? "bg-indigo-500/10" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`grid h-9 w-9 place-items-center rounded-xl ${entry.faceEnrolled ? "bg-indigo-500/20 text-indigo-300" : "bg-slate-800 text-slate-500"}`}>
                      {entry.faceEnrolled ? <UserCheck size={17} /> : <EyeOff size={17} />}
                    </span>
                    <div>
                      <strong className="block text-sm">{entry.fullName}</strong>
                      <span className="text-[10px] text-slate-600">{entry.employeeCode || entry.designation || "No code"}</span>
                    </div>
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-600">Type</span>
                    <WatchlistTypeBadge type={entry.watchlistType} />
                  </div>
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-slate-600">Detections</span>
                    <strong className="mt-1 block text-xs text-slate-300">{entry.detectionCount24h} today</strong>
                  </div>
                  <StatusBadge status={entry.status} />
                </button>
              ))}
            </div>
          )}
        </section>

        <EntryDetail entry={selectedEntry} />
      </div>
    </main>
  );
}

function EntryDetail({ entry }: { entry?: WatchlistEntry }) {
  if (!entry) {
    return (
      <aside className="rounded-2xl border border-slate-800 bg-slate-900/80">
        <Empty icon={<Shield />} text="Select an entry to view details." />
      </aside>
    );
  }

  return (
    <aside className="self-start overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80 xl:sticky xl:top-24">
      <header className="border-b border-slate-800 p-5">
        <p className="text-[10px] font-bold tracking-[.18em] text-indigo-300">ENTRY DETAIL</p>
        <div className="mt-2 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{entry.fullName}</h2>
          <WatchlistTypeBadge type={entry.watchlistType} />
        </div>
      </header>
      <div className="space-y-5 p-5">
        <dl className="grid grid-cols-2 gap-3 text-xs">
          <DetailItem label="Employee code" value={entry.employeeCode || "—"} />
          <DetailItem label="Designation" value={entry.designation || "—"} />
          <DetailItem label="Status" value={entry.status} />
          <DetailItem label="Face enrolled" value={entry.faceEnrolled ? "Yes" : "No"} />
        </dl>

        <div>
          <h3 className="text-xs font-semibold text-slate-300">Area access</h3>
          <div className="mt-2 flex flex-wrap gap-2">
            {entry.areaAccess.length === 0 ? (
              <span className="text-xs text-slate-600">No areas authorized</span>
            ) : (
              entry.areaAccess.map((area) => (
                <span key={area} className="rounded-lg bg-slate-800 px-2 py-1 text-[10px] capitalize text-slate-400">
                  {area.replace("_", " ")}
                </span>
              ))
            )}
          </div>
        </div>

        <div>
          <h3 className="text-xs font-semibold text-slate-300">Validity</h3>
          <dl className="mt-2 grid grid-cols-2 gap-2 rounded-xl bg-slate-950/70 p-3 text-xs">
            <DetailItem label="Valid from" value={formatDate(entry.validFrom)} />
            <DetailItem label="Valid until" value={entry.validUntil ? formatDate(entry.validUntil) : "Indefinite"} />
          </dl>
        </div>

        {entry.lastDetected && (
          <div>
            <h3 className="text-xs font-semibold text-slate-300">Last detection</h3>
            <div className="mt-2 rounded-xl border border-slate-800 bg-slate-950/70 p-3">
              <div className="flex items-center justify-between">
                <strong className="text-xs text-slate-200">{entry.lastDetected.cameraName}</strong>
                <span className="text-[10px] text-slate-500">{Math.round(entry.lastDetected.confidence * 100)}%</span>
              </div>
              <p className="mt-1 text-[11px] text-slate-500">{entry.lastDetected.branchName}</p>
              <p className="mt-1 text-[10px] text-slate-600">{formatTime(entry.lastDetected.timestamp)}</p>
            </div>
          </div>
        )}

        <div>
          <h3 className="text-xs font-semibold text-slate-300">Reason</h3>
          <p className="mt-2 rounded-xl bg-slate-950/70 p-3 text-xs leading-5 text-slate-400">{entry.reason}</p>
        </div>

        {entry.notes && (
          <div>
            <h3 className="text-xs font-semibold text-slate-300">Notes</h3>
            <p className="mt-2 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs leading-5 text-amber-200">{entry.notes}</p>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <Link
            href={`/analytics/face-recognition?personId=${entry.personId}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            <Eye size={13} />
            Detections
          </Link>
          <Link
            href={`/analytics/banking/authorized-persons?personId=${entry.personId}`}
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 hover:bg-slate-800"
          >
            <FileText size={13} />
            Edit
          </Link>
        </div>
      </div>
    </aside>
  );
}

function MetricCard({ label, value, icon, tone }: { label: string; value: number; icon: React.ReactNode; tone: "indigo" | "emerald" | "red" | "amber" }) {
  const colors = {
    indigo: "bg-indigo-500/10 text-indigo-300",
    emerald: "bg-emerald-500/10 text-emerald-300",
    red: "bg-red-500/10 text-red-300",
    amber: "bg-amber-500/10 text-amber-300",
  };
  return (
    <article className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
      <span className={`grid h-10 w-10 place-items-center rounded-xl ${colors[tone]}`}>{icon}</span>
      <div>
        <p className="text-2xl font-bold">{value}</p>
        <strong className="block text-xs text-slate-300">{label}</strong>
      </div>
    </article>
  );
}

function WatchlistTypeBadge({ type }: { type: WatchlistType }) {
  const colors: Record<WatchlistType, string> = {
    authorized: "bg-emerald-500/10 text-emerald-300",
    blacklist: "bg-red-500/10 text-red-300",
    vip: "bg-indigo-500/10 text-indigo-300",
    visitor: "bg-blue-500/10 text-blue-300",
  };
  return (
    <span className={`mt-1 inline-block rounded-full px-2.5 py-1 text-[9px] font-bold ${colors[type]}`}>
      {type.toUpperCase()}
    </span>
  );
}

function StatusBadge({ status }: { status: WatchlistStatus }) {
  const colors: Record<WatchlistStatus, string> = {
    active: "bg-emerald-500/10 text-emerald-300",
    expired: "bg-amber-500/10 text-amber-300",
    suspended: "bg-red-500/10 text-red-300",
  };
  return (
    <span className={`self-center justify-self-start rounded-full px-2.5 py-1 text-[9px] font-bold ${colors[status]}`}>
      {status.toUpperCase()}
    </span>
  );
}

function Empty({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <div className="grid min-h-56 place-items-center p-8 text-center text-slate-600">
      <div>
        <span className="mx-auto mb-3 grid h-11 w-11 place-items-center rounded-xl bg-slate-800">{icon}</span>
        <p className="text-sm">{text}</p>
      </div>
    </div>
  );
}

function DetailItem({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt className="text-[9px] uppercase tracking-wider text-slate-600">{label}</dt>
      <dd className="mt-1 break-words font-semibold capitalize text-slate-300">{value}</dd>
    </div>
  );
}

function formatDate(value: string) {
  return new Date(value).toLocaleDateString(undefined, { month: "short", day: "2-digit", year: "numeric" });
}

function formatTime(value: string) {
  return new Date(value).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
}
