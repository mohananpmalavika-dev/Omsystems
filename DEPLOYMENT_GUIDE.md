# AI Assistant V2 - Deployment Guide

## Quick Start

The AI Assistant V2 architecture is now implemented and ready for deployment. This guide walks you through the deployment process.

## Prerequisites

- ✅ All architecture files created (42 files)
- ✅ Service providers implemented (camera service, camera control)
- ✅ API routes created
- ✅ Comprehensive tests written

## Step 1: Register API Routes

Add the new routes to your Express app:

```typescript
// In src/app.ts or your main router file
import aiAssistantV2Routes from './routes/ai-assistant-v2.routes.js';

// Add the route
app.use('/api/ai-assistant-v2', aiAssistantV2Routes);
```

## Step 2: Set Feature Flag

Enable the feature flag in your environment:

```bash
# .env or environment variables
USE_ASSISTANT_V2=true
```

Start with `false` for initial deployment, then enable gradually.

## Step 3: Run Tests

```bash
# Run assistant tests
cd analytics-engine/src/assistant
npm test

# Check coverage
npm test -- --coverage
```

Ensure all tests pass before deployment.

## Step 4: Deploy to Staging

1. Deploy to staging environment
2. Set `USE_ASSISTANT_V2=false` initially
3. Monitor application startup
4. Enable flag: `USE_ASSISTANT_V2=true`
5. Test manually

### Manual Testing Commands

```bash
# Test system status
curl -X POST http://your-staging-url/api/ai-assistant-v2/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "What is the system status?",
    "sessionId": "test-123"
  }'

# Test camera control (verify no false success!)
curl -X POST http://your-staging-url/api/ai-assistant-v2/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -d '{
    "query": "Start camera 5",
    "sessionId": "test-123"
  }'

# Verify response includes evidence
# Check: response.evidence should be present
# Check: response.verified should be true for confirmed operations
```

## Step 5: Gradual Production Rollout

### Phase 1: 10% of Users (1-2 days)

```javascript
// Add A/B testing logic in your routes
const useV2 = Math.random() < 0.1; // 10% of requests

if (useV2 && process.env.USE_ASSISTANT_V2 === 'true') {
  // Use new assistant
  return aiAssistantV2Routes(req, res);
} else {
  // Use old assistant
  return oldAssistantRoutes(req, res);
}
```

**Monitor:**
- Error rate
- Response times
- False confirmation rate (should be 0%)
- Verified operation rate (should be >90%)

### Phase 2: 50% of Users (2-3 days)

If Phase 1 is successful:
- Increase to 50%
- Continue monitoring
- Check audit logs for any issues

### Phase 3: 100% Rollout

- Set to 100% if no issues
- Monitor for 1 week
- Deprecate old assistant

## Step 6: Complete Service Integration

The initial deployment uses placeholder services. Complete the integration:

### TODO: Implement Remaining Service Providers

1. **Detection Search Service** (`detection-search-service.provider.ts`)
   ```typescript
   export class DetectionSearchServiceProvider implements DetectionSearchService {
     async search(query: DetectionSearchQuery) {
       // Query your event store / detection database
     }
   }
   ```

2. **System Health Service** (`system-health-service.provider.ts`)
   ```typescript
   export class SystemHealthServiceProvider implements SystemHealthService {
     async getSnapshot() {
       // Aggregate from cameras, incidents, storage, detection pipeline
     }
   }
   ```

3. **Investigation Service** (`investigation-service.provider.ts`)
   ```typescript
   export class InvestigationServiceProvider implements InvestigationService {
     async create(request) {
       // Create persistent investigation with ReID
     }
   }
   ```

4. **Analytics Service** (`analytics-service.provider.ts`)
5. **Report Service** (`report-service.provider.ts`)
6. **Authorization Service** (real RBAC integration)
7. **Audit Service** (real audit log storage)

### Register Additional Commands

Once services are implemented, register more commands:

```typescript
// In ai-assistant-v2.routes.ts

commandRegistry.register(
  {
    id: 'search-detections',
    name: 'Search Detections',
    risk: CommandRisk.READ_ONLY,
    requires: ['detection-search'],
    enabled: true
  },
  new SearchDetectionsCommand(detectionSearch, cameraService, authorization, audit),
  ['SEARCH_DETECTIONS', 'SEARCH_PERSON', 'SEARCH_VEHICLE']
);

commandRegistry.register(
  {
    id: 'investigate-person',
    name: 'Investigate Person',
    risk: CommandRisk.READ_ONLY,
    requires: ['investigation-service', 'reid'],
    enabled: true
  },
  new InvestigatePersonCommand(investigationService, detectionSearch, authorization, audit),
  ['INVESTIGATE_PERSON']
);

// ... register analytics, reports, etc.
```

## Monitoring

### Key Metrics

Set up monitoring for:

```
assistant_v2.query.count{intent}
assistant_v2.query.duration_ms{intent}
assistant_v2.command.success_rate{command}
assistant_v2.command.verified_rate{command}  # CRITICAL: should be >90%
assistant_v2.error.count{error_code}
assistant_v2.authorization.denied_count
assistant_v2.service.availability{service}
```

### Critical Alerts

Alert immediately if:
- `verified_rate < 90%` - Too many unverified operations
- `error_count` spikes
- `false_confirmation_rate > 0%` - **P0 CRITICAL**

### Audit Log Queries

Query audit logs to verify no false confirmations:

```sql
-- Find all camera start commands
SELECT 
  original_text,
  result_status,
  verified,
  evidence_ids,
  timestamp
FROM assistant_audit_events
WHERE parsed_intent = 'CAMERA_START'
ORDER BY timestamp DESC
LIMIT 100;

-- Verify: result_status='SUCCESS' ALWAYS has verified=true
-- Verify: evidence_ids is never empty for SUCCESS
```

## Rollback Plan

If issues are detected:

### Emergency Rollback

```bash
# Immediate: Set feature flag
USE_ASSISTANT_V2=false

# Application will fall back to old assistant
# No restart required (if using runtime config)
```

### Controlled Rollback

1. Reduce traffic percentage to 0%
2. Investigate issue in logs
3. Fix and redeploy
4. Resume gradual rollout

## Verification Checklist

Before considering deployment complete:

- [ ] All service providers implemented
- [ ] All commands registered
- [ ] Authorization service connected
- [ ] Audit service storing logs
- [ ] Tests passing with 80%+ coverage
- [ ] API routes registered in app
- [ ] Feature flag functional
- [ ] Manual testing successful
- [ ] No false confirmations in staging
- [ ] Monitoring dashboards created
- [ ] Alerts configured
- [ ] Documentation updated
- [ ] Team trained on new architecture

## Success Criteria

✅ **Deployment is successful when:**

1. **Zero false confirmations** in production for 1 week
2. **Verified rate >90%** for side-effect operations
3. **Error rate <1%**
4. **Response times <500ms p95**
5. **User feedback positive**

## Post-Deployment

After 1 week of successful operation:

1. **Deprecate old assistant**
   ```bash
   # Mark as deprecated
   mv src/detectors/ai-assistant.ts src/detectors/ai-assistant.deprecated.ts
   ```

2. **Remove fake response code**
3. **Update client applications** to use v2 endpoints
4. **Document final architecture**
5. **Celebrate** 🎉 - You've eliminated a critical P0 issue!

## Support

If you encounter issues during deployment:

1. Check application logs for errors
2. Review audit logs for false confirmations
3. Verify service provider implementations
4. Check database connectivity
5. Validate authorization logic

## Next Enhancements

After successful deployment, consider:

1. **ML-based Intent Parser** - Replace rule-based with model
2. **Multi-language Support** - Support languages beyond English
3. **Voice Interface** - Enable voice commands
4. **Batch Operations** - Process multiple commands
5. **Advanced Analytics** - Track usage patterns
6. **Performance Optimization** - Cache frequently accessed data

---

**Status**: Ready for deployment with feature flag

**Estimated Rollout Time**: 1-2 weeks for full production deployment

**Risk Level**: Low (feature flag enables instant rollback)

**Impact**: Eliminates critical P0 false confirmation issue
