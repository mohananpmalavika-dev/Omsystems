/**
 * Banking Analytics Module
 * Specialized analytics for banking and financial institutions
 * Monitors teller operations, vault security, ATM, and cash handling compliance
 * Uses zero-cost open-source models: YOLOv8 + Zone Analysis + Custom Rules
 */
import { randomUUID } from "node:crypto";
import { BaseDetector } from "./base-detector.js";
// ============================================================================
// Banking Analytics Detector
// ============================================================================
export class BankingAnalyticsDetector extends BaseDetector {
    tellerStations = new Map();
    vaultMonitors = new Map();
    atmMonitors = new Map();
    cashVanMonitors = new Map();
    strongRoomMonitors = new Map();
    dualControlZones = new Map();
    isModelLoaded = false;
    objectDetector; // YOLOv8 for object detection
    // Configuration
    UNATTENDED_THRESHOLD_MS = 30000; // 30 seconds
    VAULT_DOOR_OPEN_MAX_MS = 120000; // 2 minutes
    ATM_SESSION_MAX_MS = 180000; // 3 minutes
    ATM_QUEUE_MAX_LENGTH = 5;
    DUAL_CONTROL_GRACE_PERIOD_MS = 10000; // 10 seconds
    constructor() {
        super("banking-analytics", "3.0.0");
    }
    async initialize() {
        console.log("Initializing Banking Analytics detector...");
        try {
            // Load ONNX models for object detection
            try {
                const ort = await import('onnxruntime-node');
                const modelPath = process.env.YOLO_MODEL_PATH || '/app/models/detection/yolov8m.onnx';
                // Check if model file exists before loading
                const fs = await import('fs');
                if (fs.existsSync(modelPath)) {
                    this.objectDetector = await ort.InferenceSession.create(modelPath);
                    console.log(`✓ Loaded YOLOv8 model from ${modelPath}`);
                }
                else {
                    console.warn(`⚠️ Model file not found: ${modelPath}, using unified inference pipeline`);
                    this.objectDetector = null;
                }
            }
            catch (error) {
                console.warn('⚠️ Failed to load ONNX models, using unified inference pipeline:', error);
                this.objectDetector = null;
            }
            this.isModelLoaded = true;
            this.startTellerMonitoring();
            this.startVaultMonitoring();
            this.startATMMonitoring();
            this.startComplianceMonitoring();
            console.log("Banking Analytics detector initialized successfully");
            console.log(`- Teller stations: ${this.tellerStations.size}`);
            console.log(`- Vault monitors: ${this.vaultMonitors.size}`);
            console.log(`- ATM monitors: ${this.atmMonitors.size}`);
        }
        catch (error) {
            console.error("Failed to initialize Banking Analytics:", error);
            throw error;
        }
    }
    async detect(frame) {
        if (!this.isModelLoaded) {
            return [];
        }
        const results = [];
        // Step 1: Detect persons in frame
        const persons = await this.detectPersons(frame);
        // Step 2: Monitor teller stations
        const tellerResults = this.monitorTellerStations(persons, frame);
        results.push(...tellerResults);
        // Step 3: Monitor vault access
        const vaultResults = this.monitorVaults(persons, frame);
        results.push(...vaultResults);
        // Step 4: Monitor ATMs
        const atmResults = this.monitorATMs(persons, frame);
        results.push(...atmResults);
        // Step 5: Monitor cash van operations
        const cashVanResults = this.monitorCashVans(persons, frame);
        results.push(...cashVanResults);
        // Step 6: Monitor strong room access
        const strongRoomResults = this.monitorStrongRooms(persons, frame);
        results.push(...strongRoomResults);
        // Step 7: Check dual control compliance
        const dualControlResults = this.checkDualControlCompliance(persons, frame);
        results.push(...dualControlResults);
        return results;
    }
    // ============================================================================
    // Person Detection
    // ============================================================================
    async detectPersons(frame) {
        const { getInferenceObjects, hasInferenceObjects } = await import("./base-detector.js");
        const pipeline = await import('../inference/unified-inference-pipeline.js').then(m => m.getInferencePipeline());
        try {
            const detections = await pipeline.detectObjects(frame, ['person', 'vehicle']);
            if (detections && detections.length > 0) {
                return detections.filter((d) => d.label === 'person');
            }
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
    // ============================================================================
    // Teller Station Monitoring
    // ============================================================================
    monitorTellerStations(persons, frame) {
        const results = [];
        for (const [stationId, station] of this.tellerStations.entries()) {
            // Find persons at this teller station
            const personsAtStation = persons.filter(p => this.isPointInPolygon(this.getPersonCenter(p), station.polygon));
            // Update teller presence
            const wasTellerPresent = station.tellerPresent;
            station.tellerPresent = personsAtStation.length > 0;
            station.customerPresent = personsAtStation.length > 1;
            // Check for violations
            if (station.cashTrayOpen && !station.tellerPresent) {
                const violation = this.createTellerViolation(stationId, 'cash_tray_open_unattended', frame.timestamp);
                results.push(this.createTellerViolationResult(violation));
            }
            if (station.transactionInProgress && !station.tellerPresent) {
                const timeSinceActivity = frame.timestamp.getTime() - station.lastActivity.getTime();
                if (timeSinceActivity > this.UNATTENDED_THRESHOLD_MS) {
                    const violation = this.createTellerViolation(stationId, 'unattended_station', frame.timestamp);
                    results.push(this.createTellerViolationResult(violation));
                }
            }
            // Detect teller return (violation resolution)
            if (!wasTellerPresent && station.tellerPresent) {
                this.resolveTellerViolations(stationId);
            }
            // Update last activity
            if (station.tellerPresent) {
                station.lastActivity = frame.timestamp;
            }
        }
        return results;
    }
    createTellerViolation(stationId, type, timestamp) {
        const station = this.tellerStations.get(stationId);
        // Check if violation already exists
        const existingViolation = station.violations.find(v => v.violationType === type && !v.resolved);
        if (existingViolation) {
            existingViolation.duration = (timestamp.getTime() - existingViolation.startTime.getTime()) / 1000;
            return existingViolation;
        }
        // Create new violation
        const violation = {
            violationId: `teller_violation_${randomUUID().substring(0, 8)}`,
            stationId,
            violationType: type,
            severity: this.getTellerViolationSeverity(type),
            startTime: timestamp,
            duration: 0,
            resolved: false,
        };
        station.violations.push(violation);
        return violation;
    }
    getTellerViolationSeverity(type) {
        switch (type) {
            case 'cash_tray_open_unattended':
                return 'critical';
            case 'unauthorized_access':
                return 'high';
            case 'dual_control_violation':
                return 'high';
            case 'unattended_station':
                return 'medium';
            default:
                return 'medium';
        }
    }
    resolveTellerViolations(stationId) {
        const station = this.tellerStations.get(stationId);
        if (!station)
            return;
        for (const violation of station.violations) {
            if (!violation.resolved) {
                violation.resolved = true;
            }
        }
    }
    // ============================================================================
    // Vault Monitoring
    // ============================================================================
    monitorVaults(persons, frame) {
        const results = [];
        for (const [vaultId, vault] of this.vaultMonitors.entries()) {
            // Detect persons in vault access zone
            const personsNearVault = persons.filter(p => this.isPointInPolygon(this.getPersonCenter(p), vault.accessZone));
            vault.personsInside = personsNearVault.length;
            // Check dual control requirement
            if (vault.requiresDualControl && vault.doorStatus === 'open') {
                if (personsNearVault.length === 1) {
                    const violation = this.createVaultViolation(vaultId, 'dual_control_violation', frame.timestamp, personsNearVault.map(p => p.trackId));
                    results.push(this.createVaultViolationResult(violation));
                }
            }
            // Check for unauthorized access
            for (const person of personsNearVault) {
                const personId = person.personId; // From face recognition
                if (personId && !vault.authorizedPersons.includes(personId)) {
                    const violation = this.createVaultViolation(vaultId, 'unauthorized_access', frame.timestamp, [person.trackId]);
                    results.push(this.createVaultViolationResult(violation));
                }
            }
            // Check if vault door open too long
            if (vault.doorStatus === 'open') {
                const doorOpenDuration = frame.timestamp.getTime() - vault.lastDoorChange.getTime();
                if (doorOpenDuration > this.VAULT_DOOR_OPEN_MAX_MS) {
                    const violation = this.createVaultViolation(vaultId, 'door_open_too_long', frame.timestamp, []);
                    results.push(this.createVaultViolationResult(violation));
                }
            }
        }
        return results;
    }
    createVaultViolation(vaultId, type, timestamp, persons) {
        const vault = this.vaultMonitors.get(vaultId);
        const existingViolation = vault.violations.find(v => v.violationType === type && !v.resolved);
        if (existingViolation) {
            existingViolation.duration = (timestamp.getTime() - existingViolation.timestamp.getTime()) / 1000;
            return existingViolation;
        }
        const violation = {
            violationId: `vault_violation_${randomUUID().substring(0, 8)}`,
            vaultId,
            violationType: type,
            severity: type === 'unauthorized_access' ? 'critical' : 'high',
            timestamp,
            duration: 0,
            persons,
            resolved: false,
        };
        vault.violations.push(violation);
        return violation;
    }
    // ============================================================================
    // ATM Monitoring
    // ============================================================================
    monitorATMs(persons, frame) {
        const results = [];
        for (const [atmId, atm] of this.atmMonitors.entries()) {
            // Find persons at ATM
            const personsAtATM = persons.filter(p => this.isPointInPolygon(this.getPersonCenter(p), atm.polygon));
            // Update queue
            const previousQueueLength = atm.queueLength;
            atm.queueLength = personsAtATM.length;
            // Check for long queue
            if (atm.queueLength > this.ATM_QUEUE_MAX_LENGTH && previousQueueLength <= this.ATM_QUEUE_MAX_LENGTH) {
                const alert = {
                    alertId: `atm_alert_${randomUUID().substring(0, 8)}`,
                    atmId,
                    alertType: 'queue_too_long',
                    severity: 'medium',
                    timestamp: frame.timestamp,
                    resolved: false,
                    details: `Queue length: ${atm.queueLength}`,
                };
                atm.alerts.push(alert);
                results.push(this.createATMAlertResult(alert));
            }
            // Check current user session duration
            if (atm.currentUser) {
                const sessionDuration = frame.timestamp.getTime() - atm.currentUser.startedAt.getTime();
                atm.currentUser.duration = sessionDuration;
                if (sessionDuration > this.ATM_SESSION_MAX_MS) {
                    const alert = {
                        alertId: `atm_alert_${randomUUID().substring(0, 8)}`,
                        atmId,
                        alertType: 'session_too_long',
                        severity: 'medium',
                        timestamp: frame.timestamp,
                        resolved: false,
                        details: `Session duration: ${Math.round(sessionDuration / 1000)}s`,
                    };
                    atm.alerts.push(alert);
                    results.push(this.createATMAlertResult(alert));
                }
            }
            // Detect tampering (would need specialized detector)
            if (atm.tamperingDetected) {
                const alert = {
                    alertId: `atm_alert_${randomUUID().substring(0, 8)}`,
                    atmId,
                    alertType: 'tampering',
                    severity: 'critical',
                    timestamp: frame.timestamp,
                    resolved: false,
                };
                atm.alerts.push(alert);
                results.push(this.createATMAlertResult(alert));
            }
            // Detect skimming (would need specialized detector)
            if (atm.skimmingDetected) {
                const alert = {
                    alertId: `atm_alert_${randomUUID().substring(0, 8)}`,
                    atmId,
                    alertType: 'skimming',
                    severity: 'critical',
                    timestamp: frame.timestamp,
                    resolved: false,
                };
                atm.alerts.push(alert);
                results.push(this.createATMAlertResult(alert));
            }
            // Update status
            if (personsAtATM.length > 0) {
                atm.status = 'in_use';
                atm.lastActivity = frame.timestamp;
            }
            else {
                atm.status = 'idle';
            }
        }
        return results;
    }
    // ============================================================================
    // Cash Van Monitoring
    // ============================================================================
    monitorCashVans(persons, frame) {
        const results = [];
        // Note: Cash van monitoring has been migrated to the new event-driven
        // banking analytics system in src/banking/
        // 
        // The new system provides:
        // - Normalized event bus for vehicle/person/ANPR/zone/access events
        // - Persistent session tracking with state machine
        // - Rule-based evaluation with evidence collection
        // - Correlation across vehicle detection, ANPR, personnel tracking,
        //   identity resolution, transfer objects, and access control
        //
        // To activate:
        // 1. Configure monitors via banking analytics API
        // 2. Publish events to the banking event bus from detectors
        // 3. Query session status and violations via banking analytics service
        //
        // See: analytics-engine/src/banking/banking-analytics.service.ts
        return results;
    }
    // ============================================================================
    // Strong Room Monitoring
    // ============================================================================
    monitorStrongRooms(persons, frame) {
        const results = [];
        for (const [roomId, room] of this.strongRoomMonitors.entries()) {
            const personsInRoom = persons.filter(p => this.isPointInPolygon(this.getPersonCenter(p), room.entryPolygon));
            room.currentOccupancy = personsInRoom.length;
            // Check occupancy limit
            if (room.currentOccupancy > room.maxOccupancy) {
                results.push({
                    detectionType: "strong-room-overcrowded",
                    confidence: 0.95,
                    objects: [],
                    metadata: {
                        roomId,
                        name: room.name,
                        maxOccupancy: room.maxOccupancy,
                        currentOccupancy: room.currentOccupancy,
                    },
                    requiresAlert: true,
                });
            }
            // Check escort requirement
            if (room.requiresEscort) {
                // TODO: Implement escort verification
            }
        }
        return results;
    }
    // ============================================================================
    // Dual Control Compliance
    // ============================================================================
    checkDualControlCompliance(persons, frame) {
        const results = [];
        for (const [zoneId, zone] of this.dualControlZones.entries()) {
            const personsInZone = persons.filter(p => this.isPointInPolygon(this.getPersonCenter(p), zone.polygon));
            zone.currentPersons = personsInZone.length;
            // Check minimum persons requirement
            if (zone.requiresTwoPersons && zone.currentPersons < zone.minPersons) {
                // Create or update violation
                const existingViolation = zone.violations.find(v => v.duration === 0);
                if (!existingViolation) {
                    const violation = {
                        violationId: `dual_control_${randomUUID().substring(0, 8)}`,
                        timestamp: frame.timestamp,
                        actualPersons: zone.currentPersons,
                        duration: 0,
                    };
                    zone.violations.push(violation);
                }
                else {
                    existingViolation.duration =
                        (frame.timestamp.getTime() - existingViolation.timestamp.getTime()) / 1000;
                    // Alert if violation exceeds grace period
                    if (existingViolation.duration > this.DUAL_CONTROL_GRACE_PERIOD_MS / 1000) {
                        results.push({
                            detectionType: "dual-control-violation",
                            confidence: 0.95,
                            objects: [],
                            metadata: {
                                zoneId,
                                zoneName: zone.name,
                                requiredPersons: zone.minPersons,
                                actualPersons: zone.currentPersons,
                                duration: existingViolation.duration,
                            },
                            requiresAlert: true,
                        });
                    }
                }
            }
            else if (zone.currentPersons >= zone.minPersons) {
                // Clear violations
                zone.violations = zone.violations.filter(v => v.duration > 0);
            }
        }
        return results;
    }
    // ============================================================================
    // Configuration Methods
    // ============================================================================
    /**
     * Configure a teller station
     */
    configureTellerStation(config) {
        const station = {
            stationId: config.stationId,
            name: config.name,
            location: config.location,
            polygon: config.polygon,
            isOccupied: false,
            tellerPresent: false,
            customerPresent: false,
            cashTrayOpen: false,
            transactionInProgress: false,
            lastActivity: new Date(),
            violations: [],
        };
        this.tellerStations.set(config.stationId, station);
        console.log(`Configured teller station: ${config.name}`);
    }
    /**
     * Configure vault monitoring
     */
    configureVault(config) {
        const vault = {
            vaultId: config.vaultId,
            name: config.name,
            doorPolygon: config.doorPolygon,
            accessZone: config.accessZone,
            doorStatus: 'closed',
            personsInside: 0,
            requiresDualControl: config.requiresDualControl,
            authorizedPersons: config.authorizedPersons,
            currentOccupants: [],
            violations: [],
            lastDoorChange: new Date(),
        };
        this.vaultMonitors.set(config.vaultId, vault);
        console.log(`Configured vault: ${config.name}`);
    }
    /**
     * Configure ATM monitoring
     */
    configureATM(config) {
        const atm = {
            atmId: config.atmId,
            location: config.location,
            polygon: config.polygon,
            status: 'idle',
            queueLength: 0,
            queuePersons: [],
            tamperingDetected: false,
            skimmingDetected: false,
            lastActivity: new Date(),
            alerts: [],
        };
        this.atmMonitors.set(config.atmId, atm);
        console.log(`Configured ATM: ${config.location}`);
    }
    /**
     * Configure dual control zone
     */
    configureDualControlZone(config) {
        const zone = {
            zoneId: config.zoneId,
            name: config.name,
            polygon: config.polygon,
            requiresTwoPersons: config.minPersons >= 2,
            minPersons: config.minPersons,
            currentPersons: 0,
            violations: [],
        };
        this.dualControlZones.set(config.zoneId, zone);
        console.log(`Configured dual control zone: ${config.name} (min ${config.minPersons} persons)`);
    }
    // ============================================================================
    // Utility Methods
    // ============================================================================
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
    getPersonCenter(person) {
        return {
            x: person.boundingBox.x + person.boundingBox.width / 2,
            y: person.boundingBox.y + person.boundingBox.height / 2,
        };
    }
    // ============================================================================
    // Result Formatting
    // ============================================================================
    createTellerViolationResult(violation) {
        return {
            detectionType: `teller-${violation.violationType}`,
            confidence: 0.92,
            objects: [],
            metadata: {
                violationId: violation.violationId,
                stationId: violation.stationId,
                violationType: violation.violationType,
                severity: violation.severity,
                duration: violation.duration,
                startTime: violation.startTime.toISOString(),
            },
            requiresAlert: violation.severity === 'critical' || violation.severity === 'high',
        };
    }
    createVaultViolationResult(violation) {
        return {
            detectionType: `vault-${violation.violationType}`,
            confidence: 0.95,
            objects: [],
            metadata: {
                violationId: violation.violationId,
                vaultId: violation.vaultId,
                violationType: violation.violationType,
                severity: violation.severity,
                duration: violation.duration,
                persons: violation.persons,
                timestamp: violation.timestamp.toISOString(),
            },
            requiresAlert: true,
        };
    }
    createATMAlertResult(alert) {
        return {
            detectionType: `atm-${alert.alertType}`,
            confidence: 0.90,
            objects: [],
            metadata: {
                alertId: alert.alertId,
                atmId: alert.atmId,
                alertType: alert.alertType,
                severity: alert.severity,
                details: alert.details,
                timestamp: alert.timestamp.toISOString(),
            },
            requiresAlert: alert.severity === 'critical' || alert.severity === 'high',
        };
    }
    // ============================================================================
    // Public API Methods
    // ============================================================================
    /**
     * Get all teller stations status
     */
    getTellerStations() {
        return Array.from(this.tellerStations.values());
    }
    /**
     * Get teller station by ID
     */
    getTellerStation(stationId) {
        return this.tellerStations.get(stationId);
    }
    /**
     * Get active teller violations
     */
    getActiveTellerViolations() {
        const violations = [];
        for (const station of this.tellerStations.values()) {
            violations.push(...station.violations.filter(v => !v.resolved));
        }
        return violations;
    }
    /**
     * Get all vaults status
     */
    getVaults() {
        return Array.from(this.vaultMonitors.values());
    }
    /**
     * Get vault by ID
     */
    getVault(vaultId) {
        return this.vaultMonitors.get(vaultId);
    }
    /**
     * Get active vault violations
     */
    getActiveVaultViolations() {
        const violations = [];
        for (const vault of this.vaultMonitors.values()) {
            violations.push(...vault.violations.filter(v => !v.resolved));
        }
        return violations;
    }
    /**
     * Get all ATMs status
     */
    getATMs() {
        return Array.from(this.atmMonitors.values());
    }
    /**
     * Get ATM by ID
     */
    getATM(atmId) {
        return this.atmMonitors.get(atmId);
    }
    /**
     * Get active ATM alerts
     */
    getActiveATMAlerts() {
        const alerts = [];
        for (const atm of this.atmMonitors.values()) {
            alerts.push(...atm.alerts.filter(a => !a.resolved));
        }
        return alerts;
    }
    /**
     * Get dual control zones status
     */
    getDualControlZones() {
        return Array.from(this.dualControlZones.values());
    }
    /**
     * Generate banking compliance report
     */
    generateComplianceReport(timeRange) {
        const tellerViolations = this.getActiveTellerViolations();
        const vaultViolations = this.getActiveVaultViolations();
        const atmAlerts = this.getActiveATMAlerts();
        const tellerBySeverity = {
            low: 0,
            medium: 0,
            high: 0,
            critical: 0,
        };
        for (const violation of tellerViolations) {
            tellerBySeverity[violation.severity]++;
        }
        const totalTellerStations = this.tellerStations.size;
        const tellerComplianceRate = totalTellerStations > 0
            ? ((totalTellerStations - tellerViolations.length) / totalTellerStations) * 100
            : 100;
        const atmQueues = Array.from(this.atmMonitors.values()).map(atm => atm.queueLength);
        const avgQueueLength = atmQueues.length > 0
            ? atmQueues.reduce((a, b) => a + b, 0) / atmQueues.length
            : 0;
        return {
            period: {
                start: timeRange.start.toISOString(),
                end: timeRange.end.toISOString(),
            },
            tellerCompliance: {
                totalStations: totalTellerStations,
                violations: tellerViolations.length,
                complianceRate: Math.round(tellerComplianceRate * 10) / 10,
                bySeverity: tellerBySeverity,
            },
            vaultSecurity: {
                totalVaults: this.vaultMonitors.size,
                violations: vaultViolations.length,
                unauthorizedAccess: vaultViolations.filter(v => v.violationType === 'unauthorized_access').length,
                dualControlViolations: vaultViolations.filter(v => v.violationType === 'dual_control_violation').length,
            },
            atmOperations: {
                totalATMs: this.atmMonitors.size,
                alerts: atmAlerts.length,
                tamperingIncidents: atmAlerts.filter(a => a.alertType === 'tampering').length,
                averageQueueLength: Math.round(avgQueueLength * 10) / 10,
            },
        };
    }
    // ============================================================================
    // Monitoring & Cleanup
    // ============================================================================
    startTellerMonitoring() {
        setInterval(() => {
            for (const station of this.tellerStations.values()) {
                // Update violation durations
                for (const violation of station.violations) {
                    if (!violation.resolved) {
                        violation.duration = (Date.now() - violation.startTime.getTime()) / 1000;
                    }
                }
                // Clean up old resolved violations
                station.violations = station.violations.filter(v => {
                    if (v.resolved) {
                        const timeSinceResolved = Date.now() - v.startTime.getTime() - (v.duration * 1000);
                        return timeSinceResolved < 300000; // Keep for 5 minutes
                    }
                    return true;
                });
            }
        }, 5000); // Every 5 seconds
    }
    startVaultMonitoring() {
        setInterval(() => {
            for (const vault of this.vaultMonitors.values()) {
                // Update violation durations
                for (const violation of vault.violations) {
                    if (!violation.resolved) {
                        violation.duration = (Date.now() - violation.timestamp.getTime()) / 1000;
                    }
                }
            }
        }, 5000);
    }
    startATMMonitoring() {
        setInterval(() => {
            for (const atm of this.atmMonitors.values()) {
                // Update queue wait times
                for (const person of atm.queuePersons) {
                    person.waitTime = (Date.now() - person.enteredQueueAt.getTime()) / 1000;
                }
                // Clean up old alerts
                atm.alerts = atm.alerts.filter(a => {
                    if (a.resolved) {
                        const timeSinceResolved = Date.now() - a.timestamp.getTime();
                        return timeSinceResolved < 600000; // Keep for 10 minutes
                    }
                    return true;
                });
            }
        }, 10000); // Every 10 seconds
    }
    startComplianceMonitoring() {
        setInterval(() => {
            // Log compliance statistics
            const report = this.generateComplianceReport({
                start: new Date(Date.now() - 3600000), // Last hour
                end: new Date(),
            });
            console.log(`Banking Compliance Summary:`);
            console.log(`  Teller Compliance: ${report.tellerCompliance.complianceRate}%`);
            console.log(`  Vault Violations: ${report.vaultSecurity.violations}`);
            console.log(`  ATM Alerts: ${report.atmOperations.alerts}`);
        }, 300000); // Every 5 minutes
    }
    async cleanup() {
        this.tellerStations.clear();
        this.vaultMonitors.clear();
        this.atmMonitors.clear();
        this.cashVanMonitors.clear();
        this.strongRoomMonitors.clear();
        this.dualControlZones.clear();
        console.log("Banking Analytics detector cleaned up");
    }
    getHealth() {
        return {
            status: 'healthy',
            details: 'Banking analytics detector is available'
        };
    }
}
/**
 * Factory function – creates a ready-to-use BankingAnalyticsDetector instance.
 */
export function createBankingAnalytics() {
    return new BankingAnalyticsDetector();
}
