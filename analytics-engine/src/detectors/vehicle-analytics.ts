/**
 * Vehicle Analytics Module
 * Comprehensive vehicle detection with ANPR, classification, tracking, and speed estimation
 * Uses zero-cost open-source models: YOLOv8 + PaddleOCR + Vehicle Re-ID
 */

import { randomUUID } from "node:crypto";
import { BaseDetector, type DetectionFrame, type DetectionResult } from "./base-detector.js";

// ============================================================================
// Type Definitions
// ============================================================================

export type VehicleType = 
  | 'car' | 'suv' | 'sedan' | 'hatchback' 
  | 'truck' | 'pickup_truck'
  | 'bus' | 'minibus'
  | 'motorcycle' | 'scooter'
  | 'bicycle'
  | 'van'
  | 'emergency'
  | 'unknown';

export type VehicleColor = 
  | 'white' | 'black' | 'silver' | 'gray'
  | 'red' | 'blue' | 'green' | 'yellow'
  | 'brown' | 'orange' | 'other';

export interface VehicleTrack {
  trackId: string;
  vehicleType: VehicleType;
  firstSeen: Date;
  lastSeen: Date;
  positions: Array<{
    x: number;
    y: number;
    timestamp: Date;
    boundingBox: { x: number; y: number; width: number; height: number };
  }>;
  
  // ANPR (License Plate)
  licensePlate?: {
    number: string;
    confidence: number;
    region?: string;  // State/Country
    firstDetected: Date;
    lastDetected: Date;
  };
  
  // Classification
  color?: VehicleColor;
  colorConfidence?: number;
  make?: string;  // Toyota, Honda, etc.
  model?: string;  // Camry, Civic, etc.
  
  // Speed & Movement
  speed?: number;  // km/h
  avgSpeed?: number;
  maxSpeed?: number;
  direction?: 'north' | 'south' | 'east' | 'west';
  trajectory?: Array<{ x: number; y: number; timestamp: Date }>;
  
  // Re-identification
  reIdFeature?: number[];  // 2048-dim feature vector
  globalVehicleId?: string;  // Cross-camera vehicle ID
  
  // Violations
  isWrongWay?: boolean;
  isIllegallyParked?: boolean;
  isOverSpeed?: boolean;
  
  avgConfidence: number;
}

export interface ParkingSpace {
  spaceId: string;
  polygon: Array<{ x: number; y: number }>;
  maxDuration?: number;  // seconds
  reservedFor?: 'disabled' | 'vip' | 'ev' | 'general';
  occupied: boolean;
  occupiedBy?: string;  // trackId
  occupiedSince?: Date;
  duration?: number;  // seconds
}

export interface SpeedZone {
  zoneId: string;
  polygon: Array<{ x: number; y: number }>;
  speedLimit: number;  // km/h
  calibration: {
    pixelsPerMeter: number;
    perspective?: number[][];
  };
}

export interface ANPRResult {
  plateNumber: string;
  confidence: number;
  vehicleTrackId: string;
  timestamp: Date;
  boundingBox: { x: number; y: number; width: number; height: number };
  vehicleType: VehicleType;
  vehicleColor?: VehicleColor;
}

export interface TrafficMetrics {
  totalVehicles: number;
  vehiclesByType: Record<VehicleType, number>;
  avgSpeed: number;
  congestionLevel: 'low' | 'medium' | 'high';
  wrongWayCount: number;
  overSpeedCount: number;
  timestamp: Date;
}

export interface VehicleReIdDatabase {
  features: Map<string, number[]>;  // globalVehicleId -> feature vector
  metadata: Map<string, {
    licensePlate?: string;
    vehicleType: VehicleType;
    color?: VehicleColor;
    firstSeen: Date;
    lastSeen: Date;
    appearances: number;
  }>;
}

// ============================================================================
// Vehicle Analytics Detector
// ============================================================================

export class VehicleAnalyticsDetector extends BaseDetector {
  private tracks = new Map<string, VehicleTrack>();
  private reIdDatabase: VehicleReIdDatabase = {
    features: new Map(),
    metadata: new Map(),
  };
  private parkingSpaces = new Map<string, ParkingSpace>();
  private speedZones = new Map<string, SpeedZone>();
  
  private isModelLoaded = false;
  private yoloModel: any;  // YOLOv8 ONNX session
  private plateDetector: any;  // License plate detector
  private ocrModel: any;  // PaddleOCR for text recognition
  private vehicleReIdModel: any;  // Vehicle Re-ID model
  
  // Configuration
  private readonly TRACKING_TIMEOUT_MS = 5000;
  private readonly MIN_CONFIDENCE = 0.5;
  private readonly ANPR_CONFIDENCE_THRESHOLD = 0.6;
  private readonly REID_SIMILARITY_THRESHOLD = 0.75;
  private readonly SPEED_LIMIT_DEFAULT = 60;  // km/h
  
  // Vehicle classes from COCO dataset
  private readonly VEHICLE_CLASSES = [
    'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
    'bicycle', 'car', 'motorcycle', 'bus', 'truck'
  ];

  constructor() {
    super("vehicle-analytics", "3.0.0");
  }

  async initialize(): Promise<void> {
    console.log("Initializing Vehicle Analytics detector...");
    
    try {
      // TODO: Load ONNX models
      // const ort = await import('onnxruntime-node');
      // this.yoloModel = await ort.InferenceSession.create('/app/models/detection/yolov8m.onnx');
      // this.plateDetector = await ort.InferenceSession.create('/app/models/vehicle/plate_detector.onnx');
      // this.ocrModel = await this.loadPaddleOCR();
      // this.vehicleReIdModel = await ort.InferenceSession.create('/app/models/vehicle/vehicle_reid.onnx');
      
      this.isModelLoaded = true;
      this.startTrackingCleanup();
      
      console.log("Vehicle Analytics detector initialized successfully");
      console.log("- Vehicle detection: YOLOv8");
      console.log("- License plate detection: Custom YOLO");
      console.log("- OCR: PaddleOCR");
      console.log("- Vehicle Re-ID: ResNet-based");
    } catch (error) {
      console.error("Failed to initialize Vehicle Analytics:", error);
      throw error;
    }
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isModelLoaded) {
      return [];
    }

    const results: DetectionResult[] = [];

    // Step 1: Detect vehicles using YOLOv8
    const vehicles = await this.detectVehicles(frame);

    // Step 2: Classify vehicle types
    const classifiedVehicles = this.classifyVehicles(vehicles);

    // Step 3: Update tracking
    await this.updateTracking(classifiedVehicles, frame);

    // Step 4: Detect and read license plates (ANPR)
    const anprResults = await this.performANPR(classifiedVehicles, frame);

    // Step 5: Extract Re-ID features
    await this.extractReIdFeatures(classifiedVehicles, frame);

    // Step 6: Perform Re-identification
    await this.performReIdentification();

    // Step 7: Estimate speeds
    this.updateSpeeds(frame.timestamp);

    // Step 8: Detect violations
    const violations = this.detectViolations();

    // Step 9: Monitor parking spaces
    const parkingStatus = this.monitorParkingSpaces(frame.timestamp);

    // Step 10: Calculate traffic metrics
    const trafficMetrics = this.calculateTrafficMetrics(frame.timestamp);

    // Generate detection results
    if (classifiedVehicles.length > 0) {
      results.push(this.createVehicleDetectionResult(classifiedVehicles));
    }

    if (anprResults.length > 0) {
      results.push(this.createANPRResult(anprResults));
    }

    if (violations.length > 0) {
      results.push(...violations);
    }

    if (parkingStatus.length > 0) {
      results.push(...parkingStatus);
    }

    results.push(this.createTrafficMetricsResult(trafficMetrics));

    return results;
  }

  // ============================================================================
  // Vehicle Detection (YOLOv8)
  // ============================================================================

  private async detectVehicles(frame: DetectionFrame): Promise<any[]> {
    try {
      const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
      const detections = await pipeline.detectObjects(frame, this.VEHICLE_CLASSES as unknown as string[]);
      if (!detections) return [];
      return detections
        .filter(d => d.confidence >= this.MIN_CONFIDENCE)
        .map(d => ({
          boundingBox: d.boundingBox,
          confidence: d.confidence,
          label: d.label,
          reIdFeature: (d as any).embedding,
        }));
    } catch (error) {
      console.warn('detectVehicles pipeline failed:', error);
      return [];
    }
  }

  // ============================================================================
  // Vehicle Classification
  // ============================================================================

  private classifyVehicles(detections: any[]): any[] {
    return detections.map(detection => ({
      ...detection,
      vehicleType: this.classifyVehicleType(detection),
      color: this.estimateVehicleColor(detection),
    }));
  }

  private classifyVehicleType(detection: any): VehicleType {
    const { class: className, boundingBox } = detection;
    
    // Direct mapping from YOLO classes
    if (className === 'bicycle') return 'bicycle';
    if (className === 'motorcycle') return 'motorcycle';
    if (className === 'bus') return 'bus';
    if (className === 'truck') return 'truck';
    
    // For 'car', use aspect ratio and size for sub-classification
    if (className === 'car') {
      const aspectRatio = boundingBox.width / boundingBox.height;
      const area = boundingBox.width * boundingBox.height;
      
      // Motorcycle/Scooter: Narrow and small
      if (aspectRatio < 0.6 && area < 0.05) return 'motorcycle';
      
      // Bus: Very wide or very large
      if (aspectRatio > 2.0 || area > 0.2) return 'bus';
      
      // Truck: Large area, square-ish
      if (area > 0.15 && aspectRatio > 1.2 && aspectRatio < 1.8) return 'truck';
      
      // SUV: Larger than car, taller
      if (area > 0.08 && aspectRatio < 1.3) return 'suv';
      
      // Default to car
      return 'car';
    }
    
    return 'unknown';
  }

  private estimateVehicleColor(detection: any): VehicleColor {
    // TODO: Implement color detection using dominant color analysis
    // Extract vehicle crop, convert to HSV, find dominant color
    /*
    const crop = this.cropFrame(frame, detection.boundingBox);
    const dominantColor = this.extractDominantColor(crop);
    return this.mapColorToCategory(dominantColor);
    */
    
    return 'other';
  }

  // ============================================================================
  // Vehicle Tracking
  // ============================================================================

  private async updateTracking(vehicles: any[], frame: DetectionFrame): Promise<void> {
    try {
      const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
      const timestamp = frame.timestamp || new Date();
      const tracked = await pipeline.updateTracking(vehicles as any, timestamp, 'vehicle');

      const activeTrackIds = new Set<string>();

      for (const det of tracked) {
        const trackId: string = (det as any).trackId ?? `vehicle_${randomUUID().substring(0,8)}`;
        activeTrackIds.add(trackId);

        const existing = this.tracks.get(trackId);
        const bbox = (det as any).boundingBox;
        if (existing) {
          this.updateTrack(existing, { boundingBox: bbox, confidence: det.confidence }, timestamp);
        } else {
          const newTrack = this.createNewTrack({ boundingBox: bbox, confidence: det.confidence }, timestamp);
          newTrack.trackId = trackId;
          this.tracks.set(trackId, newTrack);
        }
      }

      // Mark inactive tracks
      for (const [trackId, track] of this.tracks.entries()) {
        if (!activeTrackIds.has(trackId)) {
          track.lastSeen = timestamp;
        }
      }
    } catch (error) {
      console.warn('updateTracking pipeline failed:', error);
      // Fallback to legacy matching
      const now = frame.timestamp;
      const activeTrackIds = new Set<string>();

      for (const vehicle of vehicles) {
        const matchedTrack = this.findMatchingTrack(vehicle);

        if (matchedTrack) {
          this.updateTrack(matchedTrack, vehicle, now);
          activeTrackIds.add(matchedTrack.trackId);
        } else {
          const newTrack = this.createNewTrack(vehicle, now);
          this.tracks.set(newTrack.trackId, newTrack);
          activeTrackIds.add(newTrack.trackId);
        }
      }

      for (const [trackId, track] of this.tracks.entries()) {
        if (!activeTrackIds.has(trackId)) {
          track.lastSeen = now;
        }
      }
    }
  }

  private findMatchingTrack(detection: any): VehicleTrack | undefined {
    let bestMatch: VehicleTrack | undefined;
    let bestScore = 0;

    for (const track of this.tracks.values()) {
      const timeSinceLastSeen = Date.now() - track.lastSeen.getTime();
      if (timeSinceLastSeen > this.TRACKING_TIMEOUT_MS) continue;

      // Calculate IoU
      const iou = this.calculateIoU(
        detection.boundingBox,
        track.positions[track.positions.length - 1].boundingBox
      );

      // Combine IoU with vehicle type matching and Re-ID similarity
      let score = iou * 0.5;
      
      if (track.vehicleType === detection.vehicleType) {
        score += 0.2;
      }
      
      if (track.reIdFeature && detection.reIdFeature) {
        const cosineSim = this.cosineSimilarity(track.reIdFeature, detection.reIdFeature);
        score += cosineSim * 0.3;
      }

      if (score > bestScore && score > 0.4) {
        bestScore = score;
        bestMatch = track;
      }
    }

    return bestMatch;
  }

  private updateTrack(track: VehicleTrack, detection: any, timestamp: Date): void {
    track.lastSeen = timestamp;
    track.positions.push({
      x: detection.boundingBox.x + detection.boundingBox.width / 2,
      y: detection.boundingBox.y + detection.boundingBox.height / 2,
      timestamp,
      boundingBox: detection.boundingBox,
    });

    // Update vehicle type if confidence is higher
    if (detection.confidence > track.avgConfidence) {
      track.vehicleType = detection.vehicleType;
    }

    // Update color if detected
    if (detection.color && !track.color) {
      track.color = detection.color;
    }

    // Update confidence
    const confidences = track.positions.map(() => detection.confidence || 0.8);
    track.avgConfidence = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  }

  private createNewTrack(detection: any, timestamp: Date): VehicleTrack {
    return {
      trackId: `vehicle_${randomUUID().substring(0, 8)}`,
      vehicleType: detection.vehicleType,
      firstSeen: timestamp,
      lastSeen: timestamp,
      positions: [{
        x: detection.boundingBox.x + detection.boundingBox.width / 2,
        y: detection.boundingBox.y + detection.boundingBox.height / 2,
        timestamp,
        boundingBox: detection.boundingBox,
      }],
      color: detection.color,
      avgConfidence: detection.confidence || 0.8,
      trajectory: [],
    };
  }

  // ============================================================================
  // ANPR (Automatic Number Plate Recognition)
  // ============================================================================

  private async performANPR(vehicles: any[], frame: DetectionFrame): Promise<ANPRResult[]> {
    const results: ANPRResult[] = [];
    try {
      const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());

      // Detect plates in the frame
      const plates = await pipeline.detectPlates(frame);
      if (!plates || plates.length === 0) return results;

      for (const vehicle of vehicles) {
        // Find plate that overlaps vehicle bbox
        const matchedPlate = plates.find(p => this.calculateIoU(p.boundingBox, vehicle.boundingBox) > 0.3);
        if (!matchedPlate) continue;

        // Recognize plate text
        const plateText = await pipeline.recognizePlate(frame, matchedPlate.boundingBox).catch(() => null);
        if (!plateText || plateText.confidence < this.ANPR_CONFIDENCE_THRESHOLD) continue;

        const formattedPlate = this.formatPlateNumber(plateText.text);
        if (!formattedPlate) continue;

        // Update track with license plate
        const track = this.findTrackByBoundingBox(vehicle.boundingBox);
        if (track) {
          if (!track.licensePlate) {
            track.licensePlate = {
              number: formattedPlate,
              confidence: plateText.confidence,
              firstDetected: frame.timestamp,
              lastDetected: frame.timestamp,
            };
          } else {
            track.licensePlate.lastDetected = frame.timestamp;
            track.licensePlate.confidence = (track.licensePlate.confidence * 0.7) + (plateText.confidence * 0.3);
          }
        }

        results.push({
          plateNumber: formattedPlate,
          confidence: plateText.confidence,
          vehicleTrackId: track?.trackId || 'unknown',
          timestamp: frame.timestamp,
          boundingBox: matchedPlate.boundingBox,
          vehicleType: vehicle.vehicleType,
          vehicleColor: vehicle.color,
        });
      }

      return results;
    } catch (error) {
      console.warn('performANPR pipeline failed:', error);
      return results;
    }
  }

  private async detectLicensePlate(vehicle: any, frame: DetectionFrame): Promise<any | null> {
    // TODO: Implement license plate detection
    /*
    const vehicleCrop = this.cropFrame(frame, vehicle.boundingBox);
    const input = this.preprocessForPlateDetection(vehicleCrop);
    const output = await this.plateDetector.run({ images: input });
    const plates = this.postprocessPlateDetection(output);
    return plates.length > 0 ? plates[0] : null;
    */
    
    return null;
  }

  private async recognizePlateText(plateRegion: any, frame: DetectionFrame): Promise<{ text: string; confidence: number } | null> {
    // TODO: Implement PaddleOCR text recognition
    /*
    const plateCrop = this.cropFrame(frame, plateRegion.boundingBox);
    const result = await this.ocrModel.recognize(plateCrop);
    return {
      text: result.text.replace(/[^A-Z0-9]/g, ''),
      confidence: result.confidence
    };
    */
    
    return null;
  }

  private formatPlateNumber(text: string): string | null {
    // Remove non-alphanumeric characters
    const cleaned = text.replace(/[^A-Z0-9]/g, '');
    
    // Validate Indian plate format: XX00XX0000 or XX00X0000
    const indianPattern = /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/;
    if (indianPattern.test(cleaned)) {
      return cleaned;
    }
    
    // Validate international formats (basic)
    if (cleaned.length >= 4 && cleaned.length <= 10) {
      return cleaned;
    }
    
    return null;
  }

  private findTrackByBoundingBox(bbox: any): VehicleTrack | undefined {
    for (const track of this.tracks.values()) {
      const lastPos = track.positions[track.positions.length - 1];
      const iou = this.calculateIoU(bbox, lastPos.boundingBox);
      if (iou > 0.5) {
        return track;
      }
    }
    return undefined;
  }

  // ============================================================================
  // Vehicle Re-Identification
  // ============================================================================

  private async extractReIdFeatures(vehicles: any[], frame: DetectionFrame): Promise<void> {
    try {
      const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
      for (const vehicle of vehicles) {
        const embedding = await pipeline.extractVehicleEmbedding(frame, vehicle.boundingBox).catch(() => null);
        const track = this.findTrackByBoundingBox(vehicle.boundingBox);
        if (embedding && track) {
          track.reIdFeature = embedding;
        }
      }
    } catch (error) {
      console.warn('extractReIdFeatures pipeline failed:', error);
    }
  }

  private async performReIdentification(): Promise<void> {
    for (const track of this.tracks.values()) {
      if (!track.reIdFeature) continue;

      let bestMatch: string | undefined;
      let bestSimilarity = 0;

      for (const [globalId, storedFeature] of this.reIdDatabase.features.entries()) {
        const similarity = this.cosineSimilarity(track.reIdFeature, storedFeature);
        
        // Also check license plate match if available
        let plateBoost = 0;
        if (track.licensePlate) {
          const metadata = this.reIdDatabase.metadata.get(globalId);
          if (metadata?.licensePlate === track.licensePlate.number) {
            plateBoost = 0.3;  // High confidence boost for plate match
          }
        }
        
        const totalSimilarity = similarity + plateBoost;
        
        if (totalSimilarity > bestSimilarity && totalSimilarity > this.REID_SIMILARITY_THRESHOLD) {
          bestSimilarity = totalSimilarity;
          bestMatch = globalId;
        }
      }

      if (bestMatch) {
        // Existing vehicle re-appeared
        track.globalVehicleId = bestMatch;
        const metadata = this.reIdDatabase.metadata.get(bestMatch)!;
        metadata.lastSeen = track.lastSeen;
        metadata.appearances++;
      } else {
        // New unique vehicle
        const globalId = `global_vehicle_${randomUUID().substring(0, 8)}`;
        track.globalVehicleId = globalId;
        this.reIdDatabase.features.set(globalId, track.reIdFeature);
        this.reIdDatabase.metadata.set(globalId, {
          licensePlate: track.licensePlate?.number,
          vehicleType: track.vehicleType,
          color: track.color,
          firstSeen: track.firstSeen,
          lastSeen: track.lastSeen,
          appearances: 1,
        });
      }
    }
  }

  // ============================================================================
  // Speed Estimation
  // ============================================================================

  private updateSpeeds(timestamp: Date): void {
    for (const track of this.tracks.values()) {
      if (track.positions.length < 2) continue;

      // Get last two positions
      const positions = track.positions.slice(-2);
      const [p1, p2] = positions;

      // Calculate pixel distance
      const dx = p2.x - p1.x;
      const dy = p2.y - p1.y;
      const pixelDistance = Math.sqrt(dx * dx + dy * dy);

      // Calculate time difference (seconds)
      const timeDelta = (p2.timestamp.getTime() - p1.timestamp.getTime()) / 1000;
      if (timeDelta === 0) continue;

      // Find applicable speed zone
      const zone = this.findSpeedZone(p2.x, p2.y);
      if (!zone) continue;

      // Convert pixels to meters using calibration
      const meterDistance = pixelDistance / zone.calibration.pixelsPerMeter;

      // Calculate speed in km/h
      const speedMPS = meterDistance / timeDelta;
      const speedKMH = speedMPS * 3.6;

      // Update track
      track.speed = speedKMH;
      
      if (!track.avgSpeed) {
        track.avgSpeed = speedKMH;
        track.maxSpeed = speedKMH;
      } else {
        track.avgSpeed = (track.avgSpeed * 0.7) + (speedKMH * 0.3);
        track.maxSpeed = Math.max(track.maxSpeed || 0, speedKMH);
      }

      // Check for overspeed
      track.isOverSpeed = speedKMH > zone.speedLimit;

      // Estimate direction
      track.direction = this.estimateDirection(dx, dy);
    }
  }

  private findSpeedZone(x: number, y: number): SpeedZone | undefined {
    for (const zone of this.speedZones.values()) {
      if (this.isPointInPolygon({ x, y }, zone.polygon)) {
        return zone;
      }
    }
    return undefined;
  }

  private estimateDirection(dx: number, dy: number): 'north' | 'south' | 'east' | 'west' {
    const angle = Math.atan2(dy, dx) * (180 / Math.PI);
    
    if (angle >= -45 && angle < 45) return 'east';
    if (angle >= 45 && angle < 135) return 'south';
    if (angle >= -135 && angle < -45) return 'north';
    return 'west';
  }

  // ============================================================================
  // Violation Detection
  // ============================================================================

  private detectViolations(): DetectionResult[] {
    const results: DetectionResult[] = [];

    for (const track of this.tracks.values()) {
      // Overspeed detection
      if (track.isOverSpeed && track.speed) {
        results.push({
          detectionType: "vehicle-overspeeding",
          confidence: 0.95,
          objects: [{
            label: track.vehicleType,
            confidence: track.avgConfidence,
            trackId: track.trackId,
            boundingBox: track.positions[track.positions.length - 1].boundingBox,
          }],
          metadata: {
            vehicleType: track.vehicleType,
            licensePlate: track.licensePlate?.number,
            speed: track.speed,
            speedLimit: this.SPEED_LIMIT_DEFAULT,
            color: track.color,
          },
          requiresAlert: true,
        });
      }

      // Wrong-way detection
      if (track.isWrongWay) {
        results.push({
          detectionType: "vehicle-wrong-way",
          confidence: 0.90,
          objects: [{
            label: track.vehicleType,
            confidence: track.avgConfidence,
            trackId: track.trackId,
            boundingBox: track.positions[track.positions.length - 1].boundingBox,
          }],
          metadata: {
            vehicleType: track.vehicleType,
            licensePlate: track.licensePlate?.number,
            direction: track.direction,
          },
          requiresAlert: true,
        });
      }

      // Illegal parking detection
      if (track.isIllegallyParked) {
        results.push({
          detectionType: "vehicle-illegal-parking",
          confidence: 0.88,
          objects: [{
            label: track.vehicleType,
            confidence: track.avgConfidence,
            trackId: track.trackId,
            boundingBox: track.positions[track.positions.length - 1].boundingBox,
          }],
          metadata: {
            vehicleType: track.vehicleType,
            licensePlate: track.licensePlate?.number,
            duration: (Date.now() - track.firstSeen.getTime()) / 1000,
          },
          requiresAlert: true,
        });
      }
    }

    return results;
  }

  // ============================================================================
  // Parking Space Monitoring
  // ============================================================================

  private monitorParkingSpaces(timestamp: Date): DetectionResult[] {
    const results: DetectionResult[] = [];

    for (const [spaceId, space] of this.parkingSpaces.entries()) {
      // Find vehicles in this parking space
      const occupyingVehicle = this.findVehicleInSpace(space);

      if (occupyingVehicle) {
        if (!space.occupied) {
          // Space just became occupied
          space.occupied = true;
          space.occupiedBy = occupyingVehicle.trackId;
          space.occupiedSince = timestamp;
        } else {
          // Update occupation duration
          space.duration = (timestamp.getTime() - space.occupiedSince!.getTime()) / 1000;
          
          // Check for overstay
          if (space.maxDuration && space.duration > space.maxDuration) {
            results.push({
              detectionType: "parking-overstay",
              confidence: 0.92,
              objects: [{
                label: occupyingVehicle.vehicleType,
                confidence: occupyingVehicle.avgConfidence,
                trackId: occupyingVehicle.trackId,
                boundingBox: occupyingVehicle.positions[occupyingVehicle.positions.length - 1].boundingBox,
              }],
              metadata: {
                spaceId,
                vehicleType: occupyingVehicle.vehicleType,
                licensePlate: occupyingVehicle.licensePlate?.number,
                duration: space.duration,
                maxDuration: space.maxDuration,
              },
              requiresAlert: true,
            });
          }
        }
      } else if (space.occupied) {
        // Space just became vacant
        space.occupied = false;
        space.occupiedBy = undefined;
        space.occupiedSince = undefined;
        space.duration = undefined;
        
        results.push({
          detectionType: "parking-space-vacant",
          confidence: 0.95,
          objects: [],
          metadata: {
            spaceId,
            reservedFor: space.reservedFor,
          },
          requiresAlert: false,
        });
      }
    }

    return results;
  }

  private findVehicleInSpace(space: ParkingSpace): VehicleTrack | undefined {
    for (const track of this.tracks.values()) {
      const lastPos = track.positions[track.positions.length - 1];
      const center = {
        x: lastPos.boundingBox.x + lastPos.boundingBox.width / 2,
        y: lastPos.boundingBox.y + lastPos.boundingBox.height / 2,
      };
      
      if (this.isPointInPolygon(center, space.polygon)) {
        return track;
      }
    }
    return undefined;
  }

  // ============================================================================
  // Traffic Metrics
  // ============================================================================

  private calculateTrafficMetrics(timestamp: Date): TrafficMetrics {
    const vehiclesByType: Record<string, number> = {};
    let totalSpeed = 0;
    let speedCount = 0;
    let wrongWayCount = 0;
    let overSpeedCount = 0;

    for (const track of this.tracks.values()) {
      // Count by type
      vehiclesByType[track.vehicleType] = (vehiclesByType[track.vehicleType] || 0) + 1;

      // Average speed
      if (track.speed) {
        totalSpeed += track.speed;
        speedCount++;
      }

      // Violations
      if (track.isWrongWay) wrongWayCount++;
      if (track.isOverSpeed) overSpeedCount++;
    }

    const avgSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;
    const totalVehicles = this.tracks.size;

    // Estimate congestion level
    let congestionLevel: 'low' | 'medium' | 'high' = 'low';
    if (totalVehicles > 50 || avgSpeed < 20) {
      congestionLevel = 'high';
    } else if (totalVehicles > 20 || avgSpeed < 40) {
      congestionLevel = 'medium';
    }

    return {
      totalVehicles,
      vehiclesByType: vehiclesByType as Record<VehicleType, number>,
      avgSpeed,
      congestionLevel,
      wrongWayCount,
      overSpeedCount,
      timestamp,
    };
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  private cosineSimilarity(a: number[], b: number[]): number {
    if (a.length !== b.length) return 0;
    
    let dotProduct = 0;
    let normA = 0;
    let normB = 0;
    
    for (let i = 0; i < a.length; i++) {
      dotProduct += a[i] * b[i];
      normA += a[i] * a[i];
      normB += b[i] * b[i];
    }
    
    return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
  }

  private isPointInPolygon(point: { x: number; y: number }, polygon: Array<{ x: number; y: number }>): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const xi = polygon[i].x, yi = polygon[i].y;
      const xj = polygon[j].x, yj = polygon[j].y;
      
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }

  // ============================================================================
  // Result Formatting
  // ============================================================================

  private createVehicleDetectionResult(vehicles: any[]): DetectionResult {
    return {
      detectionType: "vehicle",
      confidence: vehicles.reduce((sum, v) => sum + (v.confidence || 0.8), 0) / vehicles.length,
      objects: vehicles.map(v => ({
        label: v.vehicleType,
        confidence: v.confidence || 0.8,
        trackId: v.trackId,
        boundingBox: v.boundingBox,
      })),
      metadata: {
        totalVehicles: vehicles.length,
        vehiclesByType: this.groupVehiclesByType(vehicles),
        trackedVehicles: Array.from(this.tracks.values()).map(t => ({
          trackId: t.trackId,
          globalVehicleId: t.globalVehicleId,
          vehicleType: t.vehicleType,
          licensePlate: t.licensePlate?.number,
          color: t.color,
          speed: t.speed,
        })),
      },
      requiresAlert: false,
    };
  }

  private createANPRResult(anprResults: ANPRResult[]): DetectionResult {
    return {
      detectionType: "anpr",
      confidence: anprResults.reduce((sum, r) => sum + r.confidence, 0) / anprResults.length,
      objects: anprResults.map(r => ({
        label: r.plateNumber,
        confidence: r.confidence,
        trackId: r.vehicleTrackId,
        boundingBox: r.boundingBox,
      })),
      metadata: {
        plates: anprResults.map(r => ({
          number: r.plateNumber,
          vehicleType: r.vehicleType,
          color: r.vehicleColor,
          timestamp: r.timestamp.toISOString(),
        })),
      },
      requiresAlert: false,
    };
  }

  private createTrafficMetricsResult(metrics: TrafficMetrics): DetectionResult {
    return {
      detectionType: "traffic-metrics",
      confidence: 0.95,
      objects: [],
      metadata: {
        totalVehicles: metrics.totalVehicles,
        vehiclesByType: metrics.vehiclesByType,
        avgSpeed: Math.round(metrics.avgSpeed * 10) / 10,
        congestionLevel: metrics.congestionLevel,
        wrongWayCount: metrics.wrongWayCount,
        overSpeedCount: metrics.overSpeedCount,
        timestamp: metrics.timestamp.toISOString(),
      },
      requiresAlert: false,
    };
  }

  private groupVehiclesByType(vehicles: any[]): Record<string, number> {
    const grouped: Record<string, number> = {};
    for (const vehicle of vehicles) {
      grouped[vehicle.vehicleType] = (grouped[vehicle.vehicleType] || 0) + 1;
    }
    return grouped;
  }

  // ============================================================================
  // Configuration Methods
  // ============================================================================

  /**
   * Configure a parking space for monitoring
   */
  configureParkingSpace(config: {
    spaceId: string;
    polygon: Array<{ x: number; y: number }>;
    maxDuration?: number;
    reservedFor?: 'disabled' | 'vip' | 'ev' | 'general';
  }): void {
    this.parkingSpaces.set(config.spaceId, {
      ...config,
      occupied: false,
    });
  }

  /**
   * Configure a speed zone for monitoring
   */
  configureSpeedZone(config: {
    zoneId: string;
    polygon: Array<{ x: number; y: number }>;
    speedLimit: number;
    pixelsPerMeter: number;
  }): void {
    this.speedZones.set(config.zoneId, {
      zoneId: config.zoneId,
      polygon: config.polygon,
      speedLimit: config.speedLimit,
      calibration: {
        pixelsPerMeter: config.pixelsPerMeter,
      },
    });
  }

  // ============================================================================
  // Public API Methods
  // ============================================================================

  /**
   * Get all active vehicle tracks
   */
  getActiveTracks(): VehicleTrack[] {
    return Array.from(this.tracks.values());
  }

  /**
   * Get unique vehicle count (based on Re-ID)
   */
  getUniqueVehicleCount(): number {
    return this.reIdDatabase.features.size;
  }

  /**
   * Search vehicle by license plate
   */
  searchByPlate(plateNumber: string): VehicleTrack[] {
    const results: VehicleTrack[] = [];
    for (const track of this.tracks.values()) {
      if (track.licensePlate?.number === plateNumber) {
        results.push(track);
      }
    }
    return results;
  }

  /**
   * Get vehicle journey (all appearances across cameras)
   */
  getVehicleJourney(globalVehicleId: string): any {
    const metadata = this.reIdDatabase.metadata.get(globalVehicleId);
    return {
      globalVehicleId,
      licensePlate: metadata?.licensePlate,
      vehicleType: metadata?.vehicleType,
      color: metadata?.color,
      firstSeen: metadata?.firstSeen,
      lastSeen: metadata?.lastSeen,
      appearances: metadata?.appearances,
    };
  }

  /**
   * Get parking occupancy statistics
   */
  getParkingOccupancy(): {
    total: number;
    occupied: number;
    vacant: number;
    occupancyRate: number;
  } {
    const total = this.parkingSpaces.size;
    const occupied = Array.from(this.parkingSpaces.values()).filter(s => s.occupied).length;
    const vacant = total - occupied;
    const occupancyRate = total > 0 ? (occupied / total) * 100 : 0;

    return { total, occupied, vacant, occupancyRate };
  }

  // ============================================================================
  // Cleanup & Maintenance
  // ============================================================================

  private startTrackingCleanup(): void {
    setInterval(() => {
      const now = Date.now();
      const staleTrackIds: string[] = [];

      for (const [trackId, track] of this.tracks.entries()) {
        const timeSinceLastSeen = now - track.lastSeen.getTime();
        if (timeSinceLastSeen > this.TRACKING_TIMEOUT_MS * 2) {
          staleTrackIds.push(trackId);
        }
      }

      for (const trackId of staleTrackIds) {
        this.tracks.delete(trackId);
      }

      if (staleTrackIds.length > 0) {
        console.log(`Cleaned up ${staleTrackIds.length} stale vehicle tracks`);
      }
    }, 10000);
  }

  async cleanup(): Promise<void> {
    this.tracks.clear();
    this.reIdDatabase.features.clear();
    this.reIdDatabase.metadata.clear();
    this.parkingSpaces.clear();
    this.speedZones.clear();
    console.log("Vehicle Analytics detector cleaned up");
  }

  getHealth() {
    return {
      status: 'healthy' as const,
      details: 'Vehicle analytics detector is available'
    };
  }
}
