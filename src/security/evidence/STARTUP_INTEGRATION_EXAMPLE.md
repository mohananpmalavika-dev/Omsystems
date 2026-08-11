# Startup Validation Integration Example

## Overview

The startup validation system ensures security collectors are properly configured before the application starts, preventing deployment with dangerous placeholder configurations.

## Integration Points

### 1. Application Startup (app.ts or index.ts)

```typescript
import { validateSecurityOnStartup } from './security/evidence/startup-validation.js';

async function startApplication() {
  console.log('Starting application...');

  // CRITICAL: Run security validation BEFORE starting server
  try {
    await validateSecurityOnStartup({
      environment: process.env.NODE_ENV as any,
      strictMode: process.env.NODE_ENV === 'production',
      failOnError: process.env.NODE_ENV === 'production', // Fail fast in production
    });
  } catch (error) {
    console.error('Security validation failed:', error);
    process.exit(1); // Exit on validation failure in production
  }

  // Continue with normal startup...
  const app = await createServer();
  await app.listen({ port: 3000 });
  
  console.log('Application started successfully');
}

startApplication().catch(error => {
  console.error('Failed to start application:', error);
  process.exit(1);
});
```

### 2. Fastify Integration

```typescript
import Fastify from 'fastify';
import { createStartupValidationMiddleware } from './security/evidence/startup-validation.js';

async function createServer() {
  const app = Fastify({ logger: true });

  // Create validation middleware
  const securityValidation = createStartupValidationMiddleware({
    environment: process.env.NODE_ENV as any,
    strictMode: process.env.NODE_ENV === 'production',
    failOnError: true,
  });

  // Run validation before registering routes
  await securityValidation.validate();

  // Add health check endpoint
  app.get('/health', (req, reply) => {
    securityValidation.healthCheck(req, reply);
  });

  // Register routes...
  await app.register(securityRoutes);
  
  return app;
}
```

### 3. Express Integration

```typescript
import express from 'express';
import { createStartupValidationMiddleware } from './security/evidence/startup-validation.js';

async function createServer() {
  const app = express();

  // Create validation middleware
  const securityValidation = createStartupValidationMiddleware({
    environment: process.env.NODE_ENV as any,
    strictMode: process.env.NODE_ENV === 'production',
    failOnError: true,
  });

  // Run validation before starting server
  await securityValidation.validate();

  // Add health check endpoint
  app.get('/health', (req, res) => {
    securityValidation.healthCheck(req, res);
  });

  // Register routes...
  app.use('/api', routes);
  
  return app;
}
```

### 4. Docker Integration

**Dockerfile:**

```dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./
RUN npm ci --production

# Copy application code
COPY . .

# Build TypeScript
RUN npm run build

# Run security validation on container start
CMD ["sh", "-c", "npm run validate:security && npm start"]
```

**package.json scripts:**

```json
{
  "scripts": {
    "start": "node dist/index.js",
    "validate:security": "node dist/security/evidence/validate-startup.js",
    "dev": "npm run validate:security && tsx src/index.ts",
    "test": "npm run validate:security && jest"
  }
}
```

### 5. Kubernetes Health Checks

**deployment.yaml:**

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: security-app
spec:
  template:
    spec:
      containers:
      - name: app
        image: security-app:latest
        env:
        - name: NODE_ENV
          value: "production"
        - name: EDR_API_ENDPOINT
          valueFrom:
            secretKeyRef:
              name: security-config
              key: edr-endpoint
        
        # Startup probe - wait for security validation
        startupProbe:
          httpGet:
            path: /health
            port: 3000
          failureThreshold: 30
          periodSeconds: 10
        
        # Liveness probe
        livenessProbe:
          httpGet:
            path: /health
            port: 3000
          periodSeconds: 30
          timeoutSeconds: 5
        
        # Readiness probe
        readinessProbe:
          httpGet:
            path: /health
            port: 3000
          periodSeconds: 10
          timeoutSeconds: 3
```

### 6. CI/CD Pipeline Integration

**GitHub Actions (.github/workflows/deploy.yml):**

```yaml
name: Deploy to Production

on:
  push:
    branches: [main]

jobs:
  validate-and-deploy:
    runs-on: ubuntu-latest
    
    steps:
    - uses: actions/checkout@v3
    
    - name: Setup Node.js
      uses: actions/setup-node@v3
      with:
        node-version: '18'
    
    - name: Install dependencies
      run: npm ci
    
    - name: Build application
      run: npm run build
    
    - name: Run security validation
      env:
        NODE_ENV: production
        EDR_API_ENDPOINT: ${{ secrets.EDR_API_ENDPOINT }}
        EDGE_AGENT_API: ${{ secrets.EDGE_AGENT_API }}
      run: |
        npm run validate:security
        if [ $? -ne 0 ]; then
          echo "Security validation failed - deployment blocked"
          exit 1
        fi
    
    - name: Run tests
      run: npm test
    
    - name: Deploy to production
      run: npm run deploy
```

## Validation Script

Create a standalone validation script for CLI usage:

**src/security/evidence/validate-startup.ts:**

```typescript
#!/usr/bin/env node
import { validateSecurityOnStartup } from './startup-validation.js';

async function main() {
  const environment = process.env.NODE_ENV || 'development';
  const strictMode = process.argv.includes('--strict') || environment === 'production';
  const failOnError = !process.argv.includes('--no-fail');

  console.log(`Running security validation in ${environment} mode...`);
  if (strictMode) {
    console.log('Strict mode enabled');
  }

  try {
    const result = await validateSecurityOnStartup({
      environment,
      strictMode,
      failOnError,
    });

    if (result.passed) {
      console.log('\n✅ Security validation PASSED');
      process.exit(0);
    } else {
      console.log('\n❌ Security validation FAILED');
      process.exit(failOnError ? 1 : 0);
    }
  } catch (error) {
    console.error('\n💥 Security validation ERROR:', error);
    process.exit(1);
  }
}

main();
```

Make it executable:

```bash
chmod +x src/security/evidence/validate-startup.ts
```

## Usage Examples

### Development

```bash
# Run with defaults
npm run validate:security

# Run with warnings only (don't fail)
npm run validate:security -- --no-fail

# Run in strict mode
npm run validate:security -- --strict
```

### Production

```bash
# Production validation (fails on any error)
NODE_ENV=production npm run validate:security

# With full environment configuration
NODE_ENV=production \
EDR_API_ENDPOINT=https://edr.company.com \
EDGE_AGENT_API=https://agents.company.com \
npm run validate:security
```

### Docker Compose

**docker-compose.yml:**

```yaml
version: '3.8'

services:
  app:
    build: .
    environment:
      - NODE_ENV=production
      - EDR_API_ENDPOINT=${EDR_API_ENDPOINT}
      - EDGE_AGENT_API=${EDGE_AGENT_API}
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:3000/health"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s
    restart: unless-stopped
```

## Expected Output

### Successful Validation

```
🔒 Validating security evidence system...
✅ Security validation passed (3/4 capabilities active)
⚠️  1 warning(s) detected

============================================================
Security Evidence System Validation Report
============================================================

Summary:
  Environment: production
  Strict Mode: enabled
  Status: ✅ PASSED
  Coverage: 75%
  Active Capabilities: 3/4

⚠️  Warnings:
  [WARN] configuration: TAMPER_SENSOR_API not configured
    → Impact: Alternative tamper sensors will be unavailable

============================================================
```

### Failed Validation

```
🔒 Validating security evidence system...
❌ Security validation failed with 2 error(s)
⚠️  3 warning(s) detected

============================================================
Security Evidence System Validation Report
============================================================

Summary:
  Environment: production
  Strict Mode: enabled
  Status: ❌ FAILED
  Coverage: 25%
  Active Capabilities: 1/4

❌ Errors:
  [CRITICAL] production-constraint: Collector ransomwareCollector using SIMULATED source in production
    → Remedy: Configure real data source or disable this collector in production
  [ERROR] environment: Required environment variable not set: EDR_API_ENDPOINT
    → Remedy: Set EDR_API_ENDPOINT in production configuration

⚠️  Warnings:
  [WARN] configuration: EDGE_AGENT_API not configured
    → Impact: Tamper detection will be unavailable
  [WARN] collector-health: Ransomware collector not available
    → Impact: Ransomware monitoring unavailable
  [WARN] capability: secure-boot-attestation not available
    → Impact: Reduced security visibility

============================================================
```

## Monitoring Integration

### Prometheus Metrics

```typescript
import { Registry, Gauge } from 'prom-client';

const register = new Registry();

const securityCoverageGauge = new Gauge({
  name: 'security_evidence_coverage',
  help: 'Percentage of security capabilities with active evidence collection',
  registers: [register],
});

const securityCapabilitiesGauge = new Gauge({
  name: 'security_capabilities_active',
  help: 'Number of active security capabilities',
  labelNames: ['status'],
  registers: [register],
});

// Update metrics after validation
async function updateSecurityMetrics() {
  const result = await validateSecurityOnStartup({ failOnError: false });
  
  securityCoverageGauge.set(result.summary.coverage);
  securityCapabilitiesGauge.set({ status: 'active' }, result.summary.activeCapabilities);
  securityCapabilitiesGauge.set({ status: 'total' }, result.summary.totalCapabilities);
}
```

### Grafana Dashboard

```json
{
  "dashboard": {
    "title": "Security Evidence System",
    "panels": [
      {
        "title": "Evidence Coverage",
        "type": "gauge",
        "targets": [
          {
            "expr": "security_evidence_coverage * 100"
          }
        ],
        "fieldConfig": {
          "defaults": {
            "unit": "percent",
            "thresholds": {
              "steps": [
                { "value": 0, "color": "red" },
                { "value": 50, "color": "yellow" },
                { "value": 80, "color": "green" }
              ]
            }
          }
        }
      }
    ]
  }
}
```

## Troubleshooting

### Issue: Validation Fails in Production

**Check:**
1. Are all required environment variables set?
2. Are collector endpoints reachable?
3. Are credentials valid?
4. Check application logs for specific errors

### Issue: Low Coverage Warning

**Actions:**
1. Review which capabilities are unavailable
2. Configure missing environment variables
3. Deploy required collector agents
4. Update capability requirements if intentional

### Issue: Simulated Data in Production

**Fix:**
1. Configure real data sources
2. Ensure environment variables point to production endpoints
3. Remove or disable development-only collectors
4. Verify NODE_ENV=production is set

## Best Practices

1. **Always run validation before deployment**
2. **Treat validation failures as deployment blockers in production**
3. **Monitor evidence coverage in production**
4. **Set up alerts for coverage drops**
5. **Review validation warnings regularly**
6. **Document required environment variables**
7. **Test validation in staging environments**
8. **Keep capability catalog up to date**

## Summary

The startup validation system provides:
- ✅ Pre-deployment safety checks
- ✅ Configuration validation
- ✅ Collector health verification
- ✅ Production constraint enforcement
- ✅ Coverage visibility
- ✅ CI/CD integration
- ✅ Monitoring support

This ensures the security dashboard can never deploy with dangerous placeholder configurations.
