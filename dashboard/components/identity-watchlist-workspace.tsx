"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  Camera,
  CarFront,
  CheckCircle2,
  Clock3,
  Eye,
  Fingerprint,
  ListFilter,
  LoaderCircle,
  Plus,
  RefreshCw,
  ScanFace,
  Search,
  ShieldCheck,
  UserPlus,
  UsersRound,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  identityAnalyticsApi,
  type AnprEvent,
  type FaceRecognitionEvent,
  type FaceWatchlistPerson,
  type IdentityWatchlist,
} from "@/lib/api-client";

type WorkspaceMode = "face" | "anpr";
type DialogKind = "face-watchlist" | "face-person" | "anpr-watchlist" | "anpr-plate";

const inputClass = "mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-3 py-2.5 text-sm text-slate-100 outline-none transition focus:border-cyan-500 focus:ring-2 focus:ring-cyan-500/10";
const labelClass = "text-xs font-semibold text-slate-400";

const emptyFaceWatchlist = {
  name: "",
  description: "",
  listType: "security" as const,
  alertOnMatch: true,
  alertSeverity: "P2" as const,
};

const emptyFacePerson = {
  fullName: "",
  externalId: "",
  dateOfBirth: "",
  gender: "unknown" as const,
  notes: "",
};

const emptyAnprWatchlist = {
  name: "",
  description: "",
  listType: "alert" as const,
  alertOnMatch: true,
  alertSeverity: "P2" as const,
  alertAuthorities: false,
};

const emptyPlate = {
  plateNumber: "",
  countryCode: "IN",
  regionCode: "",
  vehicleMake: "",
  vehicleModel: "",
  vehicleColor: "",
  vehicleType: "car" as const,
  ownerName: "",
  reason: "",
  notes: "",
  expiresAt: "",
};

export function IdentityWatchlistWorkspace({ initialMode }: { initialMode: WorkspaceMode }) {
  const [mode, setMode] = useState<WorkspaceMode>(initialMode);
  const [faceWatchlists, setFaceWatchlists] = useState<IdentityWatchlist[]>([]);
  const [anprWatchlists, setAnprWatchlists] = useState<IdentityWatchlist[]>([]);
  const [faceEvents, setFaceEvents] = useState<FaceRecognitionEvent[]>([]);
  const [anprEvents, setAnprEvents] = useState<AnprEvent[]>([]);
  const [persons, setPersons] = useState<FaceWatchlistPerson[]>([]);
  const [selectedFaceList, setSelectedFaceList] = useState("");
  const [selectedAnprList, setSelectedAnprList] = useState("");
  const [plateQuery, setPlateQuery] = useState("");
  const [minSimilarity, setMinSimilarity] = useState(0.6);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialog, setDialog] = useState<DialogKind>();
  const [message, setMessage] = useState<{ kind: "error" | "success"; text: string }>();
  const [faceWatchlistForm, setFaceWatchlistForm] = useState(emptyFaceWatchlist);
  const [facePersonForm, setFacePersonForm] = useState(emptyFacePerson);
  const [anprWatchlistForm, setAnprWatchlistForm] = useState(emptyAnprWatchlist);
  const [plateForm, setPlateForm] = useState(emptyPlate);

  const loadFace = useCallback(async (watchlistId = selectedFaceList, similarity = minSimilarity) => {
    const [watchlistResponse, eventResponse] = await Promise.all([
      identityAnalyticsApi.listFaceWatchlists(),
      identityAnalyticsApi.listFaceEvents({ watchlistId: watchlistId || undefined, minSimilarity: similarity, limit: 100 }),
    ]);
    const nextWatchlists = watchlistResponse.data ?? [];
    setFaceWatchlists(nextWatchlists);
    setFaceEvents(eventResponse.data ?? []);
    setSelectedFaceList((current) => current && nextWatchlists.some((item) => item.id === current) ? current : nextWatchlists[0]?.id ?? "");
  }, [minSimilarity, selectedFaceList]);

  const loadAnpr = useCallback(async (watchlistId = selectedAnprList, query = plateQuery) => {
    const [watchlistResponse, eventResponse] = await Promise.all([
      identityAnalyticsApi.listAnprWatchlists(),
      identityAnalyticsApi.listAnprEvents({ watchlistId: watchlistId || undefined, plateNumber: query.trim() || undefined, limit: 100 }),
    ]);
    const nextWatchlists = watchlistResponse.data ?? [];
    setAnprWatchlists(nextWatchlists);
    setAnprEvents(eventResponse.data ?? []);
    setSelectedAnprList((current) => current && nextWatchlists.some((item) => item.id === current) ? current : nextWatchlists[0]?.id ?? "");
  }, [plateQuery, selectedAnprList]);

  const refresh = useCallback(async () => {
    setLoading(true);
    setMessage(undefined);
    try {
      if (mode === "face") await loadFace();
      else await loadAnpr();
    } catch (error) {
      setMessage({ kind: "error", text: readable(error) });
    } finally {
      setLoading(false);
    }
  }, [loadAnpr, loadFace, mode]);

  useEffect(() => {
    setMode(initialMode);
  }, [initialMode]);

  useEffect(() => {
    void refresh();
  }, [mode]);

  useEffect(() => {
    if (!selectedFaceList) {
      setPersons([]);
      return;
    }
    void identityAnalyticsApi.listFacePersons(selectedFaceList)
      .then((response) => setPersons(response.data ?? []))
      .catch((error) => setMessage({ kind: "error", text: readable(error) }));
  }, [selectedFaceList]);

  useEffect(() => {
    const create = new URLSearchParams(window.location.search).get("create");
    if (create === "watchlist") setDialog(initialMode === "face" ? "face-watchlist" : "anpr-watchlist");
  }, [initialMode]);

  const selectedFace = faceWatchlists.find((item) => item.id === selectedFaceList);
  const selectedAnpr = anprWatchlists.find((item) => item.id === selectedAnprList);
  const currentWatchlists = mode === "face" ? faceWatchlists : anprWatchlists;
  const currentEvents = mode === "face" ? faceEvents : anprEvents;
  const matchReadyPersons = persons.filter((person) => numberValue(value(person, "embeddingCount", "embedding_count")) > 0).length;
  const criticalLists = currentWatchlists.filter((item) => ["P1", "P2"].includes(stringValue(value(item, "alertSeverity", "alert_severity")))).length;

  const closeDialog = () => {
    setDialog(undefined);
    setSaving(false);
  };

  const createFaceWatchlist = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await identityAnalyticsApi.createFaceWatchlist(faceWatchlistForm);
      setFaceWatchlistForm(emptyFaceWatchlist);
      closeDialog();
      await loadFace(response.data.id);
      setSelectedFaceList(response.data.id);
      setMessage({ kind: "success", text: "Face watchlist created and added to the operator workspace." });
    } catch (error) {
      setSaving(false);
      setMessage({ kind: "error", text: readable(error) });
    }
  };

  const enrollFacePerson = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedFaceList) return;
    setSaving(true);
    setMessage(undefined);
    try {
      await identityAnalyticsApi.enrollFacePerson(selectedFaceList, {
        ...facePersonForm,
        externalId: facePersonForm.externalId || undefined,
        dateOfBirth: facePersonForm.dateOfBirth || undefined,
        notes: facePersonForm.notes || undefined,
      });
      setFacePersonForm(emptyFacePerson);
      closeDialog();
      const response = await identityAnalyticsApi.listFacePersons(selectedFaceList);
      setPersons(response.data ?? []);
      setMessage({ kind: "success", text: "Identity record enrolled. Match readiness depends on approved face embeddings." });
    } catch (error) {
      setSaving(false);
      setMessage({ kind: "error", text: readable(error) });
    }
  };

  const createAnprWatchlist = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setMessage(undefined);
    try {
      const response = await identityAnalyticsApi.createAnprWatchlist(anprWatchlistForm);
      setAnprWatchlistForm(emptyAnprWatchlist);
      closeDialog();
      await loadAnpr(response.data.id);
      setSelectedAnprList(response.data.id);
      setMessage({ kind: "success", text: "ANPR watchlist created and ready for plate registration." });
    } catch (error) {
      setSaving(false);
      setMessage({ kind: "error", text: readable(error) });
    }
  };

  const addPlate = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedAnprList) return;
    setSaving(true);
    setMessage(undefined);
    try {
      await identityAnalyticsApi.addAnprPlate(selectedAnprList, {
        ...plateForm,
        plateNumber: plateForm.plateNumber.trim().toUpperCase(),
        countryCode: plateForm.countryCode.trim().toUpperCase(),
        regionCode: plateForm.regionCode || undefined,
        vehicleMake: plateForm.vehicleMake || undefined,
        vehicleModel: plateForm.vehicleModel || undefined,
        vehicleColor: plateForm.vehicleColor || undefined,
        ownerName: plateForm.ownerName || undefined,
        notes: plateForm.notes || undefined,
        expiresAt: plateForm.expiresAt ? new Date(plateForm.expiresAt).toISOString() : undefined,
      });
      setPlateForm(emptyPlate);
      closeDialog();
      setMessage({ kind: "success", text: "Plate registered in the selected ANPR watchlist." });
    } catch (error) {
      setSaving(false);
      setMessage({ kind: "error", text: readable(error) });
    }
  };

  return (
    <main className="min-h-[calc(100vh-5rem)] bg-slate-950 p-4 text-slate-100 xl:p-6">
      <header className="relative mb-5 overflow-hidden rounded-3xl border border-slate-800 bg-slate-900/90 p-6 shadow-2xl shadow-slate-950/30">
        <div className="absolute -right-20 -top-24 h-64 w-64 rounded-full bg-cyan-500/10 blur-3xl" />
        <div className="relative flex flex-wrap items-start justify-between gap-5">
          <div className="flex max-w-3xl items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl border border-cyan-500/25 bg-cyan-500/10 text-cyan-300">
              {mode === "face" ? <ScanFace size={24} /> : <CarFront size={24} />}
            </span>
            <div>
              <p className="text-[11px] font-bold tracking-[.22em] text-cyan-400">CONSENT-AWARE IDENTITY INTELLIGENCE</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight">{mode === "face" ? "Face recognition" : "ANPR operations"}</h1>
              <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-400">
                {mode === "face"
                  ? "Manage approved identity watchlists, enrolment records and reviewable camera matches."
                  : "Manage plate watchlists, register vehicles of interest and inspect recent recognition events."}
              </p>
            </div>
          </div>
          <button type="button" onClick={() => setDialog(mode === "face" ? "face-watchlist" : "anpr-watchlist")} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-500">
            <Plus size={15} /> New watchlist
          </button>
        </div>
      </header>

      <nav className="mb-5 flex w-fit gap-1 rounded-xl border border-slate-800 bg-slate-900 p-1" aria-label="Identity intelligence workspaces">
        <Link href="/analytics/face-recognition" className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ${mode === "face" ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800"}`}><ScanFace size={14} />Face watchlists</Link>
        <Link href="/analytics/anpr" className={`flex items-center gap-2 rounded-lg px-4 py-2 text-xs font-semibold ${mode === "anpr" ? "bg-cyan-600 text-white" : "text-slate-400 hover:bg-slate-800"}`}><CarFront size={14} />ANPR watchlists</Link>
      </nav>

      {message && (
        <div role={message.kind === "error" ? "alert" : "status"} className={`mb-5 flex items-start gap-3 rounded-xl border p-3 text-sm ${message.kind === "error" ? "border-red-500/30 bg-red-500/10 text-red-200" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-200"}`}>
          {message.kind === "error" ? <AlertTriangle className="mt-0.5 shrink-0" size={16} /> : <CheckCircle2 className="mt-0.5 shrink-0" size={16} />}
          <span className="flex-1">{message.text}</span>
          <button type="button" onClick={() => setMessage(undefined)} aria-label="Dismiss message"><X size={15} /></button>
        </div>
      )}

      <section className="mb-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric icon={<ListFilter />} label="Watchlists" value={currentWatchlists.length} detail="available to this tenant" />
        <Metric icon={mode === "face" ? <UsersRound /> : <CarFront />} label={mode === "face" ? "Enrolled identities" : "Matched plates"} value={mode === "face" ? persons.length : anprEvents.length} detail={mode === "face" ? `${matchReadyPersons} match ready` : "in current result set"} />
        <Metric icon={<Eye />} label="Recent events" value={currentEvents.length} detail="latest authorized results" />
        <Metric icon={<ShieldCheck />} label="Priority policies" value={criticalLists} detail="P1 or P2 notification" />
      </section>

      <section className="mb-5 flex flex-wrap items-end gap-3 rounded-2xl border border-slate-800 bg-slate-900/80 p-4">
        <label className={`min-w-[240px] flex-1 ${labelClass}`}>Watchlist scope
          <select value={mode === "face" ? selectedFaceList : selectedAnprList} onChange={(event) => {
            if (mode === "face") {
              setSelectedFaceList(event.target.value);
              void loadFace(event.target.value);
            } else {
              setSelectedAnprList(event.target.value);
              void loadAnpr(event.target.value);
            }
          }} className={inputClass}>
            <option value="">All watchlists</option>
            {currentWatchlists.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        {mode === "face" ? (
          <label className={`min-w-[220px] flex-1 ${labelClass}`}>Minimum similarity: {Math.round(minSimilarity * 100)}%
            <input type="range" min="0.4" max="0.99" step="0.01" value={minSimilarity} onChange={(event) => setMinSimilarity(Number(event.target.value))} className="mt-3 w-full accent-cyan-500" />
          </label>
        ) : (
          <label className={`min-w-[220px] flex-1 ${labelClass}`}>Plate search
            <span className="relative block"><Search className="absolute left-3 top-[18px] text-slate-600" size={14} /><input value={plateQuery} onChange={(event) => setPlateQuery(event.target.value.toUpperCase())} placeholder="KA01AB1234" className={`${inputClass} pl-9 uppercase`} /></span>
          </label>
        )}
        <button type="button" onClick={() => void refresh()} disabled={loading} className="inline-flex h-10 items-center gap-2 rounded-xl border border-slate-700 bg-slate-800 px-4 text-xs font-semibold text-slate-200 hover:border-cyan-500 disabled:opacity-50"><RefreshCw size={14} className={loading ? "animate-spin" : ""} />Apply & refresh</button>
      </section>

      <div className="grid gap-5 2xl:grid-cols-[.78fr_1.22fr]">
        <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
          <header className="flex items-center justify-between border-b border-slate-800 p-5">
            <div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">POLICY SETS</p><h2 className="mt-1 text-lg font-semibold">Configured watchlists</h2></div>
            <span className="rounded-full bg-slate-800 px-3 py-1 text-xs text-slate-400">{currentWatchlists.length}</span>
          </header>
          {loading ? <LoadingState text="Loading watchlists" /> : currentWatchlists.length === 0 ? <EmptyState icon={<ListFilter />} title="No watchlists configured" text="Create a governed watchlist to begin identity matching." /> : (
            <div className="divide-y divide-slate-800">
              {currentWatchlists.map((item) => {
                const selected = item.id === (mode === "face" ? selectedFaceList : selectedAnprList);
                const listType = stringValue(value(item, "listType", "list_type"), "watchlist");
                const severity = stringValue(value(item, "alertSeverity", "alert_severity"), "P2");
                return <button type="button" key={item.id} onClick={() => mode === "face" ? setSelectedFaceList(item.id) : setSelectedAnprList(item.id)} className={`flex w-full items-start gap-3 p-4 text-left transition ${selected ? "bg-cyan-500/10" : "hover:bg-slate-800/60"}`}>
                  <span className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl ${selected ? "bg-cyan-500/15 text-cyan-300" : "bg-slate-800 text-slate-500"}`}>{mode === "face" ? <Fingerprint size={17} /> : <CarFront size={17} />}</span>
                  <span className="min-w-0 flex-1"><strong className="block truncate text-sm text-slate-100">{item.name}</strong><small className="mt-1 block truncate text-xs text-slate-500">{item.description || `${listType.replaceAll("-", " ")} identity policy`}</small><span className="mt-2 flex gap-2"><em className="rounded bg-slate-800 px-2 py-1 text-[9px] not-italic uppercase text-slate-400">{listType.replaceAll("-", " ")}</em><em className={`rounded px-2 py-1 text-[9px] not-italic font-bold ${severity === "P1" ? "bg-red-500/15 text-red-300" : severity === "P2" ? "bg-amber-500/15 text-amber-300" : "bg-slate-800 text-slate-400"}`}>{severity}</em></span></span>
                </button>;
              })}
            </div>
          )}
        </section>

        <div className="space-y-5">
          {mode === "face" ? (
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
              <header className="flex items-center justify-between gap-3 border-b border-slate-800 p-5"><div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">IDENTITY ROSTER</p><h2 className="mt-1 text-lg font-semibold">{selectedFace?.name ?? "Select a face watchlist"}</h2></div><button type="button" disabled={!selectedFaceList} onClick={() => setDialog("face-person")} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"><UserPlus size={14} />Enrol identity</button></header>
              {persons.length === 0 ? <EmptyState icon={<UsersRound />} title="No enrolled identities" text={selectedFaceList ? "Add an approved identity record to this watchlist." : "Select or create a watchlist first."} /> : <div className="divide-y divide-slate-800">{persons.map((person) => {
                const embeddings = numberValue(value(person, "embeddingCount", "embedding_count"));
                return <article key={person.id} className="flex items-center gap-3 p-4"><span className="grid h-9 w-9 place-items-center rounded-full bg-slate-800 text-slate-400"><ScanFace size={16} /></span><div className="min-w-0 flex-1"><strong className="block truncate text-sm">{stringValue(value(person, "fullName", "full_name"), "Unnamed identity")}</strong><span className="text-xs text-slate-500">{stringValue(value(person, "externalId", "external_id"), "No external ID")} · {numberValue(value(person, "matchCount", "match_count"))} matches</span></div><span className={`rounded-full px-2.5 py-1 text-[9px] font-bold uppercase ${embeddings > 0 ? "bg-emerald-500/15 text-emerald-300" : "bg-amber-500/15 text-amber-300"}`}>{embeddings > 0 ? `${embeddings} embeddings` : "Capture required"}</span></article>;
              })}</div>}
            </section>
          ) : (
            <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
              <header className="flex items-center justify-between gap-3 border-b border-slate-800 p-5"><div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">VEHICLE REGISTRY</p><h2 className="mt-1 text-lg font-semibold">{selectedAnpr?.name ?? "Select an ANPR watchlist"}</h2></div><button type="button" disabled={!selectedAnprList} onClick={() => setDialog("anpr-plate")} className="inline-flex items-center gap-2 rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-slate-700 disabled:opacity-40"><Plus size={14} />Register plate</button></header>
              <div className="grid min-h-36 place-items-center p-6 text-center"><div><CarFront className="mx-auto text-slate-700" size={28} /><p className="mt-3 text-sm text-slate-400">{selectedAnprList ? "Register plates here; matching sightings appear in the event queue below." : "Select or create a watchlist first."}</p><p className="mt-2 text-xs text-slate-600">Plate records are write-only in the current control-plane API, while sighting results remain reviewable.</p></div></div>
            </section>
          )}

          <section className="overflow-hidden rounded-2xl border border-slate-800 bg-slate-900/80">
            <header className="flex items-center justify-between border-b border-slate-800 p-5"><div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">RECENT MATCHES</p><h2 className="mt-1 text-lg font-semibold">Review queue</h2></div><Camera size={19} className="text-slate-600" /></header>
            {loading ? <LoadingState text="Loading recognition events" /> : currentEvents.length === 0 ? <EmptyState icon={<Eye />} title="No matching events" text="No authorized recognition events match the current filters." /> : mode === "face" ? <FaceEventList events={faceEvents} /> : <AnprEventList events={anprEvents} />}
          </section>
        </div>
      </div>

      <aside className="mt-5 flex items-start gap-3 rounded-2xl border border-amber-500/20 bg-amber-500/5 p-4 text-sm text-slate-400">
        <ShieldCheck className="mt-0.5 shrink-0 text-amber-300" size={18} />
        <div><strong className="text-amber-200">Governance reminder</strong><p className="mt-1 leading-6">Use identity and plate recognition only for approved purposes, with role-based access, documented retention, and human review before consequential action. Searches and enrolments are written to the analytics audit trail.</p></div>
        <Link href="/maintenance/privacy" className="ml-auto inline-flex shrink-0 items-center gap-1 text-xs font-semibold text-cyan-300">Privacy controls <ArrowUpRight size={13} /></Link>
      </aside>

      {dialog && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/80 p-4 backdrop-blur-sm" role="presentation" onMouseDown={closeDialog}>
          <section className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-2xl border border-slate-700 bg-slate-900 shadow-2xl" role="dialog" aria-modal="true" aria-labelledby="identity-dialog-title" onMouseDown={(event) => event.stopPropagation()}>
            <header className="flex items-start justify-between border-b border-slate-800 p-5"><div><p className="text-[10px] font-bold tracking-[.18em] text-cyan-400">GOVERNED WORKFLOW</p><h2 id="identity-dialog-title" className="mt-1 text-lg font-semibold">{dialogTitle(dialog)}</h2></div><button type="button" onClick={closeDialog} className="rounded-lg p-2 text-slate-500 hover:bg-slate-800 hover:text-white" aria-label="Close dialog"><X size={17} /></button></header>
            {dialog === "face-watchlist" && <FaceWatchlistForm value={faceWatchlistForm} setValue={setFaceWatchlistForm} saving={saving} onSubmit={createFaceWatchlist} />}
            {dialog === "face-person" && <FacePersonForm value={facePersonForm} setValue={setFacePersonForm} saving={saving} onSubmit={enrollFacePerson} />}
            {dialog === "anpr-watchlist" && <AnprWatchlistForm value={anprWatchlistForm} setValue={setAnprWatchlistForm} saving={saving} onSubmit={createAnprWatchlist} />}
            {dialog === "anpr-plate" && <PlateForm value={plateForm} setValue={setPlateForm} saving={saving} onSubmit={addPlate} />}
          </section>
        </div>
      )}
    </main>
  );
}

function FaceEventList({ events }: { events: FaceRecognitionEvent[] }) {
  return <div className="divide-y divide-slate-800">{events.map((event) => {
    const similarity = percent(value(event, "similarityScore", "similarity_score"));
    const occurredAt = stringValue(value(event, "occurredAt", "occurred_at"));
    const snapshot = stringValue(value(event, "snapshotReference", "snapshot_reference"));
    return <article key={event.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded bg-violet-500/15 px-2 py-1 text-[9px] font-bold text-violet-300">{similarity} MATCH</span><strong className="truncate text-sm">{stringValue(value(event, "personName", "person_name"), "Unknown identity")}</strong></div><p className="mt-2 text-xs text-slate-500">{stringValue(value(event, "watchlistName", "watchlist_name"), "Unassigned watchlist")} · {stringValue(value(event, "cameraName", "camera_name"), "Unknown camera")}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-600"><Clock3 size={11} />{date(occurredAt)}</p></div>{snapshot ? <a href={snapshot} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300">Open evidence <ArrowUpRight size={12} /></a> : <span className="text-[10px] text-slate-600">No snapshot reference</span>}</article>;
  })}</div>;
}

function AnprEventList({ events }: { events: AnprEvent[] }) {
  return <div className="divide-y divide-slate-800">{events.map((event) => {
    const confidence = percent(value(event, "plateConfidence", "plate_confidence"));
    const occurredAt = stringValue(value(event, "occurredAt", "occurred_at"));
    const snapshot = stringValue(value(event, "snapshotReference", "snapshot_reference"));
    return <article key={event.id} className="grid gap-3 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center"><div className="min-w-0"><div className="flex items-center gap-2"><span className="rounded bg-sky-500/15 px-2 py-1 text-[9px] font-bold text-sky-300">{confidence} READ</span><strong className="truncate font-mono text-sm tracking-wider">{stringValue(value(event, "plateNumber", "plate_number"), "UNKNOWN")}</strong></div><p className="mt-2 text-xs text-slate-500">{stringValue(value(event, "watchlistName", "watchlist_name"), "No watchlist match")} · {stringValue(value(event, "cameraName", "camera_name"), "Unknown camera")} · {stringValue(value(event, "entryDirection", "entry_direction"), "unknown")}</p><p className="mt-1 flex items-center gap-1 text-[10px] text-slate-600"><Clock3 size={11} />{date(occurredAt)}</p></div>{snapshot ? <a href={snapshot} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-semibold text-cyan-300">Open evidence <ArrowUpRight size={12} /></a> : <span className="text-[10px] text-slate-600">No snapshot reference</span>}</article>;
  })}</div>;
}

function FaceWatchlistForm({ value: form, setValue, saving, onSubmit }: { value: typeof emptyFaceWatchlist; setValue: React.Dispatch<React.SetStateAction<typeof emptyFaceWatchlist>>; saving: boolean; onSubmit: (event: React.FormEvent) => void }) {
  return <form className="space-y-4 p-5" onSubmit={onSubmit}><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Watchlist name<input required minLength={2} value={form.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="Restricted persons" /></label><label className={labelClass}>List type<select value={form.listType} onChange={(event) => setValue((current) => ({ ...current, listType: event.target.value as typeof current.listType }))} className={inputClass}><option value="security">Security</option><option value="vip">VIP</option><option value="staff">Staff</option><option value="blacklist">Blacklist</option><option value="missing-person">Missing person</option></select></label></div><label className={labelClass}>Description<textarea rows={3} value={form.description} onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))} className={inputClass} placeholder="Document the approved operational purpose." /></label><PolicyFields severity={form.alertSeverity} enabled={form.alertOnMatch} setSeverity={(alertSeverity) => setValue((current) => ({ ...current, alertSeverity }))} setEnabled={(alertOnMatch) => setValue((current) => ({ ...current, alertOnMatch }))} /><SubmitButton saving={saving} label="Create face watchlist" /></form>;
}

function FacePersonForm({ value: form, setValue, saving, onSubmit }: { value: typeof emptyFacePerson; setValue: React.Dispatch<React.SetStateAction<typeof emptyFacePerson>>; saving: boolean; onSubmit: (event: React.FormEvent) => void }) {
  return <form className="space-y-4 p-5" onSubmit={onSubmit}><div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3 text-xs leading-5 text-amber-100">This creates an identity record only. Face imagery and embeddings must come from an approved, consent-aware capture pipeline.</div><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Full name<input required value={form.fullName} onChange={(event) => setValue((current) => ({ ...current, fullName: event.target.value }))} className={inputClass} /></label><label className={labelClass}>External ID<input value={form.externalId} onChange={(event) => setValue((current) => ({ ...current, externalId: event.target.value }))} className={inputClass} placeholder="Employee or case ID" /></label><label className={labelClass}>Date of birth<input type="date" value={form.dateOfBirth} onChange={(event) => setValue((current) => ({ ...current, dateOfBirth: event.target.value }))} className={inputClass} /></label><label className={labelClass}>Gender<select value={form.gender} onChange={(event) => setValue((current) => ({ ...current, gender: event.target.value as typeof current.gender }))} className={inputClass}><option value="unknown">Not recorded</option><option value="female">Female</option><option value="male">Male</option><option value="other">Other</option></select></label></div><label className={labelClass}>Notes<textarea rows={3} value={form.notes} onChange={(event) => setValue((current) => ({ ...current, notes: event.target.value }))} className={inputClass} /></label><SubmitButton saving={saving} label="Enrol identity record" /></form>;
}

function AnprWatchlistForm({ value: form, setValue, saving, onSubmit }: { value: typeof emptyAnprWatchlist; setValue: React.Dispatch<React.SetStateAction<typeof emptyAnprWatchlist>>; saving: boolean; onSubmit: (event: React.FormEvent) => void }) {
  return <form className="space-y-4 p-5" onSubmit={onSubmit}><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Watchlist name<input required minLength={2} value={form.name} onChange={(event) => setValue((current) => ({ ...current, name: event.target.value }))} className={inputClass} placeholder="Vehicles of interest" /></label><label className={labelClass}>List type<select value={form.listType} onChange={(event) => setValue((current) => ({ ...current, listType: event.target.value as typeof current.listType }))} className={inputClass}><option value="alert">Alert</option><option value="stolen">Stolen</option><option value="wanted">Wanted</option><option value="vip">VIP</option><option value="staff">Staff</option><option value="blacklist">Blacklist</option></select></label></div><label className={labelClass}>Description<textarea rows={3} value={form.description} onChange={(event) => setValue((current) => ({ ...current, description: event.target.value }))} className={inputClass} placeholder="Document the operational reason for this list." /></label><PolicyFields severity={form.alertSeverity} enabled={form.alertOnMatch} setSeverity={(alertSeverity) => setValue((current) => ({ ...current, alertSeverity }))} setEnabled={(alertOnMatch) => setValue((current) => ({ ...current, alertOnMatch }))} /><label className="flex items-start gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs text-slate-400"><input type="checkbox" checked={form.alertAuthorities} onChange={(event) => setValue((current) => ({ ...current, alertAuthorities: event.target.checked }))} className="mt-0.5 accent-cyan-500" /><span><strong className="block text-slate-200">Mark for authority-notification workflow</strong><small className="mt-1 block leading-5 text-slate-500">This records policy intent; external notification still requires its configured approval workflow.</small></span></label><SubmitButton saving={saving} label="Create ANPR watchlist" /></form>;
}

function PlateForm({ value: form, setValue, saving, onSubmit }: { value: typeof emptyPlate; setValue: React.Dispatch<React.SetStateAction<typeof emptyPlate>>; saving: boolean; onSubmit: (event: React.FormEvent) => void }) {
  return <form className="space-y-4 p-5" onSubmit={onSubmit}><div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Plate number<input required minLength={2} value={form.plateNumber} onChange={(event) => setValue((current) => ({ ...current, plateNumber: event.target.value.toUpperCase() }))} className={`${inputClass} uppercase`} placeholder="KA01AB1234" /></label><label className={labelClass}>Country code<input required minLength={2} maxLength={2} value={form.countryCode} onChange={(event) => setValue((current) => ({ ...current, countryCode: event.target.value.toUpperCase() }))} className={`${inputClass} uppercase`} /></label><label className={labelClass}>Region code<input value={form.regionCode} onChange={(event) => setValue((current) => ({ ...current, regionCode: event.target.value }))} className={inputClass} placeholder="KA" /></label><label className={labelClass}>Vehicle type<select value={form.vehicleType} onChange={(event) => setValue((current) => ({ ...current, vehicleType: event.target.value as typeof current.vehicleType }))} className={inputClass}><option value="car">Car</option><option value="motorcycle">Motorcycle</option><option value="bus">Bus</option><option value="truck">Truck</option><option value="other">Other</option></select></label><label className={labelClass}>Make<input value={form.vehicleMake} onChange={(event) => setValue((current) => ({ ...current, vehicleMake: event.target.value }))} className={inputClass} /></label><label className={labelClass}>Model<input value={form.vehicleModel} onChange={(event) => setValue((current) => ({ ...current, vehicleModel: event.target.value }))} className={inputClass} /></label><label className={labelClass}>Colour<input value={form.vehicleColor} onChange={(event) => setValue((current) => ({ ...current, vehicleColor: event.target.value }))} className={inputClass} /></label><label className={labelClass}>Owner / reference<input value={form.ownerName} onChange={(event) => setValue((current) => ({ ...current, ownerName: event.target.value }))} className={inputClass} /></label><label className={labelClass}>Expiry<input type="datetime-local" value={form.expiresAt} onChange={(event) => setValue((current) => ({ ...current, expiresAt: event.target.value }))} className={inputClass} /></label></div><label className={labelClass}>Reason<input required value={form.reason} onChange={(event) => setValue((current) => ({ ...current, reason: event.target.value }))} className={inputClass} placeholder="Operational justification" /></label><label className={labelClass}>Notes<textarea rows={3} value={form.notes} onChange={(event) => setValue((current) => ({ ...current, notes: event.target.value }))} className={inputClass} /></label><SubmitButton saving={saving} label="Register plate" /></form>;
}

function PolicyFields({ severity, enabled, setSeverity, setEnabled }: { severity: "P1" | "P2" | "P3" | "P4" | "P5"; enabled: boolean; setSeverity: (value: "P1" | "P2" | "P3" | "P4" | "P5") => void; setEnabled: (value: boolean) => void }) {
  return <div className="grid gap-4 sm:grid-cols-2"><label className={labelClass}>Alert severity<select value={severity} onChange={(event) => setSeverity(event.target.value as typeof severity)} className={inputClass}><option value="P1">P1 · Critical</option><option value="P2">P2 · High</option><option value="P3">P3 · Medium</option><option value="P4">P4 · Low</option><option value="P5">P5 · Information</option></select></label><label className="mt-5 flex items-center gap-3 rounded-xl border border-slate-800 bg-slate-950/50 p-3 text-xs font-semibold text-slate-300"><input type="checkbox" checked={enabled} onChange={(event) => setEnabled(event.target.checked)} className="accent-cyan-500" />Raise an alert on match</label></div>;
}

function SubmitButton({ saving, label }: { saving: boolean; label: string }) {
  return <div className="flex justify-end border-t border-slate-800 pt-4"><button disabled={saving} className="inline-flex items-center gap-2 rounded-xl bg-cyan-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-cyan-500 disabled:opacity-50">{saving ? <LoaderCircle className="animate-spin" size={15} /> : <Plus size={15} />}{saving ? "Saving…" : label}</button></div>;
}

function Metric({ icon, label, value: metricValue, detail }: { icon: React.ReactNode; label: string; value: number; detail: string }) {
  return <article className="flex items-center gap-4 rounded-2xl border border-slate-800 bg-slate-900/80 p-4"><span className="grid h-10 w-10 place-items-center rounded-xl bg-slate-800 text-cyan-300">{icon}</span><div><p className="text-2xl font-bold">{metricValue}</p><strong className="block text-xs text-slate-300">{label}</strong><span className="text-[10px] text-slate-600">{detail}</span></div></article>;
}

function LoadingState({ text }: { text: string }) {
  return <div className="grid min-h-40 place-items-center p-6 text-center text-sm text-slate-500"><div><LoaderCircle className="mx-auto mb-3 animate-spin text-cyan-500" /><p>{text}…</p></div></div>;
}

function EmptyState({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return <div className="grid min-h-40 place-items-center p-6 text-center"><div><span className="mx-auto grid h-10 w-10 place-items-center rounded-xl bg-slate-800 text-slate-600">{icon}</span><strong className="mt-3 block text-sm text-slate-300">{title}</strong><p className="mt-1 text-xs leading-5 text-slate-500">{text}</p></div></div>;
}

function dialogTitle(kind: DialogKind) {
  if (kind === "face-watchlist") return "Create face-recognition watchlist";
  if (kind === "face-person") return "Enrol identity record";
  if (kind === "anpr-watchlist") return "Create ANPR watchlist";
  return "Register a plate";
}

function value(item: object, ...keys: string[]) {
  const record = item as Record<string, unknown>;
  for (const key of keys) if (record[key] !== undefined && record[key] !== null) return record[key];
  return undefined;
}

function stringValue(input: unknown, fallback = "") {
  return input === undefined || input === null || input === "" ? fallback : String(input);
}

function numberValue(input: unknown) {
  const parsed = Number(input);
  return Number.isFinite(parsed) ? parsed : 0;
}

function percent(input: unknown) {
  const parsed = numberValue(input);
  return `${Math.round((parsed <= 1 ? parsed * 100 : parsed) * 10) / 10}%`;
}

function date(input: string) {
  return input && Number.isFinite(Date.parse(input)) ? new Date(input).toLocaleString() : "Time unavailable";
}

function readable(error: unknown) {
  return error instanceof Error ? error.message : "Unable to load identity intelligence data.";
}
