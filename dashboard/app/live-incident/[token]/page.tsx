"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useParams } from "next/navigation";
import {
  AlertTriangle,
  CheckCircle2,
  Navigation,
  PhoneCall,
  MapPin,
  Video,
} from "lucide-react";

interface LiveIncident {
  incidentId: string;
  severity: string;
  alertType: string;
  branchName: string;
  branchAddress?: string;
  gpsCoordinates?: { lat: number; lng: number };
  liveStreamUrl?: string;
  snapshotUrl?: string;
  status: string;
  expiresAt: string;
}

export default function QrtLiveIncidentPage() {
  const params = useParams();
  const token = typeof params?.token === "string" ? params.token : "";
  const [incident, setIncident] = useState<LiveIncident | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [responderName, setResponderName] = useState("");
  const [acknowledged, setAcknowledged] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This incident link is invalid.");
      setLoading(false);
      return;
    }

    const fetchIncident = async () => {
      try {
        const response = await fetch(`/api/control/v1/public/live-incident/${encodeURIComponent(token)}`, {
          cache: "no-store",
        });
        const body = await response.json().catch(() => ({}));
        if (!response.ok || !body.success || !body.data) {
          throw new Error(body.message || body.error || "This incident dispatch link has expired or is invalid.");
        }
        setIncident(body.data as LiveIncident);
        setAcknowledged(body.data.status === "ACKNOWLEDGED_ON_SCENE");
        setError(null);
      } catch (reason) {
        setError(reason instanceof Error ? reason.message : "Unable to load the incident dispatch.");
      } finally {
        setLoading(false);
      }
    };

    void fetchIncident();
  }, [token]);

  const acknowledgeArrival = async (event: FormEvent) => {
    event.preventDefault();
    if (!responderName.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(
        `/api/control/v1/public/live-incident/${encodeURIComponent(token)}/arrive`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ responderName: responderName.trim() }),
        },
      );
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) {
        throw new Error(body.message || body.error || "Unable to acknowledge arrival.");
      }
      setAcknowledged(true);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Unable to acknowledge arrival.");
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-slate-950 p-6 text-slate-300">
        <div className="h-10 w-10 animate-spin rounded-full border-4 border-rose-500 border-t-transparent" />
        <p className="font-mono text-sm">Validating incident dispatch…</p>
      </div>
    );
  }

  if (!incident) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-slate-950 p-6 text-center text-slate-300">
        <div className="max-w-md space-y-3 rounded-2xl border border-rose-800/80 bg-rose-950/60 p-4">
          <AlertTriangle className="mx-auto h-10 w-10 text-rose-400" />
          <h1 className="text-lg font-bold text-white">Incident link unavailable</h1>
          <p className="text-xs text-slate-400">{error || "Contact the command center for a new dispatch link."}</p>
        </div>
      </div>
    );
  }

  const hasLiveVideo = typeof incident.liveStreamUrl === "string" && incident.liveStreamUrl.trim().length > 0;
  const hasSnapshot = typeof incident.snapshotUrl === "string" && incident.snapshotUrl.trim().length > 0;
  const hasCoordinates = Number.isFinite(incident.gpsCoordinates?.lat) && Number.isFinite(incident.gpsCoordinates?.lng);

  return (
    <div className="mx-auto flex min-h-screen max-w-xl flex-col justify-between border-x border-slate-800/80 bg-slate-950 text-slate-100 shadow-2xl">
      <header className="space-y-2 border-b border-rose-900/40 bg-gradient-to-r from-rose-950 via-slate-900 to-slate-950 p-4">
        <div className="flex items-center justify-between">
          <span className="font-mono text-xs font-bold uppercase tracking-wider text-rose-300">QRT incident dispatch</span>
          <span className="rounded-full bg-rose-600 px-2.5 py-0.5 text-xs font-bold text-white">{incident.severity}</span>
        </div>
        <h1 className="text-xl font-bold tracking-tight text-white">{incident.alertType.replaceAll("_", " ")}</h1>
        <div className="flex items-center gap-2 text-xs text-slate-300">
          <MapPin className="h-3.5 w-3.5 shrink-0 text-blue-400" />
          <span className="font-semibold text-slate-200">{incident.branchName}</span>
          {incident.branchAddress && <span className="truncate text-[11px] text-slate-400">· {incident.branchAddress}</span>}
        </div>
      </header>

      <main className="flex-1 space-y-4 p-4">
        <div className="relative flex aspect-video items-center justify-center overflow-hidden rounded-xl border border-slate-800 bg-black shadow-xl">
          {hasLiveVideo ? (
            <video
              src={incident.liveStreamUrl}
              controls
              autoPlay
              muted
              playsInline
              className="h-full w-full object-contain"
            >
              Live video cannot be played by this browser.
            </video>
          ) : hasSnapshot ? (
            <img
              src={incident.snapshotUrl}
              alt={`Incident snapshot from ${incident.branchName}`}
              className="h-full w-full object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center space-y-2 text-slate-400">
              <Video className="h-10 w-10 text-slate-600" />
              <div className="text-center font-mono text-xs">No incident video was provided.</div>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 gap-2.5">
          <a
            href={hasCoordinates
              ? `https://www.google.com/maps/search/?api=1&query=${incident.gpsCoordinates!.lat},${incident.gpsCoordinates!.lng}`
              : undefined}
            target="_blank"
            rel="noopener noreferrer"
            aria-disabled={!hasCoordinates}
            className={`flex items-center justify-center gap-2 rounded-xl p-3 text-xs font-medium text-white shadow-md ${
              hasCoordinates ? "bg-blue-600 hover:bg-blue-500" : "pointer-events-none bg-slate-700 opacity-60"
            }`}
          >
            <Navigation className="h-4 w-4" />
            <span>Open map</span>
          </a>
          <a
            href="tel:112"
            className="flex items-center justify-center gap-2 rounded-xl border border-slate-700 bg-slate-800 p-3 text-xs font-medium text-slate-200 hover:bg-slate-700"
          >
            <PhoneCall className="h-4 w-4 text-emerald-400" />
            <span>Emergency services</span>
          </a>
        </div>

        {error && <p className="rounded-lg border border-rose-800 bg-rose-950/40 p-2 text-xs text-rose-300">{error}</p>}

        <section className="space-y-3 rounded-xl border border-slate-800 bg-slate-900/80 p-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">Field responder status</h2>
            <span className={`text-xs font-semibold ${acknowledged ? "text-emerald-400" : "text-amber-400"}`}>
              {acknowledged ? "On scene acknowledged" : "Awaiting arrival"}
            </span>
          </div>
          {acknowledged ? (
            <div className="flex items-center gap-2 rounded-lg border border-emerald-800/60 bg-emerald-950/40 p-3 text-xs text-emerald-200">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400" />
              Arrival was recorded by the command center.
            </div>
          ) : (
            <form onSubmit={acknowledgeArrival} className="space-y-2.5">
              <input
                type="text"
                value={responderName}
                onChange={(event) => setResponderName(event.target.value)}
                placeholder="Enter responder name or unit ID"
                required
                className="w-full rounded-lg border border-slate-800 bg-slate-950 px-3 py-2 text-xs text-slate-200 focus:border-rose-500 focus:outline-none"
              />
              <button
                type="submit"
                disabled={submitting || !responderName.trim()}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 disabled:opacity-60"
              >
                <CheckCircle2 className="h-4 w-4" />
                {submitting ? "Updating…" : "Acknowledge arrival"}
              </button>
            </form>
          )}
        </section>
      </main>

      <footer className="border-t border-slate-900 p-3 text-center font-mono text-[10px] text-slate-500">
        Dispatch expires {new Date(incident.expiresAt).toLocaleString()}
      </footer>
    </div>
  );
}
