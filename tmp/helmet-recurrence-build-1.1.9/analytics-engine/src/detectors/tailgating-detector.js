/**
 * Tailgating Detection
 * Detects unauthorized following through secure entry points
 */
import { randomUUID } from "node:crypto";
import { BaseDetector, isPointInPolygon } from "./base-detector.js";
export class TailgatingDetector extends BaseDetector {
    isModelLoaded = false;
    entryZones = [];
    entryEvents = [];
    cleanupTimer = null;
    DEFAULT_MAX_TIME_GAP_MS = 2000; // 2 seconds
    DEFAULT_MIN_DISTANCE = 0.05; // 5% of frame width
    constructor() {
        super("tailgating", "1.0.0");
    }
    async initialize() {
        console.log("Initializing tailgating detector...");
        this.isModelLoaded = true;
        this.startEventCleanup();
        console.log("Tailgating detector initialized");
    }
    /**
     * Set entry zones for monitoring
     */
    setEntryZones(zones) {
        this.entryZones = zones;
    }
    /**
     * Record authorized badge swipe to clear entry or allow next person
     */
    recordAuthorizedBadge(zoneId, badgeId, timestamp = new Date(), trackId) {
        this.entryEvents.push({
            trackId: trackId || `badge-user-${badgeId}`,
            zoneId,
            timestamp,
            isAuthorized: true,
        });
    }
    async detect(frame) {
        if (!this.isModelLoaded) {
            return [];
        }
        // Detect persons and track entries
        const persons = await this.detectPersonsInFrame(frame);
        const tailgatingEvents = this.detectTailgating(persons, frame.timestamp);
        const results = [];
        if (tailgatingEvents.length > 0) {
            const suspicious = tailgatingEvents.filter(e => e.isSuspicious);
            results.push({
                detectionType: "tailgating",
                confidence: this.calculateAverageConfidence(suspicious),
                objects: suspicious.map(event => {
                    const matchedPerson = persons.find(p => p.trackId === event.tailgaterTrackId);
                    return {
                        label: "tailgater",
                        confidence: event.confidence,
                        trackId: event.tailgaterTrackId,
                        boundingBox: matchedPerson?.boundingBox || { x: 0, y: 0, width: 0.1, height: 0.1 },
                    };
                }),
                metadata: {
                    eventCount: suspicious.length,
                    zones: suspicious.map(e => e.entryZone),
                    timeGaps: suspicious.map(e => e.timeDifferenceMs),
                    distances: suspicious.map(e => e.distance),
                },
                requiresAlert: true,
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
     * Detect tailgating events
     */
    detectTailgating(persons, timestamp) {
        const events = [];
        for (const zone of this.entryZones) {
            // Find persons entering this zone
            const personsInZone = persons.filter(person => {
                const center = {
                    x: person.boundingBox.x + person.boundingBox.width / 2,
                    y: person.boundingBox.y + person.boundingBox.height / 2,
                };
                return isPointInPolygon(center, zone.polygon);
            });
            // Check for new entries
            for (const person of personsInZone) {
                if (!this.hasEntryRecord(person.trackId, zone.zoneId)) {
                    // Check for recent authorized entries
                    const recentAuth = this.findRecentAuthorizedEntry(zone.zoneId, timestamp, zone.maxTimeGapMs);
                    if (recentAuth) {
                        // Potential tailgating following an authorized entry
                        const timeGap = timestamp.getTime() - recentAuth.timestamp.getTime();
                        // Calculate actual Euclidean distance between authorized person and tailgater
                        let distance = 0;
                        const authPerson = persons.find(p => p.trackId === recentAuth.trackId);
                        if (authPerson && person.boundingBox && authPerson.boundingBox) {
                            const c1 = {
                                x: authPerson.boundingBox.x + authPerson.boundingBox.width / 2,
                                y: authPerson.boundingBox.y + authPerson.boundingBox.height / 2,
                            };
                            const c2 = {
                                x: person.boundingBox.x + person.boundingBox.width / 2,
                                y: person.boundingBox.y + person.boundingBox.height / 2,
                            };
                            distance = Math.sqrt((c1.x - c2.x) ** 2 + (c1.y - c2.y) ** 2);
                        }
                        events.push({
                            eventId: randomUUID(),
                            authorizedPersonTrackId: recentAuth.trackId,
                            tailgaterTrackId: person.trackId,
                            entryZone: zone.zoneId,
                            confidence: 0.88,
                            timeDifferenceMs: timeGap,
                            distance,
                            isSuspicious: timeGap < zone.maxTimeGapMs,
                        });
                    }
                    // Record this entry (assume unauthorized follower unless pre-authorized)
                    this.recordEntry(person.trackId, zone.zoneId, timestamp, false, person.boundingBox);
                }
            }
        }
        return events;
    }
    /**
     * Record entry event
     */
    recordEntry(trackId, zoneId, timestamp, isAuthorized, boundingBox) {
        this.entryEvents.push({
            trackId,
            zoneId,
            timestamp,
            isAuthorized,
            boundingBox,
        });
    }
    /**
     * Check if entry already recorded
     */
    hasEntryRecord(trackId, zoneId) {
        return this.entryEvents.some(e => e.trackId === trackId && e.zoneId === zoneId);
    }
    /**
     * Find recent authorized entry
     */
    findRecentAuthorizedEntry(zoneId, currentTime, maxGapMs) {
        const threshold = currentTime.getTime() - maxGapMs;
        const recent = this.entryEvents
            .filter(e => e.zoneId === zoneId &&
            e.isAuthorized &&
            e.timestamp.getTime() >= threshold)
            .sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
        return recent.length > 0 ? recent[0] : null;
    }
    /**
     * Clean up old entry events
     */
    startEventCleanup() {
        if (this.cleanupTimer)
            clearInterval(this.cleanupTimer);
        this.cleanupTimer = setInterval(() => {
            const now = new Date();
            const timeout = 30000; // 30 seconds
            this.entryEvents = this.entryEvents.filter(e => now.getTime() - e.timestamp.getTime() < timeout);
        }, 15000);
    }
    calculateAverageConfidence(events) {
        if (events.length === 0)
            return 0;
        const sum = events.reduce((acc, e) => acc + e.confidence, 0);
        return sum / events.length;
    }
    async cleanup() {
        this.isModelLoaded = false;
        if (this.cleanupTimer) {
            clearInterval(this.cleanupTimer);
            this.cleanupTimer = null;
        }
        this.entryZones = [];
        this.entryEvents = [];
        console.log("Tailgating detector cleaned up");
    }
    getHealth() {
        return {
            status: this.isModelLoaded ? "healthy" : "unhealthy",
            details: `Monitoring ${this.entryZones.length} zones, ${this.entryEvents.length} recent entries`,
        };
    }
}
