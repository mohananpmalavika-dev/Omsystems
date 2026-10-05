/**
 * MindSense Emotion Detection and Micro-Expression Analysis
 *
 * Production-grade emotional intelligence system with:
 * - Facial Action Unit (FAU) detection
 * - 7 basic emotions + compound emotions
 * - Micro-expression temporal analysis
 * - Emotional state tracking over time
 * - Stress and deception indicators
 *
 * Based on:
 * - Facial Action Coding System (FACS)
 * - Paul Ekman's emotion research
 * - Micro-expression detection (40-500ms duration)
 */
import { BaseDetector, getInferenceObjects, normalizeBoundingBox, shouldRunLocalSpecialtyInference, } from "./base-detector.js";
import { loadEmotionInference, loadObjectInference, modelUnavailableReason, } from "../inference/configured-model-inference.js";
export class EmotionDetector extends BaseDetector {
    config;
    faceDetectionModel;
    emotionModel;
    modelLoadError = null;
    isInitialized = false;
    // Per-person emotional state tracking
    emotionalProfiles = new Map();
    // Micro-expression detection buffers
    emotionHistory = new Map();
    constructor(config = {}, inference = {}) {
        super("emotion", "1.0.0");
        this.faceDetectionModel = inference.face ?? null;
        this.emotionModel = inference.emotion ?? null;
        this.config = {
            detectionConfidence: config.detectionConfidence ?? 0.70,
            emotionConfidence: config.emotionConfidence ?? 0.65,
            microExpressionEnabled: config.microExpressionEnabled ?? true,
            microExpressionMinDuration: config.microExpressionMinDuration ?? 40,
            microExpressionMaxDuration: config.microExpressionMaxDuration ?? 500,
            deceptionAnalysisEnabled: config.deceptionAnalysisEnabled ?? true,
            stressAnalysisEnabled: config.stressAnalysisEnabled ?? true,
            timelineWindowSize: config.timelineWindowSize ?? 300, // 5 minutes
            emotionSmoothingFrames: config.emotionSmoothingFrames ?? 3,
        };
    }
    async initialize() {
        try {
            // Load face detection model (reuse from face detector)
            this.faceDetectionModel ??= await loadObjectInference("face-detector", this.config.detectionConfidence);
            // Load emotion recognition model
            this.emotionModel ??= await loadEmotionInference("emotion-recognition");
            this.modelLoadError = null;
            console.log("MindSense emotion detector loaded ONNX models successfully");
        }
        catch (error) {
            this.faceDetectionModel = null;
            this.emotionModel = null;
            this.modelLoadError = error instanceof Error ? error.message : modelUnavailableReason("emotion-recognition");
            console.warn(`MindSense emotion detector running in observation mode: ${this.modelLoadError}`);
        }
        this.isInitialized = true;
    }
    async detect(frame) {
        if (!this.isInitialized) {
            throw new Error("EmotionDetector not initialized");
        }
        const results = [];
        const currentTime = Date.now();
        // Get face detections
        const faceDetections = await this.detectFaces(frame);
        if (faceDetections.length === 0) {
            return results;
        }
        const emotionalObjects = [];
        // Process each detected face
        for (const face of faceDetections) {
            const trackId = face.trackId || `temp_${Date.now()}`;
            // Analyze emotion
            const emotionAnalysis = await this.analyzeEmotion(frame, face, currentTime);
            if (!emotionAnalysis)
                continue;
            // Update or create emotional profile
            let profile = this.emotionalProfiles.get(trackId);
            if (!profile) {
                profile = this.createEmotionalProfile(trackId, emotionAnalysis, currentTime);
                this.emotionalProfiles.set(trackId, profile);
            }
            else {
                this.updateEmotionalProfile(profile, emotionAnalysis, currentTime);
            }
            // Detect micro-expressions
            if (this.config.microExpressionEnabled) {
                this.detectMicroExpressions(profile, emotionAnalysis, currentTime);
            }
            // Calculate deception indicators
            let deceptionScore;
            if (this.config.deceptionAnalysisEnabled) {
                profile.deceptionIndicators = this.calculateDeceptionIndicators(profile);
                deceptionScore = profile.deceptionIndicators.deceptionScore;
            }
            // Calculate stress indicators
            let stressScore;
            if (this.config.stressAnalysisEnabled) {
                profile.stressIndicators = this.calculateStressIndicators(profile);
                stressScore = profile.stressIndicators.stressScore;
            }
            const normalizedBox = normalizeBoundingBox(face.boundingBox, frame.width, frame.height);
            emotionalObjects.push({
                label: "person",
                confidence: face.confidence,
                boundingBox: normalizedBox,
                trackId,
                emotionalState: profile.currentEmotion,
                actionUnits: emotionAnalysis.actionUnits,
                microExpressions: profile.microExpressions.slice(-5), // Last 5
                deceptionScore,
                stressScore,
            });
        }
        if (emotionalObjects.length > 0) {
            // Emotion recognition event
            results.push({
                detectionType: "emotion-recognition",
                confidence: Math.max(...emotionalObjects.map(o => o.confidence)),
                objects: emotionalObjects,
                metadata: {
                    personCount: emotionalObjects.length,
                    emotions: emotionalObjects.map(o => ({
                        emotion: o.emotionalState?.emotion,
                        confidence: o.emotionalState?.confidence,
                        valence: o.emotionalState?.valence,
                        arousal: o.emotionalState?.arousal,
                    })),
                    microExpressionsDetected: this.config.microExpressionEnabled,
                    deceptionAnalysisEnabled: this.config.deceptionAnalysisEnabled,
                    stressAnalysisEnabled: this.config.stressAnalysisEnabled,
                },
                requiresAlert: false,
            });
            // High stress alert
            const highStressPersons = emotionalObjects.filter(o => o.stressScore && o.stressScore > 0.75);
            if (highStressPersons.length > 0) {
                results.push({
                    detectionType: "high-stress-detected",
                    confidence: Math.max(...highStressPersons.map(o => o.stressScore)),
                    objects: highStressPersons,
                    metadata: {
                        personCount: highStressPersons.length,
                        stressLevels: highStressPersons.map(o => ({
                            trackId: o.trackId,
                            stressScore: o.stressScore,
                            emotion: o.emotionalState?.emotion,
                        })),
                    },
                    requiresAlert: true,
                });
            }
            // Deception alert
            const deceptivePersons = emotionalObjects.filter(o => o.deceptionScore && o.deceptionScore > 0.70);
            if (deceptivePersons.length > 0) {
                results.push({
                    detectionType: "deception-indicators",
                    confidence: Math.max(...deceptivePersons.map(o => o.deceptionScore)),
                    objects: deceptivePersons,
                    metadata: {
                        personCount: deceptivePersons.length,
                        indicators: deceptivePersons.map(o => ({
                            trackId: o.trackId,
                            deceptionScore: o.deceptionScore,
                            microExpressions: o.microExpressions?.length || 0,
                        })),
                    },
                    requiresAlert: true,
                });
            }
            // Aggression/anger alert
            const aggressivePersons = emotionalObjects.filter(o => o.emotionalState?.emotion === "anger" &&
                o.emotionalState.intensity > 0.7);
            if (aggressivePersons.length > 0) {
                results.push({
                    detectionType: "aggression-detected",
                    confidence: Math.max(...aggressivePersons.map(o => o.emotionalState.confidence)),
                    objects: aggressivePersons,
                    metadata: {
                        personCount: aggressivePersons.length,
                        aggressionLevels: aggressivePersons.map(o => ({
                            trackId: o.trackId,
                            intensity: o.emotionalState.intensity,
                            arousal: o.emotionalState.arousal,
                        })),
                    },
                    requiresAlert: true,
                });
            }
            // Fear alert (potential victim or threat awareness)
            const fearfulPersons = emotionalObjects.filter(o => o.emotionalState?.emotion === "fear" &&
                o.emotionalState.intensity > 0.65);
            if (fearfulPersons.length > 0) {
                results.push({
                    detectionType: "fear-detected",
                    confidence: Math.max(...fearfulPersons.map(o => o.emotionalState.confidence)),
                    objects: fearfulPersons,
                    metadata: {
                        personCount: fearfulPersons.length,
                        fearLevels: fearfulPersons.map(o => ({
                            trackId: o.trackId,
                            intensity: o.emotionalState.intensity,
                            arousal: o.emotionalState.arousal,
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
     * Detect faces in frame
     */
    async detectFaces(frame) {
        const runLocal = shouldRunLocalSpecialtyInference(frame) && this.faceDetectionModel;
        const local = runLocal ? await this.faceDetectionModel.run(frame) : [];
        const directFaceObservations = [
            ...getInferenceObjects(frame, ["face"]),
            ...local.filter(item => item.label === "face"),
        ];
        // Fallback: estimate face region from person detection
        const observations = directFaceObservations.length > 0
            ? directFaceObservations
            : getInferenceObjects(frame, ["person"]).map(person => ({
                label: "face",
                confidence: Math.max(0.65, person.confidence * 0.9),
                boundingBox: {
                    x: person.boundingBox.x + person.boundingBox.width * 0.2,
                    y: person.boundingBox.y,
                    width: person.boundingBox.width * 0.6,
                    height: Math.min(person.boundingBox.height * 0.28, 0.25),
                },
                trackId: person.trackId ? `face_${person.trackId}` : undefined,
            }));
        return observations.map(item => ({
            confidence: item.confidence,
            boundingBox: {
                x: item.boundingBox.x * frame.width,
                y: item.boundingBox.y * frame.height,
                width: item.boundingBox.width * frame.width,
                height: item.boundingBox.height * frame.height,
            },
            trackId: item.trackId,
        }));
    }
    /**
     * Analyze emotion from face region
     */
    async analyzeEmotion(frame, face, timestamp) {
        // Run emotion inference if model is available
        if (this.emotionModel) {
            try {
                const result = await this.emotionModel.run(frame, face.boundingBox);
                return result;
            }
            catch (error) {
                console.warn("Emotion inference failed:", error);
            }
        }
        // Fallback: check for emotion attributes from upstream
        const faceObservations = getInferenceObjects(frame, ["face"]);
        const matchingFace = faceObservations.find(f => Math.abs(f.boundingBox.x - face.boundingBox.x / frame.width) < 0.05 &&
            Math.abs(f.boundingBox.y - face.boundingBox.y / frame.height) < 0.05);
        if (matchingFace?.attributes?.emotion) {
            const emotion = matchingFace.attributes.emotion;
            const confidence = typeof matchingFace.attributes.emotionConfidence === "number"
                ? matchingFace.attributes.emotionConfidence
                : 0.7;
            return {
                emotion,
                confidence,
                ...this.calculateEmotionalParameters(emotion, confidence),
                actionUnits: this.estimateActionUnits(emotion),
            };
        }
        return null;
    }
    /**
     * Calculate valence, arousal, intensity from emotion
     */
    calculateEmotionalParameters(emotion, confidence) {
        // Emotion circumplex model
        const emotionParameters = {
            "neutral": { valence: 0, arousal: 0 },
            "happiness": { valence: 0.8, arousal: 0.6 },
            "sadness": { valence: -0.7, arousal: 0.3 },
            "anger": { valence: -0.8, arousal: 0.9 },
            "fear": { valence: -0.7, arousal: 0.8 },
            "surprise": { valence: 0, arousal: 0.7 },
            "disgust": { valence: -0.6, arousal: 0.4 },
        };
        const params = emotionParameters[emotion];
        return {
            valence: params.valence,
            arousal: params.arousal,
            intensity: confidence,
        };
    }
    /**
     * Estimate Action Units from emotion (simplified)
     */
    estimateActionUnits(emotion) {
        const auPatterns = {
            "neutral": {},
            "happiness": {
                AU6_cheekRaiser: 0.8,
                AU12_lipCornerPuller: 0.9,
            },
            "sadness": {
                AU1_innerBrowRaiser: 0.7,
                AU4_browLowerer: 0.6,
                AU15_lipCornerDepressor: 0.8,
            },
            "anger": {
                AU4_browLowerer: 0.9,
                AU7_lidTightener: 0.7,
                AU23_lipTightener: 0.8,
                AU24_lipPressor: 0.7,
            },
            "fear": {
                AU1_innerBrowRaiser: 0.8,
                AU2_outerBrowRaiser: 0.8,
                AU5_upperLidRaiser: 0.9,
                AU20_lipStretcher: 0.7,
                AU27_mouthStretch: 0.6,
            },
            "surprise": {
                AU1_innerBrowRaiser: 0.9,
                AU2_outerBrowRaiser: 0.9,
                AU5_upperLidRaiser: 0.8,
                AU25_lipsPart: 0.7,
                AU26_jawDrop: 0.8,
            },
            "disgust": {
                AU9_noseWrinkler: 0.9,
                AU10_upperLipRaiser: 0.8,
            },
        };
        return auPatterns[emotion] || {};
    }
    /**
     * Create new emotional profile
     */
    createEmotionalProfile(trackId, emotionAnalysis, timestamp) {
        const currentEmotion = {
            emotion: emotionAnalysis.emotion,
            confidence: emotionAnalysis.confidence,
            valence: emotionAnalysis.valence,
            arousal: emotionAnalysis.arousal,
            intensity: emotionAnalysis.intensity,
        };
        const timelineEntry = {
            timestamp,
            emotion: emotionAnalysis.emotion,
            confidence: emotionAnalysis.confidence,
            valence: emotionAnalysis.valence,
            arousal: emotionAnalysis.arousal,
            intensity: emotionAnalysis.intensity,
            actionUnits: emotionAnalysis.actionUnits,
            isMicroExpression: false,
        };
        const emotionDist = {
            "neutral": 0, "happiness": 0, "sadness": 0, "anger": 0,
            "fear": 0, "surprise": 0, "disgust": 0,
        };
        emotionDist[emotionAnalysis.emotion] = 1;
        return {
            personId: `person_${trackId}`,
            trackId,
            currentEmotion,
            emotionalTimeline: [timelineEntry],
            microExpressions: [],
            deceptionIndicators: this.createEmptyDeceptionIndicators(),
            stressIndicators: this.createEmptyStressIndicators(),
            dominantEmotion: emotionAnalysis.emotion,
            emotionDistribution: emotionDist,
            averageValence: emotionAnalysis.valence,
            averageArousal: emotionAnalysis.arousal,
            emotionalStability: 1.0,
            firstSeen: timestamp,
            lastSeen: timestamp,
            frameCount: 1,
        };
    }
    /**
     * Update emotional profile
     */
    updateEmotionalProfile(profile, emotionAnalysis, timestamp) {
        // Update previous emotion
        profile.previousEmotion = { ...profile.currentEmotion };
        // Update current emotion with temporal smoothing
        const smoothingFactor = 1 / this.config.emotionSmoothingFrames;
        profile.currentEmotion = {
            emotion: emotionAnalysis.emotion,
            confidence: emotionAnalysis.confidence,
            valence: profile.currentEmotion.valence * (1 - smoothingFactor) + emotionAnalysis.valence * smoothingFactor,
            arousal: profile.currentEmotion.arousal * (1 - smoothingFactor) + emotionAnalysis.arousal * smoothingFactor,
            intensity: profile.currentEmotion.intensity * (1 - smoothingFactor) + emotionAnalysis.intensity * smoothingFactor,
        };
        // Track emotion transition time
        if (profile.previousEmotion.emotion !== profile.currentEmotion.emotion) {
            profile.emotionTransitionTime = timestamp;
        }
        // Add to timeline
        const timelineEntry = {
            timestamp,
            emotion: emotionAnalysis.emotion,
            confidence: emotionAnalysis.confidence,
            valence: emotionAnalysis.valence,
            arousal: emotionAnalysis.arousal,
            intensity: emotionAnalysis.intensity,
            actionUnits: emotionAnalysis.actionUnits,
            isMicroExpression: false,
        };
        profile.emotionalTimeline.push(timelineEntry);
        // Prune old timeline entries
        const cutoff = timestamp - (this.config.timelineWindowSize * 1000);
        profile.emotionalTimeline = profile.emotionalTimeline.filter(e => e.timestamp > cutoff);
        // Update statistics
        profile.emotionDistribution[emotionAnalysis.emotion] =
            (profile.emotionDistribution[emotionAnalysis.emotion] || 0) + 1;
        const totalEmotions = Object.values(profile.emotionDistribution).reduce((a, b) => a + b, 0);
        const dominant = Object.entries(profile.emotionDistribution)
            .reduce((a, b) => (b[1] > a[1] ? b : a))[0];
        profile.dominantEmotion = dominant;
        // Calculate averages
        const timelineLen = profile.emotionalTimeline.length;
        profile.averageValence = profile.emotionalTimeline.reduce((sum, e) => sum + e.valence, 0) / timelineLen;
        profile.averageArousal = profile.emotionalTimeline.reduce((sum, e) => sum + e.arousal, 0) / timelineLen;
        // Calculate emotional stability (inverse of volatility)
        if (timelineLen > 5) {
            const emotionChanges = profile.emotionalTimeline.slice(1).filter((e, i) => e.emotion !== profile.emotionalTimeline[i].emotion).length;
            profile.emotionalStability = Math.max(0, 1 - (emotionChanges / timelineLen));
        }
        profile.lastSeen = timestamp;
        profile.frameCount++;
    }
    /**
     * Detect micro-expressions
     * Fleeting expressions that last 40-500ms
     */
    detectMicroExpressions(profile, currentAnalysis, timestamp) {
        if (profile.emotionalTimeline.length < 3)
            return;
        const recentTimeline = profile.emotionalTimeline.slice(-10);
        // Look for brief emotional spikes
        for (let i = 1; i < recentTimeline.length - 1; i++) {
            const prev = recentTimeline[i - 1];
            const curr = recentTimeline[i];
            const next = recentTimeline[i + 1];
            // Check if emotion differs from neighbors
            if (curr.emotion !== prev.emotion && curr.emotion !== next.emotion) {
                const duration = next.timestamp - prev.timestamp;
                // Micro-expression timing window
                if (duration >= this.config.microExpressionMinDuration &&
                    duration <= this.config.microExpressionMaxDuration) {
                    const microExpression = {
                        id: `micro_${profile.trackId}_${curr.timestamp}`,
                        startTime: prev.timestamp,
                        endTime: next.timestamp,
                        duration,
                        emotion: curr.emotion,
                        confidence: curr.confidence,
                        maskedBy: next.emotion !== curr.emotion ? next.emotion : undefined,
                        actionUnits: curr.actionUnits,
                        isGenuine: this.assessGenuineness(curr.emotion, next.emotion),
                    };
                    // Avoid duplicates
                    const exists = profile.microExpressions.some(me => Math.abs(me.startTime - microExpression.startTime) < 100);
                    if (!exists) {
                        profile.microExpressions.push(microExpression);
                        // Mark in timeline
                        curr.isMicroExpression = true;
                    }
                }
            }
        }
        // Limit micro-expression history
        profile.microExpressions = profile.microExpressions.slice(-50);
    }
    /**
     * Assess if micro-expression is genuine
     */
    assessGenuineness(microEmotion, macroEmotion) {
        if (!macroEmotion)
            return true;
        // Compatible emotions (not contradictory)
        const compatible = {
            "neutral": ["surprise", "happiness"],
            "happiness": ["neutral", "surprise"],
            "sadness": ["neutral", "fear", "disgust"],
            "anger": ["disgust", "contempt", "frustration"],
            "fear": ["sadness", "surprise", "anxiety"],
            "surprise": ["happiness", "fear", "neutral"],
            "disgust": ["anger", "sadness", "contempt"],
            "contempt": ["anger", "disgust"],
            "anxiety": ["fear", "sadness"],
            "frustration": ["anger", "sadness"],
            "confusion": ["surprise", "fear"],
            "relief": ["happiness", "surprise"],
            "suspicion": ["anger", "fear"],
        };
        return compatible[microEmotion]?.includes(macroEmotion) ?? false;
    }
    /**
     * Calculate deception indicators
     */
    calculateDeceptionIndicators(profile) {
        const timeline = profile.emotionalTimeline;
        const microExpressions = profile.microExpressions;
        // Micro-expression frequency (suppressed emotions)
        const durationMinutes = (profile.lastSeen - profile.firstSeen) / 60000;
        const microExpressionFrequency = microExpressions.length / Math.max(durationMinutes, 1);
        // Emotion mismatch (conflicting micro and macro emotions)
        const recentMicros = microExpressions.filter(me => profile.lastSeen - me.endTime < 30000);
        const emotionMismatch = recentMicros.some(me => !me.isGenuine);
        // Asymmetric facial movement (requires detailed AU analysis)
        // Simplified: check for unusual AU patterns
        const asymmetricFacialMovement = false; // Would need left/right AU comparison
        // Delayed emotion onset (fake emotions are slower)
        // Simplified: check transition timing
        const delayedEmotionOnset = profile.emotionTransitionTime ?
            (profile.lastSeen - profile.emotionTransitionTime) > 1000 : false;
        // Excessive control attempts (over-controlled muscles)
        const excessiveControlAttempts = profile.emotionalStability > 0.9 &&
            microExpressionFrequency > 2;
        // Overall deception score
        let deceptionScore = 0;
        if (microExpressionFrequency > 3)
            deceptionScore += 0.3;
        if (emotionMismatch)
            deceptionScore += 0.35;
        if (asymmetricFacialMovement)
            deceptionScore += 0.15;
        if (delayedEmotionOnset)
            deceptionScore += 0.10;
        if (excessiveControlAttempts)
            deceptionScore += 0.20;
        return {
            microExpressionFrequency,
            emotionMismatch,
            asymmetricFacialMovement,
            delayedEmotionOnset,
            excessiveControlAttempts,
            deceptionScore: Math.min(deceptionScore, 1.0),
        };
    }
    /**
     * Calculate stress indicators
     */
    calculateStressIndicators(profile) {
        const timeline = profile.emotionalTimeline;
        const microExpressions = profile.microExpressions;
        // Facial tension (from AU intensity)
        const recentAUs = timeline.slice(-5).map(e => e.actionUnits);
        const auIntensity = recentAUs.map(au => {
            const values = Object.values(au);
            return values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : 0;
        });
        const facialTension = auIntensity.reduce((a, b) => a + b, 0) / Math.max(auIntensity.length, 1);
        // Micro-expression rate
        const durationMinutes = (profile.lastSeen - profile.firstSeen) / 60000;
        const microExpressionRate = microExpressions.length / Math.max(durationMinutes, 1);
        // Emotional volatility
        const emotionalVolatility = 1 - profile.emotionalStability;
        // Negative emotion ratio
        const negativeEmotions = timeline.filter(e => ["sadness", "anger", "fear", "disgust"].includes(e.emotion)).length;
        const negativeEmotionRatio = negativeEmotions / timeline.length;
        // Eye blink rate (simplified - would need eye tracking)
        const eyeBlinkRate = 15 + (facialTension * 20); // Normal is 15-20 per minute
        // Overall stress score
        let stressScore = 0;
        stressScore += facialTension * 0.25;
        stressScore += Math.min(microExpressionRate / 5, 1) * 0.20;
        stressScore += emotionalVolatility * 0.20;
        stressScore += negativeEmotionRatio * 0.25;
        stressScore += Math.max(0, (eyeBlinkRate - 20) / 30) * 0.10;
        return {
            facialTension,
            microExpressionRate,
            emotionalVolatility,
            negativeEmotionRatio,
            eyeBlinkRate,
            stressScore: Math.min(stressScore, 1.0),
        };
    }
    /**
     * Create empty deception indicators
     */
    createEmptyDeceptionIndicators() {
        return {
            microExpressionFrequency: 0,
            emotionMismatch: false,
            asymmetricFacialMovement: false,
            delayedEmotionOnset: false,
            excessiveControlAttempts: false,
            deceptionScore: 0,
        };
    }
    /**
     * Create empty stress indicators
     */
    createEmptyStressIndicators() {
        return {
            facialTension: 0,
            microExpressionRate: 0,
            emotionalVolatility: 0,
            negativeEmotionRatio: 0,
            eyeBlinkRate: 15,
            stressScore: 0,
        };
    }
    /**
     * Cleanup old profiles
     */
    cleanupOldProfiles(currentTime) {
        const timeout = 300000; // 5 minutes
        for (const [trackId, profile] of this.emotionalProfiles.entries()) {
            if (currentTime - profile.lastSeen > timeout) {
                this.emotionalProfiles.delete(trackId);
            }
        }
    }
    /**
     * Get emotional profile for person
     */
    getEmotionalProfile(trackId) {
        return this.emotionalProfiles.get(trackId);
    }
    /**
     * Get all active emotional profiles
     */
    getAllEmotionalProfiles() {
        return Array.from(this.emotionalProfiles.values());
    }
    async cleanup() {
        this.faceDetectionModel = null;
        this.emotionModel = null;
        this.emotionalProfiles.clear();
        this.emotionHistory.clear();
        this.isInitialized = false;
    }
    getHealth() {
        return {
            status: this.isInitialized && this.emotionModel
                ? "healthy"
                : this.isInitialized
                    ? "degraded"
                    : "unhealthy",
            details: this.isInitialized && this.emotionModel
                ? "MindSense emotion ONNX inference active with micro-expression analysis"
                : this.isInitialized
                    ? `MindSense running in observation mode. ${this.modelLoadError ?? "Emotion model unavailable"}`
                    : "MindSense emotion detector not initialized",
            metadata: {
                localEmotionModel: Boolean(this.emotionModel),
                localFaceDetection: Boolean(this.faceDetectionModel),
                activeProfiles: this.emotionalProfiles.size,
                microExpressionEnabled: this.config.microExpressionEnabled,
                deceptionAnalysisEnabled: this.config.deceptionAnalysisEnabled,
                stressAnalysisEnabled: this.config.stressAnalysisEnabled,
            },
        };
    }
}
