/**
 * Vehicle Analytics Service
 * Main orchestrator that coordinates tracking, ANPR, persistence, and alerting
 */
import { VehicleTracker } from './tracking/vehicle-tracker.js';
import { DominantColorClassifier, resolveVehicleColor } from './color/vehicle-color-classifier.js';
import { YoloPlateDetector } from './detection/license-plate-detector.js';
import { BasicPlateRectifier } from './anpr/plate-rectifier.js';
import { PaddlePlateRecognizer } from './anpr/paddle-ocr-adapter.js';
import { PlateNormalizer } from './anpr/plate-normalizer.js';
import { PlateConsensus, isReliableConsensus } from './anpr/plate-consensus.js';
import { DefaultVehicleEventFactory } from './persistence/vehicle-event.model.js';
export class VehicleAnalyticsService {
    config;
    eventRepository;
    journeyService;
    watchlistService;
    tracker;
    colorClassifier;
    plateDetector;
    plateRectifier;
    plateRecognizer;
    plateNormalizer;
    plateConsensus;
    eventFactory;
    ocrBudget = new Map(); // second -> count
    lastCleanup = Date.now();
    constructor(config, eventRepository, journeyService, watchlistService, ocrServiceUrl) {
        this.config = config;
        this.eventRepository = eventRepository;
        this.journeyService = journeyService;
        this.watchlistService = watchlistService;
        this.tracker = new VehicleTracker(config.cameraId, {
            maxAge: Math.floor(config.trackTimeout / 1000 * 30), // Convert to frames (~30 fps)
            minHits: 3,
            iouThreshold: 0.3,
            reIdWeight: 0.4,
            maxDistance: 0.5,
        });
        this.colorClassifier = new DominantColorClassifier();
        this.plateDetector = new YoloPlateDetector(config.minPlateConfidence, config.minPlateWidth, 12);
        this.plateRectifier = new BasicPlateRectifier();
        // Do not manufacture plate text when the OCR service is not configured.
        this.plateRecognizer = ocrServiceUrl
            ? new PaddlePlateRecognizer(ocrServiceUrl)
            : { recognize: async () => [] };
        this.plateNormalizer = new PlateNormalizer();
        this.plateConsensus = new PlateConsensus(2, 0.7, 2);
        this.eventFactory = new DefaultVehicleEventFactory();
    }
    /**
     * Process a frame with vehicle detections
     */
    async processFrame(detections, timestamp, frameData) {
        const metrics = {
            vehiclesDetected: detections.length,
            platesRecognized: 0,
            ocrAttempts: 0,
            finalizedTracks: 0,
        };
        // Step 1: Update tracking
        const tracks = this.tracker.update(detections, timestamp);
        // Step 2: Process each active track
        for (const track of tracks) {
            if (track.finalized)
                continue;
            const lastPosition = track.positions[track.positions.length - 1];
            // Get vehicle crop if frame data available
            if (!frameData)
                continue;
            const vehicleCrop = this.extractCrop(frameData, lastPosition.boundingBox);
            if (!vehicleCrop)
                continue;
            // Step 3: Color classification
            if (this.config.enableColorClassification) {
                await this.classifyColor(track, vehicleCrop, timestamp);
            }
            // Step 4: ANPR pipeline
            if (this.config.enableAnpr && this.shouldAttemptAnpr(track, timestamp)) {
                await this.performAnpr(track, vehicleCrop, timestamp);
                metrics.ocrAttempts++;
                if (track.plateObservations.length > 0) {
                    metrics.platesRecognized++;
                }
            }
        }
        // Step 5: Finalize tracks and persist
        const vehicleEvents = [];
        const watchlistMatches = [];
        for (const track of tracks) {
            if (track.finalized && !this.isTrackPersisted(track)) {
                const event = await this.finalizeAndPersist(track, timestamp);
                if (event) {
                    vehicleEvents.push(event);
                    metrics.finalizedTracks++;
                    // Check watchlist
                    if (this.config.enableWatchlist && event.normalizedPlate) {
                        const match = await this.watchlistService.check(event);
                        if (match) {
                            const alert = this.watchlistService.createAlert(match);
                            watchlistMatches.push(alert);
                        }
                    }
                }
                this.markTrackPersisted(track);
            }
        }
        // Step 6: Cleanup
        this.cleanupIfNeeded(timestamp);
        return {
            vehicleEvents,
            watchlistMatches,
            activeTracks: this.tracker.getActiveTracks().length,
            metrics,
        };
    }
    /**
     * Classify vehicle color
     */
    async classifyColor(track, vehicleCrop, timestamp) {
        try {
            const colorResult = await this.colorClassifier.classify(vehicleCrop);
            track.colorObservations.push({
                color: colorResult.color,
                confidence: colorResult.confidence,
                timestamp,
            });
        }
        catch (error) {
            console.warn('Color classification failed:', error);
        }
    }
    /**
     * Perform ANPR pipeline
     */
    async performAnpr(track, vehicleCrop, timestamp) {
        try {
            // Step 1: Detect plate
            const plateDetections = await this.plateDetector.detect(vehicleCrop);
            if (plateDetections.length === 0)
                return;
            // Use best quality plate
            const bestPlate = plateDetections[0];
            // Quality gate
            if (bestPlate.quality < this.config.minBlurScore) {
                return;
            }
            // Step 2: Extract plate crop
            const plateCrop = this.extractCrop(vehicleCrop, bestPlate.boundingBox);
            if (!plateCrop)
                return;
            // Step 3: Rectify plate
            const rectified = await this.plateRectifier.rectify(plateCrop);
            if (rectified.quality < 0.3)
                return;
            // Step 4: OCR
            const recognitions = await this.plateRecognizer.recognize(rectified.image);
            if (recognitions.length === 0)
                return;
            const bestRecognition = recognitions[0];
            if (bestRecognition.confidence < this.config.minOcrConfidence)
                return;
            // Step 5: Normalize
            const normalized = this.plateNormalizer.normalize(bestRecognition.text, this.config.countryCode);
            // Step 6: Add observation
            track.plateObservations.push({
                rawText: bestRecognition.text,
                normalizedText: normalized.text,
                ocrConfidence: bestRecognition.confidence,
                detectionConfidence: bestPlate.confidence,
                cropQuality: rectified.quality,
                timestamp,
            });
            // Increment OCR budget
            this.incrementOcrBudget(timestamp);
        }
        catch (error) {
            console.warn('ANPR pipeline failed:', error);
        }
    }
    /**
     * Finalize track and persist as vehicle event
     */
    async finalizeAndPersist(track, timestamp) {
        try {
            // Resolve plate consensus
            const plate = track.plateObservations.length > 0
                ? this.plateConsensus.resolve(track.plateObservations)
                : null;
            // Resolve color consensus
            const color = track.colorObservations.length > 0
                ? resolveVehicleColor(track.colorObservations)
                : null;
            // Create event
            const event = this.eventFactory.create({
                track,
                plate: plate || undefined,
                color: color || undefined,
                context: {
                    tenantId: this.config.tenantId,
                    siteId: this.config.siteId,
                    cameraId: this.config.cameraId,
                },
            });
            // Persist
            await this.eventRepository.save(event);
            return event;
        }
        catch (error) {
            console.error('Failed to finalize and persist track:', error);
            return null;
        }
    }
    /**
     * Check if track should attempt ANPR
     */
    shouldAttemptAnpr(track, timestamp) {
        // Already have reliable plate
        if (track.plateObservations.length >= 5) {
            const consensus = this.plateConsensus.resolve(track.plateObservations);
            if (consensus && isReliableConsensus(consensus)) {
                return false;
            }
        }
        // Check OCR budget
        const currentSecond = Math.floor(timestamp.getTime() / 1000);
        const used = this.ocrBudget.get(currentSecond) || 0;
        if (used >= this.config.maxOcrPerSecond) {
            return false;
        }
        // Check track quality
        const lastPosition = track.positions[track.positions.length - 1];
        if (!lastPosition || lastPosition.confidence < this.config.minVehicleConfidence) {
            return false;
        }
        return true;
    }
    /**
     * Extract crop from image
     */
    extractCrop(frame, bbox) {
        // Simplified crop extraction
        // In production, properly handle image buffer format
        return {
            data: new Uint8Array(100),
            width: Math.floor(bbox.width),
            height: Math.floor(bbox.height),
            channels: 3,
        };
    }
    /**
     * Increment OCR budget counter
     */
    incrementOcrBudget(timestamp) {
        const second = Math.floor(timestamp.getTime() / 1000);
        this.ocrBudget.set(second, (this.ocrBudget.get(second) || 0) + 1);
    }
    /**
     * Check if track has been persisted
     */
    isTrackPersisted(track) {
        return track.__persisted === true;
    }
    /**
     * Mark track as persisted
     */
    markTrackPersisted(track) {
        track.__persisted = true;
    }
    /**
     * Periodic cleanup
     */
    cleanupIfNeeded(timestamp) {
        const now = timestamp.getTime();
        // Cleanup every 10 seconds
        if (now - this.lastCleanup < 10000)
            return;
        // Clean old tracks
        const cutoff = new Date(now - this.config.trackTimeout * 2);
        this.tracker.cleanup(cutoff);
        // Clean OCR budget (keep last 10 seconds)
        const currentSecond = Math.floor(now / 1000);
        for (const second of this.ocrBudget.keys()) {
            if (second < currentSecond - 10) {
                this.ocrBudget.delete(second);
            }
        }
        this.lastCleanup = now;
    }
    /**
     * Get active tracks
     */
    getActiveTracks() {
        return this.tracker.getActiveTracks();
    }
    /**
     * Get statistics
     */
    getStats() {
        return {
            activeTracks: this.tracker.getActiveTracks().length,
            ocrBudgetUsed: Array.from(this.ocrBudget.values()).reduce((a, b) => a + b, 0),
            ocrBudgetLimit: this.config.maxOcrPerSecond,
        };
    }
}
