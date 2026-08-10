# Recording Compliance Testing Guide

## Overview

This document describes the comprehensive test suite for the evidence-based recording compliance system. The tests focus on **preventing false positives** where broken recorders could appear healthy.

## Critical Test Philosophy

**The Golden Rule**: `UNKNOWN ≠ HEALTHY`

Every test validates that the system:
1. Never fabricates health data
2. Returns UNKNOWN when cannot verify
3. Returns UNHEALTHY only with evidence of failure
4. Returns HEALTHY only with positive evidence

## Test Files

### 1. `recorder-health-checker.test.ts`
**Purpose**: Core orchestrator tests
**Location**: `backend/src/recorders/__tests__/`

#### Critical Tests

##### Test 1: Offline Recorder
```typescript
it('should return UNKNOWN when recorder is unreachable')
```
**Validates**: Timeout/offline returns UNKNOWN, not HEALTHY

##### Test 2: Authentication Failure
```typescript
it('should return UNHEALTHY when authentication fails')
```
**Validates**: Bad credentials prevent false positive

##### Test 3: Stale Archive
```typescript
it('should return UNHEALTHY when archive is stale')
```
**Validates**: Old recordings detected (2 hours vs 5 min threshold)

##### Test 4: No Timestamp Fabrication
```typescript
it('should never fabricate current time as lastRecordingTime')
```
**Validates**: CRITICAL - Never returns `new Date()` as archive time

##### Test 5: Recording Stopped
```typescript
it('should return UNHEALTHY when recording is stopped')
```
**Validates**: Stopped recording = UNHEALTHY

##### Test 6: Disk Failed
```typescript
it('should return UNHEALTHY when disk has failed')
```
**Validates**: Storage failure detected

##### Test 7: UNKNOWN Propagation
```typescript
it('should return UNKNOWN overall when any check is UNKNOWN')
```
**Validates**: Aggregation logic (unhealthy > unknown > healthy)

##### Test 8: Generic Adapter Limitations
```typescript
it('should return UNKNOWN for unsupported features in generic adapter')
```
**Validates**: Unsupported = UNKNOWN, not HEALTHY

### 2. `generic-recorder.adapter.test.ts`
**Purpose**: Generic adapter UNKNOWN semantics
**Location**: `backend/src/recorders/__tests__/`

#### Critical Tests

##### Capabilities Declaration
```typescript
it('should declare minimal capabilities')
```
**Validates**: Generic adapter honestly reports limitations

##### Authentication UNKNOWN
```typescript
it('should return UNKNOWN for authentication')
```
**Validates**: Cannot verify without vendor API

##### Recording Status UNKNOWN
```typescript
it('should return UNKNOWN for recording status')
```
**Validates**: CRITICAL - Cannot verify recording

##### Archive Returns Null
```typescript
it('should return null for latest recording, not fabricate data')
```
**Validates**: CRITICAL - Returns null, not fabricated timestamp

##### Storage UNKNOWN
```typescript
it('should return UNKNOWN for storage status')
```
**Validates**: No fabricated storage data

##### All Features UNKNOWN
```typescript
it('should return UNKNOWN for all unsupported features')
```
**Validates**: Comprehensive UNKNOWN coverage

### 3. `recording-compliance.service.test.ts`
**Purpose**: Service integration tests
**Location**: `backend/src/services/__tests__/`

#### Critical Tests

##### Missing Recorder
```typescript
it('should return error state when recorder not found in database')
```
**Validates**: No recorder = error state (not healthy)

##### Adapter Failure
```typescript
it('should return error state when adapter check fails')
```
**Validates**: Failures propagate correctly

##### No Recorder Configured
```typescript
it('should return null when camera has no recorder configured')
```
**Validates**: Missing config = null (not fabricated health)

##### Camera Not Found
```typescript
it('should return null when camera not found')
```
**Validates**: Non-existent camera = null

##### No DVR Configured
```typescript
it('should return null when camera has no DVR configured')
```
**Validates**: Legacy API handles missing DVR

##### Archive Timestamp Integrity
```typescript
it('should never use current time for archive timestamps')
```
**Validates**: CRITICAL - No `new Date()` fabrication

##### Storage Data Integrity
```typescript
it('should not fabricate storage usage data')
```
**Validates**: Undefined storage, not fake numbers

## Running Tests

### Run All Tests
```bash
cd backend
npm test
```

### Run Specific Test Suite
```bash
# Health checker tests
npm test recorder-health-checker.test

# Generic adapter tests
npm test generic-recorder.adapter.test

# Service tests
npm test recording-compliance.service.test
```

### Run with Coverage
```bash
npm test -- --coverage
```

### Watch Mode (Development)
```bash
npm test -- --watch
```

## Test Coverage Requirements

### Critical Paths (100% Required)
- `recorder-health-checker.ts` - Orchestration logic
- `generic-recorder.adapter.ts` - Fallback adapter
- `recording-compliance.service.ts:queryDVRRecordingStatus` - Fixed method

### High Priority (>90% Target)
- All recorder adapters
- Adapter factory
- Health result aggregation

### Medium Priority (>80% Target)
- API routes
- Frontend components

## Manual Testing Scenarios

### Scenario 1: Dead Recorder
**Setup**:
1. Configure camera with recorder at non-existent IP
2. Run compliance check

**Expected**:
- `overallStatus`: `unknown`
- `reachable.status`: `unknown`
- `reachable.message`: "Connection timed out" or similar
- `lastRecordingTime`: `undefined`
- UI shows yellow "Cannot Verify" badge

### Scenario 2: Wrong Credentials
**Setup**:
1. Configure camera with recorder
2. Use incorrect username/password
3. Run compliance check

**Expected**:
- `overallStatus`: `unhealthy` (changed from potentially healthy)
- `authentication.status`: `unhealthy`
- `authentication.errorCode`: `AUTHENTICATION_FAILED`
- UI shows red "Failed" badge

### Scenario 3: Recording Stopped
**Setup**:
1. Configure Hikvision recorder
2. Manually stop recording on channel
3. Run compliance check

**Expected**:
- `recording.status`: `unhealthy`
- `recording.value`: `stopped`
- `archive.status`: `unhealthy`
- `archive.message`: Contains "stale" or "no recordings"
- UI shows red "Failed" badge

### Scenario 4: Stale Archive
**Setup**:
1. Configure recorder with continuous recording
2. Stop recording for 10+ minutes
3. Run compliance check

**Expected**:
- `archive.status`: `unhealthy`
- `archive.archiveLagSeconds`: > 300
- `archive.lastRecordingTime`: Actual old timestamp
- UI shows specific lag time

### Scenario 5: Disk Failed
**Setup**:
1. Configure recorder with RAID
2. Simulate disk failure
3. Run compliance check

**Expected**:
- `storage.status`: `unhealthy`
- `storage.message`: "disk failed" or similar
- `storage.disks`: Contains failed disk info
- UI shows red storage indicator

### Scenario 6: Unknown Recorder
**Setup**:
1. Configure camera with unsupported recorder brand
2. Run compliance check

**Expected**:
- Generic adapter used
- `adapterType`: `generic`
- `recording.status`: `unknown`
- `archive.status`: `unknown`
- `storage.status`: `unknown`
- UI shows yellow "Cannot Verify" badge

## Regression Tests

### Before This Fix
```javascript
// OLD CODE (UNSAFE)
return {
  recording: true,              // ❌ Always true
  lastRecordingTime: new Date(), // ❌ Current time
  storageStatus: 'normal'        // ❌ Always normal
};
```

### After This Fix
```javascript
// NEW CODE (SAFE)
return {
  recording: result.recording.status === 'healthy',  // ✅ Evidence-based
  lastRecordingTime: result.archive.lastRecordingTime, // ✅ Actual timestamp or undefined
  storageStatus: mapStorageStatus(result.storage)     // ✅ Actual status
};
```

### Regression Test
```typescript
it('should NEVER return fabricated health data', async () => {
  const result = await service.checkRecordingComplianceV2(cameraId);
  
  // These assertions would FAIL with old code, PASS with new code
  expect(result.archive.lastRecordingTime).not.toEqual(new Date());
  
  if (result.recording.status === 'healthy') {
    // If healthy, must have evidence
    expect(result.reachable.status).toBe('healthy');
    expect(result.authentication.status).toBe('healthy');
    expect(result.archive.lastRecordingTime).toBeDefined();
  }
});
```

## CI/CD Integration

### Pre-Commit Hooks
```json
{
  "husky": {
    "hooks": {
      "pre-commit": "npm test -- --bail --findRelatedTests"
    }
  }
}
```

### GitHub Actions
```yaml
name: Recording Compliance Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v2
      - uses: actions/setup-node@v2
        with:
          node-version: '18'
      - run: npm ci
      - run: npm test -- --coverage
      - name: Check coverage thresholds
        run: |
          npm test -- --coverage --coverageThreshold='{
            "global": {
              "statements": 80,
              "branches": 75,
              "functions": 80,
              "lines": 80
            }
          }'
```

## Performance Tests

### Load Test: Multiple Cameras
```typescript
it('should handle 100 cameras without timeout', async () => {
  const cameras = Array.from({ length: 100 }, (_, i) => ({
    id: `camera-${i}`,
    // ...
  }));
  
  const startTime = Date.now();
  
  await Promise.all(
    cameras.map(camera => 
      service.checkRecordingComplianceV2(camera.id)
    )
  );
  
  const duration = Date.now() - startTime;
  
  // Should complete within reasonable time
  expect(duration).toBeLessThan(30000); // 30 seconds
}, 60000);
```

### Memory Leak Test
```typescript
it('should not leak memory with repeated checks', async () => {
  const iterations = 1000;
  const initialMemory = process.memoryUsage().heapUsed;
  
  for (let i = 0; i < iterations; i++) {
    await service.checkRecordingComplianceV2(cameraId);
  }
  
  const finalMemory = process.memoryUsage().heapUsed;
  const memoryGrowth = finalMemory - initialMemory;
  
  // Memory growth should be bounded
  expect(memoryGrowth).toBeLessThan(50 * 1024 * 1024); // 50MB
});
```

## Monitoring Test Results

### Test Report Dashboard
Monitor these metrics:
- **Pass Rate**: Should be 100%
- **Coverage**: >85% overall, 100% on critical paths
- **Test Duration**: <5 minutes for full suite
- **Flakiness**: <1% (tests should be deterministic)

### Alert on Failures
```javascript
// In CI/CD pipeline
if (testPassRate < 100%) {
  sendAlert({
    severity: 'critical',
    message: 'Recording compliance tests failing',
    details: failedTests
  });
}
```

## Debugging Failed Tests

### Common Failure Patterns

#### Pattern 1: Timeout
```
Error: Timeout - Async callback was not invoked within the 5000ms timeout
```
**Solution**: Increase test timeout or check for hung promises

#### Pattern 2: Mock Not Called
```
Expected mock function to have been called, but it was not called.
```
**Solution**: Verify mock setup and execution order

#### Pattern 3: Wrong Status
```
Expected: "unknown"
Received: "healthy"
```
**Solution**: Check adapter implementation - likely returning wrong status

### Debug Commands
```bash
# Run single test with debug output
node --inspect-brk node_modules/.bin/jest recorder-health-checker.test.ts

# Verbose output
npm test -- --verbose

# Show all console.log output
npm test -- --silent=false
```

## Contributing Tests

### When to Add Tests
1. **New adapter**: Add full suite for new recorder vendor
2. **Bug fix**: Add regression test proving bug is fixed
3. **New feature**: Add tests before implementing (TDD)
4. **Edge case**: Add test when edge case discovered

### Test Template
```typescript
describe('Feature - Requirement', () => {
  it('should do X when Y happens', async () => {
    // Arrange: Set up test data
    const mockData = { /* ... */ };
    
    // Act: Execute the code being tested
    const result = await functionUnderTest(mockData);
    
    // Assert: Verify the result
    expect(result.status).toBe('expected');
    
    // CRITICAL assertions for false-positive prevention
    expect(result.value).not.toBe(fabricatedValue);
  });
});
```

## Test Maintenance

### Regular Reviews
- **Weekly**: Check test pass rate and flakiness
- **Monthly**: Review coverage reports
- **Quarterly**: Update tests for API changes

### Deprecation
When removing old code:
1. Mark tests as deprecated
2. Update after transition period
3. Remove when old code deleted

## Resources

- [Jest Documentation](https://jestjs.io/)
- [Testing Best Practices](https://testingjavascript.com/)
- [Mock Service Worker](https://mswjs.io/) - For HTTP mocking
