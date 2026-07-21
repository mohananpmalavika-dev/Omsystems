import { randomUUID } from "node:crypto";
import type { Pool } from "pg";
import type {
  AmcContractInput,
  AmcContractUpdate,
  MaintenanceAssetInput,
  MaintenanceAssetUpdate,
  MaintenanceVendorInput,
  MaintenanceVendorUpdate,
  WorkOrderInput,
  WorkOrderUpdate,
} from "../control-plane-store.js";
import type {
  AmcContract,
  MaintenanceAsset,
  MaintenanceVendor,
  WorkOrder,
} from "../domain/models.js";

type JsonRecord = Record<string, unknown>;

function camelKey(key: string) {
  return key.replace(/_([a-z])/g, (_match, letter: string) => letter.toUpperCase());
}

function camelRow<T = JsonRecord>(row: JsonRecord): T {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      camelKey(key),
      value instanceof Date ? value.toISOString() : value,
    ]),
  ) as T;
}

function camelRows<T = JsonRecord>(rows: JsonRecord[]): T[] {
  return rows.map((row) => camelRow<T>(row));
}

function buildUpdateStatement(values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  const assignments = entries.map(([key], index) => `${key} = $${index + 2}`);
  const params = entries.map(([, value]) => value);
  return { assignments, params };
}

export class MaintenanceRepository {
  constructor(private readonly pool: Pool) {}

  async listAssets(tenantId: string, category?: string) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_assets
       WHERE tenant_id=$1
         AND ($2::text IS NULL OR category=$2)
       ORDER BY created_at DESC`,
      [tenantId, category ?? null],
    );
    return camelRows<MaintenanceAsset>(result.rows);
  }

  async getAsset(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_assets WHERE id=$1`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<MaintenanceAsset>(result.rows[0]);
  }

  async createAsset(input: MaintenanceAssetInput) {
    const result = await this.pool.query(
      `INSERT INTO maintenance_assets (
         id, tenant_id, category, asset_type, serial_number,
         make, model, firmware_version, warranty_expires_at,
         purchase_date, installation_date, vendor_id,
         branch_node_id, location, mounting_height, status,
         notes, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.category,
        input.assetType,
        input.serialNumber ?? null,
        input.make ?? null,
        input.model ?? null,
        input.firmwareVersion ?? null,
        input.warrantyExpiresAt ?? null,
        input.purchaseDate ?? null,
        input.installationDate ?? null,
        input.vendorId ?? null,
        input.branchNodeId ?? null,
        input.location ?? null,
        input.mountingHeight ?? null,
        input.status ?? "operational",
        input.notes ?? null,
        input.createdBy ?? null,
      ],
    );
    return camelRow<MaintenanceAsset>(result.rows[0]);
  }

  async updateAsset(id: string, input: MaintenanceAssetUpdate) {
    const values: Record<string, unknown> = {
      tenant_id: input.tenantId,
      category: input.category,
      asset_type: input.assetType,
      serial_number: input.serialNumber,
      make: input.make,
      model: input.model,
      firmware_version: input.firmwareVersion,
      warranty_expires_at: input.warrantyExpiresAt,
      purchase_date: input.purchaseDate,
      installation_date: input.installationDate,
      vendor_id: input.vendorId,
      branch_node_id: input.branchNodeId,
      location: input.location,
      mounting_height: input.mountingHeight,
      status: input.status,
      notes: input.notes,
      created_by: input.createdBy,
    };
    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getAsset(id);
    const result = await this.pool.query(
      `UPDATE maintenance_assets SET ${assignments.join(", ")}, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<MaintenanceAsset>(result.rows[0]);
  }

  async listWorkOrders(tenantId: string, status?: string) {
    const result = await this.pool.query(
      `SELECT * FROM work_orders
       WHERE tenant_id=$1
         AND ($2::text IS NULL OR status=$2)
       ORDER BY created_at DESC`,
      [tenantId, status ?? null],
    );
    return camelRows<WorkOrder>(result.rows);
  }

  async getWorkOrder(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM work_orders WHERE id=$1`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<WorkOrder>(result.rows[0]);
  }

  async createWorkOrder(input: WorkOrderInput) {
    const result = await this.pool.query(
      `INSERT INTO work_orders (
         id, tenant_id, work_order_number, asset_id, branch_node_id,
         problem, severity, technician, vendor_id, sla_due_at, eta,
         parts, cost, root_cause, action_taken, verification,
         status, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.workOrderNumber,
        input.assetId ?? null,
        input.branchNodeId ?? null,
        input.problem,
        input.severity,
        input.technician ?? null,
        input.vendorId ?? null,
        input.slaDueAt ?? null,
        input.eta ?? null,
        input.parts ? JSON.stringify(input.parts) : null,
        input.cost ?? null,
        input.rootCause ?? null,
        input.actionTaken ?? null,
        input.verification ?? null,
        input.status ?? "open",
        input.createdBy ?? null,
      ],
    );
    return camelRow<WorkOrder>(result.rows[0]);
  }

  async updateWorkOrder(id: string, input: WorkOrderUpdate) {
    const values: Record<string, unknown> = {
      tenant_id: input.tenantId,
      work_order_number: input.workOrderNumber,
      asset_id: input.assetId,
      branch_node_id: input.branchNodeId,
      problem: input.problem,
      severity: input.severity,
      technician: input.technician,
      vendor_id: input.vendorId,
      sla_due_at: input.slaDueAt,
      eta: input.eta,
      parts: input.parts ? JSON.stringify(input.parts) : undefined,
      cost: input.cost,
      root_cause: input.rootCause,
      action_taken: input.actionTaken,
      verification: input.verification,
      status: input.status,
      created_by: input.createdBy,
    };
    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getWorkOrder(id);
    const result = await this.pool.query(
      `UPDATE work_orders SET ${assignments.join(", ")}, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<WorkOrder>(result.rows[0]);
  }

  async listMaintenanceVendors(tenantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_vendors WHERE tenant_id=$1 ORDER BY name`,
      [tenantId],
    );
    return camelRows<MaintenanceVendor>(result.rows);
  }

  async getMaintenanceVendor(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_vendors WHERE id=$1`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<MaintenanceVendor>(result.rows[0]);
  }

  async createMaintenanceVendor(input: MaintenanceVendorInput) {
    const result = await this.pool.query(
      `INSERT INTO maintenance_vendors (
         id, tenant_id, name, contact, email, phone,
         address, gst_number, service_centers,
         escalation_matrix, notes, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.name,
        input.contact ?? null,
        input.email ?? null,
        input.phone ?? null,
        input.address ?? null,
        input.gstNumber ?? null,
        input.serviceCenters ? JSON.stringify(input.serviceCenters) : null,
        input.escalationMatrix ? JSON.stringify(input.escalationMatrix) : null,
        input.notes ?? null,
        input.createdBy ?? null,
      ],
    );
    return camelRow<MaintenanceVendor>(result.rows[0]);
  }

  async updateMaintenanceVendor(id: string, input: MaintenanceVendorUpdate) {
    const values: Record<string, unknown> = {
      tenant_id: input.tenantId,
      name: input.name,
      contact: input.contact,
      email: input.email,
      phone: input.phone,
      address: input.address,
      gst_number: input.gstNumber,
      service_centers: input.serviceCenters ? JSON.stringify(input.serviceCenters) : undefined,
      escalation_matrix: input.escalationMatrix ? JSON.stringify(input.escalationMatrix) : undefined,
      notes: input.notes,
      created_by: input.createdBy,
    };
    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getMaintenanceVendor(id);
    const result = await this.pool.query(
      `UPDATE maintenance_vendors SET ${assignments.join(", ")}, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<MaintenanceVendor>(result.rows[0]);
  }

  async listAmcContracts(tenantId: string, vendorId?: string) {
    const result = await this.pool.query(
      `SELECT * FROM amc_contracts
       WHERE tenant_id=$1
         AND ($2::uuid IS NULL OR vendor_id=$2)
       ORDER BY start_date DESC`,
      [tenantId, vendorId ?? null],
    );
    return camelRows<AmcContract>(result.rows);
  }

  async getAmcContract(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM amc_contracts WHERE id=$1`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<AmcContract>(result.rows[0]);
  }

  async createAmcContract(input: AmcContractInput) {
    const result = await this.pool.query(
      `INSERT INTO amc_contracts (
         id, tenant_id, contract_number, vendor_id, start_date,
         end_date, warranty, coverage, exclusions,
         payment_terms, cost, renewal, sla, status,
         notes, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.contractNumber,
        input.vendorId,
        input.startDate,
        input.endDate,
        input.warranty ?? null,
        input.coverage ?? null,
        input.exclusions ?? null,
        input.paymentTerms ?? null,
        input.cost ?? null,
        input.renewal ?? null,
        input.sla ?? null,
        input.status ?? "active",
        input.notes ?? null,
        input.createdBy ?? null,
      ],
    );
    return camelRow<AmcContract>(result.rows[0]);
  }

  async updateAmcContract(id: string, input: AmcContractUpdate) {
    const values: Record<string, unknown> = {
      tenant_id: input.tenantId,
      contract_number: input.contractNumber,
      vendor_id: input.vendorId,
      start_date: input.startDate,
      end_date: input.endDate,
      warranty: input.warranty,
      coverage: input.coverage,
      exclusions: input.exclusions,
      payment_terms: input.paymentTerms,
      cost: input.cost,
      renewal: input.renewal,
      sla: input.sla,
      status: input.status,
      notes: input.notes,
      created_by: input.createdBy,
    };
    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.getAmcContract(id);
    const result = await this.pool.query(
      `UPDATE amc_contracts SET ${assignments.join(", ")}, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<AmcContract>(result.rows[0]);
  }

  async createMaintenancePlan(input: { tenantId: string; name: string; cadence: string; checklistTemplate?: Record<string, unknown>; startDate?: string; endDate?: string; createdBy: string; }) {
    const result = await this.pool.query(
      `INSERT INTO maintenance_plans (
         id, tenant_id, name, cadence, checklist_template,
         start_date, end_date, status, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.name,
        input.cadence,
        input.checklistTemplate ? JSON.stringify(input.checklistTemplate) : null,
        input.startDate ?? null,
        input.endDate ?? null,
        input.createdBy,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async listMaintenancePlans(tenantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_plans WHERE tenant_id=$1 ORDER BY created_at DESC`,
      [tenantId],
    );
    return camelRows<any>(result.rows);
  }

  async getMaintenancePlan(id: string) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_plans WHERE id=$1`,
      [id],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<any>(result.rows[0]);
  }

  async createMaintenanceSchedule(input: { tenantId: string; planId: string; branchNodeId?: string; assetId?: string; nextRunAt: string; cadence: string; createdBy: string; }) {
    const result = await this.pool.query(
      `INSERT INTO maintenance_schedules (
         id, tenant_id, plan_id, branch_node_id, asset_id,
         next_run_at, cadence, status, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,'active',$8,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.planId,
        input.branchNodeId ?? null,
        input.assetId ?? null,
        input.nextRunAt,
        input.cadence,
        input.createdBy,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async listMaintenanceSchedules(tenantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_schedules WHERE tenant_id=$1 ORDER BY next_run_at ASC`,
      [tenantId],
    );
    return camelRows<any>(result.rows);
  }

  async createMaintenanceVisit(input: { tenantId: string; scheduleId: string; assignedTo?: string; dueAt: string; status?: string; createdBy: string; }) {
    const result = await this.pool.query(
      `INSERT INTO maintenance_visits (
         id, tenant_id, schedule_id, assigned_to, due_at,
         status, created_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.scheduleId,
        input.assignedTo ?? null,
        input.dueAt,
        input.status ?? 'pending',
        input.createdBy,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async listMaintenanceVisits(tenantId: string, filters?: { status?: string }) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_visits
       WHERE tenant_id=$1
         AND ($2::text IS NULL OR status=$2)
       ORDER BY due_at ASC`,
      [tenantId, filters?.status ?? null],
    );
    return camelRows<any>(result.rows);
  }

  async updateMaintenanceVisit(id: string, input: Record<string, unknown>) {
    const values: Record<string, unknown> = {
      tenant_id: input.tenantId,
      schedule_id: input.scheduleId,
      assigned_to: input.assignedTo,
      due_at: input.dueAt,
      visited_at: input.visitedAt,
      status: input.status,
      verification: input.verification,
      notes: input.notes,
      photos: input.photos ? JSON.stringify(input.photos) : undefined,
    };
    const { assignments, params } = buildUpdateStatement(values);
    if (assignments.length === 0) return this.listMaintenanceVisits('', {}).then(() => undefined);
    const result = await this.pool.query(
      `UPDATE maintenance_visits SET ${assignments.join(", ")}, updated_at=now() WHERE id=$1 RETURNING *`,
      [id, ...params],
    );
    if (!result.rows[0]) return undefined;
    return camelRow<any>(result.rows[0]);
  }

  async ingestPredictiveAlert(input: { tenantId: string; assetId?: string; type: string; score: number; details?: Record<string, unknown>; detectedAt: string; }) {
    const result = await this.pool.query(
      `INSERT INTO predictive_alerts (
         id, tenant_id, asset_id, alert_type, failure_probability,
         estimated_failure_days, recommendation, severity, status,
         detected_at, details
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'open',$9,$10::jsonb) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.assetId ?? null,
        input.type,
        input.score,
        null,
        null,
        input.score > 0.8 ? 'critical' : input.score > 0.5 ? 'high' : input.score > 0.25 ? 'medium' : 'low',
        input.detectedAt,
        input.details ? JSON.stringify(input.details) : null,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async listPredictiveAlerts(tenantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM predictive_alerts WHERE tenant_id=$1 ORDER BY detected_at DESC`,
      [tenantId],
    );
    return camelRows<any>(result.rows);
  }

  async recordCameraHealth(input: { tenantId: string; cameraId: string; onlineStatus: 'online' | 'offline' | 'degraded'; fps?: number; bitrate?: number; streamQuality?: string; temperature?: number; tampering?: boolean; recordingRunning?: boolean; latencyMs?: number; packetLoss?: number; lastFrameAt?: string; }) {
    const result = await this.pool.query(
      `INSERT INTO camera_health (
         id, tenant_id, camera_id, online_status, fps, bitrate,
         stream_quality, temperature, tampering, recording_running,
         latency_ms, packet_loss, last_frame_at, last_check_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.cameraId,
        input.onlineStatus,
        input.fps ?? null,
        input.bitrate ?? null,
        input.streamQuality ?? null,
        input.temperature ?? null,
        input.tampering ?? false,
        input.recordingRunning ?? null,
        input.latencyMs ?? null,
        input.packetLoss ?? null,
        input.lastFrameAt ?? null,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async recordStorageHealth(input: { tenantId: string; assetId: string; totalCapacityGb: number; usedCapacityGb: number; availableCapacityGb: number; smartStatus?: string; temperature?: number; badSectors?: number; readSpeedMbs?: number; writeSpeedMbs?: number; remainingLifetimeYears?: number; errorCount?: number; status?: 'healthy' | 'warning' | 'critical'; }) {
    const status = input.status ?? ((input.usedCapacityGb / input.totalCapacityGb) >= 0.9 ? 'critical' : (input.usedCapacityGb / input.totalCapacityGb) >= 0.8 ? 'warning' : 'healthy');
    const result = await this.pool.query(
      `INSERT INTO storage_health (
         id, tenant_id, asset_id, total_capacity_gb, used_capacity_gb,
         available_capacity_gb, usage_percentage, status, smart_status,
         temperature, bad_sectors, read_speed_mbs, write_speed_mbs,
         remaining_lifetime_years, error_count, last_check_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.assetId,
        input.totalCapacityGb,
        input.usedCapacityGb,
        input.availableCapacityGb,
        input.totalCapacityGb > 0 ? (input.usedCapacityGb / input.totalCapacityGb) * 100 : 0,
        status,
        input.smartStatus ?? null,
        input.temperature ?? null,
        input.badSectors ?? null,
        input.readSpeedMbs ?? null,
        input.writeSpeedMbs ?? null,
        input.remainingLifetimeYears ?? null,
        input.errorCount ?? null,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async recordNetworkHealth(input: { tenantId: string; branchNodeId?: string; assetId?: string; checkType: string; latencyMs?: number; packetLossPercentage?: number; jitterMs?: number; bandwidthAvailableMbps?: number; rtspAvailable?: boolean; onvifAvailable?: boolean; status?: 'healthy' | 'warning' | 'critical'; }) {
    const status = input.status ?? ((input.packetLossPercentage ?? 0) > 5 ? 'critical' : (input.packetLossPercentage ?? 0) > 1 ? 'warning' : 'healthy');
    const result = await this.pool.query(
      `INSERT INTO network_health (
         id, tenant_id, asset_id, branch_node_id, check_type,
         latency_ms, packet_loss_percentage, jitter_ms,
         bandwidth_available_mbps, rtsp_available, onvif_available,
         status, last_check_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.assetId ?? null,
        input.branchNodeId ?? null,
        input.checkType,
        input.latencyMs ?? null,
        input.packetLossPercentage ?? null,
        input.jitterMs ?? null,
        input.bandwidthAvailableMbps ?? null,
        input.rtspAvailable ?? null,
        input.onvifAvailable ?? null,
        status,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async recordUpsHealth(input: { tenantId: string; assetId: string; batteryHealthPercentage: number; runtimeMinutes?: number; chargingStatus?: string; loadPercentage?: number; temperature?: number; alarmStatus?: string; status?: 'healthy' | 'warning' | 'critical'; lastSelfTestAt?: string; lastSelfTestResult?: string; }) {
    const status = input.status ?? (input.batteryHealthPercentage < 70 ? 'critical' : input.batteryHealthPercentage < 85 ? 'warning' : 'healthy');
    const result = await this.pool.query(
      `INSERT INTO ups_health (
         id, tenant_id, asset_id, battery_health_percentage,
         runtime_minutes, charging_status, load_percentage,
         temperature, alarm_status, last_self_test_at,
         last_self_test_result, status, last_check_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.assetId,
        input.batteryHealthPercentage,
        input.runtimeMinutes ?? null,
        input.chargingStatus ?? null,
        input.loadPercentage ?? null,
        input.temperature ?? null,
        input.alarmStatus ?? null,
        input.lastSelfTestAt ?? null,
        input.lastSelfTestResult ?? null,
        status,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async getHealthCheckSummary(tenantId: string) {
    const [cameraSummary, storageSummary, networkSummary, upsSummary, overdueVisits, openWorkOrders] = await Promise.all([
      this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE online_status = 'online') AS cameras_online,
           COUNT(*) FILTER (WHERE online_status = 'offline') AS cameras_offline,
           COUNT(*) FILTER (WHERE online_status = 'degraded') AS cameras_degraded,
           COUNT(*) AS total_cameras
         FROM camera_health
         WHERE tenant_id=$1
           AND last_check_at > now() - interval '1 hour'`,
        [tenantId],
      ),
      this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'critical') AS storage_critical,
           COUNT(*) FILTER (WHERE status = 'warning') AS storage_warning,
           COUNT(*) AS storage_total
         FROM storage_health
         WHERE tenant_id=$1
           AND last_check_at > now() - interval '1 hour'`,
        [tenantId],
      ),
      this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'critical') AS network_critical,
           COUNT(*) FILTER (WHERE status = 'warning') AS network_warning,
           COUNT(*) AS network_total
         FROM network_health
         WHERE tenant_id=$1
           AND last_check_at > now() - interval '1 hour'`,
        [tenantId],
      ),
      this.pool.query(
        `SELECT
           COUNT(*) FILTER (WHERE status = 'critical') AS ups_critical,
           COUNT(*) FILTER (WHERE status = 'warning') AS ups_warning,
           COUNT(*) AS ups_total
         FROM ups_health
         WHERE tenant_id=$1
           AND last_check_at > now() - interval '1 hour'`,
        [tenantId],
      ),
      this.pool.query(
        `SELECT COUNT(*) AS overdue_visits FROM maintenance_visits
         WHERE tenant_id=$1
           AND status != 'completed'
           AND due_at < now()`,
        [tenantId],
      ),
      this.pool.query(
        `SELECT COUNT(*) AS open_work_orders FROM work_orders
         WHERE tenant_id=$1
           AND status != 'closed'`,
        [tenantId],
      ),
    ]);

    const cameraRow = cameraSummary.rows[0] ?? {};
    const storageRow = storageSummary.rows[0] ?? {};
    const networkRow = networkSummary.rows[0] ?? {};
    const upsRow = upsSummary.rows[0] ?? {};

    return {
      healthPercentage: cameraRow.total_cameras
        ? Math.round((cameraRow.cameras_online / cameraRow.total_cameras) * 100)
        : 100,
      camerasOnline: Number(cameraRow.cameras_online ?? 0),
      camerasOffline: Number(cameraRow.cameras_offline ?? 0),
      camerasDegraded: Number(cameraRow.cameras_degraded ?? 0),
      storageCritical: Number(storageRow.storage_critical ?? 0),
      storageWarning: Number(storageRow.storage_warning ?? 0),
      storageTotal: Number(storageRow.storage_total ?? 0),
      networkCritical: Number(networkRow.network_critical ?? 0),
      networkWarning: Number(networkRow.network_warning ?? 0),
      networkTotal: Number(networkRow.network_total ?? 0),
      upsCritical: Number(upsRow.ups_critical ?? 0),
      upsWarning: Number(upsRow.ups_warning ?? 0),
      upsTotal: Number(upsRow.ups_total ?? 0),
      overdueVisits: Number(overdueVisits.rows[0]?.overdue_visits ?? 0),
      openWorkOrders: Number(openWorkOrders.rows[0]?.open_work_orders ?? 0),
    };
  }

  async recordFirmwareVersion(input: { tenantId: string; assetId: string; deviceType: string; currentVersion: string; latestVersion?: string; requiresUpdate?: boolean; criticalUpdate?: boolean; }) {
    const result = await this.pool.query(
      `INSERT INTO firmware_inventory (
         id, tenant_id, asset_id, device_type, current_version,
         latest_version, requires_update, critical_update, last_check_at,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,now(),now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.assetId,
        input.deviceType,
        input.currentVersion,
        input.latestVersion ?? null,
        input.requiresUpdate ?? false,
        input.criticalUpdate ?? false,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async listFirmwareUpdatesRequired(tenantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM firmware_inventory WHERE tenant_id=$1 AND requires_update = true ORDER BY critical_update DESC, last_check_at DESC`,
      [tenantId],
    );
    return camelRows<any>(result.rows);
  }

  async recordSoftwareVersion(input: { tenantId: string; componentName: string; environment: string; currentVersion: string; previousVersion?: string; upgradeApprovedBy?: string; upgradeApprovedAt?: string; }) {
    const result = await this.pool.query(
      `INSERT INTO software_versions (
         id, tenant_id, component_name, environment, current_version,
         previous_version, upgrade_status, upgrade_approved_at,
         upgrade_approved_by, created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,'completed',$7,$8,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.componentName,
        input.environment,
        input.currentVersion,
        input.previousVersion ?? null,
        input.upgradeApprovedAt ?? null,
        input.upgradeApprovedBy ?? null,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async recordSparePart(input: { tenantId: string; partName: string; partCode: string; category: string; vendorId?: string; quantity: number; reorderLevel?: number; unitCost?: number; warrantyMonths?: number; location?: string; branchNodeId?: string; }) {
    const result = await this.pool.query(
      `INSERT INTO spare_parts (
         id, tenant_id, part_name, part_code, category,
         vendor_id, quantity, reorder_level, unit_cost,
         warranty_months, location, branch_node_id, created_by,
         created_at, updated_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,now(),now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.partName,
        input.partCode,
        input.category,
        input.vendorId ?? null,
        input.quantity,
        input.reorderLevel ?? null,
        input.unitCost ?? null,
        input.warrantyMonths ?? null,
        input.location ?? null,
        input.branchNodeId ?? null,
        null,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async recordInventoryTransaction(input: { tenantId: string; partId: string; workOrderId?: string; transactionType: string; quantity: number; referenceNumber?: string; notes?: string; recordedBy?: string; }) {
    const result = await this.pool.query(
      `INSERT INTO inventory_transactions (
         id, tenant_id, part_id, work_order_id, transaction_type,
         quantity, reference_number, notes, recorded_by, recorded_at
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,now()) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.partId,
        input.workOrderId ?? null,
        input.transactionType,
        input.quantity,
        input.referenceNumber ?? null,
        input.notes ?? null,
        input.recordedBy ?? null,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async listLowStockParts(tenantId: string) {
    const result = await this.pool.query(
      `SELECT * FROM spare_parts WHERE tenant_id=$1 AND quantity <= reorder_level ORDER BY quantity ASC`,
      [tenantId],
    );
    return camelRows<any>(result.rows);
  }

  async generateMaintenanceReport(input: { tenantId: string; reportType: string; periodStart: string; periodEnd: string; branchNodeId?: string; assetId?: string; }) {
    const result = await this.pool.query(
      `INSERT INTO maintenance_reports (
         id, tenant_id, report_type, period_start, period_end,
         branch_node_id, asset_id, metrics, summary, generated_by,
         generated_at, filename
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now(),$11) RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.reportType,
        input.periodStart,
        input.periodEnd,
        input.branchNodeId ?? null,
        input.assetId ?? null,
        JSON.stringify({}),
        `${input.reportType} maintenance report`,
        null,
        `${input.reportType}-report-${new Date().toISOString().split('T')[0]}.pdf`,
      ],
    );
    return camelRow<any>(result.rows[0]);
  }

  async listMaintenanceReports(tenantId: string, filters?: { reportType?: string; limit?: number }) {
    const result = await this.pool.query(
      `SELECT * FROM maintenance_reports
       WHERE tenant_id=$1
         AND ($2::text IS NULL OR report_type = $2)
       ORDER BY generated_at DESC
       LIMIT $3`,
      [tenantId, filters?.reportType ?? null, filters?.limit ?? 50],
    );
    return camelRows<any>(result.rows);
  }

  async getMaintenanceComplianceStatus(tenantId: string) {
    const overdueResult = await this.pool.query(
      `SELECT COUNT(*) AS count FROM maintenance_visits
       WHERE tenant_id=$1
         AND status IN ('pending', 'scheduled')
         AND due_at < now()`,
      [tenantId],
    );
    const openWorkOrdersResult = await this.pool.query(
      `SELECT COUNT(*) AS count FROM work_orders
       WHERE tenant_id=$1
         AND status != 'closed'`,
      [tenantId],
    );
    const criticalAlertsResult = await this.pool.query(
      `SELECT COUNT(*) AS count FROM predictive_alerts
       WHERE tenant_id=$1
         AND severity IN ('critical', 'high')
         AND status = 'open'`,
      [tenantId],
    );

    const overdueMaintenanceCount = parseInt(overdueResult.rows[0]?.count ?? '0', 10);
    const openIssuesCount = parseInt(openWorkOrdersResult.rows[0]?.count ?? '0', 10);
    const criticalAlertsCount = parseInt(criticalAlertsResult.rows[0]?.count ?? '0', 10);

    return {
      compliant: overdueMaintenanceCount === 0 && openIssuesCount === 0 && criticalAlertsCount === 0,
      overdueMaintenanceCount,
      openIssuesCount,
      criticalAlertsCount,
      status: overdueMaintenanceCount > 0 || openIssuesCount > 5 ? 'non-compliant' : 'compliant',
    };
  }
}
