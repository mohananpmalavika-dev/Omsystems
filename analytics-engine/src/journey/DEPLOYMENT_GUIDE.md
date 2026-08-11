# Journey System Deployment Guide

## Prerequisites

- PostgreSQL database with pgvector extension
- Node.js environment
- Existing analytics-engine running
- Database connection URL

## Installation Steps

### Step 1: Initialize Database

Run the initialization script to create all tables:

```bash
# From analytics-engine directory
DATABASE_URL="postgresql://user:pass@host:5432/dbname" \
  node --loader ts-node/esm src/journey/initialize-journey-system.ts
```

Or manually run the migration:

```bash
psql $DATABASE_URL -f migrations/001_journey_tables.sql
```

**Expected Output**:
```
✓ Database tables created
✓ global_person
✓ person_observation
✓ person_transition
✓ camera_transition_rule
✓ person_journey_session
```

### Step 2: Register API Routes

In your `app.ts` or main server file, add:

```typescript
import { registerJourneyRoutes } from './routes/journey-api.js';

// After other route registrations
await registerJourneyRoutes(app, pool);
```

This exposes the journey API endpoints at `/v1/journey/*`.

### Step 3: Configure Topology Rules

Add initial topology rules for your camera layout:

```bash
# Example: Configure topology via API
curl -X POST http://localhost:3000/v1/journey/topology/rules \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: YOUR_KEY" \
  -d '{
    "tenantId": "your-tenant-uuid",
    "branchId": "your-branch-uuid",
    "fromCameraId": "entrance-camera-uuid",
    "toCameraId": "lobby-camera-uuid",
    "minTravelSeconds": 5,
    "typicalTravelSeconds": 15,
    "maxTravelSeconds": 45,
    "bidirectional": false,
    "enabled": true
  }'
```

Or create a bootstrap script:

```typescript
// bootstrap-topology.ts
import { getCameraTopologyService } from './journey/topology.service.js';

async function bootstrapTopology(tenantId: string, branchId: string) {
  const topology = getCameraTopologyService(pool);
  
  // Define your camera layout
  await topology.upsertRule({
    tenantId,
    branchId,
    fromCameraId: 'entrance-uuid',
    toCameraId: 'lobby-uuid',
    minTravelSeconds: 5,
    typicalTravelSeconds: 15,
    maxTravelSeconds: 45,
    bidirectional: false,
    enabled: true
  });
  
  // Add more rules...
}
```

### Step 4: Integrate with Human Analytics

Apply the integration code from `human-analytics-integration.ts`:

**4a. Add to Constructor**

```typescript
// In detectors/human-analytics.ts
import { JourneyIntegration } from '../journey/human-analytics-integration.js';

class HumanAnalyticsDetector {
  private journeyIntegration: JourneyIntegration;
  
  constructor(pool: Pool) {
    // ... existing code ...
    this.journeyIntegration = new JourneyIntegration(pool);
  }
}
```

**4b. Update Frame Processing**

```typescript
async processFrame(frame: Frame) {
  // ... existing detection and tracking ...
  
  // Add embedding accumulation
  for (const track of this.activeTracks.values()) {
    if (track.currentEmbedding) {
      await this.journeyIntegration.onFrameUpdate(track.id, {
        embedding: track.currentEmbedding,
        confidence: track.confidence,
        boundingBox: track.bbox,
        frameId: frame.id,
        timestamp: frame.timestamp,
        frameWidth: frame.width,
        frameHeight: frame.height
      });
    }
  }
}
```

**4c. Handle Track Completion**

```typescript
private async onTrackEnded(track: Track) {
  const result = await this.journeyIntegration.onTrackEnded({
    id: track.id,
    tenantId: this.tenantId,
    branchId: this.branchId,
    cameraId: this.cameraId,
    startedAt: track.firstSeen,
    endedAt: track.lastSeen,
    confidence: track.averageConfidence,
    entryZone: track.entryZone,
    exitZone: track.exitZone,
    thumbnailPath: track.thumbnailPath
  });
  
  if (result) {
    console.log(`[Journey] ${result.globalPersonId} ${result.isNewIdentity ? 'NEW' : 'MATCHED'}`);
  }
}
```

**4d. Replace getPersonJourney**

```typescript
async getPersonJourney(tenantId: string, globalPersonId: string, options?) {
  return await this.journeyIntegration.getPersonJourney(
    tenantId, 
    globalPersonId, 
    options
  );
}
```

### Step 5: Restart Services

```bash
# Stop analytics engine
pm2 stop analytics-engine

# Start with journey system
pm2 start analytics-engine

# Or with npm
npm run start:analytics
```

### Step 6: Verify Installation

```bash
# Check health
curl http://localhost:3000/v1/journey/health?tenantId=YOUR_TENANT_ID

# Expected response:
{
  "status": "healthy",
  "components": {
    "observations": "operational",
    "topology": "operational",
    "vectors": "operational",
    "identityResolver": "operational",
    "transitionCorrelator": "operational"
  }
}
```

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Journey system configuration
JOURNEY_GAP_THRESHOLD_SECONDS=30
JOURNEY_SESSION_TIMEOUT_SECONDS=600

# Identity resolution thresholds
JOURNEY_REID_WEIGHT=0.55
JOURNEY_TEMPORAL_WEIGHT=0.20
JOURNEY_TOPOLOGY_WEIGHT=0.20
JOURNEY_QUALITY_WEIGHT=0.05

# Transition correlation
JOURNEY_MAX_GAP_SECONDS=600
```

### Calibration

Adjust thresholds based on your deployment:

1. **Identity Resolution Thresholds**
   - Lower if too many new identities created
   - Raise if seeing false matches

2. **Topology Travel Times**
   - Measure actual travel times between cameras
   - Add 20% buffer to min/max

3. **Gap Detection**
   - Adjust based on camera coverage density
   - 30 seconds works for most indoor deployments

## API Endpoints

All endpoints require `x-analytics-source-key` header.

### Journey Queries

```bash
# Get person journey
GET /v1/journey/persons/:globalPersonId?tenantId=xxx&from=...&to=...

# Search by embedding
POST /v1/journey/person-search
{
  "tenantId": "...",
  "embedding": [0.1, 0.2, ...],
  "minSimilarity": 0.85
}

# List observations
GET /v1/journey/persons/:globalPersonId/observations?tenantId=xxx

# Get statistics
GET /v1/journey/statistics?tenantId=xxx&branchId=xxx
```

### Topology Management

```bash
# Create rule
POST /v1/journey/topology/rules
{
  "tenantId": "...",
  "branchId": "...",
  "fromCameraId": "...",
  "toCameraId": "...",
  "minTravelSeconds": 5,
  "maxTravelSeconds": 60
}

# List rules
GET /v1/journey/topology/rules?tenantId=xxx

# Delete rule
DELETE /v1/journey/topology/rules/:ruleId?tenantId=xxx

# Auto-learn topology
POST /v1/journey/topology/learn
{
  "tenantId": "...",
  "branchId": "...",
  "minSamples": 10
}

# Get transition analytics
GET /v1/journey/topology/analytics?tenantId=xxx
```

## Testing

### Test 1: Basic Journey Creation

```bash
# 1. Start camera stream
# 2. Wait for person to appear
# 3. Query journey
curl "http://localhost:3000/v1/journey/persons/gp_xxx?tenantId=xxx"

# Should return journey with observations
```

### Test 2: Cross-Camera Tracking

```bash
# 1. Configure topology between two cameras
# 2. Walk person between cameras
# 3. Check for transition creation

# Expected: Same globalPersonId on both cameras
```

### Test 3: Search

```bash
# Take snapshot, extract embedding, search
curl -X POST http://localhost:3000/v1/journey/person-search \
  -d '{
    "tenantId": "xxx",
    "embedding": [...],
    "minSimilarity": 0.8
  }'

# Should return matching persons
```

## Monitoring

### Key Metrics

Monitor these in production:

```sql
-- Identity resolution rate
SELECT 
  COUNT(*) FILTER (WHERE global_person_id IS NOT NULL) * 100.0 / COUNT(*) as resolution_rate
FROM person_observation
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Average transition confidence
SELECT AVG(transition_confidence) as avg_confidence
FROM person_transition
WHERE created_at > NOW() - INTERVAL '1 hour';

-- New identity creation rate
SELECT COUNT(*) as new_identities
FROM global_person
WHERE created_at > NOW() - INTERVAL '1 hour';

-- Observations per hour
SELECT 
  date_trunc('hour', created_at) as hour,
  COUNT(*) as observations
FROM person_observation
WHERE created_at > NOW() - INTERVAL '24 hours'
GROUP BY hour
ORDER BY hour;
```

### Logs to Watch

```bash
# Journey tracking logs
[Journey] Track completed: track-001 → gp_12345 (NEW)
[Journey] Track completed: track-042 → gp_12345 (MATCHED)
[Journey] Created transition: cam-A → cam-B, confidence: 0.96

# Warning signs
[Journey] No embedding accumulator for track: xxx
[Journey] No representative embedding for track: xxx
[Journey] Track completion failed: ...
```

## Troubleshooting

### Issue: No observations created

**Check**:
1. Is `onTrackEnded` being called?
2. Are embeddings available?
3. Check database connectivity
4. Verify tables exist

**Debug**:
```typescript
console.log('[Journey Debug] Track ended:', track.id);
console.log('[Journey Debug] Has embedding:', !!embedding);
```

### Issue: Too many new identities

**Solutions**:
1. Check topology rules exist
2. Verify camera IDs match
3. Lower identity resolution thresholds
4. Check embedding quality

**Query**:
```sql
-- Check if identities are matching
SELECT 
  global_person_id,
  COUNT(*) as observations,
  COUNT(DISTINCT camera_id) as cameras
FROM person_observation
GROUP BY global_person_id
HAVING COUNT(*) = 1; -- Should be few
```

### Issue: False matches

**Solutions**:
1. Tighten topology travel times
2. Raise identity resolution thresholds
3. Add more specific zone matching
4. Check embedding model compatibility

### Issue: High latency

**Optimize**:
1. Ensure indexes are created
2. Use async processing for transitions
3. Cache topology rules
4. Reduce candidate search window

```typescript
// Process transitions asynchronously
setImmediate(async () => {
  await transitionCorrelator.correlate(observation);
});
```

## Maintenance

### Regular Tasks

**Daily**:
- Monitor identity resolution rate
- Check for unusual patterns
- Review gap occurrences

**Weekly**:
- Run topology learning
- Review transition analytics
- Adjust thresholds if needed

**Monthly**:
- Archive old observations (retention policy)
- Analyze journey statistics
- Update topology rules

### Retention Policy

Set up automatic cleanup:

```sql
-- Delete old observations (example: 90 days)
DELETE FROM person_observation
WHERE created_at < NOW() - INTERVAL '90 days';

-- Archive transitions
INSERT INTO person_transition_archive
SELECT * FROM person_transition
WHERE created_at < NOW() - INTERVAL '180 days';

DELETE FROM person_transition
WHERE created_at < NOW() - INTERVAL '180 days';
```

Or use the repository methods:

```typescript
await observations.deleteOlderThan(tenantId, 90); // days
await vectors.deleteOlderThan(tenantId, 90);
```

## Performance Tuning

### Database

```sql
-- Analyze tables regularly
ANALYZE global_person;
ANALYZE person_observation;
ANALYZE person_transition;

-- Monitor query performance
EXPLAIN ANALYZE
SELECT * FROM person_observation
WHERE tenant_id = 'xxx' AND global_person_id = 'yyy'
ORDER BY entered_at DESC;
```

### Application

```typescript
// Cache topology rules
const topologyCache = new Map<string, CameraTransitionRule>();

// Batch processing
const pendingTracks = [];
// ... collect tracks ...
await Promise.all(pendingTracks.map(t => handleTrackCompleted(t)));
```

## Rollback Plan

If issues occur:

1. **Disable Journey Processing**:
   ```typescript
   // Comment out in human-analytics.ts
   // await this.journeyIntegration.onTrackEnded(track);
   ```

2. **Revert to Old getPersonJourney**:
   ```typescript
   getPersonJourney(globalPersonId: string) {
     return {
       globalPersonId,
       appearances: [],
       status: 'UNAVAILABLE',
       statusReason: 'Journey system temporarily disabled'
     };
   }
   ```

3. **Keep Data**: Tables remain, just stop populating

## Support

- **Architecture**: See `README.md`
- **Integration**: See `INTEGRATION_GUIDE.md`
- **Status**: See `IMPLEMENTATION_STATUS.md`
- **API Reference**: See `journey.types.ts`

## Success Criteria

System is working correctly when:

- ✅ Observations are created for each track
- ✅ 70-90% of observations resolve to existing identities
- ✅ Transitions have >0.8 average confidence
- ✅ Journey queries return complete timelines
- ✅ No performance degradation in frame processing

---

**Deployment Checklist**:

- [ ] Database tables created
- [ ] Indexes verified
- [ ] API routes registered
- [ ] Topology rules configured
- [ ] Integration code applied
- [ ] Services restarted
- [ ] Health check passing
- [ ] Test journey created
- [ ] Monitoring enabled
- [ ] Documentation reviewed
