import { createHash, timingSafeEqual } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { spawn, type ChildProcess } from "node:child_process";
import Fastify from "fastify";
import { z } from "zod";

const config = z.object({ HOST: z.string().default("0.0.0.0"), PORT: z.coerce.number().default(8091), RECORDING_ROOT: z.string().default("./recordings"), RECORDING_ENGINE_SHARED_KEY: z.string().min(32), STREAM_SECRETS_JSON: z.string().default("{}") }).parse(process.env);
const secrets = z.record(z.string()).parse(JSON.parse(config.STREAM_SECRETS_JSON));
const schedule = z.object({ days: z.array(z.number().int().min(0).max(6)), start: z.string().regex(/^\d{2}:\d{2}$/), end: z.string().regex(/^\d{2}:\d{2}$/) });
const jobSchema = z.object({ cameraId: z.string().min(1), connectionSecretRef: z.string().min(1), job: z.object({ id: z.string(), mode: z.enum(["continuous", "motion", "scheduled", "event", "manual"]), enabled: z.boolean(), status: z.string(), retentionDays: z.number().int(), postRollSeconds: z.number().int(), schedule: schedule.optional() }) });
type ManagedJob = z.infer<typeof jobSchema>;
const workers = new Map<string, ChildProcess>();
const jobs = new Map<string, ManagedJob>();
const postRollTimers = new Map<string, NodeJS.Timeout>();
const app = Fastify({ logger: true });

app.addHook("preHandler", async (request, reply) => {
  if (request.url === "/health") return;
  const value = request.headers["x-recording-engine-key"];
  if (typeof value !== "string" || !same(value, config.RECORDING_ENGINE_SHARED_KEY)) return reply.code(401).send({ error: "invalid_engine_identity" });
});
app.get("/health", async () => ({ status: "ok", service: "sentinel-recording-engine", activeWorkers: workers.size, configuredJobs: jobs.size }));
app.put("/internal/jobs", async (request, reply) => {
  const input = jobSchema.parse(request.body); jobs.set(input.cameraId, input); clearPostRoll(input.cameraId); await reconcile(input);
  return reply.code(202).send({ cameraId: input.cameraId, active: workers.has(input.cameraId), mode: input.job.mode });
});
app.post("/internal/jobs/:cameraId/trigger", async (request, reply) => {
  const { cameraId } = z.object({ cameraId: z.string().min(1) }).parse(request.params);
  const trigger = z.object({ type: z.enum(["motion", "event"]) }).parse(request.body);
  const job = jobs.get(cameraId);
  if (!job || !job.job.enabled || job.job.mode !== trigger.type) return reply.code(409).send({ error: "recording_mode_not_triggerable" });
  await start(job); clearPostRoll(cameraId);
  postRollTimers.set(cameraId, setTimeout(() => { stop(cameraId); }, job.job.postRollSeconds * 1000));
  return reply.code(202).send({ cameraId, active: true });
});
const scheduler = setInterval(() => { for (const job of jobs.values()) void reconcile(job); }, 30_000);
app.addHook("onClose", async () => { clearInterval(scheduler); for (const id of workers.keys()) stop(id); for (const id of postRollTimers.keys()) clearPostRoll(id); });

async function reconcile(job: ManagedJob) {
  if (!job.job.enabled || (job.job.mode === "scheduled" && !inSchedule(job.job.schedule))) { stop(job.cameraId); return; }
  if (["continuous", "manual", "scheduled"].includes(job.job.mode)) await start(job);
}
function inSchedule(value: z.infer<typeof schedule> | undefined) { if (!value) return false; const now = new Date(); if (!value.days.includes(now.getDay())) return false; const minutes = now.getHours() * 60 + now.getMinutes(); const [sh, sm] = value.start.split(":").map(Number); const [eh, em] = value.end.split(":").map(Number); const start = sh! * 60 + sm!; const end = eh! * 60 + em!; return start <= end ? minutes >= start && minutes < end : minutes >= start || minutes < end; }
async function start(job: ManagedJob) { if (workers.has(job.cameraId)) return; const source = secrets[job.connectionSecretRef]; if (!source) throw new Error("stream_secret_unavailable"); const folder = `${config.RECORDING_ROOT}/${safe(job.cameraId)}`; await mkdir(folder, { recursive: true }); const worker = spawn("ffmpeg", ["-nostdin", "-rtsp_transport", "tcp", "-i", source, "-map", "0:v:0", "-c", "copy", "-f", "segment", "-segment_time", "300", "-reset_timestamps", "1", "-strftime", "1", `${folder}/%Y%m%d-%H%M%S.mp4`], { stdio: "ignore" }); worker.once("exit", () => workers.delete(job.cameraId)); workers.set(job.cameraId, worker); }
function stop(cameraId: string) { const worker = workers.get(cameraId); if (worker) worker.kill("SIGTERM"); workers.delete(cameraId); }
function clearPostRoll(cameraId: string) { const timer = postRollTimers.get(cameraId); if (timer) clearTimeout(timer); postRollTimers.delete(cameraId); }
function safe(value: string) { return createHash("sha256").update(value).digest("hex").slice(0, 24); }
function same(left: string, right: string) { const a = Buffer.from(left); const b = Buffer.from(right); return a.length === b.length && timingSafeEqual(a, b); }
await app.listen({ host: config.HOST, port: config.PORT });
