# Analytics Engine Architecture

## System Overview

```
┌──────────────────────────────────────────────────────────────────────────┐
│                        Analytics Engine Architecture                      │
└──────────────────────────────────────────────────────────────────────────┘

Camera Streams
     │
     ├─► Stream Processor ──────┐
     │   - Frame extraction      │
     │   - Preprocessing         │
     │   - Frame queue           │
     │                           │
     └─────────────────────────  │
                                 ▼
                        Detection Pipeline
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
    Foundation Layer       Tracking Layer         Analytics Layer
         │                       │                       │
    ┌────┴────┐            ┌────┴────┐            ┌────┴────┐
    │ YOLOv8  │            │DeepSORT │            │ Business│
    │  Base   │───────────▶│ Tracker │───────────▶│  Rules  │
    │Detection│            │ Re-ID   │            │ Engine  │
    └─────────┘            └─────────┘            └─────────┘
         │                       │                       │
         ▼                       ▼                       ▼
    ┌─────────────────────────────────────────────────────────┐
    │              Result Aggregation & Enrichment             │
    └─────────────────────────────────────────────────────────┘
                                 │
         ┌───────────────────────┼───────────────────────┐
         ▼                       ▼                       ▼
   Notification           Data Storage              External APIs
      Engine                                        (Webhooks, etc.)
```

---

## Component Architecture

### 1. Stream Processor

**Responsibilities**:
- Receive RTSP/HTTP streams
- Extract frames at configurable FPS (0.5-5 FPS for analytics)
- Preprocessing (resize, normalize)
- Frame queue management (backpressure handling)
- Health monitoring

**Implementation**:
```typescript
class StreamProcessor {
  private streams = new Map<string, StreamHandler>();
  
  async startStream(config: StreamConfig) {
    const handler = new StreamHandler(config);
    await handler.connect();
    handler.on('frame', frame => this.processFrame(frame));
    this.streams.set(config.cameraId, handler);
  }
  
  private async processFrame(frame: Frame) {
    // Add to pipeline queue
    await this.pipeline.enqueue(frame);
  }
}
```

**Frame Rate Strategy**:
- Real-time alerts: 1-2 FPS
- Counting/tracking: 1 FPS
- Retail analytics: 0.5 FPS
- Traffic monitoring: 2-5 FPS

---

### 2. Detection Pipeline

**Multi-Stage Processing**:

#### Stage 1: Foundation Detection (Always Active)
```typescript
class FoundationDetector {
  async detect(frame: Frame): Promise<BaseDetections> {
    // YOLOv8 base model (80 classes)
    const detections = await this.yoloModel.run(frame);
    
    return {
      persons: detections.filter(d => d.class === 'person'),
      vehicles: detections.filter(d => VEHICLE_CLASSES.includes(d.class)),
      objects: detections.filter(d => OBJECT_CLASSES.includes(d.class)),
    };
  }
}
```

**Output**:
```json
{
  "persons": [
    {
      "bbox": [0.2, 0.3, 0.15, 0.4],
      "confidence": 0.89,
      "class": "person"
    }
  ],
  "vehicles": [...],
  "objects": [...]
}
```

#### Stage 2: Tracking & Re-Identification
```typescript
class TrackingLayer {
  private tracker = new DeepSORT();
  private reIdModel = new OSNet();
  
  async track(detections: BaseDetections, frame: Frame) {
    // Update tracks
    const tracks = this.tracker.update(detections, frame);
    
    // Extract Re-ID features for cross-camera tracking
    for (const track of tracks) {
      track.reIdFeature = await this.reIdModel.extract(
        frame.crop(track.bbox)
      );
    }
    
    return tracks;
  }
}
```

**Output**:
```json
{
  "tracks": [
    {
      "trackId": "person_001",
      "bbox": [0.2, 0.3, 0.15, 0.4],
      "confidence": 0.89,
      "age": 142,  // frames
      "reIdFeature": [0.12, 0.45, ...],  // 512-dim vector
      "state": "tracked"
    }
  ]
}
```

#### Stage 3: Specialized Detectors (Conditional)
```typescript
class SpecializedDetectors {
  // Only run if enabled in camera rules
  async runConditional(tracks: Track[], frame: Frame, rules: Rule[]) {
    const results = [];
    
    if (rules.some(r => r.type === 'ppe')) {
      results.push(await this.ppeDetector.detect(tracks, frame));
    }
    
    if (rules.some(r => r.type === 'face')) {
      results.push(await this.faceDetector.detect(tracks, frame));
    }
    
    if (rules.some(r => r.type === 'pose')) {
      results.push(await this.poseDetector.detect(tracks, frame));
    }
    
    return results;
  }
}
```

#### Stage 4: Analytics & Business Logic
```typescript
class AnalyticsEngine {
  async analyze(tracks: Track[], detections: Detection[], rules: Rule[]) {
    const events = [];
    
    for (const rule of rules) {
      const ruleResult = await this.evaluateRule(rule, tracks, detections);
      if (ruleResult.triggered) {
        events.push(ruleResult.event);
      }
    }
    
    return events;
  }
}
```

---

### 3. Detector Implementations

#### Human Analytics
```typescript
class HumanAnalytics {
  // Person tracking
  async trackPersons(frame: Frame): Promise<PersonTrack[]> {
    const detections = await this.yolo.detect(frame);
    return await this.tracker.update(detections);
  }
  
  // Person re-identification
  async reIdentify(person: Person, knownPersons: Person[]): Promise<Match> {
    const features = await this.osnet.extract(person.crop);
    return this.findBestMatch(features, knownPersons);
  }
  
  // Activity recognition
  async recognizeActivity(track: PersonTrack): Promise<Activity> {
    const clip = track.getLastNFrames(16);  // 2 seconds @ 8fps
    return await this.activityModel.classify(clip);
  }
  
  // Dwell time
  async calculateDwellTime(track: PersonTrack, zone: Zone): Promise<number> {
    const timeInZone = track.history
      .filter(pos => zone.contains(pos))
      .length * this.frameInterval;
    return timeInZone;
  }
  
  // Behavior detection
  async detectBehavior(track: PersonTrack): Promise<Behavior[]> {
    const behaviors = [];
    
    // Running: Speed > threshold
    if (track.speed > 2.0) behaviors.push('running');
    
    // Loitering: Low movement in zone
    if (track.speed < 0.1 && track.duration > 60) behaviors.push('loitering');
    
    // Sitting/Standing: Pose analysis
    const pose = await this.poseEstimator.estimate(track.lastFrame);
    if (pose.isSitting) behaviors.push('sitting');
    
    return behaviors;
  }
}
```

#### Vehicle Analytics
```typescript
class VehicleAnalytics {
  // Vehicle classification
  async classifyVehicle(vehicle: Detection): Promise<VehicleType> {
    // Use aspect ratio + size for initial classification
    const aspectRatio = vehicle.width / vehicle.height;
    const area = vehicle.width * vehicle.height;
    
    if (aspectRatio < 0.5) return 'motorcycle';
    if (area < 0.05) return 'bicycle';
    if (aspectRatio > 2.0) return 'bus';
    if (area > 0.15) return 'truck';
    return 'car';
  }
  
  // Speed estimation
  async estimateSpeed(track: VehicleTrack): Promise<number> {
    const positions = track.getLastNPositions(10);
    const pixelDistance = this.calculateDistance(positions);
    const realDistance = this.pixelToMeter(pixelDistance, track.calibration);
    const timeElapsed = positions.length * this.frameInterval;
    return (realDistance / timeElapsed) * 3.6;  // km/h
  }
  
  // License plate recognition
  async recognizePlate(vehicle: Detection, frame: Frame): Promise<string> {
    // 1. Detect plate region
    const plateRegion = await this.plateDetector.detect(
      frame.crop(vehicle.bbox)
    );
    
    // 2. Read characters
    const text = await this.ocrModel.recognize(plateRegion);
    
    // 3. Format & validate
    return this.formatPlate(text);
  }
  
  // Parking analytics
  async analyzeParkingSpace(space: ParkingSpace, tracks: Track[]): Promise<ParkingStatus> {
    const occupiedBy = tracks.find(t => space.overlaps(t.bbox));
    
    if (occupiedBy) {
      const duration = Date.now() - occupiedBy.firstSeen;
      return {
        status: 'occupied',
        vehicle: occupiedBy,
        duration,
        isIllegal: duration > space.maxDuration,
      };
    }
    
    return { status: 'vacant' };
  }
}
```

#### Face Analytics
```typescript
class FaceAnalytics {
  // Face detection
  async detectFaces(frame: Frame): Promise<Face[]> {
    return await this.retinaFace.detect(frame);
  }
  
  // Face recognition
  async recognizeFace(face: Face, watchlist: Person[]): Promise<Match | null> {
    const embedding = await this.arcFace.extract(face.crop);
    
    for (const person of watchlist) {
      const similarity = this.cosineSimilarity(embedding, person.embedding);
      if (similarity > 0.7) {
        return { person, confidence: similarity };
      }
    }
    
    return null;  // Unknown person
  }
  
  // Face attributes
  async analyzeAttributes(face: Face): Promise<FaceAttributes> {
    return {
      age: await this.ageModel.predict(face.crop),
      gender: await this.genderModel.predict(face.crop),
      hasMask: await this.maskDetector.detect(face.crop),
      hasGlasses: this.detectGlasses(face.landmarks),
      emotion: await this.emotionModel.predict(face.crop),
    };
  }
}
```

#### Safety Analytics
```typescript
class SafetyAnalytics {
  // PPE detection
  async detectPPE(person: PersonTrack, frame: Frame): Promise<PPE> {
    const crop = frame.crop(person.bbox);
    const detections = await this.ppeModel.detect(crop);
    
    return {
      helmet: detections.some(d => d.class === 'helmet'),
      vest: detections.some(d => d.class === 'safety_vest'),
      gloves: detections.some(d => d.class === 'gloves'),
      shoes: detections.some(d => d.class === 'safety_shoes'),
    };
  }
  
  // Fire & smoke detection
  async detectFireSmoke(frame: Frame): Promise<FireSmokeEvent[]> {
    const detections = await this.fireModel.detect(frame);
    
    return detections.map(d => ({
      type: d.class,  // 'fire' or 'smoke'
      bbox: d.bbox,
      severity: this.calculateSeverity(d),
      spreading: this.analyzeSpread(d, this.previousFrames),
    }));
  }
  
  // Fall detection
  async detectFall(track: PersonTrack, frame: Frame): Promise<boolean> {
    const pose = await this.poseEstimator.estimate(
      frame.crop(track.bbox)
    );
    
    // Check if person is horizontal
    const isHorizontal = this.isPoseHorizontal(pose);
    
    // Check for rapid vertical movement
    const verticalVelocity = this.calculateVerticalVelocity(track);
    
    return isHorizontal && verticalVelocity > 2.0;
  }
}
```

---

### 4. AI Search Engine

```typescript
class AISearchEngine {
  private clipModel: CLIP;
  private index: VectorDB;
  
  // Index frame
  async indexFrame(frame: Frame, detections: Detection[], metadata: Metadata) {
    // Extract visual features
    const visualFeatures = await this.clipModel.encodeImage(frame);
    
    // Store in vector database
    await this.index.insert({
      frameId: metadata.frameId,
      cameraId: metadata.cameraId,
      timestamp: metadata.timestamp,
      features: visualFeatures,
      detections: detections,
    });
  }
  
  // Natural language search
  async search(query: string): Promise<SearchResult[]> {
    // "person wearing red shirt"
    const textFeatures = await this.clipModel.encodeText(query);
    
    // Vector similarity search
    const results = await this.index.search(textFeatures, limit: 100);
    
    // Re-rank with additional filters
    return this.rerank(results, query);
  }
  
  // Attribute-based search
  async searchByAttributes(attrs: Attributes): Promise<SearchResult[]> {
    // Build query from attributes
    const filters = [];
    
    if (attrs.color) filters.push(`object.color == "${attrs.color}"`);
    if (attrs.type) filters.push(`object.type == "${attrs.type}"`);
    if (attrs.timeRange) filters.push(`timestamp BETWEEN ${attrs.timeRange}`);
    
    return await this.index.filter(filters);
  }
}
```

---

### 5. AI Investigation Tools

```typescript
class InvestigationEngine {
  // Cross-camera tracking
  async trackAcrossCameras(person: Person, timeWindow: TimeRange): Promise<Journey> {
    const journey = new Journey(person);
    
    // Find all cameras this person appeared on
    for (const camera of this.cameras) {
      const appearances = await this.findPersonInCamera(
        person.reIdFeature,
        camera,
        timeWindow
      );
      
      journey.addAppearances(appearances);
    }
    
    // Sort chronologically
    journey.sortByTime();
    
    return journey;
  }
  
  // Path reconstruction
  async reconstructPath(journey: Journey): Promise<Path> {
    const path = new Path();
    
    for (let i = 0; i < journey.length - 1; i++) {
      const from = journey[i];
      const to = journey[i + 1];
      
      // Find connecting route
      const route = await this.findRoute(from.camera, to.camera);
      path.addSegment(route);
    }
    
    return path;
  }
  
  // Timeline analysis
  async buildTimeline(events: Event[]): Promise<Timeline> {
    const timeline = new Timeline();
    
    // Group events by camera/zone
    const grouped = this.groupEvents(events);
    
    // Add to timeline with context
    for (const group of grouped) {
      timeline.addEntry({
        time: group.timestamp,
        location: group.camera,
        event: group.description,
        evidence: group.snapshots,
      });
    }
    
    return timeline;
  }
}
```

---

### 6. AI Prediction Engine

```typescript
class PredictionEngine {
  // Camera failure prediction
  async predictCameraFailure(camera: Camera): Promise<FailurePrediction> {
    const metrics = await this.getHealthMetrics(camera, days: 30);
    
    // Time series analysis
    const features = this.extractFeatures(metrics);
    const prediction = await this.failureModel.predict(features);
    
    return {
      probability: prediction.probability,
      timeToFailure: prediction.days,
      factors: prediction.topFactors,
      recommendation: this.generateRecommendation(prediction),
    };
  }
  
  // Storage exhaustion forecast
  async forecastStorageExhaustion(node: StorageNode): Promise<Forecast> {
    const usage = await this.getStorageUsage(node, days: 90);
    
    // Prophet time series forecasting
    const forecast = await this.prophetModel.predict(usage, horizon: 30);
    
    const daysUntilFull = forecast.findIndex(d => d.value >= node.capacity);
    
    return {
      daysUntilFull,
      expectedDate: this.addDays(new Date(), daysUntilFull),
      confidence: forecast.confidence,
      recommendation: daysUntilFull < 30 ? 'expand_storage' : 'monitor',
    };
  }
  
  // Incident probability
  async predictIncidents(location: Location, timeWindow: TimeRange): Promise<RiskScore> {
    const historical = await this.getIncidents(location, past: 90);
    
    // LSTM for pattern learning
    const features = this.extractTemporalFeatures(historical, timeWindow);
    const prediction = await this.lstmModel.predict(features);
    
    return {
      probability: prediction.probability,
      riskLevel: this.classifyRisk(prediction.probability),
      peakTimes: prediction.highRiskPeriods,
      contributingFactors: prediction.factors,
    };
  }
}
```

---

### 7. AI Reporting Engine

```typescript
class ReportingEngine {
  // Daily summary
  async generateDailySummary(date: Date): Promise<Report> {
    const events = await this.getEvents(date);
    
    return {
      title: `Daily Incident Summary - ${date.toDateString()}`,
      totalIncidents: events.length,
      byType: this.groupBy(events, 'type'),
      byLocation: this.groupBy(events, 'location'),
      topIncidents: events.slice(0, 10),
      heatMap: await this.generateHeatMap(events),
      trends: this.compareToPrevious(events),
    };
  }
  
  // Compliance report
  async generateComplianceReport(branch: Branch, month: Date): Promise<ComplianceReport> {
    const checks = await this.getComplianceChecks(branch, month);
    
    return {
      overallScore: this.calculateScore(checks),
      categories: {
        ppe: this.analyzeCategory(checks, 'ppe'),
        access: this.analyzeCategory(checks, 'access'),
        safety: this.analyzeCategory(checks, 'safety'),
      },
      violations: checks.filter(c => !c.passed),
      recommendations: this.generateRecommendations(checks),
    };
  }
  
  // Executive dashboard
  async generateExecutiveDashboard(): Promise<Dashboard> {
    return {
      systemHealth: await this.getSystemHealth(),
      activeAlerts: await this.getActiveAlerts(),
      incidentStats: await this.getIncidentStats(days: 30),
      branchPerformance: await this.getBranchPerformance(),
      costSavings: await this.calculateCostSavings(),
      aiInsights: await this.generateInsights(),
    };
  }
}
```

---

### 8. AI Assistant

```typescript
class AIAssistant {
  private nlpModel: DistilBERT;
  
  // Process natural language query
  async processQuery(query: string): Promise<Response> {
    // Parse intent
    const intent = await this.parseIntent(query);
    
    switch (intent.type) {
      case 'camera_status':
        return await this.handleCameraQuery(intent);
      
      case 'incident_search':
        return await this.handleIncidentSearch(intent);
      
      case 'analytics':
        return await this.handleAnalyticsQuery(intent);
      
      case 'search':
        return await this.handleSearch(intent);
    }
  }
  
  // Example queries
  async handleCameraQuery(intent: Intent): Promise<Response> {
    // "Show cameras not recording"
    const cameras = await this.getCameras();
    const notRecording = cameras.filter(c => !c.isRecording);
    
    return {
      type: 'camera_list',
      data: notRecording,
      summary: `Found ${notRecording.length} cameras not recording`,
    };
  }
  
  async handleIncidentSearch(intent: Intent): Promise<Response> {
    // "Show all smoke alerts in last 24 hours"
    const events = await this.searchEvents({
      type: 'smoke',
      timeRange: { hours: 24 },
    });
    
    return {
      type: 'event_list',
      data: events,
      summary: `Found ${events.length} smoke alerts`,
    };
  }
}
```

---

## Performance Optimization

### 1. Model Optimization

```typescript
class ModelOptimizer {
  // Quantization: FP32 → INT8
  async quantizeModel(modelPath: string): Promise<string> {
    const quantized = await ort.quantize(modelPath, {
      format: 'QUInt8',
      activationQuantization: true,
      weightQuantization: true,
    });
    
    return quantized;  // 4x smaller, 3-4x faster
  }
  
  // Dynamic batching
  async processBatch(frames: Frame[]): Promise<Result[]> {
    // Group frames for batch inference
    const batch = this.createBatch(frames);
    const results = await this.model.run(batch);
    return this.splitResults(results);
  }
  
  // TensorRT optimization (NVIDIA GPUs)
  async optimizeForTensorRT(modelPath: string): Promise<string> {
    // Convert ONNX → TensorRT engine
    // 2-3x faster on NVIDIA GPUs
    return await this.tensorRTConverter.convert(modelPath);
  }
}
```

### 2. Frame Processing Optimization

```typescript
class FrameOptimizer {
  // Adaptive FPS
  adjustFPS(cameraLoad: number): number {
    if (cameraLoad < 0.5) return 2.0;  // Low load: higher FPS
    if (cameraLoad < 0.8) return 1.0;  // Medium load
    return 0.5;  // High load: reduce FPS
  }
  
  // Region of interest (ROI) processing
  async processROI(frame: Frame, zones: Zone[]): Promise<Result[]> {
    // Only analyze relevant regions
    const results = [];
    
    for (const zone of zones) {
      const crop = frame.crop(zone.bbox);
      const detection = await this.detect(crop);
      results.push(detection);
    }
    
    return results;
  }
  
  // Motion-based triggering
  async detectMotion(frame: Frame, previous: Frame): Promise<boolean> {
    const diff = this.frameDiff(frame, previous);
    return diff > this.motionThreshold;
  }
}
```

---

## Deployment Architecture

### Single-Node Deployment
```yaml
# For small deployments (< 50 cameras)
services:
  analytics-engine:
    image: sentinel/analytics-engine
    environment:
      PROCESSING_MODE: all-in-one
      MAX_CAMERAS: 50
      FPS_PER_CAMERA: 1
    volumes:
      - ./models:/app/models
    deploy:
      resources:
        limits:
          cpus: '8'
          memory: 16G
```

### Multi-Node Deployment
```yaml
# For large deployments (100+ cameras)
services:
  # Load balancer
  analytics-lb:
    image: sentinel/analytics-lb
    ports:
      - "8092:8092"
  
  # Worker nodes
  analytics-worker-1:
    image: sentinel/analytics-engine
    environment:
      PROCESSING_MODE: worker
      GPU_ENABLED: true
  
  analytics-worker-2:
    image: sentinel/analytics-engine
    environment:
      PROCESSING_MODE: worker
      GPU_ENABLED: true
```

---

## Monitoring & Metrics

```typescript
class PerformanceMonitor {
  metrics = {
    framesProcessed: 0,
    averageLatency: 0,
    detectionsPerSecond: 0,
    gpuUtilization: 0,
    memoryUsage: 0,
    modelsLoaded: 0,
  };
  
  async collectMetrics(): Promise<Metrics> {
    return {
      ...this.metrics,
      timestamp: new Date().toISOString(),
      health: this.calculateHealth(),
    };
  }
}
```

---

## Next Steps

1. ✅ Review architecture
2. 🔄 Implement detector base classes
3. 🔄 Integrate ONNX Runtime
4. 🔄 Build detection pipeline
5. 🔄 Add specialized detectors
6. 🔄 Implement tracking layer
7. 🔄 Build search engine
8. 🔄 Create reporting tools

**Estimated Implementation**: 4-6 weeks for full feature set
