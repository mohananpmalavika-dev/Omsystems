# Enterprise Security Platform - Quick Reference

## 🚀 Quick Start (5 Minutes)

```typescript
import { initializeSecurityPlatform, securityRoutes } from './src/security';
import express from 'express';
import { MongoClient } from 'mongodb';

const app = express();

// 1. Connect to MongoDB
const client = await MongoClient.connect('mongodb://localhost:27017');
const db = client.db('vms_security');

// 2. Initialize security platform
await initializeSecurityPlatform(db);

// 3. Mount security APIs
app.use('/v1/security', securityRoutes);

// 4. Start server
app.listen(3000, () => console.log('Security platform ready!'));
```

---

## 📚 Common Operations

### Secret Management

```typescript
import { SecurityServicesFactory } from './src/security/services';
const services = SecurityServicesFactory.getInstance();

// Create secret
const secret = await services.secretVault.createSecret(
  'api-key',
  'api_key',
  'sk_live_abc123...'
);

// Get secret (decrypted)
const retrieved = await services.secretVault.getSecret(secret.id);
const decrypted = await services.secretVault.decrypt(retrieved.value);

// Rotate secret
await services.secretVault.rotateSecret(secret.id);
```

### Certificate Management

```typescript
// Import certificate
const cert = await services.certificateManagement.importCertificate(
  'main-server-cert',
  'ssl_tls',
  pemCertificate,
  pemPrivateKey
);

// Check expiring
const expiring = await services.certificateManagement.checkExpiringCertificates(30);

// Auto-renew
cert.autoRenew = true;
cert.renewDaysBeforeExpiry = 30;
```

### Password Rotation

```typescript
// Add rotation target
await services.passwordRotation.addTarget({
  type: 'camera',
  name: 'Camera-01',
  host: '192.168.1.100',
  protocol: 'onvif',
  username: 'admin',
  secretId: 'camera_password',
  rotationPolicy: {
    enabled: true,
    intervalDays: 90,
    autoRotate: true
  }
});

// Rotate now
await services.passwordRotation.rotatePassword(targetId);
```

### Zero Trust Access Control

```typescript
// Evaluate access
const response = await services.zeroTrust.evaluateAccess({
  context: {
    userId: 'user123',
    deviceId: 'device456',
    ipAddress: '10.0.1.50',
    mfaVerified: true,
    riskScore: 25
  },
  resource: '/api/cameras/123',
  action: 'read'
});

if (response.decision === 'allow') {
  // Grant access
}
```

---

## 🔔 Monitoring & Alerts

```typescript
import { securityMonitor } from './src/security/monitoring/security-monitor';

// Get active alerts
const alerts = await securityMonitor.getActiveAlerts('critical');

// Acknowledge alert
await securityMonitor.acknowledgeAlert(alertId, userId);

// Custom alert handler
securityMonitor.on('alert:created', (alert) => {
  if (alert.severity === 'critical') {
    sendPagerDuty(alert);
  }
});
```

---

## 🌐 REST API Examples

### Get Security Posture
```bash
curl http://localhost:3000/v1/security/posture
```

### List Certificates
```bash
curl http://localhost:3000/v1/security/certificates?expiringSoon=true
```

### Create Secret
```bash
curl -X POST http://localhost:3000/v1/security/secrets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "db-password",
    "type": "password",
    "value": "secure_pass_123"
  }'
```

### Rotate Password
```bash
curl -X POST http://localhost:3000/v1/security/rotate-password \
  -H "Content-Type: application/json" \
  -d '{"targetId": "target_123", "force": true}'
```

### Check Health
```bash
curl http://localhost:3000/v1/security/health
```

---

## 🔧 Configuration

### Environment Variables
```bash
# Required
MONGODB_URI=mongodb://localhost:27017/vms_security
VAULT_MASTER_PASSWORD=<secure_password>
VAULT_SALT=<random_salt>

# Optional
HSM_TYPE=softhsm
SECURITY_CHECK_INTERVAL=300000
SMTP_HOST=smtp.example.com
SLACK_WEBHOOK_URL=https://hooks.slack.com/...
```

### Generate Secure Keys
```bash
# Master password
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Salt
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

---

## 📊 Health Checks

```typescript
// All services
const health = await services.healthCheck();

// Individual service
const vaultHealth = await services.secretVault.healthCheck();
const certHealth = await services.certificateManagement.healthCheck();

// Monitoring
const monitorHealth = await securityMonitor.healthCheck();
```

---

## 🎯 Security Policies

### Zero Trust Policy
```typescript
await services.zeroTrust.createPolicy({
  name: 'Require MFA for Admin',
  enabled: true,
  priority: 1,
  conditions: [
    { type: 'role', operator: 'equals', value: 'admin' }
  ],
  action: 'challenge',
  requireMFA: true
});
```

### Retention Policy
```typescript
await services.immutableStorage.createRetentionPolicy({
  name: '7 Year Retention',
  objectTypes: ['video', 'evidence'],
  retentionDays: 2555,
  lockImmediately: true,
  enabled: true
});
```

---

## 🚨 Incident Response

### Isolate Compromised Device
```typescript
await services.ransomwareDetection.isolateDevice(
  'recorder-01',
  'Ransomware detected'
);
```

### Apply Legal Hold
```typescript
await services.immutableStorage.applyLegalHold(
  objectId,
  'CASE-2024-001',
  'Evidence for investigation'
);
```

### Verify Device Attestation
```typescript
const attestation = await services.tpm.requestAttestation('device-01');
if (attestation.verified) {
  console.log('Device is trusted');
}
```

---

## 📈 Compliance

```typescript
// Assess compliance
const iso27001 = await services.securityPosture.assessCompliance('iso_27001');
console.log(`ISO 27001 Compliance: ${iso27001.overallCompliance}%`);

// List all frameworks
const frameworks = await services.securityPosture.listComplianceFrameworks();
```

---

## 🔐 Encryption Operations

### Encrypt Video
```typescript
const encrypted = await services.videoEncryption.encryptVideo(
  'video-123',
  '/path/to/video.mp4'
);
```

### HSM Signing
```typescript
const key = await services.hsm.generateKey('evidence-key', 'RSA', 2048);
const signature = await services.hsm.sign(key.id, evidenceData);
```

---

## 📝 Audit Logging

```typescript
// Secret access logs
const logs = await services.secretVault.getAccessLogs(secretId, 100);

// Access decision logs
const accessLogs = await db.collection('access_logs')
  .find({ userId: 'user123' })
  .sort({ timestamp: -1 })
  .limit(100)
  .toArray();
```

---

## 🎨 Custom Integrations

### Custom Alert Handler
```typescript
securityMonitor.on('notification:send', async (alert) => {
  // Send to your systems
  await sendToCustomSystem(alert);
});
```

### Custom Tamper Sensor
```typescript
await services.tamperDetection.registerSensor('device-01', 'custom');
```

### Custom Ransomware Pattern
```typescript
await services.ransomwareDetection.addPattern({
  name: 'Custom Pattern',
  indicators: [
    { metric: 'fileOps', operator: 'gt', value: 1000, weight: 50 }
  ],
  threshold: 70,
  severity: 'high',
  autoIsolate: true
});
```

---

## 🐛 Troubleshooting

### Check Service Status
```bash
curl http://localhost:3000/v1/security/health | jq
```

### View Logs
```bash
tail -f logs/security.log
```

### Test Database Connection
```typescript
const db = getDatabase();
const collections = await db.listCollections().toArray();
console.log('Collections:', collections.map(c => c.name));
```

### Verify Encryption
```typescript
const testData = 'test-data';
const encrypted = await services.secretVault.encrypt(testData);
const decrypted = await services.secretVault.decrypt(encrypted);
console.assert(decrypted === testData, 'Encryption test failed');
```

---

## 📞 Support

### Health Check Endpoints
- `GET /v1/security/health` - All services
- `GET /v1/security/posture` - Security posture
- `GET /v1/security/monitoring/status` - Monitoring status

### Common Issues

**Services won't start**
```bash
# Check environment
printenv | grep VAULT

# Check MongoDB
mongo --eval "db.serverStatus()"
```

**High memory usage**
```bash
# Check process
ps aux | grep node

# Restart if needed
systemctl restart vms-security
```

**Alerts not sending**
```bash
# Test notification
curl -X POST http://localhost:3000/v1/security/monitoring/test-alert
```

---

## 🎓 Best Practices

1. **Always use HTTPS** in production
2. **Rotate master keys** periodically
3. **Enable MFA** for all admin accounts
4. **Monitor alerts** daily
5. **Test backups** weekly
6. **Review audit logs** regularly
7. **Update dependencies** monthly
8. **Run health checks** continuously
9. **Document incidents** thoroughly
10. **Train staff** on procedures

---

## 📚 Additional Resources

- **Full Documentation**: `./README.md`
- **Deployment Guide**: `./DEPLOYMENT_GUIDE.md`
- **Implementation Summary**: `./IMPLEMENTATION_SUMMARY.md`
- **API Reference**: See code comments in `./api/security-dashboard.routes.ts`

---

**Quick Help**: 🔐 All services accessible via `SecurityServicesFactory.getInstance()`  
**API Base**: `http://localhost:3000/v1/security`  
**Health Check**: `GET /v1/security/health`

*Last Updated: January 31, 2026*
