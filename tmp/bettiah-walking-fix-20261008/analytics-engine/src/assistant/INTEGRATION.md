# AI Assistant V2 - Integration Guide

This guide shows how to integrate the new AI Assistant architecture with your existing API routes and backend services.

## Overview

The integration involves three main steps:

1. **Implement Service Providers** - Connect service interfaces to real backends
2. **Wire Up Dependencies** - Create and inject command instances
3. **Update API Routes** - Replace old assistant calls with new architecture

## Step 1: Implement Service Providers

### Camera Service Provider

Create implementations of the service interfaces that connect to your existing backend:

```typescript
// services/providers/camera-service.provider.ts
import type { CameraService, Camera, CameraRuntimeState } from '../assistant/services';

export class CameraServiceProvider implements CameraService {
  constructor(
    private cameraRepository: CameraRepository,
    private cameraStateService: CameraStateService
  ) {}
  
  async resolve(reference: string): Promise<CameraResolutionResult> {
    // Try exact ID match first
    let camera = await this.cameraRepository.findById(reference);
    
    if (camera) {
      return { found: true, ambiguous: false, camera };
    }
    
    // Try name match
    const cameras = await this.cameraRepository.findByName(reference);
    
    if (cameras.length === 0) {
      return { found: false, ambiguous: false };
    }
    
    if (cameras.length === 1) {
      return { found: true, ambiguous: false, camera: cameras[0] };
    }
    
    return { found: true, ambiguous: true, matches: cameras };
  }
  
  async getById(cameraId: string): Promise<Camera | null> {
    return this.cameraRepository.findById(cameraId);
  }
  
  async getRuntimeState(cameraId: string): Promise<CameraRuntimeState> {
    const state = await this.cameraStateService.getState(cameraId);
    
    return {
      cameraId,
      status: state.status,
      streamConnected: state.streamUrl ? true : false,
      recordingActive: state.recording,
      analyticsActive: state.analyticsEnabled,
      lastFrameAt: state.lastFrameTimestamp,
      uptime: state.uptimeSeconds
    };
  }
  
  // ... implement other methods
}
```

### Camera Control Service Provider

```typescript
// services/providers/camera-control-service.provider.ts
import type { CameraControlService, CameraControlResult } from '../assistant/services';

export class CameraControlServiceProvider implements CameraControlService {
  constructor(
    private cameraApi: CameraApi,
    private cameraService: CameraService,
    private pollInterval: number = 1000,
    private maxAttempts: number = 10
  ) {}
  
  async startAndVerify(
    cameraId: string,
    options?: { timeoutMs?: number; idempotencyKey?: string }
  ): Promise<CameraControlResult> {
    const timeoutMs = options?.timeoutMs || 10000;
    const startTime = Date.now();
    
    // Get initial state
    const initialState = await this.cameraService.getRuntimeState(cameraId);
    
    // Send start command
    const operation = await this.cameraApi.startCamera(cameraId, {
      idempotencyKey: options?.idempotencyKey
    });
    
    if (!operation.accepted) {
      return {
        operationId: operation.id,
        cameraId,
        requestedState: 'ONLINE',
        previousState: initialState.status,
        accepted: false,
        reason: operation.reason,
        verified: false,
        finalState: initialState.status,
        streamConnected: false
      };
    }
    
    // Poll for verification
    let attempts = 0;
    const maxAttempts = Math.floor(timeoutMs / this.pollInterval);
    
    while (attempts < maxAttempts) {
      if (Date.now() - startTime >= timeoutMs) {
        break;
      }
      
      await new Promise(resolve => setTimeout(resolve, this.pollInterval));
      
      const currentState = await this.cameraService.getRuntimeState(cameraId);
      
      if (currentState.status === 'ONLINE' && currentState.streamConnected) {
        return {
          operationId: operation.id,
          cameraId,
          requestedState: 'ONLINE',
          previousState: initialState.status,
          accepted: true,
          verified: true,
          finalState: 'ONLINE',
          streamConnected: true
        };
      }
      
      attempts++;
    }
    
    // Timeout - command accepted but not verified
    const finalState = await this.cameraService.getRuntimeState(cameraId);
    
    return {
      operationId: operation.id,
      cameraId,
      requestedState: 'ONLINE',
      previousState: initialState.status,
      accepted: true,
      verified: false,
      finalState: finalState.status,
      streamConnected: finalState.streamConnected
    };
  }
  
  // ... implement stopAndVerify, restart
}
```

### System Health Service Provider

```typescript
// services/providers/system-health-service.provider.ts
import type { SystemHealthService, SystemHealthSnapshot } from '../assistant/services';

export class SystemHealthServiceProvider implements SystemHealthService {
  constructor(
    private cameraRepository: CameraRepository,
    private incidentService: IncidentService,
    private storageMonitor: StorageMonitor,
    private detectionPipeline: DetectionPipeline
  ) {}
  
  async getSnapshot(): Promise<SystemHealthSnapshot> {
    // Aggregate health from various sources
    const [cameras, incidents, storage, detection] = await Promise.all([
      this.getCameraHealth(),
      this.getIncidentSummary(),
      this.getStorageHealth(),
      this.getDetectionPipelineHealth()
    ]);
    
    // Determine overall health
    let overall: SystemHealthStatus = 'HEALTHY';
    
    if (!storage.healthy || !detection.healthy) {
      overall = 'DEGRADED';
    }
    
    if (incidents.critical > 0 || cameras.error > 5) {
      overall = 'CRITICAL';
    }
    
    return {
      timestamp: new Date(),
      overall,
      cameras,
      detection,
      incidents,
      storage
    };
  }
  
  async getCameraHealth(): Promise<CameraHealthSummary> {
    const cameras = await this.cameraRepository.findAll();
    
    const summary = {
      total: cameras.length,
      online: 0,
      offline: 0,
      degraded: 0,
      starting: 0,
      error: 0
    };
    
    for (const camera of cameras) {
      switch (camera.status) {
        case 'ONLINE':
          summary.online++;
          break;
        case 'OFFLINE':
          summary.offline++;
          break;
        case 'STARTING':
          summary.starting++;
          break;
        case 'ERROR':
          summary.error++;
          break;
      }
    }
    
    return summary;
  }
  
  // ... implement other methods
}
```

## Step 2: Wire Up Dependencies

Create a dependency injection container or factory:

```typescript
// assistant/assistant-factory.ts
import { AIAssistantV2 } from './ai-assistant-v2';
import { commandRegistry } from './registry/command-registry';
import { capabilityRegistry } from './registry/capability-registry';
import { StartCameraCommand, StopCameraCommand } from './commands/camera';
import { SystemStatusCommand } from './commands/system';
import { SearchDetectionsCommand } from './commands/search';
// ... import other commands

export interface AssistantDependencies {
  // Service providers
  cameraService: CameraService;
  cameraControl: CameraControlService;
  detectionSearch: DetectionSearchService;
  systemHealth: SystemHealthService;
  investigationService: InvestigationService;
  analyticsService: AnalyticsService;
  reportService: ReportService;
  
  // Cross-cutting concerns
  authorization: AuthorizationService;
  audit: AssistantAuditService;
}

export function createAssistant(deps: AssistantDependencies): AIAssistantV2 {
  // Register camera commands
  commandRegistry.register(
    {
      id: 'camera-start',
      name: 'Start Camera',
      risk: CommandRisk.SIDE_EFFECT,
      requires: ['camera-service', 'camera-control'],
      enabled: true,
      description: 'Start a camera and verify it reaches running state'
    },
    new StartCameraCommand(
      deps.cameraService,
      deps.cameraControl,
      deps.authorization,
      deps.audit
    ),
    ['CAMERA_START']
  );
  
  commandRegistry.register(
    {
      id: 'camera-stop',
      name: 'Stop Camera',
      risk: CommandRisk.SIDE_EFFECT,
      requires: ['camera-service', 'camera-control'],
      enabled: true
    },
    new StopCameraCommand(
      deps.cameraService,
      deps.cameraControl,
      deps.authorization,
      deps.audit
    ),
    ['CAMERA_STOP']
  );
  
  // Register system status command
  commandRegistry.register(
    {
      id: 'system-status',
      name: 'System Status',
      risk: CommandRisk.READ_ONLY,
      requires: ['system-health'],
      enabled: true
    },
    new SystemStatusCommand(
      deps.systemHealth,
      deps.authorization,
      deps.audit
    ),
    ['SYSTEM_STATUS']
  );
  
  // Register search command
  commandRegistry.register(
    {
      id: 'search-detections',
      name: 'Search Detections',
      risk: CommandRisk.READ_ONLY,
      requires: ['detection-search', 'camera-service'],
      enabled: true
    },
    new SearchDetectionsCommand(
      deps.detectionSearch,
      deps.cameraService,
      deps.authorization,
      deps.audit
    ),
    ['SEARCH_DETECTIONS', 'SEARCH_PERSON', 'SEARCH_VEHICLE']
  );
  
  // Register capabilities
  capabilityRegistry.register({
    id: 'camera-service',
    name: 'Camera Service',
    available: true,
    health: CapabilityHealth.HEALTHY
  });
  
  capabilityRegistry.register({
    id: 'camera-control',
    name: 'Camera Control',
    available: true,
    health: CapabilityHealth.HEALTHY
  });
  
  // ... register other capabilities
  
  // Create assistant
  return new AIAssistantV2({
    debug: process.env.NODE_ENV !== 'production'
  });
}
```

## Step 3: Update API Routes

### Option A: New Endpoint (Recommended for gradual rollout)

Create a new endpoint alongside the existing one:

```typescript
// routes/ai-assistant-v2.routes.ts
import { Router } from 'express';
import { createAssistant } from '../assistant/assistant-factory';
import type { AssistantDependencies } from '../assistant/assistant-factory';

const router = Router();

// Middleware to inject services
router.use((req, res, next) => {
  // Build dependencies from request context
  const deps: AssistantDependencies = {
    cameraService: new CameraServiceProvider(req.db),
    cameraControl: new CameraControlServiceProvider(req.cameraApi),
    detectionSearch: new DetectionSearchServiceProvider(req.db),
    systemHealth: new SystemHealthServiceProvider(req.db),
    investigationService: new InvestigationServiceProvider(req.db),
    analyticsService: new AnalyticsServiceProvider(req.db),
    reportService: new ReportServiceProvider(req.db),
    authorization: req.authorizationService,
    audit: req.auditService
  };
  
  req.assistant = createAssistant(deps);
  next();
});

// POST /api/v2/assistant/query
router.post('/query', async (req, res) => {
  try {
    const { query, sessionId } = req.body;
    
    if (!query) {
      return res.status(400).json({
        success: false,
        error: 'Query is required'
      });
    }
    
    // Get user from auth middleware
    const user = {
      id: req.user.id,
      roles: req.user.roles,
      siteIds: req.user.siteIds
    };
    
    // Process query
    const response = await req.assistant.processQuery(
      query,
      user,
      sessionId || req.session.id
    );
    
    res.json(response);
    
  } catch (error) {
    console.error('[AI Assistant V2 API] Error:', error);
    
    res.status(500).json({
      success: false,
      error: 'Internal server error',
      message: 'An error occurred processing your request'
    });
  }
});

// GET /api/v2/assistant/history/:sessionId
router.get('/history/:sessionId', (req, res) => {
  try {
    const history = req.assistant.getHistory(req.params.sessionId);
    
    res.json({
      success: true,
      sessionId: req.params.sessionId,
      history
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve history'
    });
  }
});

// DELETE /api/v2/assistant/history/:sessionId
router.delete('/history/:sessionId', (req, res) => {
  try {
    req.assistant.clearHistory(req.params.sessionId);
    
    res.json({
      success: true,
      message: 'History cleared'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to clear history'
    });
  }
});

// GET /api/v2/assistant/statistics
router.get('/statistics', (req, res) => {
  try {
    const stats = req.assistant.getStatistics();
    
    res.json({
      success: true,
      statistics: stats
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve statistics'
    });
  }
});

export default router;
```

### Option B: Replace Existing Endpoint

If replacing the old assistant entirely:

```typescript
// routes/ai-assistant.routes.ts (updated)
import { Router } from 'express';
import { createAssistant } from '../assistant/assistant-factory';

const router = Router();

// Feature flag check
const useAssistantV2 = process.env.USE_ASSISTANT_V2 === 'true';

if (useAssistantV2) {
  // Use new architecture
  router.post('/query', async (req, res) => {
    const assistant = createAssistant({
      /* inject dependencies */
    });
    
    const response = await assistant.processQuery(
      req.body.query,
      req.user,
      req.body.sessionId
    );
    
    res.json(response);
  });
} else {
  // Use old implementation (deprecated)
  router.post('/query', async (req, res) => {
    const oldAssistant = new AIAssistant();
    const response = await oldAssistant.processQuery(
      req.body.query,
      req.body.sessionId
    );
    res.json(response);
  });
}

export default router;
```

## Step 4: Testing the Integration

### Manual Testing

```bash
# Test system status
curl -X POST http://localhost:3000/api/v2/assistant/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "What is the system status?",
    "sessionId": "test-session-123"
  }'

# Test camera control
curl -X POST http://localhost:3000/api/v2/assistant/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "Start camera 5",
    "sessionId": "test-session-123"
  }'

# Test search
curl -X POST http://localhost:3000/api/v2/assistant/query \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <token>" \
  -d '{
    "query": "Find people wearing red shirts",
    "sessionId": "test-session-123"
  }'
```

### Integration Tests

```typescript
// __tests__/assistant-api.integration.test.ts
import request from 'supertest';
import app from '../app';

describe('AI Assistant V2 API Integration', () => {
  it('processes system status query', async () => {
    const response = await request(app)
      .post('/api/v2/assistant/query')
      .set('Authorization', `Bearer ${testToken}`)
      .send({
        query: 'Show system health',
        sessionId: 'test-session'
      });
    
    expect(response.status).toBe(200);
    expect(response.body.success).toBe(true);
    expect(response.body.message).toContain('System Status');
    expect(response.body.evidence).toBeDefined();
  });
  
  it('requires authentication', async () => {
    const response = await request(app)
      .post('/api/v2/assistant/query')
      .send({ query: 'test' });
    
    expect(response.status).toBe(401);
  });
});
```

## Deployment Checklist

- [ ] Implement all required service providers
- [ ] Create assistant factory with dependency injection
- [ ] Register all commands in registry
- [ ] Register all capabilities in registry
- [ ] Create new API routes (or update existing)
- [ ] Add authentication middleware
- [ ] Add rate limiting
- [ ] Configure audit logging
- [ ] Set up monitoring and alerting
- [ ] Write integration tests
- [ ] Deploy behind feature flag
- [ ] Run A/B test with subset of users
- [ ] Monitor for errors and false confirmations
- [ ] Gradually increase rollout percentage
- [ ] Full cutover once validated
- [ ] Deprecate old assistant

## Monitoring

Key metrics to track:

```typescript
// Metrics to instrument
- assistant.query.count (by intent)
- assistant.query.duration_ms (by intent)
- assistant.command.success_rate (by command)
- assistant.command.verified_rate (by command)
- assistant.error.count (by error code)
- assistant.authorization.denied_count
- assistant.service.availability (by service)
```

## Rollback Plan

If issues are detected:

1. Set feature flag `USE_ASSISTANT_V2=false`
2. Route traffic back to old assistant
3. Investigate issues in logs
4. Fix and redeploy
5. Re-enable feature flag

## Next Steps

After successful deployment:

1. Deprecate old `ai-assistant.ts` file
2. Remove fake response generation code
3. Add more sophisticated intent parser (ML model)
4. Expand command coverage
5. Implement batch operations
6. Add multi-language support
7. Enhance conversation memory
