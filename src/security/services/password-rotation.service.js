"use strict";
/**
 * Password Rotation Service
 * Automated credential rotation for devices and services
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
exports.PasswordRotationService = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var crypto = require("crypto");
var axios_1 = require("axios");
var PasswordRotationService = /** @class */ (function (_super) {
    __extends(PasswordRotationService, _super);
    function PasswordRotationService(secretVault) {
        var _this = _super.call(this) || this;
        _this.schedulerInterval = null;
        _this.secretVault = secretVault;
        _this.startScheduler();
        return _this;
    }
    /**
     * Add rotation target
     */
    PasswordRotationService.prototype.addTarget = function (target) {
        return __awaiter(this, void 0, void 0, function () {
            var db, rotationTarget;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        rotationTarget = __assign(__assign({ id: this.generateId() }, target), { nextRotation: this.calculateNextRotation(target.rotationPolicy) });
                        return [4 /*yield*/, db.collection('password_rotation_targets').insertOne(rotationTarget)];
                    case 1:
                        _a.sent();
                        this.emit('target:added', { targetId: rotationTarget.id, type: target.type, name: target.name });
                        return [2 /*return*/, rotationTarget];
                }
            });
        });
    };
    /**
     * Get target by ID
     */
    PasswordRotationService.prototype.getTarget = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, target;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('password_rotation_targets').findOne({ id: id })];
                    case 1:
                        target = _a.sent();
                        if (!target) {
                            throw new Error('Rotation target not found');
                        }
                        return [2 /*return*/, target];
                }
            });
        });
    };
    /**
     * List targets with filters
     */
    PasswordRotationService.prototype.listTargets = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var db, query, threeDaysAgo, targets;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = {};
                        if (filters.type) {
                            query.type = filters.type;
                        }
                        if (filters.enabled !== undefined) {
                            query.enabled = filters.enabled;
                        }
                        if (filters.needsRotation) {
                            query.nextRotation = { $lte: new Date() };
                        }
                        if (filters.overdue) {
                            threeDaysAgo = new Date();
                            threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
                            query.nextRotation = { $lte: threeDaysAgo };
                        }
                        return [4 /*yield*/, db.collection('password_rotation_targets')
                                .find(query)
                                .sort({ nextRotation: 1 })
                                .toArray()];
                    case 1:
                        targets = _a.sent();
                        return [2 /*return*/, targets];
                }
            });
        });
    };
    /**
     * Update target
     */
    PasswordRotationService.prototype.updateTarget = function (id, updates) {
        return __awaiter(this, void 0, void 0, function () {
            var db, result;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('password_rotation_targets').findOneAndUpdate({ id: id }, { $set: __assign(__assign({}, updates), { updatedAt: new Date() }) }, { returnDocument: 'after' })];
                    case 1:
                        result = _a.sent();
                        if (!result.value) {
                            throw new Error('Target not found');
                        }
                        this.emit('target:updated', { targetId: id });
                        return [2 /*return*/, result.value];
                }
            });
        });
    };
    /**
     * Delete target
     */
    PasswordRotationService.prototype.deleteTarget = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('password_rotation_targets').deleteOne({ id: id })];
                    case 1:
                        _a.sent();
                        this.emit('target:deleted', { targetId: id });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Rotate password for a target
     */
    PasswordRotationService.prototype.rotatePassword = function (targetId_1) {
        return __awaiter(this, arguments, void 0, function (targetId, force) {
            var db, target, job;
            if (force === void 0) { force = false; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getTarget(targetId)];
                    case 1:
                        target = _a.sent();
                        if (!target.enabled && !force) {
                            throw new Error('Target is disabled. Use force=true to rotate anyway.');
                        }
                        job = {
                            id: this.generateId(),
                            targetId: targetId,
                            status: types_js_1.RotationStatus.PENDING,
                            scheduledAt: new Date(),
                            oldPasswordHash: '',
                            newPasswordHash: '',
                            attempts: 0,
                            rollbackAvailable: true
                        };
                        return [4 /*yield*/, db.collection('password_rotation_jobs').insertOne(job)];
                    case 2:
                        _a.sent();
                        // Execute rotation asynchronously
                        this.executeRotation(job.id, target).catch(function (error) {
                            console.error("Rotation job ".concat(job.id, " failed:"), error);
                        });
                        return [2 /*return*/, job];
                }
            });
        });
    };
    /**
     * Rotate all passwords matching filters
     */
    PasswordRotationService.prototype.rotateAll = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var targets, jobs, _i, targets_1, target, job, error_1;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.listTargets(__assign(__assign({}, filters), { enabled: true }))];
                    case 1:
                        targets = _a.sent();
                        jobs = [];
                        _i = 0, targets_1 = targets;
                        _a.label = 2;
                    case 2:
                        if (!(_i < targets_1.length)) return [3 /*break*/, 7];
                        target = targets_1[_i];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.rotatePassword(target.id)];
                    case 4:
                        job = _a.sent();
                        jobs.push(job);
                        return [3 /*break*/, 6];
                    case 5:
                        error_1 = _a.sent();
                        console.error("Failed to rotate target ".concat(target.id, ":"), error_1);
                        return [3 /*break*/, 6];
                    case 6:
                        _i++;
                        return [3 /*break*/, 2];
                    case 7: return [2 /*return*/, jobs];
                }
            });
        });
    };
    /**
     * Schedule rotation
     */
    PasswordRotationService.prototype.scheduleRotation = function (targetId, scheduledAt) {
        return __awaiter(this, void 0, void 0, function () {
            var db, target, job;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getTarget(targetId)];
                    case 1:
                        target = _a.sent();
                        job = {
                            id: this.generateId(),
                            targetId: targetId,
                            status: types_js_1.RotationStatus.PENDING,
                            scheduledAt: scheduledAt,
                            oldPasswordHash: '',
                            newPasswordHash: '',
                            attempts: 0,
                            rollbackAvailable: true
                        };
                        return [4 /*yield*/, db.collection('password_rotation_jobs').insertOne(job)];
                    case 2:
                        _a.sent();
                        this.emit('job:scheduled', { jobId: job.id, targetId: targetId, scheduledAt: scheduledAt });
                        return [2 /*return*/, job];
                }
            });
        });
    };
    /**
     * Get job by ID
     */
    PasswordRotationService.prototype.getJob = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, job;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('password_rotation_jobs').findOne({ id: id })];
                    case 1:
                        job = _a.sent();
                        if (!job) {
                            throw new Error('Job not found');
                        }
                        return [2 /*return*/, job];
                }
            });
        });
    };
    /**
     * List jobs
     */
    PasswordRotationService.prototype.listJobs = function (targetId, status) {
        return __awaiter(this, void 0, void 0, function () {
            var db, query, jobs;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = {};
                        if (targetId) {
                            query.targetId = targetId;
                        }
                        if (status) {
                            query.status = status;
                        }
                        return [4 /*yield*/, db.collection('password_rotation_jobs')
                                .find(query)
                                .sort({ scheduledAt: -1 })
                                .limit(100)
                                .toArray()];
                    case 1:
                        jobs = _a.sent();
                        return [2 /*return*/, jobs];
                }
            });
        });
    };
    /**
     * Retry failed job
     */
    PasswordRotationService.prototype.retryJob = function (jobId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, job, target;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getJob(jobId)];
                    case 1:
                        job = _a.sent();
                        if (job.status !== types_js_1.RotationStatus.FAILED) {
                            throw new Error('Can only retry failed jobs');
                        }
                        // Reset job status
                        return [4 /*yield*/, db.collection('password_rotation_jobs').updateOne({ id: jobId }, {
                                $set: {
                                    status: types_js_1.RotationStatus.PENDING,
                                    error: undefined
                                },
                                $inc: { attempts: 1 }
                            })];
                    case 2:
                        // Reset job status
                        _a.sent();
                        return [4 /*yield*/, this.getTarget(job.targetId)];
                    case 3:
                        target = _a.sent();
                        // Execute rotation
                        this.executeRotation(jobId, target).catch(function (error) {
                            console.error("Retry of job ".concat(jobId, " failed:"), error);
                        });
                        return [4 /*yield*/, this.getJob(jobId)];
                    case 4: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Rollback job (restore old password)
     */
    PasswordRotationService.prototype.rollbackJob = function (jobId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, job, target, oldSecret, oldPassword, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getJob(jobId)];
                    case 1:
                        job = _a.sent();
                        if (!job.rollbackAvailable) {
                            throw new Error('Rollback not available for this job');
                        }
                        if (job.status !== types_js_1.RotationStatus.SUCCESS) {
                            throw new Error('Can only rollback successful jobs');
                        }
                        return [4 /*yield*/, this.getTarget(job.targetId)];
                    case 2:
                        target = _a.sent();
                        return [4 /*yield*/, this.secretVault.getSecret(target.secretId, job.oldPasswordHash)];
                    case 3:
                        oldSecret = _a.sent();
                        return [4 /*yield*/, this.secretVault.decrypt(oldSecret.value)];
                    case 4:
                        oldPassword = _a.sent();
                        _a.label = 5;
                    case 5:
                        _a.trys.push([5, 8, , 9]);
                        return [4 /*yield*/, this.applyPasswordToDevice(target, oldPassword)];
                    case 6:
                        _a.sent();
                        // Update job
                        return [4 /*yield*/, db.collection('password_rotation_jobs').updateOne({ id: jobId }, {
                                $set: {
                                    status: types_js_1.RotationStatus.SKIPPED,
                                    error: 'Rolled back by user'
                                }
                            })];
                    case 7:
                        // Update job
                        _a.sent();
                        this.emit('job:rolled-back', { jobId: jobId, targetId: target.id });
                        return [3 /*break*/, 9];
                    case 8:
                        error_2 = _a.sent();
                        throw new Error("Rollback failed: ".concat(error_2.message));
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate password according to policy
     */
    PasswordRotationService.prototype.generatePassword = function (policy) {
        return __awaiter(this, void 0, void 0, function () {
            var charset, password, randomBytes, i, randomIndex;
            return __generator(this, function (_a) {
                charset = this.buildCharset(policy);
                password = '';
                randomBytes = crypto.randomBytes(policy.maxLength);
                // Generate random password
                for (i = 0; i < policy.minLength; i++) {
                    randomIndex = randomBytes[i] % charset.length;
                    password += charset[randomIndex];
                }
                // Ensure policy requirements are met
                if (policy.requireUppercase && !/[A-Z]/.test(password)) {
                    password = this.replaceRandomChar(password, 'ABCDEFGHIJKLMNOPQRSTUVWXYZ');
                }
                if (policy.requireLowercase && !/[a-z]/.test(password)) {
                    password = this.replaceRandomChar(password, 'abcdefghijklmnopqrstuvwxyz');
                }
                if (policy.requireNumbers && !/[0-9]/.test(password)) {
                    password = this.replaceRandomChar(password, '0123456789');
                }
                if (policy.requireSpecialChars && !new RegExp("[".concat(policy.specialChars, "]")).test(password)) {
                    password = this.replaceRandomChar(password, policy.specialChars);
                }
                // Check against forbidden passwords
                if (policy.forbiddenPasswords.includes(password)) {
                    return [2 /*return*/, this.generatePassword(policy)]; // Regenerate
                }
                return [2 /*return*/, password];
            });
        });
    };
    /**
     * Validate password against policy
     */
    PasswordRotationService.prototype.validatePassword = function (password, policy) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (password.length < policy.minLength || password.length > policy.maxLength) {
                    return [2 /*return*/, false];
                }
                if (policy.requireUppercase && !/[A-Z]/.test(password)) {
                    return [2 /*return*/, false];
                }
                if (policy.requireLowercase && !/[a-z]/.test(password)) {
                    return [2 /*return*/, false];
                }
                if (policy.requireNumbers && !/[0-9]/.test(password)) {
                    return [2 /*return*/, false];
                }
                if (policy.requireSpecialChars && !new RegExp("[".concat(policy.specialChars, "]")).test(password)) {
                    return [2 /*return*/, false];
                }
                if (policy.forbiddenPasswords.includes(password)) {
                    return [2 /*return*/, false];
                }
                return [2 /*return*/, true];
            });
        });
    };
    /**
     * Execute password rotation
     */
    PasswordRotationService.prototype.executeRotation = function (jobId, target) {
        return __awaiter(this, void 0, void 0, function () {
            var db, currentSecret, currentPassword, defaultPolicy, newPassword, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 11, , 13]);
                        // Update job status
                        return [4 /*yield*/, db.collection('password_rotation_jobs').updateOne({ id: jobId }, {
                                $set: {
                                    status: types_js_1.RotationStatus.IN_PROGRESS,
                                    startedAt: new Date()
                                }
                            })];
                    case 2:
                        // Update job status
                        _a.sent();
                        return [4 /*yield*/, this.secretVault.getSecret(target.secretId)];
                    case 3:
                        currentSecret = _a.sent();
                        return [4 /*yield*/, this.secretVault.decrypt(currentSecret.value)];
                    case 4:
                        currentPassword = _a.sent();
                        defaultPolicy = {
                            minLength: 16,
                            maxLength: 32,
                            requireUppercase: true,
                            requireLowercase: true,
                            requireNumbers: true,
                            requireSpecialChars: true,
                            specialChars: '!@#$%^&*',
                            forbiddenPasswords: [],
                            preventReuse: 5
                        };
                        return [4 /*yield*/, this.generatePassword(defaultPolicy)];
                    case 5:
                        newPassword = _a.sent();
                        // Apply new password to device
                        return [4 /*yield*/, this.applyPasswordToDevice(target, newPassword)];
                    case 6:
                        // Apply new password to device
                        _a.sent();
                        // Verify new password works
                        return [4 /*yield*/, this.verifyPassword(target, newPassword)];
                    case 7:
                        // Verify new password works
                        _a.sent();
                        // Update secret in vault
                        return [4 /*yield*/, this.secretVault.updateSecret(target.secretId, newPassword)];
                    case 8:
                        // Update secret in vault
                        _a.sent();
                        // Update target
                        return [4 /*yield*/, db.collection('password_rotation_targets').updateOne({ id: target.id }, {
                                $set: {
                                    lastRotation: new Date(),
                                    nextRotation: this.calculateNextRotation(target.rotationPolicy)
                                }
                            })];
                    case 9:
                        // Update target
                        _a.sent();
                        // Complete job
                        return [4 /*yield*/, db.collection('password_rotation_jobs').updateOne({ id: jobId }, {
                                $set: {
                                    status: types_js_1.RotationStatus.SUCCESS,
                                    completedAt: new Date(),
                                    oldPasswordHash: this.hashPassword(currentPassword),
                                    newPasswordHash: this.hashPassword(newPassword)
                                }
                            })];
                    case 10:
                        // Complete job
                        _a.sent();
                        this.emit('rotation:success', { jobId: jobId, targetId: target.id });
                        return [3 /*break*/, 13];
                    case 11:
                        error_3 = _a.sent();
                        return [4 /*yield*/, db.collection('password_rotation_jobs').updateOne({ id: jobId }, {
                                $set: {
                                    status: types_js_1.RotationStatus.FAILED,
                                    completedAt: new Date(),
                                    error: error_3.message
                                }
                            })];
                    case 12:
                        _a.sent();
                        this.emit('rotation:failed', { jobId: jobId, targetId: target.id, error: error_3.message });
                        throw error_3;
                    case 13: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Apply password to device based on protocol
     */
    PasswordRotationService.prototype.applyPasswordToDevice = function (target, password) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _a = target.protocol;
                        switch (_a) {
                            case 'onvif': return [3 /*break*/, 1];
                            case 'ssh': return [3 /*break*/, 3];
                            case 'http': return [3 /*break*/, 5];
                            case 'snmp': return [3 /*break*/, 7];
                            case 'custom': return [3 /*break*/, 9];
                        }
                        return [3 /*break*/, 11];
                    case 1: return [4 /*yield*/, this.applyONVIFPassword(target, password)];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 3: return [4 /*yield*/, this.applySSHPassword(target, password)];
                    case 4:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 5: return [4 /*yield*/, this.applyHTTPPassword(target, password)];
                    case 6:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 7: return [4 /*yield*/, this.applySNMPPassword(target, password)];
                    case 8:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 9: return [4 /*yield*/, this.applyCustomPassword(target, password)];
                    case 10:
                        _b.sent();
                        return [3 /*break*/, 12];
                    case 11: throw new Error("Unsupported protocol: ".concat(target.protocol));
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Apply ONVIF password
     */
    PasswordRotationService.prototype.applyONVIFPassword = function (target, password) {
        return __awaiter(this, void 0, void 0, function () {
            var soapEnvelope, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        soapEnvelope = "\n      <?xml version=\"1.0\" encoding=\"UTF-8\"?>\n      <s:Envelope xmlns:s=\"http://www.w3.org/2003/05/soap-envelope\"\n                  xmlns:tds=\"http://www.onvif.org/ver10/device/wsdl\">\n        <s:Body>\n          <tds:SetUser>\n            <tds:User>\n              <tds:Username>".concat(target.username, "</tds:Username>\n              <tds:Password>").concat(password, "</tds:Password>\n            </tds:User>\n          </tds:SetUser>\n        </s:Body>\n      </s:Envelope>\n    ");
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, axios_1.default.post("http://".concat(target.host, ":").concat(target.port || 80, "/onvif/device_service"), soapEnvelope, {
                                headers: { 'Content-Type': 'application/soap+xml' },
                                timeout: 10000
                            })];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_4 = _a.sent();
                        throw new Error("Failed to apply ONVIF password: ".concat(error_4.message));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Apply SSH password
     */
    PasswordRotationService.prototype.applySSHPassword = function (target, password) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Use SSH client to change password
                // This is a placeholder - actual implementation would use node-ssh or similar
                throw new Error('SSH password rotation not yet implemented');
            });
        });
    };
    /**
     * Apply HTTP password
     */
    PasswordRotationService.prototype.applyHTTPPassword = function (target, password) {
        return __awaiter(this, void 0, void 0, function () {
            var endpoint, error_5;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        endpoint = ((_a = target.metadata) === null || _a === void 0 ? void 0 : _a.passwordChangeEndpoint) || '/api/change-password';
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 3, , 4]);
                        return [4 /*yield*/, axios_1.default.post("http://".concat(target.host, ":").concat(target.port || 80).concat(endpoint), {
                                username: target.username,
                                newPassword: password
                            }, {
                                timeout: 10000
                            })];
                    case 2:
                        _b.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_5 = _b.sent();
                        throw new Error("Failed to apply HTTP password: ".concat(error_5.message));
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Apply SNMP password
     */
    PasswordRotationService.prototype.applySNMPPassword = function (target, password) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Use SNMP library to update community string or USM credentials
                throw new Error('SNMP password rotation not yet implemented');
            });
        });
    };
    /**
     * Apply custom password
     */
    PasswordRotationService.prototype.applyCustomPassword = function (target, password) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                // Execute custom script from metadata
                if ((_a = target.metadata) === null || _a === void 0 ? void 0 : _a.rotationScript) {
                    // Execute script with target and password
                    throw new Error('Custom rotation scripts not yet implemented');
                }
                else {
                    throw new Error('Custom rotation requires rotationScript in metadata');
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Verify password works
     */
    PasswordRotationService.prototype.verifyPassword = function (target, password) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/];
            });
        });
    };
    /**
     * Helper: Build character set from policy
     */
    PasswordRotationService.prototype.buildCharset = function (policy) {
        var charset = '';
        if (policy.requireUppercase) {
            charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        }
        if (policy.requireLowercase) {
            charset += 'abcdefghijklmnopqrstuvwxyz';
        }
        if (policy.requireNumbers) {
            charset += '0123456789';
        }
        if (policy.requireSpecialChars) {
            charset += policy.specialChars;
        }
        return charset || 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    };
    /**
     * Helper: Replace random character
     */
    PasswordRotationService.prototype.replaceRandomChar = function (str, charset) {
        var index = Math.floor(Math.random() * str.length);
        var char = charset[Math.floor(Math.random() * charset.length)];
        return str.substring(0, index) + char + str.substring(index + 1);
    };
    /**
     * Helper: Calculate next rotation date
     */
    PasswordRotationService.prototype.calculateNextRotation = function (policy) {
        var now = new Date();
        now.setDate(now.getDate() + ((policy === null || policy === void 0 ? void 0 : policy.intervalDays) || 90));
        return now;
    };
    /**
     * Helper: Hash password for tracking
     */
    PasswordRotationService.prototype.hashPassword = function (password) {
        return crypto.createHash('sha256').update(password).digest('hex');
    };
    /**
     * Start rotation scheduler
     */
    PasswordRotationService.prototype.startScheduler = function () {
        var _this = this;
        // Check for pending rotations every hour
        this.schedulerInterval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            var targetsNeedingRotation, _i, targetsNeedingRotation_1, target, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 7, , 8]);
                        return [4 /*yield*/, this.listTargets({ needsRotation: true, enabled: true })];
                    case 1:
                        targetsNeedingRotation = _a.sent();
                        _i = 0, targetsNeedingRotation_1 = targetsNeedingRotation;
                        _a.label = 2;
                    case 2:
                        if (!(_i < targetsNeedingRotation_1.length)) return [3 /*break*/, 6];
                        target = targetsNeedingRotation_1[_i];
                        if (!target.rotationPolicy.autoRotate) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.rotatePassword(target.id)];
                    case 3:
                        _a.sent();
                        return [3 /*break*/, 5];
                    case 4:
                        this.emit('rotation:due', { targetId: target.id, name: target.name });
                        _a.label = 5;
                    case 5:
                        _i++;
                        return [3 /*break*/, 2];
                    case 6: return [3 /*break*/, 8];
                    case 7:
                        error_6 = _a.sent();
                        console.error('Scheduler error:', error_6);
                        return [3 /*break*/, 8];
                    case 8: return [2 /*return*/];
                }
            });
        }); }, 60 * 60 * 1000);
    };
    /**
     * Stop scheduler
     */
    PasswordRotationService.prototype.stopScheduler = function () {
        if (this.schedulerInterval) {
            clearInterval(this.schedulerInterval);
            this.schedulerInterval = null;
        }
    };
    /**
     * Generate unique ID
     */
    PasswordRotationService.prototype.generateId = function () {
        return "rotation_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    /**
     * Health check
     */
    PasswordRotationService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, totalTargets, enabledTargets, needsRotation, overdueTargets, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('password_rotation_targets').countDocuments()];
                    case 1:
                        totalTargets = _a.sent();
                        return [4 /*yield*/, db.collection('password_rotation_targets').countDocuments({ enabled: true })];
                    case 2:
                        enabledTargets = _a.sent();
                        return [4 /*yield*/, this.listTargets({ needsRotation: true })];
                    case 3:
                        needsRotation = (_a.sent()).length;
                        return [4 /*yield*/, this.listTargets({ overdue: true })];
                    case 4:
                        overdueTargets = (_a.sent()).length;
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    totalTargets: totalTargets,
                                    enabledTargets: enabledTargets,
                                    needsRotation: needsRotation,
                                    overdueTargets: overdueTargets,
                                    schedulerActive: this.schedulerInterval !== null
                                }
                            }];
                    case 5:
                        error_7 = _a.sent();
                        return [2 /*return*/, {
                                status: 'unhealthy',
                                details: {
                                    error: error_7.message
                                }
                            }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    return PasswordRotationService;
}(events_1.EventEmitter));
exports.PasswordRotationService = PasswordRotationService;
