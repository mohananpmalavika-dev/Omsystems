# AI Assistant Test Suite

This test suite ensures the AI Assistant never produces false operational claims.

## Critical Test Principles

1. **Evidence is Required**: Verified success must include evidence from domain services
2. **No Invented Data**: Tests verify commands don't generate fake IDs or metrics
3. **Explicit Failure**: When services fail, commands must fail (not succeed with fake data)
4. **State Verification**: Distinguish between requested, accepted, and verified states
5. **Zero Results Truthfulness**: Empty results are valid verified outcomes

## Test Categories

### 1. Command Result Builder Tests (`command-result-builder.test.ts`)
- ✅ Throws when creating verified success without evidence
- ✅ Allows unverified success without evidence
- ✅ Maps error codes to appropriate statuses
- ✅ Includes retryable flags and choice arrays

### 2. Camera Control Tests (`start-camera-command.test.ts`)
- ✅ Fails when camera not found
- ✅ Fails when user not authorized
- ✅ Returns verified success only when state confirmed
- ✅ Returns PARTIAL when accepted but not verified
- ✅ Does NOT claim success when service fails
- ✅ Does NOT claim success when command rejected
- ✅ Includes idempotency keys
- ✅ Audits all operations

### 3. Search Tests (`search-detections-command.test.ts`)
- ✅ Returns verified success with zero results
- ✅ Does NOT invent fake detection IDs (cam_001, etc.)
- ✅ Returns only detection IDs from service
- ✅ Fails when location has no cameras
- ✅ Does NOT return success when search service fails

### 4. System Status Tests (`system-status-command.test.ts`)
- ✅ Returns actual health snapshot from service
- ✅ Does NOT return hardcoded values (147 cameras, etc.)
- ✅ Fails when health service unavailable
- ✅ Explicitly handles UNKNOWN overall status
- ✅ Handles null processing lag gracefully

### 5. Presenter Tests (`assistant-presenter.test.ts`)
- ✅ Never invents data not in result
- ✅ Clearly indicates unverified state
- ✅ Does not claim success for unverified operations
- ✅ Accurately reports zero results
- ✅ Does not include fake IDs in formatted messages

## Running Tests

```bash
# Run all tests
npm test

# Run with coverage
npm test -- --coverage

# Run specific test file
npm test start-camera-command.test.ts

# Watch mode
npm test -- --watch
```

## Coverage Requirements

- **Branches**: 80%
- **Functions**: 80%
- **Lines**: 80%
- **Statements**: 80%

## Key Regression Tests

These tests prevent the most critical P0 issues:

### 1. False Camera Start Success
```typescript
it('does NOT report camera started when service fails', async () => {
  cameraControl.startAndVerify.mockResolvedValue({
    accepted: false,
    verified: false
  });
  
  const result = await command.execute(input, context);
  
  expect(result.status).toBe('FAILED');
  expect(result.verified).toBe(false);
});
```

### 2. Invented Detection IDs
```typescript
it('does NOT invent fake detection IDs', async () => {
  detectionSearch.search.mockResolvedValue({
    totalResults: 0,
    results: []
  });
  
  const result = await command.execute(input, context);
  
  expect(result.data.searchResult.results).not.toContain('cam_001');
  expect(result.data.searchResult.results).toHaveLength(0);
});
```

### 3. Hardcoded System Metrics
```typescript
it('does NOT return hardcoded values', async () => {
  systemHealth.getSnapshot.mockResolvedValue({ /* real data */ });
  
  const result = await command.execute({}, context);
  
  expect(result.data.snapshot.cameras.total).not.toBe(147);
});
```

### 4. Evidence Requirement
```typescript
it('throws when creating verified success without evidence', () => {
  expect(() => {
    CommandResultBuilder.verifiedSuccess(data, []);
  }).toThrow('Verified success results require evidence');
});
```

## Mocking Guidelines

### Service Mocks
All service dependencies should be mocked to test command logic in isolation:

```typescript
const cameraService: jest.Mocked<CameraService> = {
  resolve: jest.fn(),
  getById: jest.fn(),
  // ... other methods
};
```

### Context Setup
Standard test context for all commands:

```typescript
const context: AssistantContext = {
  user: {
    id: 'user_123',
    roles: ['operator'],
    siteIds: ['site_main']
  },
  sessionId: 'session_abc',
  requestId: 'req_xyz',
  timestamp: new Date()
};
```

## Adding New Tests

When adding a new command, ensure you test:

1. **Resource Resolution**: Not found, ambiguous, found
2. **Authorization**: Allowed, denied
3. **Service Success**: Verified, unverified/partial
4. **Service Failure**: Service down, command rejected
5. **Audit Trail**: All operations recorded with evidence
6. **Edge Cases**: Already in target state, null/undefined values

## Continuous Integration

These tests run on every commit and PR:
- Pre-commit hook
- GitHub Actions CI
- Code review gate

## Related Documentation

- [Architecture README](../README.md)
- [Command Implementation Guide](../commands/README.md)
- [Service Interface Contracts](../services/README.md)
