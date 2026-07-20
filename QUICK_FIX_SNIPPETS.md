# Quick Fix Code Snippets - Copy & Paste Ready

## 1. Strong Secret Generation

```powershell
# Run this to generate new secrets
node -e "console.log('MEDIA_GATEWAY_SHARED_KEY=' + require('crypto').randomBytes(32).toString('base64'))"
node -e "console.log('DATABASE_PASSWORD=' + require('crypto').randomBytes(24).toString('base64').replace(/[^a-zA-Z0-9]/g, ''))"
```

## 2. Rate Limiting Setup

### Install dependency
```bash
npm install @fastify/rate-limit
```

### Add to `src/app.ts` (after line 20)
```typescript
import rateLimit from "@fastify/rate-limit";

// In buildApp function, after cors registration:
await app.register(rateLimit, {
  global: true,
  max: 100,
  timeWindow: '1 minute',
  cache: 10000,
  allowList: ['127.0.0.1'],
  redis: undefined, // TODO: Use Redis for multi-instance deployments
});

// Stricter limit for live sessions
app.addHook('preHandler', async (request, reply) => {
  if (request.url.includes('/live-sessions')) {
    const limit = rateLimit({
      max: 10,
      timeWindow: '1 minute',
    });
    await limit(request, reply);
  }
});
```

## 3. Fix CORS Configuration

### Update `src/app.ts` (line ~26)
```typescript
await app.register(cors, { 
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
  credentials: true,
  methods: ['GET', 'POST', 'PATCH'],
  allowedHeaders: ['content-type', 'x-user-id', 'authorization'],
});
```

### Add to `.env`
```
ALLOWED_ORIGINS=http://localhost:3000,https://dashboard.yourcompany.com
```

## 4. Database TLS Configuration

### Update `src/database/pool.ts`
```typescript
import { Pool } from "pg";
import { readFileSync } from "fs";

export function createPool(connectionString: string) {
  const isProduction = process.env.NODE_ENV === "production";
  
  return new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "sentinel-control-plane",
    ssl: isProduction ? {
      rejectUnauthorized: true,
      ca: process.env.DATABASE_CA_CERT 
        ? readFileSync(process.env.DATABASE_CA_CERT).toString()
        : undefined,
    } : false,
  });
}
```

### Update DATABASE_URL
```
DATABASE_URL=postgresql://sentinel:STRONG_PASSWORD@postgres:5432/sentinel?sslmode=require
```

## 5. Global Error Handlers

### Add to `src/index.ts` (before app.listen)
```typescript
process.on('unhandledRejection', (reason, promise) => {
  app.log.error({ reason, promise }, 'Unhandled promise rejection');
  // In production, you might want to crash and restart
  // process.exit(1);
});

process.on('uncaughtException', (error) => {
  app.log.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  app.log.info('SIGTERM received, shutting down gracefully');
  await app.close();
  await store.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  app.log.info('SIGINT received, shutting down gracefully');
  await app.close();
  await store.close();
  process.exit(0);
});
```

### Add to `media-gateway/src/index.ts` (similar pattern)
```typescript
process.on('unhandledRejection', (reason) => {
  app.log.error({ reason }, 'Unhandled promise rejection');
});

process.on('uncaughtException', (error) => {
  app.log.fatal({ error }, 'Uncaught exception');
  process.exit(1);
});

process.on('SIGTERM', async () => {
  app.log.info('SIGTERM received, shutting down gracefully');
  await app.close();
  process.exit(0);
});
```

## 6. Enhanced Health Checks

### Update `src/app.ts` health endpoint
```typescript
app.get("/health", async (request, reply) => {
  const checks = {
    status: "ok",
    service: "sentinel-control-plane",
    timestamp: new Date().toISOString(),
    checks: {} as Record<string, { status: string; latency?: number }>,
  };

  // Check database
  try {
    const start = Date.now();
    await store.pool?.query('SELECT 1');
    checks.checks.database = { 
      status: "healthy", 
      latency: Date.now() - start 
    };
  } catch (error) {
    checks.status = "degraded";
    checks.checks.database = { status: "unhealthy" };
  }

  const statusCode = checks.status === "ok" ? 200 : 503;
  return reply.code(statusCode).send(checks);
});

app.get("/health/ready", async (request, reply) => {
  // Check if ready to receive traffic (all dependencies up)
  try {
    await store.pool?.query('SELECT 1');
    return reply.code(200).send({ status: "ready" });
  } catch {
    return reply.code(503).send({ status: "not_ready" });
  }
});

app.get("/health/live", async () => {
  // Check if process is alive (minimal check)
  return { status: "alive" };
});
```

## 7. Request Timeouts

### Update Fastify initialization in `src/app.ts`
```typescript
const app = Fastify({ 
  logger: options?.logger ?? false,
  requestTimeout: 60_000, // 60 seconds
  connectionTimeout: 30_000, // 30 seconds
  keepAliveTimeout: 5_000,
});
```

### Add timeout to fetch calls in `dashboard/lib/backend.ts`
```typescript
async function controlFetch(path: string, init?: RequestInit) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000); // 10s timeout

  try {
    const response = await fetch(new URL(path, controlPlaneUrl), {
      ...init,
      headers: {
        "content-type": "application/json",
        "x-user-id": developmentUserId,
        ...init?.headers,
      },
      cache: "no-store",
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`Control plane returned ${response.status}`);
    return response;
  } finally {
    clearTimeout(timeout);
  }
}
```

## 8. Database Connection Retry Logic

### Update `src/database/pool.ts`
```typescript
import { Pool } from "pg";

export function createPool(connectionString: string) {
  const pool = new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 5_000,
    application_name: "sentinel-control-plane",
  });

  // Add connection error handler with retry
  pool.on('error', (err) => {
    console.error('Unexpected database error', err);
  });

  return pool;
}

export async function connectWithRetry(
  pool: Pool, 
  maxRetries = 5,
  baseDelay = 1000
): Promise<void> {
  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const client = await pool.connect();
      client.release();
      console.log('Database connection established');
      return;
    } catch (error) {
      console.error(`Database connection attempt ${attempt}/${maxRetries} failed:`, error);
      
      if (attempt === maxRetries) {
        throw new Error('Failed to connect to database after maximum retries');
      }

      const delay = baseDelay * Math.pow(2, attempt - 1); // Exponential backoff
      console.log(`Retrying in ${delay}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
}
```

### Use in `src/index.ts`
```typescript
import { createPool, connectWithRetry } from "./database/pool.js";

const config = loadConfig();
let store;

if (config.DATABASE_URL) {
  const pool = createPool(config.DATABASE_URL);
  await connectWithRetry(pool); // Wait for connection before starting
  store = new PostgresStore(pool);
} else {
  store = new MemoryStore();
}

const app = await buildApp({
  logger: true,
  store,
  mediaGatewaySharedKey: config.MEDIA_GATEWAY_SHARED_KEY,
});
```

## 9. Structured Logging with Correlation IDs

### Update `src/app.ts`
```typescript
import { randomUUID } from "node:crypto";

const app = Fastify({ 
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    serializers: {
      req(req) {
        return {
          method: req.method,
          url: req.url,
          headers: {
            host: req.headers.host,
            userAgent: req.headers['user-agent'],
            correlationId: req.headers['x-correlation-id'],
          },
          remoteAddress: req.ip,
        };
      },
    },
  },
  requestIdHeader: 'x-correlation-id',
  requestIdLogLabel: 'correlationId',
  genReqId: (req) => req.headers['x-correlation-id']?.toString() || randomUUID(),
});

// Log all requests with duration
app.addHook('onRequest', async (request, reply) => {
  request.log.info({ userId: request.currentUser?.id }, 'Request started');
});

app.addHook('onResponse', async (request, reply) => {
  request.log.info({
    userId: request.currentUser?.id,
    statusCode: reply.statusCode,
    responseTime: reply.getResponseTime(),
  }, 'Request completed');
});
```

## 10. Basic Prometheus Metrics

### Install dependency
```bash
npm install prom-client
```

### Create `src/metrics.ts`
```typescript
import { Registry, Counter, Histogram, Gauge } from 'prom-client';

export const registry = new Registry();

export const httpRequestsTotal = new Counter({
  name: 'http_requests_total',
  help: 'Total number of HTTP requests',
  labelNames: ['method', 'route', 'status_code'],
  registers: [registry],
});

export const httpRequestDuration = new Histogram({
  name: 'http_request_duration_seconds',
  help: 'HTTP request duration in seconds',
  labelNames: ['method', 'route', 'status_code'],
  buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10],
  registers: [registry],
});

export const liveSessionsActive = new Gauge({
  name: 'live_sessions_active',
  help: 'Number of active live sessions',
  registers: [registry],
});

export const databaseConnectionsActive = new Gauge({
  name: 'database_connections_active',
  help: 'Number of active database connections',
  registers: [registry],
});
```

### Add to `src/app.ts`
```typescript
import { registry, httpRequestsTotal, httpRequestDuration } from './metrics.js';

// Add metrics endpoint
app.get('/metrics', async (request, reply) => {
  reply.header('Content-Type', registry.contentType);
  return registry.metrics();
});

// Track metrics on all requests
app.addHook('onResponse', async (request, reply) => {
  const route = request.routeOptions.url || request.url;
  const labels = {
    method: request.method,
    route,
    status_code: reply.statusCode.toString(),
  };
  
  httpRequestsTotal.inc(labels);
  httpRequestDuration.observe(labels, reply.getResponseTime() / 1000);
});
```

## 11. Update compose.yaml for Production

```yaml
services:
  api:
    build: .
    environment:
      HOST: 0.0.0.0
      PORT: 8080
      LOG_LEVEL: ${LOG_LEVEL:-info}
      AUTH_MODE: ${AUTH_MODE:-development}
      DATABASE_URL: ${DATABASE_URL}
      MEDIA_GATEWAY_SHARED_KEY: ${MEDIA_GATEWAY_SHARED_KEY}
      ALLOWED_ORIGINS: ${ALLOWED_ORIGINS}
      NODE_ENV: production
    ports:
      - "8080:8080"
    depends_on:
      postgres:
        condition: service_healthy
    deploy:
      resources:
        limits:
          cpus: '1'
          memory: 512M
        reservations:
          cpus: '0.5'
          memory: 256M
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "node", "-e", "require('http').get('http://localhost:8080/health', (r) => process.exit(r.statusCode === 200 ? 0 : 1))"]
      interval: 30s
      timeout: 10s
      retries: 3
      start_period: 40s

  postgres:
    image: postgres:17-alpine
    environment:
      POSTGRES_DB: ${POSTGRES_DB:-sentinel}
      POSTGRES_USER: ${POSTGRES_USER:-sentinel}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    ports:
      - "5432:5432"
    volumes:
      - sentinel-postgres:/var/lib/postgresql/data
      - ./database/migrations:/docker-entrypoint-initdb.d:ro
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 1G
        reservations:
          cpus: '1'
          memory: 512M
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER:-sentinel} -d ${POSTGRES_DB:-sentinel}"]
      interval: 5s
      timeout: 3s
      retries: 10
    command:
      - "postgres"
      - "-c"
      - "max_connections=100"
      - "-c"
      - "shared_buffers=256MB"
      - "-c"
      - "effective_cache_size=1GB"
```

## 12. Production .env Template

Create `deploy/.env.production.template`:
```bash
# Control Plane Configuration
HOST=0.0.0.0
PORT=8080
LOG_LEVEL=info
NODE_ENV=production

# Authentication (REQUIRED - Change for production)
AUTH_MODE=development  # TODO: Change to 'oidc' when OIDC is implemented
ALLOWED_ORIGINS=https://dashboard.yourcompany.com

# Database (REQUIRED)
DATABASE_URL=postgresql://sentinel:CHANGE_THIS_PASSWORD@postgres:5432/sentinel?sslmode=require
POSTGRES_DB=sentinel
POSTGRES_USER=sentinel
POSTGRES_PASSWORD=CHANGE_THIS_PASSWORD  # Generate with: openssl rand -base64 24

# Media Gateway Integration (REQUIRED)
MEDIA_GATEWAY_SHARED_KEY=CHANGE_THIS_KEY  # Generate with: openssl rand -base64 32

# Media Gateway Configuration
CONTROL_PLANE_URL=http://api:8080
MEDIAMTX_API_URL=http://mediamtx:9997
PUBLIC_HLS_BASE_URL=https://media.yourcompany.com
PUBLIC_WEBRTC_BASE_URL=https://webrtc.yourcompany.com
MEDIA_ACCESS_TTL_SECONDS=300
STREAM_SECRETS_JSON={}  # TODO: Integrate with secrets manager

# Dashboard Configuration
DASHBOARD_DEMO_MODE=false
CONTROL_PLANE_INTERNAL_URL=http://api:8080
MEDIA_GATEWAY_INTERNAL_URL=http://media-gateway:8090
DASHBOARD_DEV_USER_ID=user-south-operator  # TODO: Remove when OIDC implemented
```

## 13. Database Backup Script

Create `scripts/backup-database.sh`:
```bash
#!/bin/bash
set -e

BACKUP_DIR="/var/backups/sentinel-db"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)
BACKUP_FILE="$BACKUP_DIR/sentinel_backup_$TIMESTAMP.sql.gz"

# Create backup directory if it doesn't exist
mkdir -p "$BACKUP_DIR"

# Perform backup
docker exec sentinel-postgres pg_dump -U sentinel -d sentinel | gzip > "$BACKUP_FILE"

# Verify backup
if [ -f "$BACKUP_FILE" ]; then
    echo "Backup successful: $BACKUP_FILE"
    
    # Keep only last 7 days of backups
    find "$BACKUP_DIR" -name "sentinel_backup_*.sql.gz" -mtime +7 -delete
    
    # Log backup size
    du -h "$BACKUP_FILE"
else
    echo "Backup failed!"
    exit 1
fi
```

Make executable:
```bash
chmod +x scripts/backup-database.sh
```

Add to crontab:
```bash
# Daily backup at 2 AM
0 2 * * * /path/to/scripts/backup-database.sh >> /var/log/sentinel-backup.log 2>&1
```

## 14. Quick Deployment Script

Create `scripts/deploy.sh`:
```bash
#!/bin/bash
set -e

echo "🚀 Deploying Sentinel Grid..."

# Check required environment variables
if [ -z "$MEDIA_GATEWAY_SHARED_KEY" ] || [ "$MEDIA_GATEWAY_SHARED_KEY" = "development-media-gateway-key-change-me" ]; then
    echo "❌ ERROR: MEDIA_GATEWAY_SHARED_KEY not set or using default value"
    exit 1
fi

if [ -z "$DATABASE_URL" ]; then
    echo "❌ ERROR: DATABASE_URL not set"
    exit 1
fi

# Pull latest images
echo "📦 Pulling Docker images..."
docker-compose pull

# Build services
echo "🔨 Building services..."
docker-compose build

# Start services
echo "▶️ Starting services..."
docker-compose up -d

# Wait for health checks
echo "⏳ Waiting for services to be healthy..."
sleep 10

# Check health
if curl -f http://localhost:8080/health > /dev/null 2>&1; then
    echo "✅ Control plane is healthy"
else
    echo "❌ Control plane health check failed"
    docker-compose logs api
    exit 1
fi

if curl -f http://localhost:8090/health > /dev/null 2>&1; then
    echo "✅ Media gateway is healthy"
else
    echo "❌ Media gateway health check failed"
    docker-compose logs media-gateway
    exit 1
fi

echo "🎉 Deployment successful!"
echo "📊 View logs with: docker-compose logs -f"
```

Make executable:
```bash
chmod +x scripts/deploy.sh
```

## 15. Configuration Validation Script

Create `scripts/validate-config.js`:
```javascript
#!/usr/bin/env node
import { loadConfig } from '../src/config.js';
import { loadMediaConfig } from '../media-gateway/src/config.js';

console.log('🔍 Validating configuration...\n');

let errors = 0;

// Validate control plane config
try {
  const config = loadConfig();
  console.log('✅ Control plane configuration valid');
  
  // Check for development defaults
  if (config.MEDIA_GATEWAY_SHARED_KEY === 'development-media-gateway-key-change-me') {
    console.error('❌ Using default MEDIA_GATEWAY_SHARED_KEY');
    errors++;
  }
  
  if (config.AUTH_MODE === 'development' && process.env.NODE_ENV === 'production') {
    console.warn('⚠️ Using development auth mode in production');
  }
} catch (error) {
  console.error('❌ Control plane configuration invalid:', error.message);
  errors++;
}

// Validate media gateway config
try {
  const mediaConfig = loadMediaConfig();
  console.log('✅ Media gateway configuration valid');
  
  if (mediaConfig.MEDIA_GATEWAY_SHARED_KEY.length < 32) {
    console.error('❌ MEDIA_GATEWAY_SHARED_KEY too short (< 32 chars)');
    errors++;
  }
} catch (error) {
  console.error('❌ Media gateway configuration invalid:', error.message);
  errors++;
}

if (errors > 0) {
  console.error(`\n❌ Configuration validation failed with ${errors} error(s)`);
  process.exit(1);
} else {
  console.log('\n✅ All configuration valid');
  process.exit(0);
}
```

Make executable and run:
```bash
chmod +x scripts/validate-config.js
node scripts/validate-config.js
```

---

## Quick Start Commands

```bash
# 1. Generate new secrets
node -e "console.log('MEDIA_GATEWAY_SHARED_KEY=' + require('crypto').randomBytes(32).toString('base64'))"

# 2. Update .env file (DO NOT commit this)
cp .env.example .env
# Edit .env with generated secrets

# 3. Install new dependencies
npm install @fastify/rate-limit prom-client

# 4. Run validation
node scripts/validate-config.js

# 5. Deploy
./scripts/deploy.sh

# 6. Monitor logs
docker-compose logs -f

# 7. Check health
curl http://localhost:8080/health
curl http://localhost:8090/health

# 8. Check metrics
curl http://localhost:8080/metrics
```

---

## Testing After Fixes

```bash
# Test rate limiting
for i in {1..150}; do curl -H "x-user-id: user-south-operator" http://localhost:8080/v1/branches & done
# Should see 429 responses after ~100 requests

# Test graceful shutdown
docker-compose stop api  # Should see "Shutting down gracefully" in logs

# Test database reconnection
docker-compose stop postgres
docker-compose start postgres
# API should automatically reconnect

# Test health checks
docker-compose stop postgres
curl http://localhost:8080/health  # Should return 503
docker-compose start postgres
curl http://localhost:8080/health  # Should return 200
```
