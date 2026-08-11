# Cross-Camera Journey System - Implementation Status

## 🎯 Project Goal

Replace the incomplete `getPersonJourney()` stub in `human-analytics.ts` with a production-grade cross-camera tracking system that provides:
- Persistent observation storage
- Confidence-scored identity resolution  
- Topology-aware transition correlation
- Complete journey reconstruction with explicit gap detection
- Investigation timeline support
- Cross-camera person search

## ✅ Completed Components (7/12)

### 1. Type Definitions ✓
**File**: `journey.types.ts`

Complete TypeScript interfaces for all journey entities:
- `PersonObservation` - Track on one camera with provenance
- `PersonTransition` - Confidence-scored transitions
- `GlobalPerson` - Cross-camera identity
- `JourneySession` - Time-bounded journey groups
- `CameraTransitionRule` - Topology rules
- `PersonJourney` - Complete journey with gaps
- Supporting types for searches, gaps, candidates, etc.

**Key Design**: Provenance tracking at every level (who, how, when, confidence)

### 2. Embedding Service ✓
**File**: `embedding.service.ts`

**Classes**:
- `TrackEmbeddingAccumulator` - Collects quality-filtered samples
- `EmbeddingQualityAssessor` - Multi-factor quality scoring
- `EmbeddingService` - Main service interface

**Features**:
- Quality filtering (resolution, occlusion, blur, pose, lighting)
- Weighted averaging of best samples
- One embedding per track (not per frame)
- Validation and normalization utilities

**Usage**:
```typescript
const accumulator = embeddingService.createTrackAccumulator();
accumulator.add(embedding, confidence, quality, frameId, timestamp, bbox);
const representative = accumulator.getRepresentativeEmbedding();
```

### 3. Observation Repository ✓
**File**: `observation.repository.ts`

**Features**:
- PostgreSQL persistence with proper indexes
- Tenant-isolated queries
- Constrained candidate search for identity matching
- Dwell time analytics
- Statistics and retention policies

**Key Methods**:
- `create()` - Store new observation
- `assignGlobalIdentity()` - Link to global person
- `findByGlobalPerson()` - Query journey
- `findRecentCandidates()` - Get candidates for matching
- `findWithDwellTime()` - Dwell analytics

**Database Table**: `person_observation`

### 4. Topology Service ✓
**File**: `topology.service.ts`

**Features**:
- Camera transition rules (min/max/typical travel times)
- Reachability calculations
- Temporal feasibility scoring
- Auto-learning from observed transitions
- Zone-aware matching (entry/exit zones)

**Key Methods**:
- `upsertRule()` - Add/update transition rule
- `getReachableCameras()` - Find feasible destinations
- `scoreTransition()` - Score based on topology + time
- `learnFromObservations()` - Auto-tune from data

**Database Table**: `camera_transition_rule`

### 5. ReID Vector Repository ✓
**File**: `reid-vector.repository.ts`

**Features**:
- Wraps existing `vector-store.service.ts`
- Observation linking
- Tenant-aware vector search
- Model version filtering
- Similarity comparison

**Key Methods**:
- `storeEmbedding()` - Store with observation link
- `searchSimilar()` - Tenant + branch + model filtered search
- `compareSimilarity()` - Compare two embeddings
- `linkToGlobalPerson()` - Update global person ID

**Extends**: `reid_embeddings` table

### 6. Global Identity Resolver ✓
**File**: `global-identity-resolver.ts`

**Features**:
- Multi-factor scoring: ReID (55%) + Temporal (20%) + Topology (20%) + Quality (5%)
- Constrained candidate generation (topology-aware)
- Threshold-based decisions (CONFIRMED ≥ 0.92, PROBABLE ≥ 0.80)
- New identity creation
- Identity merging support

**Key Methods**:
- `resolve()` - Match observation to global person
- `createNewIdentity()` - Create new global person
- `mergeGlobalPersons()` - Merge duplicate identities

**Algorithm**:
```
1. Get embedding for observation
2. Find reachable cameras from topology
3. Search recent candidates on those cameras
4. Score each candidate (ReID + topology + temporal + quality)
5. If best score ≥ threshold → match
6. Else → create new identity
```

**Database Table**: `global_person`

### 7. Transition Correlator ✓
**File**: `transition-correlator.ts`

**Features**:
- Creates transitions between observations
- Multi-component confidence scoring
- Status determination (CONFIRMED/PROBABLE/AMBIGUOUS/REJECTED)
- Transition analytics for learning

**Key Methods**:
- `correlate()` - Create transition for new observation
- `findByGlobalPerson()` - Query transitions
- `getAnalytics()` - Transition statistics

**Scoring**: Topology (40%) + ReID (40%) + Temporal (20%)

**Database Table**: `person_transition`

## 📋 Remaining Work (5/12)

### 8. Journey Service (Not Started)
**File**: `journey.service.ts` (needs creation)

**Responsibilities**:
- Orchestrate all components
- Handle track completion events
- Build complete journeys with gap detection
- Person search by image
- Session management
- Journey statistics

**Core API**:
```typescript
class JourneyService {
  async handleTrackCompleted(track: PersonTrack): Promise<void>
  async getPersonJourney(tenantId, globalPersonId, options): Promise<PersonJourney>
  async searchPerson(request: PersonSearchRequest): Promise<PersonSearchMatch[]>
  async getJourneyStatistics(tenantId, branchId): Promise<JourneyStatistics>
}
```

**Estimated Effort**: 2-3 hours

### 9. Journey API Routes (Not Started)
**File**: `routes/journey-api.ts` (needs creation)

**Endpoints Needed**:
- `GET /v1/persons/:globalPersonId/journey` - Get journey
- `POST /v1/person-search` - Search by image
- `GET /v1/persons/:globalPersonId/observations` - List observations
- `GET /v1/observations/:observationId` - Get observation
- `POST /v1/topology/rules` - Manage topology
- `GET /v1/topology/analytics` - Transition analytics
- `GET /v1/journey/statistics` - Overall stats

**Estimated Effort**: 2 hours

### 10. Integration with Human Analytics (Partial)
**File**: `detectors/human-analytics.ts` (needs modification)

**Changes Needed**:
1. Add embedding accumulator to tracker
2. Wire `onTrackEnded` handler
3. Replace `getPersonJourney()` implementation
4. Handle track completion events

**Reference**: See `INTEGRATION_GUIDE.md` for exact code

**Estimated Effort**: 3-4 hours

### 11. Database Migrations (Not Started)
**Files**: Create migration scripts

**Tables to Migrate**:
- ✓ `person_observation` (defined in repository)
- ✓ `camera_transition_rule` (defined in topology)
- ✓ `global_person` (defined in resolver)
- ✓ `person_transition` (defined in correlator)
- ✓ Extensions to `reid_embeddings` (defined in vector repo)
- ⚠️ `person_journey_session` (needs separate migration)

**Estimated Effort**: 1-2 hours

### 12. Event Bus Integration (Not Started)
**Changes Needed**:
- Wire journey events into existing event infrastructure
- Handle `track.completed` events
- Trigger async identity resolution
- Emit journey events for downstream consumers

**Estimated Effort**: 1-2 hours

## 📊 Progress Summary

```
Core Infrastructure:     ████████████████████ 100% (7/7)
Service Layer:           ░░░░░░░░░░░░░░░░░░░░   0% (0/1)
API Layer:               ░░░░░░░░░░░░░░░░░░░░   0% (0/1)
Integration:             ░░░░░░░░░░░░░░░░░░░░   0% (0/3)

Overall Progress:        ██████████░░░░░░░░░░  58% (7/12)
```

## 🎓 What We Built

### Before
```typescript
getPersonJourney(globalPersonId: string) {
  return {
    globalPersonId,
    appearances: [],  // ← Empty!
    firstSeen: this.reIdDatabase.lastSeen.get(globalPersonId),
    lastSeen: this.reIdDatabase.lastSeen.get(globalPersonId),
  };
}
```

### After (Architecture)
```
Local Track (camera-specific, temporary)
          ↓
Representative Embedding (quality-filtered, aggregated)
          ↓
PersonObservation (persistent, tenant-isolated)
          ↓
GlobalIdentityResolver (multi-factor scoring)
          ↓
GlobalPerson (cross-camera identity)
          ↓
TransitionCorrelator (confidence-scored transitions)
          ↓
PersonJourney (complete timeline with gaps)
          ↓
Investigation APIs & Analytics
```

## 🔑 Key Architectural Decisions

### 1. Three-Level Identity Model
- **Track ID**: Local to one camera stream
- **Observation ID**: Persistent record of a track
- **Global Person ID**: Cross-camera identity

This separation prevents the common mistake of treating track IDs as person identities.

### 2. Multi-Factor Identity Matching
Never match on embedding similarity alone:
- ReID similarity: 55%
- Temporal feasibility: 20%
- Topology probability: 20%
- Observation quality: 5%

Example: High embedding similarity from cameras 500m apart with 1-second travel time → Rejected

### 3. Explicit Uncertainty
- Gaps marked as `JourneyGap` objects
- Transition status: CONFIRMED/PROBABLE/AMBIGUOUS/REJECTED
- Never claim certainty we don't have

### 4. Constrained Candidate Search
Instead of: "Compare against every person in the enterprise"

Do:
1. Get reachable cameras from topology (10-20 cameras)
2. Find recent observations on those cameras (50-100 observations)
3. Compare embeddings only for those candidates

Changes O(millions) to O(tens).

### 5. Event-Driven Processing
Journey construction happens as observations arrive, not on query:
```
track.ended → create observation → resolve identity → correlate transition
```

Query just reads pre-computed journey from database.

### 6. Provenance Everywhere
Every association records:
- Method: REID, TOPOLOGY_REID, MANUAL
- Confidence: 0-1 score
- Components: What factors contributed
- Timestamp: When decided

Enables auditing, debugging, and identity splits.

## 📐 Database Schema

All tables include proper:
- Primary keys
- Foreign key relationships
- Check constraints (confidence 0-1, time ordering)
- Indexes for query patterns
- Tenant isolation columns

**Storage Estimate**:
- ~500 bytes per observation
- ~200 bytes per transition
- ~100 bytes per embedding reference
- For 100 cameras @ 10 people/hour = ~2MB/hour = ~1.4GB/month

## 🚀 Next Steps to Production

### Immediate (Complete the System)
1. **Implement JourneyService** (2-3 hours)
   - Orchestration of all components
   - Gap detection logic
   - Session management

2. **Create API Routes** (2 hours)
   - REST endpoints for journey queries
   - Person search endpoint

3. **Wire Integration** (3-4 hours)
   - Modify human-analytics.ts
   - Add embedding accumulation
   - Handle track completion

4. **Database Migrations** (1-2 hours)
   - Create migration scripts
   - Test on dev database

5. **Event Bus Integration** (1-2 hours)
   - Wire existing event infrastructure
   - Handle async processing

**Total Estimated Remaining Effort**: 9-14 hours

### Testing & Calibration
1. Test with real camera streams
2. Calibrate confidence thresholds for your hardware
3. Tune topology rules for your site layout
4. Validate tenant isolation
5. Performance testing

### Enhancement (Post-MVP)
1. Anomaly detection rules on journey graph
2. Suspicious journey patterns
3. UI components for journey visualization
4. Auto-learning topology improvements
5. Retention policy automation
6. Identity split/merge administrative tools

## 📚 Documentation Created

1. **README.md** - Architecture overview and design principles
2. **INTEGRATION_GUIDE.md** - Step-by-step integration code
3. **IMPLEMENTATION_STATUS.md** - This file

All code includes:
- JSDoc comments
- Type safety
- Error handling
- Console logging for debugging

## 🎯 Success Criteria

### Functionality
- ✅ Persistent observation storage
- ✅ Confidence-scored identity resolution
- ✅ Topology-aware matching
- ✅ Transition correlation
- ⚠️ Journey reconstruction (needs JourneyService)
- ⚠️ Gap detection (needs JourneyService)
- ⚠️ Person search (needs JourneyService)

### Non-Functional
- ✅ Tenant isolation at all levels
- ✅ Scalable candidate search
- ✅ Model version compatibility
- ✅ Audit trail support
- ✅ Retention policy hooks
- ⚠️ Performance testing needed
- ⚠️ Integration testing needed

### Production Readiness
- ✅ Type safety throughout
- ✅ Error handling
- ✅ Logging
- ✅ Configuration
- ⚠️ Migrations pending
- ⚠️ API documentation needed
- ⚠️ Deployment guide needed

## 💡 Key Insights

### What Makes This Different
Most ReID systems:
- Match on embedding similarity alone → False positives
- Keep everything in memory → No persistence
- No topology constraints → Impossible transitions accepted
- No provenance → Can't debug or split identities
- Return false certainty → Dangerous for security

This system:
- ✅ Multi-factor scoring with topology
- ✅ Persistent with audit trail
- ✅ Topology-aware feasibility checks
- ✅ Full provenance tracking
- ✅ Explicit uncertainty representation

### Complexity Trade-offs
**Increased Complexity**:
- More tables (5 vs 1)
- More services (7 vs 1)
- Async processing required

**Value Delivered**:
- Production-grade accuracy
- Investigation timeline support
- Anomaly detection foundation
- Audit trail
- Scalability

**Verdict**: Complexity is justified for a CCTV product where accuracy matters.

## 🔧 Quick Start Commands

```bash
# Initialize all tables
npm run init-journey-db

# Start analytics engine with journey support
npm run start:analytics

# Test journey tracking
npm run test:journey

# View topology rules
npm run topology:list

# Learn topology from observations
npm run topology:learn

# Get journey statistics
npm run journey:stats
```

*(These commands need to be added to package.json)*

## 📞 Support

**Architecture Questions**: See `README.md`
**Integration Help**: See `INTEGRATION_GUIDE.md`
**API Reference**: See `journey.types.ts` for all interfaces

## ✨ What This Enables

Once integrated, you'll be able to:

1. **Investigation**: "Show me everywhere this person went"
2. **Search**: "Find this person across all cameras"
3. **Dwell**: "Alert if someone stays in vault area > 5 minutes"
4. **Anomaly**: "Alert on unexpected transitions to restricted areas"
5. **Timeline**: "Reconstruct the incident timeline"
6. **Analytics**: "How many people visit from entrance → teller → vault?"

All with **confidence scores**, **gap detection**, and **audit trails**.

---

**Status**: Core infrastructure complete. Integration and API layer remaining.
**Next Action**: Implement JourneyService or wire integration (see INTEGRATION_GUIDE.md)
