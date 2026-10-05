/**
 * Queue Analysis
 * Monitors queue length, wait times, and service efficiency
 */
import { BaseDetector, isPointInPolygon } from "./base-detector.js";
export class QueueDetector extends BaseDetector {
    isModelLoaded = false;
    queues = [];
    personStates = new Map();
    serviceHistory = [];
    HISTORY_SIZE = 100;
    SERVICE_DISTANCE_THRESHOLD = 0.05;
    constructor() {
        super("queue", "1.0.0");
    }
    async initialize() {
        console.log("Initializing queue detector...");
        this.isModelLoaded = true;
        this.startStateCleanup();
        console.log("Queue detector initialized");
    }
    /**
     * Set queue zones
     */
    setQueues(queues) {
        this.queues = queues;
    }
    async detect(frame) {
        if (!this.isModelLoaded) {
            return [];
        }
        const persons = await this.detectPersonsInFrame(frame);
        const metrics = this.analyzeQueues(persons, frame.timestamp);
        const results = [];
        // Report queue metrics
        const problematicQueues = metrics.filter(m => {
            const queueConfig = this.queues.find(q => q.zoneId === m.zoneId);
            return m.isOverCapacity ||
                (queueConfig && m.estimatedWaitMinutes > queueConfig.targetWaitTimeSeconds / 60);
        });
        if (problematicQueues.length > 0) {
            results.push({
                detectionType: "queue",
                confidence: 0.90,
                objects: this.createQueueObjects(persons, problematicQueues),
                metadata: {
                    queues: problematicQueues.map(q => ({
                        zoneId: q.zoneId,
                        length: q.queueLength,
                        waitMinutes: q.estimatedWaitMinutes,
                        overCapacity: q.isOverCapacity,
                    })),
                },
                requiresAlert: true,
            });
        }
        // Always report metrics for analytics
        if (metrics.length > 0) {
            results.push({
                detectionType: "queue-metrics",
                confidence: 0.95,
                objects: [],
                metadata: {
                    queues: metrics,
                    timestamp: frame.timestamp.toISOString(),
                },
                requiresAlert: false,
            });
        }
        return results;
    }
    /**
     * Detect persons in frame
     */
    async detectPersonsInFrame(frame) {
        const { getInferenceObjects, hasInferenceObjects } = await import("./base-detector.js");
        const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
        try {
            const persons = await pipeline.detectObjects(frame, ['person']);
            if (persons && persons.length > 0)
                return persons;
        }
        catch (error) {
            if (!hasInferenceObjects(frame)) {
                throw error;
            }
        }
        if (hasInferenceObjects(frame)) {
            return getInferenceObjects(frame, ['person']);
        }
        return [];
    }
    /**
     * Analyze all queues
     */
    analyzeQueues(persons, timestamp) {
        return this.queues.map(queue => {
            // Find persons in queue zone
            const personsInQueue = persons.filter(person => {
                const center = {
                    x: person.boundingBox.x + person.boundingBox.width / 2,
                    y: person.boundingBox.y + person.boundingBox.height / 2,
                };
                return isPointInPolygon(center, queue.polygon);
            });
            // Update person states
            this.updatePersonStates(personsInQueue, queue.zoneId, timestamp);
            // Calculate service rate
            const serviceRate = this.calculateServiceRate(queue.zoneId);
            // Estimate wait time
            const estimatedWaitMinutes = personsInQueue.length > 0 && serviceRate > 0
                ? personsInQueue.length / serviceRate
                : 0;
            // Find longest wait
            const longestWait = this.findLongestWait(queue.zoneId, timestamp);
            return {
                zoneId: queue.zoneId,
                queueLength: personsInQueue.length,
                estimatedWaitMinutes,
                serviceRate,
                isOverCapacity: personsInQueue.length > queue.maxLength,
                longestWaitSeconds: longestWait,
                peakTime: this.isPeakTime(timestamp),
            };
        });
    }
    /**
     * Update person states in queue
     */
    updatePersonStates(persons, zoneId, timestamp) {
        for (const person of persons) {
            if (!this.personStates.has(person.trackId)) {
                // New person in queue
                this.personStates.set(person.trackId, {
                    zoneId,
                    enteredAt: timestamp,
                    position: {
                        x: person.boundingBox.x,
                        y: person.boundingBox.y,
                    },
                    isBeingServed: false,
                });
            }
            else {
                // Update existing person
                const state = this.personStates.get(person.trackId);
                state.position = {
                    x: person.boundingBox.x,
                    y: person.boundingBox.y,
                };
            }
        }
    }
    /**
     * Calculate service rate (persons per minute)
     */
    calculateServiceRate(zoneId) {
        const recentServices = this.serviceHistory
            .filter(s => s.zoneId === zoneId)
            .slice(-20); // Last 20 services
        if (recentServices.length < 2)
            return 0;
        const totalDuration = recentServices.reduce((sum, s) => sum + s.duration, 0);
        const avgDuration = totalDuration / recentServices.length;
        return avgDuration > 0 ? 60 / avgDuration : 0; // Convert to per minute
    }
    /**
     * Find longest wait time in zone
     */
    findLongestWait(zoneId, currentTime) {
        let longest = 0;
        for (const [_, state] of this.personStates) {
            if (state.zoneId === zoneId) {
                const waitSeconds = (currentTime.getTime() - state.enteredAt.getTime()) / 1000;
                if (waitSeconds > longest)
                    longest = waitSeconds;
            }
        }
        return longest;
    }
    /**
     * Check if current time is peak time
     */
    isPeakTime(timestamp) {
        const hour = timestamp.getHours();
        // Define peak hours (adjust based on business)
        return (hour >= 9 && hour < 11) || (hour >= 13 && hour < 15);
    }
    /**
     * Create object representations
     */
    createQueueObjects(persons, queues) {
        const queueIds = new Set(queues.map(q => q.zoneId));
        return persons
            .filter(p => {
            const state = this.personStates.get(p.trackId);
            return state && queueIds.has(state.zoneId);
        })
            .slice(0, 50)
            .map(person => ({
            label: "person",
            confidence: person.confidence || 0.85,
            trackId: person.trackId,
            boundingBox: person.boundingBox,
        }));
    }
    /**
     * Clean up old person states
     */
    startStateCleanup() {
        setInterval(() => {
            const now = new Date();
            const timeout = 60000; // 1 minute
            for (const [trackId, state] of this.personStates.entries()) {
                if (now.getTime() - state.enteredAt.getTime() > timeout) {
                    this.personStates.delete(trackId);
                }
            }
            // Clean up old service history
            if (this.serviceHistory.length > this.HISTORY_SIZE) {
                this.serviceHistory = this.serviceHistory.slice(-this.HISTORY_SIZE);
            }
        }, 30000); // Every 30 seconds
    }
    async cleanup() {
        this.isModelLoaded = false;
        this.queues = [];
        this.personStates.clear();
        this.serviceHistory = [];
        console.log("Queue detector cleaned up");
    }
    getHealth() {
        return {
            status: this.isModelLoaded ? "healthy" : "unhealthy",
            details: `Monitoring ${this.queues.length} queues, ${this.personStates.size} persons tracked`,
        };
    }
}
