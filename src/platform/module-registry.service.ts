/**
 * Production Module Readiness Registry
 * 
 * Tracks authoritative readiness across critical subsystems.
 * In production, any CRITICAL or REQUIRED module failure marks the node UNREADY (HTTP 503).
 */

export type ModuleImportance = "CRITICAL" | "REQUIRED" | "OPTIONAL";
export type ModuleState = "STARTING" | "READY" | "DEGRADED" | "UNAVAILABLE" | "MISCONFIGURED";

export interface ModuleStatus {
  module: string;
  importance: ModuleImportance;
  state: ModuleState;
  reason?: string;
  since: Date;
  metadata?: Record<string, unknown>;
}

export interface ReadinessEvaluation {
  overall: "READY" | "DEGRADED" | "UNREADY";
  isReady: boolean;
  statusCode: 200 | 503;
  timestamp: string;
  modules: Record<string, ModuleState>;
  details: Record<string, ModuleStatus>;
  failedCriticalModules: string[];
}

export class ModuleRegistry {
  private readonly modules = new Map<string, ModuleStatus>();

  constructor() {
    // Register baseline critical and required modules in STARTING state
    this.register("database", "CRITICAL", "STARTING", "Initializing database connection pool");
    this.register("redis", "CRITICAL", "STARTING", "Connecting to distributed state cluster");
    this.register("eventBus", "CRITICAL", "STARTING", "Initializing transactional event bus");
    this.register("recordingIndex", "CRITICAL", "STARTING", "Verifying recording index and storage integrity");
    this.register("mediaOrchestration", "REQUIRED", "STARTING", "Connecting media gateway registry and lease manager");
    this.register("evidenceService", "REQUIRED", "STARTING", "Initializing durable forensic evidence pipeline");
    this.register("identity", "CRITICAL", "STARTING", "Verifying OIDC/SAML enterprise identity providers");
    this.register("audit", "CRITICAL", "STARTING", "Checking immutable audit event pipeline");
  }

  register(
    module: string,
    importance: ModuleImportance,
    state: ModuleState = "STARTING",
    reason?: string,
    metadata?: Record<string, unknown>,
  ): void {
    this.modules.set(module, {
      module,
      importance,
      state,
      reason,
      since: new Date(),
      metadata,
    });
  }

  updateStatus(
    module: string,
    state: ModuleState,
    reason?: string,
    metadata?: Record<string, unknown>,
  ): void {
    const existing = this.modules.get(module);
    const importance = existing?.importance ?? "REQUIRED";
    this.modules.set(module, {
      module,
      importance,
      state,
      reason,
      since: new Date(),
      metadata: metadata ?? existing?.metadata,
    });
  }

  registerModule(params: {
    module: string;
    importance: ModuleImportance;
    state?: ModuleState;
    reason?: string;
    metadata?: Record<string, unknown>;
  }): void {
    this.register(params.module, params.importance, params.state || "STARTING", params.reason, params.metadata);
  }

  updateModuleState(
    module: string,
    state: ModuleState,
    reason?: string,
    metadata?: Record<string, unknown>
  ): void {
    this.updateStatus(module, state, reason, metadata);
  }

  getReadiness(): ReadinessEvaluation {
    return this.evaluateReadiness();
  }

  getStatus(module: string): ModuleStatus | undefined {
    return this.modules.get(module);
  }

  getAllStatuses(): ModuleStatus[] {
    return Array.from(this.modules.values());
  }

  evaluateReadiness(): ReadinessEvaluation {
    const modules: Record<string, ModuleState> = {};
    const details: Record<string, ModuleStatus> = {};
    const failedCritical: string[] = [];
    let hasDegraded = false;

    for (const [name, status] of this.modules.entries()) {
      modules[name] = status.state;
      details[name] = status;

      const isFailing = status.state === "UNAVAILABLE" || status.state === "MISCONFIGURED" || status.state === "STARTING";
      if (isFailing && (status.importance === "CRITICAL" || status.importance === "REQUIRED")) {
        failedCritical.push(name);
      }

      if (status.state === "DEGRADED") {
        hasDegraded = true;
      }
    }

    if (failedCritical.length > 0) {
      return {
        overall: "UNREADY",
        isReady: false,
        statusCode: 503,
        timestamp: new Date().toISOString(),
        modules,
        details,
        failedCriticalModules: failedCritical,
      };
    }

    if (hasDegraded) {
      return {
        overall: "DEGRADED",
        isReady: true,
        statusCode: 200,
        timestamp: new Date().toISOString(),
        modules,
        details,
        failedCriticalModules: [],
      };
    }

    return {
      overall: "READY",
      isReady: true,
      statusCode: 200,
      timestamp: new Date().toISOString(),
      modules,
      details,
      failedCriticalModules: [],
    };
  }

  getCapabilities(): Record<string, boolean | string> {
    return {
      recording: this.modules.get("recordingIndex")?.state === "READY",
      playback: this.modules.get("mediaOrchestration")?.state === "READY",
      ptz: true,
      evidenceSigning: this.modules.get("evidenceService")?.state === "READY",
      aiQuality: true,
      privacyOverride: true,
      durableEscalations: true,
      distributedFencing: this.modules.get("redis")?.state === "READY",
      identitySAML: this.modules.get("identity")?.state === "READY",
    };
  }
}

export const moduleRegistry = new ModuleRegistry();
