import { randomUUID } from "node:crypto";
import type { IncidentAuditEvent } from "../domain/playbook.types.js";

export class IncidentAuditRepository {
  private readonly events: IncidentAuditEvent[] = [];
  private readonly incidentIndex = new Map<string, IncidentAuditEvent[]>();

  async append(event: Omit<IncidentAuditEvent, "eventId" | "timestamp">): Promise<IncidentAuditEvent> {
    const fullEvent: IncidentAuditEvent = {
      ...event,
      eventId: randomUUID(),
      timestamp: new Date().toISOString(),
    };

    this.events.push(fullEvent);

    const list = this.incidentIndex.get(event.incidentId) || [];
    list.push(fullEvent);
    this.incidentIndex.set(event.incidentId, list);

    return fullEvent;
  }

  async getTimeline(incidentId: string): Promise<IncidentAuditEvent[]> {
    const list = this.incidentIndex.get(incidentId) || [];
    return [...list].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  }

  async listAll(): Promise<IncidentAuditEvent[]> {
    return [...this.events];
  }
}
