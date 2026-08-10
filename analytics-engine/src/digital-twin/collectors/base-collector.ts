/**
 * Base Collector Interface
 * 
 * Common interface for all infrastructure collectors.
 */

import { DigitalTwinAsset, TwinRelationship, CollectorResult } from '../models';

export interface TwinCollector {
  /**
   * Collect assets and relationships from infrastructure
   */
  collect(): Promise<CollectorResult>;
  
  /**
   * Get collector name for logging
   */
  getName(): string;
}

export abstract class BaseCollector implements TwinCollector {
  abstract collect(): Promise<CollectorResult>;
  abstract getName(): string;
  
  /**
   * Helper to create collector result
   */
  protected createResult(
    assets: DigitalTwinAsset[],
    relationships: TwinRelationship[],
    errors: Array<{ message: string; assetId?: string }> = []
  ): CollectorResult {
    return {
      assets,
      relationships,
      errors,
      collectedAt: new Date()
    };
  }
  
  /**
   * Helper to handle collector errors
   */
  protected handleError(error: unknown, context: string): { message: string } {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[${this.getName()}] Error in ${context}:`, message);
    return { message: `${context}: ${message}` };
  }
}
