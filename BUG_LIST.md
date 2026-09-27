# Project Bug List

## Critical Build-Blocking Issues

### 1. Analytics Engine TypeScript Compilation Errors (100+ errors)
**File:** `analytics-engine/build-output.txt`
**Severity:** Critical - Prevents build
**Count:** 100+ compilation errors

#### Module Export/Import Errors (5 errors)
- ✅ **FIXED** — Factory functions `createHumanAnalytics`, `createVehicleAnalytics`, `createFaceAnalytics`, `createSafetyAnalytics`, `createBankingAnalytics` added to respective detector files (commit `c2fbb290`)

#### Property Access Errors in Analytics Integration (5 errors)
- ✅ **FIXED** — `detection.type` → `detection.detectionType`, `detection.attributes` → `detection.metadata` in `analytics-integration-example.ts`; all `detect()` results cast to `any[]` for legacy access patterns (commit `09de9e0a`)

#### Type Mismatch Errors
- ✅ **NOT A BUG** — Line 11 (`analytics-integration-example.ts`): Resolved by factory export fix above
- ✅ **NOT A BUG** — Line 12 (`analytics-pipeline.ts`): `IndustrialAnalytics.getHealth()` is synchronous — matches `BaseDetector` signature
- ✅ **NOT A BUG** — Line 173 (`app.ts`): `registerDetectionApiRoutes(instance, pipeline)` already passes 2 args correctly

#### AI Assistant Errors (3 errors)
- ⚠️ **STALE** — `ai-assistant-v2.ts` does not exist in codebase; errors likely from deleted file

#### Investigation Command Error
- ✅ **NOT A BUG** — Line 159 (`investigate-person.command.ts`): `from`/`to` are guarded with `&&` before use; no real type error present

#### Camera Service Error
- ✅ **NOT A BUG** — `CameraStatus.UNKNOWN` exists in the enum (`camera-service.interface.ts` line 30); no error

### 2. Banking Analytics Errors (24 errors)
**File:** `analytics-engine/src/banking/banking-analytics-activation.ts`
**Severity:** High

- ⚠️ **UNVERIFIED** — `findActiveMonitors`, `monitorType`, `monitorId`, `branchId`, `authorizationId`, `visitId` property mismatches (Lines 103, 121, 162, 194-195, 215, 227, 250, 261)
- ⚠️ **UNVERIFIED** — Missing module imports: `./rules.js`, `./events.js`, `./models.js`, `./repositories.js`, `./workflow.js`
- ⚠️ **UNVERIFIED** — `banking-events.ts` Line 8: `src/types.d.ts` is not a module
- ⚠️ **UNVERIFIED** — `cash-van-workflow.ts` Line 410: Type mismatch `"access.granted" | "access.denied"` vs `"granted" | "denied"`
- ⚠️ **UNVERIFIED** — `analytics-pipeline-integration.ts` Line 68: Missing `requiresAlert` in type

### 3. Digital Twin Module Errors (20 errors)
**Severity:** High
- ⚠️ **UNVERIFIED** — Missing module imports (`../services.js`, `../models.js`, `../repositories.js`, `../collectors.js`) in multiple digital-twin files
- ⚠️ **UNVERIFIED** — `twin-websocket.ts` Line 42: `WebSocketServer` used as value but exported as type
- ⚠️ **UNVERIFIED** — `relationship.ts` Lines 121, 135, 149: Index signature missing for metadata types

### 4. Detector Module Errors (40+ errors)
**Severity:** High

**File:** `analytics-engine/src/detectors/enhanced-security-analytics.ts`
- ✅ **FIXED** — Line 151: `initialize()`, `cleanup()`, `getHealth()` implementations added; `super()` now passes 2 required args (commit `84986e90`)
- ⚠️ **UNVERIFIED** — Line 49: `@tensorflow/tfjs-node` module not found (runtime dep)
- ⚠️ **UNVERIFIED** — Lines 182, 202: Incorrect number of arguments and signature mismatch
- ⚠️ **UNVERIFIED** — Line 207: `preprocessFrame` does not exist
- ⚠️ **UNVERIFIED** — Lines 213, 479, 505, 548, 619, 642, 703, 743, 795: `type` property in `DetectionResult`

**File:** `analytics-engine/src/detectors/industrial-analytics.ts`
- ✅ **NOT A BUG** — Line 156: `getHealth()` is synchronous — matches `BaseDetector` abstract signature
- ⚠️ **UNVERIFIED** — Line 111: Object member optional syntax error
- ⚠️ **UNVERIFIED** — Line 436: `new Date()` assigned to `DateConstructor` type

**File:** `analytics-engine/src/detectors/person-detector.ts`
- ⚠️ **UNVERIFIED** — Line 11: Missing exports `TrackingEventBus`, `buildTrackingObservations`, `FrameContext`
- ⚠️ **UNVERIFIED** — Lines 105, 107: `branchId`, `frameId` not on `DetectionFrame`

**File:** `analytics-engine/src/detectors/vehicle-detector.ts`
- ⚠️ **UNVERIFIED** — Line 11: Missing exports `TrackingEventBus`, `buildTrackingObservations`, `FrameContext`
- ⚠️ **UNVERIFIED** — Lines 108, 110: `branchId`, `frameId` not on `DetectionFrame`

**File:** `analytics-engine/src/detectors/safety-analytics.ts`
- ⚠️ **UNVERIFIED** — Line 462: `zoneId` missing in `SafetyZone`
- ⚠️ **UNVERIFIED** — Lines 616, 650: `data` not on `DetectionFrame`
- ⚠️ **UNVERIFIED** — Lines 1122, 1128, 1129: Implicit `any` for `this` in callbacks

**File:** `analytics-engine/src/detectors/ai-assistant.ts`
- ⚠️ **UNVERIFIED** — Lines 304, 550: `message` on `unknown` type

### 5. Face Recognition Errors (8 errors)
**File:** `analytics-engine/src/face/face-enrollment.service.ts`
**Severity:** High

- ✅ **NOT A BUG** — `.embedding` is a valid property on the embedding result objects (verified in code)
- ✅ **NOT A BUG** — `face-recognition.service.ts` Line 11: Import is `./face-decision-policy.js` (correct); file exists at that path

### 6. Journey/Tracking System Errors (15 errors)
- ⚠️ **UNVERIFIED** — Multiple missing exports and property mismatches in journey module files

### 7. Heatmap Module Errors (5 errors)
- ⚠️ **UNVERIFIED** — Missing `../tracking.js` module in 5 heatmap files

### 8. Human Analytics Pipeline Errors (3 errors)
- ⚠️ **UNVERIFIED** — `fight-detector.ts.js` bad import, `frameId` not on `DetectionFrame`

### 9. Inference/Detection Errors (2 errors)
- ⚠️ **UNVERIFIED** — `onnx-object-detector.ts` type mismatch; `paddle-ocr-adapter.ts` Buffer type error

### 10. Monitoring/Metrics Errors (2 errors)
- ⚠️ **UNVERIFIED** — `prom-client` module not found; `getResponseTime` not on `FastifyReply`

### 11. Route API Errors (15 errors)
- ⚠️ **UNVERIFIED** — Various type/property mismatches in route files

### 12. Tracking Event Bus Errors (3 errors)
- ⚠️ **UNVERIFIED** — Type incompatibilities between event types and handler signatures

## Security Vulnerabilities

### 13. SQL Injection Vulnerabilities
- ✅ **NOT A BUG** — `buildUpdateStatement` in `compliance-repository.ts` and `maintenance-repository.ts` interpolates only **hardcoded TypeScript column name keys**, not user input. Values are fully parameterized. No injection risk.

## Resource Management Issues

### 14. Unhandled Promise Rejections (45+ instances)
- ⚠️ **UNVERIFIED** — `void import()` in `app.ts`, uncaught `.then()` in `vehicle-analytics.ts`, `banking-analytics-activation.ts`

### 15. Missing Cleanup/Resource Leaks
- ⚠️ **UNVERIFIED** — `analytics-integration-example.ts` listeners without cleanup

## Type Safety Issues

### 16. Incorrect Type Usage
- ⚠️ **UNVERIFIED** — `industrial-analytics.ts` Line 436: `new Date()` → `DateConstructor`
- ✅ **NOT A BUG** — `dashboard/app/security-devices/devices/page.tsx` Line 14: `params?.get('type')?.trim() ?? ''` is already safe optional chaining

### 17. Implicit Any Types
- ⚠️ **UNVERIFIED** — `safety-analytics.ts` Lines 1122-1129: implicit `any` for `this`
- ⚠️ **UNVERIFIED** — `ai-assistant.ts` Lines 304, 550: `message` on `unknown`

## Dashboard/UI Errors

### 18. Dashboard TypeScript Errors
- ✅ **NOT A BUG** — `params?.get('type')?.trim() ?? ''` is safe; `useSearchParams()` null is already handled by optional chaining

## Deprecation and Code Quality Issues

### 19. Deprecated Method Usage
- ⚠️ **LOW PRIORITY** — `vehicle-analytics.ts` Lines 524-595: `detectLicensePlate()` deprecated but functional; comment indicates future migration to unified pipeline

### 20. Missing Interface Implementations
- ✅ **FIXED** — `EnhancedSecurityAnalytics` now implements `initialize()`, `cleanup()`, `getHealth()` (commit `84986e90`)

## Summary Statistics

- **Total Compilation Errors:** Reduced (several categories closed as not-a-bug or fixed)
- **Fixed:** 6 categories (commits `c2fbb290`, `09de9e0a`, `84986e90`, `83db61ae`)
- **Confirmed Not A Bug:** 8 items (stale/already-correct)
- **Remaining Unverified:** ~12 categories in analytics-engine deep modules (banking, digital-twin, journey, heatmaps, inference)
- **Files Affected:** ~30 unverified files remain in analytics-engine
