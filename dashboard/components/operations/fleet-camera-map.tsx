"use client";

import { useEffect, useMemo, useState } from "react";
import { CircleMarker, MapContainer, Popup, TileLayer, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";

type LocationSource = "camera-metadata" | "ip-geolocation" | "branch-metadata";

interface CameraLocation {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  latitude: number;
  longitude: number;
  status: "online" | "offline" | "degraded" | "unknown";
  lastSeen?: string;
  uptime?: number;
  locationSource?: LocationSource;
  city?: string;
  country?: string;
}

interface FleetCameraMapProps {
  visibleBranchIds: string[];
  onOpenBranch: (branchId: string) => void;
}

const INDIA_CENTER: [number, number] = [20.5937, 78.9629];

const STATUS_STYLE: Record<CameraLocation["status"], { color: string; label: string }> = {
  online: { color: "#34d399", label: "Online" },
  degraded: { color: "#fbbf24", label: "Degraded" },
  offline: { color: "#fb7185", label: "Offline" },
  unknown: { color: "#94a3b8", label: "Unknown" },
};

const SOURCE_LABEL: Record<LocationSource, string> = {
  "camera-metadata": "Camera GPS",
  "ip-geolocation": "IP-based estimate",
  "branch-metadata": "Branch location fallback",
};

function FitCameraBounds({ cameras }: { cameras: CameraLocation[] }) {
  const map = useMap();

  useEffect(() => {
    if (cameras.length === 0) return;
    if (cameras.length === 1) {
      map.setView([cameras[0].latitude, cameras[0].longitude], 15);
      return;
    }
    map.fitBounds(cameras.map((camera) => [camera.latitude, camera.longitude] as [number, number]), {
      padding: [36, 36],
      maxZoom: 15,
    });
  }, [cameras, map]);

  return null;
}

function SourceBadge({ source }: { source?: LocationSource }) {
  const resolvedSource = source ?? "branch-metadata";
  const style = resolvedSource === "camera-metadata"
    ? "bg-emerald-500/15 text-emerald-200 border-emerald-400/30"
    : resolvedSource === "ip-geolocation"
      ? "bg-amber-500/15 text-amber-100 border-amber-400/30"
      : "bg-slate-500/15 text-slate-200 border-slate-400/30";
  return <span className={`inline-flex rounded border px-1.5 py-0.5 text-[10px] font-semibold ${style}`}>{SOURCE_LABEL[resolvedSource]}</span>;
}

export function FleetCameraMap({ visibleBranchIds, onOpenBranch }: FleetCameraMapProps) {
  const [cameras, setCameras] = useState<CameraLocation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    void fetch("/api/control/v1/camera-locations?includeOffline=true&useIpGeolocation=true", {
      credentials: "include",
      signal: controller.signal,
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => null);
        if (!response.ok || !payload?.success || !Array.isArray(payload.data)) {
          throw new Error(payload?.message || "Camera locations are unavailable");
        }
        setCameras(payload.data.filter(isValidCameraLocation));
      })
      .catch((reason: unknown) => {
        if (controller.signal.aborted) return;
        setError(reason instanceof Error ? reason.message : "Camera locations are unavailable");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, []);

  const visibleBranchIdSet = useMemo(() => new Set(visibleBranchIds), [visibleBranchIds]);
  const visibleCameras = useMemo(
    () => cameras.filter((camera) => visibleBranchIdSet.has(camera.branchId)),
    [cameras, visibleBranchIdSet],
  );
  const sourceCounts = useMemo(() => visibleCameras.reduce<Record<LocationSource, number>>((counts, camera) => {
    counts[camera.locationSource ?? "branch-metadata"] += 1;
    return counts;
  }, { "camera-metadata": 0, "ip-geolocation": 0, "branch-metadata": 0 }), [visibleCameras]);

  if (loading) {
    return <MapPanel><div className="grid h-[430px] place-items-center text-sm text-slate-400">Loading camera locations…</div></MapPanel>;
  }

  if (error) {
    return <MapPanel><div className="grid h-[430px] place-items-center px-6 text-center text-sm text-rose-300">{error}</div></MapPanel>;
  }

  if (visibleCameras.length === 0) {
    return (
      <MapPanel>
        <div className="grid h-[430px] place-items-center px-6 text-center">
          <div>
            <p className="text-sm font-semibold text-slate-200">No mapped cameras match the current fleet filters.</p>
            <p className="mt-1 text-xs text-slate-400">Save camera GPS coordinates or a branch location to place it on the map.</p>
          </div>
        </div>
      </MapPanel>
    );
  }

  return (
    <MapPanel>
      <div className="flex flex-col gap-2 border-b border-slate-800 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h3 className="text-sm font-bold text-white">Camera locations</h3>
          <p className="text-xs text-slate-400">{visibleCameras.length} camera{visibleCameras.length === 1 ? "" : "s"} shown from the current fleet selection.</p>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {sourceCounts["camera-metadata"] > 0 && <SourceBadge source="camera-metadata" />}
          {sourceCounts["ip-geolocation"] > 0 && <SourceBadge source="ip-geolocation" />}
          {sourceCounts["branch-metadata"] > 0 && <SourceBadge source="branch-metadata" />}
        </div>
      </div>
      <div className="h-[430px] bg-slate-950">
        <MapContainer center={INDIA_CENTER} zoom={5} scrollWheelZoom className="h-full w-full" aria-label="Camera location map">
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />
          <FitCameraBounds cameras={visibleCameras} />
          {visibleCameras.map((camera) => {
            const status = STATUS_STYLE[camera.status] ?? STATUS_STYLE.unknown;
            return (
              <CircleMarker
                key={camera.id}
                center={[camera.latitude, camera.longitude]}
                radius={9}
                pathOptions={{ color: "#f8fafc", weight: 2, fillColor: status.color, fillOpacity: 0.95 }}
              >
                <Popup>
                  <div className="min-w-52 space-y-2 p-1 text-slate-900">
                    <div>
                      <p className="font-semibold">{camera.name}</p>
                      <p className="text-xs text-slate-600">{camera.branchName}</p>
                    </div>
                    <div className="flex items-center justify-between gap-3 text-xs">
                      <span className="text-slate-600">Status</span>
                      <span className="font-semibold" style={{ color: status.color }}>{status.label}</span>
                    </div>
                    <div className="text-xs text-slate-600"><SourceBadge source={camera.locationSource} /></div>
                    <p className="font-mono text-[11px] text-slate-500">{camera.latitude.toFixed(6)}, {camera.longitude.toFixed(6)}</p>
                    {(camera.city || camera.country) && <p className="text-xs text-slate-600">{[camera.city, camera.country].filter(Boolean).join(", ")}</p>}
                    <button type="button" onClick={() => onOpenBranch(camera.branchId)} className="w-full rounded bg-blue-600 px-2 py-1.5 text-xs font-semibold text-white hover:bg-blue-700">
                      Open branch workspace
                    </button>
                  </div>
                </Popup>
              </CircleMarker>
            );
          })}
        </MapContainer>
      </div>
    </MapPanel>
  );
}

function MapPanel({ children }: { children: React.ReactNode }) {
  return <div className="overflow-hidden rounded-xl border border-slate-800 bg-slate-900 shadow-xl">{children}</div>;
}

function isValidCameraLocation(value: unknown): value is CameraLocation {
  if (!value || typeof value !== "object") return false;
  const camera = value as Partial<CameraLocation>;
  return typeof camera.id === "string" &&
    typeof camera.branchId === "string" &&
    typeof camera.name === "string" &&
    typeof camera.branchName === "string" &&
    typeof camera.latitude === "number" && Number.isFinite(camera.latitude) && Math.abs(camera.latitude) <= 90 &&
    typeof camera.longitude === "number" && Number.isFinite(camera.longitude) && Math.abs(camera.longitude) <= 180 &&
    (camera.status === "online" || camera.status === "offline" || camera.status === "degraded" || camera.status === "unknown");
}
