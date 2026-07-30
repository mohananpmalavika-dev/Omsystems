#!/usr/bin/env node
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

export type AlertStressConfig = {
  baseUrl: string;
  userId: string;
  engineKey: string;
  tenantId: string;
  cameraId: string;
  cameraIds?: string[];
  expectedBranches?: number;
  events: number;
  concurrency: number;
  outputDirectory: string;
  configureRule: boolean;
  maxNotificationLatencyMs?: number;
};

export type AlertStressEvidence = {
  startedAt: string;
  completedAt: string;
  events: number;
  targetBranches: number;
  observedBranches: number;
  accepted: number;
  failed: number;
  visible: number;
  ingestP95Ms: number;
  visibilityP95Ms: number;
  notificationSetsProcessed: number;
  notificationAttempts: number;
  notificationP95Ms: number;
  maxNotificationLatencyMs: number;
  passed: boolean;
};

export async function runAlertStress(config: AlertStressConfig): Promise<AlertStressEvidence> {
  const startedAt = new Date().toISOString();
  const cameraIds = [...new Set((config.cameraIds?.length ? config.cameraIds : [config.cameraId])
    .map((item) => item.trim()).filter(Boolean))];
  const targetBranches = config.expectedBranches ?? cameraIds.length;
  const maxNotificationLatencyMs = config.maxNotificationLatencyMs ?? 10_000;
  if (cameraIds.length === 0) throw new Error("At least one alert stress camera is required");
  if (cameraIds.length < targetBranches) {
    throw new Error(`Alert stress requires at least ${targetBranches} branch camera IDs; received ${cameraIds.length}`);
  }

  if (config.configureRule) {
    await forEachConcurrent(cameraIds, Math.min(config.concurrency, 25), async (cameraId) => {
      await request(config, `/v1/cameras/${encodeURIComponent(cameraId)}/analytics/rules`, {
        method: "POST", headers: { "x-user-id": config.userId },
        body: JSON.stringify({
          name: `Phase 6 stress ${Date.now()}`, detectionType: "person", enabled: true,
          objectClasses: ["person"], minConfidence: .5, minDurationSeconds: 0,
          severity: "P1", cooldownSeconds: 0, recipients: [], recordingPolicy: "none",
          preRollSeconds: 0, postRollSeconds: 30,
        }),
      });
    });
  }

  const queue = Array.from({ length: config.events }, (_, index) => index);
  const ingest: number[] = [];
  const visibility: number[] = [];
  const notificationLatency: number[] = [];
  const observedBranchIds = new Set<string>();
  let accepted = 0;
  let failed = 0;
  let visible = 0;
  let notificationSetsProcessed = 0;
  let notificationAttempts = 0;

  await Promise.all(Array.from({ length: Math.max(1, config.concurrency) }, async () => {
    for (;;) {
      const index = queue.shift();
      if (index === undefined) return;
      const cameraId = cameraIds[index % cameraIds.length]!;
      const sourceEventId = `phase6-${Date.now()}-${index}`;
      const started = performance.now();
      try {
        const result = await request(config, "/internal/analytics/events", {
          method: "POST", headers: { "x-analytics-engine-key": config.engineKey },
          body: JSON.stringify({
            tenantId: config.tenantId, cameraId, sourceEventId, detectionType: "person",
            occurredAt: new Date().toISOString(), confidence: .95, durationSeconds: 2,
            modelVersion: "phase6-stress", objects: [{ label: "person", confidence: .95 }],
            metadata: { phase: 6, index },
          }),
        });
        ingest.push(performance.now() - started);
        accepted += 1;
        const alertId = result.alerts?.[0]?.id;
        if (!alertId) continue;

        const visibleStarted = performance.now();
        for (let attempt = 0; attempt < 100; attempt++) {
          const command = await request(config, "/v1/alerts/command-center?severity=P1&limit=200", {
            headers: { "x-user-id": config.userId },
          });
          const alert = command.data?.find((item: any) => item.id === alertId);
          if (alert) {
            visible += 1;
            if (alert.branchId) observedBranchIds.add(String(alert.branchId));
            visibility.push(performance.now() - visibleStarted);
            break;
          }
          await delay(100);
        }

        const notificationStarted = performance.now();
        for (let attempt = 0; attempt < 100; attempt++) {
          const deliveries = await request(config, `/v1/alerts/${encodeURIComponent(alertId)}/notifications`, {
            headers: { "x-user-id": config.userId },
          });
          const items = Array.isArray(deliveries.data) ? deliveries.data : [];
          if (items.length > 0 && items.every((item: any) => Number(item.attempts) > 0)) {
            notificationSetsProcessed += 1;
            notificationAttempts += items.reduce((total: number, item: any) => total + Number(item.attempts ?? 0), 0);
            notificationLatency.push(performance.now() - notificationStarted);
            break;
          }
          await delay(100);
        }
      } catch {
        failed += 1;
      }
    }
  }));

  const notificationP95Ms = percentile(notificationLatency, .95);
  const evidence = {
    startedAt, completedAt: new Date().toISOString(), events: config.events,
    targetBranches, observedBranches: observedBranchIds.size,
    accepted, failed, visible,
    ingestP95Ms: percentile(ingest, .95), visibilityP95Ms: percentile(visibility, .95),
    notificationSetsProcessed, notificationAttempts, notificationP95Ms, maxNotificationLatencyMs,
    passed: failed === 0 && accepted === config.events && visible === accepted &&
      notificationSetsProcessed === accepted && observedBranchIds.size >= targetBranches &&
      percentile(visibility, .95) < 5_000 && notificationP95Ms < maxNotificationLatencyMs,
  } satisfies AlertStressEvidence;
  await mkdir(resolve(config.outputDirectory), { recursive: true });
  await writeFile(resolve(config.outputDirectory, `phase6-alert-stress-${Date.now()}.json`),
    JSON.stringify(evidence, null, 2), "utf8");
  return evidence;
}

async function request(config: AlertStressConfig, path: string, init: RequestInit = {}) {
  const response = await fetch(new URL(path, config.baseUrl), {
    ...init, headers: { "content-type": "application/json", ...init.headers },
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`${path}:${response.status}:${body.slice(0, 300)}`);
  return body ? JSON.parse(body) : undefined;
}

async function forEachConcurrent<T>(items: T[], concurrency: number, task: (item: T) => Promise<void>) {
  const queue = [...items];
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, async () => {
    for (;;) {
      const item = queue.shift();
      if (item === undefined) return;
      await task(item);
    }
  }));
}

function percentile(values: number[], q: number) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.length ? Math.round(sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * q) - 1)]! * 100) / 100 : 0;
}
function delay(ms: number) { return new Promise((resolvePromise) => setTimeout(resolvePromise, ms)); }

export function alertConfig(environment = process.env): AlertStressConfig {
  const cameraIds = environment.PHASE6_CAMERA_IDS?.split(",").map((item) => item.trim()).filter(Boolean);
  const cameraId = cameraIds?.[0] ?? required(environment.PHASE6_CAMERA_ID, "PHASE6_CAMERA_ID or PHASE6_CAMERA_IDS");
  return {
    baseUrl: environment.PHASE6_BASE_URL ?? "http://127.0.0.1:8080",
    userId: environment.PHASE6_USER_ID ?? "user-global-admin",
    engineKey: required(environment.ANALYTICS_ENGINE_SHARED_KEY, "ANALYTICS_ENGINE_SHARED_KEY"),
    tenantId: environment.PHASE6_TENANT_ID ?? "omsystems", cameraId,
    ...(cameraIds?.length ? { cameraIds } : {}),
    expectedBranches: Number(environment.PHASE6_EXPECTED_BRANCHES ?? cameraIds?.length ?? 1),
    events: Number(environment.PHASE6_ALERT_EVENTS ?? 1_000),
    concurrency: Number(environment.PHASE6_ALERT_CONCURRENCY ?? 50),
    outputDirectory: environment.PHASE6_OUTPUT_DIR ?? "./load-testing/reports",
    configureRule: environment.PHASE6_CONFIGURE_RULE !== "false",
    maxNotificationLatencyMs: Number(environment.PHASE6_NOTIFICATION_P95_MS ?? 10_000),
  };
}
function required(value: string | undefined, name: string) {
  if (!value) throw new Error(`${name} is required`);
  return value;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  runAlertStress(alertConfig()).then((result) => {
    console.log(JSON.stringify(result, null, 2));
    if (!result.passed) process.exitCode = 2;
  }).catch((error) => { console.error(error); process.exitCode = 1; });
}
