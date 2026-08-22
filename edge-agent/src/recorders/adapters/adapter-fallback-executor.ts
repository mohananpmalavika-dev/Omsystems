import type {
  AdapterFailure,
  ApiFamily,
  RecorderOperation,
} from "../types/recorder-profile.types.js";
import type { RecorderAdapter, RecorderRequest } from "./recorder-adapter.interface.js";

export class RecorderOperationError extends Error {
  constructor(
    public readonly operation: RecorderOperation,
    public readonly failures: AdapterFailure[],
  ) {
    super(`Recorder operation ${operation} failed across all candidate adapters: ${failures.map((f) => `[${f.family}] ${f.error}`).join("; ")}`);
    this.name = "RecorderOperationError";
  }
}

export class AdapterFallbackExecutor {
  private readonly adapters = new Map<ApiFamily, RecorderAdapter>();

  register(adapter: RecorderAdapter): this {
    this.adapters.set(adapter.family, adapter);
    return this;
  }

  async executeWithFallback<T>(
    operation: RecorderOperation,
    candidateFamilies: ApiFamily[],
    req: RecorderRequest,
  ): Promise<T> {
    const failures: AdapterFailure[] = [];

    for (const family of candidateFamilies) {
      const adapter = this.adapters.get(family);
      if (!adapter) continue;

      try {
        return await adapter.execute<T>(operation, req);
      } catch (err: any) {
        const failure = this.classifyFailure(family, operation, err);
        failures.push(failure);

        // Do not continue fallback on authentication failure or rate limit lockout
        if (!failure.retryWithAnotherFamily) {
          break;
        }
      }
    }

    throw new RecorderOperationError(operation, failures);
  }

  private classifyFailure(
    family: ApiFamily,
    operation: RecorderOperation,
    err: any,
  ): AdapterFailure {
    const msg = String(err?.message ?? err);
    const statusCode = typeof err?.statusCode === "number" ? err.statusCode : undefined;

    const isAuthFailure =
      statusCode === 401 ||
      statusCode === 403 ||
      /credentials_rejected|unauthorized|forbidden|invalid_auth|lockout/i.test(msg);

    // Stop fallback on auth failure to avoid triggering device account lockouts
    const retryWithAnotherFamily = !isAuthFailure;

    return {
      family,
      operation,
      error: msg,
      statusCode,
      retryWithAnotherFamily,
      isAuthFailure,
    };
  }
}
