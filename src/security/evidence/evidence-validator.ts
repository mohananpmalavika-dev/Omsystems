/**
 * Evidence Validator
 * 
 * Runtime validation for security evidence to catch:
 * - Invalid state combinations
 * - Simulated data in production
 * - Contradictory fields
 * - Missing required data
 * 
 * This provides defense-in-depth beyond TypeScript compile-time checks.
 */

import type { SecurityEvidence } from './security-evidence-types.js';

/**
 * Validation error details
 */
export interface ValidationError {
  field: string;
  message: string;
  severity: 'error' | 'warning';
}

/**
 * Validation result
 */
export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
  warnings: ValidationError[];
}

/**
 * Evidence validator
 */
export class EvidenceValidator {
  /**
   * Validate security evidence
   */
  static validate(evidence: any): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    // Structural validation
    this.validateStructure(evidence, errors);

    // Semantic validation
    if (errors.length === 0) {
      this.validateSemantics(evidence, errors, warnings);
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }

  /**
   * Validate evidence structure
   */
  private static validateStructure(evidence: any, errors: ValidationError[]): void {
    // Required fields
    if (!evidence) {
      errors.push({
        field: 'evidence',
        message: 'Evidence object is null or undefined',
        severity: 'error',
      });
      return;
    }

    const requiredFields = ['state', 'available', 'source', 'confidence', 'observedAt', 'reason'];
    for (const field of requiredFields) {
      if (!(field in evidence)) {
        errors.push({
          field,
          message: `Missing required field: ${field}`,
          severity: 'error',
        });
      }
    }

    // Type validation
    if (typeof evidence.state !== 'string') {
      errors.push({
        field: 'state',
        message: 'state must be a string',
        severity: 'error',
      });
    }

    if (typeof evidence.available !== 'boolean') {
      errors.push({
        field: 'available',
        message: 'available must be a boolean',
        severity: 'error',
      });
    }

    if (typeof evidence.source !== 'string') {
      errors.push({
        field: 'source',
        message: 'source must be a string',
        severity: 'error',
      });
    }

    if (typeof evidence.confidence !== 'number') {
      errors.push({
        field: 'confidence',
        message: 'confidence must be a number',
        severity: 'error',
      });
    }

    if (typeof evidence.reason !== 'string') {
      errors.push({
        field: 'reason',
        message: 'reason must be a string',
        severity: 'error',
      });
    }

    // Enum validation
    const validStates = ['HEALTHY', 'UNHEALTHY', 'UNKNOWN'];
    if (!validStates.includes(evidence.state)) {
      errors.push({
        field: 'state',
        message: `Invalid state: ${evidence.state}. Must be one of: ${validStates.join(', ')}`,
        severity: 'error',
      });
    }

    const validSources = ['LIVE', 'SIMULATED', 'UNAVAILABLE'];
    if (!validSources.includes(evidence.source)) {
      errors.push({
        field: 'source',
        message: `Invalid source: ${evidence.source}. Must be one of: ${validSources.join(', ')}`,
        severity: 'error',
      });
    }

    // Range validation
    if (typeof evidence.confidence === 'number') {
      if (evidence.confidence < 0 || evidence.confidence > 1) {
        errors.push({
          field: 'confidence',
          message: `confidence must be between 0 and 1, got: ${evidence.confidence}`,
          severity: 'error',
        });
      }
    }
  }

  /**
   * Validate evidence semantics
   */
  private static validateSemantics(
    evidence: SecurityEvidence,
    errors: ValidationError[],
    warnings: ValidationError[],
  ): void {
    // HEALTHY state must have live source and evidence data
    if (evidence.state === 'HEALTHY') {
      if (!evidence.available) {
        errors.push({
          field: 'available',
          message: 'HEALTHY state requires available=true',
          severity: 'error',
        });
      }

      const sourceVal = evidence.source;
      if (sourceVal !== 'LIVE') {
        errors.push({
          field: 'source',
          message: `HEALTHY state requires source=LIVE, got: ${sourceVal}`,
          severity: 'error',
        });
      }

      const reasonVal = evidence.reason;
      if (reasonVal !== 'VERIFIED') {
        warnings.push({
          field: 'reason',
          message: `HEALTHY state typically has reason=VERIFIED, got: ${reasonVal}`,
          severity: 'warning',
        });
      }

      if (!evidence.observedAt) {
        errors.push({
          field: 'observedAt',
          message: 'HEALTHY state requires observedAt timestamp',
          severity: 'error',
        });
      }

      if (!('evidence' in evidence) || evidence.evidence === undefined) {
        errors.push({
          field: 'evidence',
          message: 'HEALTHY state requires evidence data',
          severity: 'error',
        });
      }
    }

    // UNHEALTHY state must have live source and evidence data
    if (evidence.state === 'UNHEALTHY') {
      if (!evidence.available) {
        errors.push({
          field: 'available',
          message: 'UNHEALTHY state requires available=true',
          severity: 'error',
        });
      }

      const sourceVal = evidence.source;
      if (sourceVal !== 'LIVE') {
        errors.push({
          field: 'source',
          message: `UNHEALTHY state requires source=LIVE, got: ${sourceVal}`,
          severity: 'error',
        });
      }

      const reasonVal = evidence.reason;
      if (reasonVal !== 'CONTROL_FAILED') {
        warnings.push({
          field: 'reason',
          message: `UNHEALTHY state typically has reason=CONTROL_FAILED, got: ${reasonVal}`,
          severity: 'warning',
        });
      }

      if (!evidence.observedAt) {
        errors.push({
          field: 'observedAt',
          message: 'UNHEALTHY state requires observedAt timestamp',
          severity: 'error',
        });
      }

      if (!('evidence' in evidence) || evidence.evidence === undefined) {
        errors.push({
          field: 'evidence',
          message: 'UNHEALTHY state requires evidence data',
          severity: 'error',
        });
      }
    }

    // UNKNOWN state must NOT have evidence data
    if (evidence.state === 'UNKNOWN') {
      if (evidence.available) {
        errors.push({
          field: 'available',
          message: 'UNKNOWN state requires available=false',
          severity: 'error',
        });
      }

      if (evidence.source !== 'UNAVAILABLE' && evidence.source !== 'SIMULATED') {
        errors.push({
          field: 'source',
          message: `UNKNOWN state requires source=UNAVAILABLE or SIMULATED, got: ${evidence.source}`,
          severity: 'error',
        });
      }

      const validReasons: Array<SecurityEvidence['reason']> = [
        'COLLECTOR_UNAVAILABLE',
        'NOT_SUPPORTED',
        'NOT_CONFIGURED',
        'STALE_EVIDENCE',
        'SIMULATED_DATA',
        'PERMISSION_DENIED',
        'TIMEOUT',
        'INVALID_RESPONSE',
        'NO_EVIDENCE'
      ];
      if (!validReasons.includes(evidence.reason)) {
        errors.push({
          field: 'reason',
          message: `UNKNOWN state has invalid reason: ${evidence.reason}`,
          severity: 'error',
        });
      }

      if ('evidence' in evidence && evidence.evidence !== undefined) {
        errors.push({
          field: 'evidence',
          message: 'UNKNOWN state must not have evidence data',
          severity: 'error',
        });
      }

      if (evidence.confidence !== 0) {
        warnings.push({
          field: 'confidence',
          message: `UNKNOWN state typically has confidence=0, got: ${evidence.confidence}`,
          severity: 'warning',
        });
      }
    }

    // Simulated data warnings
    if (evidence.source === 'SIMULATED') {
      warnings.push({
        field: 'source',
        message: 'Evidence uses SIMULATED source - not production-trusted',
        severity: 'warning',
      });
    }

    // Stale evidence warnings
    if (evidence.observedAt && evidence.state !== 'UNKNOWN') {
      const age = Date.now() - new Date(evidence.observedAt).getTime();
      const oneDayMs = 24 * 60 * 60 * 1000;

      if (age > oneDayMs) {
        warnings.push({
          field: 'observedAt',
          message: `Evidence is ${Math.round(age / oneDayMs)} days old`,
          severity: 'warning',
        });
      }
    }
  }

  /**
   * Validate and throw on error
   */
  static validateOrThrow(evidence: any, context?: string): void {
    const result = this.validate(evidence);

    if (!result.valid) {
      const errorMessages = result.errors.map(e => `${e.field}: ${e.message}`).join('; ');
      throw new Error(
        `Invalid security evidence${context ? ` (${context})` : ''}: ${errorMessages}`
      );
    }

    // Log warnings
    if (result.warnings.length > 0) {
      console.warn(
        `Security evidence warnings${context ? ` (${context})` : ''}:`,
        result.warnings.map(w => `${w.field}: ${w.message}`).join('; ')
      );
    }
  }

  /**
   * Validate production environment constraints
   */
  static validateProductionConstraints(
    evidence: SecurityEvidence,
    environment: 'development' | 'test' | 'production',
  ): ValidationResult {
    const errors: ValidationError[] = [];
    const warnings: ValidationError[] = [];

    if (environment === 'production') {
      // Simulated data is not allowed in production
      if (evidence.source === 'SIMULATED') {
        errors.push({
          field: 'source',
          message: 'SIMULATED evidence is not allowed in production',
          severity: 'error',
        });
      }

      // Warn about low confidence in production
      if (evidence.confidence < 0.8 && evidence.state === 'HEALTHY') {
        warnings.push({
          field: 'confidence',
          message: `Low confidence (${evidence.confidence}) for HEALTHY state in production`,
          severity: 'warning',
        });
      }

      // Warn about high UNKNOWN rate
      if (evidence.state === 'UNKNOWN') {
        warnings.push({
          field: 'state',
          message: 'UNKNOWN state in production - may indicate missing telemetry',
          severity: 'warning',
        });
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
    };
  }
}

/**
 * Validation middleware for evidence collectors
 */
export function validateEvidence(evidence: any, collectorId: string): SecurityEvidence {
  EvidenceValidator.validateOrThrow(evidence, collectorId);
  return evidence as SecurityEvidence;
}

/**
 * Production validation middleware
 */
export function validateProductionEvidence(
  evidence: SecurityEvidence,
  environment: 'development' | 'test' | 'production',
  collectorId: string,
): SecurityEvidence {
  const result = EvidenceValidator.validateProductionConstraints(evidence, environment);

  if (!result.valid) {
    throw new Error(
      `Production validation failed for ${collectorId}: ${result.errors.map(e => e.message).join('; ')}`
    );
  }

  if (result.warnings.length > 0) {
    console.warn(
      `Production warnings for ${collectorId}:`,
      result.warnings.map(w => w.message).join('; ')
    );
  }

  return evidence;
}
