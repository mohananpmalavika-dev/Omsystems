/**
 * Privacy Domain Module
 * 
 * Manages fail-closed privacy override grants, redaction masking, and immutable audit logs.
 */

import type { Pool } from "pg";
import { moduleRegistry } from "../platform/module-registry.service.js";
import { PrivacyOverrideService } from "../privacy/services/privacy-override.service.js";

export class PrivacyModule {
  public privacyService: PrivacyOverrideService | null = null;

  async initialize(pool?: Pool): Promise<PrivacyOverrideService> {
    const isProduction = process.env.NODE_ENV === "production";
    
    moduleRegistry.registerModule({
      module: "privacyOverride",
      importance: "REQUIRED",
      state: "STARTING",
      reason: "Initializing fail-closed privacy governance and immutable audit ledger",
    });

    if (!pool && isProduction) {
      moduleRegistry.updateModuleState(
        "privacyOverride",
        "UNAVAILABLE",
        "PostgreSQL pool required for privacy audit in production"
      );
      throw new Error("PRIVACY_AUDIT_STORE_UNAVAILABLE: Privacy override requires PostgreSQL pool in production");
    }

    try {
      this.privacyService = new PrivacyOverrideService(pool);
      moduleRegistry.updateModuleState("privacyOverride", "READY", "Privacy governance engine active (fail-closed)");
      return this.privacyService;
    } catch (err: any) {
      moduleRegistry.updateModuleState("privacyOverride", "UNAVAILABLE", err.message);
      if (isProduction) throw err;
      this.privacyService = new PrivacyOverrideService();
      return this.privacyService;
    }
  }

  getService(): PrivacyOverrideService | null {
    return this.privacyService;
  }
}

export const privacyModule = new PrivacyModule();
