# Banking Analytics Tests

Comprehensive test suite for the banking analytics system.

## Test Files

- **test-utils.ts**: Mock event generators and workflow scenario builders
- **rules.test.ts**: Unit tests for individual banking rules
- **workflow.test.ts**: Integration tests for workflow state machine
- **integration.test.ts**: End-to-end system tests

## Running Tests

```bash
# Run all banking tests
npm test -- banking

# Run specific test file
npm test -- workflow.test.ts

# Run with coverage
npm test -- --coverage banking
```

## Test Scenarios

### Compliant Workflow
- Authorized vehicle arrives
- Plate recognized
- Required personnel present
- Guards identified
- Cash transfer completed within time limit
- Access control correlated
- Vehicle departs

### Violation Scenarios
1. **Unauthorized Vehicle**: Unknown plate detected
2. **Insufficient Escort**: Less than required guards
3. **Unattended Object**: Cash left without escort
4. **No Access Correlation**: Secure entry without access event
5. **Timeout**: Unloading exceeds time limit

## Mock Data

Test utilities provide realistic event sequences:

```typescript
const generator = new MockEventGenerator();
const events = generator.compliantWorkflow();
await runScenario(events, eventBus);
```

## Assertions

Tests verify:
- Session creation and state transitions
- Rule evaluation results (pass/fail/unknown)
- Violation detection and severity
- Evidence attachment
- Personnel tracking
- Object tracking
- Timeline accuracy
