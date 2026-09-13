type Database = { query: (sql: string, values?: unknown[]) => Promise<{ rows: any[] }> };

export async function createAfterHoursAuthorizationAlert(db: Database, input: {
  tenantId: string; branchId: string; locationId?: string; cameraId: string; areaType: "cash_counter" | "locker"; areaName: string;
  facePersonId?: string; faceEventId?: string; snapshotReference?: string; occurredAt: string;
}) {
  const hours = await db.query(
    `SELECT opens_at, closes_at, timezone FROM secure_area_office_hours
     WHERE tenant_id = $1 AND branch_id = $2 AND location_id IS NOT DISTINCT FROM $3 AND enabled = true`,
    [input.tenantId, input.branchId, input.locationId ?? null],
  );
  const schedule = hours.rows[0] ?? { opens_at: "09:00", closes_at: "18:00", timezone: "Asia/Kolkata" };
  const clock = new Intl.DateTimeFormat("en-GB", { timeZone: schedule.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(new Date(input.occurredAt));
  const opensAt = String(schedule.opens_at).slice(0, 5);
  const closesAt = String(schedule.closes_at).slice(0, 5);
  const outsideHours = opensAt < closesAt
    ? clock < opensAt || clock >= closesAt
    : clock >= closesAt && clock < opensAt;
  if (!outsideHours) return { alerted: false, reason: "within_office_hours" };

  const authorized = input.facePersonId ? await db.query(
    `SELECT 1 FROM secure_area_authorizations a JOIN secure_area_authorized_persons p ON p.id = a.authorized_person_id
     WHERE a.tenant_id = $1 AND a.branch_id = $2 AND a.location_id IS NOT DISTINCT FROM $3 AND a.area_type = $4 AND a.area_name = $5
       AND p.face_person_id = $6 AND p.active = true AND a.effective_from <= $7 AND (a.effective_until IS NULL OR a.effective_until >= $7) LIMIT 1`,
    [input.tenantId, input.branchId, input.locationId ?? null, input.areaType, input.areaName, input.facePersonId, input.occurredAt],
  ) : { rows: [] };
  if (authorized.rows.length) return { alerted: false, reason: "registered_authorized_person" };

  const duplicate = await db.query(
    `SELECT id FROM secure_area_after_hours_alerts WHERE camera_id = $1 AND area_type = $2 AND area_name = $3
       AND face_person_id IS NOT DISTINCT FROM $4 AND occurred_at > $5::timestamptz - interval '5 minutes' LIMIT 1`,
    [input.cameraId, input.areaType, input.areaName, input.facePersonId ?? null, input.occurredAt],
  );
  if (duplicate.rows[0]) return { alerted: false, reason: "deduplicated", alertId: duplicate.rows[0].id };
  const severity = input.areaType === "locker" ? "P1" : "P2";
  const created = await db.query(
    `INSERT INTO secure_area_after_hours_alerts (tenant_id, branch_id, location_id, camera_id, area_type, area_name, face_person_id, face_event_id, severity, snapshot_reference, occurred_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id, severity, status`,
    [input.tenantId, input.branchId, input.locationId ?? null, input.cameraId, input.areaType, input.areaName, input.facePersonId ?? null, input.faceEventId ?? null, severity, input.snapshotReference ?? null, input.occurredAt],
  );
  return { alerted: true, alert: created.rows[0] };
}
