## AI Assistant V2 - Implementation Summary

This directory contains the refactored AI Assistant that transforms it from a fake response generator into a truthful orchestration layer over real domain services.

### Problem Statement (P0 Issue)

The original `ai-assistant.ts` had critical issues:

1. **Fake Camera Control** (lines 428-457): Claimed "Camera 5 has been started" without actually starting anything
2. **Hardcoded System Status** (lines 463-490): Returned invented health metrics
3. **Mock Search Results** (lines 496-553): Generated fake detection IDs like `cam_001`, `cam_005`
4. **Fabricated Investigations** (lines 558-595): Created `track_123` journey stories
5. **Fixed Report Numbers** (lines 600-642): Hardcoded "45 incidents, 3 critical"
6. **Randomized Confidence** (line 322): Used `Math.random()` for intent confidence

**The danger**: Users received false confirmation of operations that never occurred.

### Solution Architecture

#### 1. Core Types (`types/`)

**Key Principle**: Verified success requires evidence.

```typescript
// Commands cannot claim success without proof
CommandResultBuilder.verifiedSuccess(data, evidence);
// Throws if evidence array is empty

// Unverified operations are explicit
CommandResultBuilder.unverifiedSuccess(reason, data, evidence);

// Failures are structured
CommandResultBuilder.failure(code, message, { retryable });
```

**Types**:
- `AssistantCommand<TInput, TOutput>`: Base command interface
- `CommandResult<T>`: VerifiedSuccess | UnverifiedSuccess | CommandFailure
- `AssistantContext`: User, session, request tracking
- `AssistantEvidence`: Source system, record IDs, query details
- `AssistantErrorCode`: Standardized error codes

#### 2. Service Interfaces (`services/`)

Define contracts for real backend integrations:

- **CameraService**: `resolve()`, `getById()`, `findByLocation()`, `getRuntimeState()`
- **CameraControlService**: `startAndVerify()`, `stopAndVerify()` with timeout and idempotency
- **SystemHealthService**: `getSnapshot()` returns actual camera/incident/storage/detection health
- **DetectionSearchService**: `search()` returns real detection IDs from event store
- **InvestigationService**: `create()` returns persistent Investigation objects with ReID
- **AnalyticsService**: `getOccupancy()`, `getPeopleCount()`, `getVehicleCount()` with real-time data
- **ReportService**: `generate()` creates actual reports with IDs

#### 3. Command Implementations (`commands/`)

Each command follows the verification pipeline:

```
1. Resolve Resources    (camera name → camera object)
2. Authorize             (user can control THIS camera?)
3. Check Current State   (already running? → no-op success)
4. Execute Service       (with idempotency key)
5. Verify Result         (poll state, distinguish accepted vs verified)
6. Audit Everything      (evidence IDs, operation IDs, duration)
```

**Example: StartCameraCommand**

```typescript
// Step 1: Resolve
const resolution = await cameraService.resolve("camera 5");
if (!resolution.found) {
  return CommandResultBuilder.failure('RESOURCE_NOT_FOUND', ...);
}

// Step 2: Authorize
const authDecision = await authorization.can({
  actor: user,
  action: 'camera.start',
  resource: camera
});
if (!authDecision.allowed) {
  return CommandResultBuilder.failure('FORBIDDEN', ...);
}

// Step 3: Execute with verification
const result = await cameraControl.startAndVerify(camera.id, {
  timeoutMs: 10000,
  idempotencyKey: `${sessionId}:${requestId}:start:${cameraId}`
});

// Step 4: Return based on verification status
if (result.verified) {
  return CommandResultBuilder.verifiedSuccess(data, evidence);
} else {
  return CommandResultBuilder.unverifiedSuccess(
    'Start accepted but not verified', data, evidence
  );
}
```

**Implemented Commands**:
- `StartCameraCommand`, `StopCameraCommand`
- `SystemStatusCommand`
- `SearchDetectionsCommand`
- `InvestigatePersonCommand`
- `OccupancyCommand`
- `GenerateReportCommand`

#### 4. Registries (`registry/`)

**CommandRegistry**: Maps intents to commands, tracks enabled state

```typescript
commandRegistry.register(metadata, command, [intent]);
const command = commandRegistry.resolveIntent('CAMERA_START');
```

**CapabilityRegistry**: Tracks service availability

```typescript
capabilityRegistry.register({
  id: 'camera-control',
  available: true,
  health: CapabilityHealth.HEALTHY
});

await capabilityRegistry.checkRequirements(['camera-control']);
```

#### 5. Presentation (`presentation/`)

**AssistantPresenter**: Formats CommandResults → natural language

```typescript
// Verified success
formatSuccess({ data, evidence, intent });
// → "Camera 5 is now running."

// Unverified
formatPartial({ reason, data, evidence, intent });
// → "Start command sent to Camera 5, but state not yet verified."

// Failure
formatFailure({ code, message, intent });
// → "Camera 5 was not found."
```

**Key principle**: The presenter never invents operational claims. It only formats data from command execution.

#### 6. Main Orchestrator (`ai-assistant-v2.ts`)

The assistant is now dramatically smaller:

```typescript
async processQuery(query, user, sessionId) {
  // 1. Parse query → intent
  const parsed = await intentParser.parse(query);
  
  // 2. Resolve intent → command
  const command = commandRegistry.resolveIntent(parsed.intent);
  if (!command) return formatUnsupported();
  
  // 3. Check requirements
  const reqCheck = await capabilityRegistry.checkRequirements(metadata.requires);
  if (!reqCheck.allAvailable) return formatFailure();
  
  // 4. Build context
  const context = { user, sessionId, requestId, timestamp };
  
  // 5. Execute command
  const result = await command.execute(input, context);
  
  // 6. Format result
  return presenter.formatExecutionResult(result);
}
```

### Testing Requirements

**Critical tests to prevent regression**:

```typescript
// 1. Cannot claim success without evidence
it('throws when creating verified success without evidence', () => {
  expect(() => 
    CommandResultBuilder.verifiedSuccess(data, [])
  ).toThrow('Verified success results require evidence');
});

// 2. Camera control without service integration
it('does not report camera started when service fails', async () => {
  cameraControl.startAndVerify.mockResolvedValue({
    accepted: false,
    verified: false
  });
  
  const result = await startCommand.execute(input, context);
  
  expect(result.status).toBe('FAILED');
  expect(result.verified).toBe(false);
});

// 3. Search returns zero results truthfully
it('returns zero results when no detections exist', async () => {
  detectionSearch.search.mockResolvedValue({ totalResults: 0, results: [] });
  
  const result = await searchCommand.execute(input, context);
  
  expect(result.data.searchResult.totalResults).toBe(0);
  expect(result.status).toBe('SUCCESS');
  expect(result.verified).toBe(true);
});

// 4. System status never invents values
it('returns UNKNOWN when health cannot be determined', async () => {
  systemHealth.getSnapshot.mockRejectedValue(new Error('unavailable'));
  
  const result = await statusCommand.execute(input, context);
  
  expect(result.status).toBe('FAILED');
  expect(result.code).toBe('SERVICE_UNAVAILABLE');
});
```

### Migration Path

**Phase 1: Infrastructure** ✅
- Core types and contracts
- Command/capability registries
- Service interfaces

**Phase 2: Commands** ✅
- Camera control (P0 fix)
- System health
- Detection search
- Investigation
- Analytics
- Reports

**Phase 3: Integration** (Next)
- Implement service providers
- Connect to existing backend services
- Wire up authorization
- Deploy audit service

**Phase 4: Rollout**
- Feature flag: `USE_ASSISTANT_V2`
- A/B test with subset of users
- Monitor for false positives/negatives
- Full cutover once validated

### Current Status

**Completed**:
- ✅ Core architecture types
- ✅ Command registry and capability management
- ✅ Domain service interfaces
- ✅ All command implementations
- ✅ Result presenter
- ✅ Main orchestrator refactor

**Remaining**:
- ⏳ Service provider implementations (connect to real backends)
- ⏳ Comprehensive test suite
- ⏳ API route integration
- ⏳ Authorization service implementation
- ⏳ Audit service implementation

### Key Architectural Principles

1. **No assistant handler may produce operational claims without domain service verification**
2. **Verified success requires evidence array with source system and record IDs**
3. **Commands distinguish between requested, accepted, and verified states**
4. **UNKNOWN is a first-class state when data is unavailable**
5. **Authorization occurs AFTER resource resolution (to enable resource-specific checks)**
6. **Every side-effecting operation is audited with evidence trail**
7. **Presentation is separated from execution (presenter cannot hallucinate state)**

### Files Modified/Created

**New Files**: 32 files in `analytics-engine/src/assistant/`
- 6 type definition files
- 7 service interface files
- 9 command implementation files
- 3 registry files
- 2 presentation files
- 1 main orchestrator
- 4 index/documentation files

**Deprecated**: `analytics-engine/src/detectors/ai-assistant.ts` (original fake implementation)

### Next Steps

1. Implement service providers that connect commands to existing backend
2. Write comprehensive test suite (see Testing Requirements above)
3. Integrate with API routes
4. Deploy behind feature flag
5. Monitor and validate before full rollout
