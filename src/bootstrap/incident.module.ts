/**
 * Incident Domain Module
 * 
 * Manages incident playbooks, execution instances, and durable escalation jobs.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import { PostgresPlaybookDefinitionRepository } from "../incidents/repositories/postgres-playbook-definition.repository.js";
import { PostgresPlaybookInstanceRepository } from "../incidents/repositories/postgres-playbook-instance.repository.js";
import { DurableIncidentEscalationService } from "../incidents/services/durable-incident-escalation.service.js";

export class IncidentModule {
  public playbookDefinitions: PostgresPlaybookDefinitionRepository | null = null;
  public playbookInstances: PostgresPlaybookInstanceRepository | null = null;
  public escalationService: DurableIncidentEscalationService | null = null;

  async initialize(pool?: Pool): Promise<void> {
    moduleRegistry.registerModule({
      module: "incidentEngine",
      importance: "REQUIRED",
      state: "STARTING",
      reason: "Initializing durable incident playbooks and escalation scheduler",
    });

    try {
      this.playbookDefinitions = new PostgresPlaybookDefinitionRepository(pool);
      this.playbookInstances = new PostgresPlaybookInstanceRepository(pool);
      this.escalationService = new DurableIncidentEscalationService(pool);

      moduleRegistry.updateModuleState("incidentEngine", "READY", "Incident and SOP engine active");
    } catch (err: any) {
      moduleRegistry.updateModuleState("incidentEngine", "UNAVAILABLE", err.message);
    }
  }
}

export const incidentModule = new IncidentModule();
