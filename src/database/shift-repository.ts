/**
 * Shift Management Repository
 * Manages operator shifts, assignments, and handovers
 */

import { randomUUID } from "node:crypto";
import type { Pool } from "pg";

export interface MonitoringShift {
  id: string;
  tenantId: string;
  shiftName: string;
  startTime: string; // HH:MM format
  endTime: string;
  daysOfWeek: number[]; // 0=Sunday, 6=Saturday
  createdAt: string;
  updatedAt: string;
}

export interface ShiftAssignment {
  id: string;
  tenantId: string;
  shiftId: string;
  operatorId: string;
  operatorName: string;
  assignedDate: string; // YYYY-MM-DD
  clockInAt?: string;
  clockOutAt?: string;
  status: "scheduled" | "active" | "completed" | "no_show" | "cancelled";
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ShiftHandoverLog {
  id: string;
  tenantId: string;
  outgoingOperatorId: string;
  outgoingOperatorName: string;
  incomingOperatorId: string;
  incomingOperatorName: string;
  shiftStart: string;
  shiftEnd: string;
  handoverNotes?: string;
  acknowledgedBy?: string;
  acknowledgedAt?: string;
  createdAt: string;
}

export interface ShiftHandoverItem {
  id: string;
  handoverId: string;
  itemType: string;
  itemId?: string;
  priority?: string;
  description: string;
  status: "pending" | "acknowledged" | "resolved" | "transferred";
  resolvedAt?: string;
  resolvedBy?: string;
  createdAt: string;
}

export class ShiftRepository {
  constructor(private readonly pool: Pool) {}

  // ============ SHIFTS ============

  async listShifts(tenantId: string): Promise<MonitoringShift[]> {
    const result = await this.pool.query(
      `SELECT * FROM monitoring_shifts
       WHERE tenant_id=$1
       ORDER BY shift_name ASC`,
      [tenantId]
    );
    return result.rows.map(mapShift);
  }

  async getShift(id: string, tenantId: string): Promise<MonitoringShift | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM monitoring_shifts
       WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapShift(result.rows[0]) : undefined;
  }

  async createShift(input: {
    tenantId: string;
    shiftName: string;
    startTime: string;
    endTime: string;
    daysOfWeek: number[];
  }): Promise<MonitoringShift> {
    const result = await this.pool.query(
      `INSERT INTO monitoring_shifts (
         id, tenant_id, shift_name, start_time, end_time, days_of_week
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.shiftName,
        input.startTime,
        input.endTime,
        input.daysOfWeek,
      ]
    );
    return mapShift(result.rows[0]);
  }

  async updateShift(
    id: string,
    tenantId: string,
    updates: {
      shiftName?: string;
      startTime?: string;
      endTime?: string;
      daysOfWeek?: number[];
    }
  ): Promise<MonitoringShift | undefined> {
    const result = await this.pool.query(
      `UPDATE monitoring_shifts
       SET shift_name = COALESCE($3, shift_name),
           start_time = COALESCE($4, start_time),
           end_time = COALESCE($5, end_time),
           days_of_week = COALESCE($6, days_of_week),
           updated_at = now()
       WHERE id=$1 AND tenant_id=$2
       RETURNING *`,
      [
        id,
        tenantId,
        updates.shiftName ?? null,
        updates.startTime ?? null,
        updates.endTime ?? null,
        updates.daysOfWeek ?? null,
      ]
    );
    return result.rows[0] ? mapShift(result.rows[0]) : undefined;
  }

  async deleteShift(id: string, tenantId: string): Promise<boolean> {
    const result = await this.pool.query(
      `DELETE FROM monitoring_shifts WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    return result.rowCount !== null && result.rowCount > 0;
  }

  // ============ ASSIGNMENTS ============

  async listAssignments(
    tenantId: string,
    filters?: {
      operatorId?: string;
      shiftId?: string;
      fromDate?: string;
      toDate?: string;
      status?: string;
    }
  ): Promise<ShiftAssignment[]> {
    let query = `SELECT * FROM shift_assignments WHERE tenant_id=$1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.operatorId) {
      query += ` AND operator_id=$${paramIndex++}`;
      params.push(filters.operatorId);
    }

    if (filters?.shiftId) {
      query += ` AND shift_id=$${paramIndex++}`;
      params.push(filters.shiftId);
    }

    if (filters?.fromDate) {
      query += ` AND assigned_date >= $${paramIndex++}`;
      params.push(filters.fromDate);
    }

    if (filters?.toDate) {
      query += ` AND assigned_date <= $${paramIndex++}`;
      params.push(filters.toDate);
    }

    if (filters?.status) {
      query += ` AND status=$${paramIndex++}`;
      params.push(filters.status);
    }

    query += ` ORDER BY assigned_date DESC, created_at DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(mapAssignment);
  }

  async getAssignment(id: string, tenantId: string): Promise<ShiftAssignment | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM shift_assignments
       WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapAssignment(result.rows[0]) : undefined;
  }

  async createAssignment(input: {
    tenantId: string;
    shiftId: string;
    operatorId: string;
    operatorName: string;
    assignedDate: string;
    notes?: string;
  }): Promise<ShiftAssignment> {
    const result = await this.pool.query(
      `INSERT INTO shift_assignments (
         id, tenant_id, shift_id, operator_id, operator_name,
         assigned_date, notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.shiftId,
        input.operatorId,
        input.operatorName,
        input.assignedDate,
        input.notes ?? null,
      ]
    );
    return mapAssignment(result.rows[0]);
  }

  async clockIn(id: string, tenantId: string): Promise<ShiftAssignment | undefined> {
    const result = await this.pool.query(
      `UPDATE shift_assignments
       SET clock_in_at = now(),
           status = 'active',
           updated_at = now()
       WHERE id=$1 AND tenant_id=$2 AND status='scheduled'
       RETURNING *`,
      [id, tenantId]
    );
    return result.rows[0] ? mapAssignment(result.rows[0]) : undefined;
  }

  async clockOut(id: string, tenantId: string): Promise<ShiftAssignment | undefined> {
    const result = await this.pool.query(
      `UPDATE shift_assignments
       SET clock_out_at = now(),
           status = 'completed',
           updated_at = now()
       WHERE id=$1 AND tenant_id=$2 AND status='active'
       RETURNING *`,
      [id, tenantId]
    );
    return result.rows[0] ? mapAssignment(result.rows[0]) : undefined;
  }

  async updateAssignmentStatus(
    id: string,
    tenantId: string,
    status: string,
    notes?: string
  ): Promise<ShiftAssignment | undefined> {
    const result = await this.pool.query(
      `UPDATE shift_assignments
       SET status = $3,
           notes = COALESCE($4, notes),
           updated_at = now()
       WHERE id=$1 AND tenant_id=$2
       RETURNING *`,
      [id, tenantId, status, notes ?? null]
    );
    return result.rows[0] ? mapAssignment(result.rows[0]) : undefined;
  }

  // ============ HANDOVERS ============

  async listHandovers(
    tenantId: string,
    filters?: {
      incomingOperatorId?: string;
      outgoingOperatorId?: string;
      unacknowledged?: boolean;
    }
  ): Promise<ShiftHandoverLog[]> {
    let query = `SELECT * FROM shift_handover_logs WHERE tenant_id=$1`;
    const params: any[] = [tenantId];
    let paramIndex = 2;

    if (filters?.incomingOperatorId) {
      query += ` AND incoming_operator_id=$${paramIndex++}`;
      params.push(filters.incomingOperatorId);
    }

    if (filters?.outgoingOperatorId) {
      query += ` AND outgoing_operator_id=$${paramIndex++}`;
      params.push(filters.outgoingOperatorId);
    }

    if (filters?.unacknowledged) {
      query += ` AND acknowledged_at IS NULL`;
    }

    query += ` ORDER BY shift_start DESC`;

    const result = await this.pool.query(query, params);
    return result.rows.map(mapHandover);
  }

  async getHandover(id: string, tenantId: string): Promise<ShiftHandoverLog | undefined> {
    const result = await this.pool.query(
      `SELECT * FROM shift_handover_logs
       WHERE id=$1 AND tenant_id=$2`,
      [id, tenantId]
    );
    return result.rows[0] ? mapHandover(result.rows[0]) : undefined;
  }

  async createHandover(input: {
    tenantId: string;
    outgoingOperatorId: string;
    outgoingOperatorName: string;
    incomingOperatorId: string;
    incomingOperatorName: string;
    shiftStart: string;
    shiftEnd: string;
    handoverNotes?: string;
  }): Promise<ShiftHandoverLog> {
    const result = await this.pool.query(
      `INSERT INTO shift_handover_logs (
         id, tenant_id, outgoing_operator_id, outgoing_operator_name,
         incoming_operator_id, incoming_operator_name,
         shift_start, shift_end, handover_notes
       ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       RETURNING *`,
      [
        randomUUID(),
        input.tenantId,
        input.outgoingOperatorId,
        input.outgoingOperatorName,
        input.incomingOperatorId,
        input.incomingOperatorName,
        input.shiftStart,
        input.shiftEnd,
        input.handoverNotes ?? null,
      ]
    );
    return mapHandover(result.rows[0]);
  }

  async acknowledgeHandover(
    id: string,
    tenantId: string,
    acknowledgedBy: string
  ): Promise<ShiftHandoverLog | undefined> {
    const result = await this.pool.query(
      `UPDATE shift_handover_logs
       SET acknowledged_by = $3,
           acknowledged_at = now()
       WHERE id=$1 AND tenant_id=$2
       RETURNING *`,
      [id, tenantId, acknowledgedBy]
    );
    return result.rows[0] ? mapHandover(result.rows[0]) : undefined;
  }

  // ============ HANDOVER ITEMS ============

  async listHandoverItems(handoverId: string): Promise<ShiftHandoverItem[]> {
    const result = await this.pool.query(
      `SELECT * FROM shift_handover_items
       WHERE handover_id=$1
       ORDER BY 
         CASE priority
           WHEN 'critical' THEN 1
           WHEN 'high' THEN 2
           WHEN 'medium' THEN 3
           WHEN 'low' THEN 4
           ELSE 5
         END,
         created_at ASC`,
      [handoverId]
    );
    return result.rows.map(mapHandoverItem);
  }

  async createHandoverItem(input: {
    handoverId: string;
    itemType: string;
    itemId?: string;
    priority?: string;
    description: string;
  }): Promise<ShiftHandoverItem> {
    const result = await this.pool.query(
      `INSERT INTO shift_handover_items (
         id, handover_id, item_type, item_id, priority, description
       ) VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING *`,
      [
        randomUUID(),
        input.handoverId,
        input.itemType,
        input.itemId ?? null,
        input.priority ?? null,
        input.description,
      ]
    );
    return mapHandoverItem(result.rows[0]);
  }

  async updateHandoverItemStatus(
    id: string,
    status: string,
    resolvedBy?: string
  ): Promise<ShiftHandoverItem | undefined> {
    const result = await this.pool.query(
      `UPDATE shift_handover_items
       SET status = $2,
           resolved_at = CASE WHEN $2 = 'resolved' THEN now() ELSE resolved_at END,
           resolved_by = COALESCE($3, resolved_by)
       WHERE id=$1
       RETURNING *`,
      [id, status, resolvedBy ?? null]
    );
    return result.rows[0] ? mapHandoverItem(result.rows[0]) : undefined;
  }
}

// ============ MAPPERS ============

function mapShift(row: any): MonitoringShift {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    shiftName: row.shift_name,
    startTime: row.start_time,
    endTime: row.end_time,
    daysOfWeek: row.days_of_week,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapAssignment(row: any): ShiftAssignment {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    shiftId: row.shift_id,
    operatorId: row.operator_id,
    operatorName: row.operator_name,
    assignedDate: row.assigned_date,
    clockInAt: row.clock_in_at ? new Date(row.clock_in_at).toISOString() : undefined,
    clockOutAt: row.clock_out_at ? new Date(row.clock_out_at).toISOString() : undefined,
    status: row.status,
    notes: row.notes ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
    updatedAt: new Date(row.updated_at).toISOString(),
  };
}

function mapHandover(row: any): ShiftHandoverLog {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    outgoingOperatorId: row.outgoing_operator_id,
    outgoingOperatorName: row.outgoing_operator_name,
    incomingOperatorId: row.incoming_operator_id,
    incomingOperatorName: row.incoming_operator_name,
    shiftStart: new Date(row.shift_start).toISOString(),
    shiftEnd: new Date(row.shift_end).toISOString(),
    handoverNotes: row.handover_notes ?? undefined,
    acknowledgedBy: row.acknowledged_by ?? undefined,
    acknowledgedAt: row.acknowledged_at ? new Date(row.acknowledged_at).toISOString() : undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function mapHandoverItem(row: any): ShiftHandoverItem {
  return {
    id: row.id,
    handoverId: row.handover_id,
    itemType: row.item_type,
    itemId: row.item_id ?? undefined,
    priority: row.priority ?? undefined,
    description: row.description,
    status: row.status,
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).toISOString() : undefined,
    resolvedBy: row.resolved_by ?? undefined,
    createdAt: new Date(row.created_at).toISOString(),
  };
}
