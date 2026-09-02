/**
 * Authoritative Execution Errors for Sentinel Grid
 * 
 * Invariants:
 * - Production code must never use mock providers or fake success
 * - Model unavailabilities and inference failures must be explicitly typed
 */

export class ProductionMockForbiddenError extends Error {
  constructor(message = "Mock provider or simulated execution is strictly forbidden in production mode.") {
    super(message);
    this.name = "ProductionMockForbiddenError";
    Object.setPrototypeOf(this, ProductionMockForbiddenError.prototype);
  }
}

export class ModelUnavailableError extends Error {
  readonly modelId?: string;
  constructor(message = "Required AI/ML model runtime is unavailable.", modelId?: string) {
    super(message);
    this.name = "ModelUnavailableError";
    this.modelId = modelId;
    Object.setPrototypeOf(this, ModelUnavailableError.prototype);
  }
}

export class InferenceFailedError extends Error {
  readonly modelId?: string;
  readonly cause?: unknown;
  constructor(message = "Model inference execution failed.", modelId?: string, cause?: unknown) {
    super(message);
    this.name = "InferenceFailedError";
    this.modelId = modelId;
    this.cause = cause;
    Object.setPrototypeOf(this, InferenceFailedError.prototype);
  }
}

export class FabricatedSuccessError extends Error {
  constructor(message = "Fabricated success detected: Operation claimed success without genuine execution.") {
    super(message);
    this.name = "FabricatedSuccessError";
    Object.setPrototypeOf(this, FabricatedSuccessError.prototype);
  }
}

export class DependencyUnavailableError extends Error {
  readonly dependencyName?: string;
  constructor(message = "Required dependency is offline or unavailable.", dependencyName?: string) {
    super(message);
    this.name = "DependencyUnavailableError";
    this.dependencyName = dependencyName;
    Object.setPrototypeOf(this, DependencyUnavailableError.prototype);
  }
}
