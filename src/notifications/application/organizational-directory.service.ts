import type { Pool } from "pg";
import type {
  OnCallEntry,
  RoleAssignment,
  ShiftMember,
} from "../domain/notification.types.js";

export class OrganizationalDirectoryService {
  private readonly roleAssignments: RoleAssignment[] = [];
  private readonly shiftMembers: ShiftMember[] = [];
  private readonly onCallEntries: OnCallEntry[] = [];

  constructor(private readonly pool?: Pool) {
    if (!this.pool) {
      this.seedDefaultAssignments();
    }
  }

  async findRoleAssignments(params: {
    tenantId: string;
    roleKey: string;
    scopeType: "TENANT" | "REGION" | "BRANCH";
    scopeId?: string | undefined;
    at?: Date | undefined;
  }): Promise<RoleAssignment[]> {
    const at = params.at ?? new Date();

    if (this.pool) {
      try {
        let query = `
          SELECT r.id, r.tenant_id, r.user_id, r.role as role_key, s.branch_id as scope_id
          FROM notification_roster r
          LEFT JOIN notification_shifts s ON r.shift_id = s.id
          WHERE r.tenant_id = $1 AND r.role = $2 AND r.status = 'ACTIVE'
        `;
        const queryParams: any[] = [params.tenantId, params.roleKey];

        if (params.scopeType === "BRANCH" && params.scopeId) {
          query += ` AND s.branch_id = $3`;
          queryParams.push(params.scopeId);
        }

        const res = await this.pool.query(query, queryParams);
        return res.rows.map((row) => ({
          id: row.id,
          tenantId: row.tenant_id,
          userId: row.user_id,
          roleKey: row.role_key,
          scopeType: params.scopeType,
          scopeId: row.scope_id || params.scopeId,
          enabled: true,
        }));
      } catch {
        // Fallback to memory if table not yet migrated
      }
    }

    return this.roleAssignments.filter((a) => {
      if (a.tenantId !== params.tenantId) return false;
      if (a.roleKey !== params.roleKey) return false;
      if (!a.enabled) return false;
      if (a.scopeType !== params.scopeType) return false;
      if (params.scopeId && a.scopeId !== params.scopeId) return false;

      if (a.activeFrom && a.activeFrom > at) return false;
      if (a.activeUntil && a.activeUntil <= at) return false;

      return true;
    });
  }

  async findActiveShiftMembers(params: {
    tenantId: string;
    roleKey?: string | undefined;
    at?: Date | undefined;
  }): Promise<ShiftMember[]> {
    const at = params.at ?? new Date();

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT r.id, r.shift_id, r.tenant_id, r.user_id, r.status
           FROM notification_roster r
           JOIN notification_shifts s ON r.shift_id = s.id
           WHERE r.tenant_id = $1 AND r.status IN ('ACTIVE', 'SCHEDULED') AND s.is_active = true`,
          [params.tenantId]
        );
        return res.rows.map((row) => ({
          id: row.id,
          shiftId: row.shift_id,
          tenantId: row.tenant_id,
          userId: row.user_id,
          startsAt: new Date(at.getTime() - 3600_000),
          endsAt: new Date(at.getTime() + 3600_000),
          status: row.status as any,
        }));
      } catch {
        // Fallback to memory
      }
    }

    return this.shiftMembers.filter((m) => {
      if (m.tenantId !== params.tenantId) return false;
      if (m.status !== "ACTIVE" && m.status !== "SCHEDULED") return false;
      if (m.startsAt > at || m.endsAt <= at) return false;
      return true;
    });
  }

  async findActiveOnCallEntry(params: {
    tenantId: string;
    scheduleKey: string;
    at?: Date | undefined;
  }): Promise<OnCallEntry | null> {
    const at = params.at ?? new Date();

    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, schedule_key, tenant_id, user_id, starts_at, ends_at, priority, enabled
           FROM notification_on_call
           WHERE tenant_id = $1 AND schedule_key = $2 AND enabled = true
             AND starts_at <= $3 AND ends_at > $3
           ORDER BY priority ASC
           LIMIT 1`,
          [params.tenantId, params.scheduleKey, at]
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            scheduleKey: row.schedule_key,
            tenantId: row.tenant_id,
            userId: row.user_id,
            startsAt: new Date(row.starts_at),
            endsAt: new Date(row.ends_at),
            priority: row.priority,
            enabled: row.enabled,
          };
        }
      } catch {
        // Fallback to memory
      }
    }

    const matches = this.onCallEntries
      .filter((e) => {
        if (e.tenantId !== params.tenantId) return false;
        if (e.scheduleKey !== params.scheduleKey) return false;
        if (!e.enabled) return false;
        if (e.startsAt > at || e.endsAt <= at) return false;
        return true;
      })
      .sort((a, b) => a.priority - b.priority);

    return matches[0] ?? null;
  }

  addRoleAssignment(assignment: RoleAssignment) {
    this.roleAssignments.push(assignment);
  }

  addShiftMember(member: ShiftMember) {
    this.shiftMembers.push(member);
  }

  addOnCallEntry(entry: OnCallEntry) {
    this.onCallEntries.push(entry);
  }

  private seedDefaultAssignments() {
    const tenantId = "tenant-bank-01";

    // 1. Branch Roles
    this.addRoleAssignment({
      id: "assign-bm-thrissur",
      tenantId,
      userId: "user-bm-thrissur",
      roleKey: "BRANCH_MANAGER",
      scopeType: "BRANCH",
      scopeId: "branch-thrissur-14",
      enabled: true,
    });

    this.addRoleAssignment({
      id: "assign-bm-aluva",
      tenantId,
      userId: "user-bm-thrissur",
      roleKey: "BRANCH_MANAGER",
      scopeType: "BRANCH",
      scopeId: "branch-178",
      enabled: true,
    });

    // 2. Regional Security Officer
    this.addRoleAssignment({
      id: "assign-rso-thrissur",
      tenantId,
      userId: "user-rso-rahul",
      roleKey: "REGIONAL_SECURITY_OFFICER",
      scopeType: "REGION",
      scopeId: "region-thrissur",
      enabled: true,
    });

    // 3. Central Tenant Roles
    this.addRoleAssignment({
      id: "assign-mgr-priya",
      tenantId,
      userId: "user-mgr-priya",
      roleKey: "SURVEILLANCE_MANAGER",
      scopeType: "TENANT",
      enabled: true,
    });

    // 4. Shift Schedules (Current Active HO Shift)
    const baseNow = new Date();
    this.addShiftMember({
      id: "shift-ho-sanjay",
      shiftId: "shift-ho-day",
      tenantId,
      userId: "user-ho-sanjay",
      startsAt: new Date(baseNow.getTime() - 4 * 3600_000),
      endsAt: new Date(baseNow.getTime() + 4 * 3600_000),
      status: "ACTIVE",
    });

    // 5. On-Call Rotations (Rahul Nair is after-hours duty officer for Kerala)
    this.addOnCallEntry({
      id: "oncall-kerala-night",
      scheduleKey: "SURVEILLANCE_AFTER_HOURS",
      tenantId,
      userId: "user-rso-rahul",
      startsAt: new Date(baseNow.getTime() - 12 * 3600_000),
      endsAt: new Date(baseNow.getTime() + 12 * 3600_000),
      priority: 1,
      enabled: true,
    });
  }
}

export const organizationalDirectoryService = new OrganizationalDirectoryService();
