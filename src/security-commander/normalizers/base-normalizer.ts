/**
 * Base Event Normalizer
 * 
 * Abstract base class for all event normalizers.
 */

import type { SecurityEvent, CreateSecurityEventInput } from '../types/index.js';

export interface RawEvent {
  timestamp: Date | string;
  [key: string]: any;
}

export abstract class BaseEventNormalizer<T extends RawEvent> {
  /**
   * Normalize a raw event into a SecurityEvent
   */
  abstract normalize(raw: T, context: NormalizationContext): CreateSecurityEventInput;

  /**
   * Check if this normalizer can handle the raw event
   */
  abstract canHandle(raw: any): boolean;

  /**
   * Extract tenant context from raw event
   */
  protected extractTenantContext(raw: T, context: NormalizationContext): {
    tenantId: string;
    enterpriseId?: string;
    regionId?: string;
    branchId?: string;
  } {
    return {
      tenantId: context.tenantId,
      enterpriseId: context.enterpriseId,
      regionId: context.regionId,
      branchId: context.branchId ?? (raw as any).branchId,
    };
  }

  /**
   * Parse timestamp
   */
  protected parseTimestamp(timestamp: Date | string): Date {
    if (timestamp instanceof Date) {
      return timestamp;
    }
    return new Date(timestamp);
  }

  /**
   * Ensure timestamp is valid
   */
  protected ensureValidTimestamp(timestamp: Date): Date {
    if (isNaN(timestamp.getTime())) {
      return new Date();
    }
    return timestamp;
  }
}

export interface NormalizationContext {
  tenantId: string;
  enterpriseId?: string;
  regionId?: string;
  branchId?: string;
  metadata?: Record<string, unknown>;
}
