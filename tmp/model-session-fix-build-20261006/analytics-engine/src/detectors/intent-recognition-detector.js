/**
 * MindSense Behavioral Intent Recognition and Threat Assessment
 *
 * Production-grade intent classification system that:
 * - Differentiates nervous customer vs. potential threat
 * - Analyzes behavioral patterns and trajectories
 * - Combines emotion, movement, and context
 * - Provides real-time threat scoring
 * - Generates actionable security insights
 *
 * Intent Categories:
 * - Benign: Normal customer behavior
 * - Nervous: Anxious but non-threatening
 * - Suspicious: Requires monitoring
 * - Threatening: Immediate security concern
 */
import { BaseDetector, getInferenceObjects, } from "./base-detector.js";
export class IntentRecognitionDetector extends BaseDetector {
    config;
    isInitialized = false;
    // Person behavior tracking
    behaviorProfiles = new Map();
    // Contextual knowledge (would be loaded from configuration)
    sensitiveZones = new Set(["atm", "vault", "cash-counter", "exit"]);
    normalBusinessHours = { start: 9, end: 17 };
    constructor(config = {}) {
        super("intent-recognition", "1.0.0");
        this.config = {
            emotionWeight: config.emotionWeight ?? 0.35,
            movementWeight: config.movementWeight ?? 0.40,
            contextWeight: config.contextWeight ?? 0.25,
            loiteringThresholdSeconds: config.loiteringThresholdSeconds ?? 120,
            surveillanceThreshold: config.surveillanceThreshold ?? 0.7,
            suspiciousThreshold: config.suspiciousThreshold ?? 0.6,
            threateningThreshold: config.threateningThreshold ?? 0.75,
            enablePredictiveAssessment: config.enablePredictiveAssessment ?? true,
        };
    }
    async initialize() {
        this.isInitialized = true;
        console.log("MindSense intent recognition detector initialized");
    }
    async detect(frame, emotionalProfiles) {
        if (!this.isInitialized) {
            throw new Error("IntentRecognitionDetector not initialized");
        }
        const results = [];
        const currentTime = Date.now();
        // Get person detections
        const persons = getInferenceObjects(frame, ["person"]);
        if (persons.length === 0) {
            return results;
        }
        const intentObjects = [];
        for (const person of persons) {
            const trackId = person.trackId || `temp_${Date.now()}`;
            // Get or create behavioral profile
            let profile = this.behaviorProfiles.get(trackId);
            if (!profile) {
                profile = this.createBehaviorProfile(trackId, person, currentTime);
                this.behaviorProfiles.set(trackId, profile);
            }
            else {
                this.updateBehaviorProfile(profile, person, currentTime);
            }
            // Get emotional profile if available
            const emotionalProfile = emotionalProfiles?.get(trackId);
            // Analyze behavioral indicators
            const indicators = this.analyzeBehaviorIndicators(profile, emotionalProfile, frame);
            // Recognize intent
            const intentRecognition = this.recognizeIntent(profile, emotionalProfile, indicators, frame);
            // Update profile with new intent
            profile.currentIntent = intentRecognition;
            profile.intentHistory.push({
                timestamp: currentTime,
                intent: intentRecognition.intent,
                confidence: intentRecognition.confidence,
            });
            // Check for risk escalation
            this.assessRiskEscalation(profile);
            intentObjects.push({
                label: "person",
                confidence: person.confidence,
                boundingBox: person.boundingBox,
                trackId,
                intent: intentRecognition.intent,
                threatLevel: intentRecognition.threatLevel,
                threatScore: intentRecognition.threatScore,
                indicators,
                recommendedAction: intentRecognition.recommendedAction,
            });
        }
        if (intentObjects.length > 0) {
            // Intent recognition event
            results.push({
                detectionType: "intent-recognition",
                confidence: Math.max(...intentObjects.map(o => o.confidence)),
                objects: intentObjects,
                metadata: {
                    personCount: intentObjects.length,
                    intents: intentObjects.map(o => ({
                        trackId: o.trackId,
                        intent: o.intent,
                        threatLevel: o.threatLevel,
                        threatScore: o.threatScore,
                    })),
                },
                requiresAlert: false,
            });
            // Suspicious behavior alert
            const suspiciousPersons = intentObjects.filter(o => o.intent === "suspicious" && o.threatScore > this.config.suspiciousThreshold);
            if (suspiciousPersons.length > 0) {
                results.push({
                    detectionType: "suspicious-behavior",
                    confidence: Math.max(...suspiciousPersons.map(o => o.threatScore)),
                    objects: suspiciousPersons,
                    metadata: {
                        personCount: suspiciousPersons.length,
                        behaviors: suspiciousPersons.map(o => ({
                            trackId: o.trackId,
                            intent: o.intent,
                            indicators: o.indicators,
                            action: o.recommendedAction,
                        })),
                    },
                    requiresAlert: true,
                });
            }
            // Threatening behavior alert
            const threateningPersons = intentObjects.filter(o => o.intent === "threatening" || o.threatScore > this.config.threateningThreshold);
            if (threateningPersons.length > 0) {
                results.push({
                    detectionType: "threatening-behavior",
                    confidence: Math.max(...threateningPersons.map(o => o.threatScore)),
                    objects: threateningPersons,
                    metadata: {
                        personCount: threateningPersons.length,
                        threats: threateningPersons.map(o => ({
                            trackId: o.trackId,
                            intent: o.intent,
                            threatLevel: o.threatLevel,
                            indicators: o.indicators,
                            action: o.recommendedAction,
                        })),
                    },
                    requiresAlert: true,
                });
            }
            // Deceptive behavior alert
            const deceptivePersons = intentObjects.filter(o => o.intent === "deceptive");
            if (deceptivePersons.length > 0) {
                results.push({
                    detectionType: "deceptive-behavior",
                    confidence: Math.max(...deceptivePersons.map(o => o.threatScore)),
                    objects: deceptivePersons,
                    metadata: {
                        personCount: deceptivePersons.length,
                        deceptions: deceptivePersons.map(o => ({
                            trackId: o.trackId,
                            indicators: o.indicators,
                        })),
                    },
                    requiresAlert: true,
                });
            }
            // Distressed person alert (potential victim)
            const distressedPersons = intentObjects.filter(o => o.intent === "distressed");
            if (distressedPersons.length > 0) {
                results.push({
                    detectionType: "person-in-distress",
                    confidence: Math.max(...distressedPersons.map(o => o.threatScore)),
                    objects: distressedPersons,
                    metadata: {
                        personCount: distressedPersons.length,
                        distressed: distressedPersons.map(o => ({
                            trackId: o.trackId,
                            action: o.recommendedAction,
                        })),
                    },
                    requiresAlert: true,
                });
            }
        }
        // Cleanup old profiles
        this.cleanupOldProfiles(currentTime);
        return results;
    }
    /**
     * Create new behavioral profile
     */
    createBehaviorProfile(trackId, person, timestamp) {
        const centerX = person.boundingBox.x + person.boundingBox.width / 2;
        const centerY = person.boundingBox.y + person.boundingBox.height / 2;
        return {
            personId: `person_${trackId}`,
            trackId,
            currentIntent: this.createDefaultIntent(),
            intentHistory: [],
            trajectory: [{ x: centerX, y: centerY, timestamp }],
            velocity: 0,
            directionChanges: 0,
            dwellZones: [],
            firstSeen: timestamp,
            lastSeen: timestamp,
            totalDuration: 0,
            visitFrequency: 0,
            riskEscalation: false,
            escalationRate: 0,
            peakThreatScore: 0,
        };
    }
    /**
     * Update behavioral profile
     */
    updateBehaviorProfile(profile, person, timestamp) {
        const centerX = person.boundingBox.x + person.boundingBox.width / 2;
        const centerY = person.boundingBox.y + person.boundingBox.height / 2;
        // Update trajectory
        profile.trajectory.push({ x: centerX, y: centerY, timestamp });
        // Limit trajectory history
        if (profile.trajectory.length > 100) {
            profile.trajectory = profile.trajectory.slice(-100);
        }
        // Calculate velocity
        if (profile.trajectory.length >= 2) {
            const prev = profile.trajectory[profile.trajectory.length - 2];
            const curr = profile.trajectory[profile.trajectory.length - 1];
            const distance = Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
            const timeDiff = (curr.timestamp - prev.timestamp) / 1000; // seconds
            profile.velocity = timeDiff > 0 ? distance / timeDiff : 0;
        }
        // Count direction changes
        if (profile.trajectory.length >= 3) {
            const points = profile.trajectory.slice(-3);
            const angle1 = Math.atan2(points[1].y - points[0].y, points[1].x - points[0].x);
            const angle2 = Math.atan2(points[2].y - points[1].y, points[2].x - points[1].x);
            const angleDiff = Math.abs(angle2 - angle1);
            if (angleDiff > Math.PI / 4) { // 45 degrees
                profile.directionChanges++;
            }
        }
        profile.lastSeen = timestamp;
        profile.totalDuration = (timestamp - profile.firstSeen) / 1000; // seconds
    }
    /**
     * Analyze behavioral indicators
     */
    analyzeBehaviorIndicators(profile, emotionalProfile, frame) {
        // Loitering detection
        const loiteringDuration = profile.totalDuration;
        const isLoitering = loiteringDuration > this.config.loiteringThresholdSeconds;
        // Erratic movement (high velocity variance and direction changes)
        const erraticMovement = profile.directionChanges > 5 &&
            profile.velocity > 0.5 &&
            profile.trajectory.length > 10;
        // Territorial pacing (repeated back-and-forth in small area)
        const territorialPacing = this.detectTerritorialPacing(profile.trajectory);
        // Area familiarity (smooth, direct paths suggest familiarity)
        const areaFamiliarity = this.calculateAreaFamiliarity(profile.trajectory);
        // Approach-avoidance conflict (moves toward then away from target)
        const approachAvoidanceConflict = this.detectApproachAvoidance(profile.trajectory);
        // Surveillance behavior (scanning, not focused movement)
        const surveillanceBehavior = erraticMovement && isLoitering &&
            profile.directionChanges > 8;
        // Social isolation (based on proximity to others - simplified)
        const socialIsolation = true; // Would need multi-person analysis
        // Nervous fidgeting (from emotional profile)
        const nervousFidgeting = emotionalProfile
            ? emotionalProfile.stressIndicators.facialTension > 0.6
            : false;
        // Aggressive posture (would need pose estimation)
        const aggressivePosture = emotionalProfile
            ? emotionalProfile.currentEmotion.emotion === "anger" &&
                emotionalProfile.currentEmotion.arousal > 0.7
            : false;
        // Timing anomalies
        const currentHour = new Date().getHours();
        const timingAnomalies = currentHour < this.normalBusinessHours.start ||
            currentHour > this.normalBusinessHours.end;
        return {
            loiteringDuration,
            erraticMovement,
            territorialPacing,
            areaFamiliarity,
            approachAvoidanceConflict,
            surveillanceBehavior,
            targetFixation: false, // Requires gaze tracking
            gazeAvoidance: false, // Requires gaze tracking
            socialIsolation,
            groupDynamics: "solo",
            verbalAggression: false, // Requires audio
            concealmentAttempts: false, // Requires object detection
            weaponIndicators: false, // Requires weapon detection
            nervousFidgeting,
            aggressivePosture,
            inappropriateForContext: false, // Requires context modeling
            timingAnomalies,
            accessPatternAnomaly: false, // Requires access control integration
        };
    }
    /**
     * Recognize behavioral intent
     */
    recognizeIntent(profile, emotionalProfile, indicators, frame) {
        // Calculate component scores
        const emotionScore = this.calculateEmotionScore(emotionalProfile);
        const movementScore = this.calculateMovementScore(indicators);
        const contextScore = this.calculateContextScore(indicators, frame);
        // Weighted threat score
        const threatScore = emotionScore * this.config.emotionWeight +
            movementScore * this.config.movementWeight +
            contextScore * this.config.contextWeight;
        // Classify intent
        let intent;
        let threatLevel;
        let recommendedAction;
        let monitoringPriority;
        let alertSecurity;
        // Decision tree for intent classification
        if (indicators.weaponIndicators || indicators.verbalAggression ||
            (indicators.aggressivePosture && threatScore > 0.8)) {
            intent = "threatening";
            threatLevel = "critical";
            recommendedAction = "Immediate security response required. Alert all personnel.";
            monitoringPriority = "urgent";
            alertSecurity = true;
        }
        else if (threatScore > this.config.threateningThreshold) {
            intent = "threatening";
            threatLevel = "high";
            recommendedAction = "Security personnel should engage. Monitor closely.";
            monitoringPriority = "urgent";
            alertSecurity = true;
        }
        else if (indicators.surveillanceBehavior || indicators.approachAvoidanceConflict ||
            (emotionalProfile?.deceptionIndicators.deceptionScore ?? 0) > 0.7) {
            intent = indicators.surveillanceBehavior ? "suspicious" : "deceptive";
            threatLevel = "medium";
            recommendedAction = "Maintain visual contact. Consider friendly engagement to assess intent.";
            monitoringPriority = "high";
            alertSecurity = true;
        }
        else if (emotionalProfile?.currentEmotion.emotion === "fear" &&
            emotionalProfile.currentEmotion.intensity > 0.7) {
            intent = "distressed";
            threatLevel = "low";
            recommendedAction = "Person may need assistance. Approach with care and empathy.";
            monitoringPriority = "medium";
            alertSecurity = false;
        }
        else if ((emotionalProfile?.stressIndicators.stressScore ?? 0) > 0.6 ||
            indicators.nervousFidgeting) {
            intent = "nervous";
            threatLevel = "low";
            recommendedAction = "Normal customer anxiety. Offer assistance to ease concerns.";
            monitoringPriority = "low";
            alertSecurity = false;
        }
        else {
            intent = "benign";
            threatLevel = "none";
            recommendedAction = "Normal behavior. Continue routine monitoring.";
            monitoringPriority = "low";
            alertSecurity = false;
        }
        const confidence = this.calculateConfidence(emotionalProfile, indicators);
        return {
            intent,
            confidence,
            threatLevel,
            threatScore,
            indicators,
            emotionalContext: {
                dominantEmotion: emotionalProfile?.dominantEmotion ?? "neutral",
                stressLevel: emotionalProfile?.stressIndicators.stressScore ?? 0,
                deceptionScore: emotionalProfile?.deceptionIndicators.deceptionScore ?? 0,
            },
            recommendedAction,
            monitoringPriority,
            alertSecurity,
        };
    }
    /**
     * Calculate emotion-based threat score
     */
    calculateEmotionScore(emotionalProfile) {
        if (!emotionalProfile)
            return 0.3; // Neutral baseline
        let score = 0;
        // Negative emotions increase threat
        if (emotionalProfile.currentEmotion.emotion === "anger") {
            score += 0.7 * emotionalProfile.currentEmotion.intensity;
        }
        else if (emotionalProfile.currentEmotion.emotion === "fear") {
            score += 0.3 * emotionalProfile.currentEmotion.intensity; // Could be victim
        }
        else if (emotionalProfile.currentEmotion.emotion === "disgust") {
            score += 0.4 * emotionalProfile.currentEmotion.intensity;
        }
        // Stress indicators
        score += emotionalProfile.stressIndicators.stressScore * 0.4;
        // Deception indicators
        score += emotionalProfile.deceptionIndicators.deceptionScore * 0.6;
        // Emotional instability (rapid changes)
        score += (1 - emotionalProfile.emotionalStability) * 0.3;
        return Math.min(score, 1.0);
    }
    /**
     * Calculate movement-based threat score
     */
    calculateMovementScore(indicators) {
        let score = 0;
        if (indicators.surveillanceBehavior)
            score += 0.7;
        if (indicators.erraticMovement)
            score += 0.4;
        if (indicators.territorialPacing)
            score += 0.5;
        if (indicators.approachAvoidanceConflict)
            score += 0.6;
        if (indicators.loiteringDuration > 300)
            score += 0.5; // 5+ minutes
        if (indicators.areaFamiliarity < 0.3)
            score += 0.2; // Unfamiliar with layout
        return Math.min(score / 2, 1.0); // Normalize
    }
    /**
     * Calculate context-based threat score
     */
    calculateContextScore(indicators, frame) {
        let score = 0;
        if (indicators.timingAnomalies)
            score += 0.6;
        if (indicators.accessPatternAnomaly)
            score += 0.5;
        if (indicators.inappropriateForContext)
            score += 0.7;
        if (indicators.concealmentAttempts)
            score += 0.8;
        if (indicators.weaponIndicators)
            score += 1.0;
        return Math.min(score / 2, 1.0); // Normalize
    }
    /**
     * Calculate confidence in intent assessment
     */
    calculateConfidence(emotionalProfile, indicators) {
        let confidence = 0.5; // Base confidence
        // More data = higher confidence
        if (emotionalProfile) {
            confidence += 0.2;
            if (emotionalProfile.frameCount > 10)
                confidence += 0.15;
        }
        // Clear indicators increase confidence
        const indicatorCount = Object.values(indicators).filter(v => v === true).length;
        confidence += Math.min(indicatorCount * 0.05, 0.25);
        return Math.min(confidence, 0.95);
    }
    /**
     * Detect territorial pacing pattern
     */
    detectTerritorialPacing(trajectory) {
        if (trajectory.length < 10)
            return false;
        // Calculate bounding box of movement
        const xCoords = trajectory.map(p => p.x);
        const yCoords = trajectory.map(p => p.y);
        const width = Math.max(...xCoords) - Math.min(...xCoords);
        const height = Math.max(...yCoords) - Math.min(...yCoords);
        const area = width * height;
        // Small area + many points = pacing
        return area < 0.05 && trajectory.length > 15; // 5% of frame
    }
    /**
     * Calculate area familiarity (0-1)
     */
    calculateAreaFamiliarity(trajectory) {
        if (trajectory.length < 5)
            return 0.5;
        // Smooth, direct paths = familiar
        // Calculate path efficiency (straight line vs actual path)
        const start = trajectory[0];
        const end = trajectory[trajectory.length - 1];
        const straightDist = Math.sqrt(Math.pow(end.x - start.x, 2) + Math.pow(end.y - start.y, 2));
        let actualDist = 0;
        for (let i = 1; i < trajectory.length; i++) {
            const prev = trajectory[i - 1];
            const curr = trajectory[i];
            actualDist += Math.sqrt(Math.pow(curr.x - prev.x, 2) + Math.pow(curr.y - prev.y, 2));
        }
        const efficiency = straightDist / (actualDist + 0.001);
        return Math.min(efficiency * 1.5, 1.0);
    }
    /**
     * Detect approach-avoidance conflict
     */
    detectApproachAvoidance(trajectory) {
        if (trajectory.length < 6)
            return false;
        // Look for pattern of moving toward then away from a point
        // Simplified: check for direction reversals
        let reversals = 0;
        for (let i = 2; i < trajectory.length - 1; i++) {
            const prev = trajectory[i - 1];
            const curr = trajectory[i];
            const next = trajectory[i + 1];
            const dir1X = curr.x - prev.x;
            const dir2X = next.x - curr.x;
            if (Math.sign(dir1X) !== Math.sign(dir2X) && Math.abs(dir1X) > 0.01) {
                reversals++;
            }
        }
        return reversals >= 2;
    }
    /**
     * Assess risk escalation
     */
    assessRiskEscalation(profile) {
        if (profile.intentHistory.length < 3) {
            profile.riskEscalation = false;
            return;
        }
        // Check recent threat scores
        const recentIntents = profile.intentHistory.slice(-5);
        const threatScores = recentIntents.map(i => {
            const threatLevels = { benign: 0, nervous: 0.2, suspicious: 0.6, deceptive: 0.7, threatening: 0.9, distressed: 0.3 };
            return threatLevels[i.intent] ?? 0;
        });
        // Calculate escalation
        let escalating = true;
        for (let i = 1; i < threatScores.length; i++) {
            if (threatScores[i] <= threatScores[i - 1]) {
                escalating = false;
                break;
            }
        }
        profile.riskEscalation = escalating;
        if (escalating && threatScores.length >= 2) {
            const first = threatScores[0];
            const last = threatScores[threatScores.length - 1];
            const timeDiff = (recentIntents[recentIntents.length - 1].timestamp - recentIntents[0].timestamp) / 1000;
            profile.escalationRate = timeDiff > 0 ? (last - first) / timeDiff : 0;
        }
        profile.peakThreatScore = Math.max(profile.peakThreatScore, profile.currentIntent.threatScore);
    }
    /**
     * Create default intent
     */
    createDefaultIntent() {
        return {
            intent: "benign",
            confidence: 0.5,
            threatLevel: "none",
            threatScore: 0,
            indicators: {},
            emotionalContext: {
                dominantEmotion: "neutral",
                stressLevel: 0,
                deceptionScore: 0,
            },
            recommendedAction: "Initializing behavioral assessment...",
            monitoringPriority: "low",
            alertSecurity: false,
        };
    }
    /**
     * Cleanup old profiles
     */
    cleanupOldProfiles(currentTime) {
        const timeout = 600000; // 10 minutes
        for (const [trackId, profile] of this.behaviorProfiles.entries()) {
            if (currentTime - profile.lastSeen > timeout) {
                this.behaviorProfiles.delete(trackId);
            }
        }
    }
    /**
     * Get behavior profile
     */
    getBehaviorProfile(trackId) {
        return this.behaviorProfiles.get(trackId);
    }
    /**
     * Get all active behavior profiles
     */
    getAllBehaviorProfiles() {
        return Array.from(this.behaviorProfiles.values());
    }
    async cleanup() {
        this.behaviorProfiles.clear();
        this.isInitialized = false;
    }
    getHealth() {
        return {
            status: this.isInitialized ? "healthy" : "unhealthy",
            details: this.isInitialized
                ? "MindSense intent recognition active with behavioral analysis"
                : "MindSense intent recognition not initialized",
            metadata: {
                activeProfiles: this.behaviorProfiles.size,
                predictiveAssessment: this.config.enablePredictiveAssessment,
                emotionWeight: this.config.emotionWeight,
                movementWeight: this.config.movementWeight,
                contextWeight: this.config.contextWeight,
            },
        };
    }
}
