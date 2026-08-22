# AI Security Commander - Quick Start Guide

## Installation

### 1. Install Dependencies

```bash
# Core dependencies
npm install pg zod

# Optional: NATS for event bus
npm install nats
```

### 2. Install Ollama (Local LLM)

```bash
# Linux/Mac
curl -fsSL https://ollama.com/install.sh | sh

# Windows: Download from https://ollama.com/download

# Pull the model
ollama pull llama3.2

# Verify
ollama list
```

### 3. Install FFmpeg (Video Processing)

```bash
# Ubuntu/Debian
sudo apt install ffmpeg

# Mac
brew install ffmpeg

# Windows: Download from https://ffmpeg.org/download.html
```

### 4. Setup Database

```bash
# Create database
createdb surveillance

# Run schema
psql -d surveillance -f src/security-commander/database/schema.sql

# Verify
psql -d surveillance -c "SELECT COUNT(*) FROM security_events;"
```

## Configuration

Create `.env` file:

```bash
# Database
DATABASE_URL=postgresql://localhost:5432/surveillance

# Ollama LLM
OLLAMA_URL=http://localhost:11434
OLLAMA_MODEL=llama3.2
COMMANDER_USE_LLM=true

# Storage
EVIDENCE_STORAGE_PATH=./evidence

# Optional: NATS
NATS_URL=nats://localhost:4222
```

## Basic Usage

### 1. Initialize Commander

```typescript
import { Pool } from 'pg';
import { SecurityCommanderService } from './security-commander';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL
});

const commander = new SecurityCommanderService(pool, {
  useLLM: true,
  ollamaUrl: process.env.OLLAMA_URL,
  evidenceStoragePath: process.env.EVIDENCE_STORAGE_PATH
});
```

### 2. Execute Natural Language Query

```typescript
const response = await commander.execute(
  "Show me everything abnormal in the last 30 minutes",
  {
    userId: 'user_123',
    tenantId: 'tenant_456',
    permissions: ['security.view']
  }
);

console.log(response.message);
console.log(`Found ${response.summary?.totalIncidents} incidents`);
```

### 3. Ingest Events

```typescript
import { EventIngestionService } from './security-commander';

const ingestion = new EventIngestionService(pool);

// Camera went offline
await ingestion.ingestEvent({
  cameraId: 'cam_17',
  eventType: 'offline',
  timestamp: new Date(),
  branchId: 'branch_12'
}, {
  tenantId: 'tenant_456'
});

// AI detection
await ingestion.ingestAIDetections([{
  cameraId: 'cam_17',
  detectionType: 'person_detected',
  timestamp: new Date().toISOString(),
  confidence: 0.95,
  branchId: 'branch_12'
}], {
  tenantId: 'tenant_456'
});
```

### 4. Mount API Routes

```typescript
import express from 'express';
import { mountCommanderRoutes } from './security-commander';

const app = express();
app.use(express.json());

// Mount Security Commander routes
mountCommanderRoutes(app, pool);

app.listen(3000, () => {
  console.log('Security Commander API running on port 3000');
});
```

### 5. Test API

```bash
# Health check
curl http://localhost:3000/api/security-commander/health

# Execute query
curl -X POST http://localhost:3000/api/security-commander/query \
  -H "Content-Type: application/json" \
  -d '{"query": "Show me critical events in last hour"}'

# Get investigation
curl http://localhost:3000/api/security-commander/investigations/{id}
```

## Integration Examples

### From Analytics Engine

```typescript
import { AnalyticsBridge } from './security-commander';

const bridge = new AnalyticsBridge(pool);

// When detection occurs
await bridge.ingestDetectionEvent(detection, {
  tenantId: 'tenant_456'
});
```

### From Camera Health Monitor

```typescript
import { CameraHealthBridge } from './security-commander';

const bridge = new CameraHealthBridge(pool);

// Camera went offline
await bridge.reportCameraOffline('cam_17', 'branch_12', {
  tenantId: 'tenant_456'
});
```

### Automated Correlation

```typescript
import { CorrelationService } from './security-commander';

const correlationService = new CorrelationService(pool, {
  intervalMs: 30000,  // Run every 30 seconds
  autoCorrelate: true
});

// Start background correlation
correlationService.start();

// Correlate for specific tenant
await correlationService.correlateForTenant('tenant_456');
```

## Common Queries

```typescript
// Abnormal events
await commander.execute("Show me everything abnormal in last 30 minutes", context);

// Critical incidents
await commander.execute("Show me critical events", context);

// Branch specific
await commander.execute("What happened at Branch 12 today?", context);

// Specific time range
await commander.execute("Show me events from last 2 hours", context);

// After hours activity
await commander.execute("Show suspicious after-hours activity", context);
```

## Troubleshooting

### LLM Not Available

```typescript
// Check Ollama status
const status = await commander.isReady();
console.log(status.llmAvailable);  // false

// Fix: Start Ollama
// ollama serve

// Commander will fallback to rule-based parsing if LLM unavailable
```

### No Events Found

```bash
# Check event count
psql -d surveillance -c "SELECT COUNT(*), event_type FROM security_events GROUP BY event_type;"

# Manually insert test event
psql -d surveillance -c "
INSERT INTO security_events (id, tenant_id, event_type, source_type, source_id, occurred_at, severity, metadata)
VALUES (gen_random_uuid(), 'tenant_456', 'camera.offline', 'camera', 'cam_17', NOW(), 'high', '{}');
"
```

### Database Connection Error

```bash
# Test connection
psql -d surveillance -c "SELECT 1;"

# Check environment variable
echo $DATABASE_URL
```

## Next Steps

1. **Configure Event Sources**: Set up normalizers for your camera/DVR systems
2. **Tune Correlation Rules**: Adjust time windows and conditions
3. **Customize Playbooks**: Add organization-specific response workflows
4. **Setup Monitoring**: Track correlation rates and investigation creation
5. **Build Frontend**: Create React UI using API endpoints
6. **Add Notifications**: Integrate email/SMS for critical incidents

## Architecture Overview

```
User Query: "Show abnormal events last 30 min"
         ↓
    Query Parser (LLM/Rules)
         ↓
    Event Search (PostgreSQL)
         ↓
    Anomaly Filter (score ≥ 0.5)
         ↓
    Correlation Engine
         ↓
    Investigation Builder
         ↓
    Evidence Collection
         ↓
    AI Summarization
         ↓
    Response with Timeline/Actions
```

## Performance Tips

1. **Index Optimization**: Ensure indexes on `occurred_at`, `tenant_id`, `abnormality_score`
2. **Bulk Ingestion**: Use `createEventsBulk()` for batch imports
3. **Correlation Interval**: Adjust based on event volume (30s-300s)
4. **LLM Caching**: Reuse Ollama connection, adjust temperature
5. **Database Pooling**: Configure `pg` pool size based on load

## Support & Documentation

- Full documentation: `IMPLEMENTATION_SUMMARY.md`
- Database schema: `database/schema.sql`
- API reference: See `api/commander.controller.ts`
- Type definitions: See `types/` directory

---

**Ready to use!** The system is fully functional with no paid APIs required.
