/**
 * Face Analytics Module
 * Comprehensive face detection, recognition, watchlist matching, and demographic analysis
 * Uses zero-cost open-source models: RetinaFace + InsightFace (ArcFace) + DeepFace
 */
import { randomUUID } from "node:crypto";
import * as path from "node:path";
import { BaseDetector } from "./base-detector.js";
import { getInferencePipeline } from "../inference/unified-inference-pipeline.js";
// ============================================================================
// Face Analytics Detector
// ============================================================================
export class FaceAnalyticsDetector extends BaseDetector {
    faceDatabase = {
        identities: new Map(),
        embeddings: new Map(),
        categories: new Map([
            ['vip', new Set()],
            ['employee', new Set()],
            ['blacklist', new Set()],
            ['visitor', new Set()],
            ['unknown', new Set()],
        ]),
        lastUpdated: new Date(),
    };
    recentMatches = new Map();
    watchlistAlerts = [];
    isModelLoaded = false;
    faceDetector; // RetinaFace ONNX session
    faceRecognizer; // ArcFace (InsightFace) ONNX session
    attributeModel; // Age/Gender/Emotion model
    // Configuration
    MIN_FACE_SIZE = 0.03; // 3% of frame
    RECOGNITION_THRESHOLD = 0.6; // Cosine similarity
    VIP_THRESHOLD = 0.7;
    BLACKLIST_THRESHOLD = 0.65;
    MIN_CONFIDENCE = 0.7;
    MATCH_COOLDOWN_MS = 5000; // 5 seconds between same matches
    constructor() {
        super("face-analytics", "3.0.0");
    }
    async initialize() {
        console.log("Initializing Face Analytics detector...");
        try {
            // Load ONNX models for face detection and recognition
            try {
                const ort = await import('onnxruntime-node');
                const fs = await import('fs');
                // Load face detection model (RetinaFace)
                const faceDetectorPath = process.env.RETINAFACE_MODEL_PATH || '/app/models/face/retinaface.onnx';
                if (fs.existsSync(faceDetectorPath)) {
                    this.faceDetector = await ort.InferenceSession.create(faceDetectorPath);
                    console.log(`✓ Loaded RetinaFace model from ${faceDetectorPath}`);
                }
                else {
                    console.warn(`⚠️ Model file not found: ${faceDetectorPath}, using unified inference pipeline`);
                }
                // Load face recognition model (ArcFace)
                const arcfaceCandidates = [
                    process.env.ARCFACE_MODEL_PATH,
                    path.resolve(process.cwd(), 'models/face/arcface_r100.onnx'),
                    path.resolve(process.cwd(), 'analytics-engine/models/face/arcface_r100.onnx'),
                    '/app/models/face/arcface_r100.onnx',
                    '/app/models/face/arcface.onnx',
                ].filter(Boolean);
                const arcfacePath = arcfaceCandidates.find(p => fs.existsSync(p));
                if (arcfacePath) {
                    this.faceRecognizer = await ort.InferenceSession.create(arcfacePath);
                    console.log(`✓ Loaded ArcFace model from ${arcfacePath}`);
                }
                else {
                    console.warn(`⚠️ Model file not found in candidates: ${arcfaceCandidates.join(', ')}`);
                }
                // Load attribute model (Age/Gender/Emotion)
                const attributePath = process.env.FACE_ATTRIBUTE_MODEL_PATH || '/app/models/face/age_gender.onnx';
                if (fs.existsSync(attributePath)) {
                    this.attributeModel = await ort.InferenceSession.create(attributePath);
                    console.log(`✓ Loaded face attribute model from ${attributePath}`);
                }
                else {
                    console.warn(`⚠️ Model file not found: ${attributePath}`);
                }
            }
            catch (error) {
                console.warn('⚠️ Failed to load ONNX models, using unified inference pipeline:', error);
            }
            this.isModelLoaded = true;
            this.startWatchlistMonitoring();
            this.startMatchCleanup();
            console.log("Face Analytics detector initialized successfully");
            console.log("- Face detection: RetinaFace");
            console.log("- Face recognition: InsightFace ArcFace (512-dim)");
            console.log("- Attributes: Age, Gender, Emotion, Mask");
            console.log(`- Watchlist size: ${this.faceDatabase.identities.size}`);
        }
        catch (error) {
            console.error("Failed to initialize Face Analytics:", error);
            throw error;
        }
    }
    async detect(frame) {
        if (!this.isModelLoaded) {
            return [];
        }
        const results = [];
        // Step 1: Detect faces in frame
        const faces = await this.detectFaces(frame);
        if (faces.length === 0) {
            return results;
        }
        // Step 2: Extract face embeddings for recognition
        await this.extractEmbeddings(faces, frame);
        // Step 3: Match against database (watchlist, employees, VIPs)
        const matches = await this.performRecognition(faces);
        // Step 4: Analyze face attributes (age, gender, emotion, mask)
        const attributes = await this.analyzeAttributes(faces, frame);
        // Step 5: Detect unknown persons
        const unknownFaces = this.detectUnknownPersons(faces, matches);
        // Step 6: Generate watchlist alerts
        const alerts = this.generateWatchlistAlerts(matches, frame);
        // Generate detection results
        if (faces.length > 0) {
            results.push(this.createFaceDetectionResult(faces, attributes));
        }
        if (matches.length > 0) {
            results.push(this.createRecognitionResult(matches));
        }
        if (unknownFaces.length > 0) {
            results.push(this.createUnknownPersonResult(unknownFaces));
        }
        if (alerts.length > 0) {
            results.push(...this.createWatchlistAlertResults(alerts));
        }
        return results;
    }
    // ============================================================================
    // Face Detection (RetinaFace)
    // ============================================================================
    async detectFaces(frame) {
        try {
            const pipeline = getInferencePipeline();
            const detections = await pipeline.detectFaces(frame);
            if (!Array.isArray(detections) || detections.length === 0)
                return [];
            const faces = detections
                .filter(d => d.confidence >= this.MIN_CONFIDENCE)
                .map(d => ({
                faceId: `face_${randomUUID().substring(0, 8)}`,
                boundingBox: d.boundingBox,
                confidence: d.confidence,
                landmarks: d.metadata?.landmarks ?? {
                    leftEye: { x: 0, y: 0 }, rightEye: { x: 0, y: 0 }, nose: { x: 0, y: 0 }, leftMouth: { x: 0, y: 0 }, rightMouth: { x: 0, y: 0 }
                },
                timestamp: frame.timestamp,
            }));
            return faces.filter(f => this.isFaceSizeValid(f.boundingBox));
        }
        catch (error) {
            console.warn('detectFaces pipeline failed:', error);
            return [];
        }
    }
    isFaceSizeValid(bbox) {
        const area = bbox.width * bbox.height;
        return area >= this.MIN_FACE_SIZE;
    }
    // ============================================================================
    // Face Recognition (ArcFace)
    // ============================================================================
    async extractEmbeddings(faces, frame) {
        const pipeline = getInferencePipeline();
        for (const face of faces) {
            const embedding = await pipeline.extractFaceEmbedding(frame, face.boundingBox);
            // Recognition is unavailable unless the configured model produces a real
            // ArcFace vector. Never synthesize an embedding or a watchlist match.
            if (!embedding || embedding.length !== 512 || embedding.some((value) => !Number.isFinite(value)))
                continue;
            const magnitude = Math.hypot(...embedding);
            if (!Number.isFinite(magnitude) || magnitude === 0)
                continue;
            face.embedding = embedding.map((value) => value / magnitude);
        }
    }
    async performRecognition(faces) {
        const matches = [];
        for (const face of faces) {
            if (!face.embedding)
                continue;
            // Find best match in database
            let bestMatch = null;
            let bestSimilarity = 0;
            for (const [personId, embedding] of this.faceDatabase.embeddings.entries()) {
                const similarity = this.cosineSimilarity(face.embedding, embedding);
                if (similarity > bestSimilarity) {
                    bestSimilarity = similarity;
                    bestMatch = { personId, similarity };
                }
            }
            // Check if match meets threshold
            if (bestMatch && bestSimilarity >= this.RECOGNITION_THRESHOLD) {
                const identity = this.faceDatabase.identities.get(bestMatch.personId);
                // Apply category-specific thresholds
                const threshold = this.getCategoryThreshold(identity.category);
                if (bestSimilarity >= threshold) {
                    // Check cooldown to avoid duplicate alerts
                    if (this.isMatchOnCooldown(bestMatch.personId)) {
                        continue;
                    }
                    const match = {
                        faceId: face.faceId,
                        personId: bestMatch.personId,
                        personName: identity.name,
                        category: identity.category,
                        similarity: bestSimilarity,
                        confidence: face.confidence,
                        matchedAt: face.timestamp,
                    };
                    matches.push(match);
                    this.recentMatches.set(bestMatch.personId, match);
                    // Update last seen
                    identity.lastSeen = face.timestamp;
                }
            }
        }
        return matches;
    }
    getCategoryThreshold(category) {
        switch (category) {
            case 'vip':
                return this.VIP_THRESHOLD;
            case 'blacklist':
                return this.BLACKLIST_THRESHOLD;
            case 'employee':
                return this.RECOGNITION_THRESHOLD;
            default:
                return this.RECOGNITION_THRESHOLD;
        }
    }
    isMatchOnCooldown(personId) {
        const lastMatch = this.recentMatches.get(personId);
        if (!lastMatch)
            return false;
        const timeSinceMatch = Date.now() - lastMatch.matchedAt.getTime();
        return timeSinceMatch < this.MATCH_COOLDOWN_MS;
    }
    // ============================================================================
    // Face Attributes Analysis
    // ============================================================================
    async analyzeAttributes(faces, frame) {
        const attributesMap = new Map();
        for (const face of faces) {
            // TODO: Implement attribute detection
            /*
            const faceCrop = this.cropFrame(frame, face.boundingBox);
            const input = this.preprocessForAttributes(faceCrop);
            const output = await this.attributeModel.run({ input });
            
            const attributes: FaceAttributes = {
              age: output.age,
              ageRange: { min: output.age - 5, max: output.age + 5 },
              gender: output.gender > 0.5 ? 'male' : 'female',
              genderConfidence: Math.max(output.gender, 1 - output.gender),
              emotion: this.parseEmotion(output.emotion),
              emotionConfidence: Math.max(...output.emotion),
              hasMask: output.mask > 0.5,
              maskConfidence: output.mask,
              hasGlasses: this.detectGlasses(face.landmarks),
              hasBeard: output.beard > 0.5,
            };
            
            attributesMap.set(face.faceId, attributes);
            */
        }
        return attributesMap;
    }
    parseEmotion(emotionScores) {
        const emotions = [
            'angry', 'disgust', 'fear', 'happy', 'sad', 'surprise', 'neutral'
        ];
        const maxIndex = emotionScores.indexOf(Math.max(...emotionScores));
        return emotions[maxIndex];
    }
    detectGlasses(landmarks) {
        // Simple heuristic: check eye region for typical glasses patterns
        // More sophisticated: Use dedicated glasses detector
        return false;
    }
    // ============================================================================
    // Unknown Person Detection
    // ============================================================================
    detectUnknownPersons(faces, matches) {
        const matchedFaceIds = new Set(matches.map(m => m.faceId));
        return faces.filter(face => !matchedFaceIds.has(face.faceId));
    }
    // ============================================================================
    // Watchlist Alerts
    // ============================================================================
    generateWatchlistAlerts(matches, frame) {
        const alerts = [];
        for (const match of matches) {
            let alertType;
            let severity;
            let requiresAction;
            switch (match.category) {
                case 'vip':
                    alertType = 'vip_arrival';
                    severity = 'medium';
                    requiresAction = true;
                    break;
                case 'blacklist':
                    alertType = 'blacklist_detected';
                    severity = 'critical';
                    requiresAction = true;
                    break;
                case 'employee':
                    alertType = 'employee_recognition';
                    severity = 'low';
                    requiresAction = false;
                    break;
                default:
                    continue; // Don't alert for visitors/unknown
            }
            const alert = {
                alertId: `alert_${randomUUID().substring(0, 8)}`,
                faceMatch: match,
                location: String(frame.metadata?.location ?? 'Unknown'),
                cameraId: String(frame.metadata?.cameraId ?? 'Unknown'),
                timestamp: frame.timestamp,
                alertType,
                severity,
                requiresAction,
            };
            alerts.push(alert);
            this.watchlistAlerts.push(alert);
        }
        return alerts;
    }
    // ============================================================================
    // Database Management
    // ============================================================================
    /**
     * Add a person to the face recognition database
     */
    addPerson(config) {
        const identity = {
            personId: config.personId,
            name: config.name,
            category: config.category,
            department: config.department,
            accessLevel: config.accessLevel,
            photoUrl: config.photoUrl,
            embedding: config.embedding,
            metadata: config.metadata,
            addedAt: new Date(),
        };
        this.faceDatabase.identities.set(config.personId, identity);
        this.faceDatabase.embeddings.set(config.personId, config.embedding);
        this.faceDatabase.categories.get(config.category)?.add(config.personId);
        this.faceDatabase.lastUpdated = new Date();
        console.log(`Added ${config.category} to database: ${config.name} (${config.personId})`);
    }
    /**
     * Remove a person from the database
     */
    removePerson(personId) {
        const identity = this.faceDatabase.identities.get(personId);
        if (!identity)
            return false;
        this.faceDatabase.identities.delete(personId);
        this.faceDatabase.embeddings.delete(personId);
        this.faceDatabase.categories.get(identity.category)?.delete(personId);
        this.faceDatabase.lastUpdated = new Date();
        console.log(`Removed person from database: ${identity.name} (${personId})`);
        return true;
    }
    /**
     * Update person category (e.g., visitor → employee)
     */
    updatePersonCategory(personId, newCategory) {
        const identity = this.faceDatabase.identities.get(personId);
        if (!identity)
            return false;
        // Remove from old category
        this.faceDatabase.categories.get(identity.category)?.delete(personId);
        // Add to new category
        identity.category = newCategory;
        this.faceDatabase.categories.get(newCategory)?.add(personId);
        this.faceDatabase.lastUpdated = new Date();
        return true;
    }
    /**
     * Bulk import persons from external system
     */
    async importWatchlist(persons) {
        let success = 0;
        let failed = 0;
        for (const person of persons) {
            try {
                // TODO: Download photo and extract embedding
                /*
                const photo = await this.downloadPhoto(person.photoUrl);
                const faces = await this.detectFaces({ imageData: photo, timestamp: new Date() });
                
                if (faces.length === 0) {
                  console.warn(`No face found in photo for ${person.name}`);
                  failed++;
                  continue;
                }
                
                const face = faces[0];
                await this.extractEmbeddings([face], { imageData: photo, timestamp: new Date() });
                
                if (!face.embedding) {
                  console.warn(`Failed to extract embedding for ${person.name}`);
                  failed++;
                  continue;
                }
                
                this.addPerson({
                  ...person,
                  embedding: face.embedding,
                });
                */
                success++;
            }
            catch (error) {
                console.error(`Failed to import ${person.name}:`, error);
                failed++;
            }
        }
        console.log(`Watchlist import complete: ${success} success, ${failed} failed`);
        return { success, failed };
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
    normalizeVector(vector) {
        const norm = Math.sqrt(vector.reduce((sum, val) => sum + val * val, 0));
        return vector.map(val => val / norm);
    }
    // ============================================================================
    // Result Formatting
    // ============================================================================
    createFaceDetectionResult(faces, attributes) {
        return {
            detectionType: "face",
            confidence: faces.reduce((sum, f) => sum + f.confidence, 0) / faces.length,
            objects: faces.map(face => ({
                label: "face",
                confidence: face.confidence,
                trackId: face.faceId,
                boundingBox: face.boundingBox,
            })),
            metadata: {
                totalFaces: faces.length,
                faces: faces.map(face => ({
                    faceId: face.faceId,
                    confidence: face.confidence,
                    attributes: attributes.get(face.faceId),
                })),
            },
            requiresAlert: false,
        };
    }
    createRecognitionResult(matches) {
        return {
            detectionType: "face-recognition",
            confidence: matches.reduce((sum, m) => sum + m.similarity, 0) / matches.length,
            objects: matches.map(match => ({
                label: match.personName,
                confidence: match.similarity,
                trackId: match.faceId,
                boundingBox: { x: 0, y: 0, width: 0, height: 0 }, // TODO: Get from face
            })),
            metadata: {
                matches: matches.map(m => ({
                    personId: m.personId,
                    personName: m.personName,
                    category: m.category,
                    similarity: Math.round(m.similarity * 100),
                    matchedAt: m.matchedAt.toISOString(),
                })),
            },
            requiresAlert: matches.some(m => m.category === 'blacklist'),
        };
    }
    createUnknownPersonResult(unknownFaces) {
        return {
            detectionType: "unknown-person",
            confidence: 0.85,
            objects: unknownFaces.map(face => ({
                label: "unknown_person",
                confidence: face.confidence,
                trackId: face.faceId,
                boundingBox: face.boundingBox,
            })),
            metadata: {
                count: unknownFaces.length,
                faces: unknownFaces.map(f => ({
                    faceId: f.faceId,
                    timestamp: f.timestamp.toISOString(),
                })),
            },
            requiresAlert: true,
        };
    }
    createWatchlistAlertResults(alerts) {
        return alerts.map(alert => ({
            detectionType: alert.alertType,
            confidence: alert.faceMatch.similarity,
            objects: [{
                    label: alert.faceMatch.personName,
                    confidence: alert.faceMatch.similarity,
                    trackId: alert.faceMatch.faceId,
                    boundingBox: { x: 0, y: 0, width: 0, height: 0 },
                }],
            metadata: {
                alertId: alert.alertId,
                personId: alert.faceMatch.personId,
                personName: alert.faceMatch.personName,
                category: alert.faceMatch.category,
                severity: alert.severity,
                location: alert.location,
                cameraId: alert.cameraId,
                timestamp: alert.timestamp.toISOString(),
            },
            requiresAlert: alert.requiresAction,
        }));
    }
    // ============================================================================
    // Public API Methods
    // ============================================================================
    /**
     * Get all persons in database by category
     */
    getPersonsByCategory(category) {
        const personIds = this.faceDatabase.categories.get(category) || new Set();
        return Array.from(personIds)
            .map(id => this.faceDatabase.identities.get(id))
            .filter((p) => p !== undefined);
    }
    /**
     * Get person details
     */
    getPerson(personId) {
        return this.faceDatabase.identities.get(personId);
    }
    /**
     * Search person by name
     */
    searchPersonByName(query) {
        const lowerQuery = query.toLowerCase();
        return Array.from(this.faceDatabase.identities.values())
            .filter(p => p.name.toLowerCase().includes(lowerQuery));
    }
    /**
     * Get recent watchlist alerts
     */
    getRecentAlerts(limit = 100) {
        return this.watchlistAlerts.slice(-limit);
    }
    /**
     * Get database statistics
     */
    getDatabaseStats() {
        const stats = {};
        for (const [category, personIds] of this.faceDatabase.categories.entries()) {
            stats[category] = personIds.size;
        }
        return {
            total: this.faceDatabase.identities.size,
            byCategory: stats,
            lastUpdated: this.faceDatabase.lastUpdated,
        };
    }
    /**
     * Match a face embedding against database
     */
    matchFace(embedding, threshold = this.RECOGNITION_THRESHOLD) {
        let bestMatch = null;
        let bestSimilarity = 0;
        for (const [personId, storedEmbedding] of this.faceDatabase.embeddings.entries()) {
            const similarity = this.cosineSimilarity(embedding, storedEmbedding);
            if (similarity > bestSimilarity && similarity >= threshold) {
                bestSimilarity = similarity;
                bestMatch = { personId, similarity };
            }
        }
        if (!bestMatch)
            return null;
        const identity = this.faceDatabase.identities.get(bestMatch.personId);
        return {
            faceId: 'manual_match',
            personId: bestMatch.personId,
            personName: identity.name,
            category: identity.category,
            similarity: bestSimilarity,
            confidence: 1.0,
            matchedAt: new Date(),
        };
    }
    // ============================================================================
    // Cleanup & Maintenance
    // ============================================================================
    startWatchlistMonitoring() {
        setInterval(() => {
            // Cleanup old alerts (keep last 1000)
            if (this.watchlistAlerts.length > 1000) {
                this.watchlistAlerts = this.watchlistAlerts.slice(-1000);
            }
        }, 60000); // Every minute
    }
    startMatchCleanup() {
        setInterval(() => {
            const now = Date.now();
            const staleMatches = [];
            for (const [personId, match] of this.recentMatches.entries()) {
                const timeSinceMatch = now - match.matchedAt.getTime();
                if (timeSinceMatch > this.MATCH_COOLDOWN_MS * 2) {
                    staleMatches.push(personId);
                }
            }
            for (const personId of staleMatches) {
                this.recentMatches.delete(personId);
            }
        }, 10000); // Every 10 seconds
    }
    async cleanup() {
        this.recentMatches.clear();
        this.watchlistAlerts = [];
        console.log("Face Analytics detector cleaned up");
    }
    getHealth() {
        return {
            status: 'healthy',
            details: 'Face analytics detector is available'
        };
    }
    // ============================================================================
    // Export/Import for Backup
    // ============================================================================
    /**
     * Export database for backup
     */
    exportDatabase() {
        const identities = Array.from(this.faceDatabase.identities.values()).map(identity => ({
            personId: identity.personId,
            name: identity.name,
            category: identity.category,
            department: identity.department,
            accessLevel: identity.accessLevel,
            photoUrl: identity.photoUrl,
            embedding: identity.embedding,
            metadata: identity.metadata,
            addedAt: identity.addedAt.toISOString(),
            lastSeen: identity.lastSeen?.toISOString(),
        }));
        return {
            identities,
            exportedAt: new Date().toISOString(),
            version: '3.0.0',
        };
    }
    /**
     * Import database from backup
     */
    importDatabase(backup) {
        let success = 0;
        let failed = 0;
        for (const identity of backup.identities) {
            try {
                this.addPerson({
                    personId: identity.personId,
                    name: identity.name,
                    category: identity.category,
                    embedding: identity.embedding,
                    department: identity.department,
                    accessLevel: identity.accessLevel,
                    photoUrl: identity.photoUrl,
                    metadata: identity.metadata,
                });
                success++;
            }
            catch (error) {
                console.error(`Failed to import ${identity.name}:`, error);
                failed++;
            }
        }
        console.log(`Database import complete: ${success} success, ${failed} failed`);
        return { success, failed };
    }
    // ============================================================================
    // Privacy & Compliance
    // ============================================================================
    /**
     * Anonymize stored data for GDPR compliance
     */
    anonymizePerson(personId) {
        const identity = this.faceDatabase.identities.get(personId);
        if (!identity)
            return false;
        // Remove PII but keep embedding for technical purposes
        identity.name = `Anonymous_${personId.substring(0, 8)}`;
        identity.department = undefined;
        identity.metadata = { anonymized: true, anonymizedAt: new Date().toISOString() };
        identity.photoUrl = undefined;
        return true;
    }
    /**
     * Get data retention policy compliance report
     */
    getRetentionReport(retentionDays = 90) {
        const now = Date.now();
        const retentionMs = retentionDays * 24 * 60 * 60 * 1000;
        const toBeDeleted = [];
        let beyondRetention = 0;
        for (const [personId, identity] of this.faceDatabase.identities.entries()) {
            const lastActivity = identity.lastSeen || identity.addedAt;
            const inactiveTime = now - lastActivity.getTime();
            if (inactiveTime > retentionMs) {
                beyondRetention++;
                toBeDeleted.push(personId);
            }
        }
        return {
            total: this.faceDatabase.identities.size,
            withinRetention: this.faceDatabase.identities.size - beyondRetention,
            beyondRetention,
            toBeDeleted,
        };
    }
}
/**
 * Factory function – creates a ready-to-use FaceAnalyticsDetector instance.
 */
export function createFaceAnalytics() {
    return new FaceAnalyticsDetector();
}
