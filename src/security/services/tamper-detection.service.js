"use strict";
/**
 * Tamper Detection Service
 * Physical and logical tampering detection across infrastructure
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
var __assign = (this && this.__assign) || function () {
    __assign = Object.assign || function(t) {
        for (var s, i = 1, n = arguments.length; i < n; i++) {
            s = arguments[i];
            for (var p in s) if (Object.prototype.hasOwnProperty.call(s, p))
                t[p] = s[p];
        }
        return t;
    };
    return __assign.apply(this, arguments);
};
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
exports.TamperDetectionService = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var TamperDetectionService = /** @class */ (function (_super) {
    __extends(TamperDetectionService, _super);
    function TamperDetectionService() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.monitoredDevices = new Map();
        return _this;
    }
    /**
     * Report tamper event
     */
    TamperDetectionService.prototype.reportTamper = function (event) {
        return __awaiter(this, void 0, void 0, function () {
            var db, tamperEvent;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        tamperEvent = __assign({ id: this.generateId(), timestamp: new Date(), verified: false, acknowledged: false }, event);
                        return [4 /*yield*/, db.collection('tamper_events').insertOne(tamperEvent)];
                    case 1:
                        _a.sent();
                        this.emit('tamper:detected', {
                            eventId: tamperEvent.id,
                            type: tamperEvent.type,
                            deviceId: tamperEvent.deviceId,
                            severity: tamperEvent.severity
                        });
                        // Auto-escalate critical events
                        if (tamperEvent.severity === 'critical') {
                            this.emit('tamper:critical', tamperEvent);
                        }
                        return [2 /*return*/, tamperEvent];
                }
            });
        });
    };
    /**
     * Get tamper event by ID
     */
    TamperDetectionService.prototype.getTamperEvent = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, event;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('tamper_events').findOne({ id: id })];
                    case 1:
                        event = _a.sent();
                        if (!event) {
                            throw new Error('Tamper event not found');
                        }
                        return [2 /*return*/, event];
                }
            });
        });
    };
    /**
     * List tamper events with filters
     */
    TamperDetectionService.prototype.listTamperEvents = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var db, query, events;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = {};
                        if (filters.deviceType) {
                            query.deviceType = filters.deviceType;
                        }
                        if (filters.type) {
                            query.type = filters.type;
                        }
                        if (filters.severity) {
                            query.severity = filters.severity;
                        }
                        if (filters.acknowledged !== undefined) {
                            query.acknowledged = filters.acknowledged;
                        }
                        if (filters.startDate || filters.endDate) {
                            query.timestamp = {};
                            if (filters.startDate) {
                                query.timestamp.$gte = filters.startDate;
                            }
                            if (filters.endDate) {
                                query.timestamp.$lte = filters.endDate;
                            }
                        }
                        return [4 /*yield*/, db.collection('tamper_events')
                                .find(query)
                                .sort({ timestamp: -1 })
                                .limit(100)
                                .toArray()];
                    case 1:
                        events = _a.sent();
                        return [2 /*return*/, events];
                }
            });
        });
    };
    /**
     * Acknowledge tamper event
     */
    TamperDetectionService.prototype.acknowledgeTamperEvent = function (id, userId, resolution) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('tamper_events').updateOne({ id: id }, {
                                $set: {
                                    acknowledged: true,
                                    acknowledgedBy: userId,
                                    acknowledgedAt: new Date(),
                                    resolution: resolution
                                }
                            })];
                    case 1:
                        _a.sent();
                        this.emit('tamper:acknowledged', { eventId: id, userId: userId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Start monitoring a device
     */
    TamperDetectionService.prototype.monitorDevice = function (deviceId, deviceType) {
        return __awaiter(this, void 0, void 0, function () {
            var interval;
            var _this = this;
            return __generator(this, function (_a) {
                if (this.monitoredDevices.has(deviceId)) {
                    return [2 /*return*/]; // Already monitoring
                }
                interval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
                    var error_1;
                    return __generator(this, function (_a) {
                        switch (_a.label) {
                            case 0:
                                _a.trys.push([0, 2, , 3]);
                                return [4 /*yield*/, this.checkDeviceTamper(deviceId, deviceType)];
                            case 1:
                                _a.sent();
                                return [3 /*break*/, 3];
                            case 2:
                                error_1 = _a.sent();
                                console.error("Error monitoring device ".concat(deviceId, ":"), error_1);
                                return [3 /*break*/, 3];
                            case 3: return [2 /*return*/];
                        }
                    });
                }); }, 60000);
                this.monitoredDevices.set(deviceId, interval);
                this.emit('monitoring:started', { deviceId: deviceId, deviceType: deviceType });
                return [2 /*return*/];
            });
        });
    };
    /**
     * Stop monitoring a device
     */
    TamperDetectionService.prototype.stopMonitoring = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var interval;
            return __generator(this, function (_a) {
                interval = this.monitoredDevices.get(deviceId);
                if (interval) {
                    clearInterval(interval);
                    this.monitoredDevices.delete(deviceId);
                    this.emit('monitoring:stopped', { deviceId: deviceId });
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Verify tamper event
     */
    TamperDetectionService.prototype.verifyTamperEvent = function (eventId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, event, verified;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getTamperEvent(eventId)];
                    case 1:
                        event = _a.sent();
                        verified = false;
                        if (!(event.evidence.length > 0)) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.verifyEvidence(event.evidence)];
                    case 2:
                        // Check evidence integrity
                        verified = _a.sent();
                        _a.label = 3;
                    case 3: 
                    // Update event
                    return [4 /*yield*/, db.collection('tamper_events').updateOne({ id: eventId }, {
                            $set: {
                                verified: verified,
                                verifiedAt: new Date()
                            }
                        })];
                    case 4:
                        // Update event
                        _a.sent();
                        return [2 /*return*/, verified];
                }
            });
        });
    };
    /**
     * Register tamper sensor
     */
    TamperDetectionService.prototype.registerSensor = function (deviceId, sensorType) {
        return __awaiter(this, void 0, void 0, function () {
            var db, sensor;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        sensor = {
                            deviceId: deviceId,
                            sensorType: sensorType,
                            enabled: true
                        };
                        return [4 /*yield*/, db.collection('tamper_sensors').insertOne(sensor)];
                    case 1:
                        _a.sent();
                        this.emit('sensor:registered', { deviceId: deviceId, sensorType: sensorType });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get sensor status for device
     */
    TamperDetectionService.prototype.getSensorStatus = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('tamper_sensors')
                                .find({ deviceId: deviceId })
                                .toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Check device for tamper indicators
     */
    TamperDetectionService.prototype.checkDeviceTamper = function (deviceId, deviceType) {
        return __awaiter(this, void 0, void 0, function () {
            var db, sensors, _i, sensors_1, sensor, reading;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getSensorStatus(deviceId)];
                    case 1:
                        sensors = _a.sent();
                        _i = 0, sensors_1 = sensors;
                        _a.label = 2;
                    case 2:
                        if (!(_i < sensors_1.length)) return [3 /*break*/, 6];
                        sensor = sensors_1[_i];
                        if (!sensor.enabled)
                            return [3 /*break*/, 5];
                        return [4 /*yield*/, this.readSensor(deviceId, sensor.sensorType)];
                    case 3:
                        reading = _a.sent();
                        if (!(sensor.threshold && reading > sensor.threshold)) return [3 /*break*/, 5];
                        // Threshold exceeded - possible tamper
                        return [4 /*yield*/, this.reportTamper({
                                type: this.mapSensorToEventType(sensor.sensorType),
                                severity: 'medium',
                                deviceType: deviceType,
                                deviceId: deviceId,
                                deviceName: deviceId,
                                description: "".concat(sensor.sensorType, " sensor threshold exceeded"),
                                evidence: [{
                                        type: 'sensor',
                                        source: sensor.sensorType,
                                        timestamp: new Date(),
                                        data: { reading: reading, threshold: sensor.threshold }
                                    }],
                                metadata: {}
                            })];
                    case 4:
                        // Threshold exceeded - possible tamper
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 2];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Read sensor value
     */
    TamperDetectionService.prototype.readSensor = function (deviceId, sensorType) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Placeholder - would integrate with actual sensor APIs
                return [2 /*return*/, Math.random() * 100];
            });
        });
    };
    /**
     * Map sensor type to event type
     */
    TamperDetectionService.prototype.mapSensorToEventType = function (sensorType) {
        switch (sensorType) {
            case 'door':
                return types_js_1.TamperEventType.CHASSIS_OPENED;
            case 'motion':
                return types_js_1.TamperEventType.PHYSICAL_TAMPER;
            default:
                return types_js_1.TamperEventType.PHYSICAL_TAMPER;
        }
    };
    /**
     * Verify evidence integrity
     */
    TamperDetectionService.prototype.verifyEvidence = function (evidence) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, evidence_1, item;
            return __generator(this, function (_a) {
                for (_i = 0, evidence_1 = evidence; _i < evidence_1.length; _i++) {
                    item = evidence_1[_i];
                    if (item.checksum) {
                        // Verify checksum
                        // Placeholder logic
                    }
                }
                return [2 /*return*/, true];
            });
        });
    };
    TamperDetectionService.prototype.generateId = function () {
        return "tamper_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    TamperDetectionService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, monitoredCount, recentEvents, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        db = (0, database_js_1.getDatabase)();
                        monitoredCount = this.monitoredDevices.size;
                        return [4 /*yield*/, db.collection('tamper_events')
                                .countDocuments({
                                timestamp: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
                            })];
                    case 1:
                        recentEvents = _a.sent();
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    monitoredDevices: monitoredCount,
                                    recentEvents24h: recentEvents
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
    return TamperDetectionService;
}(events_1.EventEmitter));
exports.TamperDetectionService = TamperDetectionService;
