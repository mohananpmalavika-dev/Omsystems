/**
 * Helmet Detection
 * Detects whether persons on motorcycles/bicycles are wearing helmets
 * Critical for construction sites and traffic enforcement
 */
import { BaseDetector, calculateIoU, getInferenceObjects, hasInferenceObjects, shouldRunLocalSpecialtyInference } from "./base-detector.js";
import { loadHelmetClassificationInference, loadObjectInference, modelUnavailableReason, } from "../inference/configured-model-inference.js";
import { LocalizedHelmetHeadVerifier } from "../inference/helmet-head-verification.js";
export class HelmetDetector extends BaseDetector {
    headVerifier;
    isModelLoaded = false;
    inference;
    classifier;
    modelLoadError = null;
    MIN_CONFIDENCE;
    PERSON_CONFIDENCE = 0.65;
    // Crop classification cannot distinguish a helmet from every dark object.
    // Without a localized helmet observation, require strong independent person
    // evidence; the Hajipur empty-chair and bare-head alarms scored 0.67/0.83.
    CLASSIFIED_PERSON_CONFIDENCE = 0.9;
    // A clearly framed full person can score below 0.90 on the DVR substream.
    // Keep partial people and the reproduced 0.67/0.83 false alarms excluded;
    // this additional path needs three consecutive positive timestamps.
    FULL_PERSON_CONFIDENCE = 0.85;
    HEAD_REGION_OVERLAP_THRESHOLD = 0.6;
    // Keep the existing alert confidence floor when selecting the motorcycle
    // classifier; generic object-presence thresholds are too low for alerts.
    HELMET_WORN_ALERT_CONFIDENCE = 0.9167;
    // A person crop is only an approximate helmet location. Require a second
    // independent frame when no helmet box is supplied.
    CLASSIFIED_HEAD_CONFIDENCE = 0.9167;
    // Upscaling a thin, distant hair/forehead strip to 224px produced the
    // Hajipur bare-head alarms. Compact fallback needs usable source pixels
    // and agreement from a crop including the area above the person's box.
    MIN_COMPACT_HEAD_PIXELS = 24;
    pendingHeads = new Map();
    fastAlert;
    verificationRequired = false;
    constructor(inference = null, confidenceThreshold = 0.88, classifier = null, fastAlert = process.env.HELMET_FAST_ALERT === "true", headVerifier = null) {
        super("helmet", "1.2.0");
        this.headVerifier = headVerifier;
        this.inference = inference;
        this.classifier = classifier;
        this.MIN_CONFIDENCE = confidenceThreshold;
        this.fastAlert = fastAlert;
    }
    async initialize() {
        try {
            if ((!this.inference && !this.classifier) || this.verificationRequired) {
                this.verificationRequired = true;
                this.classifier ??= await loadHelmetClassificationInference("helmet");
                this.headVerifier ??= new LocalizedHelmetHeadVerifier(await loadObjectInference("helmet-head-localizer", 0.25), this.classifier);
            }
            this.isModelLoaded = true;
            this.modelLoadError = null;
            console.log("Helmet detector loaded local ONNX helmet classifier");
        }
        catch (error) {
            this.inference = null;
            this.isModelLoaded = false;
            this.modelLoadError = error instanceof Error ? error.message : modelUnavailableReason("helmet");
            console.warn(`Helmet detector running in normalized-observation mode: ${this.modelLoadError}`);
        }
    }
    async detect(frame) {
        if (!this.isModelLoaded && !this.inference && !hasInferenceObjects(frame)) {
            return [{
                    detectionType: "helmet",
                    status: "MODEL_UNAVAILABLE",
                    provenance: "LIVE_INFERENCE",
                    confidence: null,
                    objects: [],
                    metadata: {
                        status: "MODEL_UNAVAILABLE",
                        reason: this.modelLoadError ?? "Helmet detection model is not loaded",
                    },
                    executionMetadata: {
                        status: "MODEL_UNAVAILABLE",
                        provenance: "LIVE_INFERENCE",
                        modelId: "helmet-classifier",
                        modelVersion: this.modelVersion,
                        reason: this.modelLoadError ?? "Helmet detection model is not loaded",
                        simulated: false,
                        timestamp: new Date().toISOString(),
                        requiresReview: true,
                    },
                    requiresAlert: false,
                }];
        }
        const candidates = await this.detectHelmetsInFrame(frame);
        const detections = [];
        for (const candidate of candidates) {
            if (candidate.evidenceSource !== "confirmed-head-classification") {
                detections.push(candidate);
                continue;
            }
            if (!this.headVerifier) {
                if (!this.verificationRequired)
                    detections.push(candidate); // Explicitly injected inference providers.
                else
                    this.clearPendingHead(frame.cameraId, candidate.personBoundingBox);
                continue;
            }
            const verified = await this.headVerifier.verify(frame, candidate.personBoundingBox, Math.max(this.MIN_CONFIDENCE, this.HELMET_WORN_ALERT_CONFIDENCE));
            if (!verified) {
                this.clearPendingHead(frame.cameraId, candidate.personBoundingBox);
                continue;
            }
            detections.push({ ...candidate, helmetBoundingBox: verified.boundingBox,
                confidence: Math.min(candidate.confidence ?? 0, verified.classificationConfidence),
                localizationConfidence: verified.localizationConfidence, evidenceSource: "localized-head-classification" });
        }
        const results = [];
        // An observed helmet box alerts immediately; classifier-only head crops
        // must agree across two frames before they become helmet evidence.
        const helmetWearers = detections.filter(d => d.helmetDetected && !d.vehicleType);
        if (helmetWearers.length > 0) {
            const avgConf = this.calculateAverageConfidence(helmetWearers);
            const effectiveConf = avgConf;
            const compliantObjects = helmetWearers.flatMap(detection => [
                {
                    label: "helmet",
                    confidence: detection.confidence ?? effectiveConf,
                    boundingBox: detection.helmetBoundingBox,
                },
                {
                    label: "person",
                    confidence: detection.personConfidence ?? detection.confidence ?? effectiveConf,
                    boundingBox: detection.personBoundingBox,
                },
            ]);
            results.push({
                detectionType: "helmet-worn",
                status: "SUCCESS",
                provenance: this.classifier ? "LIVE_INFERENCE" : "HEURISTIC_RULE_ENGINE",
                confidence: effectiveConf,
                durationSeconds: 1,
                objects: compliantObjects,
                metadata: {
                    compliantCount: helmetWearers.length,
                    threatType: "helmet_worn_inside_facility",
                    evidenceSource: helmetWearers.some((detection) => detection.evidenceSource === "observed-helmet")
                        ? "observed-helmet" : helmetWearers.some(detection => detection.evidenceSource === "localized-head-classification")
                        ? "localized-head-classification" : "confirmed-head-classification",
                    localizedHeads: helmetWearers.filter(detection => detection.localizationConfidence !== undefined).map(detection => ({
                        boundingBox: detection.helmetBoundingBox, localizationConfidence: detection.localizationConfidence,
                    })),
                },
                executionMetadata: {
                    status: "SUCCESS",
                    provenance: this.classifier ? "LIVE_INFERENCE" : "HEURISTIC_RULE_ENGINE",
                    modelId: "helmet-classifier",
                    modelVersion: this.modelVersion,
                    simulated: false,
                    timestamp: new Date().toISOString(),
                },
                requiresAlert: true,
            });
        }
        return results;
    }
    /**
     * Detect helmets in frame
     */
    async detectHelmetsInFrame(frame) {
        const runLocal = shouldRunLocalSpecialtyInference(frame);
        const local = runLocal && this.inference
            ? await this.inference.run(frame)
            : [];
        const observations = [...getInferenceObjects(frame), ...local];
        const persons = observations.filter((item) => item.label === "person")
            .filter((item) => (item.confidence ?? 0) >= this.PERSON_CONFIDENCE);
        const vehicles = observations.filter((item) => item.label === "motorcycle" || item.label === "bicycle")
            .filter((item) => (item.confidence ?? 0) >= this.MIN_CONFIDENCE);
        const helmets = observations.filter((item) => item.label === "helmet")
            .filter((item) => (item.confidence ?? 0) >= Math.max(this.MIN_CONFIDENCE, this.HELMET_WORN_ALERT_CONFIDENCE));
        const heads = observations.filter((item) => item.label === "head")
            .filter((item) => (item.confidence ?? 0) >= this.MIN_CONFIDENCE);
        // A missing helmet alone is not a violation: a high-confidence head
        // observation is required before reporting a rider as unprotected.
        const riderMatches = this.matchPersonsToVehicles(persons, vehicles);
        const riderDetections = await Promise.all(riderMatches
            .map(async (match) => {
            if (runLocal && this.classifier)
                return this.classifyHelmetCompliance(frame, match);
            return this.checkHelmetCompliance(match, helmets, heads);
        }));
        // Use bounding box ID instead of object reference to handle recreated person arrays
        const riderPersonIds = new Set(riderMatches.map((match) => this.getPersonIdentifier(match.person)));
        const indoorPersons = persons.filter((person) => !riderPersonIds.has(this.getPersonIdentifier(person)));
        const indoorHelmetDetections = [];
        // A missing/weak person observation breaks consecutive confirmation. Do
        // not combine an old positive with a later reappearance or another object.
        const pending = this.pendingHeads.get(frame.cameraId);
        if (pending) {
            this.pendingHeads.set(frame.cameraId, pending.filter((item) => indoorPersons.some((person) => (this.hasClassifiablePerson(person) || this.hasRaisedHeadCandidate(person)) &&
                calculateIoU(item.personBox, person.boundingBox) >= 0.5)));
        }
        for (const person of indoorPersons) {
            let presence = this.detectHelmetPresence(person, helmets);
            if (!presence && !this.hasClassifiablePerson(person)) {
                // A seated person's COCO box may begin at the visor/neck. For a large
                // independently observed person, inspect above that box without
                // relaxing the existing torso/compact classification gates. This
                // Background above a bare head can make both raised crops positive.
                // Also require agreement from the head anchored inside the person
                // box; raised context alone cannot establish helmet evidence.
                if (this.hasRaisedHeadCandidate(person) && helmets.length === 0 && runLocal &&
                    this.classifier && frame.imageData?.length) {
                    const box = person.boundingBox;
                    const y = Math.max(0, box.y - box.height * 0.15);
                    const wide = { x: box.x, y, width: box.width, height: Math.min(1 - y, box.height * 0.25) };
                    const narrow = { ...wide, x: box.x + box.width * 0.1, width: box.width * 0.8 };
                    const wideResult = await this.classifier.run(frame, wide);
                    const narrowResult = await this.classifier.run(frame, narrow);
                    const anchoredResult = await this.classifier.run(frame, {
                        x: box.x + box.width * 0.2, y: box.y,
                        width: box.width * 0.6, height: box.height * 0.25,
                    });
                    const confidence = Math.min(wideResult.wearingHelmetConfidence, narrowResult.wearingHelmetConfidence, anchoredResult.wearingHelmetConfidence);
                    if (wideResult.wearingHelmet && narrowResult.wearingHelmet &&
                        anchoredResult.wearingHelmet &&
                        confidence >= Math.max(this.MIN_CONFIDENCE, 0.98)) {
                        const requiredConfirmations = this.fastAlert ? 1 : 3;
                        if (this.confirmClassifiedHead(frame.cameraId, box, frame.timestamp.getTime(), requiredConfirmations, "raised")) {
                            indoorHelmetDetections.push({ personBoundingBox: box, helmetBoundingBox: narrow,
                                helmetDetected: true, evidenceSource: "confirmed-head-classification", confidence,
                                personConfidence: person.confidence ?? 0, riskLevel: "violation" });
                        }
                        continue;
                    }
                }
                this.clearPendingHead(frame.cameraId, person.boundingBox);
                continue;
            }
            // An explicit helmet box elsewhere in the scene is contrary spatial
            // evidence; do not override it with a crop classification.
            if (!presence && (helmets.length > 0 || !runLocal || !this.classifier))
                continue;
            if (runLocal && this.classifier && frame.imageData && frame.imageData.length > 0) {
                let { upperResult, standardResult } = await this.helmetClassifications(frame, person.boundingBox);
                const alertThreshold = presence
                    ? Math.max(this.MIN_CONFIDENCE, this.HELMET_WORN_ALERT_CONFIDENCE)
                    : Math.max(this.MIN_CONFIDENCE, this.CLASSIFIED_HEAD_CONFIDENCE);
                let classifiedHeadBox = this.headRegion(person.boundingBox);
                if (!presence && upperResult.wearingHelmet && standardResult.wearingHelmet &&
                    upperResult.wearingHelmetConfidence >= alertThreshold &&
                    standardResult.wearingHelmetConfidence >= alertThreshold) {
                    // Wide standard crops can classify the chairs behind a bare head as
                    // a helmet. Corroborate inside the central head area, excluding the
                    // lateral background. Contradictory central evidence must reject
                    // this observation rather than retrying progressively wider crops.
                    const box = person.boundingBox;
                    const centeredResult = await this.classifier.run(frame, {
                        x: box.x + box.width * 0.3, y: box.y,
                        width: box.width * 0.4, height: box.height * 0.25,
                    });
                    if (!centeredResult.wearingHelmet || centeredResult.wearingHelmetConfidence < alertThreshold) {
                        this.clearPendingHead(frame.cameraId, person.boundingBox);
                        continue;
                    }
                    standardResult = { ...standardResult, wearingHelmetConfidence: Math.min(standardResult.wearingHelmetConfidence, centeredResult.wearingHelmetConfidence) };
                }
                // A seated person's 35% head region includes much of the pink shirt
                // in the pilot camera. The head classifier rejects that torso crop
                // despite a visible helmet. Require agreement from two compact head
                // crops when the original pair fails, retaining the independent
                // person gate and distinct-frame confirmation above/below.
                if (!presence && (!upperResult.wearingHelmet || !standardResult.wearingHelmet ||
                    upperResult.wearingHelmetConfidence < alertThreshold ||
                    standardResult.wearingHelmetConfidence < alertThreshold)) {
                    const box = person.boundingBox;
                    classifiedHeadBox = {
                        x: box.x + box.width * 0.1, y: box.y,
                        width: box.width * 0.8, height: box.height * 0.15,
                    };
                    if (classifiedHeadBox.width * frame.width < this.MIN_COMPACT_HEAD_PIXELS ||
                        classifiedHeadBox.height * frame.height < this.MIN_COMPACT_HEAD_PIXELS) {
                        this.clearPendingHead(frame.cameraId, person.boundingBox);
                        continue;
                    }
                    upperResult = await this.classifier.run(frame, {
                        x: box.x, y: box.y, width: box.width, height: box.height * 0.15,
                    });
                    standardResult = await this.classifier.run(frame, classifiedHeadBox);
                    const contextY = Math.max(0, box.y - box.height * 0.15);
                    const contextResult = await this.classifier.run(frame, {
                        x: classifiedHeadBox.x, y: contextY, width: classifiedHeadBox.width,
                        height: Math.min(1 - contextY, box.height * 0.25),
                    });
                    // Hair and dark gates can agree on the short compact/context pair.
                    // Validate the crown above the person box and a narrower, taller
                    // crop spanning crown through face. Neither isolated hair strips
                    // nor background alone should establish a compact helmet alert.
                    const crownResult = await this.classifier.run(frame, {
                        x: classifiedHeadBox.x, y: contextY, width: classifiedHeadBox.width,
                        height: Math.min(1 - contextY, box.height * 0.15),
                    });
                    const centeredContextResult = await this.classifier.run(frame, {
                        x: box.x + box.width * 0.2, y: contextY, width: box.width * 0.6,
                        height: Math.min(1 - contextY, box.height * 0.3),
                    });
                    if ([contextResult, crownResult, centeredContextResult].some(result => !result.wearingHelmet || result.wearingHelmetConfidence < alertThreshold)) {
                        this.clearPendingHead(frame.cameraId, person.boundingBox);
                        continue;
                    }
                    // Retain the weakest score from all supporting crops in the event.
                    standardResult = { ...standardResult, wearingHelmetConfidence: Math.min(standardResult.wearingHelmetConfidence, contextResult.wearingHelmetConfidence, crownResult.wearingHelmetConfidence, centeredContextResult.wearingHelmetConfidence) };
                }
                if (!upperResult.wearingHelmet || !standardResult.wearingHelmet ||
                    upperResult.wearingHelmetConfidence < alertThreshold ||
                    standardResult.wearingHelmetConfidence < alertThreshold) {
                    this.clearPendingHead(frame.cameraId, person.boundingBox);
                    continue;
                }
                const confidence = Math.min(presence?.confidence ?? 1, upperResult.wearingHelmetConfidence, standardResult.wearingHelmetConfidence);
                if (!presence) {
                    const confirmations = this.fastAlert
                        ? 1
                        : ((person.confidence ?? 0) >= this.CLASSIFIED_PERSON_CONFIDENCE ? 2 : 3);
                    if (!this.confirmClassifiedHead(frame.cameraId, person.boundingBox, frame.timestamp.getTime(), confirmations))
                        continue;
                    presence = {
                        personBoundingBox: person.boundingBox,
                        helmetBoundingBox: classifiedHeadBox,
                        helmetDetected: true,
                        evidenceSource: "confirmed-head-classification",
                        confidence,
                        personConfidence: person.confidence ?? 0,
                        riskLevel: "violation",
                    };
                }
                else {
                    presence.confidence = confidence;
                }
            }
            if (presence)
                indoorHelmetDetections.push(presence);
        }
        return [...riderDetections, ...indoorHelmetDetections];
    }
    hasClassifiablePerson(person) {
        return (person.confidence ?? 0) >= this.CLASSIFIED_PERSON_CONFIDENCE ||
            ((person.confidence ?? 0) >= this.FULL_PERSON_CONFIDENCE && person.boundingBox.height >= 0.75);
    }
    hasRaisedHeadCandidate(person) {
        return (person.confidence ?? 0) >= 0.8 && person.boundingBox.height >= 0.7;
    }
    confirmClassifiedHead(cameraId, personBox, observedAt, requiredConfirmations = 2, cropMode = "standard") {
        const pending = (this.pendingHeads.get(cameraId) ?? [])
            .filter((item) => observedAt - item.lastSeenAt <= 120_000 && observedAt >= item.lastSeenAt);
        const previous = pending.find((item) => calculateIoU(item.personBox, personBox) >= 0.5);
        if (previous) {
            if (previous.cropMode !== cropMode)
                previous.confirmations = 1;
            else if (observedAt > previous.lastSeenAt)
                previous.confirmations += 1;
            previous.cropMode = cropMode;
            previous.personBox = personBox;
            previous.lastSeenAt = observedAt;
        }
        else {
            pending.push({ personBox, lastSeenAt: observedAt, confirmations: 1, cropMode });
        }
        this.pendingHeads.set(cameraId, pending.slice(-20));
        return (previous?.confirmations ?? 1) >= requiredConfirmations;
    }
    clearPendingHead(cameraId, personBox) {
        const pending = this.pendingHeads.get(cameraId);
        if (!pending)
            return;
        this.pendingHeads.set(cameraId, pending.filter((item) => calculateIoU(item.personBox, personBox) < 0.5));
    }
    /**
     * Generate stable identifier for person (trackId or bounding box hash)
     */
    getPersonIdentifier(person) {
        // Use trackId if available (stable across frame updates)
        if (typeof person.trackId === "string") {
            return person.trackId;
        }
        // Fallback to bounding box coordinates (normalized to avoid floating point issues)
        const box = person.boundingBox ?? {};
        return `${Math.round((box.x ?? 0) * 1000)},${Math.round((box.y ?? 0) * 1000)},${Math.round((box.width ?? 0) * 1000)},${Math.round((box.height ?? 0) * 1000)}`;
    }
    detectHelmetPresence(person, helmets) {
        const headRegion = this.headRegion(person.boundingBox);
        const helmet = helmets
            .filter((candidate) => overlapOfCandidate(headRegion, candidate.boundingBox) >= this.HEAD_REGION_OVERLAP_THRESHOLD)
            .sort((left, right) => (right.confidence ?? 0) - (left.confidence ?? 0))[0];
        if (!helmet)
            return undefined;
        return {
            personBoundingBox: person.boundingBox,
            helmetBoundingBox: helmet.boundingBox,
            helmetDetected: true,
            evidenceSource: "observed-helmet",
            confidence: helmet.confidence ?? null,
            personConfidence: person.confidence ?? 0,
            riskLevel: "violation",
        };
    }
    /**
     * Match persons to nearby vehicles
     */
    matchPersonsToVehicles(persons, vehicles) {
        const matches = [];
        for (const person of persons) {
            for (const vehicle of vehicles) {
                // Check if person bounding box overlaps with vehicle
                const iou = calculateIoU(person.boundingBox, vehicle.boundingBox);
                if (iou > 0.1) {
                    matches.push({ person, vehicle });
                    break;
                }
            }
        }
        return matches;
    }
    /**
     * Check if person is wearing helmet
     */
    checkHelmetCompliance(match, helmets, heads) {
        // Find head in upper portion of person bounding box
        const personBox = match.person.boundingBox;
        const headRegion = this.headRegion(personBox);
        // Find helmets near the head region
        let helmetDetected = false;
        let maxHelmetConfidence = 0;
        for (const helmet of helmets) {
            if (overlapOfCandidate(headRegion, helmet.boundingBox) >= this.HEAD_REGION_OVERLAP_THRESHOLD) {
                helmetDetected = true;
                maxHelmetConfidence = Math.max(maxHelmetConfidence, helmet.confidence ?? 0);
            }
        }
        // Determine risk level
        let riskLevel;
        let confidence;
        if (helmetDetected && maxHelmetConfidence >= this.MIN_CONFIDENCE) {
            riskLevel = "compliant";
            confidence = maxHelmetConfidence;
        }
        else if (!helmetDetected) {
            // Check if we can see the head clearly from actual observation confidence
            const visibleHead = heads.find(head => {
                return overlapOfCandidate(headRegion, head.boundingBox) >= this.HEAD_REGION_OVERLAP_THRESHOLD
                    && (head.confidence ?? 0) >= 0.6;
            });
            if (visibleHead) {
                riskLevel = "violation";
                // Use actual observed head confidence instead of hardcoded 0.85
                confidence = visibleHead.confidence ?? 0.6;
            }
            else {
                // Cannot determine without clear head visibility - return null confidence
                riskLevel = "uncertain";
                confidence = null;
            }
        }
        else {
            riskLevel = "uncertain";
            confidence = maxHelmetConfidence > 0 ? maxHelmetConfidence : null;
        }
        return {
            personBoundingBox: personBox,
            helmetDetected,
            confidence,
            vehicleType: match.vehicle.label,
            riskLevel,
        };
    }
    async classifyHelmetCompliance(frame, match) {
        const personBox = match.person.boundingBox;
        const classification = await this.bestHelmetClassification(frame, personBox);
        const riskLevel = classification.confidence < Math.max(this.MIN_CONFIDENCE, 0.7)
            ? "uncertain"
            : classification.wearingHelmet ? "compliant" : "violation";
        return {
            personBoundingBox: personBox,
            helmetDetected: classification.wearingHelmet,
            confidence: classification.confidence,
            vehicleType: match.vehicle.label,
            riskLevel,
        };
    }
    async bestHelmetClassification(frame, personBox) {
        const { upperResult, standardResult } = await this.helmetClassifications(frame, personBox);
        // If either detects wearing a helmet, prefer the helmet detection
        if (upperResult.wearingHelmet && (!standardResult.wearingHelmet || upperResult.confidence >= standardResult.confidence)) {
            return upperResult;
        }
        if (standardResult.wearingHelmet) {
            return standardResult;
        }
        // Neither detected helmet, return the more confident unwearing result
        return standardResult.confidence > upperResult.confidence ? standardResult : upperResult;
    }
    async helmetClassifications(frame, personBox) {
        // 1. Upper body box (covers head above/beside torso on seated/slouched persons)
        const upperBodyBox = {
            x: Math.max(0, personBox.x - personBox.width * 0.15),
            y: Math.max(0, personBox.y - personBox.height * 0.15),
            width: Math.min(1 - Math.max(0, personBox.x - personBox.width * 0.15), personBox.width * 1.3),
            height: Math.min(1 - Math.max(0, personBox.y - personBox.height * 0.15), personBox.height * 0.55),
        };
        const upperResult = await this.classifier.run(frame, upperBodyBox);
        // 2. Standard head region
        const standardHeadBox = this.headRegion(personBox);
        const standardResult = await this.classifier.run(frame, standardHeadBox);
        return { upperResult, standardResult };
    }
    headRegion(personBox) {
        return {
            x: personBox.x + (personBox.width * 0.1),
            y: personBox.y,
            width: personBox.width * 0.8,
            height: personBox.height * 0.35,
        };
    }
    calculateAverageConfidence(detections) {
        const validConfidences = detections
            .map(d => d.confidence)
            .filter((c) => c !== null && typeof c === "number");
        if (validConfidences.length === 0)
            return null;
        const sum = validConfidences.reduce((acc, c) => acc + c, 0);
        return sum / validConfidences.length;
    }
    async cleanup() {
        this.pendingHeads.clear();
        this.inference = null;
        this.classifier = null;
        this.headVerifier = null;
        this.isModelLoaded = false;
        console.log("Helmet detector cleaned up");
    }
    getHealth() {
        return {
            status: this.isModelLoaded ? "healthy" : "degraded",
            details: this.isModelLoaded
                ? "Helmet classifier active; production crop alerts require independent head localization and classification agreement"
                : `Awaiting local helmet classifier; normalized observations remain supported. ${this.modelLoadError ?? "Model unavailable"}`,
        };
    }
}
/** Portion of a small head/helmet box contained by a person's head region. */
function overlapOfCandidate(region, candidate) {
    const left = Math.max(region.x, candidate.x);
    const top = Math.max(region.y, candidate.y);
    const right = Math.min(region.x + region.width, candidate.x + candidate.width);
    const bottom = Math.min(region.y + region.height, candidate.y + candidate.height);
    const intersection = Math.max(0, right - left) * Math.max(0, bottom - top);
    const candidateArea = candidate.width * candidate.height;
    return candidateArea > 0 ? intersection / candidateArea : 0;
}
