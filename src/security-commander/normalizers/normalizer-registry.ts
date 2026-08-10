/**
 * Normalizer Registry
 * 
 * Central registry for all event normalizers.
 * Automatically selects the appropriate normalizer for raw events.
 */

import type { BaseEventNormalizer, NormalizationContext, RawEvent } from './base-normalizer.js';
import type { CreateSecurityEventInput } from '../types/index.js';
import { CameraEventNormalizer } from './camera-event.normalizer.js';
import { AIDetectionNormalizer } from './ai-detection.normalizer.js';
import { AccessControlEventNormalizer } from './access-control.normalizer.js';
import { RecorderEventNormalizer } from './recorder.normalizer.js';
import { NetworkEventNormalizer } from './network.normalizer.js';
import { StorageEventNormalizer } from './storage.normalizer.js';

export class NormalizerRegistry {
  private normalizers: BaseEventNormalizer<any>[] = [];

  constructor() {
    this.registerDefaultNormalizers();
  }

  /**
   * Register default normalizers
   */
  private registerDefaultNormalizers(): void {
    this.register(new CameraEventNormalizer());
    this.register(new AIDetectionNormalizer());
    this.register(new AccessControlEventNormalizer());
    this.register(new RecorderEventNormalizer());
    this.register(new NetworkEventNormalizer());
    this.register(new StorageEventNormalizer());
  }

  /**
   * Register a custom normalizer
   */
  register(normalizer: BaseEventNormalizer<any>): void {
    this.normalizers.push(normalizer);
  }

  /**
   * Normalize a raw event using the appropriate normalizer
   */
  normalize(raw: RawEvent, context: NormalizationContext): CreateSecurityEventInput {
    const normalizer = this.findNormalizer(raw);

    if (!normalizer) {
      throw new NormalizationError(
        `No normalizer found for event type: ${JSON.stringify(raw).substring(0, 200)}`
      );
    }

    try {
      return normalizer.normalize(raw, context);
    } catch (error) {
      throw new NormalizationError(
        `Failed to normalize event: ${error instanceof Error ? error.message : 'Unknown error'}`,
        error
      );
    }
  }

  /**
   * Normalize multiple events in bulk
   */
  normalizeBulk(
    events: RawEvent[],
    context: NormalizationContext
  ): CreateSecurityEventInput[] {
    return events.map(event => this.normalize(event, context));
  }

  /**
   * Attempt to normalize an event, returning null on failure
   */
  tryNormalize(
    raw: RawEvent,
    context: NormalizationContext
  ): CreateSecurityEventInput | null {
    try {
      return this.normalize(raw, context);
    } catch (error) {
      console.error('Failed to normalize event:', error);
      return null;
    }
  }

  /**
   * Find the appropriate normalizer for a raw event
   */
  private findNormalizer(raw: RawEvent): BaseEventNormalizer<any> | undefined {
    return this.normalizers.find(normalizer => normalizer.canHandle(raw));
  }

  /**
   * Check if a normalizer exists for the event
   */
  canNormalize(raw: RawEvent): boolean {
    return this.normalizers.some(normalizer => normalizer.canHandle(raw));
  }

  /**
   * Get all registered normalizers
   */
  getNormalizers(): BaseEventNormalizer<any>[] {
    return [...this.normalizers];
  }
}

export class NormalizationError extends Error {
  constructor(
    message: string,
    public readonly cause?: unknown
  ) {
    super(message);
    this.name = 'NormalizationError';
  }
}

// Singleton instance
let registry: NormalizerRegistry | null = null;

/**
 * Get the global normalizer registry
 */
export function getNormalizerRegistry(): NormalizerRegistry {
  if (!registry) {
    registry = new NormalizerRegistry();
  }
  return registry;
}

/**
 * Reset the global registry (useful for testing)
 */
export function resetNormalizerRegistry(): void {
  registry = null;
}
