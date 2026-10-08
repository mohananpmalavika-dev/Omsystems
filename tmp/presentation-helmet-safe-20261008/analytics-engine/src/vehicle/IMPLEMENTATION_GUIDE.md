# Vehicle Analytics & ANPR Implementation Guide

## Architecture Overview

```
Camera Frame
     │
     ▼
Vehicle Detector (YOLO)
     │
     ▼
Vehicle Tracker (SORT + Re-ID)
     │
     ├──────────────────┬──────────────────┐
     ▼                  ▼                  ▼
Color Classifier   Plate Detector    Speed Estimator
     │                  │
     │                  ▼
     │            Plate Rectifier
     │                  │
     │                  ▼
     │             OCR Engine
     │                  │
     │                  ▼
     │          Plate Normalizer
     │                  │
     │                  ▼
     │         Multi-frame Consensus
     │                  │
     └──────────────────┴──────────────────┘
                        │
                        ▼
                Vehicle Event (Finalized)
                        │
                        ▼
              Vehicle Event Repository
                        │
         ┌──────────────┼──────────────┐
         ▼              ▼              ▼
    Database       Watchlist       Journey
                    Matching      Reconstruction
```

## Module Structure

```
analytics-engine/src/vehicle/
├── tracking/
│   ├── vehicle-tracker.ts          [✓ IMPLEMENTED]
│   └── track-state.ts
├── color/
│   └── vehicle-color-classifier.ts [✓ IMPLEMENTED]
├── detection/
│   ├── vehicle-detector.ts
│   └── license-plate-detector.ts   [✓ IMPLEMENTED]
├── anpr/
│   ├── plate-rectifier.ts
│   ├── plate-recognizer.ts
│   ├── paddle-ocr-adapter.ts
│   ├── plate-normalizer.ts
│   └── plate-consensus.ts
├── persistence/
│   ├── vehicle-event.repository.ts
│   ├── vehicle-event.model.ts
│   └── postgres-vehicle-event.repository.ts
├── journey/
│   └── vehicle-journey.service.ts
├── watchlist/
│   └── vehicle-watchlist.service.ts
└── vehicle-analytics.service.ts (main orchestrator)
```

## Data Flow

### 1. Detection & Tracking Phase
- **Input**: Camera frame + timestamp
- **Output**: Tracked vehicle detections with trackId
- **Components**: VehicleDetector → VehicleTracker

### 2. Enrichment Phase
- **Input**: Tracked vehicle + vehicle crop
- **Parallel Operations**:
  - Color classification
  - Plate detection
  - Re-ID feature extraction
- **Output**: Enriched track observations

### 3. ANPR Pipeline
```
Vehicle Crop
     ↓
Plate Detection (quality gate)
     ↓
Plate Rectification (perspective correction)
     ↓
OCR (PaddleOCR)
     ↓
Format Normalization (country-aware)
     ↓
Multi-frame Consensus (edit distance clustering)
     ↓
Finalized Plate Identity
```

### 4. Track Finalization
- **Trigger**: Track lost for N frames OR vehicle exits ROI
- **Process**:
  1. Resolve consensus plate from observations
  2. Resolve consensus color from observations
  3. Calculate final confidence scores
  4. Create VehicleEvent
  5. Persist to database
  6. Check watchlists
  7. Publish domain event

### 5. Query & Analytics
- **Search**: By plate, color, type, time range
- **Journey**: Cross-camera appearances of same vehicle
- **Watchlist**: Real-time matching with alerting

## Key Design Principles

### 1. Separation of Concerns
- Each module has single responsibility
- Detectors don't persist
- Repositories don't infer
- Orchestrator coordinates

### 2. Quality Gates
- Don't OCR every frame
- Only process high-quality plate crops
- Require minimum confidence thresholds
- Use temporal consensus

### 3. Uncertainty Representation
```typescript
interface PlateConfidence {
  detection: number;        // Plate detector confidence
  rectification: number;    // Geometric quality
  ocr: number;             // Text recognition confidence
  format: number;          // Format validation score
  temporalConsensus: number; // Multi-frame agreement
  final: number;           // Weighted composite
}
```

### 4. Raw + Normalized Storage
```typescript
{
  rawPlateText: "KL 01 A8 1234",     // What OCR actually saw
  normalizedPlate: "KL01AB1234",      // After correction
  normalizationChanges: [
    { position: 5, from: "8", to: "B", reason: "expected-letter" }
  ]
}
```

### 5. Track State Management
```typescript
enum TrackStatus {
  Active,        // Currently visible
  Pending,       // Lost but within timeout
  Finalized,     // Completed, ready for persistence
  Persisted      // Saved to database
}
```

## Implementation Checklist

### Phase 1: Core Pipeline ✓
- [✓] Vehicle Tracker with SORT + Re-ID
- [✓] Color Classifier (HSV/LAB dominant color)
- [✓] Plate Detector with quality scoring

### Phase 2: ANPR Stack
- [ ] Plate Rectifier (perspective correction)
- [ ] OCR Adapter (PaddleOCR integration)
- [ ] Plate Normalizer (country-aware)
- [ ] Multi-frame Consensus (edit distance)

### Phase 3: Persistence
- [ ] VehicleEvent model
- [ ] VehicleEventRepository interface
- [ ] PostgreSQL implementation
- [ ] Database schema & indexes

### Phase 4: Advanced Features
- [ ] Journey reconstruction
- [ ] Watchlist system
- [ ] Speed estimation
- [ ] Violation detection

### Phase 5: API & Frontend
- [ ] REST API routes
- [ ] GraphQL schema
- [ ] Frontend dashboard
- [ ] Real-time updates

### Phase 6: Observability
- [ ] Prometheus metrics
- [ ] Quality monitoring
- [ ] Performance tracking
- [ ] Alert generation

## Configuration

### Per-Camera ANPR Config
```typescript
interface CameraAnprConfig {
  enabled: boolean;
  
  // ROI for plate detection
  plateRoi?: Polygon;
  
  // Confidence thresholds
  minVehicleConfidence: number;
  minPlateConfidence: number;
  minOcrConfidence: number;
  
  // Quality gates
  minPlateWidth: number;
  minBlurScore: number;
  
  // Country/region
  countryCode: string;
  expectedFormats: RegExp[];
  
  // Optimization
  maxOcrPerSecond: number;
  trackTimeout: number;
}
```

## Performance Considerations

### 1. OCR Budget
- Don't OCR every frame
- Only process when quality > threshold
- Rate limit per camera
- Skip if plate already recognized

### 2. Tracking Efficiency
- Clean up stale tracks periodically
- Limit max tracks per camera
- Use efficient data structures

### 3. Database Optimization
```sql
-- Essential indexes
CREATE INDEX idx_vehicle_events_tenant_time 
ON vehicle_events (tenant_id, occurred_at DESC);

CREATE INDEX idx_vehicle_events_plate_time 
ON vehicle_events (tenant_id, normalized_plate, occurred_at DESC);

CREATE INDEX idx_vehicle_events_camera_time 
ON vehicle_events (tenant_id, camera_id, occurred_at DESC);
```

### 4. Memory Management
- Stream large results
- Paginate queries
- Clean old observations
- Compress stored images

## Error Handling

### 1. Graceful Degradation
```typescript
if (!plateDetector.available) {
  // Fall back to heuristic detection
  // OR skip plate detection
  // Never fail the entire pipeline
}
```

### 2. Confidence Reporting
```typescript
{
  status: "recognized" | "low-confidence" | "unreadable" | "not-visible",
  plate: "KL01AB1234",
  confidence: 0.67,
  warning: "Below recommended threshold"
}
```

### 3. Retry Logic
- Retry transient failures (network, DB)
- Don't retry invalid data
- Use exponential backoff
- Dead-letter queue for persistent failures

## Testing Strategy

### Unit Tests
- Color classification accuracy
- Plate format validation
- IoU calculation
- Edit distance clustering

### Integration Tests
- Full pipeline flow
- Database persistence
- Watchlist matching
- Journey reconstruction

### E2E Tests
- Real camera footage
- Multi-camera scenarios
- Performance benchmarks
- Quality metrics

## Deployment

### Docker Compose
```yaml
services:
  analytics-engine:
    environment:
      - ANPR_ENABLED=true
      - PADDLE_OCR_URL=http://ocr-service:8000
      - VEHICLE_REID_ENABLED=true
  
  ocr-service:
    image: paddleocr:latest
    ports:
      - "8000:8000"
```

### Resource Requirements
- Vehicle tracking: ~50MB RAM per camera
- OCR service: ~2GB RAM + GPU (optional)
- Database: Scales with event volume
- Storage: ~100KB per vehicle event

## Monitoring

### Key Metrics
```
anpr_detections_total
anpr_recognition_success_rate
anpr_ocr_latency_ms
anpr_plate_quality_score
anpr_watchlist_matches_total
vehicle_track_duration_seconds
vehicle_events_persisted_total
```

### Alerts
- OCR service down
- Recognition success rate < 70%
- Database write failures
- Watchlist match (critical)

## Next Steps

1. Complete ANPR stack (rectifier, OCR, normalizer, consensus)
2. Implement persistence layer
3. Build journey reconstruction
4. Create API routes
5. Develop frontend dashboard
6. Add comprehensive testing
7. Deploy and monitor
