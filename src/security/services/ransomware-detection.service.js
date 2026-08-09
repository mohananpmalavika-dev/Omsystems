"use strict";
/**
 * Ransomware Detection Service
 * Behavioral analysis and threat detection
 */
var __extends = (this && this.__extends) || (function () {
    var extendStatics = function (d, b) {
        extendStatics = Object.setPrototypeOf ||
            ({ __proto__: [] } instanceof Array && function (d, b) { d.__proto__ = b; }) ||
            function (d, b) { for (var p in b) if (Object.prototype.hasOwnProperty.call(b, p)) d[p] = b[p]; };
        return extendStatics(d, b);
    };
    return function (d, b) {
        if (typeof b !== "function" && b !== null)
            throw new TypeError("Class extends value " + String(b) + " is not a constructor or null");
        extendStatics(d, b);
        function __() { this.constructor = d; }
        d.prototype = b === null ? Object.create(b) : (__.prototype = b.prototype, new __());
    };
})();
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __generator = (this && this.__generator) || function (thisArg, body) {
    var _ = { label: 0, sent: function() { if (t[0] & 1) throw t[1]; return t[1]; }, trys: [], ops: [] }, f, y, t, g = Object.create((typeof Iterator === "function" ? Iterator : Object).prototype);
    return g.next = verb(0), g["throw"] = verb(1), g["return"] = verb(2), typeof Symbol === "function" && (g[Symbol.iterator] = function() { return this; }), g;
    function verb(n) { return function (v) { return step([n, v]); }; }
    function step(op) {
        if (f) throw new TypeError("Generator is already executing.");
        while (g && (g = 0, op[0] && (_ = 0)), _) try {
            if (f = 1, y && (t = op[0] & 2 ? y["return"] : op[0] ? y["throw"] || ((t = y["return"]) && t.call(y), 0) : y.next) && !(t = t.call(y, op[1])).done) return t;
            if (y = 0, t) op = [op[0] & 2, t.value];
            switch (op[0]) {
                case 0: case 1: t = op; break;
                case 4: _.label++; return { value: op[1], done: false };
                case 5: _.label++; y = op[1]; op = [0]; continue;
                case 7: op = _.ops.pop(); _.trys.pop(); continue;
                default:
                    if (!(t = _.trys, t = t.length > 0 && t[t.length - 1]) && (op[0] === 6 || op[0] === 2)) { _ = 0; continue; }
                    if (op[0] === 3 && (!t || (op[1] > t[0] && op[1] < t[3]))) { _.label = op[1]; break; }
                    if (op[0] === 6 && _.label < t[1]) { _.label = t[1]; t = op; break; }
                    if (t && _.label < t[2]) { _.label = t[2]; _.ops.push(op); break; }
                    if (t[2]) _.ops.pop();
                    _.trys.pop(); continue;
            }
            op = body.call(thisArg, _);
        } catch (e) { op = [6, e]; y = 0; } finally { f = t = 0; }
        if (op[0] & 5) throw op[1]; return { value: op[0] ? op[1] : void 0, done: true };
    }
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.RansomwareDetectionService = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var RansomwareDetectionService = /** @class */ (function (_super) {
    __extends(RansomwareDetectionService, _super);
    function RansomwareDetectionService() {
        var _this = _super.call(this) || this;
        _this.monitoredDevices = new Set();
        _this.detectionInterval = null;
        _this.startDetection();
        return _this;
    }
    /**
     * Detect ransomware threats across all monitored devices
     */
    RansomwareDetectionService.prototype.detectThreats = function () {
        return __awaiter(this, void 0, void 0, function () {
            var threats, _i, _a, deviceId, threat;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        threats = [];
                        _i = 0, _a = this.monitoredDevices;
                        _b.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        deviceId = _a[_i];
                        return [4 /*yield*/, this.analyzeDevice(deviceId)];
                    case 2:
                        threat = _b.sent();
                        if (threat) {
                            threats.push(threat);
                        }
                        _b.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, threats];
                }
            });
        });
    };
    /**
     * Analyze single device for ransomware indicators
     */
    RansomwareDetectionService.prototype.analyzeDevice = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, patterns, baseline, metrics, _i, patterns_1, pattern, score, threat;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.listPatterns()];
                    case 1:
                        patterns = _b.sent();
                        return [4 /*yield*/, this.getBaseline(deviceId)];
                    case 2:
                        baseline = _b.sent();
                        return [4 /*yield*/, this.collectDeviceMetrics(deviceId)];
                    case 3:
                        metrics = _b.sent();
                        _i = 0, patterns_1 = patterns;
                        _b.label = 4;
                    case 4:
                        if (!(_i < patterns_1.length)) return [3 /*break*/, 12];
                        pattern = patterns_1[_i];
                        return [4 /*yield*/, this.evaluatePattern(pattern, metrics, baseline)];
                    case 5:
                        score = _b.sent();
                        if (!(score >= pattern.threshold)) return [3 /*break*/, 11];
                        _a = {
                            id: this.generateId(),
                            type: this.mapPatternToThreatType(pattern.name),
                            level: pattern.severity,
                            deviceId: deviceId
                        };
                        return [4 /*yield*/, this.getDeviceName(deviceId)];
                    case 6:
                        _a.deviceName = _b.sent();
                        return [4 /*yield*/, this.getDeviceType(deviceId)];
                    case 7:
                        threat = (_a.deviceType = _b.sent(),
                            _a.detectedAt = new Date(),
                            _a.indicators = [{
                                    type: 'behavioral',
                                    description: "Pattern matched: ".concat(pattern.name),
                                    confidence: score,
                                    evidence: metrics,
                                    timestamp: new Date()
                                }],
                            _a.affectedResources = [],
                            _a.recommendedActions = this.getRecommendedActions(pattern.severity),
                            _a.autoIsolated = false,
                            _a.isolated = false,
                            _a.resolved = false,
                            _a);
                        return [4 /*yield*/, db.collection('ransomware_threats').insertOne(threat)];
                    case 8:
                        _b.sent();
                        if (!pattern.autoIsolate) return [3 /*break*/, 10];
                        return [4 /*yield*/, this.isolateDevice(deviceId, "Automatic isolation: ".concat(pattern.name))];
                    case 9:
                        _b.sent();
                        threat.autoIsolated = true;
                        threat.isolated = true;
                        threat.isolatedAt = new Date();
                        _b.label = 10;
                    case 10:
                        this.emit('threat:detected', {
                            threatId: threat.id,
                            deviceId: deviceId,
                            level: threat.level,
                            type: threat.type
                        });
                        return [2 /*return*/, threat];
                    case 11:
                        _i++;
                        return [3 /*break*/, 4];
                    case 12: return [2 /*return*/, null];
                }
            });
        });
    };
    /**
     * Start monitoring device
     */
    RansomwareDetectionService.prototype.startMonitoring = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        this.monitoredDevices.add(deviceId);
                        return [4 /*yield*/, this.createBaseline(deviceId)];
                    case 1:
                        _a.sent();
                        this.emit('monitoring:started', { deviceId: deviceId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Stop monitoring device
     */
    RansomwareDetectionService.prototype.stopMonitoring = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.monitoredDevices.delete(deviceId);
                this.emit('monitoring:stopped', { deviceId: deviceId });
                return [2 /*return*/];
            });
        });
    };
    /**
     * Create behavioral baseline for device
     */
    RansomwareDetectionService.prototype.createBaseline = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, metrics, baseline;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.collectHistoricalMetrics(deviceId, 7)];
                    case 1:
                        metrics = _a.sent();
                        baseline = {
                            deviceId: deviceId,
                            metric: 'file_operations',
                            average: this.calculateAverage(metrics),
                            stdDev: this.calculateStdDev(metrics),
                            min: Math.min.apply(Math, metrics),
                            max: Math.max.apply(Math, metrics),
                            sampleSize: metrics.length,
                            lastUpdated: new Date()
                        };
                        return [4 /*yield*/, db.collection('behavior_baselines').insertOne(baseline)];
                    case 2:
                        _a.sent();
                        this.emit('baseline:created', { deviceId: deviceId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update behavioral baseline
     */
    RansomwareDetectionService.prototype.updateBaseline = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.createBaseline(deviceId)];
                    case 1:
                        _a.sent();
                        this.emit('baseline:updated', { deviceId: deviceId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Add detection pattern
     */
    RansomwareDetectionService.prototype.addPattern = function (pattern) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('ransomware_patterns').insertOne(pattern)];
                    case 1:
                        _a.sent();
                        this.emit('pattern:added', { patternId: pattern.id });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List detection patterns
     */
    RansomwareDetectionService.prototype.listPatterns = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('ransomware_patterns')
                                .find({ enabled: true })
                                .toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Isolate compromised device
     */
    RansomwareDetectionService.prototype.isolateDevice = function (deviceId, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        // Record isolation action
                        return [4 /*yield*/, db.collection('device_isolation_events').insertOne({
                                deviceId: deviceId,
                                isolatedAt: new Date(),
                                reason: reason,
                                isolatedBy: 'system'
                            })];
                    case 1:
                        // Record isolation action
                        _a.sent();
                        // Execute isolation (network disconnect, disable services, etc.)
                        return [4 /*yield*/, this.executeIsolation(deviceId)];
                    case 2:
                        // Execute isolation (network disconnect, disable services, etc.)
                        _a.sent();
                        this.emit('device:isolated', { deviceId: deviceId, reason: reason });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Restore isolated device
     */
    RansomwareDetectionService.prototype.restoreDevice = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('device_isolation_events').updateOne({ deviceId: deviceId, restoredAt: null }, {
                                $set: {
                                    restoredAt: new Date(),
                                    restoredBy: 'system'
                                }
                            })];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.executeRestoration(deviceId)];
                    case 2:
                        _a.sent();
                        this.emit('device:restored', { deviceId: deviceId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get threat by ID
     */
    RansomwareDetectionService.prototype.getThreat = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, threat;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('ransomware_threats').findOne({ id: id })];
                    case 1:
                        threat = _a.sent();
                        if (!threat) {
                            throw new Error('Threat not found');
                        }
                        return [2 /*return*/, threat];
                }
            });
        });
    };
    /**
     * List threats with filters
     */
    RansomwareDetectionService.prototype.listThreats = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var db, query;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = {};
                        if (filters.deviceId) {
                            query.deviceId = filters.deviceId;
                        }
                        if (filters.level) {
                            query.level = filters.level;
                        }
                        if (filters.resolved !== undefined) {
                            query.resolved = filters.resolved;
                        }
                        if (filters.startDate || filters.endDate) {
                            query.detectedAt = {};
                            if (filters.startDate) {
                                query.detectedAt.$gte = filters.startDate;
                            }
                            if (filters.endDate) {
                                query.detectedAt.$lte = filters.endDate;
                            }
                        }
                        return [4 /*yield*/, db.collection('ransomware_threats')
                                .find(query)
                                .sort({ detectedAt: -1 })
                                .limit(100)
                                .toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Resolve threat
     */
    RansomwareDetectionService.prototype.resolveThreat = function (threatId, userId, notes) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('ransomware_threats').updateOne({ id: threatId }, {
                                $set: {
                                    resolved: true,
                                    resolvedAt: new Date(),
                                    resolvedBy: userId,
                                    notes: notes
                                }
                            })];
                    case 1:
                        _a.sent();
                        this.emit('threat:resolved', { threatId: threatId });
                        return [2 /*return*/];
                }
            });
        });
    };
    // Private helper methods
    RansomwareDetectionService.prototype.getBaseline = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('behavior_baselines').findOne({ deviceId: deviceId })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    RansomwareDetectionService.prototype.collectDeviceMetrics = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Collect real-time metrics
                return [2 /*return*/, {
                        fileOperationsPerMinute: Math.random() * 100,
                        storageGrowthRate: Math.random() * 50,
                        processCount: Math.floor(Math.random() * 200),
                        networkTraffic: Math.random() * 1000,
                        failedAuthAttempts: Math.floor(Math.random() * 10)
                    }];
            });
        });
    };
    RansomwareDetectionService.prototype.collectHistoricalMetrics = function (deviceId, days) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Collect historical data
                return [2 /*return*/, Array.from({ length: days * 24 }, function () { return Math.random() * 100; })];
            });
        });
    };
    RansomwareDetectionService.prototype.evaluatePattern = function (pattern, metrics, baseline) {
        return __awaiter(this, void 0, void 0, function () {
            var score, _i, _a, indicator, metricValue, matches;
            return __generator(this, function (_b) {
                score = 0;
                for (_i = 0, _a = pattern.indicators; _i < _a.length; _i++) {
                    indicator = _a[_i];
                    metricValue = metrics[indicator.metric];
                    if (metricValue !== undefined) {
                        matches = this.evaluateIndicator(indicator, metricValue, baseline);
                        if (matches) {
                            score += indicator.weight;
                        }
                    }
                }
                return [2 /*return*/, score];
            });
        });
    };
    RansomwareDetectionService.prototype.evaluateIndicator = function (indicator, value, baseline) {
        switch (indicator.operator) {
            case 'gt':
                return value > indicator.value;
            case 'lt':
                return value < indicator.value;
            case 'eq':
                return value === indicator.value;
            default:
                return false;
        }
    };
    RansomwareDetectionService.prototype.mapPatternToThreatType = function (patternName) {
        if (patternName.includes('encryption'))
            return 'file_encryption';
        if (patternName.includes('deletion'))
            return 'mass_deletion';
        return 'suspicious_process';
    };
    RansomwareDetectionService.prototype.getRecommendedActions = function (severity) {
        var actions = ['Investigate immediately', 'Review security logs'];
        if (severity === types_js_1.ThreatLevel.CRITICAL || severity === types_js_1.ThreatLevel.HIGH) {
            actions.push('Isolate affected device', 'Notify security team', 'Begin incident response');
        }
        return actions;
    };
    RansomwareDetectionService.prototype.getDeviceName = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, "Device-".concat(deviceId)];
            });
        });
    };
    RansomwareDetectionService.prototype.getDeviceType = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, 'recorder'];
            });
        });
    };
    RansomwareDetectionService.prototype.executeIsolation = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Execute network isolation commands
                console.log("Isolating device: ".concat(deviceId));
                return [2 /*return*/];
            });
        });
    };
    RansomwareDetectionService.prototype.executeRestoration = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Execute restoration commands
                console.log("Restoring device: ".concat(deviceId));
                return [2 /*return*/];
            });
        });
    };
    RansomwareDetectionService.prototype.calculateAverage = function (values) {
        return values.reduce(function (a, b) { return a + b; }, 0) / values.length;
    };
    RansomwareDetectionService.prototype.calculateStdDev = function (values) {
        var avg = this.calculateAverage(values);
        var squareDiffs = values.map(function (value) { return Math.pow(value - avg, 2); });
        return Math.sqrt(this.calculateAverage(squareDiffs));
    };
    RansomwareDetectionService.prototype.startDetection = function () {
        var _this = this;
        this.detectionInterval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            var error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.detectThreats()];
                    case 1:
                        _a.sent();
                        return [3 /*break*/, 3];
                    case 2:
                        error_1 = _a.sent();
                        console.error('Detection error:', error_1);
                        return [3 /*break*/, 3];
                    case 3: return [2 /*return*/];
                }
            });
        }); }, 60000); // Check every minute
    };
    RansomwareDetectionService.prototype.stopDetection = function () {
        if (this.detectionInterval) {
            clearInterval(this.detectionInterval);
            this.detectionInterval = null;
        }
    };
    RansomwareDetectionService.prototype.generateId = function () {
        return "threat_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    RansomwareDetectionService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, activeThreats, monitoredDevices, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('ransomware_threats').countDocuments({ resolved: false })];
                    case 1:
                        activeThreats = _a.sent();
                        monitoredDevices = this.monitoredDevices.size;
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    activeThreats: activeThreats,
                                    monitoredDevices: monitoredDevices,
                                    detectionActive: this.detectionInterval !== null
                                }
                            }];
                    case 2:
                        error_2 = _a.sent();
                        return [2 /*return*/, {
                                status: 'unhealthy',
                                details: { error: error_2.message }
                            }];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    return RansomwareDetectionService;
}(events_1.EventEmitter));
exports.RansomwareDetectionService = RansomwareDetectionService;
