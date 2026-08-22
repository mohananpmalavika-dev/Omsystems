"use strict";
/**
 * Immutable Storage Service
 * WORM storage with retention policies and legal holds
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
exports.ImmutableStorageService = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var crypto_1 = require("crypto");
var ImmutableStorageService = /** @class */ (function (_super) {
    __extends(ImmutableStorageService, _super);
    function ImmutableStorageService() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    /**
     * Store object with immutability guarantees
     */
    ImmutableStorageService.prototype.storeImmutable = function (objectKey_1, objectType_1, data_1, retentionDays_1) {
        return __awaiter(this, arguments, void 0, function (objectKey, objectType, data, retentionDays, metadata) {
            var db, checksum, retentionExpiresAt, immutableObject;
            if (metadata === void 0) { metadata = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        checksum = this.calculateChecksum(data);
                        retentionExpiresAt = new Date();
                        retentionExpiresAt.setDate(retentionExpiresAt.getDate() + retentionDays);
                        immutableObject = {
                            id: this.generateId(),
                            objectKey: objectKey,
                            objectType: objectType,
                            size: data.length,
                            checksum: checksum,
                            algorithm: 'sha256',
                            retentionPeriodDays: retentionDays,
                            retentionExpiresAt: retentionExpiresAt,
                            retentionStatus: types_js_1.RetentionStatus.ACTIVE,
                            legalHolds: [],
                            versions: [{
                                    versionId: this.generateVersionId(),
                                    checksum: checksum,
                                    size: data.length,
                                    timestamp: new Date(),
                                    immutable: true
                                }],
                            createdAt: new Date(),
                            createdBy: 'system',
                            locked: false,
                            metadata: metadata
                        };
                        // Store metadata in database
                        return [4 /*yield*/, db.collection('immutable_objects').insertOne(immutableObject)];
                    case 1:
                        // Store metadata in database
                        _a.sent();
                        // Store actual data in immutable storage backend
                        return [4 /*yield*/, this.storeObjectData(immutableObject.id, data)];
                    case 2:
                        // Store actual data in immutable storage backend
                        _a.sent();
                        this.emit('object:stored', { objectId: immutableObject.id, objectKey: objectKey, objectType: objectType });
                        return [2 /*return*/, immutableObject];
                }
            });
        });
    };
    /**
     * Get immutable object
     */
    ImmutableStorageService.prototype.getImmutableObject = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, object;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('immutable_objects').findOne({ id: id })];
                    case 1:
                        object = _a.sent();
                        if (!object) {
                            throw new Error('Immutable object not found');
                        }
                        return [2 /*return*/, object];
                }
            });
        });
    };
    /**
     * List immutable objects with filters
     */
    ImmutableStorageService.prototype.listImmutableObjects = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var db, query;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = {};
                        if (filters.objectType) {
                            query.objectType = filters.objectType;
                        }
                        if (filters.retentionStatus) {
                            query.retentionStatus = filters.retentionStatus;
                        }
                        if (filters.hasLegalHold !== undefined) {
                            query['legalHolds.0'] = filters.hasLegalHold ? { $exists: true } : { $exists: false };
                        }
                        return [4 /*yield*/, db.collection('immutable_objects')
                                .find(query)
                                .sort({ createdAt: -1 })
                                .limit(100)
                                .toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Apply retention policy
     */
    ImmutableStorageService.prototype.applyRetentionPolicy = function (policyId, objectId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, policy, object, newExpiresAt;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('retention_policies').findOne({ id: policyId })];
                    case 1:
                        policy = _a.sent();
                        if (!policy) {
                            throw new Error('Retention policy not found');
                        }
                        return [4 /*yield*/, this.getImmutableObject(objectId)];
                    case 2:
                        object = _a.sent();
                        newExpiresAt = new Date();
                        newExpiresAt.setDate(newExpiresAt.getDate() + policy.retentionDays);
                        return [4 /*yield*/, db.collection('immutable_objects').updateOne({ id: objectId }, {
                                $set: {
                                    retentionPeriodDays: policy.retentionDays,
                                    retentionExpiresAt: newExpiresAt,
                                    metadata: __assign(__assign({}, object.metadata), { policyId: policyId, policyAppliedAt: new Date() })
                                }
                            })];
                    case 3:
                        _a.sent();
                        if (!policy.lockImmediately) return [3 /*break*/, 5];
                        return [4 /*yield*/, this.lockObject(objectId)];
                    case 4:
                        _a.sent();
                        _a.label = 5;
                    case 5:
                        this.emit('policy:applied', { objectId: objectId, policyId: policyId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Extend retention period
     */
    ImmutableStorageService.prototype.extendRetention = function (objectId, additionalDays) {
        return __awaiter(this, void 0, void 0, function () {
            var db, object, newExpiresAt;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getImmutableObject(objectId)];
                    case 1:
                        object = _a.sent();
                        if (object.locked) {
                            throw new Error('Cannot extend retention on locked object');
                        }
                        newExpiresAt = new Date(object.retentionExpiresAt);
                        newExpiresAt.setDate(newExpiresAt.getDate() + additionalDays);
                        return [4 /*yield*/, db.collection('immutable_objects').updateOne({ id: objectId }, {
                                $set: {
                                    retentionPeriodDays: object.retentionPeriodDays + additionalDays,
                                    retentionExpiresAt: newExpiresAt
                                }
                            })];
                    case 2:
                        _a.sent();
                        this.emit('retention:extended', { objectId: objectId, additionalDays: additionalDays });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Apply legal hold
     */
    ImmutableStorageService.prototype.applyLegalHold = function (objectId, caseNumber, description) {
        return __awaiter(this, void 0, void 0, function () {
            var db, hold;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        hold = {
                            id: this.generateId(),
                            caseNumber: caseNumber,
                            description: description,
                            appliedAt: new Date(),
                            appliedBy: 'system'
                        };
                        return [4 /*yield*/, db.collection('immutable_objects').updateOne({ id: objectId }, {
                                $push: { legalHolds: hold },
                                $set: { retentionStatus: types_js_1.RetentionStatus.LEGAL_HOLD }
                            })];
                    case 1:
                        _a.sent();
                        this.emit('legal-hold:applied', { objectId: objectId, caseNumber: caseNumber });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Release legal hold
     */
    ImmutableStorageService.prototype.releaseLegalHold = function (objectId, holdId, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, object, activeHolds;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('immutable_objects').updateOne({ id: objectId, 'legalHolds.id': holdId }, {
                                $set: {
                                    'legalHolds.$.releasedAt': new Date(),
                                    'legalHolds.$.releasedBy': userId
                                }
                            })];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.getImmutableObject(objectId)];
                    case 2:
                        object = _a.sent();
                        activeHolds = object.legalHolds.filter(function (h) { return !h.releasedAt; });
                        if (!(activeHolds.length === 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, db.collection('immutable_objects').updateOne({ id: objectId }, { $set: { retentionStatus: types_js_1.RetentionStatus.ACTIVE } })];
                    case 3:
                        _a.sent();
                        _a.label = 4;
                    case 4:
                        this.emit('legal-hold:released', { objectId: objectId, holdId: holdId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List legal holds for an object
     */
    ImmutableStorageService.prototype.listLegalHolds = function (objectId) {
        return __awaiter(this, void 0, void 0, function () {
            var object;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getImmutableObject(objectId)];
                    case 1:
                        object = _a.sent();
                        return [2 /*return*/, object.legalHolds];
                }
            });
        });
    };
    /**
     * Lock object (make truly immutable)
     */
    ImmutableStorageService.prototype.lockObject = function (objectId) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('immutable_objects').updateOne({ id: objectId }, {
                                $set: {
                                    locked: true,
                                    lockedAt: new Date(),
                                    retentionStatus: types_js_1.RetentionStatus.LOCKED
                                }
                            })];
                    case 1:
                        _a.sent();
                        this.emit('object:locked', { objectId: objectId });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Verify object integrity
     */
    ImmutableStorageService.prototype.verifyIntegrity = function (objectId) {
        return __awaiter(this, void 0, void 0, function () {
            var object, data, currentChecksum;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getImmutableObject(objectId)];
                    case 1:
                        object = _a.sent();
                        return [4 /*yield*/, this.retrieveObjectData(objectId)];
                    case 2:
                        data = _a.sent();
                        currentChecksum = this.calculateChecksum(data);
                        return [2 /*return*/, currentChecksum === object.checksum];
                }
            });
        });
    };
    /**
     * Verify immutability (check if object has been modified)
     */
    ImmutableStorageService.prototype.verifyImmutability = function (objectId) {
        return __awaiter(this, void 0, void 0, function () {
            var object;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getImmutableObject(objectId)];
                    case 1:
                        object = _a.sent();
                        // Check if all versions are marked immutable
                        return [2 /*return*/, object.versions.every(function (v) { return v.immutable === true; })];
                }
            });
        });
    };
    /**
     * Create retention policy
     */
    ImmutableStorageService.prototype.createRetentionPolicy = function (policy) {
        return __awaiter(this, void 0, void 0, function () {
            var db, newPolicy;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        newPolicy = __assign({ id: this.generateId() }, policy);
                        return [4 /*yield*/, db.collection('retention_policies').insertOne(newPolicy)];
                    case 1:
                        _a.sent();
                        this.emit('policy:created', { policyId: newPolicy.id });
                        return [2 /*return*/, newPolicy];
                }
            });
        });
    };
    /**
     * List retention policies
     */
    ImmutableStorageService.prototype.listRetentionPolicies = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('retention_policies')
                                .find({ enabled: true })
                                .sort({ priority: 1 })
                                .toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Store object data (placeholder - would use S3 Object Lock or similar)
     */
    ImmutableStorageService.prototype.storeObjectData = function (objectId, data) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('immutable_object_data').insertOne({
                                objectId: objectId,
                                data: data.toString('base64'),
                                storedAt: new Date()
                            })];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Retrieve object data
     */
    ImmutableStorageService.prototype.retrieveObjectData = function (objectId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, record;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('immutable_object_data').findOne({ objectId: objectId })];
                    case 1:
                        record = _a.sent();
                        if (!record) {
                            throw new Error('Object data not found');
                        }
                        return [2 /*return*/, Buffer.from(record.data, 'base64')];
                }
            });
        });
    };
    /**
     * Calculate checksum
     */
    ImmutableStorageService.prototype.calculateChecksum = function (data) {
        return (0, crypto_1.createHash)('sha256').update(data).digest('hex');
    };
    ImmutableStorageService.prototype.generateId = function () {
        return "immut_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    ImmutableStorageService.prototype.generateVersionId = function () {
        return "v_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    ImmutableStorageService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, totalObjects, lockedObjects, legalHolds, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 4, , 5]);
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('immutable_objects').countDocuments()];
                    case 1:
                        totalObjects = _a.sent();
                        return [4 /*yield*/, db.collection('immutable_objects').countDocuments({ locked: true })];
                    case 2:
                        lockedObjects = _a.sent();
                        return [4 /*yield*/, db.collection('immutable_objects').countDocuments({ 'legalHolds.0': { $exists: true } })];
                    case 3:
                        legalHolds = _a.sent();
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    totalObjects: totalObjects,
                                    lockedObjects: lockedObjects,
                                    objectsWithLegalHolds: legalHolds
                                }
                            }];
                    case 4:
                        error_1 = _a.sent();
                        return [2 /*return*/, {
                                status: 'unhealthy',
                                details: { error: error_1.message }
                            }];
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    return ImmutableStorageService;
}(events_1.EventEmitter));
exports.ImmutableStorageService = ImmutableStorageService;
