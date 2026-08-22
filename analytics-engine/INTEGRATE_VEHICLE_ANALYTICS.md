# Integrating Vehicle Analytics into Existing Analytics Engine

## Overview

This guide shows how to integrate the new vehicle analytics system with your existing analytics engine infrastructure.

## Step 1: Update Existing Vehicle Analytics Detector

Replace the placeholder implementations in `src/detectors/vehicle-analytics.ts`:

```typescript
// OLD: analytics-engine/src/detectors/vehicle-analytics.ts (lines 380-385)
private estimateVehicleColor(detection: any): VehicleColor {
  // TODO: Implement color detection using dominant color analysis
  return 'other';
}

// NEW: Import and use the new classifier
import { DominantColorClassifier } from '../vehicle/color/vehicle-color-classifier.js';

private colorClassifier = new DominantColorClassifier();

private async estimateVehicleColor(detection: any, frame: any): Promise<VehicleColor> {
  try {
    const vehicleCrop = this.extractVehicleCrop(frame, detection.boundingBox);
    const result = await this.colorClassifier.classify(vehicleCrop);
    return result.color;
  } catch (error) {
    console.warn('Color classification failed:', error);
    return 'unknown';
  }
}
```

## Step 2: Update ANPR Detector

Replace the placeholder implementations in `src/detectors/anpr-detector.ts`:

```typescript
// OLD: analytics-engine/src/detectors/anpr-detector.ts (lines 418-419)
async getVehicleEvents(...): Promise<Array<...>> {
  // TODO: Query database for vehicle events
  return [];
}

// NEW: Import and use the repository
import type { VehicleEventRepository } from '../vehicle/persistence/vehicle-event.repository.js';

constructor(
  config: Partial<ANPRConfig> = {},
  inference: ANPRInference = {},
  private vehicleEventRepository?: VehicleEventRepository
) {
  // ... existing code
}

async getVehicleEvents(
  tenantId: string,
  plateNumber?: string,
  from?: Date,
  to?: Date,
): Promise<Array<{
  plateNumber: string;
  timestamp: Date;
  camera: string;
  direction: "entry" | "exit";
}>> {
  if (!this.vehicleEventRepository) {
    return [];
  }

  const events = await this.vehicleEventRepository.search({
    tenantId,
    normalizedPlate: plateNumber,
    from,
    to,
    orderBy: 'occurredAt',
    orderDirection: 'desc',
  });

  return events.map(event => ({
    plateNumber: event.normalizedPlate || '',
    timestamp: event.occurredAt,
    camera: event.cameraId,
    direction: event.direction === 'entering' ? 'entry' : 'exit',
  }));
}
```

## Step 3: Create Analytics Engine Integration

Create `analytics-engine/src/integration/vehicle-analytics-integration.ts`:

```typescript
import { Pool } from 'pg';
import {
  VehicleAnalyticsService,
  VehicleJourneyService,
  VehicleWatchlistService,
  PostgresVehicleEventRepository,
  VehicleAnalyticsMetrics,
  type VehicleAnalyticsConfig,
} from '../vehicle/index.js';

export class VehicleAnalyticsIntegration {
  private services = new Map<string, VehicleAnalyticsService>();
  private repository: PostgresVehicleEventRepository;
  private journeyService: VehicleJourneyService;
  private watchlistService: VehicleWatchlistService;
  private metrics: VehicleAnalyticsMetrics;
  
  constructor(
    private readonly pool: Pool,
    metricsCollector: any
  ) {
    this.repository = new PostgresVehicleEventRepository(pool);
    this.journeyService = new VehicleJourneyService(this.repository);
    this.watchlistService = new VehicleWatchlistService();
    this.metrics = new VehicleAnalyticsMetrics(metricsCollector);
  }
  
  /**
   * Initialize vehicle analytics for a camera
   */
  async initializeCamera(config: VehicleAnalyticsConfig): Promise<void> {
    const service = new VehicleAnalyticsService(
      config,
      this.repository,
      this.journeyService,
      this.watchlistService,
      process.env.PADDLE_OCR_URL
    );
    
    this.services.set(config.cameraId, service);
    
    console.log(`Vehicle analytics initialized for camera ${config.cameraId}`);
  }
  
  /**
   * Process detections for a camera
   */
  async processDetections(
    cameraId: string,
    detections: any[],
    timestamp: Date,
    frameData?: any
  ) {
    const service = this.services.get(cameraId);
    if (!service) {
      console.warn(`No vehicle analytics service for camera ${cameraId}`);
      return null;
    }
    
    return await service.processFrame(detections, timestamp, frameData);
  }
  
  /**
   * Get repository for external access
   */
  getRepository() {
    return this.repository;
  }
  
  /**
   * Get journey service for external access
   */
  getJourneyService() {
    return this.journeyService;
  }
  
  /**
   * Get watchlist service for external access
   */
  getWatchlistService() {
    return this.watchlistService;
  }
}
```

## Step 4: Update Main Analytics Pipeline

In `analytics-engine/src/analytics-pipeline.ts`, add:

```typescript
import { VehicleAnalyticsIntegration } from './integration/vehicle-analytics-integration.js';

export class AnalyticsPipeline {
  private vehicleAnalytics?: VehicleAnalyticsIntegration;
  
  async initialize() {
    // ... existing initialization
    
    // Initialize vehicle analytics
    if (process.env.VEHICLE_ANALYTICS_ENABLED === 'true') {
      this.vehicleAnalytics = new VehicleAnalyticsIntegration(
        this.databasePool,
        this.metricsCollector
      );
      
      // Initialize for each camera
      for (const camera of this.cameras) {
        if (camera.enableAnpr) {
          await this.vehicleAnalytics.initializeCamera({
            cameraId: camera.id,
            tenantId: camera.tenantId,
            siteId: camera.siteId,
            minVehicleConfidence: 0.5,
            minPlateConfidence: 0.7,
            minOcrConfidence: 0.8,
            minPlateWidth: 40,
            minBlurScore: 0.55,
            maxOcrPerSecond: 5,
            trackTimeout: 5000,
            countryCode: camera.countryCode || 'IN',
            enableAnpr: true,
            enableColorClassification: true,
            enableWatchlist: true,
          });
        }
      }
    }
  }
  
  async processFrame(cameraId: string, frame: any) {
    // ... existing detection logic
    
    // Process with vehicle analytics if enabled
    if (this.vehicleAnalytics) {
      const vehicleDetections = detections.filter(d => 
        ['car', 'truck', 'bus', 'motorcycle', 'vehicle'].includes(d.label)
      );
      
      if (vehicleDetections.length > 0) {
        const result = await this.vehicleAnalytics.processDetections(
          cameraId,
          vehicleDetections,
          frame.timestamp,
          {
            image: frame.image,
            width: frame.width,
            height: frame.height,
          }
        );
        
        // Handle watchlist matches
        if (result?.watchlistMatches.length > 0) {
          for (const match of result.watchlistMatches) {
            await this.handleWatchlistMatch(match);
          }
        }
      }
    }
    
    return detections;
  }
  
  private async handleWatchlistMatch(match: any) {
    // Send alert
    await this.alertService.createAlert({
      type: 'watchlist-match',
      severity: match.severity,
      title: match.title,
      message: match.message,
      metadata: match.match,
    });
  }
}
```

## Step 5: Update API Routes

In `src/routes/index.ts`:

```typescript
import { createVehicleAnalyticsRoutes } from './vehicle-analytics.routes.js';

export function setupRoutes(app: Express, context: AppContext) {
  // ... existing routes
  
  // Vehicle analytics routes
  if (context.vehicleAnalytics) {
    app.use('/api/vehicle-analytics', createVehicleAnalyticsRoutes(
      context.vehicleAnalytics.getRepository(),
      context.vehicleAnalytics.getJourneyService(),
      context.vehicleAnalytics.getWatchlistService()
    ));
  }
}
```

## Step 6: Environment Variables

Add to `.env`:

```bash
# Vehicle Analytics
VEHICLE_ANALYTICS_ENABLED=true
PADDLE_OCR_URL=http://localhost:8000
ANPR_COUNTRY_CODE=IN
ANPR_MIN_CONFIDENCE=0.7
ANPR_MAX_OCR_PER_SECOND=5

# Database (if not already configured)
DATABASE_URL=postgresql://user:password@localhost:5432/vms
```

## Step 7: Database Migration

Run the schema migration:

```bash
# Create vehicle_events table
psql $DATABASE_URL < analytics-engine/src/vehicle/persistence/postgres-vehicle-event.repository.ts

# Or via migration tool
npm run migrate:vehicle-analytics
```

## Step 8: Frontend Integration

Add to dashboard navigation:

```typescript
// src/components/Sidebar.tsx
const menuItems = [
  // ... existing items
  {
    name: 'Vehicle Analytics',
    icon: Car,
    href: '/vehicle-analytics',
    enabled: process.env.NEXT_PUBLIC_VEHICLE_ANALYTICS_ENABLED === 'true',
  },
];
```

Add route:

```typescript
// src/pages/vehicle-analytics.tsx
import { VehicleAnalyticsDashboard } from '../components/VehicleAnalyticsDashboard';

export default function VehicleAnalyticsPage() {
  return <VehicleAnalyticsDashboard />;
}
```

## Step 9: Docker Configuration

Update `docker-compose.yml`:

```yaml
services:
  analytics-engine:
    environment:
      - VEHICLE_ANALYTICS_ENABLED=true
      - PADDLE_OCR_URL=http://ocr-service:8000
    depends_on:
      - ocr-service
  
  ocr-service:
    image: paddlepaddle/paddleocr:latest
    ports:
      - "8000:8000"
    deploy:
      resources:
        reservations:
          devices:
            - capabilities: [gpu]  # Optional
```

## Step 10: Testing Integration

Create test script `test-vehicle-integration.ts`:

```typescript
import { VehicleAnalyticsIntegration } from './integration/vehicle-analytics-integration.js';

async function testIntegration() {
  // Setup
  const integration = new VehicleAnalyticsIntegration(pool, metrics);
  
  await integration.initializeCamera({
    cameraId: 'test-cam',
    tenantId: 'test-tenant',
    siteId: 'test-site',
    // ... config
  });
  
  // Test detection
  const result = await integration.processDetections(
    'test-cam',
    [
      {
        boundingBox: { x: 100, y: 150, width: 200, height: 150 },
        confidence: 0.92,
        className: 'car',
      }
    ],
    new Date()
  );
  
  console.log('Test result:', result);
  
  // Test journey query
  const journey = await integration.getJourneyService().buildJourney(
    'test-tenant',
    'TEST1234',
    {
      from: new Date(Date.now() - 24 * 60 * 60 * 1000),
      to: new Date(),
    }
  );
  
  console.log('Journey:', journey);
}

testIntegration().catch(console.error);
```

## Compatibility Notes

### Existing System Impact
- **No breaking changes** to existing analytics
- Vehicle analytics runs in parallel
- Can be disabled via env variable
- Gradual rollout per camera supported

### Performance Considerations
- OCR rate limiting prevents overload
- Quality gates reduce unnecessary processing
- Async processing doesn't block main pipeline
- Database indexes prevent query slowdowns

### Migration Path
1. **Phase 1:** Deploy with `VEHICLE_ANALYTICS_ENABLED=false`
2. **Phase 2:** Enable for 1-2 test cameras
3. **Phase 3:** Monitor metrics for 24-48 hours
4. **Phase 4:** Gradual rollout to all cameras
5. **Phase 5:** Enable watchlist features

## Rollback Plan

If issues occur:

```bash
# Disable vehicle analytics
export VEHICLE_ANALYTICS_ENABLED=false

# Restart services
docker-compose restart analytics-engine

# System continues with existing vehicle detection
# New features simply stop processing
```

## Monitoring Integration Health

```typescript
// Check integration status
GET /api/vehicle-analytics/health

// Response
{
  "enabled": true,
  "cameras": 10,
  "ocrServiceAvailable": true,
  "databaseConnected": true,
  "metrics": {
    "successRate": 0.92,
    "avgLatency": 150
  }
}
```

---

**Integration Status:** Ready for deployment  
**Backwards Compatible:** Yes  
**Risk Level:** Low (can be disabled)  
**Recommended Approach:** Gradual rollout per camera
