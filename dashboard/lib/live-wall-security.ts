export type SecurityHeatmapSeverity = "low" | "medium" | "high" | "critical";

export interface LiveWallSecurityCamera {
  id: string;
  branchId: string;
  branchName?: string;
  name: string;
  status: string;
}

export interface LiveWallSecurityAlertLike {
  id: string;
  cameraId: string;
  severity: "P1" | "P2" | "P3" | "P4" | "P5" | string;
  status?: string;
  confidence?: number;
  createdAt?: string;
}

export interface SecurityHeatmapEntry {
  branchId: string;
  branchName: string;
  cameraIds: string[];
  risk: number;
  severity: SecurityHeatmapSeverity;
  activeAlerts: number;
  coverage: number;
}

export interface ReplayWindow {
  cameraId: string;
  from: number;
  to: number;
  windowSeconds: number;
  anchorAlertId?: string;
}

export interface WallPreset {
  id: string;
  name: string;
  branchId: string;
  cameraIds: string[];
  view: "security-overview" | "incident-focus" | "perimeter" | "vault" | "custom";
  createdAt: string;
}

export interface PrivacyExportRequest {
  format: "MP4" | "ZIP" | "CSV";
  reason: string;
  redaction: {
    complianceStandard: "GDPR" | "DPDP" | "HIPAA" | "CUSTOM";
    faceBlur: boolean;
    plateBlur: boolean;
    applyStaticZones: boolean;
    blurStrength: number;
    mode: "blur" | "pixelate" | "solid";
    audioAction: "PASS_THROUGH" | "MUTE" | "REMOVE_TRACK";
    watermarkText?: string;
  };
}

const severityWeight: Record<string, number> = {
  P1: 1,
  P2: 0.78,
  P3: 0.52,
  P4: 0.32,
  P5: 0.18,
  critical: 1,
  high: 0.78,
  medium: 0.52,
  low: 0.2,
};

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function toBranchName(camera: LiveWallSecurityCamera) {
  return camera.branchName || camera.branchId || "Unassigned branch";
}

export function buildSecurityHeatmap(
  cameras: LiveWallSecurityCamera[],
  alerts: LiveWallSecurityAlertLike[],
  correlations: Array<{ branchId?: string; cameraIds?: string[]; severity?: string }> = [],
): SecurityHeatmapEntry[] {
  const branchMap = new Map<string, { branchId: string; branchName: string; cameraIds: Set<string>; alerts: number; risk: number }>();

  for (const camera of cameras) {
    const key = camera.branchId || "unassigned";
    const current = branchMap.get(key) ?? {
      branchId: key,
      branchName: toBranchName(camera),
      cameraIds: new Set<string>(),
      alerts: 0,
      risk: 0,
    };
    current.cameraIds.add(camera.id);
    if (!current.branchName || current.branchName === "Unassigned branch") {
      current.branchName = toBranchName(camera);
    }
    branchMap.set(key, current);
  }

  for (const alert of alerts) {
    const camera = cameras.find((entry) => entry.id === alert.cameraId);
    const branchId = camera?.branchId || alert.cameraId || "unassigned";
    const current = branchMap.get(branchId) ?? {
      branchId,
      branchName: camera?.branchName || "Unassigned branch",
      cameraIds: new Set<string>(),
      alerts: 0,
      risk: 0,
    };
    const severityBoost = severityWeight[String(alert.severity).toUpperCase()] ?? 0.35;
    const confidenceBoost = Number(alert.confidence ?? 0.5) * 0.5;
    current.alerts += 1;
    current.risk += severityBoost + confidenceBoost;
    branchMap.set(branchId, current);
  }

  for (const correlation of correlations) {
    const branchId = correlation.branchId || "unassigned";
    const current = branchMap.get(branchId) ?? {
      branchId,
      branchName: "Unassigned branch",
      cameraIds: new Set<string>(),
      alerts: 0,
      risk: 0,
    };
    const severityBoost = severityWeight[String(correlation.severity ?? "P3").toUpperCase()] ?? 0.4;
    current.risk += severityBoost * 0.8;
    for (const cameraId of correlation.cameraIds ?? []) {
      current.cameraIds.add(cameraId);
    }
    branchMap.set(branchId, current);
  }

  return [...branchMap.values()]
    .map((entry) => {
      const coverage = clamp((entry.cameraIds.size / Math.max(1, cameras.length || entry.cameraIds.size)) * 100, 0, 100);
      const risk = clamp((entry.risk / Math.max(1, entry.alerts + 1)) * 100, 0, 100);
      const severity: SecurityHeatmapSeverity = risk >= 80 ? "critical" : risk >= 60 ? "high" : risk >= 35 ? "medium" : "low";
      return {
        branchId: entry.branchId,
        branchName: entry.branchName,
        cameraIds: [...entry.cameraIds],
        risk: Number(risk.toFixed(2)),
        severity,
        activeAlerts: entry.alerts,
        coverage: Number(coverage.toFixed(1)),
      };
    })
    .sort((a, b) => b.risk - a.risk || b.activeAlerts - a.activeAlerts);
}

export function buildReplayWindow(
  alerts: LiveWallSecurityAlertLike[],
  cameraId: string,
  windowSeconds = 300,
): ReplayWindow {
  const relevant = alerts.filter((alert) => !cameraId || alert.cameraId === cameraId);
  const anchor = [...relevant].sort(
    (first, second) => new Date(second.createdAt ?? 0).getTime() - new Date(first.createdAt ?? 0).getTime(),
  )[0] ?? { cameraId, id: "anchor", createdAt: new Date().toISOString() };

  const anchorTime = new Date(anchor.createdAt ?? new Date().toISOString()).getTime();
  const halfWindow = Math.max(30, windowSeconds / 2);
  const from = anchorTime - halfWindow * 1000;
  const to = anchorTime + halfWindow * 1000;

  return {
    cameraId: anchor.cameraId || cameraId,
    anchorAlertId: anchor.id,
    from,
    to,
    windowSeconds,
  };
}

export function createWallPreset(input: {
  name?: string;
  branchId?: string;
  cameraIds: string[];
  view?: WallPreset["view"];
}): WallPreset {
  const branchLabel = input.branchId && input.branchId !== "all" ? input.branchId.replace(/[-_]+/g, " ") : "Branch";
  const displayName = input.name
    ? input.name.trim()
    : `${branchLabel.charAt(0).toUpperCase()}${branchLabel.slice(1)} security overview`;

  return {
    id: `preset-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    name: displayName.replace(/\s+/g, " ").replace(/\b\w/g, (char) => char.toUpperCase()),
    branchId: input.branchId ?? "all",
    cameraIds: [...new Set(input.cameraIds)],
    view: input.view ?? "security-overview",
    createdAt: new Date().toISOString(),
  };
}

export function buildPrivacyExportRequest(input: {
  reason?: string;
  branchId?: string;
  cameraId?: string;
} = {}): PrivacyExportRequest {
  return {
    format: "MP4",
    reason: input.reason ?? `Security investigation export for ${input.cameraId ?? input.branchId ?? "live wall"}`,
    redaction: {
      complianceStandard: "DPDP",
      faceBlur: true,
      plateBlur: true,
      applyStaticZones: true,
      blurStrength: 0.75,
      mode: "blur",
      audioAction: "MUTE",
      watermarkText: "Security evidence – privacy protected",
    },
  };
}
