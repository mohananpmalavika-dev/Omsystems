import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";

type Queryable = { query: (text: string, values?: unknown[]) => Promise<{ rows: any[] }> };
type PoolLike = Queryable & { connect?: () => Promise<Queryable & { release?: () => void }> };

const areaTypeSchema = z.enum(["cash_counter", "locker"]);
const idSchema = z.string().uuid();
const managerRoles = new Set(["super_admin", "tenant_admin", "company_admin", "hq_admin", "zone_manager", "region_manager", "area_manager", "branch_manager", "security_officer", "branch_security_officer"]);

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
const assignmentSchema = z.object({
  branchId: idSchema,
  locationId: idSchema.optional(),
  areaType: areaTypeSchema,
  areaName: z.string().trim().min(1).max(160),
  authorizedPersonId: idSchema,
  effectiveDate: z.string().date().optional(),
  changeReason: z.string().trim().max(1000).optional(),
  replaceCurrent: z.boolean().default(true),
}).superRefine((value, ctx) => {
  if (value.areaType === "locker" && !value.changeReason) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ["changeReason"], message: "A locker authorization change reason is required" });
  }
});

function user(request: FastifyRequest, reply: FastifyReply) {
  const current = request.currentUser;
  if (!current?.tenantId || !current.id) {
    reply.code(401).send({ error: "unauthenticated" });
    return undefined;
  }
  if (!managerRoles.has(String(current.role ?? "").toLowerCase())) {
    reply.code(403).send({ error: "forbidden", message: "Secure-area authorization requires an authorized branch or security manager" });
    return undefined;
  }
  return current;
}

async function scopeExists(db: Queryable, tenantId: string, branchId: string, locationId?: string) {
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
}

function dbOrUnavailable(store: any, reply: FastifyReply): PoolLike | undefined {
  const pool = store?.pool ?? store?.db;
  if (!pool?.query) {
    reply.code(503).send({ error: "authorization_store_unavailable" });
    return undefined;
  }
  return pool;
}

export function registerSecureAreaAuthorizationRoutes(app: FastifyInstance, store: any) {
  app.get("/v1/secure-area-authorizations/persons", async (request, reply) => {
    const current = user(request, reply); if (!current) return;
    const db = dbOrUnavailable(store, reply); if (!db) return;
    const query = z.object({ branchId: idSchema, locationId: idSchema.optional(), active: z.coerce.boolean().default(true) }).parse(request.query);
    if (!await scopeExists(db, current.tenantId, query.branchId, query.locationId)) return reply.code(404).send({ error: "scope_not_found" });
    const result = await db.query(
      `SELECT id, branch_id AS "branchId", location_id AS "locationId", employee_code AS "employeeCode", full_name AS "fullName", designation, phone, email, active, created_at AS "createdAt"
       FROM secure_area_authorized_persons WHERE tenant_id = $1 AND branch_id = $2 AND ($3::uuid IS NULL OR location_id = $3) AND ($4 = false OR active = true) ORDER BY full_name`,
      [current.tenantId, query.branchId, query.locationId ?? null, query.active],
    );
    return { data: result.rows };
  });

  app.post("/v1/secure-area-authorizations/persons", async (request, reply) => {
    const current = user(request, reply); if (!current) return;
    const db = dbOrUnavailable(store, reply); if (!db) return;
    const body = personSchema.parse(request.body);
    if (!await scopeExists(db, current.tenantId, body.branchId, body.locationId)) return reply.code(404).send({ error: "scope_not_found" });
    const result = await db.query(
      `INSERT INTO secure_area_authorized_persons (tenant_id, branch_id, location_id, employee_code, full_name, designation, phone, email, face_person_id, created_by)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
       ON CONFLICT (tenant_id, branch_id, employee_code) DO UPDATE SET full_name = EXCLUDED.full_name, designation = EXCLUDED.designation, phone = EXCLUDED.phone, email = EXCLUDED.email, face_person_id = EXCLUDED.face_person_id, location_id = EXCLUDED.location_id, active = true, updated_at = now()
       RETURNING id, branch_id AS "branchId", location_id AS "locationId", employee_code AS "employeeCode", full_name AS "fullName", designation, phone, email, face_person_id AS "facePersonId", active`,
      [current.tenantId, body.branchId, body.locationId ?? null, body.employeeCode, body.fullName, body.designation ?? null, body.phone ?? null, body.email ?? null, body.facePersonId ?? null, current.id],
    );
    return reply.code(201).send({ data: result.rows[0] });
  });

  app.get("/v1/secure-area-authorizations", async (request, reply) => {
    const current = user(request, reply); if (!current) return;
    const db = dbOrUnavailable(store, reply); if (!db) return;
    const query = z.object({ branchId: idSchema, locationId: idSchema.optional(), areaType: areaTypeSchema.optional(), date: z.string().date().optional() }).parse(request.query);
    if (!await scopeExists(db, current.tenantId, query.branchId, query.locationId)) return reply.code(404).send({ error: "scope_not_found" });
    const date = query.date ?? new Date().toISOString().slice(0, 10);
    const result = await db.query(
      `SELECT a.id, a.area_type AS "areaType", a.area_name AS "areaName", a.effective_date AS "effectiveDate", a.effective_from AS "effectiveFrom", a.effective_until AS "effectiveUntil", a.change_reason AS "changeReason", p.id AS "personId", p.full_name AS "fullName", p.employee_code AS "employeeCode", p.designation
       FROM secure_area_authorizations a JOIN secure_area_authorized_persons p ON p.id = a.authorized_person_id
       WHERE a.tenant_id = $1 AND a.branch_id = $2 AND ($3::uuid IS NULL OR a.location_id = $3) AND ($4::text IS NULL OR a.area_type = $4) AND a.effective_from < ($5::date + interval '1 day') AND (a.effective_until IS NULL OR a.effective_until >= $5::date)
       ORDER BY a.area_type, a.area_name, a.effective_from DESC`,
      [current.tenantId, query.branchId, query.locationId ?? null, query.areaType ?? null, date],
    );
    return { data: result.rows };
  });

  app.post("/v1/secure-area-authorizations", async (request, reply) => {
    const current = user(request, reply); if (!current) return;
    const pool = dbOrUnavailable(store, reply); if (!pool) return;
    const body = assignmentSchema.parse(request.body);
    const client = pool.connect ? await pool.connect() : pool;
    try {
      await client.query("BEGIN");
      if (!await scopeExists(client, current.tenantId, body.branchId, body.locationId)) { await client.query("ROLLBACK"); return reply.code(404).send({ error: "scope_not_found" }); }
      const person = await client.query(`SELECT id FROM secure_area_authorized_persons WHERE id = $1 AND tenant_id = $2 AND branch_id = $3 AND active = true`, [body.authorizedPersonId, current.tenantId, body.branchId]);
      if (!person.rows[0]) { await client.query("ROLLBACK"); return reply.code(422).send({ error: "authorized_person_not_found" }); }
      const prior = await client.query(
        `SELECT id, authorized_person_id FROM secure_area_authorizations WHERE tenant_id = $1 AND branch_id = $2 AND location_id IS NOT DISTINCT FROM $3 AND area_type = $4 AND area_name = $5 AND effective_until IS NULL FOR UPDATE`,
        [current.tenantId, body.branchId, body.locationId ?? null, body.areaType, body.areaName],
      );
      if (body.replaceCurrent && prior.rows.length) await client.query(`UPDATE secure_area_authorizations SET effective_until = now() WHERE id = ANY($1::uuid[])`, [prior.rows.map((row) => row.id)]);
      const created = await client.query(
        `INSERT INTO secure_area_authorizations (tenant_id, branch_id, location_id, area_type, area_name, authorized_person_id, effective_date, change_reason, assigned_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id, area_type AS "areaType", area_name AS "areaName", effective_date AS "effectiveDate", effective_from AS "effectiveFrom"`,
        [current.tenantId, body.branchId, body.locationId ?? null, body.areaType, body.areaName, body.authorizedPersonId, body.effectiveDate ?? new Date().toISOString().slice(0, 10), body.changeReason ?? null, current.id],
      );
      let alertId: string | undefined;
      if (body.areaType === "locker" && prior.rows.some((row) => row.authorized_person_id !== body.authorizedPersonId)) {
        const alert = await client.query(
          `INSERT INTO locker_authorization_change_alerts (tenant_id, branch_id, location_id, locker_name, previous_authorization_id, new_authorization_id, changed_by, change_reason)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8) RETURNING id`,
          [current.tenantId, body.branchId, body.locationId ?? null, body.areaName, prior.rows[0].id, created.rows[0].id, current.id, body.changeReason],
        );
        alertId = alert.rows[0].id;
      }
      await client.query("COMMIT");
      return reply.code(201).send({ data: created.rows[0], lockerChangeAlertId: alertId });
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally { client.release?.(); }
  });

  app.get("/v1/secure-area-authorizations/reports/datewise", async (request, reply) => {
    const current = user(request, reply); if (!current) return;
    const db = dbOrUnavailable(store, reply); if (!db) return;
    const query = z.object({ branchId: idSchema, locationId: idSchema.optional(), from: z.string().date(), to: z.string().date() }).refine((v) => v.from <= v.to, { message: "from must not be after to" }).parse(request.query);
    if (!await scopeExists(db, current.tenantId, query.branchId, query.locationId)) return reply.code(404).send({ error: "scope_not_found" });
    const result = await db.query(
      `SELECT a.effective_date AS date, a.area_type AS "areaType", a.area_name AS "areaName", p.full_name AS "fullName", p.employee_code AS "employeeCode", p.designation, a.effective_from AS "effectiveFrom", a.effective_until AS "effectiveUntil", a.change_reason AS "changeReason"
       FROM secure_area_authorizations a JOIN secure_area_authorized_persons p ON p.id = a.authorized_person_id
       WHERE a.tenant_id = $1 AND a.branch_id = $2 AND ($3::uuid IS NULL OR a.location_id = $3) AND a.effective_date BETWEEN $4::date AND $5::date ORDER BY a.effective_date DESC, a.area_type, a.area_name`,
      [current.tenantId, query.branchId, query.locationId ?? null, query.from, query.to],
    );
    return { data: result.rows, report: { branchId: query.branchId, locationId: query.locationId ?? null, from: query.from, to: query.to, generatedAt: new Date().toISOString() } };
  });

  app.get("/v1/secure-area-authorizations/reports/locker-change-alerts", async (request, reply) => {
    const current = user(request, reply); if (!current) return;
    const db = dbOrUnavailable(store, reply); if (!db) return;
    const query = z.object({ branchId: idSchema, locationId: idSchema.optional(), from: z.string().date().optional(), to: z.string().date().optional() }).parse(request.query);
    if (!await scopeExists(db, current.tenantId, query.branchId, query.locationId)) return reply.code(404).send({ error: "scope_not_found" });
    const result = await db.query(
      `SELECT l.id, l.locker_name AS "lockerName", l.change_reason AS "changeReason", l.created_at AS "createdAt", l.acknowledged_at AS "acknowledgedAt", oldp.full_name AS "previousPerson", newp.full_name AS "newPerson"
       FROM locker_authorization_change_alerts l
       LEFT JOIN secure_area_authorizations olda ON olda.id = l.previous_authorization_id LEFT JOIN secure_area_authorized_persons oldp ON oldp.id = olda.authorized_person_id
       JOIN secure_area_authorizations newa ON newa.id = l.new_authorization_id JOIN secure_area_authorized_persons newp ON newp.id = newa.authorized_person_id
       WHERE l.tenant_id = $1 AND l.branch_id = $2 AND ($3::uuid IS NULL OR l.location_id = $3) AND ($4::date IS NULL OR l.created_at >= $4::date) AND ($5::date IS NULL OR l.created_at < ($5::date + interval '1 day')) ORDER BY l.created_at DESC`,
      [current.tenantId, query.branchId, query.locationId ?? null, query.from ?? null, query.to ?? null],
    );
    return { data: result.rows, report: { type: "locker_authorization_change_alert", generatedAt: new Date().toISOString() } };
  });
}
