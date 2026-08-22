# Alert Notification Matrix

## Overview

The notification matrix defines which channels are used for each alert severity level. This ensures critical alerts get immediate attention while avoiding notification fatigue for lower-priority events.

## Notification Channels

| Channel | Description | Response Time | Cost |
|---------|-------------|---------------|------|
| **dashboard** | Real-time popup in operator dashboard | Immediate | Free |
| **sms** | SMS text message to mobile phone | 5-30 seconds | ~$0.01/message |
| **email** | Email notification | 1-5 minutes | Free |
| **voice** | Automated voice call | 10-30 seconds | ~$0.05/minute |
| **log** | System log entry only | N/A | Free |

## Current Matrix (Correct Implementation)

```typescript
export const NOTIFICATION_MATRIX: Record<string, AlertNotificationChannel[]> = {
  P1: ["dashboard", "sms", "email", "voice"],  // Critical: All channels
  P2: ["dashboard", "email"],                   // High: Dashboard + Email only
  P3: ["dashboard"],                            // Medium: Dashboard only
  P4: ["log"],                                  // Low: Log only
  P5: ["log"],                                  // Informational: Log only
};
```

## Severity Definitions

### P1 - Critical (All Channels)
**Response Required**: Immediate  
**Escalation**: Voice call after 5 minutes if not acknowledged  
**Examples**:
- Camera offline (branch security compromised)
- Fire/smoke detection
- Intrusion in restricted zone
- DVR/NVR complete failure
- Internet connectivity lost

**Channels**: Dashboard popup + SMS + Email + Voice call

### P2 - High (Dashboard + Email)
**Response Required**: Within 15 minutes  
**Escalation**: SMS after 15 minutes if not acknowledged  
**Examples**:
- Camera quality degradation (low FPS, high packet loss)
- Partial DVR/NVR failure
- Retention policy violation
- HDD approaching capacity
- Person detected in restricted zone (non-critical hours)

**Channels**: Dashboard popup + Email  
**Note**: SMS intentionally excluded to reduce costs for high-volume alerts

### P3 - Medium (Dashboard Only)
**Response Required**: Within 1 hour  
**Examples**:
- Camera briefly offline (recovered within 5 minutes)
- Storage warning (80% capacity)
- Network latency increase
- Scheduled maintenance due

**Channels**: Dashboard popup only

### P4 - Low (Log Only)
**Response Required**: Review during business hours  
**Examples**:
- Configuration changes
- User login/logout
- Camera setting adjustments
- Non-critical system events

**Channels**: System log only (no active notification)

### P5 - Informational (Log Only)
**Response Required**: None  
**Examples**:
- Routine health checks
- Successful backups
- Analytics detections (non-alert)
- Performance metrics

**Channels**: System log only (no active notification)

## Rationale for P2 Configuration

### Why P2 Does NOT Include SMS

**Cost Control**:
- P2 alerts can occur frequently (camera quality issues, retention warnings)
- At 10-50 P2 alerts/day across 400 branches, SMS costs would be $100-$500/month
- Email provides sufficient notification for events requiring 15-minute response

**Operator Workflow**:
- Operators actively monitor dashboard during shifts
- Email provides audit trail and detail for investigation
- SMS reserved for true emergencies (P1) requiring immediate response

**Escalation Path**:
- P2 alerts that remain unacknowledged for 15 minutes automatically escalate to P1
- Upon escalation, SMS is then sent
- This ensures critical situations still get SMS notification

### Historical Note

An earlier implementation incorrectly included SMS for P2 alerts. This was corrected in the current version to match the design specification:

```diff
- P2: ["dashboard", "email", "sms"],  // ❌ Incorrect (removed)
+ P2: ["dashboard", "email"],         // ✅ Correct
```

## Configuration

### Environment Variables

```bash
# SMS Provider (P1 only)
SMS_PROVIDER_URL=https://sms-gateway.example.com/send
SMS_PROVIDER_TOKEN=your-token-here

# Email Provider (P1, P2)
EMAIL_PROVIDER_URL=https://email-service.example.com/send
EMAIL_PROVIDER_TOKEN=your-token-here

# Voice Provider (P1 only)
VOICE_PROVIDER_URL=https://voice-gateway.example.com/call
VOICE_PROVIDER_TOKEN=your-token-here
```

### Escalation Timing

```typescript
// src/alerts/escalation-config.ts
export const ESCALATION_CONFIG = {
  P1: {
    escalationAfterSeconds: 300,    // 5 minutes
    maxEscalations: 3,               // Call up to 3 times
    escalationInterval: 180,         // 3 minutes between calls
  },
  P2: {
    escalationAfterSeconds: 900,    // 15 minutes → escalate to P1
    maxEscalations: 1,
  },
};
```

## Testing

### Unit Test

```typescript
// src/alerts/notification-dispatcher.test.ts
describe('NOTIFICATION_MATRIX', () => {
  it('P1 includes all channels', () => {
    expect(NOTIFICATION_MATRIX.P1).toEqual(['dashboard', 'sms', 'email', 'voice']);
  });

  it('P2 includes dashboard and email only (no SMS)', () => {
    expect(NOTIFICATION_MATRIX.P2).toEqual(['dashboard', 'email']);
    expect(NOTIFICATION_MATRIX.P2).not.toContain('sms');
  });

  it('P3 includes dashboard only', () => {
    expect(NOTIFICATION_MATRIX.P3).toEqual(['dashboard']);
  });

  it('P4 and P5 log only', () => {
    expect(NOTIFICATION_MATRIX.P4).toEqual(['log']);
    expect(NOTIFICATION_MATRIX.P5).toEqual(['log']);
  });
});
```

### Integration Test

```bash
# Test P2 alert notification (should NOT send SMS)
curl -X POST http://localhost:3000/api/v1/alerts \
  -H "Content-Type: application/json" \
  -d '{
    "severity": "P2",
    "title": "Camera Quality Degraded",
    "description": "Camera-001 FPS dropped to 15",
    "cameraId": "camera-001"
  }'

# Verify only dashboard and email notifications were created
curl http://localhost:3000/api/v1/alerts/notifications?alertId=<alert-id>
# Should show: dashboard (pending), email (sent)
# Should NOT show: sms
```

## Cost Analysis

### Before Correction (P2 with SMS)

**Assumptions**:
- 400 branches
- Average 5 P2 alerts/branch/month
- $0.01/SMS

**Monthly Cost**: 400 × 5 × $0.01 = **$200/month** ($2,400/year)

### After Correction (P2 without SMS)

**Monthly Cost**: **$0** (email is free)  
**Annual Savings**: **$2,400**

### P1 SMS Cost (Still Included)

**Assumptions**:
- Average 2 P1 alerts/branch/month
- 3 escalation calls = 3 SMS messages

**Monthly Cost**: 400 × 2 × 3 × $0.01 = **$24/month** ($288/year)

**Total SMS Budget**: $288/year (reasonable for critical alerts)

## Compliance

### SLA Requirements

| Severity | Acknowledgment SLA | Notification Channels | Meets SLA? |
|----------|-------------------|----------------------|------------|
| P1 | 5 minutes | Dashboard + SMS + Email + Voice | ✅ Yes |
| P2 | 15 minutes | Dashboard + Email | ✅ Yes |
| P3 | 1 hour | Dashboard | ✅ Yes |
| P4 | 4 hours | Log | ✅ Yes |
| P5 | N/A | Log | ✅ Yes |

### Audit Trail

All notifications are logged to the database:

```sql
SELECT 
  alert_id,
  severity,
  channel,
  recipient,
  status,
  delivered_at
FROM alert_notifications
WHERE severity = 'P2'
  AND created_at >= NOW() - INTERVAL '24 hours';
```

## Customization

Organizations can override the notification matrix via configuration:

```typescript
// config/custom-notification-matrix.ts
export const CUSTOM_NOTIFICATION_MATRIX = {
  ...NOTIFICATION_MATRIX,
  P2: ["dashboard", "email", "sms"], // Add SMS for P2 if desired
  P3: ["dashboard", "email"],         // Upgrade P3 to include email
};
```

**Note**: Customization increases notification volume and costs. Evaluate carefully before modifying the default matrix.

## References

- [Alert Severity Guidelines](./ALERT_SEVERITY_GUIDELINES.md)
- [Escalation Policy](./ESCALATION_POLICY.md)
- [SMS Provider Integration](../../backend/docs/SMS_INTEGRATION.md)
- [Cost Optimization](../../backend/docs/COST_OPTIMIZATION.md)
