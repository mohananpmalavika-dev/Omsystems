/**
 * Identity & Audit Domain Module
 * 
 * Manages authentication, SAML identity providers, granular RBAC/ABAC, and central audit.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import { CentralAuditService } from "../audit/services/central-audit.service.js";

export class IdentityModule {
  public auditService: CentralAuditService | null = null;

  async initialize(pool?: Pool): Promise<void> {
    moduleRegistry.registerModule({
      module: "identity",
      importance: "CRITICAL",
      state: "STARTING",
      reason: "Initializing identity, enterprise authentication, and tamper-evident audit",
    });

    try {
      this.auditService = new CentralAuditService(pool);
      moduleRegistry.updateModuleState("identity", "READY", "Identity and immutable audit platform active");
    } catch (err: any) {
      moduleRegistry.updateModuleState("identity", "UNAVAILABLE", err.message);
    }
  }
}

export const identityModule = new IdentityModule();
