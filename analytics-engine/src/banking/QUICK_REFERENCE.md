# Banking Analytics - Quick Reference Card

## 🚀 Quick Start (5 Minutes)

### 1. Enable System
```bash
# Add to .env
ENABLE_BANKING_ANALYTICS=true

# Restart services
npm run dev
```

### 2. Run Demo Setup
```bash
cd analytics-engine
npm run setup-banking-demo
```

### 3. Open Dashboard
Navigate to: `http://localhost:3000/banking-analytics`

---

## 📋 Common API Operations

### Create Monitor
```bash
POST /v1/banking/monitors
{
  "tenantId": "tenant-001",
  "branchId": "branch-001",
  "name": "Branch Cash Van Monitor",
  "monitorType": "cash-van",
  "zones": {
    "loading": "zone-loading-bay",
    "unloading": "zone-vault-entrance"
  },
  "policies": {
    "authorizedVehicles": ["DL01CA1234"],
    "minimumPersonnel": 3,
    "maxUnloadingDuration": 1800
  },
  "isActive": true
}
```

### Add Personnel
```bash
POST /v1/banking/personnel
{
  "tenantId": "tenant-001",
  "branchId": "branch-001",
  "identityId": "identity-john-001",
  "role": "cash_guard",
  "name": "John Doe",
  "badgeNumber": "CG-001",
  "isActive": true
}
```

### Schedule Visit
```bash
POST /v1/banking/visits
{
  "tenantId": "tenant-001",
  "branchId": "branch-001",
  "monitorId": "monitor-id-here",
  "vehiclePlateNumber": "DL01CA1234",
  "scheduledArrival": "2024-08-11T10:00:00Z",
  "scheduledDeparture": "2024-08-11T10:30:00Z",
  "purpose": "Cash delivery",
  "escortRequired": true
}
```

### Query Sessions
```bash
# Get active sessions
GET /v1/banking/sessions?status=active

# Get session details
GET /v1/banking/sessions/{sessionId}

# Get session timeline
GET /v1/banking/sessions/{sessionId}/timeline

# Get violations
GET /v1/banking/sessions/violations?branchId=branch-001
```

### Generate Evidence
```bash
POST /v1/banking/evidence/{sessionId}/package
```

---

## 🔍 Monitoring Commands

### Check System Health
```bash
curl http://localhost:3002/health
```

### Check Banking Status
```bash
curl http://localhost:3002/v1/banking/status \
  -H "x-analytics-source-key: YOUR_KEY"
```

### View Logs
```bash
# Analytics engine
docker logs analytics-engine -f | grep banking

# Main API
docker logs sentinel-api -f | grep banking
```

---

## 🎯 Workflow States

1. **IDLE** - No activity detected
2. **VEHICLE_APPROACHING** - Vehicle detected nearby
3. **VEHICLE_IDENTIFIED** - License plate read
4. **VEHICLE_IN_ZONE** - Vehicle entered loading/unloading zone
5. **PERSONNEL_DETECTED** - People detected near vehicle
6. **PERSONNEL_VERIFIED** - Personnel identified via face recognition
7. **UNLOADING_IN_PROGRESS** - Active transfer of goods
8. **TRANSFER_IN_PROGRESS** - Movement to secure area
9. **UNLOADING_COMPLETE** - Transfer finished
10. **COMPLETED** - Vehicle departed
11. **VIOLATION_DETECTED** - Policy breach detected

---

## ⚠️ Common Violations

| Violation | Cause | Severity |
|-----------|-------|----------|
| **Unauthorized Vehicle** | Vehicle not in authorized list | Critical |
| **Schedule Deviation** | Arrived outside time window | High |
| **Insufficient Personnel** | Below minimum count | Critical |
| **Missing Escort** | Escort not detected/verified | High |
| **Excessive Duration** | Unloading took too long | Medium |
| **Route Violation** | Didn't follow expected path | High |
| **Unsecured Object** | Cash handled without escort | Critical |
| **Incomplete Departure** | Vehicle left without completing | Medium |

---

## 👥 Personnel Roles

| Role | Purpose | Typical Count |
|------|---------|---------------|
| **cash_guard** | Handle cash | 2-3 |
| **escort** | Security escort | 1-2 |
| **manager** | Supervisory oversight | 1 |
| **driver** | Vehicle operator | 1 |

---

## 🔧 Troubleshooting

### No Events Processing
```bash
# 1. Check environment variable
echo $ENABLE_BANKING_ANALYTICS  # Should be "true"

# 2. Check detector health
curl http://localhost:3002/health | jq '.pipeline.detectors'

# 3. Check integration logs
docker logs analytics-engine -f | grep "Banking analytics"
```

### Violations Not Detected
```bash
# 1. Verify monitor is active
curl http://localhost:3002/v1/banking/monitors/{monitorId}

# 2. Check rule configuration
# Ensure rules are enabled in monitor.rules

# 3. Verify personnel authorizations
curl http://localhost:3002/v1/banking/personnel?branchId=branch-001
```

### Face Recognition Issues
```bash
# 1. Check face detector
curl http://localhost:3002/health | jq '.pipeline.detectors.face'

# 2. Verify personnel identityIds match
# Identity IDs must match those from face recognition system

# 3. Check recognition confidence threshold
# Default is 0.75, adjust if needed
```

---

## 📊 Dashboard Sections

### 1. Monitor Overview
- Active monitors per branch
- Status indicators (green/yellow/red)
- Quick access to configuration

### 2. Active Sessions
- Real-time session cards
- Current state and duration
- Personnel count and verification status
- Violation alerts

### 3. Timeline View
- Chronological event list
- State transitions
- Rule evaluation results
- Evidence thumbnails

### 4. Violations Panel
- Recent violations
- Severity indicators
- Quick actions (acknowledge, escalate, investigate)
- Evidence access

### 5. Statistics
- Daily session count
- Average duration
- Violation rate
- Compliance score

---

## 🔐 Security Notes

- All API endpoints require `x-analytics-source-key` header
- Personnel data requires proper authorization
- Evidence access is logged and auditable
- Face recognition requires consent compliance
- Watchlist access is role-restricted

---

## 📈 Performance Metrics

### Typical Session
- **Detection Latency**: < 2 seconds
- **Rule Evaluation**: < 500ms
- **Evidence Generation**: < 5 seconds
- **Dashboard Update**: Real-time (< 1s)

### System Capacity
- **Concurrent Sessions**: 100+ per analytics engine
- **Event Throughput**: 1000+ events/second
- **Storage**: ~50MB per session (with evidence)

---

## 🎓 Training Checklist

For new operators:

- [ ] Understand workflow states
- [ ] Know violation types and severities
- [ ] Practice acknowledging alerts
- [ ] Access evidence packages
- [ ] Generate investigation reports
- [ ] Configure monitors
- [ ] Add personnel authorizations
- [ ] Schedule expected visits
- [ ] Respond to critical violations
- [ ] Escalate to security/management

---

## 📞 Support Contacts

- **Technical Issues**: Check logs, health endpoint
- **Configuration Help**: See ACTIVATION_GUIDE.md
- **Integration Questions**: See INTEGRATION_EXAMPLE.md
- **Architecture Details**: See README.md

---

## 🔄 Regular Maintenance

### Daily
- [ ] Review violations from previous day
- [ ] Check active sessions
- [ ] Verify scheduled visits

### Weekly
- [ ] Update personnel authorizations
- [ ] Review policy effectiveness
- [ ] Adjust thresholds if needed
- [ ] Check evidence storage

### Monthly
- [ ] Audit compliance metrics
- [ ] Review false positive rate
- [ ] Train new operators
- [ ] Update authorized vehicles

---

## 💡 Pro Tips

1. **Schedule Visits in Advance**: Improves detection accuracy and reduces false positives
2. **Keep Personnel Updated**: Ensure all authorized staff are in the system
3. **Review Violations Daily**: Quick response prevents escalation
4. **Use Evidence Packages**: Complete forensic record for investigations
5. **Monitor Duration Trends**: Unusual patterns may indicate issues
6. **Test with Mock Events**: Validate configuration before going live
7. **Set Realistic Thresholds**: Balance security with operational needs
8. **Document Exceptions**: Track approved deviations from policy

---

## 🚨 Critical Alert Response

When a critical violation is detected:

1. **Acknowledge Alert** - Let system know you're aware
2. **Review Timeline** - Understand what happened
3. **Check Evidence** - View video clips and snapshots
4. **Verify Personnel** - Confirm identities if unclear
5. **Take Action** - Follow security protocols
6. **Document** - Add notes to session
7. **Generate Report** - Create investigation package
8. **Escalate** - Notify management if needed

---

## 📖 Additional Resources

- **Full Documentation**: `analytics-engine/src/banking/README.md`
- **Activation Steps**: `ACTIVATION_GUIDE.md`
- **Event Flow Example**: `INTEGRATION_EXAMPLE.md`
- **API Reference**: `routes/banking-analytics-api.ts`
- **Test Scenarios**: `__tests__/workflow-scenarios.test.ts`

---

## ⚡ Quick Commands Reference

```bash
# Enable system
echo "ENABLE_BANKING_ANALYTICS=true" >> .env

# Setup demo
npm run setup-banking-demo

# Check health
curl localhost:3002/health

# View active sessions
curl localhost:3002/v1/banking/sessions?status=active \
  -H "x-analytics-source-key: $API_KEY"

# Get violations
curl localhost:3002/v1/banking/sessions/violations \
  -H "x-analytics-source-key: $API_KEY"

# Generate evidence
curl -X POST localhost:3002/v1/banking/evidence/{id}/package \
  -H "x-analytics-source-key: $API_KEY"
```

---

**Last Updated**: August 11, 2024
**Version**: 1.0.0
**Status**: Production Ready ✅
