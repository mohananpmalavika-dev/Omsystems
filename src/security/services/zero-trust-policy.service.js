"use strict";
/**
 * Zero Trust Policy Engine
 * Continuous verification and risk-based access control
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
exports.ZeroTrustPolicyEngine = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var ZeroTrustPolicyEngine = /** @class */ (function (_super) {
    __extends(ZeroTrustPolicyEngine, _super);
    function ZeroTrustPolicyEngine() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.MAX_RISK_SCORE = 100;
        _this.SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes
        return _this;
    }
    /**
     * Create a new policy
     */
    ZeroTrustPolicyEngine.prototype.createPolicy = function (policy) {
        return __awaiter(this, void 0, void 0, function () {
            var db, newPolicy;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        newPolicy = __assign(__assign({ id: this.generateId() }, policy), { createdAt: new Date(), updatedAt: new Date() });
                        return [4 /*yield*/, db.collection('zero_trust_policies').insertOne(newPolicy)];
                    case 1:
                        _a.sent();
                        this.emit('policy:created', { policyId: newPolicy.id, name: newPolicy.name });
                        return [2 /*return*/, newPolicy];
                }
            });
        });
    };
    /**
     * Get policy by ID
     */
    ZeroTrustPolicyEngine.prototype.getPolicy = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, policy;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('zero_trust_policies').findOne({ id: id })];
                    case 1:
                        policy = _a.sent();
                        if (!policy) {
                            throw new Error('Policy not found');
                        }
                        return [2 /*return*/, policy];
                }
            });
        });
    };
    /**
     * List policies
     */
    ZeroTrustPolicyEngine.prototype.listPolicies = function (enabled) {
        return __awaiter(this, void 0, void 0, function () {
            var db, query;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = enabled !== undefined ? { enabled: enabled } : {};
                        return [4 /*yield*/, db.collection('zero_trust_policies')
                                .find(query)
                                .sort({ priority: 1 })
                                .toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Update policy
     */
    ZeroTrustPolicyEngine.prototype.updatePolicy = function (id, updates) {
        return __awaiter(this, void 0, void 0, function () {
            var db, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('zero_trust_policies').findOneAndUpdate({ id: id }, { $set: __assign(__assign({}, updates), { updatedAt: new Date() }) }, { returnDocument: 'after' })];
                    case 1:
                        result = _a.sent();
                        if (!result.value) {
                            throw new Error('Policy not found');
                        }
                        this.emit('policy:updated', { policyId: id });
                        return [2 /*return*/, result.value];
                }
            });
        });
    };
    /**
     * Delete policy
     */
    ZeroTrustPolicyEngine.prototype.deletePolicy = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('zero_trust_policies').deleteOne({ id: id })];
                    case 1:
                        _a.sent();
                        this.emit('policy:deleted', { policyId: id });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Evaluate access request against all policies
     */
    ZeroTrustPolicyEngine.prototype.evaluateAccess = function (request) {
        return __awaiter(this, void 0, void 0, function () {
            var policies, riskScore, deviceTrusted, _i, policies_1, policy, matches, response_1, response;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.listPolicies(true)];
                    case 1:
                        policies = _a.sent();
                        return [4 /*yield*/, this.calculateRiskScore(request.context)];
                    case 2:
                        riskScore = _a.sent();
                        request.context.riskScore = riskScore;
                        return [4 /*yield*/, this.verifyDevice(request.context.deviceId)];
                    case 3:
                        deviceTrusted = _a.sent();
                        request.context.deviceTrusted = deviceTrusted;
                        _i = 0, policies_1 = policies;
                        _a.label = 4;
                    case 4:
                        if (!(_i < policies_1.length)) return [3 /*break*/, 8];
                        policy = policies_1[_i];
                        return [4 /*yield*/, this.evaluatePolicy(policy, request)];
                    case 5:
                        matches = _a.sent();
                        if (!matches) return [3 /*break*/, 7];
                        response_1 = {
                            decision: policy.action,
                            reason: "Matched policy: ".concat(policy.name),
                            policies: [policy.id],
                            riskScore: riskScore
                        };
                        // Additional checks based on policy
                        if (policy.requireMFA && !request.context.mfaVerified) {
                            response_1.decision = types_js_1.AccessDecision.CHALLENGE;
                            response_1.requiresChallenge = true;
                            response_1.challengeType = 'mfa';
                        }
                        if (policy.maxRiskScore && riskScore > policy.maxRiskScore) {
                            response_1.decision = types_js_1.AccessDecision.DENY;
                            response_1.reason = "Risk score ".concat(riskScore, " exceeds policy maximum ").concat(policy.maxRiskScore);
                        }
                        // Log access decision
                        return [4 /*yield*/, this.logAccessDecision(request, response_1)];
                    case 6:
                        // Log access decision
                        _a.sent();
                        this.emit('access:evaluated', {
                            userId: request.context.userId,
                            resource: request.resource,
                            decision: response_1.decision,
                            riskScore: riskScore
                        });
                        return [2 /*return*/, response_1];
                    case 7:
                        _i++;
                        return [3 /*break*/, 4];
                    case 8:
                        response = {
                            decision: types_js_1.AccessDecision.DENY,
                            reason: 'No matching policy found',
                            policies: [],
                            riskScore: riskScore
                        };
                        return [4 /*yield*/, this.logAccessDecision(request, response)];
                    case 9:
                        _a.sent();
                        return [2 /*return*/, response];
                }
            });
        });
    };
    /**
     * Evaluate a single policy
     */
    ZeroTrustPolicyEngine.prototype.evaluatePolicy = function (policy, request) {
        return __awaiter(this, void 0, void 0, function () {
            var _i, _a, condition;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _i = 0, _a = policy.conditions;
                        _b.label = 1;
                    case 1:
                        if (!(_i < _a.length)) return [3 /*break*/, 4];
                        condition = _a[_i];
                        return [4 /*yield*/, this.evaluateCondition(condition, request)];
                    case 2:
                        if (!(_b.sent())) {
                            return [2 /*return*/, false];
                        }
                        _b.label = 3;
                    case 3:
                        _i++;
                        return [3 /*break*/, 1];
                    case 4: return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Evaluate a single condition
     */
    ZeroTrustPolicyEngine.prototype.evaluateCondition = function (condition, request) {
        return __awaiter(this, void 0, void 0, function () {
            var context;
            var _a;
            return __generator(this, function (_b) {
                context = request.context;
                switch (condition.type) {
                    case 'user':
                        return [2 /*return*/, condition.operator === 'equals'
                                ? context.userId === condition.value
                                : condition.operator === 'in'
                                    ? condition.value.includes(context.userId)
                                    : false];
                    case 'device':
                        return [2 /*return*/, context.deviceTrusted === condition.value];
                    case 'location':
                        if (condition.operator === 'equals') {
                            return [2 /*return*/, ((_a = context.location) === null || _a === void 0 ? void 0 : _a.country) === condition.value];
                        }
                        return [2 /*return*/, false];
                    case 'risk':
                        return [2 /*return*/, this.compareValues(context.riskScore, condition.operator, condition.value)];
                    case 'time':
                        return [2 /*return*/, this.evaluateTimeCondition(condition, context.timestamp)];
                    default:
                        return [2 /*return*/, false];
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Compare values based on operator
     */
    ZeroTrustPolicyEngine.prototype.compareValues = function (actual, operator, expected) {
        switch (operator) {
            case 'equals':
                return actual === expected;
            case 'gt':
                return actual > expected;
            case 'lt':
                return actual < expected;
            case 'in':
                return Array.isArray(expected) && expected.includes(actual);
            default:
                return false;
        }
    };
    /**
     * Evaluate time-based condition
     */
    ZeroTrustPolicyEngine.prototype.evaluateTimeCondition = function (condition, timestamp) {
        var hour = timestamp.getHours();
        var day = timestamp.getDay();
        // Support operators: 'between' with [startHour, endHour], 'equals' with specific hour or day
        if (condition.operator === 'between' && Array.isArray(condition.value) && condition.value.length === 2) {
            var start = Number(condition.value[0]);
            var end = Number(condition.value[1]);
            if (start <= end) {
                return hour >= start && hour <= end;
            }
            // Wrap-around (e.g., 22 -> 4)
            return hour >= start || hour <= end;
        }
        if (condition.operator === 'equals') {
            // If value is a day name or day number, handle accordingly
            if (typeof condition.value === 'number') {
                return day === condition.value;
            }
            if (typeof condition.value === 'string') {
                var map = {
                    sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6
                };
                var v = condition.value.toLowerCase();
                return map[v] === day || Number(v) === hour;
            }
        }
        if (condition.operator === 'in' && Array.isArray(condition.value)) {
            // Value may be array of allowed hours or days
            return condition.value.includes(hour) || condition.value.includes(day);
        }
        // Default deny for unknown time conditions
        return false;
    };
    /**
     * Calculate risk score based on context
     */
    ZeroTrustPolicyEngine.prototype.calculateRiskScore = function (context) {
        return __awaiter(this, void 0, void 0, function () {
            var score, locationRisk, hour, behavioralRisk;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        score = 0;
                        // Base risk: 20
                        score += 20;
                        // MFA verification
                        if (!context.mfaVerified) {
                            score += 30;
                        }
                        // Device trust
                        if (!context.deviceTrusted) {
                            score += 25;
                        }
                        if (!context.location) return [3 /*break*/, 2];
                        return [4 /*yield*/, this.assessLocationRisk(context.location)];
                    case 1:
                        locationRisk = _a.sent();
                        score += locationRisk;
                        _a.label = 2;
                    case 2:
                        hour = context.timestamp.getHours();
                        if (hour < 6 || hour > 22) {
                            score += 10;
                        }
                        return [4 /*yield*/, this.assessBehavioralRisk(context)];
                    case 3:
                        behavioralRisk = _a.sent();
                        score += behavioralRisk;
                        return [2 /*return*/, Math.min(score, this.MAX_RISK_SCORE)];
                }
            });
        });
    };
    /**
     * Assess location risk
     */
    ZeroTrustPolicyEngine.prototype.assessLocationRisk = function (location) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Check against known good/bad locations
                // For now, return low risk
                return [2 /*return*/, 5];
            });
        });
    };
    /**
     * Assess behavioral risk
     */
    ZeroTrustPolicyEngine.prototype.assessBehavioralRisk = function (context) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Check for:
                // - Impossible travel
                // - Unusual access patterns
                // - Velocity checks
                return [2 /*return*/, 0];
            });
        });
    };
    /**
     * Verify device trust status
     */
    ZeroTrustPolicyEngine.prototype.verifyDevice = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, device;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('trusted_devices').findOne({ deviceId: deviceId })];
                    case 1:
                        device = _a.sent();
                        return [2 /*return*/, device && device.trusted === true];
                }
            });
        });
    };
    /**
     * Register a trusted device
     */
    ZeroTrustPolicyEngine.prototype.registerDevice = function (deviceId, userId, metadata) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('trusted_devices').insertOne({
                                deviceId: deviceId,
                                userId: userId,
                                trusted: true,
                                registeredAt: new Date(),
                                metadata: metadata
                            })];
                    case 1:
                        _a.sent();
                        this.emit('device:registered', { deviceId: deviceId, userId: userId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Start continuous authentication for a session
     */
    ZeroTrustPolicyEngine.prototype.startContinuousAuth = function (sessionId, context) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('active_sessions').insertOne({
                                sessionId: sessionId,
                                userId: context.userId,
                                deviceId: context.deviceId,
                                startedAt: new Date(),
                                lastVerified: new Date(),
                                context: context
                            })];
                    case 1:
                        _a.sent();
                        this.emit('session:started', { sessionId: sessionId, userId: context.userId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check continuous authentication status
     */
    ZeroTrustPolicyEngine.prototype.checkAuthStatus = function (sessionId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, session, now, lastVerified;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('active_sessions').findOne({ sessionId: sessionId })];
                    case 1:
                        session = _a.sent();
                        if (!session) {
                            return [2 /*return*/, false];
                        }
                        now = Date.now();
                        lastVerified = new Date(session.lastVerified).getTime();
                        if (now - lastVerified > this.SESSION_TIMEOUT_MS) {
                            return [2 /*return*/, false];
                        }
                        // Update last verified
                        return [4 /*yield*/, db.collection('active_sessions').updateOne({ sessionId: sessionId }, { $set: { lastVerified: new Date() } })];
                    case 2:
                        // Update last verified
                        _a.sent();
                        return [2 /*return*/, true];
                }
            });
        });
    };
    /**
     * Log access decision
     */
    ZeroTrustPolicyEngine.prototype.logAccessDecision = function (request, response) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('access_logs').insertOne({
                                id: this.generateId(),
                                userId: request.context.userId,
                                deviceId: request.context.deviceId,
                                resource: request.resource,
                                action: request.action,
                                decision: response.decision,
                                reason: response.reason,
                                riskScore: response.riskScore,
                                timestamp: new Date()
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    ZeroTrustPolicyEngine.prototype.generateId = function () {
        return "zt_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    ZeroTrustPolicyEngine.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, policyCount, sessionCount, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('zero_trust_policies').countDocuments({ enabled: true })];
                    case 1:
                        policyCount = _a.sent();
                        return [4 /*yield*/, db.collection('active_sessions').countDocuments()];
                    case 2:
                        sessionCount = _a.sent();
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    activePolicies: policyCount,
                                    activeSessions: sessionCount
                                }
                            }];
                    case 3:
                        error_1 = _a.sent();
                        return [2 /*return*/, {
                                status: 'unhealthy',
                                details: { error: error_1.message }
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return ZeroTrustPolicyEngine;
}(events_1.EventEmitter));
exports.ZeroTrustPolicyEngine = ZeroTrustPolicyEngine;
