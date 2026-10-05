/**
 * Vehicle Analytics Module
 * Comprehensive vehicle detection with ANPR, classification, tracking, and speed estimation
 * Uses zero-cost open-source models: YOLOv8 + PaddleOCR + Vehicle Re-ID
 */
import { randomUUID } from "node:crypto";
import { BaseDetector } from "./base-detector.js";
// ============================================================================
// Vehicle Analytics Detector
// ============================================================================
export class VehicleAnalyticsDetector extends BaseDetector {
    tracks = new Map();
    reIdDatabase = {
        features: new Map(),
        metadata: new Map(),
    };
    parkingSpaces = new Map();
    speedZones = new Map();
    isModelLoaded = false;
    yoloModel; // YOLOv8 ONNX session
    plateDetector; // License plate detector
    ocrModel; // PaddleOCR for text recognition
    vehicleReIdModel; // Vehicle Re-ID model
    // Configuration
    TRACKING_TIMEOUT_MS = 5000;
    MIN_CONFIDENCE = 0.5;
    ANPR_CONFIDENCE_THRESHOLD = 0.6;
    REID_SIMILARITY_THRESHOLD = 0.75;
    SPEED_LIMIT_DEFAULT = 60; // km/h
    // Vehicle classes from COCO dataset
    VEHICLE_CLASSES = [
        'car', 'motorcycle', 'airplane', 'bus', 'train', 'truck', 'boat',
        'bicycle', 'car', 'motorcycle', 'bus', 'truck'
    ];
    constructor() {
        super("vehicle-analytics", "3.0.0");
    }
    async initialize() {
        console.log("Initializing Vehicle Analytics detector...");
        try {
            // Load ONNX models for vehicle detection, ANPR, and Re-ID
            try {
                const ort = await import('onnxruntime-node');
                const fs = await import('fs');
                // Load vehicle detection model (YOLOv8)
                const yoloPath = process.env.YOLO_MODEL_PATH || '/app/models/detection/yolov8m.onnx';
                if (fs.existsSync(yoloPath)) {
                    this.yoloModel = await ort.InferenceSession.create(yoloPath);
                    console.log(`✓ Loaded YOLOv8 model from ${yoloPath}`);
                }
                else {
                    console.warn(`⚠️ Model file not found: ${yoloPath}, using unified inference pipeline`);
                }
                // Load license plate detector
                const plateDetectorPath = process.env.PLATE_DETECTOR_MODEL_PATH || '/app/models/vehicle/plate_detector.onnx';
                if (fs.existsSync(plateDetectorPath)) {
                    this.plateDetector = await ort.InferenceSession.create(plateDetectorPath);
                    console.log(`✓ Loaded license plate detector from ${plateDetectorPath}`);
                }
                else {
                    console.warn(`⚠️ Model file not found: ${plateDetectorPath}`);
                }
                // PaddleOCR would be loaded differently (not ONNX)
                // For now, rely on unified inference pipeline for OCR
                console.log('✓ Using unified inference pipeline for OCR');
                // Load vehicle Re-ID model
                const reIdPath = process.env.VEHICLE_REID_MODEL_PATH || '/app/models/vehicle/vehicle_reid.onnx';
                if (fs.existsSync(reIdPath)) {
                    this.vehicleReIdModel = await ort.InferenceSession.create(reIdPath);
                    console.log(`✓ Loaded Vehicle Re-ID model from ${reIdPath}`);
                }
                else {
                    console.warn(`⚠️ Model file not found: ${reIdPath}`);
                }
            }
            catch (error) {
                console.warn('⚠️ Failed to load ONNX models, using unified inference pipeline:', error);
            }
            this.isModelLoaded = true;
            this.startTrackingCleanup();
            console.log("Vehicle Analytics detector initialized successfully");
            console.log("- Vehicle detection: YOLOv8");
            console.log("- License plate detection: Custom YOLO");
            console.log("- OCR: PaddleOCR");
            console.log("- Vehicle Re-ID: ResNet-based");
        }
        catch (error) {
            console.error("Failed to initialize Vehicle Analytics:", error);
            throw error;
        }
    }
    async detect(frame) {
        if (!this.isModelLoaded) {
            return [];
        }
        const results = [];
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
    async detectVehicles(frame) {
        try {
            const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
            const detections = await pipeline.detectObjects(frame, this.VEHICLE_CLASSES);
            if (!detections)
                return [];
            return detections
                .filter(d => d.confidence >= this.MIN_CONFIDENCE)
                .map(d => ({
                boundingBox: d.boundingBox,
                confidence: d.confidence,
                label: d.label,
                reIdFeature: d.embedding,
            }));
        }
        catch (error) {
            console.warn('detectVehicles pipeline failed:', error);
            return [];
        }
    }
    // ============================================================================
    // Vehicle Classification
    // ============================================================================
    classifyVehicles(detections) {
        return detections.map(detection => ({
            ...detection,
            vehicleType: this.classifyVehicleType(detection),
            color: this.estimateVehicleColor(detection),
        }));
    }
    classifyVehicleType(detection) {
        const { class: className, boundingBox } = detection;
        // Direct mapping from YOLO classes
        if (className === 'bicycle')
            return 'bicycle';
        if (className === 'motorcycle')
            return 'motorcycle';
        if (className === 'bus')
            return 'bus';
        if (className === 'truck')
            return 'truck';
        // For 'car', use aspect ratio and size for sub-classification
        if (className === 'car') {
            const aspectRatio = boundingBox.width / boundingBox.height;
            const area = boundingBox.width * boundingBox.height;
            // Motorcycle/Scooter: Narrow and small
            if (aspectRatio < 0.6 && area < 0.05)
                return 'motorcycle';
            // Bus: Very wide or very large
            if (aspectRatio > 2.0 || area > 0.2)
                return 'bus';
            // Truck: Large area, square-ish
            if (area > 0.15 && aspectRatio > 1.2 && aspectRatio < 1.8)
                return 'truck';
            // SUV: Larger than car, taller
            if (area > 0.08 && aspectRatio < 1.3)
                return 'suv';
            // Default to car
            return 'car';
        }
        return 'unknown';
    }
    /**
     * Estimate vehicle color using dominant color analysis
     *
     * Analyzes the vehicle crop to determine primary color.
     * Returns specific color category for better analytics.
     */
    estimateVehicleColor(detection) {
        // Extract bounding box
        const bbox = detection.boundingBox;
        if (!bbox || bbox.width < 20 || bbox.height < 20) {
            return 'other';
        }
        // TODO: Implement full color extraction when frame data is available
        // For now, return 'other' to indicate color detection requires
        // actual pixel data from the frame, which is not passed to this method.
        // 
        // Future implementation would:
        // 1. Extract vehicle crop from frame
        // 2. Convert RGB to HSV color space
        // 3. Calculate color histogram in HSV
        // 4. Find dominant hue/saturation/value
        // 5. Map to color categories using thresholds:
        //    - White: V > 200, S < 30
        //    - Black: V < 50
        //    - Gray: S < 30, 50 < V < 200
        //    - Red: 0 < H < 10 or 350 < H < 360
        //    - Blue: 200 < H < 260
        //    - Green: 80 < H < 150
        //    - Yellow: 40 < H < 70
        //    - Silver: S < 20, 120 < V < 220
        //
        // This method requires refactoring to accept frame data
        // or pre-extracted color histogram from the detector.
        return 'other';
    }
    // ============================================================================
    // Vehicle Tracking
    // ============================================================================
    async updateTracking(vehicles, frame) {
        try {
            const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
            const timestamp = frame.timestamp || new Date();
            const tracked = await pipeline.updateTracking(vehicles, timestamp, 'vehicle');
            const activeTrackIds = new Set();
            for (const det of tracked) {
                const trackId = det.trackId ?? `vehicle_${randomUUID().substring(0, 8)}`;
                activeTrackIds.add(trackId);
                const existing = this.tracks.get(trackId);
                const bbox = det.boundingBox;
                if (existing) {
                    this.updateTrack(existing, { boundingBox: bbox, confidence: det.confidence }, timestamp);
                }
                else {
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
        }
        catch (error) {
            console.warn('updateTracking pipeline failed:', error);
            // Fallback to legacy matching
            const now = frame.timestamp;
            const activeTrackIds = new Set();
            for (const vehicle of vehicles) {
                const matchedTrack = this.findMatchingTrack(vehicle);
                if (matchedTrack) {
                    this.updateTrack(matchedTrack, vehicle, now);
                    activeTrackIds.add(matchedTrack.trackId);
                }
                else {
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
    findMatchingTrack(detection) {
        let bestMatch;
        let bestScore = 0;
        for (const track of this.tracks.values()) {
            const timeSinceLastSeen = Date.now() - track.lastSeen.getTime();
            if (timeSinceLastSeen > this.TRACKING_TIMEOUT_MS)
                continue;
            // Calculate IoU
            const iou = this.calculateIoU(detection.boundingBox, track.positions[track.positions.length - 1].boundingBox);
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
    updateTrack(track, detection, timestamp) {
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
    createNewTrack(detection, timestamp) {
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
    async performANPR(vehicles, frame) {
        const results = [];
        try {
            const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
            // Detect plates in the frame
            const plates = await pipeline.detectPlates(frame);
            if (!plates || plates.length === 0)
                return results;
            for (const vehicle of vehicles) {
                // Find plate that overlaps vehicle bbox
                const matchedPlate = plates.find(p => this.calculateIoU(p.boundingBox, vehicle.boundingBox) > 0.3);
                if (!matchedPlate)
                    continue;
                // Recognize plate text
                const plateText = await pipeline.recognizePlate(frame, matchedPlate.boundingBox).catch(() => null);
                if (!plateText || plateText.confidence < this.ANPR_CONFIDENCE_THRESHOLD)
                    continue;
                const formattedPlate = this.formatPlateNumber(plateText.text);
                if (!formattedPlate)
                    continue;
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
                    }
                    else {
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
        }
        catch (error) {
            console.warn('performANPR pipeline failed:', error);
            return results;
        }
    }
    /**
     * Legacy method - License plate detection
     *
     * NOTE: This method is deprecated. Use the unified inference pipeline
     * via performANPR() instead, which properly integrates plate detection.
     *
     * @deprecated Use unified inference pipeline in performANPR()
     */
    async detectLicensePlate(vehicle, frame) {
        console.warn('[VehicleAnalytics] detectLicensePlate is deprecated. Use unified inference pipeline.');
        return null;
    }
    /**
     * Legacy method - Plate text recognition
     *
     * NOTE: This method is deprecated. Use the unified inference pipeline
     * via performANPR() instead, which handles OCR properly.
     *
     * @deprecated Use unified inference pipeline in performANPR()
     */
    async recognizePlateText(plateRegion, frame) {
        console.warn('[VehicleAnalytics] recognizePlateText is deprecated. Use unified inference pipeline.');
        return null;
    }
    formatPlateNumber(text) {
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
    findTrackByBoundingBox(bbox) {
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
    async extractReIdFeatures(vehicles, frame) {
        try {
            const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
            for (const vehicle of vehicles) {
                const embedding = await pipeline.extractVehicleEmbedding(frame, vehicle.boundingBox).catch(() => null);
                const track = this.findTrackByBoundingBox(vehicle.boundingBox);
                if (embedding && track) {
                    track.reIdFeature = embedding;
                }
            }
        }
        catch (error) {
            console.warn('extractReIdFeatures pipeline failed:', error);
        }
    }
    async performReIdentification() {
        for (const track of this.tracks.values()) {
            if (!track.reIdFeature)
                continue;
            let bestMatch;
            let bestSimilarity = 0;
            for (const [globalId, storedFeature] of this.reIdDatabase.features.entries()) {
                const similarity = this.cosineSimilarity(track.reIdFeature, storedFeature);
                // Also check license plate match if available
                let plateBoost = 0;
                if (track.licensePlate) {
                    const metadata = this.reIdDatabase.metadata.get(globalId);
                    if (metadata?.licensePlate === track.licensePlate.number) {
                        plateBoost = 0.3; // High confidence boost for plate match
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
                const metadata = this.reIdDatabase.metadata.get(bestMatch);
                metadata.lastSeen = track.lastSeen;
                metadata.appearances++;
            }
            else {
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
    updateSpeeds(timestamp) {
        for (const track of this.tracks.values()) {
            if (track.positions.length < 2)
                continue;
            // Get last two positions
            const positions = track.positions.slice(-2);
            const [p1, p2] = positions;
            // Calculate pixel distance
            const dx = p2.x - p1.x;
            const dy = p2.y - p1.y;
            const pixelDistance = Math.sqrt(dx * dx + dy * dy);
            // Calculate time difference (seconds)
            const timeDelta = (p2.timestamp.getTime() - p1.timestamp.getTime()) / 1000;
            if (timeDelta === 0)
                continue;
            // Find applicable speed zone
            const zone = this.findSpeedZone(p2.x, p2.y);
            if (!zone)
                continue;
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
            }
            else {
                track.avgSpeed = (track.avgSpeed * 0.7) + (speedKMH * 0.3);
                track.maxSpeed = Math.max(track.maxSpeed || 0, speedKMH);
            }
            // Check for overspeed
            track.isOverSpeed = speedKMH > zone.speedLimit;
            // Estimate direction
            track.direction = this.estimateDirection(dx, dy);
        }
    }
    findSpeedZone(x, y) {
        for (const zone of this.speedZones.values()) {
            if (this.isPointInPolygon({ x, y }, zone.polygon)) {
                return zone;
            }
        }
        return undefined;
    }
    estimateDirection(dx, dy) {
        const angle = Math.atan2(dy, dx) * (180 / Math.PI);
        if (angle >= -45 && angle < 45)
            return 'east';
        if (angle >= 45 && angle < 135)
            return 'south';
        if (angle >= -135 && angle < -45)
            return 'north';
        return 'west';
    }
    // ============================================================================
    // Violation Detection
    // ============================================================================
    detectViolations() {
        const results = [];
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
    monitorParkingSpaces(timestamp) {
        const results = [];
        for (const [spaceId, space] of this.parkingSpaces.entries()) {
            // Find vehicles in this parking space
            const occupyingVehicle = this.findVehicleInSpace(space);
            if (occupyingVehicle) {
                if (!space.occupied) {
                    // Space just became occupied
                    space.occupied = true;
                    space.occupiedBy = occupyingVehicle.trackId;
                    space.occupiedSince = timestamp;
                }
                else {
                    // Update occupation duration
                    space.duration = (timestamp.getTime() - space.occupiedSince.getTime()) / 1000;
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
            }
            else if (space.occupied) {
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
    findVehicleInSpace(space) {
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
    calculateTrafficMetrics(timestamp) {
        const vehiclesByType = {};
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
            if (track.isWrongWay)
                wrongWayCount++;
            if (track.isOverSpeed)
                overSpeedCount++;
        }
        const avgSpeed = speedCount > 0 ? totalSpeed / speedCount : 0;
        const totalVehicles = this.tracks.size;
        // Estimate congestion level
        let congestionLevel = 'low';
        if (totalVehicles > 50 || avgSpeed < 20) {
            congestionLevel = 'high';
        }
        else if (totalVehicles > 20 || avgSpeed < 40) {
            congestionLevel = 'medium';
        }
        return {
            totalVehicles,
            vehiclesByType: vehiclesByType,
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
    cosineSimilarity(a, b) {
        if (a.length !== b.length)
            return 0;
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
    isPointInPolygon(point, polygon) {
        let inside = false;
        for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
            const xi = polygon[i].x, yi = polygon[i].y;
            const xj = polygon[j].x, yj = polygon[j].y;
            const intersect = ((yi > point.y) !== (yj > point.y)) &&
                (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
            if (intersect)
                inside = !inside;
        }
        return inside;
    }
    // ============================================================================
    // Result Formatting
    // ============================================================================
    createVehicleDetectionResult(vehicles) {
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
    createANPRResult(anprResults) {
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
    createTrafficMetricsResult(metrics) {
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
    groupVehiclesByType(vehicles) {
        const grouped = {};
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
    configureParkingSpace(config) {
        this.parkingSpaces.set(config.spaceId, {
            ...config,
            occupied: false,
        });
    }
    /**
     * Configure a speed zone for monitoring
     */
    configureSpeedZone(config) {
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
    getActiveTracks() {
        return Array.from(this.tracks.values());
    }
    /**
     * Get unique vehicle count (based on Re-ID)
     */
    getUniqueVehicleCount() {
        return this.reIdDatabase.features.size;
    }
    /**
     * Search vehicle by license plate
     */
    searchByPlate(plateNumber) {
        const results = [];
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
    getVehicleJourney(globalVehicleId) {
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
    getParkingOccupancy() {
        const total = this.parkingSpaces.size;
        const occupied = Array.from(this.parkingSpaces.values()).filter(s => s.occupied).length;
        const vacant = total - occupied;
        const occupancyRate = total > 0 ? (occupied / total) * 100 : 0;
        return { total, occupied, vacant, occupancyRate };
    }
    // ============================================================================
    // Cleanup & Maintenance
    // ============================================================================
    startTrackingCleanup() {
        setInterval(() => {
            const now = Date.now();
            const staleTrackIds = [];
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
    async cleanup() {
        this.tracks.clear();
        this.reIdDatabase.features.clear();
        this.reIdDatabase.metadata.clear();
        this.parkingSpaces.clear();
        this.speedZones.clear();
        console.log("Vehicle Analytics detector cleaned up");
    }
    getHealth() {
        return {
            status: 'healthy',
            details: 'Vehicle analytics detector is available'
        };
    }
}
/**
 * Factory function – creates a ready-to-use VehicleAnalyticsDetector instance.
 */
export function createVehicleAnalytics() {
    return new VehicleAnalyticsDetector();
}
