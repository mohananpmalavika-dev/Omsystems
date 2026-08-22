/**
 * Alert Incident Repository
 */

import type { AlertIncident, IncidentAlertRelationship, IncidentStatus } from "../domain/alert-incident.types.js";

export class AlertIncidentRepository {
  private incidents: Map<string, AlertIncident> = new Map();
  private relationships: IncidentAlertRelationship[] = [];

  async create(incident: AlertIncident): Promise<AlertIncident> {
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async update(incident: AlertIncident): Promise<AlertIncident> {
    this.incidents.set(incident.id, incident);
    return incident;
  }

  async findById(id: string): Promise<AlertIncident | undefined> {
    return this.incidents.get(id);
  }

  async findActiveByRootNode(branchId: string, rootCauseNodeId: string): Promise<AlertIncident | undefined> {
    for (const inc of this.incidents.values()) {
      if (inc.branchId === branchId && inc.rootCauseNodeId === rootCauseNodeId && inc.status !== "RESOLVED") {
        return inc;
      }
    }
    return undefined;
  }

  async findActiveByBranch(branchId: string): Promise<AlertIncident | undefined> {
    for (const inc of this.incidents.values()) {
      if (inc.branchId === branchId && inc.status !== "RESOLVED") {
        return inc;
      }
    }
    return undefined;
  }

  async recordRelationship(rel: IncidentAlertRelationship): Promise<void> {
    this.relationships.push(rel);
  }

  async list(filter?: { tenantId?: string; branchId?: string; status?: IncidentStatus }): Promise<AlertIncident[]> {
    return Array.from(this.incidents.values()).filter((inc) => {
      if (filter?.tenantId && inc.tenantId !== filter.tenantId) return false;
      if (filter?.branchId && inc.branchId !== filter.branchId) return false;
      if (filter?.status && inc.status !== filter.status) return false;
      return true;
    });
  }

  async getRelationshipsForIncident(incidentId: string): Promise<IncidentAlertRelationship[]> {
    return this.relationships.filter((r) => r.incidentId === incidentId);
  }

  clear() {
    this.incidents.clear();
    this.relationships = [];
  }
}

export const alertIncidentRepository = new AlertIncidentRepository();
