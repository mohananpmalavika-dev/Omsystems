# KryptoVision Connect - Test Suite

Comprehensive test coverage for the KryptoVision Connect communication subsystem.

## Test Files

### 1. Device Enrollment Tests (`device-enrollment.test.ts`)

Tests device registration and security:
- ✅ Valid enrollment flow with enrollment codes
- ✅ Expired enrollment code rejection
- ✅ Used enrollment code rejection (single-use enforcement)
- ✅ Cross-tenant employee linking prevention
- ✅ Duplicate device UUID rejection
- ✅ Device approval workflow
- ✅ Device revocation and credential invalidation

**Coverage:** Device enrollment, credentials, approval/revocation flows

---

### 2. First-Answer-Wins Call Tests (`call-first-answer-wins.test.ts`)

Tests atomic call acceptance:
- ✅ First device to accept wins
- ✅ Other devices receive rejection
- ✅ Simultaneous accept attempts (race conditions)
- ✅ Redis SET NX atomic lock verification
- ✅ Multi-instance safety (multiple API nodes)
- ✅ Network interruption during accept
- ✅ Duplicate accept prevention
- ✅ Call rejection without affecting acceptance
- ✅ Call cancellation preventing accepts
- ✅ Lock cleanup on call end

**Coverage:** Call state machine, Redis coordination, distributed systems correctness

---

### 3. Messaging Offline Delivery Tests (`messaging-offline.test.ts`)

Tests persistent messaging and offline queueing:
- ✅ Online message delivery
- ✅ Offline message queueing in PostgreSQL
- ✅ Delivery on device reconnect
- ✅ Delivery receipts
- ✅ Read receipts
- ✅ Message persistence across service restarts
- ✅ Messages NOT stored only in Redis
- ✅ Multiple device delivery (broadcast to all branch devices)
- ✅ Unread message count
- ✅ Conversation persistence and reuse

**Coverage:** Messaging service, offline support, delivery tracking

---

### 4. Security & Tenant Isolation Tests (`security-isolation.test.ts`)

Tests security boundaries:
- ✅ Cross-tenant device access prevention
- ✅ Cross-branch device linking prevention
- ✅ Forged branch ID rejection (resolved from enrollment code only)
- ✅ Forged employee ID rejection
- ✅ Expired credential rejection
- ✅ Revoked device authentication prevention
- ✅ Unauthorized call initiation (PENDING devices)
- ✅ Tenant isolation in database queries
- ✅ Device status validation (ACTIVE/OFFLINE only)

**Coverage:** Multi-tenancy, authentication, authorization, security

---

## Running Tests

### Run All Communication Tests
```bash
vitest run test/communications/
```

### Run Specific Test Suite
```bash
vitest run test/communications/device-enrollment.test.ts
vitest run test/communications/call-first-answer-wins.test.ts
vitest run test/communications/messaging-offline.test.ts
vitest run test/communications/security-isolation.test.ts
```

### Run with Coverage
```bash
vitest run --coverage test/communications/
```

### Watch Mode (Development)
```bash
vitest test/communications/
```

---

## Test Environment Setup

### Prerequisites
- PostgreSQL test database
- Redis test instance
- Environment variables configured

### Environment Variables
```bash
TEST_DATABASE_URL=postgresql://postgres:postgres@localhost:5432/vms_test
TEST_REDIS_URL=redis://localhost:6379
```

### Database Setup
```bash
# Create test database
createdb vms_test

# Run migrations
npm run migrate:test
```

### Cleanup
Tests automatically clean up data in `afterEach()` hooks. Each test suite:
- Deletes test data from `communication_*` tables
- Flushes Redis test database
- Closes database connections

---

## Test Coverage Goals

### Coverage Metrics
- **Enrollment Service:** 95%+
- **Call Service:** 95%+
- **Messaging Service:** 95%+
- **State Machine:** 100% (critical path)
- **Security:** 100% (critical path)

### What is Tested
✅ Valid workflows
✅ Invalid inputs
✅ Edge cases
✅ Race conditions
✅ Concurrent operations
✅ Network failures
✅ Service restarts
✅ Security boundaries
✅ Tenant isolation
✅ Data persistence
✅ State machine transitions

### What is NOT Tested (Yet)
- WebSocket signaling integration (requires Socket.IO mock)
- WebRTC media sessions (requires TURN server mock)
- Client-side applications (Windows/Android/iOS apps)
- UI components
- Performance benchmarks
- Load testing

---

## Critical Test Scenarios

### Scenario 1: Branch Calls VMS
```
1. VMS operator initiates call to branch
2. All online branch devices ring
3. First device to accept wins
4. Other devices receive CALL_ACCEPTED_ELSEWHERE
5. WebRTC session established
6. Call ends cleanly
```

**Tested in:** `call-first-answer-wins.test.ts`

### Scenario 2: Offline Message Delivery
```
1. VMS sends message to branch
2. Branch device is offline
3. Message queued in PostgreSQL
4. Device reconnects
5. Undelivered messages fetched
6. Device marks as delivered
7. User reads message
8. Read receipt sent
```

**Tested in:** `messaging-offline.test.ts`

### Scenario 3: Cross-Tenant Security
```
1. Tenant A device enrolls
2. Attempts to call Tenant B branch
3. Call initiation rejected
4. Attempts to link Tenant B employee
5. Linking rejected
6. Tenant isolation verified
```

**Tested in:** `security-isolation.test.ts`

### Scenario 4: Device Revocation
```
1. Device enrolls and activates
2. Credentials generated
3. Device authenticates successfully
4. Admin revokes device
5. Credentials invalidated
6. Authentication fails
7. Calls/messages blocked
```

**Tested in:** `device-enrollment.test.ts` and `security-isolation.test.ts`

---

## Acceptance Criteria

All tests MUST pass before deployment:

- [x] Device enrollment with valid code
- [x] Device enrollment rejects expired/used codes
- [x] First-answer-wins atomic behavior
- [x] Simultaneous accept race condition handling
- [x] Multi-instance call acceptance safety
- [x] Offline message queueing and delivery
- [x] Message persistence across restarts
- [x] Delivery and read receipts
- [x] Cross-tenant access prevention
- [x] Forged identity rejection
- [x] Revoked device authentication blocked
- [x] Tenant isolation in all queries

---

## Continuous Integration

### GitHub Actions Workflow
```yaml
test-communications:
  runs-on: ubuntu-latest
  services:
    postgres:
      image: postgres:15
      env:
        POSTGRES_PASSWORD: postgres
      options: >-
        --health-cmd pg_isready
        --health-interval 10s
    redis:
      image: redis:7
      options: >-
        --health-cmd "redis-cli ping"
        --health-interval 10s
  steps:
    - uses: actions/checkout@v3
    - uses: actions/setup-node@v3
    - run: npm ci
    - run: npm run test:communications
```

---

## Debugging Tests

### Enable Debug Logging
```typescript
logger = pino({ level: 'debug' }); // Change from 'silent'
```

### Inspect Database State
```typescript
afterEach(async () => {
  // Don't cleanup to inspect data
  // await pool.query('DELETE FROM...');
});
```

### Redis Debugging
```bash
redis-cli -n 0 KEYS "comm:*"
redis-cli -n 0 GET "comm:call:..."
```

---

## Adding New Tests

### Template
```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { Pool } from 'pg';

describe('Feature Name', () => {
  let pool: Pool;
  
  beforeEach(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    // Setup test data
  });
  
  afterEach(async () => {
    // Cleanup
    await pool.end();
  });
  
  it('should do something', async () => {
    // Test implementation
    expect(result).toBe(expected);
  });
});
```

### Best Practices
- One feature per test file
- Clear test descriptions
- Isolated test data (use unique IDs)
- Proper cleanup in `afterEach`
- Test both success and failure paths
- Test edge cases and race conditions
- Use meaningful assertions
- Avoid test interdependencies

---

## Performance Benchmarks

### Call Acceptance Latency
Target: < 100ms from initiate to first device ringing

### Message Delivery Latency
Target: < 50ms for online delivery

### Database Query Performance
Target: < 10ms for simple queries, < 100ms for complex queries

### Redis Operations
Target: < 1ms for atomic operations

---

## Known Limitations

1. **WebSocket Testing:** Current tests don't verify WebSocket event broadcasting (requires Socket.IO mock)
2. **WebRTC Testing:** Media session tests require TURN server or mock
3. **Client Apps:** Windows/Android/iOS apps require separate test infrastructure
4. **Integration Tests:** End-to-end tests across multiple services not yet implemented
5. **Performance Tests:** Load testing and stress testing in separate suite

---

## References

- Requirements: `KRYPTOVISION_CONNECT_REQUIREMENTS.md`
- Design: `KRYPTOVISION_CONNECT_DESIGN.md`
- Telemetry: `KRYPTOVISION_CONNECT_TELEMETRY.md`
- Database: `database/migrations/200_communication_subsystem.sql`
