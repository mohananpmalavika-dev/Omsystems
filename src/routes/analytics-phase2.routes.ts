/**
 * Analytics Phase 2 API Routes
 * Face Recognition, ANPR, Behavior Analysis, Protected Objects
 */

import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Action, User } from "../domain/models.js";
import { localIdentityState } from "../analytics/identity-registry.js";

// Type guard to check if store has pool access
function hasPool(store: ControlPlaneStore): store is ControlPlaneStore & { db: any } {
  return 'db' in store && store.db !== undefined;
}

function localState(store: ControlPlaneStore) {
  return localIdentityState(store);
}

async function hasAnyAccess(store: ControlPlaneStore, user: User, action: Action) {
  return (await store.listAccessibleNodes(user, action)).length > 0;
}

async function hasTenantWideAccess(store: ControlPlaneStore, user: User, action: Action) {
  return (await store.listAccessibleNodes(user, action, "company")).length > 0;
}

async function accessibleCameraIds(store: ControlPlaneStore, user: User, action: Action) {
  const result = await store.listAccessibleCameras(user, action, {
    limit: 10_000,
    offset: 0,
  });
  return new Set(result.cameras.map((camera) => camera.id));
}

async function authorizeCamera(
  store: ControlPlaneStore,
  user: User,
  cameraId: string,
  action: Action,
) {
  const camera = await store.getCamera(cameraId);
  if (!camera) return { found: false, allowed: false };
  const decision = await store.checkAccess(user, action, camera.nodeId);
  return { found: true, allowed: decision?.allowed === true, camera };
}

function invalidInput(reply: FastifyReply, error: z.ZodError) {
  return reply.code(400).send({
    error: "invalid_request",
    issues: error.issues.map((issue) => ({
      path: issue.path.join("."),
      message: issue.message,
    })),
  });
}

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | undefined {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : undefined;
}

function recordArray(value: unknown): UnknownRecord[] {
  return Array.isArray(value)
    ? value.flatMap((item) => {
      const record = asRecord(item);
      return record ? [record] : [];
    })
    : [];
}

function firstString(record: UnknownRecord | undefined, ...keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return undefined;
}

function firstNumber(record: UnknownRecord | undefined, ...keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    const number = typeof value === "number" ? value : typeof value === "string" ? Number(value) : Number.NaN;
    if (Number.isFinite(number)) return number;
  }
  return undefined;
}

function firstBoolean(record: UnknownRecord | undefined, ...keys: string[]) {
  if (!record) return undefined;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "boolean") return value;
  }
  return undefined;
}

function isoValue(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  if (typeof value === "string") return value;
  return "";
}

function normalizedPlate(value: string) {
  return value.replace(/\s+/g, "").toUpperCase();
}

function activeLocalItem(item: UnknownRecord) {
  return !item.archivedAt && (!item.expiresAt || Date.parse(String(item.expiresAt)) > Date.now());
}

async function cameraNameMap(store: ControlPlaneStore, cameraIds: string[]) {
  const cameras = await store.listCamerasByIds([...new Set(cameraIds)]);
  return new Map(cameras.map((camera) => [camera.id, camera.name]));
}

async function genericFaceEvents(
  store: ControlPlaneStore,
  tenantId: string,
  filters: {
    cameraIds: string[];
    from?: string;
    to?: string;
    watchlistId?: string;
    personId?: string;
    minSimilarity: number;
  },
) {
  const events = await store.listAnalyticsEvents(tenantId, {
    cameraIds: filters.cameraIds,
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    detectionTypes: ["face-recognition"],
    limit: 10_000,
  });
  const names = await cameraNameMap(store, events.map((event) => event.cameraId));
  const candidates = events.flatMap((event) => {
    const metadata = asRecord(event.metadata);
    const matches = recordArray(metadata?.watchlistMatches ?? metadata?.matches);
    return matches.flatMap((match, index) => {
      const similarityScore = firstNumber(match, "similarity", "similarityScore", "score") ?? event.confidence;
      const watchlistId = firstString(match, "watchlistId", "watchlist_id");
      const personId = firstString(match, "personId", "person_id");
      if (similarityScore < filters.minSimilarity) return [];
      if (filters.watchlistId && watchlistId && watchlistId !== filters.watchlistId) return [];
      if (filters.personId && personId !== filters.personId) return [];
      return [{
        id: `${event.id}:${index}`,
        analyticsEventId: event.id,
        cameraId: event.cameraId,
        cameraName: names.get(event.cameraId) ?? null,
        watchlistId: watchlistId ?? null,
        personId: personId ?? null,
        personName: firstString(match, "personName", "person_name", "displayName") ?? null,
        similarityScore,
        faceQuality: firstNumber(match, "faceQuality", "quality") ?? null,
        snapshotReference: event.snapshotReference ?? null,
        occurredAt: event.occurredAt,
      }];
    });
  });

  const watchlistIds = [...new Set(candidates.flatMap((event) => event.watchlistId ? [event.watchlistId] : []))];
  const personIds = [...new Set(candidates.flatMap((event) => event.personId ? [event.personId] : []))];
  const watchlistNames = new Map<string, string>();
  const personNames = new Map<string, string>();
  const personWatchlists = new Map<string, string>();
  if (!hasPool(store)) {
    const state = localState(store);
    for (const watchlist of state.faceWatchlists as UnknownRecord[]) {
      if (watchlist.tenantId === tenantId && !watchlist.archivedAt && typeof watchlist.id === "string") {
        const name = firstString(watchlist, "name");
        if (name) watchlistNames.set(watchlist.id, name);
      }
    }
    for (const person of state.facePersons as UnknownRecord[]) {
      if (person.tenantId === tenantId && !person.archivedAt && typeof person.id === "string") {
        const name = firstString(person, "fullName", "full_name");
        if (name) personNames.set(person.id, name);
        const watchlistId = firstString(person, "watchlistId", "watchlist_id");
        if (watchlistId) personWatchlists.set(person.id, watchlistId);
      }
    }
  } else if (watchlistIds.length || personIds.length) {
    const identities = await store.db.query(
      `SELECT w.id::text AS watchlist_id, w.name AS watchlist_name,
              p.id::text AS person_id, p.full_name AS person_name
       FROM face_watchlists w
       LEFT JOIN face_watchlist_persons p
         ON p.watchlist_id = w.id AND p.archived_at IS NULL
       WHERE w.tenant_id = $1 AND w.archived_at IS NULL
         AND (w.id::text = ANY($2::text[]) OR p.id::text = ANY($3::text[]))`,
      [tenantId, watchlistIds, personIds],
    );
    for (const row of identities.rows as UnknownRecord[]) {
      const watchlistId = firstString(row, "watchlist_id");
      const watchlistName = firstString(row, "watchlist_name");
      const personId = firstString(row, "person_id");
      const personName = firstString(row, "person_name");
      if (watchlistId && watchlistName) watchlistNames.set(watchlistId, watchlistName);
      if (personId) {
        if (personName) personNames.set(personId, personName);
        if (watchlistId) personWatchlists.set(personId, watchlistId);
      }
    }
  }

  return candidates.flatMap((event) => {
    const watchlistId = event.watchlistId ??
      (event.personId ? personWatchlists.get(event.personId) ?? null : null);
    if (filters.watchlistId && watchlistId !== filters.watchlistId) return [];
    return [{
      ...event,
      watchlistId,
      watchlistName: watchlistId ? watchlistNames.get(watchlistId) ?? null : null,
      personName: event.personName ?? (event.personId ? personNames.get(event.personId) ?? null : null),
      ageEstimate: null,
      genderEstimate: null,
      wearingMask: null,
    }];
  });
}

type PlateRegistryEntry = {
  plateId: string;
  plateNumber: string;
  watchlistId: string;
  watchlistName: string | null;
  reason: string | null;
};

async function activePlateRegistry(
  store: ControlPlaneStore,
  tenantId: string,
  plateNumbers: string[],
) {
  const requested = new Set(plateNumbers.map(normalizedPlate));
  const registry = new Map<string, PlateRegistryEntry[]>();
  const add = (entry: PlateRegistryEntry) => {
    const key = normalizedPlate(entry.plateNumber);
    registry.set(key, [...registry.get(key) ?? [], entry]);
  };
  if (requested.size === 0) return registry;

  if (!hasPool(store)) {
    const state = localState(store);
    const watchlists = new Map(
      (state.anprWatchlists as UnknownRecord[])
        .filter((item) => item.tenantId === tenantId && !item.archivedAt && item.enabled !== false)
        .flatMap((item) => typeof item.id === "string" ? [[item.id, firstString(item, "name") ?? null] as const] : []),
    );
    for (const plate of state.anprPlates as UnknownRecord[]) {
      const plateNumber = firstString(plate, "plateNumber", "plate_number");
      const plateId = firstString(plate, "id");
      const watchlistId = firstString(plate, "watchlistId", "watchlist_id");
      if (!plateNumber || !plateId || !watchlistId || plate.tenantId !== tenantId ||
          !requested.has(normalizedPlate(plateNumber)) || !activeLocalItem(plate) || !watchlists.has(watchlistId)) continue;
      add({
        plateId, plateNumber, watchlistId,
        watchlistName: watchlists.get(watchlistId) ?? null,
        reason: firstString(plate, "reason") ?? null,
      });
    }
    return registry;
  }

  const result = await store.db.query(
    `SELECT p.id::text AS plate_id, p.plate_number,
            w.id::text AS watchlist_id, w.name AS watchlist_name, p.reason
     FROM anpr_watchlist_plates p
     JOIN anpr_watchlists w ON w.id = p.watchlist_id
     WHERE p.tenant_id = $1 AND p.archived_at IS NULL
       AND w.tenant_id = $1 AND w.archived_at IS NULL AND w.enabled
       AND (p.expires_at IS NULL OR p.expires_at > now())
       AND upper(regexp_replace(p.plate_number, '\\s+', '', 'g')) = ANY($2::text[])`,
    [tenantId, [...requested]],
  );
  for (const row of result.rows as UnknownRecord[]) {
    const plateId = firstString(row, "plate_id");
    const plateNumber = firstString(row, "plate_number");
    const watchlistId = firstString(row, "watchlist_id");
    if (!plateId || !plateNumber || !watchlistId) continue;
    add({
      plateId, plateNumber, watchlistId,
      watchlistName: firstString(row, "watchlist_name") ?? null,
      reason: firstString(row, "reason") ?? null,
    });
  }
  return registry;
}

async function genericAnprEvents(
  store: ControlPlaneStore,
  tenantId: string,
  filters: {
    cameraIds: string[];
    from?: string;
    to?: string;
    plateNumber?: string;
    watchlistId?: string;
    entryDirection?: "entry" | "exit" | "unknown";
  },
) {
  const events = await store.listAnalyticsEvents(tenantId, {
    cameraIds: filters.cameraIds,
    ...(filters.from ? { from: filters.from } : {}),
    ...(filters.to ? { to: filters.to } : {}),
    detectionTypes: ["anpr", "watchlist-match"],
    limit: 10_000,
  });
  const names = await cameraNameMap(store, events.map((event) => event.cameraId));
  const plateQuery = filters.plateNumber ? normalizedPlate(filters.plateNumber) : undefined;
  const candidates = events.flatMap((event) => {
    const metadata = asRecord(event.metadata);
    const matchRows = recordArray(metadata?.matches);
    const readingRows = recordArray(metadata?.readings);
    const legacyPlates = Array.isArray(metadata?.plates)
      ? metadata.plates.filter((item): item is string => typeof item === "string")
      : [];
    const observations: UnknownRecord[] = readingRows.length
      ? readingRows
      : matchRows.length
        ? matchRows
        : legacyPlates.map((plateNumber): UnknownRecord => ({ plateNumber }));

    return observations.flatMap((reading, index) => {
      const plateNumber = firstString(reading, "plateNumber", "plate_number");
      if (!plateNumber || (plateQuery && !normalizedPlate(plateNumber).includes(plateQuery))) return [];
      const match = matchRows.find((row) => {
        const value = firstString(row, "plateNumber", "plate_number");
        return value && normalizedPlate(value) === normalizedPlate(plateNumber);
      });
      const direction = firstString(reading, "entryDirection", "entry_direction") ??
        firstString(metadata, "entryDirection", "entry_direction", "direction") ?? "unknown";
      if (filters.entryDirection && direction !== filters.entryDirection) return [];
      const explicitWatchlistId = firstString(match, "watchlistId", "watchlist_id") ??
        firstString(reading, "watchlistId", "watchlist_id");
      if (filters.watchlistId && explicitWatchlistId && explicitWatchlistId !== filters.watchlistId) return [];
      return [{
        id: `${event.id}:${index}`,
        analyticsEventId: event.id,
        cameraId: event.cameraId,
        cameraName: names.get(event.cameraId) ?? null,
        plateNumber: normalizedPlate(plateNumber),
        plateConfidence: firstNumber(reading, "confidence", "plateConfidence", "plate_confidence") ?? event.confidence,
        countryCode: firstString(reading, "countryCode", "country_code", "country") ?? null,
        regionCode: firstString(reading, "regionCode", "region_code", "region") ?? null,
        vehicleType: firstString(reading, "vehicleType", "vehicle_type") ?? null,
        vehicleColor: firstString(reading, "vehicleColor", "vehicle_color") ?? null,
        vehicleMake: firstString(reading, "vehicleMake", "vehicle_make") ?? null,
        vehicleModel: firstString(reading, "vehicleModel", "vehicle_model") ?? null,
        plateBoundingBox: asRecord((reading as any).plateBoundingBox ?? (reading as any).plate_bbox) ?? null,
        entryDirection: ["entry", "exit", "unknown"].includes(direction) ? direction : "unknown",
        watchlistId: explicitWatchlistId ?? null,
        plateId: firstString(match, "plateId", "plate_id") ?? null,
        watchlistReason: firstString(match, "reason") ?? null,
        snapshotReference: event.snapshotReference ?? null,
        occurredAt: event.occurredAt,
      }];
    });
  });

  const registry = await activePlateRegistry(store, tenantId, candidates.map((event) => event.plateNumber));
  return candidates.flatMap((event) => {
    const registered = registry.get(normalizedPlate(event.plateNumber)) ?? [];
    const registration = filters.watchlistId
      ? registered.find((item) => item.watchlistId === filters.watchlistId)
      : registered.find((item) => item.watchlistId === event.watchlistId) ?? registered[0];
    if (filters.watchlistId && event.watchlistId !== filters.watchlistId && !registration) return [];
    return [{
      ...event,
      watchlistId: event.watchlistId ?? registration?.watchlistId ?? null,
      watchlistName: registration?.watchlistName ?? null,
      plateId: event.plateId ?? registration?.plateId ?? null,
      watchlistReason: event.watchlistReason ?? registration?.reason ?? null,
    }];
  });
}

function normalizedFaceRow(row: UnknownRecord) {
  return {
    id: firstString(row, "id") ?? randomUUID(),
    analyticsEventId: firstString(row, "analyticsEventId", "analytics_event_id") ?? null,
    cameraId: firstString(row, "cameraId", "camera_id") ?? "",
    cameraName: firstString(row, "cameraName", "camera_name") ?? null,
    watchlistId: firstString(row, "watchlistId", "watchlist_id") ?? null,
    watchlistName: firstString(row, "watchlistName", "watchlist_name") ?? null,
    personId: firstString(row, "personId", "person_id") ?? null,
    personName: firstString(row, "personName", "person_name") ?? null,
    similarityScore: firstNumber(row, "similarityScore", "similarity_score") ?? 0,
    faceQuality: firstNumber(row, "faceQuality", "face_quality") ?? null,
    ageEstimate: firstNumber(row, "ageEstimate", "age_estimate") ?? null,
    genderEstimate: firstString(row, "genderEstimate", "gender_estimate") ?? null,
    wearingMask: firstBoolean(row, "wearingMask", "wearing_mask") ?? null,
    snapshotReference: firstString(row, "snapshotReference", "snapshot_reference") ?? null,
    occurredAt: isoValue(row.occurredAt ?? row.occurred_at),
  };
}

function normalizedAnprRow(row: UnknownRecord) {
  return {
    id: firstString(row, "id") ?? randomUUID(),
    analyticsEventId: firstString(row, "analyticsEventId", "analytics_event_id") ?? null,
    cameraId: firstString(row, "cameraId", "camera_id") ?? "",
    cameraName: firstString(row, "cameraName", "camera_name") ?? null,
    plateNumber: normalizedPlate(firstString(row, "plateNumber", "plate_number") ?? ""),
    plateConfidence: firstNumber(row, "plateConfidence", "plate_confidence") ?? 0,
    countryCode: firstString(row, "countryCode", "country_code") ?? null,
    regionCode: firstString(row, "regionCode", "region_code") ?? null,
    vehicleType: firstString(row, "vehicleType", "vehicle_type") ?? null,
    vehicleColor: firstString(row, "vehicleColor", "vehicle_color") ?? null,
    entryDirection: firstString(row, "entryDirection", "entry_direction") ?? "unknown",
    watchlistId: firstString(row, "watchlistId", "watchlist_id") ?? null,
    watchlistName: firstString(row, "watchlistName", "watchlist_name") ?? null,
    watchlistReason: firstString(row, "watchlistReason", "watchlist_reason") ?? null,
    plateId: firstString(row, "plateId", "plate_id") ?? null,
    snapshotReference: firstString(row, "snapshotReference", "snapshot_reference") ?? null,
    occurredAt: isoValue(row.occurredAt ?? row.occurred_at),
  };
}

function recentUniqueRows<T extends { analyticsEventId: string | null; occurredAt: string }>(
  specialized: T[],
  generic: T[],
  limit: number,
  genericKey?: (row: T) => string,
) {
  const specializedEventIds = new Set(
    specialized.flatMap((row) => row.analyticsEventId ? [row.analyticsEventId] : []),
  );
  const combined = [
    ...specialized,
    ...generic.filter((row) => !row.analyticsEventId || !specializedEventIds.has(row.analyticsEventId)),
  ].sort((left, right) => right.occurredAt.localeCompare(left.occurredAt));
  if (!genericKey) return combined.slice(0, limit);
  const seen = new Set<string>();
  return combined.filter((row) => {
    const key = genericKey(row);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, limit);
}

const faceWatchlistSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().optional(),
  listType: z.enum(["security", "vip", "staff", "blacklist", "missing-person"]),
  alertOnMatch: z.boolean().default(true),
  alertSeverity: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P2"),
});

const facePersonSchema = z.object({
  externalId: z.string().optional(),
  fullName: z.string().min(1).max(255),
  dateOfBirth: z.string().date().optional(),
  gender: z.enum(["male", "female", "other", "unknown"]).optional(),
  notes: z.string().optional(),
  metadata: z.record(z.unknown()).default({}),
});

const anprWatchlistSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().optional(),
  listType: z.enum(["alert", "stolen", "wanted", "vip", "staff", "blacklist"]),
  alertOnMatch: z.boolean().default(true),
  alertSeverity: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P2"),
  alertAuthorities: z.boolean().default(false),
});

const anprPlateSchema = z.object({
  plateNumber: z.string().min(2).max(20),
  countryCode: z.string().length(2).default("IN"),
  regionCode: z.string().optional(),
  vehicleMake: z.string().optional(),
  vehicleModel: z.string().optional(),
  vehicleColor: z.string().optional(),
  vehicleType: z.enum(["car", "motorcycle", "bus", "truck", "other"]).optional(),
  ownerName: z.string().optional(),
  reason: z.string().min(1),
  notes: z.string().optional(),
  expiresAt: z.string().datetime().optional(),
});

const protectedObjectSchema = z.object({
  name: z.string().min(2).max(160),
  description: z.string().optional(),
  objectType: z.string(),
  zone: z.object({
    x: z.number().min(0).max(1),
    y: z.number().min(0).max(1),
    width: z.number().positive().max(1),
    height: z.number().positive().max(1),
  }).refine((zone) => zone.x + zone.width <= 1 && zone.y + zone.height <= 1, {
    message: "zone must remain inside the normalized camera frame",
  }),
  alertOnRemoval: z.boolean().default(true),
  alertSeverity: z.enum(["P1", "P2", "P3", "P4", "P5"]).default("P2"),
  removalThresholdSeconds: z.number().int().min(5).max(600).default(30),
});

const telemetryMetadataSchema = z.record(z.unknown()).default({});
const telemetryIngestSchema = z.object({
  sessionId: z.string().uuid(),
  timestamp: z.string().datetime(),
  events: z.array(z.object({
    category: z.string().trim().min(1).max(50),
    action: z.string().trim().min(1).max(100),
    label: z.string().max(255).optional(),
    value: z.number().finite().optional(),
    metadata: telemetryMetadataSchema,
    timestamp: z.string().datetime(),
  })).max(100).default([]),
  performance: z.array(z.object({
    name: z.string().trim().min(1).max(80),
    value: z.number().finite(),
    unit: z.enum(["ms", "bytes", "count", "percent"]),
    metadata: telemetryMetadataSchema,
    timestamp: z.string().datetime(),
  })).max(100).default([]),
  errors: z.array(z.object({
    error: z.string().min(1).max(2_000),
    context: z.string().max(255),
    severity: z.enum(["low", "medium", "high", "critical"]),
    metadata: telemetryMetadataSchema,
    timestamp: z.string().datetime(),
  })).max(100).default([]),
}).refine(
  (payload) => payload.events.length + payload.performance.length + payload.errors.length > 0,
  { message: "at least one telemetry item is required" },
);

const sensitiveTelemetryKey = /password|passcode|secret|token|credential|authorization|cookie|api.?key|private.?key|query|search.?term/i;

function sanitizeTelemetryMetadata(value: unknown, depth = 0): unknown {
  if (depth > 3) return "[truncated]";
  if (value === null || typeof value === "boolean" || typeof value === "number") return value;
  if (typeof value === "string") return value.slice(0, 250);
  if (Array.isArray(value)) return value.slice(0, 50).map((item) => sanitizeTelemetryMetadata(item, depth + 1));
  if (!value || typeof value !== "object") return String(value).slice(0, 250);

  const sanitized: Record<string, unknown> = {};
  for (const [key, item] of Object.entries(value).slice(0, 50)) {
    sanitized[key.slice(0, 100)] = sensitiveTelemetryKey.test(key)
      ? "[redacted]"
      : sanitizeTelemetryMetadata(item, depth + 1);
  }
  return sanitized;
}

export async function registerAnalyticsPhase2Routes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  if (!hasPool(store)) {
    app.log.info("Identity analytics is using the local in-process configuration store");
  }

  app.post("/api/v1/analytics", async (request, reply) => {
    const parsed = telemetryIngestSchema.safeParse(request.body);
    if (!parsed.success) return invalidInput(reply, parsed.error);

    const { sessionId, timestamp, events, performance, errors } = parsed.data;
    const entries = [
      ...events.map((event) => ({
        actionType: event.action,
        actionCategory: event.category,
        actionTarget: event.label ?? null,
        actionDescription: event.label ?? null,
        featureName: event.action,
        metadata: { ...sanitizeTelemetryMetadata(event.metadata) as Record<string, unknown>, value: event.value, eventTimestamp: event.timestamp, batchTimestamp: timestamp },
      })),
      ...performance.map((metric) => ({
        actionType: `performance.${metric.name}`,
        actionCategory: "performance",
        actionTarget: metric.name,
        actionDescription: `${metric.value} ${metric.unit}`,
        featureName: metric.name,
        metadata: { ...sanitizeTelemetryMetadata(metric.metadata) as Record<string, unknown>, value: metric.value, unit: metric.unit, eventTimestamp: metric.timestamp, batchTimestamp: timestamp },
      })),
      ...errors.map((error) => ({
        actionType: `error.${error.severity}`,
        actionCategory: "error",
        actionTarget: error.context || null,
        actionDescription: error.error.slice(0, 500),
        featureName: error.context || null,
        metadata: { ...sanitizeTelemetryMetadata(error.metadata) as Record<string, unknown>, severity: error.severity, eventTimestamp: error.timestamp, batchTimestamp: timestamp },
      })),
    ];

    await Promise.all(entries.map((entry) => store.logUserAction(
      request.currentUser.id,
      request.currentUser.tenantId,
      sessionId,
      null,
      entry.actionType,
      entry.actionCategory,
      entry.actionTarget,
      entry.actionDescription,
      "dashboard_telemetry",
      entry.featureName,
      entry.metadata,
    )));

    return reply.code(202).send({
      accepted: entries.length,
      receivedAt: new Date().toISOString(),
    });
  });

  /**
   * List face watchlists
   */
  app.get("/v1/analytics/face-watchlists", async (request, reply) => {
    if (!await hasTenantWideAccess(store, request.currentUser, "face:view")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    if (!hasPool(store)) {
      return {
        data: localState(store).faceWatchlists
          .filter((watchlist) => watchlist.tenantId === request.currentUser.tenantId && !watchlist.archivedAt)
          .sort((left, right) => left.name.localeCompare(right.name)),
      };
    }

    const watchlists = await store.db.query(
      `SELECT id, name, description, list_type, enabled, alert_on_match,
              alert_severity, created_at
       FROM face_watchlists
       WHERE tenant_id = $1 AND archived_at IS NULL
       ORDER BY name ASC`,
      [request.currentUser.tenantId],
    );

    return { data: watchlists.rows };
  });

  /**
   * Create face watchlist
   */
  app.post("/v1/analytics/face-watchlists", async (request, reply) => {
    if (!await hasTenantWideAccess(store, request.currentUser, "face:manage-watchlist")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsed = faceWatchlistSchema.safeParse(request.body);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const body = parsed.data;

    if (!hasPool(store)) {
      const watchlist = {
        id: randomUUID(), tenantId: request.currentUser.tenantId,
        name: body.name, description: body.description,
        listType: body.listType, enabled: true,
        alertOnMatch: body.alertOnMatch, alertSeverity: body.alertSeverity,
        createdBy: request.currentUser.id, createdAt: new Date().toISOString(),
      };
      localState(store).faceWatchlists.push(watchlist);
      await store.writeAudit({
        tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
        action: "face.watchlist_created", resourceNodeId: null, outcome: "success",
        details: { watchlistId: watchlist.id, listType: watchlist.listType },
      });
      return reply.code(201).send({ data: watchlist });
    }

    const result = await store.db.query(
      `INSERT INTO face_watchlists
        (tenant_id, name, description, list_type, alert_on_match,
         alert_severity, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, name, list_type, created_at`,
      [
        request.currentUser.tenantId,
        body.name,
        body.description,
        body.listType,
        body.alertOnMatch,
        body.alertSeverity,
        request.currentUser.id,
      ],
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
      action: "face.watchlist_created", resourceNodeId: null, outcome: "success",
      details: { watchlistId: result.rows[0]!.id, listType: body.listType },
    });
    return reply.code(201).send({ data: result.rows[0] });
  });

  /**
   * List persons in watchlist
   */
  app.get(
    "/v1/analytics/face-watchlists/:watchlistId/persons",
    async (request, reply) => {
      const parsedParams = z.object({ watchlistId: z.string().uuid() }).safeParse(request.params);
      if (!parsedParams.success) return invalidInput(reply, parsedParams.error);
      const { watchlistId } = parsedParams.data;

      if (!await hasTenantWideAccess(store, request.currentUser, "face:view")) {
        return reply.code(403).send({ error: "forbidden" });
      }

      if (!hasPool(store)) {
        const state = localState(store);
        const watchlist = state.faceWatchlists.find((item) =>
          item.id === watchlistId && item.tenantId === request.currentUser.tenantId && !item.archivedAt
        );
        if (!watchlist) return reply.code(404).send({ error: "face_watchlist_not_found" });
        return {
          data: state.facePersons
            .filter((person) => person.watchlistId === watchlistId && !person.archivedAt)
            .sort((left, right) => left.fullName.localeCompare(right.fullName)),
        };
      }

      const persons = await store.db.query(
        `SELECT p.id, p.external_id, p.full_name, p.date_of_birth, p.gender,
                p.notes, p.enrolled_at, p.last_seen_at, p.match_count,
                COUNT(e.id) as embedding_count
         FROM face_watchlist_persons p
         LEFT JOIN face_embeddings e ON e.person_id = p.id
         WHERE p.tenant_id = $1 AND p.watchlist_id = $2 AND p.archived_at IS NULL
         GROUP BY p.id
         ORDER BY p.full_name ASC`,
        [request.currentUser.tenantId, watchlistId],
      );

      return { data: persons.rows };
    },
  );

  /**
   * Enrol person in face watchlist
   */
  app.post(
    "/v1/analytics/face-watchlists/:watchlistId/persons",
    async (request, reply) => {
      const parsedParams = z.object({ watchlistId: z.string().uuid() }).safeParse(request.params);
      if (!parsedParams.success) return invalidInput(reply, parsedParams.error);
      const { watchlistId } = parsedParams.data;

      if (!await hasTenantWideAccess(store, request.currentUser, "face:enrol")) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const parsedBody = facePersonSchema.safeParse(request.body);
      if (!parsedBody.success) return invalidInput(reply, parsedBody.error);
      const body = parsedBody.data;

      if (!hasPool(store)) {
        const state = localState(store);
        const watchlist = state.faceWatchlists.find((item) =>
          item.id === watchlistId && item.tenantId === request.currentUser.tenantId && !item.archivedAt
        );
        if (!watchlist) return reply.code(404).send({ error: "face_watchlist_not_found" });
        const person = {
          id: randomUUID(), tenantId: request.currentUser.tenantId, watchlistId,
          externalId: body.externalId, fullName: body.fullName,
          dateOfBirth: body.dateOfBirth, gender: body.gender,
          notes: body.notes, metadata: body.metadata,
          enrolledBy: request.currentUser.id, enrolledAt: new Date().toISOString(),
          lastSeenAt: null, matchCount: 0, embeddingCount: 0,
        };
        state.facePersons.push(person);
        await store.writeAudit({
          tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
          action: "face.identity_enrolled", resourceNodeId: null, outcome: "success",
          details: { watchlistId, personId: person.id },
        });
        return reply.code(201).send({ data: person });
      }

      // TODO: Process face images and extract embeddings
      // This would typically involve:
      // 1. Upload face images
      // 2. Detect faces in images
      // 3. Extract face embeddings
      // 4. Store embeddings in face_embeddings table

      const result = await store.db.query(
        `INSERT INTO face_watchlist_persons
          (tenant_id, watchlist_id, external_id, full_name, date_of_birth,
           gender, notes, metadata, enrolled_by)
         SELECT $1, w.id, $3, $4, $5, $6, $7, $8, $9
         FROM face_watchlists w
         WHERE w.id = $2 AND w.tenant_id = $1 AND w.archived_at IS NULL
         RETURNING id, full_name, enrolled_at`,
        [
          request.currentUser.tenantId,
          watchlistId,
          body.externalId,
          body.fullName,
          body.dateOfBirth,
          body.gender,
          body.notes,
          body.metadata,
          request.currentUser.id,
        ],
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "face_watchlist_not_found" });
      await store.writeAudit({
        tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
        action: "face.identity_enrolled", resourceNodeId: null, outcome: "success",
        details: { watchlistId, personId: result.rows[0].id },
      });
      return reply.code(201).send({ data: result.rows[0] });
    },
  );

  /**
   * Search face recognition events
   */
  app.get("/v1/analytics/face-events", async (request, reply) => {
    const parsed = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        cameraId: z.string().trim().min(1).max(200).optional(),
        watchlistId: z.string().uuid().optional(),
        personId: z.string().uuid().optional(),
        minSimilarity: z.coerce.number().min(0).max(1).default(0.6),
        limit: z.coerce.number().int().min(1).max(1000).default(100),
      })
      .superRefine((value, context) => {
        if (value.from && value.to && value.from > value.to) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "to must be on or after from" });
        }
      })
      .safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const query = parsed.data;

    if (!await hasAnyAccess(store, request.currentUser, "face:view")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const permittedCameraIds = await accessibleCameraIds(store, request.currentUser, "face:view");
    if (query.cameraId && !permittedCameraIds.has(query.cameraId)) {
      return reply.code(404).send({ error: "camera_not_found_or_forbidden" });
    }
    const cameraIds = query.cameraId ? [query.cameraId] : [...permittedCameraIds];
    if (cameraIds.length === 0) return { data: [] };

    let specializedEvents: ReturnType<typeof normalizedFaceRow>[] = [];
    if (!hasPool(store)) {
      specializedEvents = localState(store).faceEvents
        .filter((event) => event.tenantId === request.currentUser.tenantId)
        .filter((event) => cameraIds.includes(event.cameraId))
        .filter((event) => event.similarityScore >= query.minSimilarity)
        .filter((event) => !query.from || event.occurredAt >= query.from)
        .filter((event) => !query.to || event.occurredAt <= query.to)
        .filter((event) => !query.watchlistId || event.watchlistId === query.watchlistId)
        .filter((event) => !query.personId || event.personId === query.personId)
        .map((event) => normalizedFaceRow(event));
    } else {
      const conditions = [
        "fe.tenant_id = $1",
        "fe.similarity_score >= $2",
        "fe.camera_id::text = ANY($3::text[])",
      ];
      const params: any[] = [request.currentUser.tenantId, query.minSimilarity, cameraIds];
      let paramIndex = 4;

      if (query.from) {
        conditions.push(`fe.occurred_at >= $${paramIndex++}`);
        params.push(query.from);
      }
      if (query.to) {
        conditions.push(`fe.occurred_at <= $${paramIndex++}`);
        params.push(query.to);
      }
      if (query.watchlistId) {
        conditions.push(`fe.watchlist_id = $${paramIndex++}`);
        params.push(query.watchlistId);
      }
      if (query.personId) {
        conditions.push(`fe.person_id = $${paramIndex++}`);
        params.push(query.personId);
      }

      const events = await store.db.query(
        `SELECT fe.id, fe.analytics_event_id, fe.camera_id, fe.watchlist_id, fe.person_id,
                fe.similarity_score, fe.face_quality, fe.age_estimate,
                fe.gender_estimate, fe.wearing_mask, fe.snapshot_reference,
                fe.occurred_at, p.full_name as person_name,
                w.name as watchlist_name, rn.name as camera_name
         FROM face_recognition_events fe
         LEFT JOIN face_watchlist_persons p ON p.id = fe.person_id
         LEFT JOIN face_watchlists w ON w.id = fe.watchlist_id
         LEFT JOIN cameras c ON c.id = fe.camera_id
         LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY fe.occurred_at DESC
         LIMIT $${paramIndex}`,
        [...params, query.limit],
      );
      specializedEvents = (events.rows as UnknownRecord[]).map(normalizedFaceRow);
    }

    const genericEvents = await genericFaceEvents(store, request.currentUser.tenantId, {
      cameraIds,
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.watchlistId ? { watchlistId: query.watchlistId } : {}),
      ...(query.personId ? { personId: query.personId } : {}),
      minSimilarity: query.minSimilarity,
    });
    const data = recentUniqueRows(specializedEvents as any[], genericEvents as any[], query.limit);

    await store.writeAudit({
      tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
      action: "face.events_searched", resourceNodeId: null, outcome: "success",
      details: { ...query, resultCount: data.length },
    });

    return { data };
  });

  // ==================== ANPR ====================

  /**
   * List ANPR watchlists
   */
  app.get("/v1/analytics/anpr-watchlists", async (request, reply) => {
    if (!await hasTenantWideAccess(store, request.currentUser, "anpr:view")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    if (!hasPool(store)) {
      return {
        data: localState(store).anprWatchlists
          .filter((watchlist) => watchlist.tenantId === request.currentUser.tenantId && !watchlist.archivedAt)
          .sort((left, right) => left.name.localeCompare(right.name)),
      };
    }

    const watchlists = await store.db.query(
      `SELECT id, name, description, list_type, enabled, alert_on_match,
              alert_severity, alert_authorities, created_at
       FROM anpr_watchlists
       WHERE tenant_id = $1 AND archived_at IS NULL
       ORDER BY name ASC`,
      [request.currentUser.tenantId],
    );

    return { data: watchlists.rows };
  });

  /**
   * Create ANPR watchlist
   */
  app.post("/v1/analytics/anpr-watchlists", async (request, reply) => {
    if (!await hasTenantWideAccess(store, request.currentUser, "anpr:manage-watchlist")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const parsed = anprWatchlistSchema.safeParse(request.body);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const body = parsed.data;

    if (!hasPool(store)) {
      const watchlist = {
        id: randomUUID(), tenantId: request.currentUser.tenantId,
        name: body.name, description: body.description,
        listType: body.listType, enabled: true,
        alertOnMatch: body.alertOnMatch, alertSeverity: body.alertSeverity,
        alertAuthorities: body.alertAuthorities,
        createdBy: request.currentUser.id, createdAt: new Date().toISOString(),
      };
      localState(store).anprWatchlists.push(watchlist);
      await store.writeAudit({
        tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
        action: "anpr.watchlist_created", resourceNodeId: null, outcome: "success",
        details: { watchlistId: watchlist.id, listType: watchlist.listType },
      });
      return reply.code(201).send({ data: watchlist });
    }

    const result = await store.db.query(
      `INSERT INTO anpr_watchlists
        (tenant_id, name, description, list_type, alert_on_match,
         alert_severity, alert_authorities, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, name, list_type, created_at`,
      [
        request.currentUser.tenantId,
        body.name,
        body.description,
        body.listType,
        body.alertOnMatch,
        body.alertSeverity,
        body.alertAuthorities,
        request.currentUser.id,
      ],
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
      action: "anpr.watchlist_created", resourceNodeId: null, outcome: "success",
      details: { watchlistId: result.rows[0]!.id, listType: body.listType },
    });
    return reply.code(201).send({ data: result.rows[0] });
  });

  /**
   * List plates in an ANPR watchlist
   */
  app.get(
    "/v1/analytics/anpr-watchlists/:watchlistId/plates",
    async (request, reply) => {
      const parsed = z.object({ watchlistId: z.string().uuid() }).safeParse(request.params);
      if (!parsed.success) return invalidInput(reply, parsed.error);
      const { watchlistId } = parsed.data;
      if (!await hasTenantWideAccess(store, request.currentUser, "anpr:view")) {
        return reply.code(403).send({ error: "forbidden" });
      }

      if (!hasPool(store)) {
        const state = localState(store);
        const watchlist = state.anprWatchlists.find((item) =>
          item.id === watchlistId && item.tenantId === request.currentUser.tenantId && !item.archivedAt
        );
        if (!watchlist) return reply.code(404).send({ error: "anpr_watchlist_not_found" });
        return {
          data: state.anprPlates
            .filter((plate) => plate.watchlistId === watchlistId && !plate.archivedAt)
            .sort((left, right) => left.plateNumber.localeCompare(right.plateNumber)),
        };
      }

      const watchlist = await store.db.query(
        `SELECT id FROM anpr_watchlists
         WHERE id = $1 AND tenant_id = $2 AND archived_at IS NULL`,
        [watchlistId, request.currentUser.tenantId],
      );
      if (!watchlist.rows[0]) return reply.code(404).send({ error: "anpr_watchlist_not_found" });
      const plates = await store.db.query(
        `SELECT id, plate_number, country_code, region_code, vehicle_make,
                vehicle_model, vehicle_color, vehicle_type, owner_name,
                reason, notes, expires_at, added_at, last_matched_at, match_count
         FROM anpr_watchlist_plates
         WHERE tenant_id = $1 AND watchlist_id = $2 AND archived_at IS NULL
         ORDER BY plate_number ASC`,
        [request.currentUser.tenantId, watchlistId],
      );
      return { data: plates.rows };
    },
  );

  /**
   * Add plate to watchlist
   */
  app.post(
    "/v1/analytics/anpr-watchlists/:watchlistId/plates",
    async (request, reply) => {
      const parsedParams = z.object({ watchlistId: z.string().uuid() }).safeParse(request.params);
      if (!parsedParams.success) return invalidInput(reply, parsedParams.error);
      const { watchlistId } = parsedParams.data;

      if (!await hasTenantWideAccess(store, request.currentUser, "anpr:manage-watchlist")) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const parsedBody = anprPlateSchema.safeParse(request.body);
      if (!parsedBody.success) return invalidInput(reply, parsedBody.error);
      const body = parsedBody.data;

      if (!hasPool(store)) {
        const state = localState(store);
        const watchlist = state.anprWatchlists.find((item) =>
          item.id === watchlistId && item.tenantId === request.currentUser.tenantId && !item.archivedAt
        );
        if (!watchlist) return reply.code(404).send({ error: "anpr_watchlist_not_found" });
        const plate = {
          id: randomUUID(), tenantId: request.currentUser.tenantId, watchlistId,
          plateNumber: body.plateNumber.toUpperCase(), countryCode: body.countryCode.toUpperCase(),
          regionCode: body.regionCode, vehicleMake: body.vehicleMake,
          vehicleModel: body.vehicleModel, vehicleColor: body.vehicleColor,
          vehicleType: body.vehicleType, ownerName: body.ownerName,
          reason: body.reason, notes: body.notes, expiresAt: body.expiresAt,
          addedBy: request.currentUser.id, addedAt: new Date().toISOString(),
          lastMatchedAt: null, matchCount: 0,
        };
        state.anprPlates.push(plate);
        await store.writeAudit({
          tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
          action: "anpr.plate_registered", resourceNodeId: null, outcome: "success",
          details: { watchlistId, plateId: plate.id },
        });
        return reply.code(201).send({ data: plate });
      }

      const result = await store.db.query(
        `INSERT INTO anpr_watchlist_plates
          (tenant_id, watchlist_id, plate_number, country_code, region_code,
           vehicle_make, vehicle_model, vehicle_color, vehicle_type,
           owner_name, reason, notes, expires_at, added_by)
         SELECT $1, w.id, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14
         FROM anpr_watchlists w
         WHERE w.id = $2 AND w.tenant_id = $1 AND w.archived_at IS NULL
         RETURNING id, plate_number, added_at`,
        [
          request.currentUser.tenantId,
          watchlistId,
          body.plateNumber.toUpperCase(),
          body.countryCode,
          body.regionCode,
          body.vehicleMake,
          body.vehicleModel,
          body.vehicleColor,
          body.vehicleType,
          body.ownerName,
          body.reason,
          body.notes,
          body.expiresAt,
          request.currentUser.id,
        ],
      );
      if (!result.rows[0]) return reply.code(404).send({ error: "anpr_watchlist_not_found" });
      await store.writeAudit({
        tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
        action: "anpr.plate_registered", resourceNodeId: null, outcome: "success",
        details: { watchlistId, plateId: result.rows[0].id },
      });
      return reply.code(201).send({ data: result.rows[0] });
    },
  );

  /**
   * Search ANPR events
   */
  app.get("/v1/analytics/anpr-events", async (request, reply) => {
    const parsed = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        cameraId: z.string().trim().min(1).max(200).optional(),
        plateNumber: z.string().optional(),
        watchlistId: z.string().uuid().optional(),
        entryDirection: z.enum(["entry", "exit", "unknown"]).optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(100),
        justification: z.string().optional(), // Required for searches in some jurisdictions
      })
      .superRefine((value, context) => {
        if (value.from && value.to && value.from > value.to) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "to must be on or after from" });
        }
      })
      .safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const query = parsed.data;

    if (!await hasAnyAccess(store, request.currentUser, "anpr:search")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const permittedCameraIds = await accessibleCameraIds(store, request.currentUser, "anpr:search");
    if (query.cameraId && !permittedCameraIds.has(query.cameraId)) {
      return reply.code(404).send({ error: "camera_not_found_or_forbidden" });
    }
    const cameraIds = query.cameraId ? [query.cameraId] : [...permittedCameraIds];
    if (cameraIds.length === 0) return { data: [] };

    let specializedEvents: ReturnType<typeof normalizedAnprRow>[] = [];
    if (!hasPool(store)) {
      const plateQuery = query.plateNumber?.toUpperCase();
      specializedEvents = localState(store).anprEvents
        .filter((event) => event.tenantId === request.currentUser.tenantId)
        .filter((event) => cameraIds.includes(event.cameraId))
        .filter((event) => !query.from || event.occurredAt >= query.from)
        .filter((event) => !query.to || event.occurredAt <= query.to)
        .filter((event) => !plateQuery || event.plateNumber.includes(plateQuery))
        .filter((event) => !query.watchlistId || event.watchlistId === query.watchlistId)
        .filter((event) => !query.entryDirection || event.entryDirection === query.entryDirection)
        .map((event) => normalizedAnprRow(event));
    } else {
      const conditions = ["ae.tenant_id = $1", "ae.camera_id::text = ANY($2::text[])"];
      const params: any[] = [request.currentUser.tenantId, cameraIds];
      let paramIndex = 3;

      if (query.from) {
        conditions.push(`ae.occurred_at >= $${paramIndex++}`);
        params.push(query.from);
      }
      if (query.to) {
        conditions.push(`ae.occurred_at <= $${paramIndex++}`);
        params.push(query.to);
      }
      if (query.plateNumber) {
        conditions.push(`ae.plate_number ILIKE $${paramIndex++}`);
        params.push(`%${query.plateNumber.toUpperCase()}%`);
      }
      if (query.watchlistId) {
        conditions.push(`ae.watchlist_id = $${paramIndex++}`);
        params.push(query.watchlistId);
      }
      if (query.entryDirection) {
        conditions.push(`ae.entry_direction = $${paramIndex++}`);
        params.push(query.entryDirection);
      }

      const events = await store.db.query(
        `SELECT ae.id, ae.analytics_event_id, ae.camera_id, ae.watchlist_id, ae.plate_id,
                ae.plate_number, ae.plate_confidence, ae.country_code, ae.region_code,
                ae.vehicle_type, ae.vehicle_color, ae.entry_direction,
                ae.snapshot_reference, ae.occurred_at,
                w.name as watchlist_name, wp.reason as watchlist_reason,
                rn.name as camera_name
         FROM anpr_events ae
         LEFT JOIN anpr_watchlist_plates wp ON wp.id = ae.plate_id
         LEFT JOIN anpr_watchlists w ON w.id = ae.watchlist_id
         LEFT JOIN cameras c ON c.id = ae.camera_id
         LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
         WHERE ${conditions.join(" AND ")}
         ORDER BY ae.occurred_at DESC
         LIMIT $${paramIndex}`,
        [...params, query.limit],
      );
      specializedEvents = (events.rows as UnknownRecord[]).map(normalizedAnprRow);
    }

    const genericEvents = await genericAnprEvents(store, request.currentUser.tenantId, {
      cameraIds,
      ...(query.from ? { from: query.from } : {}),
      ...(query.to ? { to: query.to } : {}),
      ...(query.plateNumber ? { plateNumber: query.plateNumber } : {}),
      ...(query.watchlistId ? { watchlistId: query.watchlistId } : {}),
      ...(query.entryDirection ? { entryDirection: query.entryDirection } : {}),
    });
    const data = recentUniqueRows(
      specializedEvents,
      genericEvents,
      query.limit,
      (event) => `${event.cameraId}:${normalizedPlate(event.plateNumber)}:${event.occurredAt}`,
    );

    await store.writeAudit({
      tenantId: request.currentUser.tenantId, actorUserId: request.currentUser.id,
      action: "anpr.events_searched", resourceNodeId: null, outcome: "success",
      details: { ...query, resultCount: data.length },
    });

    return { data };
  });

  /**
   * Get vehicle session (entry/exit pairing)
   */
  app.get(
    "/v1/analytics/anpr-sessions/:plateNumber",
    async (request, reply) => {
      const parsed = z.object({ plateNumber: z.string().trim().min(2).max(20) }).safeParse(request.params);
      if (!parsed.success) return invalidInput(reply, parsed.error);
      const { plateNumber } = parsed.data;

      if (!await hasAnyAccess(store, request.currentUser, "anpr:view")) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const cameraIds = [...await accessibleCameraIds(store, request.currentUser, "anpr:view")];
      if (cameraIds.length === 0) return { data: [] };

      if (!hasPool(store)) {
        const normalizedPlate = plateNumber.toUpperCase();
        return {
          data: localState(store).anprSessions
            .filter((session) => session.tenantId === request.currentUser.tenantId)
            .filter((session) => session.plateNumber.toUpperCase() === normalizedPlate)
            .filter((session) => cameraIds.includes(session.entryCameraId) || cameraIds.includes(session.exitCameraId))
            .sort((left, right) => right.entryAt.localeCompare(left.entryAt))
            .slice(0, 50),
        };
      }

      const sessions = await store.db.query(
        `SELECT vs.id, vs.plate_number, vs.entry_at, vs.exit_at,
                vs.duration_seconds, vs.status,
                rn_entry.name as entry_camera_name, rn_exit.name as exit_camera_name
         FROM anpr_vehicle_sessions vs
         LEFT JOIN cameras ec ON ec.id = vs.entry_camera_id
         LEFT JOIN resource_nodes rn_entry ON rn_entry.id = ec.resource_node_id
         LEFT JOIN cameras xc ON xc.id = vs.exit_camera_id
         LEFT JOIN resource_nodes rn_exit ON rn_exit.id = xc.resource_node_id
         WHERE vs.tenant_id = $1 AND vs.plate_number ILIKE $2
           AND (vs.entry_camera_id::text = ANY($3::text[])
             OR vs.exit_camera_id::text = ANY($3::text[]))
         ORDER BY vs.entry_at DESC
         LIMIT 50`,
        [request.currentUser.tenantId, plateNumber.toUpperCase(), cameraIds],
      );

      return { data: sessions.rows };
    },
  );

  // ==================== Protected Objects ====================

  /**
   * List protected objects for a camera
   */
  app.get(
    "/v1/cameras/:cameraId/protected-objects",
    async (request, reply) => {
      const parsed = z.object({ cameraId: z.string().trim().min(1).max(200) }).safeParse(request.params);
      if (!parsed.success) return invalidInput(reply, parsed.error);
      const { cameraId } = parsed.data;
      const authorization = await authorizeCamera(store, request.currentUser, cameraId, "analytics:view");
      if (!authorization.found) return reply.code(404).send({ error: "camera_not_found" });
      if (!authorization.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      if (!hasPool(store)) {
        return {
          data: localState(store).protectedObjects
            .filter((item) => item.tenantId === request.currentUser.tenantId && item.cameraId === cameraId && !item.archivedAt)
            .sort((left, right) => left.name.localeCompare(right.name)),
        };
      }

      const objects = await store.db.query(
        `SELECT id, name, description, object_type, zone, alert_on_removal,
                alert_severity, removal_threshold_seconds, created_at,
                last_verified_at
         FROM protected_objects
         WHERE tenant_id = $1 AND camera_id = $2 AND archived_at IS NULL
         ORDER BY name ASC`,
        [request.currentUser.tenantId, cameraId],
      );

      return { data: objects.rows };
    },
  );

  /**
   * Register protected object
   */
  app.post(
    "/v1/cameras/:cameraId/protected-objects",
    async (request, reply) => {
      const parsedParams = z.object({ cameraId: z.string().trim().min(1).max(200) }).safeParse(request.params);
      if (!parsedParams.success) return invalidInput(reply, parsedParams.error);
      const { cameraId } = parsedParams.data;
      const authorization = await authorizeCamera(store, request.currentUser, cameraId, "analytics:configure");
      if (!authorization.found) return reply.code(404).send({ error: "camera_not_found" });
      if (!authorization.allowed) {
        return reply.code(403).send({ error: "forbidden" });
      }

      const parsedBody = protectedObjectSchema.safeParse(request.body);
      if (!parsedBody.success) return invalidInput(reply, parsedBody.error);
      const body = parsedBody.data;

      if (!hasPool(store)) {
        const protectedObject = {
          id: randomUUID(), tenantId: request.currentUser.tenantId, cameraId,
          name: body.name, description: body.description, objectType: body.objectType,
          zone: body.zone, alertOnRemoval: body.alertOnRemoval,
          alertSeverity: body.alertSeverity,
          removalThresholdSeconds: body.removalThresholdSeconds,
          createdBy: request.currentUser.id, createdAt: new Date().toISOString(),
          lastVerifiedAt: new Date().toISOString(),
        };
        localState(store).protectedObjects.push(protectedObject);
        return reply.code(201).send({ data: protectedObject });
      }

      const result = await store.db.query(
        `INSERT INTO protected_objects
          (tenant_id, camera_id, name, description, object_type, zone,
           alert_on_removal, alert_severity, removal_threshold_seconds,
           created_by, last_verified_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, now())
         RETURNING id, name, created_at`,
        [
          request.currentUser.tenantId,
          cameraId,
          body.name,
          body.description,
          body.objectType,
          JSON.stringify(body.zone),
          body.alertOnRemoval,
          body.alertSeverity,
          body.removalThresholdSeconds,
          request.currentUser.id,
        ],
      );

      return reply.code(201).send({ data: result.rows[0] });
    },
  );

  /**
   * Get behavior events
   */
  app.get("/v1/analytics/behavior-events", async (request, reply) => {
    const parsed = z
      .object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
        cameraId: z.string().trim().min(1).max(200).optional(),
        behaviorType: z.string().optional(),
        limit: z.coerce.number().int().min(1).max(1000).default(100),
      })
      .superRefine((value, context) => {
        if (value.from && value.to && value.from > value.to) {
          context.addIssue({ code: z.ZodIssueCode.custom, path: ["to"], message: "to must be on or after from" });
        }
      })
      .safeParse(request.query);
    if (!parsed.success) return invalidInput(reply, parsed.error);
    const query = parsed.data;

    if (!await hasAnyAccess(store, request.currentUser, "behavior:view")) {
      return reply.code(403).send({ error: "forbidden" });
    }

    const permittedCameraIds = await accessibleCameraIds(store, request.currentUser, "behavior:view");
    if (query.cameraId && !permittedCameraIds.has(query.cameraId)) {
      return reply.code(404).send({ error: "camera_not_found_or_forbidden" });
    }
    const cameraIds = query.cameraId ? [query.cameraId] : [...permittedCameraIds];
    if (cameraIds.length === 0) return { data: [] };

    if (!hasPool(store)) {
      return {
        data: localState(store).behaviorEvents
          .filter((event) => event.tenantId === request.currentUser.tenantId)
          .filter((event) => cameraIds.includes(event.cameraId))
          .filter((event) => !query.from || event.occurredAt >= query.from)
          .filter((event) => !query.to || event.occurredAt <= query.to)
          .filter((event) => !query.behaviorType || event.behaviorType === query.behaviorType)
          .sort((left, right) => right.occurredAt.localeCompare(left.occurredAt))
          .slice(0, query.limit),
      };
    }

    const conditions = ["be.tenant_id = $1", "be.camera_id::text = ANY($2::text[])"];
    const params: any[] = [request.currentUser.tenantId, cameraIds];
    let paramIndex = 3;

    if (query.from) {
      conditions.push(`be.occurred_at >= $${paramIndex++}`);
      params.push(query.from);
    }
    if (query.to) {
      conditions.push(`be.occurred_at < $${paramIndex++}`);
      params.push(query.to);
    }
    if (query.cameraId && query.cameraId.trim() !== "") {
      conditions.push(`be.camera_id = $${paramIndex++}`);
      params.push(query.cameraId);
    }
    if (query.behaviorType) {
      conditions.push(`be.behavior_type = $${paramIndex++}`);
      params.push(query.behaviorType);
    }

    const events = await store.db.query(
      `SELECT be.id, be.camera_id, be.behavior_type, be.confidence,
              be.track_id, be.person_count, be.duration_seconds,
              be.speed_pixels_per_second, be.snapshot_reference,
              be.occurred_at, rn.name as camera_name
       FROM behavior_events be
       LEFT JOIN cameras c ON c.id = be.camera_id
       LEFT JOIN resource_nodes rn ON rn.id = c.resource_node_id
       WHERE ${conditions.join(" AND ")}
       ORDER BY be.occurred_at DESC
       LIMIT $${paramIndex}`,
      [...params, query.limit],
    );

    return { data: events.rows };
  });
}
