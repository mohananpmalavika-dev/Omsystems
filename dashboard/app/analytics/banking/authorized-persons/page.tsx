"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  FileDown,
  LockKeyhole,
  RefreshCw,
  ShieldCheck,
  UserPlus,
  Users,
  ScanFace,
  ClipboardList,
} from "lucide-react";
import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { cameraInventoryApi, organizationApi, secureAreaAuthorizationApi } from "@/lib/api-client";
import { CctvFaceIdentificationPanel } from "@/components/banking/cctv-face-identification-panel";
import type { Branch } from "@/lib/types";

type Area = "cash_counter" | "locker";
type ActiveTab = "cctv_identification" | "roster" | "reports";
const today = () => new globalThis.Date().toISOString().slice(0, 10);

export default function AuthorizedPersonsPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [locations, setLocations] = useState<any[]>([]);
  const [branchId, setBranchId] = useState("");
  const [locationId, setLocationId] = useState("");
  const [activeTab, setActiveTab] = useState<ActiveTab>("cctv_identification");

  const [persons, setPersons] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [report, setReport] = useState<any[]>([]);
  const [alerts, setAlerts] = useState<any[]>([]);

  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const scope = useMemo(() => ({ branchId, ...(locationId ? { locationId } : {}) }), [branchId, locationId]);

  const load = useCallback(async () => {
    if (!branchId) return;
    setBusy(true);
    try {
      const [p, a, r, l] = await Promise.all([
        secureAreaAuthorizationApi.listPersons(scope),
        secureAreaAuthorizationApi.listAssignments({ ...scope, date: today() }),
        secureAreaAuthorizationApi.datewiseReport({ ...scope, from, to }),
        secureAreaAuthorizationApi.lockerChangeAlerts({ ...scope, from, to }),
      ]);
      setPersons(p.data);
      setAssignments(a.data);
      setReport(r.data);
      setAlerts(l.data);
      setMessage("");
    } catch (error) {
      setMessage(readable(error));
    } finally {
      setBusy(false);
    }
  }, [branchId, scope, from, to]);

  useEffect(() => {
    void Promise.all([
      cameraInventoryApi.listBranches("analytics:view"),
      organizationApi.listNodes({ type: "location" }),
    ])
      .then(([branchResponse, locationResponse]) => {
        const bList = branchResponse.data as Branch[];
        setBranches(bList);
        setBranchId(bList[0]?.id ?? "");
        setLocations(locationResponse.data);
      })
      .catch((e) => setMessage(readable(e)));
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const downloadReport = () => {
    const rows = [
      [
        "Date",
        "Area type",
        "Area",
        "Authorized person",
        "Employee code",
        "Designation",
        "Effective from",
        "Effective until",
        "Reason",
      ],
      ...report.map((x) => [
        x.date,
        x.areaType,
        x.areaName,
        x.fullName,
        x.employeeCode,
        x.designation ?? "",
        x.effectiveFrom,
        x.effectiveUntil ?? "",
        x.changeReason ?? "",
      ]),
    ];
    const blob = new Blob([rows.map((row) => row.map(csv).join(",")).join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `secure-area-authorizations-${from}-to-${to}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-slate-950 p-4 text-slate-100 xl:p-6">
      {/* Header */}
      <header className="mb-6 flex flex-wrap items-start justify-between gap-4 rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-xl backdrop-blur-md">
        <div className="flex gap-4">
          <span className="grid h-12 w-12 place-items-center rounded-2xl bg-emerald-500/10 text-emerald-300">
            <LockKeyhole size={24} />
          </span>
          <div>
            <Link
              href="/analytics/banking"
              className="flex items-center gap-1 text-xs font-semibold text-slate-400 hover:text-white"
            >
              <ArrowLeft size={13} /> Banking analytics
            </Link>
            <h1 className="mt-2 text-2xl font-bold tracking-tight text-white">
              CCTV Identification & Secure Area Authorizations
            </h1>
            <p className="mt-1 text-sm text-slate-400">
              Facial recognition CCTV surveillance for Cash Counters and Locker Vaults. Real-time teller verification,
              unauthorized staff alerts, and after-hours breach detection.
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-end gap-3">
          <Select
            label="Branch"
            value={branchId}
            setValue={setBranchId}
            options={branches.map((b) => ({ value: b.id, label: b.name }))}
          />
          <Select
            label="Location scope"
            value={locationId}
            setValue={setLocationId}
            options={[{ value: "", label: "Entire branch" }, ...locations.map((l) => ({ value: l.id, label: l.name }))]}
          />
          <button
            onClick={() => void load()}
            className="rounded-xl border border-slate-700 bg-slate-800 p-2.5 text-slate-200 transition hover:bg-slate-700"
            title="Refresh"
          >
            <RefreshCw size={16} className={busy ? "animate-spin" : ""} />
          </button>
        </div>
      </header>

      {/* Tab Navigation */}
      <div className="mb-6 flex flex-wrap items-center gap-2 border-b border-slate-800 pb-3">
        <button
          onClick={() => setActiveTab("cctv_identification")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "cctv_identification"
              ? "bg-cyan-600 text-white shadow-lg shadow-cyan-600/20"
              : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <ScanFace size={16} /> CCTV Face Identification & Live HUD
        </button>

        <button
          onClick={() => setActiveTab("roster")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "roster"
              ? "bg-emerald-600 text-white shadow-lg shadow-emerald-600/20"
              : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <Users size={16} /> Staff Registration & Daily Rosters
        </button>

        <button
          onClick={() => setActiveTab("reports")}
          className={`flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition ${
            activeTab === "reports"
              ? "bg-blue-600 text-white shadow-lg shadow-blue-600/20"
              : "bg-slate-900 text-slate-400 hover:bg-slate-800 hover:text-slate-200"
          }`}
        >
          <ClipboardList size={16} /> Date-wise Reports & Locker Alerts ({alerts.length})
        </button>
      </div>

      {message && (
        <p className="mb-6 flex gap-2 rounded-xl border border-red-500/30 bg-red-500/10 p-4 text-sm text-red-200">
          <AlertTriangle size={18} /> {message}
        </p>
      )}

      {!branchId ? (
        <p className="rounded-2xl border border-slate-800 bg-slate-900 p-8 text-center text-sm text-slate-400">
          No accessible branch is available.
        </p>
      ) : (
        <>
          {/* TAB 1: CCTV FACE IDENTIFICATION & MONITORING */}
          {activeTab === "cctv_identification" && (
            <CctvFaceIdentificationPanel
              branchId={branchId}
              locationId={locationId || undefined}
              persons={persons}
              assignments={assignments}
              onRefreshNeeded={load}
            />
          )}

          {/* TAB 2: STAFF REGISTRATION & COUNTER ROSTERS */}
          {activeTab === "roster" && (
            <div className="grid gap-6 xl:grid-cols-2">
              <PersonForm scope={scope} onSaved={load} />
              <AssignmentForm scope={scope} persons={persons} onSaved={load} />

              <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900 xl:col-span-2">
                <header className="flex items-center justify-between border-b border-slate-800 p-5">
                  <h2 className="flex items-center gap-2 font-bold text-slate-100">
                    <ShieldCheck size={18} className="text-emerald-400" /> Today’s Active Authorizations
                  </h2>
                  <span className="text-xs text-slate-400">{assignments.length} assignments active</span>
                </header>
                <Rows
                  rows={assignments}
                  empty="No active authorization recorded today."
                  columns={[
                    ["Area Type", "areaType"],
                    ["Counter / Locker", "areaName"],
                    ["Assigned Person", "fullName"],
                    ["Employee Code", "employeeCode"],
                    ["Effective From", "effectiveFrom"],
                  ]}
                />
              </section>
            </div>
          )}

          {/* TAB 3: DATE-WISE REPORTS & LOCKER ALERTS */}
          {activeTab === "reports" && (
            <div className="space-y-6">
              <section className="overflow-hidden rounded-3xl border border-slate-800 bg-slate-900">
                <header className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-800 p-5">
                  <div>
                    <h2 className="font-bold text-slate-100">Date-wise Authorization Report</h2>
                    <p className="text-xs text-slate-400">Cash counter and locker authorization history</p>
                  </div>
                  <div className="flex items-end gap-2">
                    <Date label="From" value={from} setValue={setFrom} />
                    <Date label="To" value={to} setValue={setTo} />
                    <button
                      onClick={downloadReport}
                      disabled={!report.length}
                      className="flex items-center gap-2 rounded-xl bg-blue-600 px-3 py-2 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-40"
                    >
                      <FileDown size={14} /> Export CSV
                    </button>
                  </div>
                </header>
                <Rows
                  rows={report}
                  empty="No authorizations found for the selected period."
                  columns={[
                    ["Date", "date"],
                    ["Area", "areaType"],
                    ["Counter / Locker", "areaName"],
                    ["Authorized Person", "fullName"],
                    ["Employee Code", "employeeCode"],
                    ["Reason", "changeReason"],
                  ]}
                />
              </section>

              <section className="overflow-hidden rounded-3xl border border-amber-500/25 bg-slate-900">
                <header className="border-b border-amber-500/20 p-5">
                  <h2 className="flex items-center gap-2 font-bold text-amber-200">
                    <AlertTriangle size={18} /> Locker Authorization Change Alerts
                  </h2>
                  <p className="mt-1 text-xs text-slate-400">
                    Audit reports generated automatically whenever an existing locker authority is replaced.
                  </p>
                </header>
                <Rows
                  rows={alerts}
                  empty="No locker authorization changes for this period."
                  columns={[
                    ["Locker", "lockerName"],
                    ["Previous Custodian", "previousPerson"],
                    ["New Custodian", "newPerson"],
                    ["Change Reason", "changeReason"],
                    ["Changed At", "createdAt"],
                  ]}
                />
              </section>
            </div>
          )}
        </>
      )}
    </main>
  );
}

function PersonForm({ scope, onSaved }: { scope: any; onSaved: () => Promise<void> }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [designation, setDesignation] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await secureAreaAuthorizationApi.registerPerson({
        ...scope,
        fullName: name,
        employeeCode: code,
        designation: designation || undefined,
      });
      setName("");
      setCode("");
      setDesignation("");
      await onSaved();
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="flex items-center gap-2 font-bold text-slate-100">
        <UserPlus size={18} className="text-emerald-400" /> Authorized Person Registration
      </h2>
      <p className="mt-1 text-xs text-slate-400">Add banking staff into the branch authorized personnel roster.</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-3">
        <Input label="Full Name" value={name} setValue={setName} required />
        <Input label="Employee Code" value={code} setValue={setCode} required />
        <Input label="Designation" value={designation} setValue={setDesignation} />
        <button
          disabled={saving}
          className="rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-emerald-500 disabled:opacity-50 sm:col-span-3"
        >
          {saving ? "Saving…" : "Register Authorized Person"}
        </button>
      </form>
    </section>
  );
}

function AssignmentForm({ scope, persons, onSaved }: { scope: any; persons: any[]; onSaved: () => Promise<void> }) {
  const [type, setType] = useState<Area>("cash_counter");
  const [area, setArea] = useState("");
  const [person, setPerson] = useState("");
  const [date, setDate] = useState(today());
  const [reason, setReason] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const result = await secureAreaAuthorizationApi.assign({
        ...scope,
        areaType: type,
        areaName: area,
        authorizedPersonId: person,
        effectiveDate: date,
        changeReason: reason || undefined,
        replaceCurrent: true,
      });
      setArea("");
      setReason("");
      await onSaved();
      if (result.lockerChangeAlertId) {
        window.alert("Locker authorization changed. A separate alert report was generated.");
      }
    } finally {
      setSaving(false);
    }
  };

  return (
    <section className="rounded-3xl border border-slate-800 bg-slate-900 p-6">
      <h2 className="flex items-center gap-2 font-bold text-slate-100">
        <Users size={18} className="text-blue-400" /> Daily Assignment / Handover
      </h2>
      <p className="mt-1 text-xs text-slate-400">Assign a registered person to a cash counter or locker vault.</p>
      <form onSubmit={submit} className="mt-4 grid gap-3 sm:grid-cols-2">
        <Select
          label="Area Type"
          value={type}
          setValue={(v) => setType(v as Area)}
          options={[
            { value: "cash_counter", label: "Cash Counter" },
            { value: "locker", label: "Locker Strongroom" },
          ]}
        />
        <Input label="Counter / Locker Name" value={area} setValue={setArea} required />
        <Select
          label="Authorized Person"
          value={person}
          setValue={setPerson}
          options={[
            { value: "", label: persons.length ? "Select person..." : "Register a person first" },
            ...persons.map((p) => ({ value: p.id, label: `${p.fullName} (${p.employeeCode})` })),
          ]}
        />
        <Date label="Effective Date" value={date} setValue={setDate} />
        <Input
          label={type === "locker" ? "Change Reason (Required for locker handover)" : "Handover Reason"}
          value={reason}
          setValue={setReason}
          required={type === "locker"}
        />
        <button
          disabled={saving || !person}
          className="rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-bold text-white transition hover:bg-blue-500 disabled:opacity-50 sm:col-span-2"
        >
          {saving ? "Assigning…" : type === "cash_counter" ? "Assign Cash Counter Teller" : "Change Locker Custodian"}
        </button>
      </form>
    </section>
  );
}

function Rows({ rows, columns, empty }: { rows: any[]; columns: [string, string][]; empty: string }) {
  return rows.length === 0 ? (
    <p className="p-5 text-center text-xs text-slate-500">{empty}</p>
  ) : (
    <div className="overflow-x-auto">
      <table className="w-full text-left text-xs">
        <thead className="bg-slate-950 text-slate-400">
          <tr>
            {columns.map(([label]) => (
              <th key={label} className="px-4 py-3 font-semibold">
                {label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-800">
          {rows.map((row, i) => (
            <tr key={row.id ?? i} className="hover:bg-slate-800/40">
              {columns.map(([, key]) => (
                <td key={key} className="px-4 py-3 text-slate-300">
                  {display(row[key])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function Select({
  label,
  value,
  setValue,
  options,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <label className="text-xs font-semibold text-slate-400">
      {label}
      <select
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1 block min-w-44 rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function Input({
  label,
  value,
  setValue,
  required = false,
}: {
  label: string;
  value: string;
  setValue: (value: string) => void;
  required?: boolean;
}) {
  return (
    <label className="text-xs font-semibold text-slate-400">
      {label}
      <input
        required={required}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1 block w-full rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
      />
    </label>
  );
}

function Date({ label, value, setValue }: { label: string; value: string; setValue: (value: string) => void }) {
  return (
    <label className="text-xs font-semibold text-slate-400">
      {label}
      <input
        type="date"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="mt-1 block rounded-xl border border-slate-700 bg-slate-950 p-2 text-xs text-slate-100 focus:border-cyan-500 focus:outline-none"
      />
    </label>
  );
}

function display(value: any) {
  if (!value) return "—";
  return /At$|From$|Until$/.test(String(value))
    ? new globalThis.Date(value).toLocaleString()
    : String(value).replaceAll("_", " ");
}

function csv(value: unknown) {
  const text = String(value ?? "");
  return /[",\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

function readable(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load secure-area authorizations";
}
