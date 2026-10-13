import type { ControlPlaneStore } from "../../control-plane-store.js";
import type { Action, User } from "../../domain/models.js";
import { BranchOperationalSnapshotService } from "../../services/branch-operational-snapshot.production.service.js";

export class MobileWorkflowError extends Error {
  constructor(readonly statusCode: number, readonly code: string) { super(code); }
}

const terminalStatuses = new Set(["closed", "resolved", "completed", "false_alarm", "false-positive", "cancelled"]);
const isTerminal = (incident: any) => terminalStatuses.has(String(incident.status).toLowerCase());
const isAcknowledged = (incident: any) => ["acknowledged", "investigating", "in-progress", "escalated"].includes(String(incident.status).toLowerCase());

/** Uses the canonical persistent store and authorization decisions, never demo data. */
export class MobileWorkflowService {
  private readonly snapshots: BranchOperationalSnapshotService;
  constructor(private readonly store: ControlPlaneStore) {
    this.snapshots = new BranchOperationalSnapshotService(store);
  }

  async activeUser(user: User | undefined): Promise<User> {
    if (!user) throw new MobileWorkflowError(401, "unauthenticated");
    const current = await this.store.getUser(user.id);
    if (!current || current.status !== "active" || current.tenantId !== user.tenantId) {
      throw new MobileWorkflowError(401, "invalid_identity");
    }
    return current;
  }

  async incident(user: User, id: string, action: Action = "incident:view") {
    const incident = await this.store.getIncident(id);
    if (!incident || incident.tenantId !== user.tenantId) throw new MobileWorkflowError(404, "incident_not_found");
    if (action !== "incident:view" && ["viewer", "auditor"].includes(String(user.role))) {
      throw new MobileWorkflowError(403, "access_denied");
    }
    if (incident.branchId) {
      const branch = await this.store.getNode(incident.branchId);
      if (!branch || branch.tenantId !== user.tenantId || !(await this.store.checkAccess(user, action, branch.id))?.allowed) {
        throw new MobileWorkflowError(404, "incident_not_found");
      }
    } else {
      const companies = await this.store.listAccessibleNodes(user, action, "company");
      if (!companies.some(node => node.tenantId === user.tenantId)) throw new MobileWorkflowError(404, "incident_not_found");
    }
    return incident;
  }

  async list(user: User) {
    const branches = (await this.store.listAccessibleNodes(user, "incident:view", "branch"))
      .filter(branch => branch.tenantId === user.tenantId);
    const companies = await this.store.listAccessibleNodes(user, "incident:view", "company");
    const includeUnscoped = companies.some(node => node.tenantId === user.tenantId);
    // The extra row makes truncation explicit instead of presenting capped totals as complete.
    const records = await this.store.listIncidents(user.tenantId, {
      branchIds: branches.map(branch => branch.id), includeUnscoped, limit: 501,
    });
    const ids = new Set(branches.map(branch => branch.id));
    const scoped = [...new Map(records.filter(incident => incident.tenantId === user.tenantId &&
      (incident.branchId ? ids.has(incident.branchId) : includeUnscoped)).map(incident => [incident.id, incident])).values()];
    return { branches, records: scoped.slice(0, 500), countsComplete: records.length < 501 };
  }

  async home(user: User) {
    const { branches, records, countsComplete } = await this.list(user);
    const active = records.filter(incident => !isTerminal(incident));
    active.sort((a, b) => String(a.severity).localeCompare(String(b.severity)) ||
      String(b.occurredAt ?? b.createdAt).localeCompare(String(a.occurredAt ?? a.createdAt)));
    const health = { healthy: 0, warning: 0, critical: 0, unknown: 0, total: branches.length };
    // Bound expensive branch snapshot work. Forced snapshots do not reuse cached permissions.
    for (let offset = 0; offset < branches.length; offset += 5) {
      const states = await Promise.all(branches.slice(offset, offset + 5).map(async branch => {
        if (!(await this.store.checkAccess(user, "recording:view", branch.id))?.allowed) return "UNKNOWN";
        return (await this.snapshots.getBranchSnapshot(user.tenantId, branch.id, true, user))?.overallState ?? "UNKNOWN";
      }));
      for (const state of states) {
        if (state === "HEALTHY") health.healthy++;
        else if (state === "WARNING") health.warning++;
        else if (state === "CRITICAL") health.critical++;
        else health.unknown++;
      }
    }
    const names = new Map(branches.map(branch => [branch.id, branch.name]));
    const incidents = active.slice(0, 20).map(incident => ({
      id: incident.id, title: incident.title, severity: incident.severity, type: incident.incidentType,
      status: incident.status, occurredAt: incident.occurredAt ?? incident.createdAt,
      acknowledged: isAcknowledged(incident), assignedTo: incident.assignedTo,
      branch: { id: incident.branchId ?? null, name: names.get(incident.branchId) ?? "Organization incident", code: incident.branchId ?? "" },
      // Evidence, AI confidence, camera health and SLA require authoritative evidence.
      timeline: [], slaRemainingSeconds: null,
    }));
    const criticalIncidentCount = active.filter(incident => incident.severity === "P1").length;
    return {
      incidents, activeIncidents: incidents, criticalIncidentCount, criticalAlertsCount: criticalIncidentCount,
      unacknowledgedCount: active.filter(incident => !isAcknowledged(incident)).length,
      myIncidentsCount: active.filter(incident => incident.assignedTo === user.id).length,
      branchHealthSummary: health,
      operator: { id: user.id, name: user.displayName }, predictedRisks: [], liveEvents: [],
      countsComplete, lastUpdated: new Date().toISOString(),
    };
  }

  async mutate(user: User, id: string, operation: "acknowledge" | "escalate" | "assign" | "notes", body: any, sourceIp?: string) {
    const action: Action = operation === "assign" ? "incident:assign" : operation === "escalate" ? "incident:escalate" : "incident:update";
    const incident = await this.incident(user, id, action);
    if (isTerminal(incident)) throw new MobileWorkflowError(409, "incident_is_closed");
    let updated;
    if (operation === "acknowledge") {
      updated = isAcknowledged(incident) ? incident : await this.store.updateIncidentStatus(id, "acknowledged", user.id, body.deviceId ? `Mobile device: ${body.deviceId}` : "Acknowledged from mobile", incident.status);
    } else if (operation === "escalate") {
      updated = await this.store.escalateIncident(id, user.id, body.reason, body.recipients, incident.status);
    } else if (operation === "assign") {
      const target = await this.store.getUser(body.userId);
      if (!target || target.status !== "active" || target.tenantId !== user.tenantId) throw new MobileWorkflowError(400, "invalid_assignee");
      await this.incident(target, id);
      updated = await this.store.assignIncident(id, target.id, user.id);
    } else {
      updated = await this.store.addIncidentNote({ incidentId: id, createdBy: user.id, noteType: "general", content: body.content });
    }
    if (!updated) throw new MobileWorkflowError(409, "incident_update_not_persisted");
    await this.store.writeAudit({ tenantId: user.tenantId, actorUserId: user.id, action: `incident:mobile-${operation}`,
      resourceNodeId: incident.branchId ?? null, outcome: "success", sourceIp, details: { incidentId: id } });
    return { success: true, incidentId: id, newStatus: operation === "notes" ? incident.status : updated.status,
      message: operation === "notes" ? "Note saved." : "Incident update saved." };
  }

  async contact(user: User, id: string, sourceIp?: string) {
    const incident = await this.incident(user, id);
    if (!incident.branchId) throw new MobileWorkflowError(404, "branch_contact_unavailable");
    const branch = await this.store.getNode(incident.branchId);
    const metadata = (branch as any)?.metadata;
    const contact = metadata?.contactPhone ?? metadata?.phone;
    if (typeof contact !== "string" || !/^\+?[\d\s().-]{7,30}$/.test(contact.trim())) {
      throw new MobileWorkflowError(404, "branch_contact_unavailable");
    }
    const phone = contact.replace(/[^+\d]/g, "");
    await this.store.writeAudit({ tenantId: user.tenantId, actorUserId: user.id, action: "incident:mobile-contact-view",
      resourceNodeId: incident.branchId, outcome: "success", sourceIp, details: { incidentId: id } });
    return { success: true, phone, phoneNumber: phone, managerName: metadata?.managerName ?? branch?.name,
      dialerUrl: `tel:${phone}`, message: "Branch contact ready. Opening the dialer does not confirm a completed call." };
  }
}
