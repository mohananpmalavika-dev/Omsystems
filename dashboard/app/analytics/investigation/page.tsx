"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  Camera,
  Download,
  ExternalLink,
  MapPin,
  RefreshCw,
  Route,
  Search,
  Upload,
} from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  reidApi,
  type ReidCameraSighting,
  type ReidGlobalIdentity,
  type ReidPersonJourney,
  type ReidStats,
} from "@/lib/api-client";

type ProbeMatch = {
  sighting: ReidCameraSighting;
  similarity: number;
  globalId: string;
};

const MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
const MAX_PROBE_DIMENSION = 640;

function formatDateTime(value?: string | Date | null) {
  if (!value) return "Not recorded";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "Not recorded" : date.toLocaleString();
}

function formatDuration(totalSeconds: number) {
  const seconds = Math.max(0, Math.round(totalSeconds));
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return minutes ? `${minutes}m ${remaining}s` : `${remaining}s`;
}

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const chunkSize = 0x8000;
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize));
  }
  return btoa(binary);
}

async function prepareProbeCrop(file: File) {
  if (!file.type.startsWith("image/")) {
    throw new Error("Choose an image file for visual correlation.");
  }
  if (file.size > MAX_UPLOAD_BYTES) {
    throw new Error("The probe image must be 12 MB or smaller.");
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, MAX_PROBE_DIMENSION / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) {
    bitmap.close();
    throw new Error("Your browser could not prepare the probe image.");
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();
  const rgba = context.getImageData(0, 0, width, height).data;
  const rgb = new Uint8Array(width * height * 3);
  for (let source = 0, target = 0; source < rgba.length; source += 4) {
    rgb[target++] = rgba[source];
    rgb[target++] = rgba[source + 1];
    rgb[target++] = rgba[source + 2];
  }

  return { probeCropBase64: toBase64(rgb), cropWidth: width, cropHeight: height };
}

export default function AIInvestigationPage() {
  const [identities, setIdentities] = useState<ReidGlobalIdentity[]>([]);
  const [selectedSubjectId, setSelectedSubjectId] = useState("");
  const [journey, setJourney] = useState<ReidPersonJourney | null>(null);
  const [stats, setStats] = useState<ReidStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [similarityThreshold, setSimilarityThreshold] = useState(0.75);
  const [probeSearching, setProbeSearching] = useState(false);
  const [probeError, setProbeError] = useState<string | null>(null);
  const [probeResults, setProbeResults] = useState<ProbeMatch[]>([]);
  const [probePreviewUrl, setProbePreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const selectedSubjectIdRef = useRef("");

  const loadSubjectJourney = useCallback(async (globalId: string) => {
    if (!globalId) {
      setJourney(null);
      return;
    }

    const response = await reidApi.getJourney(globalId);
    if (!response.success || !response.data) {
      throw new Error("The service did not return a journey for this identity.");
    }
    setJourney(response.data);
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    try {
      const [identitiesResponse, statsResponse] = await Promise.all([
        reidApi.listIdentities({ limit: 50 }),
        reidApi.getStats(),
      ]);
      if (!identitiesResponse.success) {
        throw new Error("The identity service did not return a successful response.");
      }

      const liveIdentities = identitiesResponse.data ?? [];
      setIdentities(liveIdentities);
      setStats(statsResponse.success ? statsResponse.data : null);

      if (!liveIdentities.length) {
        setSelectedSubjectId("");
        setJourney(null);
        return;
      }

      const nextSubjectId = liveIdentities.some((identity) => identity.global_id === selectedSubjectIdRef.current)
        ? selectedSubjectIdRef.current
        : liveIdentities[0].global_id;
      selectedSubjectIdRef.current = nextSubjectId;
      setSelectedSubjectId(nextSubjectId);
      await loadSubjectJourney(nextSubjectId);
    } catch (error) {
      setIdentities([]);
      setJourney(null);
      setStats(null);
      setLoadError(error instanceof Error ? error.message : "Unable to load investigation telemetry.");
    } finally {
      setLoading(false);
    }
  }, [loadSubjectJourney]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => () => {
    if (probePreviewUrl) URL.revokeObjectURL(probePreviewUrl);
  }, [probePreviewUrl]);

  const handleSelectSubject = async (globalId: string) => {
    selectedSubjectIdRef.current = globalId;
    setSelectedSubjectId(globalId);
    setLoading(true);
    setLoadError(null);
    try {
      await loadSubjectJourney(globalId);
    } catch (error) {
      setJourney(null);
      setLoadError(error instanceof Error ? error.message : "Unable to load this subject's journey.");
    } finally {
      setLoading(false);
    }
  };

  const handleProbeUpload = async (file: File) => {
    setProbeSearching(true);
    setProbeError(null);
    setProbeResults([]);
    try {
      const previewUrl = URL.createObjectURL(file);
      setProbePreviewUrl((previous) => {
        if (previous) URL.revokeObjectURL(previous);
        return previewUrl;
      });
      const crop = await prepareProbeCrop(file);
      const response = await reidApi.probeSearch({
        ...crop,
        similarityThreshold,
        limit: 50,
      });
      if (!response.success) {
        throw new Error("The probe search did not return a successful response.");
      }
      setProbeResults(response.data ?? []);
    } catch (error) {
      setProbeError(error instanceof Error ? error.message : "Unable to run the live probe search.");
    } finally {
      setProbeSearching(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const downloadObservedJourney = () => {
    if (!journey) return;
    const exportDocument = {
      schemaVersion: "1.0",
      exportedAt: new Date().toISOString(),
      source: "GET /v1/analytics/reid/journey/:globalId",
      journey,
    };
    const blob = new Blob([JSON.stringify(exportDocument, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `observed-journey-${journey.globalId}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const currentSubject = identities.find((identity) => identity.global_id === selectedSubjectId);
  const subjectDescription = typeof currentSubject?.metadata?.description === "string"
    ? currentSubject.metadata.description
    : "Select an identity returned by the ReID service.";
  const steps = journey?.steps ?? [];
  const transitions = journey?.transitions ?? [];
  const firstStep = steps[0];
  const lastStep = steps.at(-1);

  return (
    <AppLayout>
      <PageHero
        title="AI Investigation Tools"
        description="Live cross-camera journeys, visual probe searches, and observed-evidence exports."
        icon={Route}
      />

      <div className="container mx-auto max-w-7xl space-y-6 p-4 md:p-6">
        {loadError && (
          <div className="flex items-start justify-between gap-3 rounded-xl border border-rose-800/60 bg-rose-950/30 p-4 text-sm text-rose-100">
            <div className="flex gap-2"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />{loadError}</div>
            <button onClick={() => void loadData()} className="shrink-0 text-xs font-semibold text-rose-200 underline">Retry</button>
          </div>
        )}

        <Card className="border-slate-800 bg-slate-900/90">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <p className="text-xs font-medium text-slate-400">Live investigation target</p>
              <p className="mt-1 font-mono text-sm font-bold text-cyan-300">{selectedSubjectId || "No observed identities"}</p>
              <p className="mt-1 text-xs text-slate-400">
                {subjectDescription}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <select
                value={selectedSubjectId}
                disabled={!identities.length || loading}
                onChange={(event) => void handleSelectSubject(event.target.value)}
                className="rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-xs text-slate-200 disabled:cursor-not-allowed disabled:opacity-60"
              >
                {!identities.length && <option value="">No identities available</option>}
                {identities.map((identity) => <option key={identity.global_id} value={identity.global_id}>{identity.global_id}</option>)}
              </select>
              <input ref={fileInputRef} type="file" accept="image/*" className="hidden" onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void handleProbeUpload(file);
              }} />
              <button onClick={() => fileInputRef.current?.click()} className="flex items-center gap-1.5 rounded-lg border border-slate-700 bg-slate-800 px-3 py-2 text-xs font-semibold text-slate-100 hover:bg-slate-700">
                <Upload size={14} className="text-cyan-400" /> Probe image
              </button>
              <button onClick={() => void loadData()} disabled={loading} aria-label="Refresh live investigation data" className="rounded-lg border border-slate-700 bg-slate-800 p-2 text-slate-200 hover:bg-slate-700 disabled:opacity-60">
                <RefreshCw size={15} className={loading ? "animate-spin" : ""} />
              </button>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {[
            ["Identities", stats?.totalIdentities],
            ["Sightings", stats?.totalSightings],
            ["Transitions", stats?.crossCameraTransitions],
            ["Active cameras", stats?.activeCameras],
          ].map(([label, value]) => (
            <Card key={String(label)} className="border-slate-800 bg-slate-900/70">
              <CardContent className="p-4"><p className="text-xs text-slate-400">{label}</p><p className="mt-1 text-2xl font-bold text-slate-100">{typeof value === "number" ? value : "—"}</p></CardContent>
            </Card>
          ))}
        </div>

        {!loading && !journey && !loadError && (
          <Card className="border-dashed border-slate-700 bg-slate-900/60"><CardContent className="p-10 text-center text-sm text-slate-400">No live ReID journeys are available for this tenant yet. Ingest camera sightings before starting an investigation.</CardContent></Card>
        )}

        {journey && (
          <>
            <div className="grid gap-6 lg:grid-cols-3">
              <Card className="border-slate-800 bg-slate-900/80 lg:col-span-2">
                <CardHeader><CardTitle className="flex items-center gap-2 text-base text-slate-100"><Route className="h-5 w-5 text-cyan-400" />Observed cross-camera journey</CardTitle><CardDescription>Only sightings returned by the ReID service are shown.</CardDescription></CardHeader>
                <CardContent className="space-y-3">
                  {steps.map((step) => (
                    <div key={`${step.cameraId}-${step.enteredAt}-${step.stepIndex}`} className="flex gap-3 rounded-xl border border-slate-800 bg-slate-950 p-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-cyan-950 text-xs font-bold text-cyan-300">{step.stepIndex}</div>
                      <div className="min-w-0 flex-1"><p className="truncate text-sm font-semibold text-slate-100">{step.cameraName || step.cameraId}</p><p className="mt-1 text-xs text-slate-400">{formatDateTime(step.enteredAt)} · dwell {formatDuration(step.dwellSeconds)} · confidence {Math.round(step.confidence * 100)}%</p></div>
                      {step.snapshotUrl && <img src={step.snapshotUrl} alt={`Observation from ${step.cameraName || step.cameraId}`} className="h-12 w-12 rounded-lg object-cover" />}
                    </div>
                  ))}
                </CardContent>
              </Card>

              <Card className="border-slate-800 bg-slate-900/80"><CardHeader><CardTitle className="text-base text-slate-100">Observed summary</CardTitle></CardHeader><CardContent className="space-y-4 text-sm">
                <div><p className="text-xs text-slate-400">First seen</p><p className="mt-1 text-slate-100">{formatDateTime(journey.firstSeen)}</p></div>
                <div><p className="text-xs text-slate-400">Last seen</p><p className="mt-1 text-slate-100">{formatDateTime(journey.lastSeen)}</p></div>
                <div className="grid grid-cols-2 gap-3"><div><p className="text-xs text-slate-400">Sightings</p><p className="mt-1 font-bold text-cyan-300">{journey.totalSightings}</p></div><div><p className="text-xs text-slate-400">Cameras</p><p className="mt-1 font-bold text-cyan-300">{journey.uniqueCamerasCount}</p></div></div>
                {lastStep && <Link href={`/playback/synced?cameras=${encodeURIComponent(lastStep.cameraId)}&time=${encodeURIComponent(new Date(journey.lastSeen).toISOString())}`} className="flex items-center gap-1.5 text-xs font-semibold text-cyan-400 hover:text-cyan-300"><ExternalLink size={13} />Open last observation</Link>}
              </CardContent></Card>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <Card className="border-slate-800 bg-slate-900/80"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-slate-100"><MapPin className="h-5 w-5 text-violet-400" />Route plausibility</CardTitle><CardDescription>Transition results are determined by configured camera topology rules.</CardDescription></CardHeader><CardContent className="space-y-3">
                {transitions.length ? transitions.map((transition) => <div key={`${transition.fromCameraId}-${transition.toCameraId}-${transition.arrivedAt}`} className="rounded-xl border border-slate-800 bg-slate-950 p-3 text-sm"><div className="flex items-center justify-between gap-3"><span className="font-semibold text-slate-100">{transition.fromCameraName || transition.fromCameraId} → {transition.toCameraName || transition.toCameraId}</span><Badge className={transition.isPlausible ? "border-emerald-800 bg-emerald-950 text-emerald-300" : "border-amber-800 bg-amber-950 text-amber-300"}>{transition.isPlausible ? "Plausible" : "Review"}</Badge></div><p className="mt-1 text-xs text-slate-400">{formatDuration(transition.transitDurationSeconds)}{transition.reason ? ` · ${transition.reason}` : ""}</p></div>) : <p className="text-sm text-slate-400">No observed camera transitions are available.</p>}
              </CardContent></Card>

              <Card className="border-slate-800 bg-slate-900/80"><CardHeader><CardTitle className="flex items-center gap-2 text-base text-slate-100"><Download className="h-5 w-5 text-emerald-400" />Observed-journey export</CardTitle><CardDescription>Exports the exact journey response currently shown. This browser export is not represented as a chain-of-custody seal.</CardDescription></CardHeader><CardContent className="space-y-4"><p className="text-sm text-slate-400">{steps.length} observed sighting records from {formatDateTime(firstStep?.enteredAt)} to {formatDateTime(lastStep?.exitedAt || lastStep?.enteredAt)}.</p><button onClick={downloadObservedJourney} className="flex items-center gap-2 rounded-lg bg-emerald-600 px-3 py-2 text-xs font-bold text-slate-950 hover:bg-emerald-500"><Download size={14} />Download observed journey JSON</button></CardContent></Card>
            </div>
          </>
        )}

        <Card className="border-slate-800 bg-slate-900/80">
          <CardHeader><CardTitle className="flex items-center gap-2 text-base text-slate-100"><Search className="h-5 w-5 text-indigo-400" />Live visual probe search</CardTitle><CardDescription>Uploads are converted to RGB pixels in the browser and sent to the ReID probe API. Results below are live service responses.</CardDescription></CardHeader>
          <CardContent className="space-y-4">
            <div className="flex flex-wrap items-center gap-3"><label className="text-sm text-slate-300">Similarity threshold <span className="font-mono text-cyan-300">{Math.round(similarityThreshold * 100)}%</span></label><input type="range" min="0.5" max="0.95" step="0.05" value={similarityThreshold} onChange={(event) => setSimilarityThreshold(Number(event.target.value))} className="w-40 accent-cyan-500" />{probePreviewUrl && <img src={probePreviewUrl} alt="Uploaded probe" className="h-12 w-12 rounded-lg object-cover" />}</div>
            {probeSearching && <p className="text-sm text-slate-400">Searching live ReID observations…</p>}
            {probeError && <p className="rounded-lg border border-rose-800/60 bg-rose-950/30 p-3 text-sm text-rose-200">{probeError}</p>}
            {!probeSearching && !probeError && probeResults.length === 0 && <p className="text-sm text-slate-400">Upload a CCTV crop to query recorded ReID sightings.</p>}
            <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">{probeResults.map((match) => <div key={match.sighting.id} className="rounded-xl border border-indigo-900/60 bg-slate-950 p-3"><div className="flex items-start justify-between gap-2"><div><p className="text-sm font-semibold text-slate-100">{match.sighting.camera_name || match.sighting.camera_id}</p><p className="mt-1 text-xs text-slate-400">{formatDateTime(match.sighting.entered_at)}</p></div><Badge className="border-indigo-800 bg-indigo-950 text-indigo-200">{Math.round(match.similarity * 100)}%</Badge></div>{match.sighting.snapshot_url && <img src={match.sighting.snapshot_url} alt={`Probe match at ${match.sighting.camera_name || match.sighting.camera_id}`} className="mt-3 h-32 w-full rounded-lg object-cover" />}<p className="mt-3 font-mono text-xs text-slate-500">Identity: {match.globalId}</p></div>)}</div>
          </CardContent>
        </Card>
      </div>
    </AppLayout>
  );
}
