import type {
  OnCallEntry,
  RoleAssignment,
  ShiftMember,
} from "../domain/notification.types.js";

export class OrganizationalDirectoryService {
  private readonly roleAssignments: RoleAssignment[] = [];
  private readonly shiftMembers: ShiftMember[] = [];
  private readonly onCallEntries: OnCallEntry[] = [];

  constructor() {}

  async findRoleAssignments(params: {
    tenantId: string;
    roleKey: string;
    scopeType: "TENANT" | "REGION" | "BRANCH";
    scopeId?: string | undefined;
    at?: Date | undefined;
  }): Promise<RoleAssignment[]> {
    const at = params.at ?? new Date();

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
      userId: "user-bm-thrissur", // same user can be manager of nearby branch or test
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
      startsAt: new Date(baseNow.getTime() - 4 * 3600_000), // started 4h ago
      endsAt: new Date(baseNow.getTime() + 4 * 3600_000), // ends in 4h
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
