/**
 * Temporal Pattern Analysis
 * 
 * Analyzes the timing and sequence of failures to identify patterns
 * that indicate common cause failures vs. independent failures.
 */

import type { OperationalEvent, TemporalAnalysis } from "./types.js";

/**
 * Analyze temporal patterns in failure events
 */
export function analyzeTemporalPattern(events: OperationalEvent[]): TemporalAnalysis {
  if (events.length === 0) {
    const now = new Date().toISOString();
    return {
      firstFailureAt: now,
      lastFailureAt: now,
      timeSpreadSeconds: 0,
      failureRate: 0,
      simultaneousFailures: false,
      pattern: "sporadic",
      timeline: [],
    };
  }
  
  // Sort chronologically
  const sorted = [...events].sort((a, b) => 
    a.timestamp.localeCompare(b.timestamp)
  );
  
  const firstFailureAt = sorted[0]!.timestamp;
  const lastFailureAt = sorted[sorted.length - 1]!.timestamp;
  
  // Calculate time spread
  const firstTime = Date.parse(firstFailureAt);
  const lastTime = Date.parse(lastFailureAt);
  const timeSpreadSeconds = Math.max(0, (lastTime - firstTime) / 1000);
  
  // Calculate failure rate (failures per minute)
  const failureRate = timeSpreadSeconds > 0 
    ? (events.length / (timeSpreadSeconds / 60))
    : events.length;
  
  // Check for simultaneous failures (within 30 seconds)
  const simultaneousFailures = checkSimultaneousFailures(sorted, 30);
  
  // Determine pattern
  const pattern = determinePattern(sorted, timeSpreadSeconds, failureRate);
  
  // Build timeline
  const timeline = sorted.map(event => ({
    timestamp: event.timestamp,
    eventType: event.eventType,
    entityId: event.entity.id,
    entityType: event.entity.type,
  }));
  
  return {
    firstFailureAt,
    lastFailureAt,
    timeSpreadSeconds,
    failureRate,
    simultaneousFailures,
    pattern,
    timeline,
  };
}

/**
 * Check if multiple failures occurred simultaneously
 */
function checkSimultaneousFailures(
  events: OperationalEvent[],
  windowSeconds: number
): boolean {
  if (events.length < 2) return false;
  
  // Count failures in sliding time windows
  for (let i = 0; i < events.length - 1; i++) {
    const currentTime = Date.parse(events[i]!.timestamp);
    let simultaneousCount = 1;
    
    for (let j = i + 1; j < events.length; j++) {
      const nextTime = Date.parse(events[j]!.timestamp);
      const diffSeconds = (nextTime - currentTime) / 1000;
      
      if (diffSeconds <= windowSeconds) {
        simultaneousCount++;
      } else {
        break;
      }
    }
    
    // If 3+ failures within window, consider simultaneous
    if (simultaneousCount >= 3) {
      return true;
    }
  }
  
  return false;
}

/**
 * Determine failure pattern type
 */
function determinePattern(
  events: OperationalEvent[],
  timeSpreadSeconds: number,
  failureRate: number
): TemporalAnalysis["pattern"] {
  // Sudden - multiple failures within 2 minutes
  if (timeSpreadSeconds <= 120 && events.length >= 5) {
    return "sudden";
  }
  
  // Cascading - failures spread over 2-10 minutes with high rate
  if (timeSpreadSeconds > 120 && timeSpreadSeconds <= 600 && failureRate >= 1) {
    return "cascading";
  }
  
  // Gradual - failures spread over longer period with consistent rate
  if (timeSpreadSeconds > 600 && failureRate >= 0.5) {
    return "gradual";
  }
  
  // Sporadic - random timing
  return "sporadic";
}

/**
 * Calculate failure velocity (rate of change)
 */
export function calculateFailureVelocity(
  events: OperationalEvent[],
  windowMinutes: number = 5
): number {
  if (events.length === 0) return 0;
  
  const sorted = [...events].sort((a, b) => 
    a.timestamp.localeCompare(b.timestamp)
  );
  
  const lastTime = Date.parse(sorted[sorted.length - 1]!.timestamp);
  const windowStart = lastTime - (windowMinutes * 60 * 1000);
  
  const recentFailures = sorted.filter(event => 
    Date.parse(event.timestamp) >= windowStart
  );
  
  return recentFailures.length / windowMinutes;
}

/**
 * Group events into time buckets
 */
export function groupByTimeBucket(
  events: OperationalEvent[],
  bucketSizeMinutes: number
): Map<string, OperationalEvent[]> {
  const buckets = new Map<string, OperationalEvent[]>();
  
  for (const event of events) {
    const timestamp = Date.parse(event.timestamp);
    const bucketTime = Math.floor(timestamp / (bucketSizeMinutes * 60 * 1000)) * (bucketSizeMinutes * 60 * 1000);
    const bucketKey = new Date(bucketTime).toISOString();
    
    const existing = buckets.get(bucketKey) || [];
    existing.push(event);
    buckets.set(bucketKey, existing);
  }
  
  return buckets;
}

/**
 * Identify failure waves (bursts of failures)
 */
export function identifyFailureWaves(
  events: OperationalEvent[],
  minWaveSize: number = 3,
  maxGapSeconds: number = 60
): Array<{ startTime: string; endTime: string; count: number }> {
  if (events.length === 0) return [];
  
  const sorted = [...events].sort((a, b) => 
    a.timestamp.localeCompare(b.timestamp)
  );
  
  const waves: Array<{ startTime: string; endTime: string; count: number }> = [];
  let currentWave: OperationalEvent[] = [sorted[0]!];
  
  for (let i = 1; i < sorted.length; i++) {
    const prevTime = Date.parse(sorted[i - 1]!.timestamp);
    const currentTime = Date.parse(sorted[i]!.timestamp);
    const gap = (currentTime - prevTime) / 1000;
    
    if (gap <= maxGapSeconds) {
      currentWave.push(sorted[i]!);
    } else {
      // End current wave if it meets minimum size
      if (currentWave.length >= minWaveSize) {
        waves.push({
          startTime: currentWave[0]!.timestamp,
          endTime: currentWave[currentWave.length - 1]!.timestamp,
          count: currentWave.length,
        });
      }
      
      // Start new wave
      currentWave = [sorted[i]!];
    }
  }
  
  // Add final wave
  if (currentWave.length >= minWaveSize) {
    waves.push({
      startTime: currentWave[0]!.timestamp,
      endTime: currentWave[currentWave.length - 1]!.timestamp,
      count: currentWave.length,
    });
  }
  
  return waves;
}

/**
 * Calculate time to first failure (from observation start)
 */
export function calculateTimeToFirstFailure(
  events: OperationalEvent[],
  observationStartTime: string
): number {
  if (events.length === 0) return 0;
  
  const sorted = [...events].sort((a, b) => 
    a.timestamp.localeCompare(b.timestamp)
  );
  
  const startTime = Date.parse(observationStartTime);
  const firstFailureTime = Date.parse(sorted[0]!.timestamp);
  
  return Math.max(0, (firstFailureTime - startTime) / 1000);
}

/**
 * Generate temporal pattern description
 */
export function describeTemporalPattern(analysis: TemporalAnalysis): string {
  const { pattern, timeSpreadSeconds, simultaneousFailures } = analysis;
  
  switch (pattern) {
    case "sudden":
      return `Sudden failure pattern: ${analysis.timeline.length} devices failed within ${Math.round(timeSpreadSeconds / 60)} minutes, indicating a common upstream cause`;
    
    case "cascading":
      return `Cascading failure pattern: failures propagated over ${Math.round(timeSpreadSeconds / 60)} minutes, suggesting dependency-based propagation`;
    
    case "gradual":
      return `Gradual failure pattern: failures occurred over ${Math.round(timeSpreadSeconds / 60)} minutes, possibly indicating progressive degradation`;
    
    case "sporadic":
      return `Sporadic failure pattern: ${analysis.timeline.length} independent failures with no clear temporal correlation`;
  }
}
