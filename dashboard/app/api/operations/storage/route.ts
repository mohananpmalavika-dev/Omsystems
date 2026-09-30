import { NextRequest, NextResponse } from "next/server";
import { buildControlPlaneHeaders } from "@/lib/server/control-plane-auth";

export const dynamic = "force-dynamic";

type Disk = Record<string, unknown>;
type StorageNode = Record<string, unknown>;
const FRESH_FOR_MS = 24 * 60 * 60 * 1000;

function rows(value: unknown): Disk[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object") {
    const result = value as { data?: unknown; nodes?: unknown };
    if (Array.isArray(result.data)) return result.data;
    if (Array.isArray(result.nodes)) return result.nodes;
  }
  return [];
}

function string(value: unknown): string {
  return typeof value === "string" ? value : "";
}

function bytes(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : 0;
}

function formatBytes(value: unknown): string {
  const number = bytes(value);
  if (!number) return "Unavailable";
  if (number >= 1e12) return `${(number / 1e12).toFixed(1)} TB`;
  if (number >= 1e9) return `${(number / 1e9).toFixed(1)} GB`;
  if (number >= 1e6) return `${(number / 1e6).toFixed(1)} MB`;
  return `${number} B`;
}

function observedAt(item: Disk): number {
  const value = item.observedAt ?? item.lastCheck ?? item.last_seen_at ?? item.lastSeenAt;
  return value ? Date.parse(String(value)) || 0 : 0;
}

function recent(item: Disk): boolean {
  const at = observedAt(item);
  return at > 0 && Date.now() - at <= FRESH_FOR_MS && at <= Date.now() + 60_000;
}

function diskId(disk: Disk): string {
  return string(disk.deviceId ?? disk.id);
}

function isSdCard(disk: Disk): boolean {
  const identity = [diskId(disk), disk.devicePath, disk.name, disk.model, disk.mediaType]
    .map(string).join(" ").toLowerCase();
  return /(?:sdcard|sd-card|micro\s*sd|\bsd\b)/.test(identity);
}

function healthy(disk: Disk): boolean {
  const status = string(disk.operationalStatus ?? disk.healthStatus ?? disk.smartStatus).toLowerCase();
  const smart = string(disk.smartStatus).toLowerCase();
  return recent(disk) && bytes(disk.capacityBytes ?? disk.totalBytes) > 0
    && ["healthy", "ok", "online"].includes(status)
    && !["failed", "critical", "warning", "degraded", "missing"].includes(smart)
    && disk.isReadOnly !== true && disk.readOnly !== true;
}

function uniqueDisks(items: Disk[]): Disk[] {
  const latest = new Map<string, Disk>();
  for (const disk of items) {
    const id = diskId(disk);
    if (!id) continue;
    const key = `${string(disk.branchId)}:${id}`;
    const previous = latest.get(key);
    if (!previous || observedAt(disk) > observedAt(previous)) latest.set(key, disk);
  }
  return [...latest.values()];
}

function nodeHealthy(node: StorageNode): boolean {
  const status = string(node.health_state ?? node.healthState ?? node.status).toLowerCase();
  // This endpoint probes providers on demand, so a node without a stored
  // timestamp is fresh for this response.
  return (observedAt(node) === 0 || recent(node)) && ["healthy", "online", "active"].includes(status)
    && node.is_read_only !== true && node.isReadOnly !== true;
}

function aggregate(disks: Disk[], name: string) {
  return {
    name,
    capacity: formatBytes(disks.reduce((sum, disk) => sum + bytes(disk.capacityBytes ?? disk.totalBytes), 0)),
    used: formatBytes(disks.reduce((sum, disk) => sum + bytes(disk.usedBytes), 0)),
    status: disks.some(healthy) ? "healthy" : disks.length ? "unavailable" : "not_present",
  };
}

function cameraId(camera: Disk): string {
  return string(camera.id ?? camera.cameraId);
}

function matchesSd(disk: Disk, camera: Disk): boolean {
  if (!isSdCard(disk)) return false;
  const id = diskId(disk);
  const camId = cameraId(camera);
  const discoveryId = string(camera.storageDiscoveryId);
  return id === `${camId}:sdcard` || id.startsWith(`camera:${camId}:sdcard`)
    || Boolean(discoveryId && id.startsWith(`camera:${discoveryId}:sdcard`));
}

function matchesRecorder(disk: Disk, camera: Disk): boolean {
  const recorderId = string(camera.recorder_id ?? camera.recorderId);
  return Boolean(recorderId) && !isSdCard(disk) && diskId(disk).startsWith(`${recorderId}:disk:`);
}

function isCloudNode(node: StorageNode): boolean {
  const identity = [node.storage_type, node.storageType, node.external_id, node.externalId, node.name]
    .map(string).join(" ").toLowerCase();
  return /(?:\bs3\b|object|cloud)/.test(identity);
}

export async function GET(request: NextRequest) {
  const authHeaders = buildControlPlaneHeaders(request);
  if (!authHeaders) {
    return NextResponse.json({ success: false, error: "Sign in to view storage" }, { status: 401 });
  }
  const configured = process.env.CONTROL_PLANE_INTERNAL_URL || process.env.CONTROL_PLANE_PUBLIC_URL || process.env.CONTROL_PLANE_URL
    || (process.env.NODE_ENV === "production" ? "http://control-plane:8080" : "http://localhost:8080");
  const upstream = (/^[a-z][a-z\d+.-]*:\/\//i.test(configured) ? configured : `http://${configured}`).replace(/\/$/, "");
  const options = { headers: authHeaders, cache: "no-store" as const };
  try {
    const [cameraResponse, diskResponse, nodeResponse] = await Promise.all([
      fetch(`${upstream}/v1/cameras?limit=500`, options),
      fetch(`${upstream}/v1/operations/health/disks`, options),
      fetch(`${upstream}/api/v1/storage/nodes`, options).catch(() => null),
    ]);
    if (!cameraResponse.ok || !diskResponse.ok) {
      const unauthorized = cameraResponse.status === 401 || diskResponse.status === 401;
      const forbidden = cameraResponse.status === 403 || diskResponse.status === 403;
      return NextResponse.json({
        success: false,
        error: unauthorized ? "Storage session expired. Sign in again."
          : forbidden ? "Your account cannot view storage inventory."
            : "Camera or disk inventory unavailable",
      }, { status: unauthorized ? 401 : forbidden ? 403 : 503 });
    }
    const firstPage = await cameraResponse.json();
    const cameraRows = rows(firstPage);
    const total = bytes(firstPage?.total);
    let offset = cameraRows.length;
    while (offset < total && offset < 10_000) {
      const page = await fetch(`${upstream}/v1/cameras?limit=500&offset=${offset}`, options);
      if (!page.ok) {
        return NextResponse.json({ success: false, error: "Camera inventory incomplete" }, { status: 503 });
      }
      const next = rows(await page.json());
      if (!next.length) break;
      cameraRows.push(...next);
      offset += next.length;
    }
    const cameras = [...new Map(cameraRows.filter((camera) => cameraId(camera))
      .map((camera) => [cameraId(camera), camera])).values()];
    const disks = uniqueDisks(rows(await diskResponse.json()));
    const nodes = nodeResponse?.ok ? rows(await nodeResponse.json()) : [];
    const cloud = nodes.find((node) => isCloudNode(node) && nodeHealthy(node));
    const sdCards = disks.filter(isSdCard);
    const recorderDisks = disks.filter((disk) => !isSdCard(disk));
    const mappings = cameras.map((camera) => {
      const sd = sdCards.find((disk) => matchesSd(disk, camera));
      const hdd = recorderDisks.find((disk) => matchesRecorder(disk, camera));
      const tier = sd && healthy(sd) ? "sd_card"
        : hdd && healthy(hdd) ? "dvr_hdd"
          : cloud ? "online_cloud" : "unavailable";
      const selected = tier === "sd_card" ? sd : tier === "dvr_hdd" ? hdd : undefined;
      const capacity = selected ? bytes(selected.capacityBytes ?? selected.totalBytes) : 0;
      const used = selected ? bytes(selected.usedBytes) : 0;
      return {
        cameraId: cameraId(camera),
        branchId: string(camera.branch_id ?? camera.branchId),
        cameraName: string(camera.name) || string(camera.model) || cameraId(camera),
        ipAddress: string(camera.ip_address ?? camera.ipAddress) || "Unavailable",
        // A candidate medium is not proof that the camera is recording to it.
        activeStorageTier: tier,
        recordingVerified: false,
        sdCardStatus: sd ? healthy(sd) ? "detected"
          : string(sd.slotStatus).toLowerCase() === "uninitialized" ? "unformatted" : "unavailable"
          : "not_present",
        dvrStatus: hdd ? healthy(hdd) ? "mapped"
          : string(hdd.operationalStatus).toLowerCase() === "offline" ? "offline" : "unavailable"
          : "unmapped",
        cloudStatus: cloud ? "standby" : "unavailable",
        storageDetails: selected ? string(selected.model ?? selected.name) || diskId(selected)
          : tier === "online_cloud" ? string(cloud?.name) || "Cloud storage available"
            : "No verified writable storage",
        capacity: selected ? formatBytes(capacity) : tier === "online_cloud" ? formatBytes(cloud?.capacity_bytes ?? cloud?.capacityBytes) : "Unavailable",
        used: selected && capacity ? `${formatBytes(used)} (${Math.round(used / capacity * 100)}%)`
          : tier === "online_cloud" ? formatBytes(cloud?.used_bytes ?? cloud?.usedBytes) : "Unavailable",
        retentionDays: null,
      };
    });
    return NextResponse.json({
      success: true,
      cameras: mappings,
      storageDevices: disks.map((disk) => recent(disk) ? disk : {
        ...disk,
        operationalStatus: "unknown",
        smartStatus: "unknown",
        telemetryStale: true,
      }),
      summary: {
        totalCameras: mappings.length,
        tier1SdCardCount: sdCards.filter(healthy).length,
        tier2DvrHddCount: recorderDisks.filter(healthy).length,
        tier3OnlineCloudCount: mappings.filter((camera) => camera.activeStorageTier === "online_cloud").length,
        sdCardNode: aggregate(sdCards, "Camera memory cards"),
        dvrHddNode: aggregate(recorderDisks, "Recorder hard disks"),
        cloudNode: {
          name: string(cloud?.name) || "Cloud storage",
          capacity: formatBytes(cloud?.capacity_bytes ?? cloud?.capacityBytes),
          used: formatBytes(cloud?.used_bytes ?? cloud?.usedBytes),
          status: cloud ? "healthy" : "unavailable",
        },
      },
      storageNodes: nodes,
      scannedAt: new Date().toISOString(),
    });
  } catch (error) {
    console.error("Storage inventory request failed:", error);
    return NextResponse.json({ success: false, error: "Storage inventory unavailable" }, { status: 503 });
  }
}

export async function POST() {
  // Storage hardware cannot be created or switched by inserting telemetry.
  return NextResponse.json({
    success: false,
    error: "Storage switching requires a verified recorder or recording-engine target. Configure the recording device and rescan.",
  }, { status: 409 });
}
