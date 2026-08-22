# Banking Analytics System - Activation Guide

## Overview

This guide provides step-by-step instructions for activating and configuring the banking analytics system in production.

## Prerequisites

1. **Analytics Engine Running**: Ensure the analytics-engine service is operational
2. **Database Configured**: PostgreSQL database with banking analytics tables
3. **Detectors Active**: Vehicle, ANPR, Person, Face, Zone detectors operational
4. **API Access**: Access to the banking analytics API endpoints

## Activation Steps

### Step 1: Enable Banking Analytics in Environment

Add the following environment variable to enable banking analytics:

```bash
# analytics-engine/.env or production environment
ENABLE_BANKING_ANALYTICS=true
```

Restart the analytics-engine service after setting this variable.

### Step 2: Verify System Activation

Check that banking analytics is active:

```bash
# Check analytics engine health
curl http://localhost:3002/health

# Expected response should include banking analytics status
```

### Step 3: Configure Cash Van Monitors

Create monitors for each branch/location that requires cash van tracking:

```bash
# Example: Create a cash van monitor
curl -X POST http://localhost:3002/v1/banking/monitors \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: YOUR_API_KEY" \
  -d '{
    "tenantId": "tenant-001",
    "branchId": "branch-hq-001",
    "name": "HQ Branch Cash Van Monitor",
    "monitorType": "cash-van",
    "zones": {
      "loading": "zone-loading-bay",
      "unloading": "zone-vault-entrance",
      "secure": "zone-vault-interior"
    },
    "rules": {
      "authorizedVehicleCheck": true,
      "scheduledArrivalCheck": true,
      "minimumPersonnelCheck": true,
      "escortVerification": true,
      "unloadingDurationCheck": true,
      "transferRouteCheck": true,
      "accessCorrelation": true,
      "objectEscortCheck": true,
      "departureCompletion": true
    },
    "policies": {
      "authorizedVehicles": ["DL01CA1234", "DL02AB5678"],
      "minimumPersonnel": 3,
      "maxUnloadingDuration": 1800,
      "requireEscort": true,
      "requireDualAuthorization": true
    },
    "alertConfig": {
      "severity": "critical",
      "notifyOperators": true,
      "notifySecurity": true,
      "requireAcknowledgment": true
    },
    "isActive": true
  }'
```

**Response**:
```json
{
  "monitorId": "monitor-uuid-here",
  "status": "active"
}
```

### Step 4: Add Personnel Authorizations

Register authorized personnel (cash guards, managers, escorts, drivers):

```bash
# Example: Add cash guard authorization
curl -X POST http://localhost:3002/v1/banking/personnel \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: YOUR_API_KEY" \
  -d '{
    "tenantId": "tenant-001",
    "branchId": "branch-hq-001",
    "identityId": "identity-john-doe-001",
    "role": "cash_guard",
    "name": "John Doe",
    "badgeNumber": "CG-12345",
    "authorizedZones": ["zone-loading-bay", "zone-vault-entrance", "zone-vault-interior"],
    "isActive": true,
    "validFrom": "2024-01-01T00:00:00Z",
    "validUntil": "2025-12-31T23:59:59Z"
  }'
```

**Roles Available**:
- `cash_guard`: Authorized to handle cash
- `manager`: Supervisory authorization required
- `escort`: Security escort personnel
- `driver`: Authorized vehicle driver

### Step 5: Schedule Expected Visits

Schedule expected cash van visits (optional but recommended for enhanced detection):

```bash
# Example: Schedule a cash delivery
curl -X POST http://localhost:3002/v1/banking/visits \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: YOUR_API_KEY" \
  -d '{
    "tenantId": "tenant-001",
    "branchId": "branch-hq-001",
    "monitorId": "monitor-uuid-here",
    "vehiclePlateNumber": "DL01CA1234",
    "scheduledArrival": "2024-08-11T10:00:00Z",
    "scheduledDeparture": "2024-08-11T10:30:00Z",
    "purpose": "Weekly cash delivery",
    "expectedPersonnel": ["identity-john-doe-001", "identity-jane-smith-002"],
    "escortRequired": true
  }'
```

## Monitoring and Operations

### View Active Sessions

Monitor ongoing cash van sessions:

```bash
# Get all active sessions
curl http://localhost:3002/v1/banking/sessions?status=active \
  -H "x-analytics-source-key: YOUR_API_KEY"
```

### View Session Timeline

Get detailed timeline for a specific session:

```bash
# Get session timeline
curl http://localhost:3002/v1/banking/sessions/{sessionId}/timeline \
  -H "x-analytics-source-key: YOUR_API_KEY"
```

### Query Violations

Get policy violations and anomalies:

```bash
# Get violations for a branch
curl http://localhost:3002/v1/banking/sessions/violations?branchId=branch-hq-001 \
  -H "x-analytics-source-key: YOUR_API_KEY"
```

### Generate Evidence Package

Create forensic evidence package for investigation:

```bash
# Generate evidence package
curl -X POST http://localhost:3002/v1/banking/evidence/{sessionId}/package \
  -H "x-analytics-source-key: YOUR_API_KEY"
```

## Integration with Main API

The banking analytics routes are automatically registered in the main API server when enabled.

### API Routes Registration

In `src/app.ts`, banking analytics routes are registered after the capabilities routes:

```typescript
// Register banking analytics routes
try {
  const { registerBankingAnalyticsApiRoutes } = await import('../analytics-engine/src/routes/banking-analytics-api.js');
  await registerBankingAnalyticsApiRoutes(app, {});
  app.log.info('Banking analytics routes registered');
} catch (err: unknown) {
  app.log.error({ err }, 'failed to register banking analytics routes');
}
```

## Dashboard Access

The banking analytics dashboard is available in the main application:

1. Navigate to: `/banking-analytics` in the web UI
2. Select a branch to view active monitors
3. Monitor real-time cash van sessions
4. Review violations and alerts
5. Access evidence and investigation tools

## Troubleshooting

### Issue: No events being processed

**Check**:
1. Verify `ENABLE_BANKING_ANALYTICS=true` is set
2. Check analytics-engine logs for activation messages
3. Verify detectors are operational (vehicle, ANPR, person, face)
4. Check that monitors are active

**Solution**:
```bash
# Check analytics health
curl http://localhost:3002/health

# Review logs
docker logs analytics-engine -f
```

### Issue: Violations not being detected

**Check**:
1. Verify monitor rules are enabled
2. Check personnel authorizations are active
3. Verify zone configurations are correct
4. Check vehicle authorizations

**Solution**:
```bash
# Get monitor configuration
curl http://localhost:3002/v1/banking/monitors/{monitorId} \
  -H "x-analytics-source-key: YOUR_API_KEY"

# Verify rules and policies are correctly configured
```

### Issue: Face recognition not working

**Check**:
1. Verify face detector is active
2. Check that personnel have valid identityIds
3. Verify face recognition models are loaded

**Solution**:
```bash
# Check detector health
curl http://localhost:3002/health

# Look for face detector status in response
```

## Advanced Configuration

### Custom Rules Configuration

To customize rule behavior, modify the monitor policies:

```bash
curl -X PATCH http://localhost:3002/v1/banking/monitors/{monitorId} \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: YOUR_API_KEY" \
  -d '{
    "policies": {
      "authorizedVehicles": ["DL01CA1234"],
      "minimumPersonnel": 2,
      "maxUnloadingDuration": 900,
      "allowedArrivalWindow": 300,
      "requireEscort": true,
      "requireDualAuthorization": true
    }
  }'
```

### Alert Configuration

Customize alert severity and notification settings:

```bash
curl -X PATCH http://localhost:3002/v1/banking/monitors/{monitorId} \
  -H "Content-Type: application/json" \
  -H "x-analytics-source-key: YOUR_API_KEY" \
  -d '{
    "alertConfig": {
      "severity": "high",
      "notifyOperators": true,
      "notifySecurity": true,
      "notifyManagement": false,
      "requireAcknowledgment": true,
      "autoEscalateAfter": 300
    }
  }'
```

## Testing

Use the mock event generator for testing:

```typescript
import { MockEventGenerator } from './banking/__tests__/test-utils';
import { getBankingAnalyticsService } from './banking/banking-analytics.service';

// Create mock events for testing
const generator = new MockEventGenerator('tenant-001', 'branch-001');

// Simulate a complete workflow
const events = generator.generateCompleteWorkflow({
  vehiclePlate: 'DL01CA1234',
  personnelCount: 3,
  unloadingDuration: 600,
});

// Process events through the service
const service = getBankingAnalyticsService();
for (const event of events) {
  await service.processEvent(event);
}
```

## Production Checklist

Before enabling in production:

- [ ] Database tables created and migrated
- [ ] Environment variable `ENABLE_BANKING_ANALYTICS=true` set
- [ ] All monitors configured for production branches
- [ ] Personnel authorizations added for all authorized staff
- [ ] Authorized vehicles configured in monitor policies
- [ ] Zone configurations verified (loading, unloading, secure areas)
- [ ] Alert destinations configured (operators, security, management)
- [ ] Dashboard access permissions configured
- [ ] Evidence storage configured (video clips, snapshots)
- [ ] Integration tested with mock events
- [ ] Operators trained on dashboard and alert handling
- [ ] Incident response procedures documented

## Support

For issues or questions:

1. Check analytics-engine logs: `docker logs analytics-engine -f`
2. Review health endpoint: `GET /health`
3. Check banking analytics status: `GET /v1/banking/status`
4. Review documentation in `analytics-engine/src/banking/README.md`

## API Reference

Full API documentation: `analytics-engine/src/routes/banking-analytics-api.ts`

Key endpoints:
- `GET /v1/banking/monitors` - List all monitors
- `POST /v1/banking/monitors` - Create monitor
- `GET /v1/banking/sessions` - List sessions
- `GET /v1/banking/sessions/:id` - Get session details
- `POST /v1/banking/personnel` - Add personnel
- `POST /v1/banking/visits` - Schedule visit
- `GET /v1/banking/violations` - Get violations
- `POST /v1/banking/evidence/:sessionId/package` - Generate evidence

## Next Steps

After activation:

1. Monitor system behavior for first week
2. Adjust policies based on operational feedback
3. Fine-tune alert thresholds to reduce false positives
4. Train additional operators on system usage
5. Integrate with existing security systems
6. Set up automated reporting and analytics
7. Extend to additional use cases (ATM, vault, teller)
