import { randomUUID } from "node:crypto";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { activeFaceRegistryMatches, localIdentityState } from "../analytics/identity-registry.js";
import { createAfterHoursAuthorizationAlert } from "../security/secure-area-after-hours.service.js";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };
type PoolLike = Queryable & { connect?: () => Promise<Queryable & { release?: () => void }>; release?: () => void };

const areaTypeSchema = z.enum(["cash_counter", "locker"]);
const idSchema = z.string().uuid();
const managerRoles = new Set([
  "super_admin",
  "tenant_admin",
  "company_admin",
  "hq_admin",
  "zone_manager",
  "region_manager",
  "area_manager",
  "branch_manager",
  "security_officer",
  "branch_security_officer",
]);

const personSchema = z.object({
  branchId: idSchema,
  locationId: idSchema.optional(),
  employeeCode: z.string().trim().min(1).max(80),
  fullName: z.string().trim().min(2).max(160),
  designation: z.string().trim().max(120).optional(),
  phone: z.string().trim().max(32).optional(),
  email: z.string().trim().email().max(320).optional(),
  facePersonId: idSchema.optional(),
});

const assignmentSchema = z
  .object({
    branchId: idSchema,
    locationId: idSchema.optional(),
    areaType: areaTypeSchema,
    areaName: z.string().trim().min(1).max(160),
    authorizedPersonId: idSchema,
    effectiveDate: z.string().date().optional(),
    changeReason: z.string().trim().max(1000).optional(),
    replaceCurrent: z.boolean().default(true),
  })
  .superRefine((value, ctx) => {
    if (value.areaType === "locker" && !value.changeReason) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ["changeReason"],
        message: "A locker authorization change reason is required",
      });
    }
  });

const cameraMappingSchema = z.object({
  branchId: idSchema,
  locationId: idSchema.optional(),
  cameraId: z.string().trim().min(1).max(120),
  areaType: areaTypeSchema,
  areaName: z.string().trim().min(1).max(160),
  notes: z.string().trim().max(1000).optional(),
});

const cctvIdentifySchema = z.object({
  cameraId: z.string().trim().min(1),
  branchId: idSchema.optional(),
  locationId: idSchema.optional(),
  embedding: z.array(z.number()).optional(),
  facePersonId: idSchema.optional(),
  faceBbox: z
    .object({
      x: z.number(),
      y: z.number(),
      width: z.number(),
      height: z.number(),
    })
    .optional(),
  snapshotReference: z.string().optional(),
  detectedAt: z.string().optional(),
  similarityScore: z.number().min(0).max(1).optional(),
});

const enrollFaceSchema = z.object({
  photoBase64: z.string().optional(),
  embedding: z.array(z.number()).optional(),
  snapshotReference: z.string().optional(),
});

export type LocalSecureAreaState = {
  persons: any[];
  authorizations: any[];
  cameraMappings: any[];
  cctvEvents: any[];
  lockerAlerts: any[];
};

const localSecureAreaStates = new WeakMap<object, LocalSecureAreaState>();

export function getLocalSecureAreaState(store: any): LocalSecureAreaState {
  const key = store && typeof store === "object" ? store : localSecureAreaStates;
  let state = localSecureAreaStates.get(key);
  if (!state) {
    state = {
      persons: [],
      authorizations: [],
      cameraMappings: [],
      cctvEvents: [],
      lockerAlerts: [],
    };
    localSecureAreaStates.set(key, state);
  }
  return state;
}

function user(request: FastifyRequest, reply: FastifyReply) {
  const current = request.currentUser;
  if (!current?.tenantId || !current.id) {
    reply.code(401).send({ error: "unauthenticated" });
    return undefined;
  }
  if (!managerRoles.has(String(current.role ?? "").toLowerCase())) {
    reply.code(403).send({
      error: "forbidden",
      message: "Secure-area authorization requires an authorized branch or security manager",
    });
    return undefined;
  }
  return current;
}

function getDatabase(store: any): PoolLike | undefined {
  const pool = store?.pool ?? store?.db;
  if (pool?.query) return pool;
  return undefined;
}

async function scopeExists(db: Queryable | undefined, tenantId: string, branchId: string, locationId?: string) {
  if (!db?.query) return true;
  try {
    const nodes = await db.query(
      `WITH branch AS (
         SELECT id, path FROM resource_nodes WHERE tenant_id = $1 AND id = $2 AND is_active = true
       )
       SELECT branch.id FROM branch
       WHERE $3::uuid IS NULL OR EXISTS (
         SELECT 1 FROM resource_nodes location
         WHERE location.id = $3 AND location.tenant_id = $1 AND location.is_active = true AND location.path <@ branch.path
       )`,
      [tenantId, branchId, locationId ?? null],
    );
    return Boolean(nodes.rows[0]);
  } catch {
    return true;
  }
}

function generateMockEmbedding(seed: string): number[] {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash << 5) - hash + seed.charCodeAt(i);
    hash |= 0;
  }
  const vec: number[] = [];
  for (let i = 0; i < 128; i++) {
    const val = Math.sin(hash + i * 17.38);
    vec.push(val);
  }
  const norm = Math.sqrt(vec.reduce((sum, v) => sum + v * v, 0)) || 1;
  return vec.map((v) => Number((v / norm).toFixed(6)));
}

export function registerSecureAreaAuthorizationRoutes(app: FastifyInstance, store: any) {
  // ─── 1. PERSONS ─────────────────────────────────────────────────────────────

  app.get("/v1/secure-area-authorizations/persons", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const query = z
      .object({ branchId: idSchema, locationId: idSchema.optional(), active: z.coerce.boolean().default(true) })
      .parse(request.query);

    if (db) {
      if (!(await scopeExists(db, current.tenantId, query.branchId, query.locationId))) {
        return reply.code(404).send({ error: "scope_not_found" });
      }
      const result = await db.query(
        `SELECT id, branch_id AS "branchId", location_id AS "locationId", employee_code AS "employeeCode",
                full_name AS "fullName", designation, phone, email, face_person_id AS "facePersonId",
                active, created_at AS "createdAt"
         FROM secure_area_authorized_persons
         WHERE tenant_id = $1 AND branch_id = $2 AND ($3::uuid IS NULL OR location_id = $3) AND ($4 = false OR active = true)
         ORDER BY full_name`,
        [current.tenantId, query.branchId, query.locationId ?? null, query.active],
      );
      return { data: result.rows };
    }

    const state = getLocalSecureAreaState(store);
    const rows = state.persons.filter(
      (p) =>
        p.tenantId === current.tenantId &&
        p.branchId === query.branchId &&
        (!query.locationId || p.locationId === query.locationId) &&
        (!query.active || p.active !== false),
    );
    return { data: rows };
  });

  app.post("/v1/secure-area-authorizations/persons", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const body = personSchema.parse(request.body);

    if (db) {
      if (!(await scopeExists(db, current.tenantId, body.branchId, body.locationId))) {
        return reply.code(404).send({ error: "scope_not_found" });
      }
      const result = await db.query(
        `INSERT INTO secure_area_authorized_persons (tenant_id, branch_id, location_id, employee_code, full_name, designation, phone, email, face_person_id, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         ON CONFLICT (tenant_id, branch_id, employee_code) DO UPDATE SET
           full_name = EXCLUDED.full_name, designation = EXCLUDED.designation, phone = EXCLUDED.phone,
           email = EXCLUDED.email, face_person_id = EXCLUDED.face_person_id, location_id = EXCLUDED.location_id,
           active = true, updated_at = now()
         RETURNING id, branch_id AS "branchId", location_id AS "locationId", employee_code AS "employeeCode",
                   full_name AS "fullName", designation, phone, email, face_person_id AS "facePersonId", active`,
        [
          current.tenantId,
          body.branchId,
          body.locationId ?? null,
          body.employeeCode,
          body.fullName,
          body.designation ?? null,
          body.phone ?? null,
          body.email ?? null,
          body.facePersonId ?? null,
          current.id,
        ],
      );
      return reply.code(201).send({ data: result.rows[0] });
    }

    const state = getLocalSecureAreaState(store);
    let person = state.persons.find(
      (p) => p.tenantId === current.tenantId && p.branchId === body.branchId && p.employeeCode === body.employeeCode,
    );
    if (person) {
      person.fullName = body.fullName;
      person.designation = body.designation ?? person.designation;
      person.phone = body.phone ?? person.phone;
      person.email = body.email ?? person.email;
      if (body.facePersonId) person.facePersonId = body.facePersonId;
      person.active = true;
    } else {
      person = {
        id: randomUUID(),
        tenantId: current.tenantId,
        branchId: body.branchId,
        locationId: body.locationId ?? null,
        employeeCode: body.employeeCode,
        fullName: body.fullName,
        designation: body.designation ?? null,
        phone: body.phone ?? null,
        email: body.email ?? null,
        facePersonId: body.facePersonId ?? null,
        active: true,
        createdAt: new Date().toISOString(),
      };
      state.persons.push(person);
    }
    return reply.code(201).send({ data: person });
  });

  // ─── 2. FACE ENROLLMENT ─────────────────────────────────────────────────────

  app.post("/v1/secure-area-authorizations/persons/:id/enroll-face", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const params = z.object({ id: idSchema }).parse(request.params);
    const body = enrollFaceSchema.parse(request.body);
    const db = getDatabase(store);

    const facePersonId = randomUUID();
    const embedding = body.embedding ?? generateMockEmbedding(body.photoBase64 || params.id);

    if (db) {
      const personRes = await db.query(
        `SELECT id, full_name, employee_code FROM secure_area_authorized_persons WHERE id = $1 AND tenant_id = $2`,
        [params.id, current.tenantId],
      );
      if (!personRes.rows[0]) {
        return reply.code(404).send({ error: "person_not_found" });
      }

      await db.query(
        `UPDATE secure_area_authorized_persons SET face_person_id = $1, updated_at = now() WHERE id = $2`,
        [facePersonId, params.id],
      );

      // Register face in registry if table exists
      try {
        await db.query(
          `INSERT INTO face_watchlist_persons (id, tenant_id, full_name, notes, created_at, updated_at)
           VALUES ($1, $2, $3, $4, now(), now())
           ON CONFLICT (id) DO UPDATE SET full_name = EXCLUDED.full_name, updated_at = now()`,
          [facePersonId, current.tenantId, personRes.rows[0].full_name, `Employee ${personRes.rows[0].employee_code}`],
        );
      } catch {}

      return reply.code(200).send({
        data: {
          personId: params.id,
          facePersonId,
          enrolled: true,
          fullName: personRes.rows[0].full_name,
          employeeCode: personRes.rows[0].employee_code,
        },
      });
    }

    const state = getLocalSecureAreaState(store);
    const person = state.persons.find((p) => p.id === params.id && p.tenantId === current.tenantId);
    if (!person) {
      return reply.code(404).send({ error: "person_not_found" });
    }

    person.facePersonId = facePersonId;

    // Also register in identity state so CCTV face matching resolves immediately
    if (store) {
      const idState = localIdentityState(store);
      idState.facePersons.push({
        id: facePersonId,
        tenantId: current.tenantId,
        fullName: person.fullName,
        embedding,
        watchlistId: "bank-staff-authorized",
      });
      if (!idState.faceWatchlists.some((w) => w.id === "bank-staff-authorized")) {
        idState.faceWatchlists.push({
          id: "bank-staff-authorized",
          tenantId: current.tenantId,
          name: "Bank Staff Whitelist",
          listType: "whitelist",
          enabled: true,
          alertOnMatch: false,
        });
      }
    }

    return reply.code(200).send({
      data: {
        personId: params.id,
        facePersonId,
        enrolled: true,
        fullName: person.fullName,
        employeeCode: person.employeeCode,
      },
    });
  });

  // ─── 3. CAMERA MAPPINGS ─────────────────────────────────────────────────────

  app.get("/v1/secure-area-authorizations/camera-mappings", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const query = z
      .object({
        branchId: idSchema.optional(),
        locationId: idSchema.optional(),
        areaType: areaTypeSchema.optional(),
        cameraId: z.string().optional(),
      })
      .parse(request.query);

    if (db) {
      const result = await db.query(
        `SELECT id, branch_id AS "branchId", location_id AS "locationId", camera_id AS "cameraId",
                area_type AS "areaType", area_name AS "areaName", notes, created_at AS "createdAt", updated_at AS "updatedAt"
         FROM secure_area_camera_mappings
         WHERE tenant_id = $1
           AND ($2::uuid IS NULL OR branch_id = $2)
           AND ($3::uuid IS NULL OR location_id = $3)
           AND ($4::text IS NULL OR area_type = $4)
           AND ($5::text IS NULL OR camera_id = $5)
         ORDER BY area_type, area_name`,
        [current.tenantId, query.branchId ?? null, query.locationId ?? null, query.areaType ?? null, query.cameraId ?? null],
      );
      return { data: result.rows };
    }

    const state = getLocalSecureAreaState(store);
    const rows = state.cameraMappings.filter(
      (m) =>
        m.tenantId === current.tenantId &&
        (!query.branchId || m.branchId === query.branchId) &&
        (!query.locationId || m.locationId === query.locationId) &&
        (!query.areaType || m.areaType === query.areaType) &&
        (!query.cameraId || m.cameraId === query.cameraId),
    );
    return { data: rows };
  });

  app.post("/v1/secure-area-authorizations/camera-mappings", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const body = cameraMappingSchema.parse(request.body);

    if (db) {
      if (!(await scopeExists(db, current.tenantId, body.branchId, body.locationId))) {
        return reply.code(404).send({ error: "scope_not_found" });
      }
      const result = await db.query(
        `INSERT INTO secure_area_camera_mappings (tenant_id, branch_id, location_id, camera_id, area_type, area_name, notes, created_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
         ON CONFLICT (tenant_id, camera_id) DO UPDATE SET
           branch_id = EXCLUDED.branch_id, location_id = EXCLUDED.location_id,
           area_type = EXCLUDED.area_type, area_name = EXCLUDED.area_name,
           notes = EXCLUDED.notes, updated_at = now()
         RETURNING id, branch_id AS "branchId", location_id AS "locationId", camera_id AS "cameraId",
                   area_type AS "areaType", area_name AS "areaName", notes, created_at AS "createdAt", updated_at AS "updatedAt"`,
        [
          current.tenantId,
          body.branchId,
          body.locationId ?? null,
          body.cameraId,
          body.areaType,
          body.areaName,
          body.notes ?? null,
          current.id,
        ],
      );
      return reply.code(201).send({ data: result.rows[0] });
    }

    const state = getLocalSecureAreaState(store);
    let mapping = state.cameraMappings.find(
      (m) => m.tenantId === current.tenantId && m.cameraId === body.cameraId,
    );
    if (mapping) {
      mapping.branchId = body.branchId;
      mapping.locationId = body.locationId ?? null;
      mapping.areaType = body.areaType;
      mapping.areaName = body.areaName;
      mapping.notes = body.notes ?? null;
      mapping.updatedAt = new Date().toISOString();
    } else {
      mapping = {
        id: randomUUID(),
        tenantId: current.tenantId,
        branchId: body.branchId,
        locationId: body.locationId ?? null,
        cameraId: body.cameraId,
        areaType: body.areaType,
        areaName: body.areaName,
        notes: body.notes ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
      state.cameraMappings.push(mapping);
    }
    return reply.code(201).send({ data: mapping });
  });

  app.delete("/v1/secure-area-authorizations/camera-mappings/:id", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const params = z.object({ id: idSchema }).parse(request.params);
    const db = getDatabase(store);

    if (db) {
      await db.query(`DELETE FROM secure_area_camera_mappings WHERE tenant_id = $1 AND id = $2`, [
        current.tenantId,
        params.id,
      ]);
      return reply.code(204).send();
    }

    const state = getLocalSecureAreaState(store);
    const idx = state.cameraMappings.findIndex((m) => m.id === params.id && m.tenantId === current.tenantId);
    if (idx !== -1) {
      state.cameraMappings.splice(idx, 1);
    }
    return reply.code(204).send();
  });

  // ─── 4. CCTV IDENTIFICATION & VERIFICATION ─────────────────────────────────

  app.post("/v1/secure-area-authorizations/cctv-identify", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const body = cctvIdentifySchema.parse(request.body);
    const occurredAt = body.detectedAt ?? new Date().toISOString();

    // 1. Resolve camera mapping to high-security zone
    let mapping: any;
    if (db) {
      const res = await db.query(
        `SELECT id, branch_id AS "branchId", location_id AS "locationId", camera_id AS "cameraId",
                area_type AS "areaType", area_name AS "areaName"
         FROM secure_area_camera_mappings
         WHERE tenant_id = $1 AND camera_id = $2`,
        [current.tenantId, body.cameraId],
      );
      mapping = res.rows[0];
    } else {
      const state = getLocalSecureAreaState(store);
      mapping = state.cameraMappings.find(
        (m) => m.tenantId === current.tenantId && m.cameraId === body.cameraId,
      );
    }

    if (!mapping) {
      return reply.code(404).send({
        error: "camera_not_mapped",
        message: `Camera ${body.cameraId} is not mapped to any secure area (locker or cash counter).`,
      });
    }

    // 2. Resolve face identity if embedding provided
    let resolvedFacePersonId = body.facePersonId;
    let matchSimilarity = body.similarityScore ?? 0;
    let personName: string | null = null;
    let isWatchlistAlert = false;

    if (!resolvedFacePersonId && body.embedding && store) {
      try {
        const matches = await activeFaceRegistryMatches(store, current.tenantId, body.embedding, {
          minSimilarity: 0.7,
        });
        const topMatch = matches[0];
        if (topMatch) {
          resolvedFacePersonId = topMatch.personId;
          matchSimilarity = topMatch.similarity;
          personName = topMatch.personName;
          if (topMatch.listType === "watchlist" || topMatch.alertOnMatch) {
            isWatchlistAlert = true;
          }
        }
      } catch {}
    }

    // 3. Resolve person details from secure_area_authorized_persons
    let staffPerson: any = null;
    if (resolvedFacePersonId) {
      if (db) {
        const pRes = await db.query(
          `SELECT id, full_name AS "fullName", employee_code AS "employeeCode", designation, face_person_id AS "facePersonId"
           FROM secure_area_authorized_persons
           WHERE tenant_id = $1 AND branch_id = $2 AND (face_person_id = $3 OR id = $3) AND active = true`,
          [current.tenantId, mapping.branchId, resolvedFacePersonId],
        );
        staffPerson = pRes.rows[0] ?? null;
      } else {
        const state = getLocalSecureAreaState(store);
        staffPerson =
          state.persons.find(
            (p) =>
              p.tenantId === current.tenantId &&
              p.branchId === mapping.branchId &&
              (p.facePersonId === resolvedFacePersonId || p.id === resolvedFacePersonId) &&
              p.active !== false,
          ) ?? null;
      }
    }

    if (staffPerson) {
      personName = staffPerson.fullName;
    }

    // 4. Check Office Hours
    let schedule = { opens_at: "09:00", closes_at: "18:00", timezone: "Asia/Kolkata" };
    if (db) {
      try {
        const hours = await db.query(
          `SELECT opens_at, closes_at, timezone FROM secure_area_office_hours
           WHERE tenant_id = $1 AND branch_id = $2 AND location_id IS NOT DISTINCT FROM $3 AND enabled = true`,
          [current.tenantId, mapping.branchId, mapping.locationId ?? null],
        );
        if (hours.rows[0]) schedule = hours.rows[0];
      } catch {}
    }
    const clock = new Intl.DateTimeFormat("en-GB", {
      timeZone: schedule.timezone,
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).format(new Date(occurredAt));
    const opensAt = String(schedule.opens_at).slice(0, 5);
    const closesAt = String(schedule.closes_at).slice(0, 5);
    const outsideHours =
      opensAt < closesAt ? clock < opensAt || clock >= closesAt : clock >= closesAt && clock < opensAt;

    // 5. Evaluate Authorization Verdict
    let verdict: "authorized" | "unauthorized_staff" | "unauthorized_person" | "after_hours_breach" | "watchlist_alert";
    let severity: "INFO" | "P1" | "P2" | "P3";
    let alertTriggered = false;
    let notes: string;

    if (isWatchlistAlert) {
      verdict = "watchlist_alert";
      severity = "P1";
      alertTriggered = true;
      notes = `Blacklist / Security alert: Watchlist person detected at ${mapping.areaName} (${mapping.areaType})`;
    } else if (outsideHours) {
      verdict = "after_hours_breach";
      severity = mapping.areaType === "locker" ? "P1" : "P2";
      alertTriggered = true;
      notes = `After-hours breach: Detected at ${mapping.areaName} (${mapping.areaType}) outside operating hours (${opensAt}-${closesAt})`;

      if (db) {
        await createAfterHoursAuthorizationAlert(db, {
          tenantId: current.tenantId,
          branchId: mapping.branchId,
          locationId: mapping.locationId,
          cameraId: mapping.cameraId,
          areaType: mapping.areaType,
          areaName: mapping.areaName,
          facePersonId: resolvedFacePersonId,
          snapshotReference: body.snapshotReference,
          occurredAt,
        }).catch(() => undefined);
      }
    } else if (staffPerson) {
      // Staff detected: verify today's active authorization for THIS specific counter or locker
      let isAuthorizedForArea = false;
      if (db) {
        const authRes = await db.query(
          `SELECT a.id FROM secure_area_authorizations a
           WHERE a.tenant_id = $1 AND a.branch_id = $2 AND ($3::uuid IS NULL OR a.location_id = $3)
             AND a.area_type = $4 AND a.area_name = $5 AND a.authorized_person_id = $6
             AND a.effective_from <= $7::timestamptz AND (a.effective_until IS NULL OR a.effective_until >= $7::timestamptz)
           LIMIT 1`,
          [current.tenantId, mapping.branchId, mapping.locationId ?? null, mapping.areaType, mapping.areaName, staffPerson.id, occurredAt],
        );
        isAuthorizedForArea = Boolean(authRes.rows[0]);
      } else {
        const state = getLocalSecureAreaState(store);
        isAuthorizedForArea = state.authorizations.some(
          (a) =>
            a.tenantId === current.tenantId &&
            a.branchId === mapping.branchId &&
            a.areaType === mapping.areaType &&
            a.areaName === mapping.areaName &&
            a.authorizedPersonId === staffPerson.id &&
            (!a.effectiveUntil || a.effectiveUntil >= occurredAt),
        );
      }

      if (isAuthorizedForArea) {
        verdict = "authorized";
        severity = "INFO";
        alertTriggered = false;
        notes = `Authorized ${mapping.areaType === "cash_counter" ? "teller" : "locker custodian"} verified on duty: ${staffPerson.fullName} (${staffPerson.employeeCode})`;
      } else {
        verdict = "unauthorized_staff";
        severity = mapping.areaType === "locker" ? "P1" : "P2";
        alertTriggered = true;
        notes = `Unauthorized staff detected: ${staffPerson.fullName} (${staffPerson.employeeCode}) is an active employee but is NOT assigned to ${mapping.areaName}`;
      }
    } else {
      verdict = "unauthorized_person";
      severity = mapping.areaType === "locker" ? "P1" : "P2";
      alertTriggered = true;
      notes = `Unidentified person detected in secure zone ${mapping.areaName} (${mapping.areaType})`;
    }

    // 6. Record CCTV Event
    const eventId = randomUUID();
    if (db) {
      try {
        await db.query(
          `INSERT INTO secure_area_cctv_events
             (id, tenant_id, branch_id, location_id, camera_id, area_type, area_name, verdict, severity,
              face_person_id, person_name, employee_code, similarity_score, face_bbox, snapshot_reference,
              occurred_at, metadata)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)`,
          [
            eventId,
            current.tenantId,
            mapping.branchId,
            mapping.locationId ?? null,
            mapping.cameraId,
            mapping.areaType,
            mapping.areaName,
            verdict,
            severity,
            resolvedFacePersonId ?? null,
            personName ?? null,
            staffPerson?.employeeCode ?? null,
            matchSimilarity,
            body.faceBbox ? JSON.stringify(body.faceBbox) : null,
            body.snapshotReference ?? null,
            occurredAt,
            JSON.stringify({ notes, alertTriggered }),
          ],
        );
      } catch {}
    } else {
      const state = getLocalSecureAreaState(store);
      state.cctvEvents.unshift({
        id: eventId,
        tenantId: current.tenantId,
        branchId: mapping.branchId,
        locationId: mapping.locationId ?? null,
        cameraId: mapping.cameraId,
        areaType: mapping.areaType,
        areaName: mapping.areaName,
        verdict,
        severity,
        facePersonId: resolvedFacePersonId ?? null,
        personName: personName ?? null,
        employeeCode: staffPerson?.employeeCode ?? null,
        similarityScore: matchSimilarity,
        faceBbox: body.faceBbox ?? null,
        snapshotReference: body.snapshotReference ?? null,
        occurredAt,
        notes,
        alertTriggered,
        createdAt: new Date().toISOString(),
      });
    }

    return reply.code(200).send({
      data: {
        id: eventId,
        cameraId: mapping.cameraId,
        branchId: mapping.branchId,
        locationId: mapping.locationId,
        areaType: mapping.areaType,
        areaName: mapping.areaName,
        verdict,
        severity,
        alertTriggered,
        person: staffPerson
          ? {
              id: staffPerson.id,
              fullName: staffPerson.fullName,
              employeeCode: staffPerson.employeeCode,
              designation: staffPerson.designation,
              facePersonId: staffPerson.facePersonId,
            }
          : null,
        similarityScore: matchSimilarity,
        snapshotReference: body.snapshotReference ?? null,
        faceBbox: body.faceBbox ?? null,
        occurredAt,
        notes,
      },
    });
  });

  // ─── 5. CCTV EVENTS FEED ───────────────────────────────────────────────────

  app.get("/v1/secure-area-authorizations/cctv-events", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const query = z
      .object({
        branchId: idSchema.optional(),
        locationId: idSchema.optional(),
        areaType: areaTypeSchema.optional(),
        cameraId: z.string().optional(),
        verdict: z.string().optional(),
        alertsOnly: z.coerce.boolean().optional(),
        limit: z.coerce.number().min(1).max(200).default(50),
      })
      .parse(request.query);

    if (db) {
      const result = await db.query(
        `SELECT id, branch_id AS "branchId", location_id AS "locationId", camera_id AS "cameraId",
                area_type AS "areaType", area_name AS "areaName", verdict, severity,
                face_person_id AS "facePersonId", person_name AS "personName", employee_code AS "employeeCode",
                similarity_score::float AS "similarityScore", face_bbox AS "faceBbox",
                snapshot_reference AS "snapshotReference", occurred_at AS "occurredAt",
                metadata->>'notes' AS "notes", metadata->>'alertTriggered' AS "alertTriggered",
                created_at AS "createdAt"
         FROM secure_area_cctv_events
         WHERE tenant_id = $1
           AND ($2::uuid IS NULL OR branch_id = $2)
           AND ($3::uuid IS NULL OR location_id = $3)
           AND ($4::text IS NULL OR area_type = $4)
           AND ($5::text IS NULL OR camera_id = $5)
           AND ($6::text IS NULL OR verdict = $6)
           AND ($7::boolean IS NOT TRUE OR verdict != 'authorized')
         ORDER BY occurred_at DESC
         LIMIT $8`,
        [
          current.tenantId,
          query.branchId ?? null,
          query.locationId ?? null,
          query.areaType ?? null,
          query.cameraId ?? null,
          query.verdict ?? null,
          query.alertsOnly ?? false,
          query.limit,
        ],
      );
      return { data: result.rows };
    }

    const state = getLocalSecureAreaState(store);
    const rows = state.cctvEvents
      .filter(
        (e) =>
          e.tenantId === current.tenantId &&
          (!query.branchId || e.branchId === query.branchId) &&
          (!query.locationId || e.locationId === query.locationId) &&
          (!query.areaType || e.areaType === query.areaType) &&
          (!query.cameraId || e.cameraId === query.cameraId) &&
          (!query.verdict || e.verdict === query.verdict) &&
          (!query.alertsOnly || e.verdict !== "authorized"),
      )
      .slice(0, query.limit);
    return { data: rows };
  });

  // ─── 6. ASSIGNMENTS & AUTHORIZATIONS ───────────────────────────────────────

  app.get("/v1/secure-area-authorizations", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const query = z
      .object({
        branchId: idSchema,
        locationId: idSchema.optional(),
        areaType: areaTypeSchema.optional(),
        date: z.string().date().optional(),
      })
      .parse(request.query);

    const date = query.date ?? new Date().toISOString().slice(0, 10);

    if (db) {
      if (!(await scopeExists(db, current.tenantId, query.branchId, query.locationId))) {
        return reply.code(404).send({ error: "scope_not_found" });
      }
      const result = await db.query(
        `SELECT a.id, a.area_type AS "areaType", a.area_name AS "areaName", a.effective_date AS "effectiveDate",
                a.effective_from AS "effectiveFrom", a.effective_until AS "effectiveUntil", a.change_reason AS "changeReason",
                p.id AS "personId", p.full_name AS "fullName", p.employee_code AS "employeeCode", p.designation
         FROM secure_area_authorizations a
         JOIN secure_area_authorized_persons p ON p.id = a.authorized_person_id
         WHERE a.tenant_id = $1 AND a.branch_id = $2 AND ($3::uuid IS NULL OR a.location_id = $3)
           AND ($4::text IS NULL OR a.area_type = $4)
           AND a.effective_from < ($5::date + interval '1 day') AND (a.effective_until IS NULL OR a.effective_until >= $5::date)
         ORDER BY a.area_type, a.area_name, a.effective_from DESC`,
        [current.tenantId, query.branchId, query.locationId ?? null, query.areaType ?? null, date],
      );
      return { data: result.rows };
    }

    const state = getLocalSecureAreaState(store);
    const rows = state.authorizations
      .filter(
        (a) =>
          a.tenantId === current.tenantId &&
          a.branchId === query.branchId &&
          (!query.locationId || a.locationId === query.locationId) &&
          (!query.areaType || a.areaType === query.areaType) &&
          (!a.effectiveUntil || a.effectiveUntil >= date),
      )
      .map((a) => {
        const p = state.persons.find((p) => p.id === a.authorizedPersonId);
        return {
          id: a.id,
          areaType: a.areaType,
          areaName: a.areaName,
          effectiveDate: a.effectiveDate,
          effectiveFrom: a.effectiveFrom,
          effectiveUntil: a.effectiveUntil,
          changeReason: a.changeReason,
          personId: p?.id ?? a.authorizedPersonId,
          fullName: p?.fullName ?? "Unknown",
          employeeCode: p?.employeeCode ?? "UNKNOWN",
          designation: p?.designation ?? null,
        };
      });
    return { data: rows };
  });

  app.post("/v1/secure-area-authorizations", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const pool = getDatabase(store);
    const body = assignmentSchema.parse(request.body);

    if (pool) {
      const client = pool.connect ? await pool.connect() : pool;
      try {
        await client.query("BEGIN");
        if (!(await scopeExists(client, current.tenantId, body.branchId, body.locationId))) {
          await client.query("ROLLBACK");
          return reply.code(404).send({ error: "scope_not_found" });
        }
        const person = await client.query(
          `SELECT id FROM secure_area_authorized_persons WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND active = true`,
          [body.authorizedPersonId, current.tenantId, body.branchId],
        );
        if (!person.rows[0]) {
          await client.query("ROLLBACK");
          return reply.code(422).send({ error: "authorized_person_not_found" });
        }
        const prior = await client.query(
          `SELECT id, authorized_person_id FROM secure_area_authorizations
           WHERE tenant_id = $1 AND branch_id = $2 AND location_id IS NOT DISTINCT FROM $3
             AND area_type = $4 AND area_name = $5 AND effective_until IS NULL FOR UPDATE`,
          [current.tenantId, body.branchId, body.locationId ?? null, body.areaType, body.areaName],
        );
        if (body.replaceCurrent && prior.rows.length) {
          await client.query(
            `UPDATE secure_area_authorizations SET effective_until = now() WHERE id = ANY($1::uuid[])`,
            [prior.rows.map((row) => row.id)],
          );
        }
        const created = await client.query(
          `INSERT INTO secure_area_authorizations (tenant_id, branch_id, location_id, area_type, area_name, authorized_person_id, effective_date, change_reason, assigned_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           RETURNING id, area_type AS "areaType", area_name AS "areaName", effective_date AS "effectiveDate", effective_from AS "effectiveFrom"`,
          [
            current.tenantId,
            body.branchId,
            body.locationId ?? null,
            body.areaType,
            body.areaName,
            body.authorizedPersonId,
            body.effectiveDate ?? new Date().toISOString().slice(0, 10),
            body.changeReason ?? null,
            current.id,
          ],
        );
        let alertId: string | undefined;
        if (body.areaType === "locker" && prior.rows.some((row) => row.authorized_person_id !== body.authorizedPersonId)) {
          const alert = await client.query(
            `INSERT INTO locker_authorization_change_alerts (tenant_id, branch_id, location_id, locker_name, previous_authorization_id, new_authorization_id, changed_by, change_reason)
             VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
            [
              current.tenantId,
              body.branchId,
              body.locationId ?? null,
              body.areaName,
              prior.rows[0].id,
              created.rows[0].id,
              current.id,
              body.changeReason,
            ],
          );
          alertId = alert.rows[0].id;
        }
        await client.query("COMMIT");
        return reply.code(201).send({ data: created.rows[0], lockerChangeAlertId: alertId });
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        throw error;
      } finally {
        client.release?.();
      }
    }

    const state = getLocalSecureAreaState(store);
    const person = state.persons.find(
      (p) => p.id === body.authorizedPersonId && p.tenantId === current.tenantId && p.branchId === body.branchId,
    );
    if (!person) {
      return reply.code(422).send({ error: "authorized_person_not_found" });
    }

    const priorIndex = state.authorizations.findIndex(
      (a) =>
        a.tenantId === current.tenantId &&
        a.branchId === body.branchId &&
        a.areaType === body.areaType &&
        a.areaName === body.areaName &&
        !a.effectiveUntil,
    );

    let lockerAlertId: string | undefined;
    if (priorIndex !== -1 && body.replaceCurrent) {
      const prior = state.authorizations[priorIndex];
      prior.effectiveUntil = new Date().toISOString();
      if (body.areaType === "locker" && prior.authorizedPersonId !== body.authorizedPersonId) {
        lockerAlertId = randomUUID();
        state.lockerAlerts.push({
          id: lockerAlertId,
          tenantId: current.tenantId,
          branchId: body.branchId,
          locationId: body.locationId ?? null,
          lockerName: body.areaName,
          previousPerson: state.persons.find((p) => p.id === prior.authorizedPersonId)?.fullName ?? "Previous Custodian",
          newPerson: person.fullName,
          changeReason: body.changeReason,
          createdAt: new Date().toISOString(),
        });
      }
    }

    const createdAuth = {
      id: randomUUID(),
      tenantId: current.tenantId,
      branchId: body.branchId,
      locationId: body.locationId ?? null,
      areaType: body.areaType,
      areaName: body.areaName,
      authorizedPersonId: body.authorizedPersonId,
      effectiveDate: body.effectiveDate ?? new Date().toISOString().slice(0, 10),
      effectiveFrom: new Date().toISOString(),
      effectiveUntil: null,
      changeReason: body.changeReason ?? null,
      assignedBy: current.id,
    };
    state.authorizations.push(createdAuth);

    return reply.code(201).send({
      data: {
        id: createdAuth.id,
        areaType: createdAuth.areaType,
        areaName: createdAuth.areaName,
        effectiveDate: createdAuth.effectiveDate,
        effectiveFrom: createdAuth.effectiveFrom,
      },
      lockerChangeAlertId: lockerAlertId,
    });
  });

  // ─── 7. REPORTS ────────────────────────────────────────────────────────────

  app.get("/v1/secure-area-authorizations/reports/datewise", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const query = z
      .object({ branchId: idSchema, locationId: idSchema.optional(), from: z.string().date(), to: z.string().date() })
      .refine((v) => v.from <= v.to, { message: "from must not be after to" })
      .parse(request.query);

    if (db) {
      if (!(await scopeExists(db, current.tenantId, query.branchId, query.locationId))) {
        return reply.code(404).send({ error: "scope_not_found" });
      }
      const result = await db.query(
        `SELECT a.effective_date AS date, a.area_type AS "areaType", a.area_name AS "areaName",
                p.full_name AS "fullName", p.employee_code AS "employeeCode", p.designation,
                a.effective_from AS "effectiveFrom", a.effective_until AS "effectiveUntil", a.change_reason AS "changeReason"
         FROM secure_area_authorizations a
         JOIN secure_area_authorized_persons p ON p.id = a.authorized_person_id
         WHERE a.tenant_id = $1 AND a.branch_id = $2 AND ($3::uuid IS NULL OR a.location_id = $3)
           AND a.effective_date BETWEEN $4::date AND $5::date
         ORDER BY a.effective_date DESC, a.area_type, a.area_name`,
        [current.tenantId, query.branchId, query.locationId ?? null, query.from, query.to],
      );
      return {
        data: result.rows,
        report: { branchId: query.branchId, locationId: query.locationId ?? null, from: query.from, to: query.to, generatedAt: new Date().toISOString() },
      };
    }

    const state = getLocalSecureAreaState(store);
    const rows = state.authorizations
      .filter(
        (a) =>
          a.tenantId === current.tenantId &&
          a.branchId === query.branchId &&
          (!query.locationId || a.locationId === query.locationId) &&
          a.effectiveDate >= query.from &&
          a.effectiveDate <= query.to,
      )
      .map((a) => {
        const p = state.persons.find((p) => p.id === a.authorizedPersonId);
        return {
          date: a.effectiveDate,
          areaType: a.areaType,
          areaName: a.areaName,
          fullName: p?.fullName ?? "Unknown",
          employeeCode: p?.employeeCode ?? "UNKNOWN",
          designation: p?.designation ?? null,
          effectiveFrom: a.effectiveFrom,
          effectiveUntil: a.effectiveUntil,
          changeReason: a.changeReason,
        };
      });
    return {
      data: rows,
      report: { branchId: query.branchId, locationId: query.locationId ?? null, from: query.from, to: query.to, generatedAt: new Date().toISOString() },
    };
  });

  app.get("/v1/secure-area-authorizations/reports/locker-change-alerts", async (request, reply) => {
    const current = user(request, reply);
    if (!current) return;
    const db = getDatabase(store);
    const query = z
      .object({ branchId: idSchema, locationId: idSchema.optional(), from: z.string().date().optional(), to: z.string().date().optional() })
      .parse(request.query);

    if (db) {
      if (!(await scopeExists(db, current.tenantId, query.branchId, query.locationId))) {
        return reply.code(404).send({ error: "scope_not_found" });
      }
      const result = await db.query(
        `SELECT l.id, l.locker_name AS "lockerName", l.change_reason AS "changeReason",
                l.created_at AS "createdAt", l.acknowledged_at AS "acknowledgedAt",
                oldp.full_name AS "previousPerson", newp.full_name AS "newPerson"
         FROM locker_authorization_change_alerts l
         LEFT JOIN secure_area_authorizations olda ON olda.id = l.previous_authorization_id
         LEFT JOIN secure_area_authorized_persons oldp ON oldp.id = olda.authorized_person_id
         JOIN secure_area_authorizations newa ON newa.id = l.new_authorization_id
         JOIN secure_area_authorized_persons newp ON newp.id = newa.authorized_person_id
         WHERE l.tenant_id = $1 AND l.branch_id = $2 AND ($3::uuid IS NULL OR l.location_id = $3)
           AND ($4::date IS NULL OR l.created_at >= $4::date)
           AND ($5::date IS NULL OR l.created_at < ($5::date + interval '1 day'))
         ORDER BY l.created_at DESC`,
        [current.tenantId, query.branchId, query.locationId ?? null, query.from ?? null, query.to ?? null],
      );
      return { data: result.rows, report: { type: "locker_authorization_change_alert", generatedAt: new Date().toISOString() } };
    }

    const state = getLocalSecureAreaState(store);
    const rows = state.lockerAlerts.filter(
      (l) => l.tenantId === current.tenantId && l.branchId === query.branchId && (!query.locationId || l.locationId === query.locationId),
    );
    return { data: rows, report: { type: "locker_authorization_change_alert", generatedAt: new Date().toISOString() } };
  });
}
