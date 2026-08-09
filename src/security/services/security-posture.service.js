"use strict";
/**
 * Security Posture Service
 * Overall security scoring and risk assessment
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
exports.SecurityPostureService = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var SecurityPostureService = /** @class */ (function (_super) {
    __extends(SecurityPostureService, _super);
    function SecurityPostureService() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    /**
     * Calculate overall security posture
     */
    SecurityPostureService.prototype.calculatePosture = function () {
        return __awaiter(this, void 0, void 0, function () {
            var categories, overallScore, issues, provenance, posture, db;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, Promise.all([
                            this.scoreCertificates(),
                            this.scoreAuthentication(),
                            this.scoreEncryption(),
                            this.scoreAccessControl(),
                            this.scoreThreatDetection(),
                            this.scoreCompliance(),
                            this.scoreSecrets()
                        ])];
                    case 1:
                        categories = _b.sent();
                        overallScore = this.calculateWeightedScore(categories);
                        return [4 /*yield*/, this.listIssues({ resolved: false })];
                    case 2:
                        issues = _b.sent();
                        provenance = this.determineProvenance(categories);
                        _a = {
                            overallScore: overallScore,
                            timestamp: new Date(),
                            categories: categories,
                            criticalIssues: issues.filter(function (i) { return i.severity === 'critical'; }).length,
                            highIssues: issues.filter(function (i) { return i.severity === 'high'; }).length,
                            mediumIssues: issues.filter(function (i) { return i.severity === 'medium'; }).length,
                            lowIssues: issues.filter(function (i) { return i.severity === 'low'; }).length
                        };
                        return [4 /*yield*/, this.calculateTrends()];
                    case 3:
                        _a.trends = _b.sent();
                        return [4 /*yield*/, this.getRecommendations()];
                    case 4:
                        posture = (_a.recommendations = _b.sent(),
                            _a.provenance = provenance,
                            _a);
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('security_posture_history').insertOne(posture)];
                    case 5:
                        _b.sent();
                        this.emit('posture:calculated', { score: overallScore });
                        return [2 /*return*/, posture];
                }
            });
        });
    };
    /**
     * Get current posture
     */
    SecurityPostureService.prototype.getPosture = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, posture;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('security_posture_history')
                                .findOne({}, { sort: { timestamp: -1 } })];
                    case 1:
                        posture = _a.sent();
                        if (!!posture) return [3 /*break*/, 3];
                        return [4 /*yield*/, this.calculatePosture()];
                    case 2: return [2 /*return*/, _a.sent()];
                    case 3: return [2 /*return*/, posture];
                }
            });
        });
    };
    /**
     * Get posture history
     */
    SecurityPostureService.prototype.getPostureHistory = function (days) {
        return __awaiter(this, void 0, void 0, function () {
            var db, startDate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        startDate = new Date();
                        startDate.setDate(startDate.getDate() - days);
                        return [4 /*yield*/, db.collection('security_posture_history')
                                .find({ timestamp: { $gte: startDate } })
                                .sort({ timestamp: 1 })
                                .toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Score certificates category
     */
    SecurityPostureService.prototype.scoreCertificates = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, total, expired, expiringSoon, score;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('certificates').countDocuments()];
                    case 1:
                        total = _a.sent();
                        return [4 /*yield*/, db.collection('certificates').countDocuments({ status: 'expired' })];
                    case 2:
                        expired = _a.sent();
                        return [4 /*yield*/, db.collection('certificates').countDocuments({ status: 'expiring_soon' })];
                    case 3:
                        expiringSoon = _a.sent();
                        score = total > 0 ? Math.max(0, 100 - (expired * 20) - (expiringSoon * 5)) : 0;
                        return [2 /*return*/, {
                                name: 'Certificate Management',
                                score: score,
                                weight: 15,
                                metrics: [
                                    { name: 'Total Certificates', value: total, target: 0, unit: 'count', status: 'good' },
                                    { name: 'Expired', value: expired, target: 0, unit: 'count', status: expired > 0 ? 'critical' : 'good' },
                                    { name: 'Expiring Soon', value: expiringSoon, target: 0, unit: 'count', status: expiringSoon > 3 ? 'warning' : 'good' }
                                ],
                                issues: []
                            }];
                }
            });
        });
    };
    /**
     * Score authentication category
     */
    SecurityPostureService.prototype.scoreAuthentication = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, totalUsers, mfaEnabled, score;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('users').countDocuments()];
                    case 1:
                        totalUsers = _a.sent();
                        return [4 /*yield*/, db.collection('users').countDocuments({ mfaEnabled: true })];
                    case 2:
                        mfaEnabled = _a.sent();
                        score = totalUsers > 0 ? (mfaEnabled / totalUsers) * 100 : 0;
                        return [2 /*return*/, {
                                name: 'Authentication & Access Control',
                                score: score,
                                weight: 20,
                                metrics: [
                                    { name: 'Users with MFA', value: mfaEnabled, target: totalUsers, unit: 'users', status: score > 80 ? 'good' : 'warning' },
                                    { name: 'MFA Coverage', value: Math.round(score), target: 100, unit: '%', status: score > 80 ? 'good' : 'warning' }
                                ],
                                issues: []
                            }];
                }
            });
        });
    };
    /**
     * Score encryption category
     */
    SecurityPostureService.prototype.scoreEncryption = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, totalVideos, encryptedVideos, score;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('videos').countDocuments()];
                    case 1:
                        totalVideos = _a.sent();
                        return [4 /*yield*/, db.collection('encrypted_videos').countDocuments()];
                    case 2:
                        encryptedVideos = _a.sent();
                        score = totalVideos > 0 ? (encryptedVideos / totalVideos) * 100 : 0;
                        return [2 /*return*/, {
                                name: 'Data Encryption',
                                score: score,
                                weight: 20,
                                metrics: [
                                    { name: 'Encrypted Videos', value: encryptedVideos, target: totalVideos, unit: 'videos', status: score > 90 ? 'good' : 'warning' },
                                    { name: 'Encryption Coverage', value: Math.round(score), target: 100, unit: '%', status: score > 90 ? 'good' : 'warning' }
                                ],
                                issues: []
                            }];
                }
            });
        });
    };
    /**
     * Score access control category
     */
    SecurityPostureService.prototype.scoreAccessControl = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, policies, score;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('zero_trust_policies').countDocuments({ enabled: true })];
                    case 1:
                        policies = _a.sent();
                        score = Math.min(100, policies * 10);
                        return [2 /*return*/, {
                                name: 'Access Control',
                                score: score,
                                weight: 15,
                                metrics: [
                                    { name: 'Active Policies', value: policies, target: 10, unit: 'policies', status: policies >= 5 ? 'good' : 'warning' }
                                ],
                                issues: []
                            }];
                }
            });
        });
    };
    /**
     * Score threat detection category
     */
    SecurityPostureService.prototype.scoreThreatDetection = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, activeThreats, totalThreatRecords, score;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('ransomware_threats').countDocuments({ resolved: false })];
                    case 1:
                        activeThreats = _a.sent();
                        return [4 /*yield*/, db.collection('ransomware_threats').countDocuments()];
                    case 2:
                        totalThreatRecords = _a.sent();
                        score = totalThreatRecords > 0 ? Math.max(0, 100 - (activeThreats * 10)) : 0;
                        return [2 /*return*/, {
                                name: 'Threat Detection',
                                score: score,
                                weight: 20,
                                metrics: [
                                    {
                                        name: 'Active Threats',
                                        value: activeThreats,
                                        target: 0,
                                        unit: 'threats',
                                        status: totalThreatRecords > 0 ? (activeThreats === 0 ? 'good' : 'critical') : 'unavailable'
                                    }
                                ],
                                issues: []
                            }];
                }
            });
        });
    };
    /**
     * Score compliance category
     */
    SecurityPostureService.prototype.scoreCompliance = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, controls, totalControls, compliantControls, score;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('compliance_controls').find().toArray()];
                    case 1:
                        controls = _a.sent();
                        totalControls = controls.length;
                        compliantControls = controls.filter(function (c) { return c.compliant; }).length;
                        score = totalControls > 0 ? Math.round((compliantControls / totalControls) * 100) : 0;
                        return [2 /*return*/, {
                                name: 'Compliance',
                                score: score,
                                weight: 10,
                                metrics: [
                                    {
                                        name: 'Compliance Score',
                                        value: score,
                                        target: 100,
                                        unit: '%',
                                        status: totalControls > 0 ? (score >= 80 ? 'good' : 'warning') : 'unavailable'
                                    }
                                ],
                                issues: []
                            }];
                }
            });
        });
    };
    /**
     * Score secrets / secret-vault category
     */
    SecurityPostureService.prototype.scoreSecrets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var SecurityServicesFactory, factory, all, expiring, needsRotation, total, expiringCount, needsRotationCount, rotationCandidates, compliantCount, _i, rotationCandidates_1, s, intervalDays, last, ageMs, rotationCompliance, score, error_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0: return [4 /*yield*/, Promise.resolve().then(function () { return require('./index.js'); })];
                    case 1:
                        SecurityServicesFactory = (_c.sent()).SecurityServicesFactory;
                        factory = SecurityServicesFactory.getInstance();
                        // If secret vault is not configured, return a placeholder indicating unavailability
                        if (!factory.secretVault) {
                            return [2 /*return*/, {
                                    name: 'Secret Vault',
                                    score: 0,
                                    weight: 10,
                                    metrics: [
                                        { name: 'Rotation Compliance', value: null, target: 100, unit: '%', status: 'unavailable' },
                                        { name: 'Secrets Expiring Soon', value: null, target: 0, unit: 'count', status: 'unavailable' }
                                    ],
                                    issues: []
                                }];
                        }
                        _c.label = 2;
                    case 2:
                        _c.trys.push([2, 6, , 7]);
                        return [4 /*yield*/, factory.secretVault.listSecrets()];
                    case 3:
                        all = _c.sent();
                        return [4 /*yield*/, factory.secretVault.listSecrets({ expiringSoon: true })];
                    case 4:
                        expiring = _c.sent();
                        return [4 /*yield*/, factory.secretVault.listSecrets({ needsRotation: true })];
                    case 5:
                        needsRotation = _c.sent();
                        total = all.length;
                        expiringCount = expiring.length;
                        needsRotationCount = needsRotation.length;
                        rotationCandidates = all.filter(function (s) { return s.rotationPolicy && s.rotationPolicy.enabled; });
                        compliantCount = 0;
                        for (_i = 0, rotationCandidates_1 = rotationCandidates; _i < rotationCandidates_1.length; _i++) {
                            s = rotationCandidates_1[_i];
                            if (!s.lastRotatedAt)
                                continue;
                            intervalDays = (_b = ((_a = s.rotationPolicy) === null || _a === void 0 ? void 0 : _a.intervalDays)) !== null && _b !== void 0 ? _b : 90;
                            last = new Date(s.lastRotatedAt);
                            ageMs = Date.now() - last.getTime();
                            if (ageMs <= intervalDays * 24 * 60 * 60 * 1000)
                                compliantCount++;
                        }
                        rotationCompliance = rotationCandidates.length > 0 ? Math.round((compliantCount / rotationCandidates.length) * 100) : 100;
                        score = Math.round(rotationCompliance * 0.8 + (total > 0 ? Math.max(0, 100 - (expiringCount * 5)) * 0.2 : 100 * 0.2));
                        return [2 /*return*/, {
                                name: 'Secret Vault',
                                score: score,
                                weight: 10,
                                metrics: [
                                    { name: 'Rotation Compliance', value: rotationCompliance, target: 100, unit: '%', status: rotationCompliance >= 80 ? 'good' : 'warning' },
                                    { name: 'Secrets Expiring Soon', value: expiringCount, target: 0, unit: 'count', status: expiringCount > 0 ? 'warning' : 'good' }
                                ],
                                issues: []
                            }];
                    case 6:
                        error_1 = _c.sent();
                        return [2 /*return*/, {
                                name: 'Secret Vault',
                                score: 0,
                                weight: 10,
                                metrics: [
                                    { name: 'Rotation Compliance', value: null, target: 100, unit: '%', status: 'unavailable' },
                                    { name: 'Secrets Expiring Soon', value: null, target: 0, unit: 'count', status: 'unavailable' }
                                ],
                                issues: []
                            }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List security issues
     */
    SecurityPostureService.prototype.listIssues = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var db, query;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = {};
                        if (filters.category) {
                            query.category = filters.category;
                        }
                        if (filters.severity) {
                            query.severity = filters.severity;
                        }
                        if (filters.resolved !== undefined) {
                            query.resolvedAt = filters.resolved ? { $exists: true } : { $exists: false };
                        }
                        return [4 /*yield*/, db.collection('security_issues')
                                .find(query)
                                .sort({ severity: 1, detectedAt: -1 })
                                .toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Resolve issue
     */
    SecurityPostureService.prototype.resolveIssue = function (issueId, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('security_issues').updateOne({ id: issueId }, {
                                $set: {
                                    resolvedAt: new Date(),
                                    resolvedBy: userId
                                }
                            })];
                    case 1:
                        _a.sent();
                        this.emit('issue:resolved', { issueId: issueId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Mark issue as false positive
     */
    SecurityPostureService.prototype.markFalsePositive = function (issueId, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('security_issues').updateOne({ id: issueId }, {
                                $set: {
                                    falsePositive: true,
                                    resolvedAt: new Date(),
                                    resolvedBy: userId
                                }
                            })];
                    case 1:
                        _a.sent();
                        this.emit('issue:false-positive', { issueId: issueId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get security recommendations
     */
    SecurityPostureService.prototype.getRecommendations = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, [
                        {
                            priority: 1,
                            category: 'Certificates',
                            title: 'Renew expiring certificates',
                            description: 'Several certificates will expire within 30 days',
                            impact: 'Service disruption, security warnings',
                            effort: 'low',
                            resourceLinks: ['/docs/certificate-renewal']
                        },
                        {
                            priority: 2,
                            category: 'Authentication',
                            title: 'Enable MFA for all users',
                            description: 'Multi-factor authentication is not enabled for all users',
                            impact: 'Increased account security',
                            effort: 'medium',
                            resourceLinks: ['/docs/mfa-setup']
                        }
                    ]];
            });
        });
    };
    /**
     * Assess compliance against framework
     */
    SecurityPostureService.prototype.assessCompliance = function (framework) {
        return __awaiter(this, void 0, void 0, function () {
            var controls, implemented, compliant, overallCompliance;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getFrameworkControls(framework)];
                    case 1:
                        controls = _a.sent();
                        implemented = controls.filter(function (c) { return c.implemented; }).length;
                        compliant = controls.filter(function (c) { return c.compliant; }).length;
                        overallCompliance = controls.length > 0 ? (compliant / controls.length) * 100 : 0;
                        return [2 /*return*/, {
                                framework: framework,
                                overallCompliance: overallCompliance,
                                controls: controls,
                                lastAssessment: new Date(),
                                nextAssessment: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000) // 90 days
                            }];
                }
            });
        });
    };
    /**
     * List compliance frameworks
     */
    SecurityPostureService.prototype.listComplianceFrameworks = function () {
        return __awaiter(this, void 0, void 0, function () {
            var frameworks;
            var _this = this;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        frameworks = [
                            types_js_1.ComplianceFramework.ISO_27001,
                            types_js_1.ComplianceFramework.NIST_CSF,
                            types_js_1.ComplianceFramework.SOC_2
                        ];
                        return [4 /*yield*/, Promise.all(frameworks.map(function (f) { return _this.assessCompliance(f); }))];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    // Private helpers
    SecurityPostureService.prototype.calculateWeightedScore = function (categories) {
        var _this = this;
        var availableCategories = categories.filter(function (cat) { return _this.isCategoryAvailable(cat); });
        if (availableCategories.length === 0) {
            return 0;
        }
        var totalWeight = availableCategories.reduce(function (sum, cat) { return sum + cat.weight; }, 0);
        var weightedSum = availableCategories.reduce(function (sum, cat) { return sum + (cat.score * cat.weight); }, 0);
        return Math.round(weightedSum / totalWeight);
    };
    SecurityPostureService.prototype.isCategoryAvailable = function (category) {
        return category.metrics.some(function (metric) { return metric.status !== 'unavailable' && metric.value !== null && metric.value !== undefined; });
    };
    SecurityPostureService.prototype.determineProvenance = function (categories) {
        var _this = this;
        var availableCount = categories.filter(function (cat) { return _this.isCategoryAvailable(cat); }).length;
        if (availableCount === 0) {
            return 'UNAVAILABLE';
        }
        if (availableCount < categories.length) {
            return 'PARTIAL';
        }
        return 'LIVE';
    };
    SecurityPostureService.prototype.calculateTrends = function () {
        return __awaiter(this, void 0, void 0, function () {
            var history, latest, previous, changePercent;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getPostureHistory(30)];
                    case 1:
                        history = _a.sent();
                        if (history.length < 2) {
                            return [2 /*return*/, []];
                        }
                        latest = history[history.length - 1];
                        previous = history[history.length - 2];
                        changePercent = ((latest.overallScore - previous.overallScore) / previous.overallScore) * 100;
                        return [2 /*return*/, [{
                                    metric: 'Overall Security Score',
                                    dataPoints: history.map(function (h) { return ({
                                        timestamp: h.timestamp,
                                        value: h.overallScore
                                    }); }),
                                    direction: changePercent > 1 ? 'improving' : changePercent < -1 ? 'degrading' : 'stable',
                                    changePercent: changePercent
                                }]];
                }
            });
        });
    };
    SecurityPostureService.prototype.getFrameworkControls = function (framework) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Placeholder - would map to actual framework controls
                return [2 /*return*/, [
                        {
                            id: 'C1',
                            name: 'Access Control',
                            description: 'Implement proper access controls',
                            category: 'Access',
                            required: true,
                            implemented: true,
                            compliant: true,
                            evidence: [],
                            lastVerified: new Date()
                        }
                    ]];
            });
        });
    };
    SecurityPostureService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var posture, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getPosture()];
                    case 1:
                        posture = _a.sent();
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    overallScore: posture.overallScore,
                                    criticalIssues: posture.criticalIssues
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
    return SecurityPostureService;
}(events_1.EventEmitter));
exports.SecurityPostureService = SecurityPostureService;
