/**
 * Hardware Compatibility Lab — REST API Routes
 *
 * GET    /api/v1/compatibility-lab/matrix                → paginated list
 * GET    /api/v1/compatibility-lab/matrix/export         → signed JSON snapshot
 * GET    /api/v1/compatibility-lab/matrix/export/md      → Markdown report
 * GET    /api/v1/compatibility-lab/matrix/vendor/:vendor → all entries for a vendor
 * GET    /api/v1/compatibility-lab/matrix/:id            → single entry
 * POST   /api/v1/compatibility-lab/matrix                → submit / create entry
 * PUT    /api/v1/compatibility-lab/matrix/:id/result     → update one feature result
 * POST   /api/v1/compatibility-lab/run-test              → trigger automated lab run
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import {
  LabMatrixStore,
  getLabMatrixStore,
  makeEntryId,
  computeOverallRating,
} from "../compatibility-lab/services/lab-matrix.store.js";
import { MatrixPublisher } from "../compatibility-lab/export/matrix-publisher.js";
import type {
  CompatibilityFeature,
  CompatibilityMatrixEntry,
  CompatibilityVendor,
  DeviceClass,
  FeatureStatus,
} from "../compatibility-lab/domain/compatibility-lab.types.js";
import { ALL_FEATURES } from "../compatibility-lab/domain/compatibility-lab.types.js";

// ─── Validation Schemas ───────────────────────────────────────────────────────

const VendorEnum = z.enum(["CP_PLUS", "DAHUA", "HIKVISION", "AXIS", "ONVIF_GENERIC"]);
const DeviceClassEnum = z.enum([
  "IP_CAMERA", "NVR", "DVR", "HYBRID_NVR", "PTZ_CAMERA", "FISHEYE_CAMERA", "MULTISENSOR_CAMERA",
]);
const FeatureStatusEnum = z.enum(["PASS", "FAIL", "PARTIAL", "NA", "NOT_TESTED"]);
const CompatibilityFeatureEnum = z.enum([
  "LIVE", "SUBSTREAM", "PLAYBACK", "EVENTS", "PTZ", "HDD_HEALTH", "RETENTION", "REBOOT",
]);
const AuthModeEnum = z.enum([
  "BASIC", "DIGEST", "ONVIF_WS_SECURITY", "ONVIF_WS_SECURITY_TOKEN", "BEARER_TOKEN", "NO_AUTH",
]);
const CodecEnum = z.enum(["H264", "H265", "MJPEG", "AV1", "H264+", "H265+"]);
const RatingEnum = z.enum([
  "CERTIFIED", "COMPATIBLE", "LIMITED", "INCOMPATIBLE", "UNTESTED",
]);

const CodecEntrySchema = z.object({
  codec: CodecEnum,
  resolutions: z.array(z.string()),
  smartCodec: z.boolean().optional(),
});

const TargetSchema = z.object({
  vendor: VendorEnum,
  modelId: z.string().min(1).max(100),
  firmwareVersion: z.string().min(1).max(100),
  generation: z.string().min(1).max(60),
  deviceClass: DeviceClassEnum,
  authModes: z.array(AuthModeEnum).min(1),
  codecSupport: z.array(CodecEntrySchema).min(1),
  onvifProfiles: z.array(z.enum(["S", "T", "G", "Q", "M"])).optional(),
  channels: z.number().int().positive().optional(),
  description: z.string().max(200).optional(),
});

const CreateEntrySchema = z.object({
  target: TargetSchema,
  notes: z.string().max(500).optional(),
});

const FeatureResultSchema = z.object({
  feature: CompatibilityFeatureEnum,
  status: FeatureStatusEnum,
  testedByVersion: z.string().default("0.1.0"),
  authMode: AuthModeEnum.optional(),
  resolution: z.string().optional(),
  codec: CodecEnum.optional(),
  latencyMs: z.number().nonnegative().optional(),
  note: z.string().max(500).optional(),
  firmwareNotes: z.string().max(500).optional(),
});

const RunTestSchema = z.object({
  target: TargetSchema,
  features: z.array(CompatibilityFeatureEnum).optional(),
  connection: z.object({
    host: z.string().ip({ version: "v4" }).or(z.string().regex(/^[\w.-]+$/)),
    httpPort: z.number().int().min(1).max(65535).default(80),
    rtspPort: z.number().int().min(1).max(65535).default(554),
    username: z.string().min(1),
    password: z.string().min(1),
  }),
  probeTimeoutMs: z.number().int().min(1000).max(30_000).optional(),
});

// ─── Route Registration ───────────────────────────────────────────────────────

export async function registerCompatibilityLabRoutes(app: FastifyInstance): Promise<void> {
  const store = getLabMatrixStore("0.1.0");
  const publisher = new MatrixPublisher(store, "0.1.0");

  // ── GET /matrix ───────────────────────────────────────────────────────────

  app.get(
    "/api/v1/compatibility-lab/matrix",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const q = req.query as Record<string, string | undefined>;
      const entries = store.list({
        vendor: q.vendor as CompatibilityVendor | undefined,
        deviceClass: q.deviceClass as DeviceClass | undefined,
        overallRating: q.overallRating as CompatibilityMatrixEntry["overallRating"] | undefined,
        modelId: q.modelId,
        firmwareVersion: q.firmwareVersion,
      });

      const page = Math.max(1, Number(q.page ?? 1));
      const limit = Math.min(100, Math.max(1, Number(q.limit ?? 50)));
      const offset = (page - 1) * limit;
      const paginated = entries.slice(offset, offset + limit);

      return reply.send({
        total: entries.length,
        page,
        limit,
        entries: paginated,
      });
    },
  );

  // ── GET /matrix/export ────────────────────────────────────────────────────

  app.get(
    "/api/v1/compatibility-lab/matrix/export",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const q = req.query as Record<string, string | undefined>;
      const snapshot = publisher.publish({
        vendorFilter: q.vendor,
        onlyCertified: q.onlyCertified === "true",
      });
      return reply
        .header("Content-Type", "application/json")
        .header(
          "Content-Disposition",
          `attachment; filename="sentinel-compatibility-matrix-${Date.now()}.json"`,
        )
        .send(snapshot);
    },
  );

  // ── GET /matrix/export/md ─────────────────────────────────────────────────

  app.get(
    "/api/v1/compatibility-lab/matrix/export/md",
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const snapshot = publisher.publish();
      const md = publisher.toMarkdown(snapshot);
      return reply
        .header("Content-Type", "text/markdown; charset=utf-8")
        .header(
          "Content-Disposition",
          `attachment; filename="sentinel-compatibility-matrix-${Date.now()}.md"`,
        )
        .send(md);
    },
  );

  // ── GET /matrix/vendor/:vendor ────────────────────────────────────────────

  app.get(
    "/api/v1/compatibility-lab/matrix/vendor/:vendor",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { vendor } = req.params as { vendor: string };
      const parsed = VendorEnum.safeParse(vendor.toUpperCase().replace(/-/g, "_"));
      if (!parsed.success) {
        return reply.code(400).send({
          error: "invalid_vendor",
          message: `Unknown vendor: ${vendor}. Valid values: CP_PLUS, DAHUA, HIKVISION, AXIS, ONVIF_GENERIC`,
        });
      }

      const entries = store.list({ vendor: parsed.data });
      return reply.send({ vendor: parsed.data, total: entries.length, entries });
    },
  );

  // ── GET /matrix/:id ───────────────────────────────────────────────────────

  app.get(
    "/api/v1/compatibility-lab/matrix/:id",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const entry = store.getById(id);
      if (!entry) {
        return reply.code(404).send({ error: "not_found", message: `No matrix entry with id: ${id}` });
      }
      return reply.send(entry);
    },
  );

  // ── POST /matrix ──────────────────────────────────────────────────────────

  app.post(
    "/api/v1/compatibility-lab/matrix",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = CreateEntrySchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", issues: parsed.error.issues });
      }

      const { target, notes } = parsed.data;
      const id = makeEntryId(target.vendor, target.modelId, target.firmwareVersion);

      const existing = store.getById(id);
      if (existing) {
        return reply.code(409).send({
          error: "conflict",
          message: `Entry already exists: ${id}. Use PUT /matrix/:id/result to update feature results.`,
          id,
        });
      }

      const entry: CompatibilityMatrixEntry = {
        id,
        target: target as CompatibilityMatrixEntry["target"],
        results: {},
        overallRating: "UNTESTED",
        sentinelVersion: "0.1.0",
        lastTestedAt: new Date().toISOString(),
        notes,
      };

      const created = store.upsert(entry);
      return reply.code(201).send(created);
    },
  );

  // ── PUT /matrix/:id/result ────────────────────────────────────────────────

  app.put(
    "/api/v1/compatibility-lab/matrix/:id/result",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const { id } = req.params as { id: string };
      const parsed = FeatureResultSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", issues: parsed.error.issues });
      }

      const result = {
        ...parsed.data,
        testedAt: new Date().toISOString(),
      } as import("../compatibility-lab/domain/compatibility-lab.types.js").CompatibilityTestResult;

      const updated = store.updateFeatureResult(id, result);
      if (!updated) {
        return reply.code(404).send({ error: "not_found", message: `No matrix entry with id: ${id}` });
      }

      return reply.send(updated);
    },
  );

  // ── POST /run-test ────────────────────────────────────────────────────────

  app.post(
    "/api/v1/compatibility-lab/run-test",
    async (req: FastifyRequest, reply: FastifyReply) => {
      const parsed = RunTestSchema.safeParse(req.body);
      if (!parsed.success) {
        return reply.code(400).send({ error: "validation_failed", issues: parsed.error.issues });
      }

      return reply.code(501).send({
        error: "compatibility_lab_transport_not_configured",
        message: "Configure a real ONVIF/ISAPI/vendor lab transport before running hardware tests.",
      });
    },
  );
}
