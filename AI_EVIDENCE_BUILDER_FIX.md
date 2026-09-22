# AI Evidence Builder - 403 Error Fix

## Problem Summary

The AI Evidence Builder API endpoints were returning 403 (Forbidden) errors due to:

1. **Missing Route Registration**: AI Intelligence routes (including evidence builder) were not registered in `src/app.ts`
2. **Missing Feature Flag Protection**: Endpoints lacked proper feature flag middleware for access control
3. **Incorrect URL Usage**: Frontend may have been calling `/api/v1/features/ai-evidence-builder` instead of the correct endpoints

## Solution Implemented

### 1. Route Registration (src/app.ts)

Added AI Intelligence Layer route registration:

```typescript
// Register AI Intelligence Layer routes (Incident Summary, SOP Engine, Investigation Reports, Evidence Builder, Video Search)
try {
  const { registerAIIntelligenceRoutes } = await import("./routes/ai-intelligence.js");
  await registerAIIntelligenceRoutes(app);
  app.log.info('AI Intelligence Layer routes registered');
} catch (err: unknown) {
  app.log.error({ err }, 'failed to register AI Intelligence Layer routes');
}
```

### 2. Feature Flag Protection (src/routes/ai-intelligence.ts)

Added `requireFeature` middleware to all AI Intelligence endpoints:

```typescript
// Import feature flag middleware
import { requireFeature, requireAnyFeature } from "../middleware/feature-flag.middleware.js";

// Protected evidence builder endpoint
app.post("/v1/ai/evidence-packages", {
  preHandler: requireFeature('ai-evidence-builder')
}, async (request, reply) => {
  // Handler logic
});
```

### 3. Protected Endpoints

All the following endpoint groups now have proper feature flag protection:

#### AI Evidence Builder Endpoints (Feature: `ai-evidence-builder`)
- `POST /v1/ai/evidence-packages` - Create evidence package
- `POST /v1/ai/evidence-packages/court` - Generate court-ready package
- `POST /v1/ai/evidence-packages/police` - Generate police submission
- `POST /v1/ai/evidence-packages/insurance` - Generate insurance claim package
- `POST /v1/ai/evidence-packages/:packageId/collect` - Collect evidence
- `POST /v1/ai/evidence-packages/:packageId/sign` - Apply digital signature
- `GET /v1/ai/evidence-packages/:packageId/verify` - Verify integrity
- `GET /v1/ai/evidence-packages/:packageId/manifest` - Get manifest
- `POST /v1/ai/evidence-packages/:packageId/custody/transfer` - Transfer custody
- `POST /v1/ai/evidence-packages/:packageId/download` - Record download

#### AI Incident Summary Endpoints (Feature: `ai-incident-summary`)
- `GET /v1/ai/incidents/summary/shift` - Shift summary
- `GET /v1/ai/incidents/summary/daily` - Daily summary
- `GET /v1/ai/incidents/summary/executive` - Executive summary
- `POST /v1/ai/incidents/correlate` - Correlate alerts

#### AI Video Search Endpoints (Feature: `ai-video-search`)
- `POST /v1/ai/video/search` - Natural language search
- `POST /v1/ai/video/search/person` - Find person by clothing
- `POST /v1/ai/video/search/vehicle` - Find vehicle
- `POST /v1/ai/video/track-across-cameras` - Track across cameras
- `GET /v1/ai/video/tracks` - Get cross-camera tracks
- `GET /v1/ai/video/journey/:trackingId` - Get object journey
- `POST /v1/ai/video/index` - Index video metadata

#### AI Assistant Endpoints (Feature: `guardian-ai-assistant`)
- `POST /v1/ai/assistant/chat` - Conversational copilot
- `POST /v1/ai/copilot/chat` - Alias for copilot

## Feature Flag Management

### Check Feature Status

```bash
# Check if feature is enabled for a tenant
GET /api/v1/features/ai-evidence-builder

# Response
{
  "feature": {
    "featureKey": "ai-evidence-builder",
    "featureName": "AI Evidence Builder",
    "enabled": true,
    "category": "ai"
  }
}
```

### Enable Feature for Tenant

```bash
# Enable for specific tenant
PATCH /api/v1/features/ai-evidence-builder
Content-Type: application/json

{
  "enabled": true,
  "usageLimit": null,
  "expiresAt": null
}
```

### Check Feature Availability

```bash
# Check if user can use feature
POST /api/v1/features/ai-evidence-builder/check

# Response if enabled
{
  "enabled": true,
  "feature": {
    "featureKey": "ai-evidence-builder",
    "featureName": "AI Evidence Builder"
  }
}

# Response if disabled
{
  "enabled": false,
  "reason": "feature_not_enabled_for_tenant"
}
```

## Database Verification

The feature is already defined in the database migration:

```sql
-- From database/migrations/20260916_feature_management.sql
INSERT INTO global_features (feature_key, feature_name, feature_category, description, enabled, config) VALUES
('ai-evidence-builder', 'AI Evidence Builder', 'ai', 'Intelligent evidence collection and organization', true, '{}');
```

## Testing the Fix

### 1. Verify Server Starts Successfully

```bash
npm run build
npm start
```

Look for log entry:
```
AI Intelligence Layer routes registered
```

### 2. Test Feature Flag Check

```bash
curl -X POST https://your-domain/api/v1/features/ai-evidence-builder/check \
  -H "Cookie: your-auth-cookie" \
  -H "Content-Type: application/json"
```

### 3. Test Evidence Builder Endpoint

```bash
curl -X POST https://your-domain/v1/ai/evidence-packages \
  -H "Cookie: your-auth-cookie" \
  -H "Content-Type: application/json" \
  -d '{
    "incidentId": "incident-123",
    "config": {
      "includeVideo": true,
      "includeMetadata": true
    }
  }'
```

Expected responses:
- **If feature disabled**: 403 with clear error message
- **If feature enabled**: 200 with evidence package response

## Frontend Integration

### Correct API Usage

❌ **Incorrect** (Do not use):
```javascript
fetch('/api/v1/features/ai-evidence-builder')  // This checks feature status, doesn't use it
```

✅ **Correct**:
```javascript
// Create evidence package
fetch('/v1/ai/evidence-packages', {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    incidentId: 'incident-123',
    config: { includeVideo: true }
  })
})
```

### Check Feature Before Using

```javascript
// Check if feature is available
const checkFeature = async () => {
  const response = await fetch('/api/v1/features/ai-evidence-builder/check', {
    method: 'POST',
    credentials: 'include'
  });
  const result = await response.json();
  return result.enabled;
};

// Use feature if enabled
if (await checkFeature()) {
  // Call evidence builder endpoints
  createEvidencePackage();
}
```

## Security Considerations

### 1. Authentication Required

All AI Intelligence endpoints require authentication via:
- Session cookie
- JWT token
- mTLS certificate (if configured)

### 2. Feature Flag Enforcement

- Returns `403 Forbidden` if feature not enabled for tenant
- Returns `401 Unauthorized` if not authenticated
- Graceful fallback if feature service unavailable

### 3. Tenant Isolation

All operations are scoped to the authenticated user's tenant:
```typescript
evidenceService.createEvidencePackage(
  auth.user.tenantId,  // Tenant isolation
  incidentId,
  auth.user.id,
  config
);
```

### 4. Audit Logging

Feature usage is automatically logged when using `requireFeatureWithLogging`:
- User ID
- Tenant ID
- Timestamp
- Action performed
- IP address
- User agent

## Production Deployment Checklist

- [x] Route registration added to `src/app.ts`
- [x] Feature flag middleware applied to all endpoints
- [x] Database migration includes feature definition
- [x] Error responses are production-grade (403, 401, 400)
- [ ] Build and verify no TypeScript errors
- [ ] Test with disabled feature (should return 403)
- [ ] Test with enabled feature (should work)
- [ ] Update frontend to use correct endpoints
- [ ] Verify feature flag can be toggled via admin UI
- [ ] Test cross-tenant isolation
- [ ] Verify audit logs are being created
- [ ] Load test under production traffic

## Troubleshooting

### Issue: Still getting 403 errors

**Check:**
1. Is the feature enabled in database?
   ```sql
   SELECT * FROM tenant_features WHERE tenant_id = 'your-tenant-id' AND feature_key = 'ai-evidence-builder';
   ```

2. Is the feature enabled globally?
   ```sql
   SELECT * FROM global_features WHERE feature_key = 'ai-evidence-builder';
   ```

3. Check server logs for route registration:
   ```
   grep "AI Intelligence Layer routes" logs/app.log
   ```

### Issue: Feature service not initialized

**Solution:**
Feature middleware is initialized in `src/app.ts`:
```typescript
if (pool) {
  const { initializeFeatureMiddleware } = await import("./middleware/feature-flag.middleware.js");
  initializeFeatureMiddleware(pool);
}
```

Ensure `DATABASE_URL` is set and database is accessible.

### Issue: Wrong endpoint being called

**Verify frontend is using:**
- `/v1/ai/evidence-packages/*` - to USE the feature
- `/api/v1/features/ai-evidence-builder` - to CHECK feature status

## Related Files

- `src/routes/ai-intelligence.ts` - Main route definitions
- `src/app.ts` - Route registration
- `src/middleware/feature-flag.middleware.ts` - Feature protection
- `src/services/ai-evidence-builder.ts` - Business logic
- `src/services/feature-management.service.ts` - Feature flag service
- `database/migrations/20260916_feature_management.sql` - Feature definitions

## Support

For issues or questions:
1. Check server logs: `logs/app.log`
2. Verify feature status: `GET /api/v1/features`
3. Check database: Query `global_features` and `tenant_features` tables
4. Review audit logs: `SELECT * FROM feature_usage_audit WHERE feature_key = 'ai-evidence-builder'`
