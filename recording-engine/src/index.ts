import { createHash, timingSafeEqual } from "node:crypto";
import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  readdir,
  rename,
  stat,
  statfs,
  unlink,
  writeFile,
} from "node:fs/promises";
import { hostname } from "node:os";
import { basename, dirname, isAbsolute, join, relative, resolve } from "node:path";
import { spawn, type ChildProcess } from "node:child_process";
import Fastify from "fastify";
import { z } from "zod";
import { createStorageAdapter, type StorageStatus, type StorageType } from "./storage-adapter.js";

const config = z.object({
  HOST: z.string().default("0.0.0.0"),
  PORT: z.coerce.number().int().min(1).max(65_535).default(8091),
  RECORDING_ROOT: z.string().default("./recordings"),
  RECORDING_ENGINE_SHARED_KEY: z.string().min(32),
  CONTROL_PLANE_URL: z.string().url(),
  STORAGE_NODE_EXTERNAL_ID: z.string().min(1).max(200).default(hostname()),
  STORAGE_NODE_NAME: z.string().min(1).max(200).default(`Recorder ${hostname()}`),
  STORAGE_NODE_TIERS: z.string().default("hot,warm,cold"),
  STORAGE_NODE_TYPE: z.enum(["local-disk", "nfs", "smb", "s3", "cloud-archive", "san"]).default("local-disk"),
  STORAGE_NODE_PROTOCOLS: z.string().default("fs"),
  STORAGE_NODE_LOCATION: z.string().trim().optional(),
  STREAM_SECRETS_JSON: z.string().default("{}"),
  RETENTION_SWEEP_SECONDS: z.coerce.number().int().min(60).max(86_400).default(300),
  RTSP_IO_TIMEOUT_MS: z.coerce.number().int().min(1_000).max(300_000).default(15_000),
  MIN_FREE_STORAGE_BYTES: z.coerce.number().int().min(0).default(1_073_741_824),
  EVIDENCE_CHECKSUM_ENABLED: z.string().default("true").transform((value) => value !== "false"),
}).parse(process.env);

const recordingRoot = resolve(config.RECORDING_ROOT);
const persistedJobsPath = join(recordingRoot, ".recording-jobs.json");
const pendingControlPlanePath = join(recordingRoot, ".pending-control-plane");
const secrets = z.record(z.string()).parse(JSON.parse(config.STREAM_SECRETS_JSON));
const scheduleWindowSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  days: z.array(z.number().int().min(0).max(6)).min(1),
  start: z.string().regex(/^\d{2}:\d{2}$/),
  end: z.string().regex(/^\d{2}:\d{2}$/),
  enabled: z.boolean().default(true),
});
const scheduleExceptionSchema = z.object({
  name: z.string().trim().min(1).max(120).optional(),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  start: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  end: z.string().regex(/^\d{2}:\d{2}$/).optional(),
  enabled: z.boolean().default(true),
  description: z.string().trim().min(1).max(1_000).optional(),
});
const scheduleSchema = z.object({
  timezone: z.string().trim().min(1).max(100).default("UTC"),
  windows: z.array(scheduleWindowSchema).min(1),
  exceptions: z.array(scheduleExceptionSchema).optional(),
});
const policySchema = z.object({
  id: z.string().min(1),
  mode: z.enum(["continuous", "motion", "scheduled", "event", "manual"]),
  enabled: z.boolean(),
  status: z.string(),
  retentionDays: z.number().int().min(1).max(3650),
  preRollSeconds: z.number().int().min(0).max(3600).default(30),
  postRollSeconds: z.number().int().min(0).max(3600).default(30),
  minMotionDurationSeconds: z.number().int().min(0).max(86_400).default(0),
  motionConfidenceThreshold: z.number().min(0).max(1).default(0),
  cooldownSeconds: z.number().int().min(0).max(86_400).default(60),
  maxEventDurationSeconds: z.number().int().min(0).max(86_400).default(0),
  segmentDurationSeconds: z.number().int().min(10).max(300).default(60),
  hotRetentionDays: z.number().int().min(0).max(3650).default(30),
  warmRetentionDays: z.number().int().min(0).max(3650).default(60),
  coldRetentionDays: z.number().int().min(0).max(3650).default(90),
  maxBitrateKbps: z.number().int().optional(),
  storageNodeExternalId: z.string().min(1).max(200).optional(),
  triggerEventTypes: z.array(z.string().trim().min(1).max(100)).optional(),
  critical: z.boolean().default(false),
  backupRequired: z.boolean().default(false),
  automaticDeletionEnabled: z.boolean().default(true),
  evidenceProtection: z.boolean().default(true),
  recordMainStream: z.boolean().default(true),
  schedule: scheduleSchema.optional(),
});
const jobSchema = z.object({
  tenantId: z.string().min(1),
  branchId: z.string().min(1),
  cameraId: z.string().min(1),
  connectionSecretRef: z.string().min(1),
  job: policySchema,
});
type ManagedJob = z.infer<typeof jobSchema>;
type Worker = {
  process: ChildProcess;
  job: ManagedJob;
  stdoutBuffer: string;
  stderr: string[];
  intentionallyStopping: boolean;
};

const workers = new Map<string, Worker>();
const jobs = new Map<string, ManagedJob>();
const postRollTimers = new Map<string, NodeJS.Timeout>();
const restartAttempts = new Map<string, number>();
const restartTimers = new Map<string, NodeJS.Timeout>();
const storageThresholds = new Map<string, "normal" | "80" | "90" | "95">();
const lastSegmentEnd = new Map<string, number>();
const app = Fastify({ logger: true });

await mkdir(recordingRoot, { recursive: true });
await mkdir(pendingControlPlanePath, { recursive: true });
await restoreJobs();

const storageAdapter = createStorageAdapter({
  recordingRoot,
  supportedTiers: parseTiers(config.STORAGE_NODE_TIERS),
  storageType: config.STORAGE_NODE_TYPE as StorageType,
  supportedProtocols: config.STORAGE_NODE_PROTOCOLS.split(",").map((item) => item.trim()).filter(Boolean),
  location: config.STORAGE_NODE_LOCATION,
});

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health") return;
  const value = request.headers["x-recording-engine-key"];
  if (typeof value !== "string" || !same(value, config.RECORDING_ENGINE_SHARED_KEY)) {
    return reply.code(401).send({ error: "invalid_engine_identity" });
  }
});

app.get("/health", async () => ({
  status: "ok",
  service: "sentinel-recording-engine",
  activeWorkers: workers.size,
  configuredJobs: jobs.size,
  storageNodeExternalId: config.STORAGE_NODE_EXTERNAL_ID,
}));

app.put("/internal/jobs", async (request, reply) => {
  const input = jobSchema.parse(request.body);
  jobs.set(input.cameraId, input);
  restartAttempts.set(input.cameraId, 0);
  await persistJobs();
  clearPostRoll(input.cameraId);
  await reconcile(input);
  return reply.code(202).send({
    cameraId: input.cameraId,
    active: workers.has(input.cameraId),
    mode: input.job.mode,
  });
});

app.post("/internal/jobs/:cameraId/trigger", async (request, reply) => {
  const { cameraId } = z.object({ cameraId: z.string().min(1) }).parse(request.params);
  const trigger = z.object({ type: z.enum(["motion", "event"]) }).parse(request.body);
  const job = jobs.get(cameraId);
  if (!job || !job.job.enabled || job.job.mode !== trigger.type) {
    return reply.code(409).send({ error: "recording_mode_not_triggerable" });
  }
  await start(job);
  clearPostRoll(cameraId);
  postRollTimers.set(cameraId, setTimeout(() => {
    stop(cameraId);
    void health(job, "recording_idle", "info",
      "Event-triggered recording completed its post-roll window");
  }, job.job.postRollSeconds * 1_000));
  return reply.code(202).send({ cameraId, active: true });
});

app.get("/internal/segments", async (request, reply) => {
  const { path: storagePath } = z.object({ path: z.string().min(1).max(2_000) })
    .parse(request.query);
  const requested = resolve(recordingRoot, storagePath);
  assertInsideRoot(requested);
  let details: Awaited<ReturnType<typeof stat>>;
  try {
    details = await stat(requested);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return reply.code(404).send({ error: "recording_segment_not_found" });
    }
    throw error;
  }
  if (!details.isFile()) return reply.code(404).send({ error: "recording_segment_not_found" });
  const range = request.headers.range;
  reply.header("accept-ranges", "bytes");
  reply.header("content-type", "video/mp4");
  reply.header("cache-control", "private, no-store");
  if (!range) {
    reply.header("content-length", String(details.size));
    return reply.send(createReadStream(requested));
  }
  const match = /^bytes=(\d*)-(\d*)$/.exec(range);
  if (!match) return reply.code(416).send();
  const start = match[1] ? Number(match[1]) : 0;
  const end = match[2] ? Number(match[2]) : details.size - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= details.size) {
    return reply.code(416).header("content-range", `bytes */${details.size}`).send();
  }
  const boundedEnd = Math.min(end, details.size - 1);
  reply.code(206);
  reply.header("content-range", `bytes ${start}-${boundedEnd}/${details.size}`);
  reply.header("content-length", String(boundedEnd - start + 1));
  return reply.send(createReadStream(requested, { start, end: boundedEnd }));
});

app.setErrorHandler((error, _request, reply) => {
  if (error instanceof z.ZodError) {
    return reply.code(400).send({ error: "invalid_request", details: error.flatten() });
  }
  app.log.error(error);
  return reply.code(500).send({ error: "recording_engine_failure" });
});

const scheduler = setInterval(() => {
  for (const job of jobs.values()) void reconcile(job).catch(logFailure);
}, 30_000);
const retentionWorker = setInterval(() => void maintenanceSweep().catch(logFailure),
  config.RETENTION_SWEEP_SECONDS * 1_000);
const writeProbeWorker = setInterval(() => void runWriteProbe().catch(logFailure), 60_000);

retentionWorker.unref();
scheduler.unref();

app.addHook("onClose", async () => {
  clearInterval(scheduler);
  clearInterval(retentionWorker);
  clearInterval(writeProbeWorker);
  for (const timer of restartTimers.values()) clearTimeout(timer);
  for (const id of workers.keys()) stop(id);
  for (const id of postRollTimers.keys()) clearPostRoll(id);
});

for (const job of jobs.values()) await reconcile(job);
void maintenanceSweep().catch(logFailure);

await app.listen({ host: config.HOST, port: config.PORT });
process.once("SIGTERM", () => void app.close());
process.once("SIGINT", () => void app.close());

async function reconcile(job: ManagedJob) {
  if (!shouldRun(job)) {
    const wasActive = workers.has(job.cameraId);
    stop(job.cameraId);
    if (wasActive && job.job.enabled && job.job.mode === "scheduled") {
      await health(job, "recording_scheduled", "info",
        "Recording is waiting for its next schedule window");
    }
    return;
  }
  if (["continuous", "manual", "scheduled"].includes(job.job.mode)) {
    await start(job);
  }
}

function shouldRun(job: ManagedJob) {
  return job.job.enabled &&
    (job.job.mode !== "scheduled" || inSchedule(job.job.schedule));
}

function localTimeForTimezone(timezone: string) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    hour12: false,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    weekday: "short",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return {
    weekday: values.weekday as string,
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
    hour: Number(values.hour),
    minute: Number(values.minute),
  };
}

function minutesSinceMidnight(hour: number, minute: number) {
  return hour * 60 + minute;
}

function isTimeInRange(minutes: number, start: string, end: string) {
  const [sh, sm] = start.split(":").map(Number);
  const [eh, em] = end.split(":").map(Number);
  const startMinutes = minutesSinceMidnight(sh, sm);
  const endMinutes = minutesSinceMidnight(eh, em);
  return startMinutes <= endMinutes
    ? minutes >= startMinutes && minutes < endMinutes
    : minutes >= startMinutes || minutes < endMinutes;
}

function weekdayFromShort(name: string) {
  return ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(name);
}

function inSchedule(value: z.infer<typeof scheduleSchema> | undefined) {
  if (!value) return false;
  const local = localTimeForTimezone(value.timezone);
  const date = `${local.year.toString().padStart(4, "0")}-${local.month.toString().padStart(2, "0")}-${local.day.toString().padStart(2, "0")}`;
  const currentMinutes = minutesSinceMidnight(local.hour, local.minute);
  if (value.exceptions) {
    for (const exception of value.exceptions) {
      if (!exception.enabled || exception.date !== date) continue;
      if (!exception.start || !exception.end) return false;
      if (isTimeInRange(currentMinutes, exception.start, exception.end)) return false;
    }
  }
  const localWeekday = weekdayFromShort(local.weekday);
  return value.windows.some((window) => {
    if (!window.enabled) return false;
    if (!window.days.includes(localWeekday)) return false;
    return isTimeInRange(currentMinutes, window.start, window.end);
  });
}

async function start(job: ManagedJob) {
  if (workers.has(job.cameraId)) return;
  const metrics = await storageAdapter.getMetrics();
  if (metrics.availableBytes < config.MIN_FREE_STORAGE_BYTES) {
    await health(job, "storage_capacity_exhausted", "critical",
      "Recorder has insufficient free storage to start a safe recording worker", {
        availableBytes: metrics.availableBytes,
        minimumFreeBytes: config.MIN_FREE_STORAGE_BYTES,
      });
    throw new Error("storage_capacity_exhausted");
  }
  const source = secrets[job.connectionSecretRef];
  if (!source) {
    await health(job, "stream_secret_unavailable", "critical",
      "Camera stream credentials could not be resolved");
    throw new Error("stream_secret_unavailable");
  }
  const staging = await storageAdapter.getStagingPath(job.cameraId);
  const outputPattern = join(staging, "%Y%m%d-%H%M%S.mp4");
  const args = [
    "-nostdin", "-hide_banner", "-loglevel", "warning", "-y",
    "-rw_timeout", String(config.RTSP_IO_TIMEOUT_MS * 1_000),
    "-rtsp_transport", "tcp", "-i", source,
    "-map", "0:v:0", "-c", "copy",
    "-f", "segment", "-segment_time", String(job.job.segmentDurationSeconds),
    "-segment_atclocktime", "1", "-reset_timestamps", "1", "-strftime", "1",
    "-segment_list", "pipe:1", "-segment_list_type", "csv",
    outputPattern,
  ];
  const child = spawn("ffmpeg", args, { stdio: ["ignore", "pipe", "pipe"] });
  const worker: Worker = {
    process: child, job, stdoutBuffer: "", stderr: [], intentionallyStopping: false,
  };
  workers.set(job.cameraId, worker);
  child.stdout?.setEncoding("utf8");
  child.stdout?.on("data", (chunk: string) => void consumeSegmentOutput(worker, chunk));
  child.stderr?.setEncoding("utf8");
  child.stderr?.on("data", (chunk: string) => {
    worker.stderr.push(...chunk.split(/\r?\n/).filter(Boolean));
    worker.stderr.splice(0, Math.max(0, worker.stderr.length - 20));
  });
  child.once("spawn", () => void health(job, "recording_started", "info",
    "Recording process started"));
  child.once("error", (error) => void workerFailed(worker, error.message));
  child.once("exit", (code, signal) => {
    if (workers.get(job.cameraId)?.process === child) workers.delete(job.cameraId);
    if (!worker.intentionallyStopping) {
      void workerFailed(worker,
        `FFmpeg exited (${code ?? "no-code"}/${signal ?? "no-signal"})`);
    }
  });
}

function stop(cameraId: string) {
  const worker = workers.get(cameraId);
  if (worker) {
    worker.intentionallyStopping = true;
    worker.process.kill("SIGTERM");
  }
  workers.delete(cameraId);
  const restart = restartTimers.get(cameraId);
  if (restart) clearTimeout(restart);
  restartTimers.delete(cameraId);
}

async function workerFailed(worker: Worker, reason: string) {
  const cameraId = worker.job.cameraId;
  if (worker.intentionallyStopping) return;
  const details = worker.stderr.length > 0 ? worker.stderr.slice(-5) : undefined;
  const credentialsRejected = details?.some((line) =>
    /401|403|unauthori[sz]ed|authentication failed|invalid user|login failed/i.test(line),
  ) ?? false;
  const diskFullDetected = details?.some((line) =>
    /no space left on device|ENOSPC|failed to write|write error/i.test(line),
  ) ?? false;
  const eventType = credentialsRejected
    ? "invalid_camera_credentials"
    : diskFullDetected
      ? "storage_capacity_exhausted"
      : "recording_stopped";
  const message = credentialsRejected
    ? "Camera rejected the recording credentials"
    : diskFullDetected
      ? "Recording process stopped due to disk-full or storage write error"
      : "Recording process stopped unexpectedly";
  await health(worker.job, eventType, "critical", message, {
    reason, stderr: details,
  });
  if (!shouldRun(worker.job) || restartTimers.has(cameraId)) return;
  if (credentialsRejected || diskFullDetected) {
    const timer = setTimeout(() => {
      restartTimers.delete(cameraId);
      void start(worker.job).catch(logFailure);
    }, 300_000);
    restartTimers.set(cameraId, timer);
    return;
  }
  const attempt = (restartAttempts.get(cameraId) ?? 0) + 1;
  restartAttempts.set(cameraId, attempt);
  const delay = Math.min(60_000, 2 ** Math.min(attempt, 6) * 1_000);
  const timer = setTimeout(() => {
    restartTimers.delete(cameraId);
    void start(worker.job).catch(logFailure);
  }, delay);
  restartTimers.set(cameraId, timer);
}

async function consumeSegmentOutput(worker: Worker, chunk: string) {
  worker.stdoutBuffer += chunk;
  const lines = worker.stdoutBuffer.split(/\r?\n/);
  worker.stdoutBuffer = lines.pop() ?? "";
  for (const line of lines) {
    if (!line.trim()) continue;
    try {
      await indexCompletedSegment(worker.job, line.trim());
    } catch (error) {
      await health(worker.job, "playback_index_mismatch", "warning",
        "A completed recording segment could not be indexed", {
          error: error instanceof Error ? error.message : String(error),
        });
    }
  }
}

async function indexCompletedSegment(job: ManagedJob, csvLine: string) {
  const [reportedPath, startOffset, endOffset] = parseCsv(csvLine);
  if (!reportedPath) throw new Error("invalid_segment_manifest");
  const stagingPath = isAbsolute(reportedPath) ? reportedPath : join(recordingRoot, reportedPath);
  assertInsideRoot(stagingPath);
  const startedAt = timestampFromFilename(reportedPath) ?? new Date();
  const durationSeconds = Math.max(1, Number(endOffset) - Number(startOffset));
  const endedAt = new Date(startedAt.getTime() + durationSeconds * 1_000);
  const previousEnd = lastSegmentEnd.get(job.cameraId);
  const gapSeconds = previousEnd == null ? 0 : (startedAt.getTime() - previousEnd) / 1_000;
  if ((job.job.mode === "continuous" || job.job.mode === "scheduled") &&
      gapSeconds > Math.max(5, job.job.segmentDurationSeconds * 0.25)) {
    await health(job, "recording_gap_detected", "warning",
      "A gap was detected between recording segments", { gapSeconds });
  }
  lastSegmentEnd.set(job.cameraId, endedAt.getTime());
  const targetPath = storageAdapter.resolveSegmentTargetPath(job.cameraId, startedAt, basename(stagingPath));
  await mkdir(dirname(targetPath), { recursive: true });
  await rename(stagingPath, targetPath);
  const details = await stat(targetPath);
  const relativePath = relative(recordingRoot, targetPath).replaceAll("\\", "/");
  const checksumSha256 = config.EVIDENCE_CHECKSUM_ENABLED
    ? await checksum(targetPath)
    : undefined;
  let codec: string | undefined;
  let status: "ready" | "error" = "ready";
  try {
    codec = await probeSegment(targetPath);
  } catch (error) {
    status = "error";
    await health(job, "segment_decode_failed", "critical",
      "A completed recording segment cannot be decoded", {
        error: error instanceof Error ? error.message : String(error),
        storagePath: relativePath,
      });
  }
  const indexPayload = {
    tenantId: job.tenantId, cameraId: job.cameraId, jobId: job.job.id,
    startedAt: startedAt.toISOString(), endedAt: endedAt.toISOString(),
    storagePath: relativePath, sizeBytes: details.size,
    storageNodeExternalId: config.STORAGE_NODE_EXTERNAL_ID,
    storageTier: "hot" as const, checksumSha256, status, codec,
  };
  try {
    await submitSegmentIndex(indexPayload);
    if (status === "ready") restartAttempts.set(job.cameraId, 0);
  } catch (error) {
    await writeFile(`${targetPath}.index.json`, JSON.stringify(indexPayload), {
      encoding: "utf8", mode: 0o600,
    });
    throw error;
  }
}

async function maintenanceSweep() {
  await retryPendingIndexes();
  const tenantIds = [...new Set([...jobs.values()].map((job) => job.tenantId))];
  if (tenantIds.length === 0) return;
  const metrics = await storageAdapter.getMetrics();
  const capacityBytes = metrics.capacityBytes;
  const availableBytes = metrics.availableBytes;
  const usedBytes = metrics.usedBytes;
  const usedPercent = capacityBytes > 0 ? usedBytes / capacityBytes * 100 : 100;
  for (const tenantId of tenantIds) {
    await reportStorageThreshold(tenantId, usedPercent);
    await controlPlane(`/internal/recording/storage-nodes/${encodeURIComponent(config.STORAGE_NODE_EXTERNAL_ID)}`, {
      method: "PUT",
      body: JSON.stringify({
        tenantId,
        name: config.STORAGE_NODE_NAME,
        supportedTiers: parseTiers(config.STORAGE_NODE_TIERS),
        capacityBytes,
        usedBytes,
        availableBytes,
        status: metrics.status,
        storageType: metrics.storageType,
        supportedProtocols: metrics.supportedProtocols,
        location: metrics.location,
        mountPath: metrics.mountPath,
        readMbps: metrics.readMbps,
        latencyMs: metrics.latencyMs,
        temperatureCelsius: metrics.temperatureCelsius,
        writeMbps: metrics.writeMbps,
        smart: metrics.smart,
        raid: metrics.raid,
        lastWriteProbe: metrics.lastWriteProbe,
      }),
    });
    const response = await controlPlane(
      `/internal/recording/retention-candidates?tenantId=${encodeURIComponent(tenantId)}` +
      `&storageNodeExternalId=${encodeURIComponent(config.STORAGE_NODE_EXTERNAL_ID)}&limit=200`,
    );
    const body = z.object({
      data: z.array(z.object({ id: z.string(), storagePath: z.string() })),
    }).parse(await response.json());
    const deleted: string[] = [];
    for (const segment of body.data) {
      const path = resolve(recordingRoot, segment.storagePath);
      assertInsideRoot(path);
      try {
        await unlink(path);
        deleted.push(segment.id);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") deleted.push(segment.id);
      }
    }
    if (deleted.length > 0) {
      await controlPlane("/internal/recording/segments/deleted", {
        method: "POST",
        body: JSON.stringify({
          tenantId, storageNodeExternalId: config.STORAGE_NODE_EXTERNAL_ID,
          segmentIds: deleted,
        }),
      });
    }
  }
}

async function runWriteProbe() {
  const probe = await storageAdapter.runWriteProbe();
  const metrics = await storageAdapter.getMetrics();
  const nextMetrics = { ...metrics, lastWriteProbe: probe };
  const status: StorageStatus = probe.status === "failed" ? "critical" : metrics.status;
  await controlPlane(`/internal/recording/storage-nodes/${encodeURIComponent(config.STORAGE_NODE_EXTERNAL_ID)}`, {
    method: "PUT",
    body: JSON.stringify({
      tenantId: (jobs.values().next().value?.tenantId) ?? "unknown",
      name: config.STORAGE_NODE_NAME,
      supportedTiers: parseTiers(config.STORAGE_NODE_TIERS),
      capacityBytes: nextMetrics.capacityBytes,
      usedBytes: nextMetrics.usedBytes,
      availableBytes: nextMetrics.availableBytes,
      status,
      storageType: nextMetrics.storageType,
      supportedProtocols: nextMetrics.supportedProtocols,
      location: nextMetrics.location,
      mountPath: nextMetrics.mountPath,
      readMbps: nextMetrics.readMbps,
      latencyMs: nextMetrics.latencyMs,
      temperatureCelsius: nextMetrics.temperatureCelsius,
      writeMbps: nextMetrics.writeMbps,
      smart: nextMetrics.smart,
      raid: nextMetrics.raid,
      lastWriteProbe: probe,
    }),
  }).catch(logFailure);

  if (probe.status === "failed") {
    await health({
      tenantId: (jobs.values().next().value?.tenantId) ?? "unknown",
      cameraId: "",
      job: {
        id: "",
        cameraId: "",
        mode: "continuous",
        enabled: true,
        status: "idle",
        retentionDays: 30,
        segmentDurationSeconds: 60,
        hotRetentionDays: 30,
        warmRetentionDays: 60,
        coldRetentionDays: 90,
        critical: false,
        backupRequired: false,
        automaticDeletionEnabled: true,
        evidenceProtection: true,
        recordMainStream: true,
        preRollSeconds: 0,
        postRollSeconds: 0,
        minMotionDurationSeconds: 0,
        motionConfidenceThreshold: 0,
        cooldownSeconds: 0,
        maxEventDurationSeconds: 0,
        updatedAt: new Date().toISOString(),
      },
    } as ManagedJob, "storage_write_probe_failed", "critical",
      "Storage write probe failed; mounted storage may not be writable", {
        probe,
      });
  }
}

async function reportStorageThreshold(tenantId: string, usedPercent: number) {
  const level = usedPercent >= 95 ? "95" : usedPercent >= 90 ? "90"
    : usedPercent >= 80 ? "80" : "normal";
  const previous = storageThresholds.get(tenantId);
  if (previous === level) return;
  storageThresholds.set(tenantId, level);
  if (level === "normal" && previous && previous !== "normal") {
    await controlPlane("/internal/recording/health", {
      method: "POST",
      body: JSON.stringify({
        tenantId, storageNodeExternalId: config.STORAGE_NODE_EXTERNAL_ID,
        eventType: "storage_capacity_recovered", severity: "info",
        message: "Recording storage returned below the 80% warning threshold",
        details: { usedPercent: Number(usedPercent.toFixed(2)) },
      }),
    });
  } else if (level !== "normal") {
    await controlPlane("/internal/recording/health", {
      method: "POST",
      body: JSON.stringify({
        tenantId, storageNodeExternalId: config.STORAGE_NODE_EXTERNAL_ID,
        eventType: `storage_above_${level}_percent`,
        severity: level === "95" ? "critical" : "warning",
        message: `Recording storage is above ${level}% capacity`,
        details: { usedPercent: Number(usedPercent.toFixed(2)) },
      }),
    });
  }
}

async function retryPendingIndexes() {
  for (const sidecar of await findIndexSidecars(recordingRoot)) {
    try {
      const payload = internalIndexPayload.parse(JSON.parse(
        await readFile(sidecar, "utf8"),
      ));
      await submitSegmentIndex(payload);
      await unlink(sidecar);
    } catch (error) {
      logFailure(error);
    }
  }
}

async function retryPendingControlPlaneRequests() {
  for (const sidecar of await findControlPlaneSidecars(pendingControlPlanePath)) {
    try {
      const payload = z.object({
        path: z.string(),
        init: z.object({
          method: z.string().optional(),
          body: z.string().optional(),
          headers: z.record(z.string()).optional(),
        }),
      }).parse(JSON.parse(await readFile(sidecar, "utf8")));
      await controlPlane(payload.path, {
        method: payload.init.method,
        body: payload.init.body,
        headers: payload.init.headers,
      });
      await unlink(sidecar);
    } catch (error) {
      logFailure(error);
    }
  }
}

async function enqueueControlPlaneRequest(path: string, init: RequestInit) {
  const marker = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}.control.json`;
  const filePath = join(pendingControlPlanePath, marker);
  await writeFile(filePath, JSON.stringify({
    path,
    init: {
      method: init.method,
      body: typeof init.body === "string" ? init.body : undefined,
      headers: typeof init.headers === "object" && init.headers !== null
        ? Object.fromEntries(Object.entries(init.headers as Record<string, string>))
        : undefined,
    },
  }, null, 2), { encoding: "utf8", mode: 0o600 });
}

async function findControlPlaneSidecars(folder: string): Promise<string[]> {
  const matches: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) matches.push(...await findControlPlaneSidecars(path));
    else if (entry.isFile() && entry.name.endsWith(".control.json")) matches.push(path);
    if (matches.length >= 1_000) break;
  }
  return matches;
}

const internalIndexPayload = z.object({
  tenantId: z.string(), cameraId: z.string(), jobId: z.string(),
  startedAt: z.string(), endedAt: z.string(), storagePath: z.string(),
  sizeBytes: z.number(), storageNodeExternalId: z.string(),
  storageTier: z.enum(["hot", "warm", "cold"]),
  status: z.enum(["ready", "moving", "deleted", "error"]).default("ready"),
  checksumSha256: z.string().optional(),
  codec: z.string().optional(),
});

async function submitSegmentIndex(payload: z.infer<typeof internalIndexPayload>) {
  await controlPlane("/internal/recording/segments", {
    method: "POST", body: JSON.stringify(payload),
  });
}

async function findIndexSidecars(folder: string): Promise<string[]> {
  const matches: string[] = [];
  for (const entry of await readdir(folder, { withFileTypes: true })) {
    const path = join(folder, entry.name);
    if (entry.isDirectory()) matches.push(...await findIndexSidecars(path));
    else if (entry.isFile() && entry.name.endsWith(".index.json")) matches.push(path);
    if (matches.length >= 1_000) break;
  }
  return matches;
}

async function health(
  job: ManagedJob,
  eventType: string,
  severity: "info" | "warning" | "critical",
  message: string,
  details?: Record<string, unknown>,
) {
  try {
    await controlPlane("/internal/recording/health", {
      method: "POST",
      body: JSON.stringify({
        tenantId: job.tenantId, cameraId: job.cameraId,
        storageNodeExternalId: config.STORAGE_NODE_EXTERNAL_ID,
        eventType, severity, message, details,
      }),
    });
  } catch (error) {
    logFailure(error);
  }
}

async function controlPlane(path: string, init: RequestInit = {}) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(new URL(path, config.CONTROL_PLANE_URL), {
        ...init,
        headers: {
          "content-type": "application/json",
          "x-recording-engine-key": config.RECORDING_ENGINE_SHARED_KEY,
          ...init.headers,
        },
        signal: AbortSignal.timeout(10_000),
      });
      if (!response.ok) throw new Error(`control_plane_${response.status}`);
      return response;
    } catch (error) {
      lastError = error;
      if (attempt < 3) await new Promise((resolveDelay) =>
        setTimeout(resolveDelay, attempt * 500));
    }
  }
  throw lastError;
}

async function persistJobs() {
  const temporary = `${persistedJobsPath}.tmp`;
  await writeFile(temporary, JSON.stringify([...jobs.values()], null, 2), {
    encoding: "utf8", mode: 0o600,
  });
  await rename(temporary, persistedJobsPath);
}

async function restoreJobs() {
  try {
    const values = z.array(jobSchema).parse(JSON.parse(
      await readFile(persistedJobsPath, "utf8"),
    ));
    for (const job of values) jobs.set(job.cameraId, job);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") logFailure(error);
  }
}

function finalSegmentPath(cameraId: string, startedAt: Date, original: string) {
  return join(recordingRoot, safe(cameraId), String(startedAt.getUTCFullYear()),
    two(startedAt.getUTCMonth() + 1), two(startedAt.getUTCDate()),
    two(startedAt.getUTCHours()), original.replace(/^\d{8}-/, ""));
}

function timestampFromFilename(path: string) {
  const match = basename(path).match(/^(\d{4})(\d{2})(\d{2})-(\d{2})(\d{2})(\d{2})/);
  if (!match) return undefined;
  const [, year, month, day, hour, minute, second] = match;
  const value = new Date(Number(year), Number(month) - 1, Number(day),
    Number(hour), Number(minute), Number(second));
  return Number.isNaN(value.getTime()) ? undefined : value;
}

function parseCsv(line: string) {
  return line.split(",").map((value) => value.replace(/^"|"$/g, ""));
}

async function checksum(path: string) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(path)) hash.update(chunk);
  return hash.digest("hex");
}

async function probeSegment(path: string): Promise<string> {
  return await new Promise((resolveProbe, rejectProbe) => {
    const child = spawn("ffprobe", [
      "-v", "error", "-select_streams", "v:0", "-show_entries",
      "stream=codec_name", "-of", "default=noprint_wrappers=1:nokey=1", path,
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", (chunk: string) => { stdout += chunk; });
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", (chunk: string) => { stderr += chunk; });
    child.once("error", rejectProbe);
    child.once("exit", (code) => {
      const codec = stdout.trim().split(/\r?\n/)[0];
      if (code === 0 && codec) resolveProbe(codec);
      else rejectProbe(new Error(stderr.trim() || `ffprobe_exit_${code ?? "unknown"}`));
    });
  });
}

function assertInsideRoot(path: string) {
  const candidate = relative(recordingRoot, resolve(path));
  if (candidate.startsWith("..") || isAbsolute(candidate)) {
    throw new Error("unsafe_recording_path");
  }
}

function parseTiers(value: string): Array<"hot" | "warm" | "cold"> {
  const values = value.split(",").map((tier) => tier.trim())
    .filter((tier): tier is "hot" | "warm" | "cold" =>
      tier === "hot" || tier === "warm" || tier === "cold");
  return values.length > 0 ? [...new Set(values)] : ["hot"];
}

function clearPostRoll(cameraId: string) {
  const timer = postRollTimers.get(cameraId);
  if (timer) clearTimeout(timer);
  postRollTimers.delete(cameraId);
}

function safe(value: string) {
  return createHash("sha256").update(value).digest("hex").slice(0, 24);
}
function same(left: string, right: string) {
  const a = Buffer.from(left);
  const b = Buffer.from(right);
  return a.length === b.length && timingSafeEqual(a, b);
}
function two(value: number) { return String(value).padStart(2, "0"); }
function logFailure(error: unknown) { app.log.error(error); }
