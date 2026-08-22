/**
 * Evidence Helper Utilities
 * 
 * Factory functions for creating evidence values with consistent semantics.
 * 
 * USAGE:
 * - Use observed() when you successfully retrieved a value
 * - Use unknown() when observation failed for unclear reasons
 * - Use specific failure helpers (authFailed, timedOut, etc.) when cause is known
 * - NEVER manually construct EvidenceValue objects
 */

import type {
  EvidenceValue,
  EvidenceSource,
  EvidenceError,
  RecorderErrorCode,
  EvidenceState
} from './evidence-value.js';

/**
 * Create observed evidence
 * 
 * Use when value was successfully retrieved and verified.
 */
export function observed<T>(
  value: T,
  source: EvidenceSource,
  options?: {
    confidence?: number;
    latencyMs?: number;
    rawReference?: string;
  }
): EvidenceValue<T> {
  return {
    state: 'OBSERVED',
    value,
    observedAt: new Date(),
    source,
    confidence: options?.confidence ?? 1.0,
    latencyMs: options?.latencyMs,
    rawReference: options?.rawReference
  };
}

/**
 * Create unknown evidence
 * 
 * Use when observation failed but cause is unclear or doesn't fit
 * other categories.
 */
export function unknown<T>(
  source: EvidenceSource,
  message: string,
  options?: {
    code?: RecorderErrorCode;
    vendorCode?: string;
    httpStatus?: number;
    context?: Record<string, any>;
    latencyMs?: number;
  }
): EvidenceValue<T> {
  return {
    state: 'UNKNOWN',
    observedAt: new Date(),
    source,
    confidence: 0,
    latencyMs: options?.latencyMs,
    error: {
      code: options?.code ?? 'UNKNOWN_ERROR',
      message,
      vendorCode: options?.vendorCode,
      httpStatus: options?.httpStatus,
      context: options?.context
    }
  };
}

/**
 * Create unsupported evidence
 * 
 * Use when device/adapter does not implement the capability.
 */
export function unsupported<T>(
  source: EvidenceSource,
  message: string,
  options?: {
    reason?: string;
    latencyMs?: number;
  }
): EvidenceValue<T> {
  return {
    state: 'UNSUPPORTED',
    observedAt: new Date(),
    source,
    confidence: 0,
    latencyMs: options?.latencyMs,
    error: {
      code: 'UNSUPPORTED_FEATURE',
      message,
      context: options?.reason ? { reason: options.reason } : undefined
    }
  };
}

/**
 * Create auth-failed evidence
 * 
 * Use when authentication prevented observation.
 */
export function authFailed<T>(
  source: EvidenceSource,
  message: string,
  options?: {
    httpStatus?: number;
    vendorCode?: string;
    latencyMs?: number;
  }
): EvidenceValue<T> {
  return {
    state: 'AUTH_FAILED',
    observedAt: new Date(),
    source,
    confidence: 0,
    latencyMs: options?.latencyMs,
    error: {
      code: 'AUTH_FAILED',
      message,
      httpStatus: options?.httpStatus,
      vendorCode: options?.vendorCode
    }
  };
}

/**
 * Create timeout evidence
 * 
 * Use when operation exceeded time limit.
 */
export function timedOut<T>(
  source: EvidenceSource,
  timeoutMs: number,
  options?: {
    latencyMs?: number;
  }
): EvidenceValue<T> {
  return {
    state: 'TIMEOUT',
    observedAt: new Date(),
    source,
    confidence: 0,
    latencyMs: options?.latencyMs ?? timeoutMs,
    error: {
      code: 'TIMEOUT',
      message: `Operation timed out after ${timeoutMs}ms`,
      context: { timeoutMs }
    }
  };
}

/**
 * Create unreachable evidence
 * 
 * Use when device/network is unreachable.
 */
export function unreachable<T>(
  source: EvidenceSource,
  message: string,
  options?: {
    code?: Extract<RecorderErrorCode, 'NETWORK_UNREACHABLE' | 'CONNECTION_REFUSED' | 'DNS_FAILURE'>;
    latencyMs?: number;
  }
): EvidenceValue<T> {
  return {
    state: 'UNREACHABLE',
    observedAt: new Date(),
    source,
    confidence: 0,
    latencyMs: options?.latencyMs,
    error: {
      code: options?.code ?? 'NETWORK_UNREACHABLE',
      message
    }
  };
}

/**
 * Create malformed-response evidence
 * 
 * Use when response was received but couldn't be parsed.
 */
export function malformed<T>(
  source: EvidenceSource,
  message: string,
  options?: {
    httpStatus?: number;
    contentType?: string;
    parseError?: string;
    latencyMs?: number;
  }
): EvidenceValue<T> {
  return {
    state: 'MALFORMED_RESPONSE',
    observedAt: new Date(),
    source,
    confidence: 0,
    latencyMs: options?.latencyMs,
    error: {
      code: 'MALFORMED_RESPONSE',
      message,
      httpStatus: options?.httpStatus,
      context: {
        contentType: options?.contentType,
        parseError: options?.parseError
      }
    }
  };
}

/**
 * Create rate-limited evidence
 * 
 * Use when temporarily throttled.
 */
export function rateLimited<T>(
  source: EvidenceSource,
  retryAfterMs?: number,
  options?: {
    latencyMs?: number;
  }
): EvidenceValue<T> {
  return {
    state: 'RATE_LIMITED',
    observedAt: new Date(),
    source,
    confidence: 0,
    latencyMs: options?.latencyMs,
    error: {
      code: 'RATE_LIMITED',
      message: retryAfterMs
        ? `Rate limited, retry after ${retryAfterMs}ms`
        : 'Rate limited',
      context: retryAfterMs ? { retryAfterMs } : undefined
    }
  };
}

/**
 * Create device-error evidence
 * 
 * Use when recorder reported internal error.
 */
export function deviceError<T>(
  source: EvidenceSource,
  message: string,
  options?: {
    vendorCode?: string;
    httpStatus?: number;
    latencyMs?: number;
  }
): EvidenceValue<T> {
  return {
    state: 'DEVICE_ERROR',
    observedAt: new Date(),
    source,
    confidence: 0,
    latencyMs: options?.latencyMs,
    error: {
      code: 'DEVICE_ERROR',
      message,
      vendorCode: options?.vendorCode,
      httpStatus: options?.httpStatus
    }
  };
}

/**
 * Convert generic error to appropriate evidence value
 * 
 * Analyzes error and produces best-fit evidence state.
 */
export function fromError<T>(
  error: any,
  source: EvidenceSource,
  latencyMs?: number
): EvidenceValue<T> {
  // Network errors
  if (error.code === 'ECONNREFUSED') {
    return unreachable<T>(source, 'Connection refused', {
      code: 'CONNECTION_REFUSED',
      latencyMs
    });
  }

  if (error.code === 'ENOTFOUND') {
    return unreachable<T>(source, 'DNS lookup failed', {
      code: 'DNS_FAILURE',
      latencyMs
    });
  }

  if (error.code === 'ETIMEDOUT' || error.name === 'TimeoutError') {
    return timedOut<T>(source, latencyMs ?? 0, { latencyMs });
  }

  if (error.code === 'ECONNRESET') {
    return unreachable<T>(source, 'Connection reset by peer', {
      code: 'NETWORK_UNREACHABLE',
      latencyMs
    });
  }

  // HTTP errors
  if (error.response?.status === 401 || error.response?.status === 403) {
    return authFailed<T>(source, error.message || 'Authentication failed', {
      httpStatus: error.response.status,
      latencyMs
    });
  }

  if (error.response?.status === 429) {
    const retryAfter = error.response.headers?.['retry-after'];
    return rateLimited<T>(
      source,
      retryAfter ? parseInt(retryAfter, 10) * 1000 : undefined,
      { latencyMs }
    );
  }

  if (error.response?.status === 404) {
    return unknown<T>(source, 'Resource not found', {
      code: 'NOT_FOUND',
      httpStatus: 404,
      latencyMs
    });
  }

  if (error.response?.status === 500 || error.response?.status === 503) {
    return deviceError<T>(source, error.message || 'Device internal error', {
      httpStatus: error.response.status,
      latencyMs
    });
  }

  // Parse errors
  if (error instanceof SyntaxError) {
    return malformed<T>(source, 'Failed to parse response', {
      parseError: error.message,
      latencyMs
    });
  }

  // Generic fallback
  return unknown<T>(source, error.message || 'Unknown error occurred', {
    code: 'UNKNOWN_ERROR',
    context: {
      errorName: error.name,
      errorCode: error.code
    },
    latencyMs
  });
}

/**
 * Combine multiple evidence values with conflict detection
 * 
 * Returns the most confident evidence, or flags conflicts
 * if values disagree.
 */
export function combineEvidence<T>(
  evidences: EvidenceValue<T>[],
  options?: {
    detectConflicts?: boolean;
    preferredAdapter?: string;
  }
): EvidenceValue<T> & { conflicts?: Array<{ adapter: string; value: T }> } {
  if (evidences.length === 0) {
    throw new Error('Cannot combine empty evidence array');
  }

  if (evidences.length === 1) {
    return evidences[0];
  }

  // Find all observed values
  const observed = evidences.filter(e => e.state === 'OBSERVED');

  if (observed.length === 0) {
    // No observations, return highest confidence failure
    return evidences.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
  }

  if (observed.length === 1) {
    return observed[0];
  }

  // Multiple observations - check for conflicts
  const values = observed.map(e => e.value);
  const allMatch = values.every(v => JSON.stringify(v) === JSON.stringify(values[0]));

  if (allMatch) {
    // All agree - return most confident
    return observed.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );
  }

  // Conflict detected
  if (options?.detectConflicts) {
    const conflicts = observed.map(e => ({
      adapter: e.source.adapter,
      value: e.value!
    }));

    // Prefer specified adapter if available
    if (options.preferredAdapter) {
      const preferred = observed.find(
        e => e.source.adapter === options.preferredAdapter
      );
      if (preferred) {
        return { ...preferred, conflicts };
      }
    }

    // Otherwise return highest confidence with conflict flag
    const best = observed.reduce((best, current) =>
      current.confidence > best.confidence ? current : best
    );

    return { ...best, conflicts };
  }

  // Return highest confidence
  return observed.reduce((best, current) =>
    current.confidence > best.confidence ? current : best
  );
}

/**
 * Extract value or throw if not observed
 * 
 * Useful for required values in business logic.
 */
export function requireObserved<T>(
  evidence: EvidenceValue<T>,
  errorMessage?: string
): T {
  if (evidence.state === 'OBSERVED' && evidence.value !== undefined) {
    return evidence.value;
  }

  throw new Error(
    errorMessage ?? `Required evidence not observed: ${evidence.state}`
  );
}

/**
 * Extract value or return default
 */
export function getValueOr<T>(
  evidence: EvidenceValue<T>,
  defaultValue: T
): T {
  return evidence.state === 'OBSERVED' && evidence.value !== undefined
    ? evidence.value
    : defaultValue;
}

/**
 * Check if evidence is actionable
 * 
 * FRESH + OBSERVED = actionable
 * STALE + OBSERVED = possibly actionable (caller decides)
 * EXPIRED or not OBSERVED = not actionable
 */
export function isActionable<T>(
  evidence: EvidenceValue<T>,
  maxAgeMs: number,
  now: Date = new Date()
): boolean {
  if (evidence.state !== 'OBSERVED') {
    return false;
  }

  const ageMs = now.getTime() - evidence.observedAt.getTime();
  return ageMs <= maxAgeMs;
}
