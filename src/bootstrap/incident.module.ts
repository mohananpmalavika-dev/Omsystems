/**
 * Incident Domain Module
 * 
 * Manages incident playbooks, execution instances, and durable escalation jobs.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import { PostgresPlaybookDefinitionRepository } from "../incidents/repositories/postgres-playbook-definition.repository.js";
import { PostgresPlaybookInstanceRepository } from "../incidents/repositories/postgres-playbook-instance.repository.js";
import { PostgresIncidentAuditRepository } from "../incidents/repositories/postgres-incident-audit.repository.js";
import { DurableIncidentEscalationService } from "../incidents/services/durable-incident-escalation.service.js";
import { PlaybookEngineService } from "../incidents/services/playbook-engine.service.js";

export class IncidentModule {
  public playbookDefinitions: PostgresPlaybookDefinitionRepository | null = null;
  public playbookInstances: PostgresPlaybookInstanceRepository | null = null;
  public incidentAudit: PostgresIncidentAuditRepository | null = null;
  public escalationService: DurableIncidentEscalationService | null = null;
  public playbookEngine: PlaybookEngineService | null = null;

  async initialize(pool?: Pool): Promise<PlaybookEngineService> {
    const isProduction = process.env.NODE_ENV === "production";
    moduleRegistry.registerModule({
      module: "incidentEngine",
      importance: "REQUIRED",
      state: "STARTING",
      reason: "Initializing durable incident playbooks and escalation scheduler",
    });

    if (!pool && isProduction) {
      moduleRegistry.updateModuleState(
        "incidentEngine",
        "UNAVAILABLE",
        "PostgreSQL required for incident engine in production",
      );
      throw new Error("INCIDENT_STORE_UNAVAILABLE: Incident engine requires PostgreSQL pool in production");
    }

    try {
      this.playbookDefinitions = new PostgresPlaybookDefinitionRepository(pool);
      if (pool) {
        await this.playbookDefinitions.ensureDefaultPlaybooksSeeded();
      }
      this.playbookInstances = new PostgresPlaybookInstanceRepository(pool);
      this.incidentAudit = new PostgresIncidentAuditRepository(pool);
      this.escalationService = new DurableIncidentEscalationService(pool);

      this.playbookEngine = new PlaybookEngineService(
        this.playbookDefinitions,
        this.playbookInstances,
        this.incidentAudit,
        pool,
      );

      moduleRegistry.updateModuleState("incidentEngine", "READY", "Incident and SOP engine active");
      return this.playbookEngine;
    } catch (err: any) {
      moduleRegistry.updateModuleState("incidentEngine", "UNAVAILABLE", err.message);
      if (isProduction) throw err;
      throw err;
    }
  }

  getEngine(): PlaybookEngineService | null {
    return this.playbookEngine;
  }
}

export const incidentModule = new IncidentModule();
