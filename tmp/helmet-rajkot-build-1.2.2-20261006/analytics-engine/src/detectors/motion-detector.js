/**
 * Motion Detection
 * First-stage trigger for AI analytics
 */
import { BaseDetector } from "./base-detector.js";
export class MotionDetector extends BaseDetector {
    previousFrame = null;
    previousTimestamp = null;
    config;
    constructor(config = {}) {
        super("motion", "1.0.0");
        this.config = {
            sensitivityThreshold: config.sensitivityThreshold ?? 0.02,
            minPixelChange: config.minPixelChange ?? 50,
            noiseFilter: config.noiseFilter ?? 10,
        };
    }
    async initialize() {
        // Motion detection doesn't require model loading
    }
    async detect(frame) {
        if (!this.previousFrame || !this.previousTimestamp) {
            this.previousFrame = frame.imageData;
            this.previousTimestamp = frame.timestamp;
            return [];
        }
        const timeDelta = frame.timestamp.getTime() - this.previousTimestamp.getTime();
        // Skip if frames are too close together (< 100ms)
        if (timeDelta < 100) {
            return [];
        }
        const motionPixels = this.detectMotion(this.previousFrame, frame.imageData, frame.width, frame.height);
        this.previousFrame = frame.imageData;
        this.previousTimestamp = frame.timestamp;
        const totalPixels = frame.width * frame.height;
        const motionRatio = motionPixels / totalPixels;
        if (motionPixels < this.config.minPixelChange ||
            motionRatio < this.config.sensitivityThreshold) {
            return [];
        }
        return [
            {
                detectionType: "motion",
                confidence: Math.min(0.99, motionRatio * 10), // Scale to confidence
                objects: [],
                metadata: {
                    motionPixels,
                    motionRatio,
                    timeDelta,
                },
                requiresAlert: false, // Motion alone should not alert
            },
        ];
    }
    detectMotion(prev, curr, width, height) {
        let changedPixels = 0;
        const pixelCount = Math.min(prev.length, curr.length) / 3; // RGB
        for (let i = 0; i < pixelCount * 3; i += 3) {
            const rDiff = Math.abs((prev[i] ?? 0) - (curr[i] ?? 0));
            const gDiff = Math.abs((prev[i + 1] ?? 0) - (curr[i + 1] ?? 0));
            const bDiff = Math.abs((prev[i + 2] ?? 0) - (curr[i + 2] ?? 0));
            const totalDiff = (rDiff + gDiff + bDiff) / 3;
            if (totalDiff > this.config.noiseFilter) {
                changedPixels++;
            }
        }
        return changedPixels;
    }
    async cleanup() {
        this.previousFrame = null;
        this.previousTimestamp = null;
    }
    getHealth() {
        return {
            status: "healthy",
            details: "Motion detector operational",
        };
    }
}
