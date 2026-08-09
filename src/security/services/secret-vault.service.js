"use strict";
/**
 * Secret Vault Service
 * Enterprise-grade secret management with encryption, rotation, and auditing
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
exports.SecretVaultService = void 0;
var crypto_1 = require("crypto");
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var SecretVaultService = /** @class */ (function (_super) {
    __extends(SecretVaultService, _super);
    function SecretVaultService(masterPassword) {
        var _this = _super.call(this) || this;
        _this.ENCRYPTION_ALGORITHM = 'aes-256-gcm';
        _this.KEY_DERIVATION_ITERATIONS = 100000;
        _this.SALT_LENGTH = 32;
        _this.IV_LENGTH = 16;
        _this.AUTH_TAG_LENGTH = 16;
        // In production, this should come from HSM or secure key management
        var password = masterPassword || process.env.VAULT_MASTER_PASSWORD || _this.generateSecurePassword();
        _this.masterKey = _this.deriveMasterKey(password);
        return _this;
    }
    /**
     * Derive master encryption key from password using PBKDF2
     */
    SecretVaultService.prototype.deriveMasterKey = function (password) {
        var salt = process.env.VAULT_SALT || (0, crypto_1.randomBytes)(this.SALT_LENGTH).toString('hex');
        return (0, crypto_1.pbkdf2Sync)(password, salt, this.KEY_DERIVATION_ITERATIONS, 32, // 256 bits
        'sha512');
    };
    /**
     * Encrypt data using AES-256-GCM
     */
    SecretVaultService.prototype.encrypt = function (plaintext) {
        return __awaiter(this, void 0, void 0, function () {
            var iv, cipher, encrypted, authTag, combined;
            return __generator(this, function (_a) {
                try {
                    iv = (0, crypto_1.randomBytes)(this.IV_LENGTH);
                    cipher = (0, crypto_1.createCipheriv)(this.ENCRYPTION_ALGORITHM, this.masterKey, iv);
                    encrypted = cipher.update(plaintext, 'utf8', 'base64');
                    encrypted += cipher.final('base64');
                    authTag = cipher.getAuthTag();
                    combined = Buffer.concat([
                        iv,
                        authTag,
                        Buffer.from(encrypted, 'base64')
                    ]);
                    return [2 /*return*/, combined.toString('base64')];
                }
                catch (error) {
                    throw new Error("Encryption failed: ".concat(error.message));
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Decrypt data using AES-256-GCM
     */
    SecretVaultService.prototype.decrypt = function (ciphertext) {
        return __awaiter(this, void 0, void 0, function () {
            var combined, iv, authTag, encrypted, decipher, decrypted;
            return __generator(this, function (_a) {
                try {
                    combined = Buffer.from(ciphertext, 'base64');
                    iv = combined.slice(0, this.IV_LENGTH);
                    authTag = combined.slice(this.IV_LENGTH, this.IV_LENGTH + this.AUTH_TAG_LENGTH);
                    encrypted = combined.slice(this.IV_LENGTH + this.AUTH_TAG_LENGTH);
                    decipher = (0, crypto_1.createDecipheriv)(this.ENCRYPTION_ALGORITHM, this.masterKey, iv);
                    decipher.setAuthTag(authTag);
                    decrypted = decipher.update(encrypted.toString('base64'), 'base64', 'utf8');
                    decrypted += decipher.final('utf8');
                    return [2 /*return*/, decrypted];
                }
                catch (error) {
                    throw new Error("Decryption failed: ".concat(error.message));
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Create a new secret
     */
    SecretVaultService.prototype.createSecret = function (name_1, type_1, value_1) {
        return __awaiter(this, arguments, void 0, function (name, type, value, metadata) {
            var db, encryptedValue, secret, error_1;
            if (metadata === void 0) { metadata = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 6, , 8]);
                        return [4 /*yield*/, this.encrypt(value)];
                    case 2:
                        encryptedValue = _a.sent();
                        secret = {
                            id: this.generateId(),
                            name: name,
                            type: type,
                            description: metadata.description || '',
                            value: encryptedValue,
                            metadata: metadata,
                            tags: metadata.tags || [],
                            version: 1,
                            createdAt: new Date(),
                            updatedAt: new Date(),
                            expiresAt: metadata.expiresAt,
                            rotationPolicy: metadata.rotationPolicy,
                            accessCount: 0
                        };
                        // Store in database
                        return [4 /*yield*/, db.collection('secrets').insertOne(secret)];
                    case 3:
                        // Store in database
                        _a.sent();
                        // Create initial version
                        return [4 /*yield*/, this.createVersion(secret.id, encryptedValue, 'system')];
                    case 4:
                        // Create initial version
                        _a.sent();
                        // Log creation
                        return [4 /*yield*/, this.logAccess(secret.id, 'system', 'create', true)];
                    case 5:
                        // Log creation
                        _a.sent();
                        this.emit('secret:created', { secretId: secret.id, name: name, type: type });
                        return [2 /*return*/, secret];
                    case 6:
                        error_1 = _a.sent();
                        return [4 /*yield*/, this.logAccess('unknown', 'system', 'create', false)];
                    case 7:
                        _a.sent();
                        throw new Error("Failed to create secret: ".concat(error_1.message));
                    case 8: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get a secret by ID
     */
    SecretVaultService.prototype.getSecret = function (id, version) {
        return __awaiter(this, void 0, void 0, function () {
            var db, secret, secretVersion, currentSecret, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 9, , 11]);
                        secret = void 0;
                        if (!version) return [3 /*break*/, 4];
                        return [4 /*yield*/, db.collection('secret_versions')
                                .findOne({ secretId: id, version: version })];
                    case 2:
                        secretVersion = _a.sent();
                        if (!secretVersion) {
                            throw new Error('Secret version not found');
                        }
                        return [4 /*yield*/, db.collection('secrets').findOne({ id: id })];
                    case 3:
                        currentSecret = _a.sent();
                        secret = __assign(__assign({}, currentSecret), { value: secretVersion.value, version: version });
                        return [3 /*break*/, 6];
                    case 4: return [4 /*yield*/, db.collection('secrets').findOne({ id: id })];
                    case 5:
                        // Get current version
                        secret = _a.sent();
                        _a.label = 6;
                    case 6:
                        if (!secret) {
                            throw new Error('Secret not found');
                        }
                        // Check expiration
                        if (secret.expiresAt && secret.expiresAt < new Date()) {
                            throw new Error('Secret has expired');
                        }
                        // Update access tracking
                        return [4 /*yield*/, db.collection('secrets').updateOne({ id: id }, {
                                $inc: { accessCount: 1 },
                                $set: { lastAccessedAt: new Date() }
                            })];
                    case 7:
                        // Update access tracking
                        _a.sent();
                        // Log access
                        return [4 /*yield*/, this.logAccess(id, 'system', 'read', true)];
                    case 8:
                        // Log access
                        _a.sent();
                        this.emit('secret:accessed', { secretId: id, version: version });
                        return [2 /*return*/, secret];
                    case 9:
                        error_2 = _a.sent();
                        return [4 /*yield*/, this.logAccess(id, 'system', 'read', false)];
                    case 10:
                        _a.sent();
                        throw error_2;
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Update a secret (creates new version)
     */
    SecretVaultService.prototype.updateSecret = function (id, value) {
        return __awaiter(this, void 0, void 0, function () {
            var db, secret, encryptedValue, newVersion, updatedSecret, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 7, , 9]);
                        return [4 /*yield*/, this.getSecret(id)];
                    case 2:
                        secret = _a.sent();
                        return [4 /*yield*/, this.encrypt(value)];
                    case 3:
                        encryptedValue = _a.sent();
                        newVersion = secret.version + 1;
                        return [4 /*yield*/, this.createVersion(id, encryptedValue, 'system')];
                    case 4:
                        _a.sent();
                        return [4 /*yield*/, db.collection('secrets').findOneAndUpdate({ id: id }, {
                                $set: {
                                    value: encryptedValue,
                                    version: newVersion,
                                    updatedAt: new Date()
                                }
                            }, { returnDocument: 'after' })];
                    case 5:
                        updatedSecret = _a.sent();
                        return [4 /*yield*/, this.logAccess(id, 'system', 'write', true)];
                    case 6:
                        _a.sent();
                        this.emit('secret:updated', { secretId: id, version: newVersion });
                        return [2 /*return*/, updatedSecret.value];
                    case 7:
                        error_3 = _a.sent();
                        return [4 /*yield*/, this.logAccess(id, 'system', 'write', false)];
                    case 8:
                        _a.sent();
                        throw new Error("Failed to update secret: ".concat(error_3.message));
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Delete a secret
     */
    SecretVaultService.prototype.deleteSecret = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, error_4;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 4, , 6]);
                        // Soft delete - mark as deleted but keep for audit
                        return [4 /*yield*/, db.collection('secrets').updateOne({ id: id }, {
                                $set: {
                                    deleted: true,
                                    deletedAt: new Date()
                                }
                            })];
                    case 2:
                        // Soft delete - mark as deleted but keep for audit
                        _a.sent();
                        return [4 /*yield*/, this.logAccess(id, 'system', 'delete', true)];
                    case 3:
                        _a.sent();
                        this.emit('secret:deleted', { secretId: id });
                        return [3 /*break*/, 6];
                    case 4:
                        error_4 = _a.sent();
                        return [4 /*yield*/, this.logAccess(id, 'system', 'delete', false)];
                    case 5:
                        _a.sent();
                        throw new Error("Failed to delete secret: ".concat(error_4.message));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * List secrets with filters
     */
    SecretVaultService.prototype.listSecrets = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var db, query, thirtyDaysFromNow, now, secrets;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = { deleted: { $ne: true } };
                        if (filters.type) {
                            query.type = filters.type;
                        }
                        if (filters.tags && filters.tags.length > 0) {
                            query.tags = { $in: filters.tags };
                        }
                        if (filters.expiringSoon) {
                            thirtyDaysFromNow = new Date();
                            thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
                            query.expiresAt = {
                                $gte: new Date(),
                                $lte: thirtyDaysFromNow
                            };
                        }
                        if (filters.needsRotation) {
                            now = new Date();
                            query.$or = [
                                { 'rotationPolicy.enabled': true, lastRotatedAt: null },
                                {
                                    'rotationPolicy.enabled': true,
                                    $expr: {
                                        $gte: [
                                            { $subtract: [now, '$lastRotatedAt'] },
                                            { $multiply: ['$rotationPolicy.intervalDays', 24 * 60 * 60 * 1000] }
                                        ]
                                    }
                                }
                            ];
                        }
                        return [4 /*yield*/, db.collection('secrets')
                                .find(query)
                                .sort({ name: 1 })
                                .toArray()];
                    case 1:
                        secrets = _a.sent();
                        return [2 /*return*/, secrets];
                }
            });
        });
    };
    /**
     * Rotate a secret
     */
    SecretVaultService.prototype.rotateSecret = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, secret, newValue, rotatedSecret, error_5;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        _b.label = 1;
                    case 1:
                        _b.trys.push([1, 7, , 9]);
                        return [4 /*yield*/, this.getSecret(id)];
                    case 2:
                        secret = _b.sent();
                        if (!((_a = secret.rotationPolicy) === null || _a === void 0 ? void 0 : _a.enabled)) {
                            throw new Error('Rotation not enabled for this secret');
                        }
                        return [4 /*yield*/, this.generateSecretValue(secret.type)];
                    case 3:
                        newValue = _b.sent();
                        return [4 /*yield*/, this.updateSecret(id, newValue)];
                    case 4:
                        rotatedSecret = _b.sent();
                        // Update rotation timestamp
                        return [4 /*yield*/, db.collection('secrets').updateOne({ id: id }, {
                                $set: {
                                    lastRotatedAt: new Date()
                                }
                            })];
                    case 5:
                        // Update rotation timestamp
                        _b.sent();
                        return [4 /*yield*/, this.logAccess(id, 'system', 'rotate', true)];
                    case 6:
                        _b.sent();
                        this.emit('secret:rotated', { secretId: id });
                        return [2 /*return*/, rotatedSecret];
                    case 7:
                        error_5 = _b.sent();
                        return [4 /*yield*/, this.logAccess(id, 'system', 'rotate', false)];
                    case 8:
                        _b.sent();
                        throw new Error("Failed to rotate secret: ".concat(error_5.message));
                    case 9: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get secret versions
     */
    SecretVaultService.prototype.getSecretVersions = function (secretId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, versions;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('secret_versions')
                                .find({ secretId: secretId })
                                .sort({ version: -1 })
                                .toArray()];
                    case 1:
                        versions = _a.sent();
                        return [2 /*return*/, versions];
                }
            });
        });
    };
    /**
     * Create a version record
     */
    SecretVaultService.prototype.createVersion = function (secretId, value, userId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, secret, version;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('secrets').findOne({ id: secretId })];
                    case 1:
                        secret = _a.sent();
                        version = {
                            id: this.generateId(),
                            secretId: secretId,
                            version: secret.version,
                            value: value,
                            createdAt: new Date(),
                            createdBy: userId
                        };
                        return [4 /*yield*/, db.collection('secret_versions').insertOne(version)];
                    case 2:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Log secret access
     */
    SecretVaultService.prototype.logAccess = function (secretId, userId, action, success) {
        return __awaiter(this, void 0, void 0, function () {
            var db, log;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        log = {
                            id: this.generateId(),
                            secretId: secretId,
                            userId: userId,
                            action: action,
                            timestamp: new Date(),
                            ipAddress: 'internal', // Should be captured from request context
                            success: success,
                            reason: success ? undefined : 'Access denied or error occurred'
                        };
                        return [4 /*yield*/, db.collection('secret_access_logs').insertOne(log)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get access logs for a secret
     */
    SecretVaultService.prototype.getAccessLogs = function (secretId_1) {
        return __awaiter(this, arguments, void 0, function (secretId, limit) {
            var db, logs;
            if (limit === void 0) { limit = 100; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('secret_access_logs')
                                .find({ secretId: secretId })
                                .sort({ timestamp: -1 })
                                .limit(limit)
                                .toArray()];
                    case 1:
                        logs = _a.sent();
                        return [2 /*return*/, logs];
                }
            });
        });
    };
    /**
     * Generate secure secret value based on type
     */
    SecretVaultService.prototype.generateSecretValue = function (type) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (type) {
                    case types_js_1.SecretType.PASSWORD:
                        return [2 /*return*/, this.generateSecurePassword(32)];
                    case types_js_1.SecretType.API_KEY:
                        return [2 /*return*/, this.generateApiKey()];
                    case types_js_1.SecretType.TOKEN:
                        return [2 /*return*/, this.generateToken()];
                    case types_js_1.SecretType.ENCRYPTION_KEY:
                        return [2 /*return*/, (0, crypto_1.randomBytes)(32).toString('base64')];
                    case types_js_1.SecretType.SIGNING_KEY:
                        return [2 /*return*/, (0, crypto_1.randomBytes)(64).toString('base64')];
                    default:
                        return [2 /*return*/, (0, crypto_1.randomBytes)(32).toString('hex')];
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Generate secure password
     */
    SecretVaultService.prototype.generateSecurePassword = function (length) {
        if (length === void 0) { length = 32; }
        var uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
        var lowercase = 'abcdefghijklmnopqrstuvwxyz';
        var numbers = '0123456789';
        var special = '!@#$%^&*()_+-=[]{}|;:,.<>?';
        var allChars = uppercase + lowercase + numbers + special;
        var password = '';
        // Ensure at least one of each type
        password += uppercase[Math.floor(Math.random() * uppercase.length)];
        password += lowercase[Math.floor(Math.random() * lowercase.length)];
        password += numbers[Math.floor(Math.random() * numbers.length)];
        password += special[Math.floor(Math.random() * special.length)];
        // Fill the rest randomly
        for (var i = password.length; i < length; i++) {
            var randomIndex = Math.floor(Math.random() * allChars.length);
            password += allChars[randomIndex];
        }
        // Shuffle the password
        return password.split('').sort(function () { return Math.random() - 0.5; }).join('');
    };
    /**
     * Generate API key
     */
    SecretVaultService.prototype.generateApiKey = function () {
        var prefix = 'vms';
        var key = (0, crypto_1.randomBytes)(32).toString('base64').replace(/[^a-zA-Z0-9]/g, '');
        return "".concat(prefix, "_").concat(key);
    };
    /**
     * Generate token
     */
    SecretVaultService.prototype.generateToken = function () {
        return (0, crypto_1.randomBytes)(64).toString('hex');
    };
    /**
     * Generate unique ID
     */
    SecretVaultService.prototype.generateId = function () {
        return "secret_".concat(Date.now(), "_").concat((0, crypto_1.randomBytes)(8).toString('hex'));
    };
    /**
     * Auto-rotate secrets based on policies
     */
    SecretVaultService.prototype.autoRotateSecrets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var secretsNeedingRotation, _i, secretsNeedingRotation_1, secret, error_6;
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0: return [4 /*yield*/, this.listSecrets({ needsRotation: true })];
                    case 1:
                        secretsNeedingRotation = _b.sent();
                        _i = 0, secretsNeedingRotation_1 = secretsNeedingRotation;
                        _b.label = 2;
                    case 2:
                        if (!(_i < secretsNeedingRotation_1.length)) return [3 /*break*/, 7];
                        secret = secretsNeedingRotation_1[_i];
                        if (!((_a = secret.rotationPolicy) === null || _a === void 0 ? void 0 : _a.autoRotate)) return [3 /*break*/, 6];
                        _b.label = 3;
                    case 3:
                        _b.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.rotateSecret(secret.id)];
                    case 4:
                        _b.sent();
                        console.log("Auto-rotated secret: ".concat(secret.name));
                        return [3 /*break*/, 6];
                    case 5:
                        error_6 = _b.sent();
                        console.error("Failed to auto-rotate secret ".concat(secret.name, ":"), error_6);
                        this.emit('secret:rotation-failed', { secretId: secret.id, error: error_6.message });
                        return [3 /*break*/, 6];
                    case 6:
                        _i++;
                        return [3 /*break*/, 2];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check for expiring secrets and send notifications
     */
    SecretVaultService.prototype.checkExpiringSecrets = function () {
        return __awaiter(this, void 0, void 0, function () {
            var expiringSecrets, _i, expiringSecrets_1, secret;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.listSecrets({ expiringSoon: true })];
                    case 1:
                        expiringSecrets = _a.sent();
                        for (_i = 0, expiringSecrets_1 = expiringSecrets; _i < expiringSecrets_1.length; _i++) {
                            secret = expiringSecrets_1[_i];
                            this.emit('secret:expiring-soon', {
                                secretId: secret.id,
                                name: secret.name,
                                expiresAt: secret.expiresAt
                            });
                        }
                        return [2 /*return*/, expiringSecrets];
                }
            });
        });
    };
    /**
     * Validate secret value against policy
     */
    SecretVaultService.prototype.validateSecretValue = function (value, type) {
        var errors = [];
        if (!value || value.length === 0) {
            errors.push('Secret value cannot be empty');
        }
        if (type === types_js_1.SecretType.PASSWORD && value.length < 12) {
            errors.push('Password must be at least 12 characters');
        }
        if (type === types_js_1.SecretType.ENCRYPTION_KEY && value.length < 32) {
            errors.push('Encryption key must be at least 32 bytes');
        }
        return {
            valid: errors.length === 0,
            errors: errors
        };
    };
    /**
     * Export secrets (encrypted) for backup
     */
    SecretVaultService.prototype.exportSecrets = function (secretIds) {
        return __awaiter(this, void 0, void 0, function () {
            var db, query, secrets, exportData;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = { deleted: { $ne: true } };
                        if (secretIds && secretIds.length > 0) {
                            query.id = { $in: secretIds };
                        }
                        return [4 /*yield*/, db.collection('secrets').find(query).toArray()];
                    case 1:
                        secrets = _a.sent();
                        exportData = {
                            version: '1.0',
                            exportedAt: new Date().toISOString(),
                            secrets: secrets.map(function (s) { return (__assign(__assign({}, s), { value: undefined, _encrypted: true })); })
                        };
                        return [2 /*return*/, JSON.stringify(exportData, null, 2)];
                }
            });
        });
    };
    /**
     * Health check
     */
    SecretVaultService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, testData, encrypted, decrypted, totalSecrets, expiringSecrets, needsRotation, error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 6, , 7]);
                        db = (0, database_js_1.getDatabase)();
                        testData = 'health-check-test';
                        return [4 /*yield*/, this.encrypt(testData)];
                    case 1:
                        encrypted = _a.sent();
                        return [4 /*yield*/, this.decrypt(encrypted)];
                    case 2:
                        decrypted = _a.sent();
                        if (decrypted !== testData) {
                            throw new Error('Encryption/decryption test failed');
                        }
                        return [4 /*yield*/, db.collection('secrets').countDocuments({ deleted: { $ne: true } })];
                    case 3:
                        totalSecrets = _a.sent();
                        return [4 /*yield*/, this.listSecrets({ expiringSoon: true })];
                    case 4:
                        expiringSecrets = (_a.sent()).length;
                        return [4 /*yield*/, this.listSecrets({ needsRotation: true })];
                    case 5:
                        needsRotation = (_a.sent()).length;
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    totalSecrets: totalSecrets,
                                    expiringSecrets: expiringSecrets,
                                    needsRotation: needsRotation,
                                    encryptionTest: 'passed'
                                }
                            }];
                    case 6:
                        error_7 = _a.sent();
                        return [2 /*return*/, {
                                status: 'unhealthy',
                                details: {
                                    error: error_7.message
                                }
                            }];
                    case 7: return [2 /*return*/];
                }
            });
        });
    };
    return SecretVaultService;
}(events_1.EventEmitter));
exports.SecretVaultService = SecretVaultService;
