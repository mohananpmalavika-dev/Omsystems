# System Maintenance Module - Quick Start Guide

## 🚀 Get Started in 5 Minutes

This guide gets you up and running with the System Maintenance module.

---

## Prerequisites

- Database migrations 016 and 017 applied
- Application running (`npm run dev`)
- Valid authentication token

---

## 1. Verify Services Are Running

```bash
# Check health collector status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/health/collector/status

# Expected response:
{
  "running": true,
  "collectors": ["camera", "storage", "network", "ups"]
}
```

```bash
# Check alert engine status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/alerts/engine/status

# Expected response:
{
  "running": true,
  "activeAlertCount": 0,
  "rules": 15
}
```

---

## 2. Create Your First Asset

```bash
curl -X POST http://localhost:3000/v1/maintenance/assets \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "category": "camera",
    "asset_type": "PTZ Camera",
    "make": "Hikvision",
    "model": "DS-2DE4A425IW-DE",
    "serial_number": "CAM-2024-001",
    "status": "operational",
    "installation_date": "2024-01-15"
  }'
```

---

## 3. View Real-Time Health

```bash
# Camera health
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/health/cameras/realtime

# Storage summary
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/health/storage/summary

# Network health
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/health/network/branches

# UPS/Power status
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/health/power/summary
```

---

## 4. View Active Alerts

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/alerts

# Filter by severity
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/v1/maintenance/alerts?severity=critical"

# Filter by category
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/v1/maintenance/alerts?category=health"
```

---

## 5. Create a Work Order

```bash
curl -X POST http://localhost:3000/v1/maintenance/workorders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order_number": "WO-2024-001",
    "problem": "Camera not recording",
    "severity": "high",
    "sla_due_at": "2024-07-23T18:00:00Z"
  }'
```

---

## 6. Add a Vendor

```bash
curl -X POST http://localhost:3000/v1/maintenance/vendors \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Hikvision Service Center",
    "contact": "John Doe",
    "email": "support@hikvision.com",
    "phone": "+1-234-567-8900"
  }'
```

---

## 7. Create AMC Contract

```bash
curl -X POST http://localhost:3000/v1/maintenance/amc \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "contract_number": "AMC-2024-001",
    "vendor_id": "VENDOR_UUID_HERE",
    "start_date": "2024-01-01",
    "end_date": "2024-12-31",
    "cost": 50000,
    "sla": "Response: 4 hours, Resolution: 24 hours"
  }'
```

---

## 8. Generate a Report

```bash
curl -X POST http://localhost:3000/v1/maintenance/reports/generate \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "reportType": "preventive",
    "periodStart": "2024-01-01",
    "periodEnd": "2024-07-22"
  }'
```

---

## Common Workflows

### Workflow 1: Handle Camera Offline Alert

```bash
# 1. Get active alerts
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/alerts?severity=critical

# 2. Acknowledge the alert
curl -X POST http://localhost:3000/v1/maintenance/alerts/{ALERT_ID}/acknowledge \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"notes":"Dispatching technician"}'

# 3. Create work order
curl -X POST http://localhost:3000/v1/maintenance/workorders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order_number": "WO-2024-002",
    "problem": "Camera offline - physical inspection required",
    "severity": "critical",
    "sla_due_at": "2024-07-22T20:00:00Z"
  }'

# 4. After repair, resolve the alert
curl -X POST http://localhost:3000/v1/maintenance/alerts/{ALERT_ID}/resolve \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"resolution":"Camera cable replaced, now online"}'
```

### Workflow 2: Preventive Maintenance

```bash
# 1. Create maintenance plan
curl -X POST http://localhost:3000/v1/maintenance/plans \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Monthly Camera Cleaning",
    "cadence": "monthly"
  }'

# 2. Schedule for specific branch
curl -X POST http://localhost:3000/v1/maintenance/schedules \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "plan_id": "PLAN_UUID_HERE",
    "branch_node_id": "BRANCH_UUID_HERE",
    "next_run_at": "2024-08-01T09:00:00Z",
    "cadence": "monthly"
  }'

# 3. View scheduled visits
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/visits
```

### Workflow 3: Monitor Storage Health

```bash
# 1. View storage summary
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/health/storage/summary

# 2. Get predictive alerts for storage
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/v1/maintenance/health/predictive?assetType=storage"

# 3. View failure forecast
curl -H "Authorization: Bearer YOUR_TOKEN" \
  "http://localhost:3000/v1/maintenance/health/forecast?days=90"

# 4. If critical, create work order
curl -X POST http://localhost:3000/v1/maintenance/workorders \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "work_order_number": "WO-2024-003",
    "problem": "Storage device showing high failure probability",
    "severity": "high",
    "action_taken": "Schedule disk replacement"
  }'
```

---

## Dashboard Overview Endpoint

Get all metrics in one call:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/dashboard/status

# Response includes:
# - Total assets and their status
# - Open work orders and SLA breaches
# - Scheduled maintenance and overdue visits
# - AMC contracts and expiring ones
# - Critical and warning alerts
```

---

## Health Check Endpoint

Get system health summary:

```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
  http://localhost:3000/v1/maintenance/dashboard/health

# Response includes:
# - Overall health percentage
# - Cameras online/offline/degraded counts
# - Storage alerts
# - Network issues
# - Overdue maintenance count
# - Open work orders
```

---

## Testing Alerts

### Trigger a Test Alert

To test the alert system, you can manually insert health data that breaches thresholds:

```javascript
// Example: Create a camera health record with high temperature
await store.recordCameraHealth({
  tenantId: 'your-tenant-id',
  cameraId: 'camera-id',
  onlineStatus: 'online',
  temperature: 75,  // Above critical threshold (70)
  fps: 25,
  bitrate: 4096,
});

// The health collector will evaluate this and create an alert
```

---

## Configuration

### Adjust Collection Intervals

Edit `src/maintenance/health-collector.ts`:

```typescript
private readonly INTERVALS = {
  camera: 2 * 60 * 1000,      // Change to 2 minutes
  storage: 10 * 60 * 1000,    // Change to 10 minutes
  // ...
};
```

### Adjust Alert Thresholds

Edit `src/maintenance/health-collector.ts`:

```typescript
camera: [
  { metricName: 'fps', warningThreshold: 15, criticalThreshold: 10, operator: 'lt' },
  { metricName: 'temperature', warningThreshold: 55, criticalThreshold: 65, operator: 'gt' },
  // ...
],
```

### Modify Alert Rules

Edit `src/maintenance/alert-engine.ts`:

```typescript
{
  id: 'camera-offline',
  name: 'Camera Offline',
  cooldownMinutes: 10,  // Change cooldown
  escalationMinutes: 20,  // Change escalation
  notificationChannels: ['email'],  // Change channels
}
```

---

## Troubleshooting

### Problem: No health data being collected

**Solution:**
1. Check if services are running:
   ```bash
   curl http://localhost:3000/v1/maintenance/health/collector/status
   ```

2. Check application logs:
   ```bash
   tail -f logs/app.log | grep "health-collector"
   ```

3. Verify you have assets:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/v1/maintenance/assets
   ```

### Problem: Alerts not firing

**Solution:**
1. Check alert engine status:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/v1/maintenance/alerts/engine/status
   ```

2. Check if thresholds are being breached:
   ```bash
   curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/v1/maintenance/health/cameras/realtime
   ```

3. Check cooldown periods - alerts won't fire if in cooldown

### Problem: Services won't start

**Solution:**
1. Check database connection
2. Verify migrations are applied:
   ```sql
   SELECT * FROM pg_catalog.pg_tables 
   WHERE tablename LIKE 'maintenance_%';
   ```
3. Check for errors in logs during startup

---

## Next Steps

1. ✅ **You're Ready!** - Start using the maintenance module
2. 📊 **Build Dashboard** - Create frontend visualizations (Phase 4)
3. 📧 **Configure Notifications** - Set up email/SMS/webhook integrations
4. 🔮 **Enable Predictive** - Integrate real data sources for predictions
5. 📱 **Mobile App** - Build technician mobile interface

---

## Resources

- **Full Documentation**: `MAINTENANCE_MODULE_COMPLETE_GUIDE.md`
- **Implementation Details**: `MAINTENANCE_MODULE_IMPLEMENTATION_COMPLETE.md`
- **Roadmap**: `MAINTENANCE_IMPLEMENTATION_ROADMAP.md`
- **API Reference**: Test endpoints above

---

**Questions?** Check the comprehensive documentation or application logs.

**Status**: ✅ Phase 3 Complete - Real-time Health Monitoring Active
