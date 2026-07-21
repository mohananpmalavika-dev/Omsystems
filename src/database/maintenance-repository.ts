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
}
