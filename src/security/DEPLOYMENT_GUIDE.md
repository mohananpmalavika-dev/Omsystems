# Enterprise Security Platform - Deployment Guide

## 📋 Pre-Deployment Checklist

### System Requirements
- [ ] Node.js 16+ installed
- [ ] MongoDB 4.4+ running
- [ ] Minimum 4GB RAM available
- [ ] 50GB disk space for logs and data
- [ ] Network access to devices for monitoring

### Security Prerequisites
- [ ] SSL/TLS certificates for HTTPS
- [ ] Master encryption password generated
- [ ] Database backup strategy defined
- [ ] Firewall rules configured
- [ ] Access control policies defined

---

## 🚀 Step-by-Step Deployment

### Step 1: Install Dependencies

```bash
cd c:\Omsystems
npm install
```

Required packages (add to package.json):
```json
{
  "dependencies": {
    "express": "^4.18.0",
    "mongodb": "^5.0.0",
    "node-forge": "^1.3.0",
    "axios": "^1.6.0"
  },
  "devDependencies": {
    "@types/express": "^4.17.0",
    "@types/node": "^20.0.0",
    "@types/node-forge": "^1.3.0",
    "typescript": "^5.0.0"
  }
}
```

### Step 2: Configure Environment

Create `.env` file in root:
```bash
# Database
MONGODB_URI=mongodb://localhost:27017/vms_security

# Secret Vault
VAULT_MASTER_PASSWORD=<generate_secure_password>
VAULT_SALT=<generate_random_salt>

# HSM (Optional)
HSM_TYPE=softhsm
HSM_LIBRARY_PATH=/usr/lib/softhsm/libsofthsm2.so

# Monitoring
SECURITY_CHECK_INTERVAL=300000
LOG_LEVEL=info

# Notifications (Optional)
SMTP_HOST=smtp.example.com
SMTP_PORT=587
SMTP_USER=security@example.com
SMTP_PASSWORD=<smtp_password>
SLACK_WEBHOOK_URL=https://hooks.slack.com/services/YOUR/WEBHOOK/URL
```

**Generate secure credentials:**
```bash
# Generate master password (32 characters)
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"

# Generate salt (32 bytes)
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

### Step 3: Initialize Database

```typescript
// scripts/init-security.ts
import { MongoClient } from 'mongodb';
import { initializeSecurityCollections } from './src/security/database/schemas';

async function initDatabase() {
  const client = await MongoClient.connect(process.env.MONGODB_URI!);
  const db = client.db();
  
  await initializeSecurityCollections(db);
  
  console.log('✅ Database initialized successfully');
  await client.close();
}

initDatabase().catch(console.error);
```

Run initialization:
```bash
npx ts-node scripts/init-security.ts
```

### Step 4: Integrate into Main Application

Update your main server file:

```typescript
// src/server.ts
import express from 'express';
import { MongoClient } from 'mongodb';
import { 
  initializeSecurityPlatform, 
  securityRoutes, 
  getSecurityPlatformHealth 
} from './security';

const app = express();
const PORT = process.env.PORT || 3000;

async function startServer() {
  // Connect to MongoDB
  const mongoClient = await MongoClient.connect(process.env.MONGODB_URI!);
  const db = mongoClient.db();
  
  // Initialize security platform
  await initializeSecurityPlatform(db);
  
  // Middleware
  app.use(express.json());
  
  // Mount security routes
  app.use('/v1/security', securityRoutes);
  
  // Health check endpoint
  app.get('/health', async (req, res) => {
    const health = await getSecurityPlatformHealth();
    res.json(health);
  });
  
  // Start server
  app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`🔐 Security APIs available at http://localhost:${PORT}/v1/security`);
  });
}

startServer().catch(console.error);
```

### Step 5: Configure Authentication Middleware

Add authentication to protect security endpoints:

```typescript
// src/middleware/auth.ts
import { Request, Response, NextFunction } from 'express';

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }
  
  // Verify token (implement your auth logic)
  // ...
  
  next();
}

export function requireRole(role: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    // Check user role
    // ...
    next();
  };
}
```

Apply to security routes:
```typescript
import { requireAuth, requireRole } from './middleware/auth';

app.use('/v1/security', requireAuth, requireRole('security_admin'), securityRoutes);
```

### Step 6: Start the Application

```bash
# Development
npm run dev

# Production
npm run build
npm start
```

### Step 7: Verify Deployment

**Check health endpoint:**
```bash
curl http://localhost:3000/health
```

**Test security posture API:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/v1/security/posture
```

**Check monitoring:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:3000/v1/security/health
```

---

## 🔧 Post-Deployment Configuration

### 1. Create Initial Security Policies

```typescript
// scripts/create-default-policies.ts
import { SecurityServicesFactory } from './src/security/services';

async function createPolicies() {
  const services = SecurityServicesFactory.getInstance();
  
  // Zero Trust policy
  await services.zeroTrust.createPolicy({
    name: 'Require MFA for Admin',
    description: 'All admin operations require MFA',
    enabled: true,
    priority: 1,
    conditions: [
      { type: 'role', operator: 'equals', value: 'admin' }
    ],
    action: 'challenge',
    requireMFA: true
  });
  
  // Retention policy
  await (services as any).immutableStorage.createRetentionPolicy({
    name: '7 Year Evidence Retention',
    description: 'Banking compliance',
    objectTypes: ['video', 'evidence'],
    retentionDays: 2555,
    lockImmediately: true,
    enabled: true,
    priority: 1
  });
  
  console.log('✅ Default policies created');
}

createPolicies().catch(console.error);
```

### 2. Import Initial Certificates

```bash
# Import root CA
curl -X POST http://localhost:3000/v1/security/certificates \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Root CA",
    "type": "root_ca",
    "pemCertificate": "-----BEGIN CERTIFICATE-----\n..."
  }'
```

### 3. Configure Password Rotation Targets

```typescript
// Add camera for rotation
await services.passwordRotation.addTarget({
  type: 'camera',
  name: 'Camera-Branch-01',
  host: '192.168.1.100',
  port: 80,
  protocol: 'onvif',
  username: 'admin',
  secretId: 'camera_password_secret',
  enabled: true,
  rotationPolicy: {
    enabled: true,
    intervalDays: 90,
    notifyBeforeDays: 7,
    autoRotate: true
  }
});
```

### 4. Enable Device Monitoring

```typescript
// Start tamper monitoring
await (services as any).tamperDetection.monitorDevice('recorder-01', 'recorder');

// Start ransomware monitoring
await (services as any).ransomwareDetection.startMonitoring('recorder-01');
```

---

## 📊 Monitoring Setup

### Configure Alert Notifications

Create notification handlers:

```typescript
// src/security/notifications/handlers.ts
import { securityMonitor } from '../monitoring/security-monitor';

// Email notifications
securityMonitor.on('notification:send', async (alert) => {
  if (alert.severity === 'critical' || alert.severity === 'high') {
    await sendEmail({
      to: 'security-team@example.com',
      subject: `[${alert.severity.toUpperCase()}] ${alert.title}`,
      body: alert.description
    });
  }
});

// Slack notifications
securityMonitor.on('notification:send', async (alert) => {
  if (alert.severity === 'critical') {
    await sendSlackMessage({
      webhook: process.env.SLACK_WEBHOOK_URL,
      text: `🚨 *${alert.title}*\n${alert.description}`,
      color: 'danger'
    });
  }
});
```

### Setup Log Forwarding to SIEM

```typescript
// Forward security events to SIEM
securityMonitor.on('alert:created', async (alert) => {
  await forwardToSIEM({
    timestamp: alert.timestamp,
    severity: alert.severity,
    type: alert.type,
    description: alert.description,
    source: 'vms-security-platform',
    data: alert.data
  });
});
```

---

## 🔒 Security Hardening

### 1. Enable HTTPS Only

```typescript
import https from 'https';
import fs from 'fs';

const options = {
  key: fs.readFileSync('ssl/private.key'),
  cert: fs.readFileSync('ssl/certificate.crt')
};

https.createServer(options, app).listen(443);
```

### 2. Rate Limiting

```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});

app.use('/v1/security', limiter);
```

### 3. Request Validation

```typescript
import { body, validationResult } from 'express-validator';

app.post('/v1/security/secrets',
  body('name').isString().isLength({ min: 3, max: 100 }),
  body('type').isIn(['password', 'api_key', 'token']),
  body('value').isString().isLength({ min: 8 }),
  (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }
    // ... handle request
  }
);
```

### 4. Audit Logging

```typescript
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    console.log({
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: Date.now() - start,
      userId: req.user?.id,
      ip: req.ip
    });
  });
  
  next();
});
```

---

## 🧪 Testing

### Run Health Checks

```bash
# All services
curl http://localhost:3000/v1/security/health

# Individual services
curl http://localhost:3000/v1/security/posture
curl http://localhost:3000/v1/security/certificates
curl http://localhost:3000/v1/security/secrets
```

### Test Certificate Management

```bash
# Import test certificate
curl -X POST http://localhost:3000/v1/security/certificates \
  -H "Content-Type: application/json" \
  -d @test-cert.json

# Verify certificate
curl -X POST http://localhost:3000/v1/security/certificates/CERT_ID/verify
```

### Test Secret Vault

```bash
# Create secret
curl -X POST http://localhost:3000/v1/security/secrets \
  -H "Content-Type: application/json" \
  -d '{
    "name": "test-secret",
    "type": "password",
    "value": "secure_password_123"
  }'

# Rotate secret
curl -X POST http://localhost:3000/v1/security/secrets/SECRET_ID/rotate
```

---

## 📈 Performance Tuning

### Database Optimization

```typescript
// Create compound indexes for common queries
await db.collection('security_alerts').createIndex(
  { acknowledged: 1, severity: 1, timestamp: -1 }
);

await db.collection('access_logs').createIndex(
  { userId: 1, timestamp: -1 }
);

// Enable profiling
await db.command({ profile: 1, slowms: 100 });
```

### Caching

```typescript
import NodeCache from 'node-cache';

const cache = new NodeCache({ stdTTL: 300 }); // 5 minutes

// Cache security posture
app.get('/v1/security/posture', async (req, res) => {
  const cached = cache.get('posture');
  if (cached) {
    return res.json(cached);
  }
  
  const posture = await securityServices.securityPosture.getPosture();
  cache.set('posture', posture);
  res.json(posture);
});
```

---

## 🔄 Backup & Recovery

### Database Backup

```bash
# Daily backup script
mongodump --uri="mongodb://localhost:27017/vms_security" \
  --out="/backup/$(date +%Y%m%d)" \
  --gzip

# Retention: Keep 30 days
find /backup -type d -mtime +30 -exec rm -rf {} \;
```

### Secret Vault Backup

```typescript
// Export secrets (encrypted)
const backup = await services.secretVault.exportSecrets();
fs.writeFileSync(`/backup/secrets-${Date.now()}.json`, backup);
```

### Restore Procedure

```bash
# 1. Restore database
mongorestore --uri="mongodb://localhost:27017/vms_security" \
  --gzip /backup/20260131/

# 2. Restart services
systemctl restart vms-security

# 3. Verify
curl http://localhost:3000/health
```

---

## 📞 Troubleshooting

### Common Issues

**Issue: Services won't start**
```bash
# Check logs
tail -f logs/security.log

# Check MongoDB connection
mongo --eval "db.serverStatus()"

# Verify environment variables
printenv | grep VAULT
```

**Issue: High memory usage**
```bash
# Check service memory
ps aux | grep node

# Restart monitoring (if needed)
curl -X POST http://localhost:3000/v1/security/monitoring/restart
```

**Issue: Alerts not being sent**
```bash
# Check monitoring status
curl http://localhost:3000/v1/security/monitoring/status

# Test notification
curl -X POST http://localhost:3000/v1/security/monitoring/test-alert
```

---

## 🎓 Training Resources

### For Operations Team
1. **Day 1**: Platform overview and architecture
2. **Day 2**: Monitoring and alert response
3. **Day 3**: Incident response procedures

### For Administrators
1. **Day 1**: Configuration and management
2. **Day 2**: Certificate and secret management
3. **Day 3**: Troubleshooting and maintenance

### For Developers
1. **Day 1**: API integration basics
2. **Day 2**: Security best practices
3. **Day 3**: Advanced features and customization

---

## ✅ Go-Live Checklist

- [ ] All services health checks passing
- [ ] Database backup configured
- [ ] Monitoring alerts configured
- [ ] SSL/TLS certificates installed
- [ ] Authentication middleware enabled
- [ ] Rate limiting configured
- [ ] Firewall rules applied
- [ ] Initial policies created
- [ ] Team trained on operations
- [ ] Runbook documented
- [ ] Incident response plan ready
- [ ] Compliance requirements verified
- [ ] Performance baselines established
- [ ] Disaster recovery tested

---

## 📅 Maintenance Schedule

### Daily
- [ ] Review critical alerts
- [ ] Check service health
- [ ] Monitor resource usage

### Weekly
- [ ] Review security posture score
- [ ] Check expiring certificates
- [ ] Review failed password rotations
- [ ] Analyze threat patterns

### Monthly
- [ ] Security posture assessment
- [ ] Compliance review
- [ ] Update threat patterns
- [ ] Review and tune baselines
- [ ] Performance optimization

### Quarterly
- [ ] Disaster recovery drill
- [ ] Security audit
- [ ] Penetration testing
- [ ] Team training refresh
- [ ] Policy review and updates

---

## 🎯 Success Metrics

Track these KPIs:

1. **Security Posture Score**: Target 90+
2. **Mean Time to Detect (MTTD)**: < 5 minutes
3. **Mean Time to Respond (MTTR)**: < 30 minutes
4. **False Positive Rate**: < 5%
5. **Certificate Expiration**: 0 unexpected expirations
6. **Password Rotation Success Rate**: > 95%
7. **Uptime**: 99.9%
8. **API Response Time**: < 200ms (p95)

---

**Deployment Support**: security-team@example.com  
**Emergency Contact**: +1-xxx-xxx-xxxx  
**Documentation**: https://docs.example.com/security

---

*Last Updated: January 31, 2026*
