/**
 * Digital Twin Collectors
 * 
 * Infrastructure discovery collectors that populate the digital twin
 * from existing surveillance system components.
 */

export { BaseCollector, TwinCollector } from './base-collector';
export { CameraCollector } from './camera.collector';
export { NetworkCollector } from './network.collector';
export { RecorderCollector } from './recorder.collector';
export { StorageCollector } from './storage.collector';
export { HierarchyCollector } from './hierarchy.collector';

import { Pool } from 'pg';
import { TwinCollector } from './base-collector';
import { CameraCollector } from './camera.collector';
import { NetworkCollector } from './network.collector';
import { RecorderCollector } from './recorder.collector';
import { StorageCollector } from './storage.collector';
import { HierarchyCollector } from './hierarchy.collector';
import { CollectorResult } from '../models';

/**
 * Run all collectors and aggregate results
 */
export async function runAllCollectors(pool: Pool): Promise<{
  results: Map<string, CollectorResult>;
  totalAssets: number;
  totalRelationships: number;
  totalErrors: number;
}> {
  const collectors: TwinCollector[] = [
    new HierarchyCollector(pool),    // Run first to establish structure
    new NetworkCollector(pool),      // Run second for network infrastructure
    new StorageCollector(pool),      // Storage systems
    new RecorderCollector(pool),     // Recording servers
    new CameraCollector(pool)        // Cameras last (depend on all above)
  ];

  const results = new Map<string, CollectorResult>();
  let totalAssets = 0;
  let totalRelationships = 0;
  let totalErrors = 0;

  console.log('[DigitalTwin] Running infrastructure collectors...');

  for (const collector of collectors) {
    try {
      console.log(`[DigitalTwin] Running ${collector.getName()}...`);
      const result = await collector.collect();
      
      results.set(collector.getName(), result);
      totalAssets += result.assets.length;
      totalRelationships += result.relationships.length;
      totalErrors += result.errors?.length || 0;

      console.log(
        `[DigitalTwin] ${collector.getName()} completed: ` +
        `${result.assets.length} assets, ${result.relationships.length} relationships, ` +
        `${result.errors?.length || 0} errors`
      );

    } catch (error) {
      console.error(`[DigitalTwin] Error running ${collector.getName()}:`, error);
      totalErrors++;
    }
  }

  console.log(
    `[DigitalTwin] Collection complete: ` +
    `${totalAssets} assets, ${totalRelationships} relationships, ${totalErrors} errors`
  );

  return {
    results,
    totalAssets,
    totalRelationships,
    totalErrors
  };
}

/**
 * Create collectors for a specific pool
 */
export function createCollectors(pool: Pool): TwinCollector[] {
  return [
    new HierarchyCollector(pool),
    new NetworkCollector(pool),
    new StorageCollector(pool),
    new RecorderCollector(pool),
    new CameraCollector(pool)
  ];
}
