/**
 * Production Module Readiness Registry
 * 
 * Tracks authoritative readiness across critical subsystems.
 * In production, any CRITICAL or REQUIRED module failure marks the node UNREADY (HTTP 503).
 * Never infers readiness from generic SELECT 1 database pings.
 * Capabilities are derived dynamically from actual verified subsystem health.
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

export interface ReadinessResult {
  state: ModuleState;
  reason?: string;
  metadata?: Record<string, unknown>;
}

export interface ReadinessContributor {
  name: string;
  importance: ModuleImportance;
  check(): Promise<ReadinessResult>;
}

export type CapabilityState =
  | "AVAILABLE"
  | "PARTIAL"
  | "UNAVAILABLE"
  | "MISCONFIGURED"
  | "UNKNOWN";

export interface CapabilityDetail {
  state: CapabilityState;
  reason?: string;
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
  private readonly contributors = new Map<string, ReadinessContributor>();

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
    this.register("aiQuality", "REQUIRED", "STARTING", "Verifying AI models and camera detector pipelines");
    this.register("privacy", "REQUIRED", "STARTING", "Verifying privacy unmasking audit store");
    this.register("notifications", "REQUIRED", "STARTING", "Verifying push and email notification dispatchers");
  }

  registerContributor(contributor: ReadinessContributor): void {
    this.contributors.set(contributor.name, contributor);
    if (!this.modules.has(contributor.name)) {
      this.register(contributor.name, contributor.importance, "STARTING", "Registered contributor initializing");
    }
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

  async evaluateReadinessAsync(): Promise<ReadinessEvaluation> {
    // Run all registered contributors independently
    const checks = Array.from(this.contributors.values()).map(async (contributor) => {
      try {
        const result = await contributor.check();
        this.updateStatus(contributor.name, result.state, result.reason, result.metadata);
      } catch (err) {
        this.updateStatus(
          contributor.name,
          "UNAVAILABLE",
          `Readiness check failed: ${err instanceof Error ? err.message : String(err)}`,
        );
      }
    });

    await Promise.allSettled(checks);
    return this.evaluateReadiness();
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

  /**
   * Returns dynamically calculated capability states.
   * Never hardcodes true without subsystem verification.
   */
  getCapabilities(): Record<string, CapabilityDetail> {
    const mapState = (moduleName: string, okReason?: string, failReason?: string): CapabilityDetail => {
      const mod = this.modules.get(moduleName);
      if (!mod) return { state: "UNKNOWN", reason: `Module ${moduleName} not registered` };
      if (mod.state === "READY") return { state: "AVAILABLE", reason: okReason || mod.reason };
      if (mod.state === "DEGRADED") return { state: "PARTIAL", reason: mod.reason };
      if (mod.state === "MISCONFIGURED") return { state: "MISCONFIGURED", reason: mod.reason };
      return { state: "UNAVAILABLE", reason: failReason || mod.reason };
    };

    return {
      recording: mapState("recordingIndex", "Recording index and storage verified"),
      playback: mapState("mediaOrchestration", "Media streaming gateway active"),
      ptz: {
        state: this.modules.get("mediaOrchestration")?.state === "READY" ? "AVAILABLE" : "UNKNOWN",
        reason: "Derived from media gateway & camera adapter connectivity",
      },
      evidenceSigning: mapState("evidenceService", "Cryptographic signing provider initialized"),
      aiQuality: mapState("aiQuality", "Evaluation, detector and model repositories operational"),
      privacyOverride: mapState("privacy", "Durable privacy audit store connected"),
      durableEscalations: mapState("database", "Durable PostgreSQL playbook escalation store verified"),
      distributedFencing: mapState("redis", "Redis stream lease repository online"),
      identitySAML: mapState("identity", "Enterprise SAML authentication provider verified"),
      pushNotifications: mapState("notifications", "Push and FCM/APNs providers verified"),
    };
  }
}

export const moduleRegistry = new ModuleRegistry();
