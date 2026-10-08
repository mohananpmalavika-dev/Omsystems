# Journey System Integration Guide

## Implementation Status

### ✅ Completed Components

1. **Type Definitions** (`journey.types.ts`)
   - All interfaces defined with proper provenance
   - Confidence scoring structures
   - Gap representation
   - Search and query types

2. **Embedding Service** (`embedding.service.ts`)
   - TrackEmbeddingAccumulator with quality filtering
   - Multi-factor quality assessment
   - Weighted averaging and normalization
   - Validation utilities

3. **Observation Repository** (`observation.repository.ts`)
   - PostgreSQL persistence with indexes
   - Tenant-isolated queries
   - Constrained candidate search
   - Dwell time analytics
   - Statistics and retention

4. **Topology Service** (`topology.service.ts`)
   - Camera transition rules
   - Reachability calculations
   - Temporal feasibility scoring
   - Auto-learning from observations
   - Zone-aware matching

5. **ReID Vector Repository** (`reid-vector.repository.ts`)
   - Wraps existing vector-store.service.ts
   - Observation linking
   - Tenant-aware vector search
   - Model version filtering
   - Similarity comparison

6. **Global Identity Resolver** (`global-identity-resolver.ts`)
   - Multi-factor scoring (ReID + topology + temporal + quality)
   - Constrained candidate generation
   - Threshold-based decisions
   - New identity creation
   - Identity merging support

7. **Transition Correlator** (`transition-correlator.ts`)
   - Transition creation between observations
   - Confidence scoring with components
   - Status determination (CONFIRMED/PROBABLE/AMBIGUOUS/REJECTED)
   - Analytics for learning

### 🔨 Remaining Work

8. **Journey Service** (`journey.service.ts`)
   - Orchestrates all components
   - Handles track completion events
   - Builds complete journeys with gaps
   - Person search by image
   - Session management
   - Journey statistics

9. **Journey API Routes** (`routes/journey-api.ts`)
   - REST endpoints for journey queries
   - Person search endpoint
   - Topology management endpoints
   - Analytics endpoints

10. **Integration with Human Analytics**
    - Wire track completion events
    - Replace getPersonJourney() implementation
    - Add embedding accumulation to tracker

11. **Database Migrations**
    - Create migration scripts for all tables
    - Add proper constraints and indexes
    - Handle existing data if any

12. **Event Bus Integration**
    - Wire journey events into existing event system
    - Handle track completion
    - Trigger identity resolution asynchronously

## Quick Start Integration

### Step 1: Initialize Services

```typescript
// In analytics-pipeline.ts or app.ts
import { Pool } from 'pg';
import { getObservationRepository } from './journey/observation.repository.js';
import { getCameraTopologyService } from './journey/topology.service.js';
import { getReIdVectorRepository } from './journey/reid-vector.repository.js';
import { getGlobalIdentityResolver } from './journey/global-identity-resolver.js';
import { getPersonTransitionCorrelator } from './journey/transition-correlator.ts';

// Assuming you have a database pool
const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Initialize repositories and services
const observationRepo = getObservationRepository(pool);
const topologyService = getCameraTopologyService(pool);
const vectorRepo = getReIdVectorRepository(pool);

const identityResolver = getGlobalIdentityResolver(
  pool,
  observationRepo,
  topologyService,
  vectorRepo
);

const transitionCorrelator = getPersonTransitionCorrelator(
  pool,
  observationRepo,
  topologyService,
  vectorRepo
);

// Initialize tables
await observationRepo.initialize();
await topologyService.initialize();
await vectorRepo.initialize();
await identityResolver.initialize();
await transitionCorrelator.initialize();
```

### Step 2: Handle Track Completion

```typescript
// In human-analytics.ts or tracking layer
import { getEmbeddingService } from './journey/embedding.service.js';

class PersonTracker {
  private embeddingAccumulators = new Map<string, TrackEmbeddingAccumulator>();
  
  async onFrameUpdate(trackId: string, detection: Detection) {
    // Get or create accumulator for this track
    let accumulator = this.embeddingAccumulators.get(trackId);
    if (!accumulator) {
      const embeddingService = getEmbeddingService();
      accumulator = embeddingService.createTrackAccumulator();
      this.embeddingAccumulators.set(trackId, accumulator);
    }
    
    // If we have an embedding for this detection, add it
    if (detection.embedding) {
      const quality = assessQuality(detection); // Implement quality assessment
      accumulator.add(
        detection.embedding,
        detection.confidence,
        quality,
        detection.frameId,
        detection.timestamp,
        detection.boundingBox
      );
    }
  }
  
  async onTrackEnded(track: PersonTrack) {
    const accumulator = this.embeddingAccumulators.get(track.id);
    if (!accumulator) {
      console.warn('No embedding accumulator for track:', track.id);
      return;
    }
    
    const representativeEmbedding = accumulator.getRepresentativeEmbedding();
    if (!representativeEmbedding) {
      console.warn('No representative embedding for track:', track.id);
      return;
    }
    
    // Create observation
    const observation = await observationRepo.create({
      tenantId: track.tenantId,
      branchId: track.branchId,
      cameraId: track.cameraId,
      trackId: track.id,
      enteredAt: track.startedAt,
      exitedAt: track.endedAt,
      embedding: representativeEmbedding,
      embeddingQuality: accumulator.getAverageQuality(),
      detectionConfidence: track.confidence,
      entryZoneId: track.entryZone,
      exitZoneId: track.exitZone,
      thumbnailUri: track.thumbnailPath
    });
    
    // Store embedding in vector database
    const embeddingId = await vectorRepo.storeEmbedding(
      track.tenantId,
      observation.id,
      representativeEmbedding,
      'osnet_x1_0', // Your ReID model name
      '2026-08-01',  // Your model version
      accumulator.getAverageQuality()
    );
    
    // Link embedding to observation
    await observationRepo.linkEmbedding(observation.id, embeddingId);
    
    // Resolve identity (can be async)
    const identity = await identityResolver.resolve(observation);
    
    // Assign global person ID
    await observationRepo.assignGlobalIdentity(
      observation.id,
      identity.globalPersonId,
      identity.confidence,
      identity.method
    );
    
    // Link embedding to global person
    await vectorRepo.linkToGlobalPerson(embeddingId, identity.globalPersonId);
    
    // Update global person last seen
    if (!identity.isNewIdentity) {
      await identityResolver.updateLastSeen(identity.globalPersonId, track.endedAt);
    }
    
    // Correlate transition (can be async)
    const transition = await transitionCorrelator.correlate(observation);
    if (transition) {
      console.log(`Created transition: ${transition.fromCameraId} → ${transition.toCameraId}, confidence: ${transition.transitionConfidence}`);
    }
    
    // Clean up accumulator
    this.embeddingAccumulators.delete(track.id);
  }
}
```

### Step 3: Replace getPersonJourney()

```typescript
// In human-analytics.ts
async getPersonJourney(
  tenantId: string,
  globalPersonId: string,
  options?: {
    from?: Date;
    to?: Date;
    branchId?: string;
  }
): Promise<PersonJourney> {
  // Get observations
  const observations = await observationRepo.findByGlobalPerson({
    tenantId,
    globalPersonId,
    branchId: options?.branchId,
    from: options?.from,
    to: options?.to
  });
  
  if (observations.length === 0) {
    return {
      globalPersonId,
      startedAt: null,
      endedAt: null,
      totalDurationMs: 0,
      cameraCount: 0,
      branchCount: 0,
      appearances: [],
      transitions: [],
      unresolvedGaps: [],
      overallConfidence: 0,
      status: 'UNAVAILABLE',
      statusReason: 'No observations found for this person'
    };
  }
  
  // Get transitions
  const transitions = await transitionCorrelator.findByGlobalPerson(
    tenantId,
    globalPersonId,
    options?.from,
    options?.to
  );
  
  // Build journey
  return this.buildJourney(globalPersonId, observations, transitions);
}

private buildJourney(
  globalPersonId: string,
  observations: PersonObservation[],
  transitions: PersonTransition[]
): PersonJourney {
  // Sort observations by time
  observations.sort((a, b) => a.enteredAt.getTime() - b.enteredAt.getTime());
  
  const appearances: JourneyAppearance[] = observations.map(obs => ({
    observationId: obs.id,
    cameraId: obs.cameraId,
    cameraName: `Camera ${obs.cameraId.substring(0, 8)}`, // TODO: Get real camera name
    branchId: obs.branchId,
    enteredAt: obs.enteredAt,
    exitedAt: obs.exitedAt,
    durationMs: obs.exitedAt.getTime() - obs.enteredAt.getTime(),
    trackId: obs.trackId,
    thumbnailUri: obs.thumbnailUri,
    entryZoneId: obs.entryZoneId,
    exitZoneId: obs.exitZoneId,
    identityConfidence: obs.identityConfidence || 0.5
  }));
  
  const journeyTransitions: JourneyTransition[] = transitions.map(trans => ({
    transitionId: trans.id,
    fromObservationId: trans.fromObservationId,
    toObservationId: trans.toObservationId,
    fromCameraId: trans.fromCameraId,
    fromCameraName: `Camera ${trans.fromCameraId.substring(0, 8)}`,
    toCameraId: trans.toCameraId,
    toCameraName: `Camera ${trans.toCameraId.substring(0, 8)}`,
    departedAt: trans.departedAt,
    arrivedAt: trans.arrivedAt,
    travelTimeMs: trans.travelTimeMs,
    confidence: trans.transitionConfidence,
    status: trans.status
  }));
  
  // Detect gaps
  const gaps = this.detectGaps(observations, transitions);
  
  // Calculate metrics
  const uniqueCameras = new Set(observations.map(o => o.cameraId));
  const uniqueBranches = new Set(observations.map(o => o.branchId));
  
  const startedAt = observations[0].enteredAt;
  const endedAt = observations[observations.length - 1].exitedAt;
  const totalDurationMs = endedAt.getTime() - startedAt.getTime();
  
  const avgConfidence = observations.reduce((sum, obs) => 
    sum + (obs.identityConfidence || 0.5), 0) / observations.length;
  
  return {
    globalPersonId,
    startedAt,
    endedAt,
    totalDurationMs,
    cameraCount: uniqueCameras.size,
    branchCount: uniqueBranches.size,
    appearances,
    transitions: journeyTransitions,
    unresolvedGaps: gaps,
    overallConfidence: avgConfidence,
    status: gaps.length > 0 ? 'PARTIAL' : 'COMPLETE'
  };
}

private detectGaps(
  observations: PersonObservation[],
  transitions: PersonTransition[]
): JourneyGap[] {
  const gaps: JourneyGap[] = [];
  const transitionMap = new Map<string, PersonTransition>();
  
  transitions.forEach(t => {
    transitionMap.set(t.fromObservationId, t);
  });
  
  for (let i = 0; i < observations.length - 1; i++) {
    const current = observations[i];
    const next = observations[i + 1];
    
    const transition = transitionMap.get(current.id);
    
    // If no transition, or transition confidence is very low, mark as gap
    if (!transition || transition.transitionConfidence < 0.5) {
      const gapDurationMs = next.enteredAt.getTime() - current.exitedAt.getTime();
      
      // Only mark as gap if significant time passed
      if (gapDurationMs > 30000) { // > 30 seconds
        gaps.push({
          type: 'UNRESOLVED_GAP',
          afterObservationId: current.id,
          beforeObservationId: next.id,
          afterCameraId: current.cameraId,
          beforeCameraId: next.cameraId,
          gapStartedAt: current.exitedAt,
          gapEndedAt: next.enteredAt,
          durationMs: gapDurationMs,
          confidence: transition?.transitionConfidence || 0.3
        });
      }
    }
  }
  
  return gaps;
}
```

### Step 4: Add Topology Rules

```typescript
// Bootstrap topology for your site
async function bootstrapTopology(tenantId: string, branchId: string) {
  const topology = getCameraTopologyService(pool);
  
  // Example: Define camera transitions
  await topology.upsertRule({
    tenantId,
    branchId,
    fromCameraId: 'entrance-cam-uuid',
    toCameraId: 'lobby-cam-uuid',
    minTravelSeconds: 5,
    typicalTravelSeconds: 15,
    maxTravelSeconds: 45,
    bidirectional: false,
    enabled: true
  });
  
  await topology.upsertRule({
    tenantId,
    branchId,
    fromCameraId: 'lobby-cam-uuid',
    toCameraId: 'corridor-a-uuid',
    minTravelSeconds: 8,
    typicalTravelSeconds: 20,
    maxTravelSeconds: 60,
    bidirectional: true, // Can go both ways
    enabled: true
  });
  
  // ... add more rules
  
  // Or enable auto-learning
  const learnedRules = await topology.learnFromObservations(tenantId, branchId, 10);
  console.log(`Learned ${learnedRules} topology rules from observations`);
}
```

## Testing

### Test Journey Creation

```typescript
// Create a test scenario
async function testJourneyTracking() {
  const tenantId = 'test-tenant-uuid';
  const branchId = 'test-branch-uuid';
  
  // Simulate person appearing on Camera A
  const obs1 = await observationRepo.create({
    tenantId,
    branchId,
    cameraId: 'camera-a-uuid',
    trackId: 'track-001',
    enteredAt: new Date('2026-08-11T14:00:00Z'),
    exitedAt: new Date('2026-08-11T14:00:30Z'),
    embedding: new Float32Array(512).fill(0.5),
    embeddingQuality: 0.85,
    detectionConfidence: 0.92
  });
  
  // Resolve identity (should create new)
  const identity1 = await identityResolver.resolve(obs1);
  await observationRepo.assignGlobalIdentity(
    obs1.id, identity1.globalPersonId, identity1.confidence, identity1.method
  );
  
  console.log('Created global person:', identity1.globalPersonId);
  
  // Simulate same person on Camera B (20 seconds later)
  const obs2 = await observationRepo.create({
    tenantId,
    branchId,
    cameraId: 'camera-b-uuid',
    trackId: 'track-042',
    enteredAt: new Date('2026-08-11T14:00:50Z'),
    exitedAt: new Date('2026-08-11T14:01:20Z'),
    embedding: new Float32Array(512).fill(0.52), // Similar embedding
    embeddingQuality: 0.88,
    detectionConfidence: 0.89
  });
  
  // Resolve identity (should match existing)
  const identity2 = await identityResolver.resolve(obs2);
  await observationRepo.assignGlobalIdentity(
    obs2.id, identity2.globalPersonId, identity2.confidence, identity2.method
  );
  
  console.log('Matched to:', identity2.globalPersonId);
  console.log('Is same person?', identity1.globalPersonId === identity2.globalPersonId);
  
  // Create transition
  const transition = await transitionCorrelator.correlate(obs2);
  console.log('Transition:', transition);
  
  // Get journey
  const journey = await getPersonJourney(tenantId, identity1.globalPersonId);
  console.log('Journey:', JSON.stringify(journey, null, 2));
}
```

## Performance Optimization

### 1. Async Processing
Don't block frame processing for journey operations:

```typescript
// After creating observation
setImmediate(async () => {
  try {
    const identity = await identityResolver.resolve(observation);
    await observationRepo.assignGlobalIdentity(...);
    await transitionCorrelator.correlate(observation);
  } catch (error) {
    console.error('Journey processing error:', error);
  }
});
```

### 2. Batch Operations
Process multiple tracks together when possible.

### 3. Caching
Cache topology rules and recent global persons:

```typescript
const topologyCache = new Map<string, CameraTransitionRule>();
const personCache = new LRU<string, GlobalPerson>({ max: 1000 });
```

## Monitoring

### Key Metrics to Track

1. **Identity Resolution Rate**
   - % of observations with global person ID
   - New identity creation rate

2. **Transition Quality**
   - Average transition confidence
   - Status distribution (CONFIRMED/PROBABLE/AMBIGUOUS)

3. **Journey Completeness**
   - Average gaps per journey
   - Journey continuity score

4. **Performance**
   - Identity resolution latency
   - Observation persistence latency
   - Vector search latency

```typescript
// Add metrics
const identityResolutionTime = Date.now();
const identity = await identityResolver.resolve(observation);
const latency = Date.now() - identityResolutionTime;
console.log(`Identity resolved in ${latency}ms`);
```

## Troubleshooting

### Issue: No identity matches
**Check**:
- Topology rules exist for camera pairs
- Travel times are within bounds
- Embedding model version is consistent
- Quality thresholds not too high

### Issue: Too many new identities
**Adjust**:
- Lower identity resolution thresholds
- Increase topology search window
- Check embedding quality
- Verify model compatibility

### Issue: False matches
**Adjust**:
- Increase topology weight
- Tighten travel time bounds
- Raise identity resolution thresholds
- Add more specific topology rules

## Next Steps

1. Implement JourneyService to orchestrate everything
2. Create REST API endpoints
3. Add database migrations
4. Wire into existing event bus
5. Add UI components for journey visualization
6. Implement anomaly detection rules
7. Add retention policy enforcement
8. Build administrative tools for identity management

## Security Considerations

- All queries are tenant-isolated
- Vector searches include tenant constraint
- Audit trail for identity operations
- Configurable retention policies
- Role-based access to journey data

## Support

For questions or issues with integration, refer to:
- `README.md` - Architecture overview
- Type definitions in `journey.types.ts`
- Individual service documentation in each file
