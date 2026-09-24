import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";

export const dynamic = "force-dynamic";

let pgPool: Pool | null = null;
function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pgPool;
}

// In-memory failover override tracking (persists during runtime across requests)
const runtimeFailoverOverrides = new Map<string, "sd_card" | "dvr_hdd" | "online_cloud">();

export interface CameraStorageMapping {
  cameraId: string;
  branchId?: string;
  cameraName: string;
  ipAddress: string;
  activeStorageTier: "sd_card" | "dvr_hdd" | "online_cloud";
  sdCardStatus: "detected" | "not_present" | "unformatted";
  dvrStatus: "mapped" | "unmapped" | "offline";
  cloudStatus: "active" | "standby";
  storageDetails: string;
  capacity: string;
  used: string;
  retentionDays: number;
}

export interface StorageOverviewResponse {
  success: boolean;
  cameras: CameraStorageMapping[];
  summary: {
    totalCameras: number;
    tier1SdCardCount: number;
    tier2DvrHddCount: number;
    tier3OnlineCloudCount: number;
    sdCardNode: {
      name: string;
      capacity: string;
      used: string;
      status: string;
    };
    dvrHddNode: {
      name: string;
      capacity: string;
      used: string;
      status: string;
    };
    cloudNode: {
      name: string;
      capacity: string;
      used: string;
      status: string;
    };
  };
  storageNodes: any[];
  scannedAt: string;
}

function formatBytes(bytes: number | string): string {
  const num = Number(bytes);
  if (isNaN(num) || num <= 0) return "Unavailable";
  if (num >= 1e12) return `${(num / 1e12).toFixed(1)} TB`;
  if (num >= 1e9) return `${(num / 1e9).toFixed(1)} GB`;
  if (num >= 1e6) return `${(num / 1e6).toFixed(1)} MB`;
  return `${num} B`;
}

type DiskTelemetry = {
  id?: string;
  deviceId?: string;
  devicePath?: string;
  model?: string;
  operationalStatus?: string;
  smartStatus?: string;
  capacityBytes?: number;
  usedBytes?: number;
  availableBytes?: number;
  usagePercent?: number;
};

function diskId(disk: DiskTelemetry) {
  return String(disk.id ?? disk.deviceId ?? "");
}

function isCameraSdCard(disk: DiskTelemetry) {
  const identity = `${diskId(disk)} ${disk.devicePath ?? ""} ${disk.model ?? ""}`.toLowerCase();
  return /(?:sdcard|sd-card|micro\s*sd|\bsd\b)/.test(identity);
}

function diskStatus(disk: DiskTelemetry | undefined) {
  const status = String(disk?.operationalStatus ?? "unknown").toLowerCase();
  return ["healthy", "warning", "critical", "offline"].includes(status) ? status : "unknown";
}

function aggregateDisks(disks: DiskTelemetry[], name: string) {
  const capacityBytes = disks.reduce((total, disk) => total + Math.max(0, Number(disk.capacityBytes) || 0), 0);
  const usedBytes = disks.reduce((total, disk) => total + Math.max(0, Number(disk.usedBytes) || 0), 0);
  const availableBytes = disks.reduce((total, disk) => total + Math.max(0, Number(disk.availableBytes) || 0), 0);
  const statuses = disks.map((disk) => diskStatus(disk));
  const status = statuses.includes("critical") ? "critical"
    : statuses.includes("offline") ? "offline"
      : statuses.includes("warning") ? "warning"
        : statuses.includes("healthy") ? "healthy" : "unknown";
  return { name, capacity_bytes: capacityBytes, used_bytes: usedBytes, available_bytes: availableBytes, status };
}

function controlPlaneHeaders(request: NextRequest): Record<string, string> {
  const incomingAuthorization = request.headers.get("authorization");
  const bearerSession = incomingAuthorization?.toLowerCase().startsWith("bearer ")
    ? incomingAuthorization.slice(7).trim()
    : undefined;
  const session = request.cookies.get("sentinel_access")?.value
    ?? request.headers.get("x-sentinel-session")
    ?? bearerSession;
  return session ? { authorization: `Bearer ${session}` } : {};
}

export async function GET(request: NextRequest) {
  const pool = getPool();
  let rawCameras: any[] = [];
  let rawStorageNodes: any[] = [];
  let rawDisks: DiskTelemetry[] = [];

  if (pool) {
    try {
      const [camerasRes, nodesRes] = await Promise.all([
        pool.query(`
          SELECT 
            c.id, 
            c.branch_id,
            COALESCE(rn.name, c.vendor || ' ' || c.model, 'Camera ' || c.id) as name, 
            host(c.ip_address) as ip_address, 
            c.status, 
            c.vendor, 
            c.model, 
            c.recorder_id, 
            c.recorder_channel, 
            c.connection_secret_ref,
            c.capabilities, 
            c.source_type 
          FROM cameras c 
          LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id 
          ORDER BY c.created_at ASC
        `),
        pool.query(`
          SELECT 
            id, 
            external_id, 
            name, 
            status, 
            storage_type, 
            capacity_bytes, 
            used_bytes, 
            available_bytes, 
            health_state, 
            tier_primary,
            last_seen_at
          FROM recording_storage_nodes 
          ORDER BY last_seen_at DESC
        `),
      ]);
      rawCameras = camerasRes.rows;
      rawStorageNodes = nodesRes.rows;
    } catch (err) {
      console.warn("Direct DB query in /api/operations/storage failed, trying control plane HTTP:", err);
    }
  }

  // The operational-health endpoint is the source of truth for recorder HDD
  // and camera SD-card observations.  Storage nodes alone are not sufficient:
  // recorders submit per-disk telemetry through the edge agent.
  try {
    const upstreamBase = process.env.CONTROL_PLANE_INTERNAL_URL || process.env.CONTROL_PLANE_URL || "http://control-plane:8080";
    const headers = controlPlaneHeaders(request);
    const diskRes = await fetch(`${upstreamBase}/v1/operations/health/disks`, { headers, cache: "no-store" }).catch(() => null);
    if (diskRes?.ok) {
      const diskData = await diskRes.json();
      rawDisks = Array.isArray(diskData) ? diskData : (Array.isArray(diskData?.data) ? diskData.data : []);
    }
  } catch (err) {
    console.warn("Operational storage telemetry fetch failed:", err);
  }

  // If DB query was unavailable or returned empty, query upstream control plane.
  if (rawCameras.length === 0 || rawStorageNodes.length === 0) {
    try {
      const upstreamBase = process.env.CONTROL_PLANE_INTERNAL_URL || process.env.CONTROL_PLANE_URL || "http://control-plane:8080";
      const headers = controlPlaneHeaders(request);

      const [camRes, nodeRes] = await Promise.all([
        fetch(`${upstreamBase}/v1/cameras?limit=500`, { headers, cache: "no-store" }).catch(() => null),
        fetch(`${upstreamBase}/api/v1/storage/nodes`, { headers, cache: "no-store" }).catch(() => null),
      ]);

      if (rawCameras.length === 0 && camRes && camRes.ok) {
        const camData = await camRes.json();
        rawCameras = Array.isArray(camData) ? camData : (camData.data || []);
      }
      if (rawStorageNodes.length === 0 && nodeRes && nodeRes.ok) {
        const nodeData = await nodeRes.json();
        rawStorageNodes = Array.isArray(nodeData) ? nodeData : (nodeData.data || []);
      }
    } catch (err) {
      console.error("Control plane fetch failed in /api/operations/storage:", err);
    }
  }

  const sdCardDisks = rawDisks.filter(isCameraSdCard);
  const recorderDisks = rawDisks.filter((disk) => !isCameraSdCard(disk));
  const measuredSdCards = sdCardDisks.filter((disk) => Number(disk.capacityBytes) > 0);
  const measuredRecorderDisks = recorderDisks.filter((disk) => Number(disk.capacityBytes) > 0);
  const dvrNode = measuredRecorderDisks.length
    ? aggregateDisks(measuredRecorderDisks, "Recorder HDD telemetry")
    : rawStorageNodes.find((node) => node.external_id === "dvr-hdd-primary" || node.name?.toLowerCase().includes("hdd"))
      ?? aggregateDisks([], "Recorder HDD telemetry");
  const sdCardNode = measuredSdCards.length
    ? aggregateDisks(measuredSdCards, "Camera SD-card telemetry")
    : rawStorageNodes.find((node) => node.external_id === "cam-sdcard-primary" || /micro\s*sd|sd.?card/i.test(node.name ?? ""))
      ?? aggregateDisks([], "Camera SD-card telemetry");
  const cloudNode = rawStorageNodes.find((node) => node.external_id === "cloud-node-primary" || node.name?.toLowerCase().includes("cloud"))
    ?? { name: "Cloud recording telemetry unavailable", capacity_bytes: 0, used_bytes: 0, available_bytes: 0, status: "unknown" };

  // Map each real camera to its active storage tier
  const cameras: CameraStorageMapping[] = rawCameras.map((cam, idx) => {
    const camId = cam.id || `cam-${idx + 1}`;
    const name = cam.name || cam.model || `Camera ${idx + 1}`;
    const ip = cam.ip_address || "192.168.29.58";
    const override = runtimeFailoverOverrides.get(camId);

    const discoveryId = String(cam.connection_secret_ref ?? cam.connectionSecretRef ?? "").split("/").pop();
    const cameraSdCard = sdCardDisks.find((disk) => {
      const id = diskId(disk);
      return id === `${camId}:sdcard` || id === `camera:${camId}:sdcard`
        || id.includes(`:${camId}:sdcard`)
        || Boolean(discoveryId && id.startsWith(`camera:${discoveryId}:sdcard:`));
    });
    const recorderDisk = cam.recorder_id
      ? recorderDisks.find((disk) => diskId(disk).startsWith(`${cam.recorder_id}:disk:`))
      : undefined;
    const hasVerifiedSdCard = Boolean(cameraSdCard && Number(cameraSdCard.capacityBytes) > 0);
    const hasVerifiedRecorderStorage = Boolean(recorderDisk && Number(recorderDisk.capacityBytes) > 0);

    let activeTier: "sd_card" | "dvr_hdd" | "online_cloud" = "online_cloud";
    let sdCardStatus: "detected" | "not_present" | "unformatted" = "not_present";
    let dvrStatus: "mapped" | "unmapped" | "offline" = "unmapped";
    let cloudStatus: "active" | "standby" = "standby";
    let storageDetails = "";
    let capacity = "";
    let used = "";
    let retentionDays = 30;

    if (override) {
      activeTier = override;
    } else if (hasVerifiedSdCard) {
      activeTier = "sd_card";
      sdCardStatus = "detected";
    } else if (hasVerifiedRecorderStorage) {
      activeTier = "dvr_hdd";
      sdCardStatus = "not_present";
      dvrStatus = "mapped";
    } else {
      // Tier 3: Online Cloud Fallback
      activeTier = "online_cloud";
      sdCardStatus = "not_present";
      dvrStatus = "unmapped";
    }

    if (activeTier === "sd_card") {
      sdCardStatus = "detected";
      cloudStatus = "standby";
      storageDetails = cameraSdCard?.model || cameraSdCard?.devicePath || sdCardNode.name;
      capacity = formatBytes(cameraSdCard?.capacityBytes ?? sdCardNode.capacity_bytes);
      const sdCapacity = Number(cameraSdCard?.capacityBytes ?? sdCardNode.capacity_bytes);
      const sdUsed = Number(cameraSdCard?.usedBytes ?? sdCardNode.used_bytes);
      used = sdCapacity > 0 ? `${formatBytes(sdUsed)} (${((sdUsed / sdCapacity) * 100).toFixed(0)}%)` : "Usage unavailable";
      retentionDays = 0;
    } else if (activeTier === "dvr_hdd") {
      dvrStatus = "mapped";
      cloudStatus = "standby";
      storageDetails = `${recorderDisk?.model || recorderDisk?.devicePath || dvrNode.name} (Channel ${cam.recorder_channel || idx + 1})`;
      capacity = formatBytes(recorderDisk?.capacityBytes ?? dvrNode.capacity_bytes);
      const diskCapacity = Number(recorderDisk?.capacityBytes ?? dvrNode.capacity_bytes);
      const diskUsed = Number(recorderDisk?.usedBytes ?? dvrNode.used_bytes);
      used = diskCapacity > 0 ? `${formatBytes(diskUsed)} (${((diskUsed / diskCapacity) * 100).toFixed(0)}%)` : "Usage unavailable";
      retentionDays = 0;
    } else {
      cloudStatus = cloudNode.status === "healthy" ? "active" : "standby";
      storageDetails = recorderDisk
        ? "Recorder storage telemetry is unavailable; no capacity was reported."
        : "No verified camera SD-card or recorder-HDD telemetry has been received yet.";
      capacity = cloudNode.capacity_bytes > 0 ? `${formatBytes(cloudNode.capacity_bytes)} Cloud Pool` : "Unavailable";
      const cloudCapacity = Number(cloudNode.capacity_bytes);
      const cloudUsed = Number(cloudNode.used_bytes);
      used = cloudCapacity > 0 ? `${formatBytes(cloudUsed)} (${((cloudUsed / cloudCapacity) * 100).toFixed(1)}%)` : "Waiting for storage telemetry";
      retentionDays = 0;
    }

    return {
      cameraId: camId,
      branchId: cam.branch_id || "",
      cameraName: name,
      ipAddress: ip,
      activeStorageTier: activeTier,
      sdCardStatus,
      dvrStatus,
      cloudStatus,
      storageDetails,
      capacity,
      used,
      retentionDays,
    };
  });

  // A recorder or camera card can be discovered before any camera is approved.
  // Count measured storage devices independently of camera-to-storage mappings.
  const tier1Count = measuredSdCards.length;
  const tier2Count = measuredRecorderDisks.length;
  const tier3Count = cameras.filter((c) => c.activeStorageTier === "online_cloud" && c.cloudStatus === "active").length;

  // Filter active storage nodes: local disks are unmounted if no corresponding device exists
  const activeStorageNodes = rawStorageNodes.filter((node) => {
    if (cameras.length === 0) {
      // When all cameras/devices are removed, local disks are completely unmounted
      return node.storage_type !== "local-disk" || node.external_id?.includes("cloud");
    }
    if (node.external_id === "cam-sdcard-primary" && tier1Count === 0) return false;
    if (node.external_id === "dvr-hdd-primary" && tier2Count === 0) return false;
    return true;
  });

  const response: StorageOverviewResponse = {
    success: true,
    cameras,
    summary: {
      totalCameras: cameras.length,
      tier1SdCardCount: tier1Count,
      tier2DvrHddCount: tier2Count,
      tier3OnlineCloudCount: tier3Count,
      sdCardNode: {
        name: sdCardNode.name,
        capacity: formatBytes(sdCardNode.capacity_bytes),
        used: formatBytes(sdCardNode.used_bytes),
        status: tier1Count > 0 ? (sdCardNode.status || "unknown") : "not_present",
      },
      dvrHddNode: {
        name: dvrNode.name,
        capacity: formatBytes(dvrNode.capacity_bytes),
        used: formatBytes(dvrNode.used_bytes),
        status: tier2Count > 0 ? (dvrNode.status || "unknown") : "not_present",
      },
      cloudNode: {
        name: cloudNode.name,
        capacity: formatBytes(cloudNode.capacity_bytes),
        used: formatBytes(cloudNode.used_bytes),
        status: cloudNode.status || "unknown",
      },
    },
    storageNodes: activeStorageNodes,
    scannedAt: new Date().toISOString(),
  };

  return NextResponse.json(response);
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { cameraId, targetTier, reason } = body;

    if (!cameraId || !targetTier) {
      return NextResponse.json(
        { success: false, error: "cameraId and targetTier are required" },
        { status: 400 }
      );
    }

    if (!["sd_card", "dvr_hdd", "online_cloud"].includes(targetTier)) {
      return NextResponse.json(
        { success: false, error: "Invalid targetTier" },
        { status: 400 }
      );
    }

    // Update in-memory failover map
    runtimeFailoverOverrides.set(cameraId, targetTier);

    // If PostgreSQL is available, record storage failover audit entry
    const pool = getPool();
    if (pool) {
      try {
        await pool.query(`
          INSERT INTO storage_failover_events (
            id, camera_id, previous_target, new_target, reason, initiated_by, created_at
          ) VALUES (
            gen_random_uuid(), $1, 'local-disk', $2, $3, 'operator', now()
          )
        `, [cameraId, targetTier, reason || "Operator manual cloud failover switch"]).catch(() => null);
      } catch (err) {
        // Table might have custom schema; in-memory state is guaranteed
      }
    }

    return NextResponse.json({
      success: true,
      cameraId,
      activeStorageTier: targetTier,
      message: `Camera ${cameraId} storage switched to ${targetTier}`,
      timestamp: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { success: false, error: err.message || "Failed to switch storage tier" },
      { status: 500 }
    );
  }
}
