"use strict";
/**
 * Video Encryption Service
 * Encrypt video at rest and in transit
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
exports.VideoEncryptionService = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var crypto_1 = require("crypto");
var fs_1 = require("fs");
var promises_1 = require("stream/promises");
var VideoEncryptionService = /** @class */ (function (_super) {
    __extends(VideoEncryptionService, _super);
    function VideoEncryptionService() {
        var _this = _super !== null && _super.apply(this, arguments) || this;
        _this.config = {
            algorithm: types_js_1.EncryptionAlgorithm.AES_256_GCM,
            keySize: 256,
            keyRotationDays: 90,
            compressBeforeEncrypt: true
        };
        _this.currentKey = null;
        return _this;
    }
    VideoEncryptionService.prototype.setEncryptionConfig = function (config) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                this.config = config;
                this.emit('config:updated', config);
                return [2 /*return*/];
            });
        });
    };
    VideoEncryptionService.prototype.getEncryptionConfig = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, this.config];
            });
        });
    };
    /**
     * Encrypt video file
     */
    VideoEncryptionService.prototype.encryptVideo = function (videoId, videoPath) {
        return __awaiter(this, void 0, void 0, function () {
            var db, fs, key, iv, cipher, stats, originalSize, encryptedPath, readStream, writeStream, authTag, encryptedStats, encryptedSize, checksum, encryptedVideo, error_1;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        fs = require('fs');
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, this.getCurrentKey()];
                    case 2:
                        key = _a.sent();
                        iv = (0, crypto_1.randomBytes)(16);
                        cipher = (0, crypto_1.createCipheriv)(this.config.algorithm, Buffer.from(key.keyBase64, 'base64'), iv);
                        stats = fs.statSync(videoPath);
                        originalSize = stats.size;
                        encryptedPath = "".concat(videoPath, ".enc");
                        readStream = (0, fs_1.createReadStream)(videoPath);
                        writeStream = (0, fs_1.createWriteStream)(encryptedPath);
                        return [4 /*yield*/, (0, promises_1.pipeline)(readStream, cipher, writeStream)];
                    case 3:
                        _a.sent();
                        authTag = cipher.getAuthTag ? cipher.getAuthTag() : Buffer.alloc(0);
                        encryptedStats = fs.statSync(encryptedPath);
                        encryptedSize = encryptedStats.size;
                        checksum = this.calculateChecksum(encryptedPath);
                        encryptedVideo = {
                            id: this.generateId(),
                            originalVideoId: videoId,
                            algorithm: this.config.algorithm,
                            keyId: key.id,
                            ivBase64: iv.toString('base64'),
                            authTagBase64: authTag.toString('base64'),
                            encryptedSize: encryptedSize,
                            originalSize: originalSize,
                            encryptedAt: new Date(),
                            encryptedBy: 'system',
                            checksum: checksum,
                            metadata: {
                                encryptedPath: encryptedPath,
                                originalPath: videoPath
                            }
                        };
                        return [4 /*yield*/, db.collection('encrypted_videos').insertOne(encryptedVideo)];
                    case 4:
                        _a.sent();
                        this.emit('video:encrypted', { videoId: videoId, encryptedVideoId: encryptedVideo.id });
                        return [2 /*return*/, encryptedVideo];
                    case 5:
                        error_1 = _a.sent();
                        throw new Error("Video encryption failed: ".concat(error_1.message));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Decrypt video file
     */
    VideoEncryptionService.prototype.decryptVideo = function (encryptedVideoId, outputPath) {
        return __awaiter(this, void 0, void 0, function () {
            var db, encryptedVideo, key, iv, decipher, authTag, encryptedPath, readStream, writeStream, error_2;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        _a.label = 1;
                    case 1:
                        _a.trys.push([1, 5, , 6]);
                        return [4 /*yield*/, db.collection('encrypted_videos').findOne({ id: encryptedVideoId })];
                    case 2:
                        encryptedVideo = _a.sent();
                        if (!encryptedVideo) {
                            throw new Error('Encrypted video not found');
                        }
                        return [4 /*yield*/, this.getKeyById(encryptedVideo.keyId)];
                    case 3:
                        key = _a.sent();
                        iv = Buffer.from(encryptedVideo.ivBase64, 'base64');
                        decipher = (0, crypto_1.createDecipheriv)(encryptedVideo.algorithm, Buffer.from(key.keyBase64, 'base64'), iv);
                        // Set auth tag (for GCM mode)
                        if (encryptedVideo.authTagBase64) {
                            authTag = Buffer.from(encryptedVideo.authTagBase64, 'base64');
                            decipher.setAuthTag(authTag);
                        }
                        encryptedPath = encryptedVideo.metadata.encryptedPath;
                        readStream = (0, fs_1.createReadStream)(encryptedPath);
                        writeStream = (0, fs_1.createWriteStream)(outputPath);
                        return [4 /*yield*/, (0, promises_1.pipeline)(readStream, decipher, writeStream)];
                    case 4:
                        _a.sent();
                        this.emit('video:decrypted', { encryptedVideoId: encryptedVideoId, outputPath: outputPath });
                        return [3 /*break*/, 6];
                    case 5:
                        error_2 = _a.sent();
                        throw new Error("Video decryption failed: ".concat(error_2.message));
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Generate new encryption key
     */
    VideoEncryptionService.prototype.generateEncryptionKey = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, keyBuffer, key;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        keyBuffer = (0, crypto_1.randomBytes)(this.config.keySize / 8);
                        key = {
                            id: this.generateId(),
                            algorithm: this.config.algorithm,
                            keyBase64: keyBuffer.toString('base64'),
                            createdAt: new Date(),
                            usageCount: 0,
                            purpose: 'video_encryption'
                        };
                        return [4 /*yield*/, db.collection('encryption_keys').insertOne(key)];
                    case 1:
                        _a.sent();
                        this.currentKey = key;
                        this.emit('key:generated', { keyId: key.id });
                        return [2 /*return*/, key];
                }
            });
        });
    };
    /**
     * Rotate encryption keys
     */
    VideoEncryptionService.prototype.rotateKeys = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.generateEncryptionKey()];
                    case 1:
                        _a.sent();
                        this.emit('keys:rotated');
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Encrypt stream
     */
    VideoEncryptionService.prototype.encryptStream = function (inputStream) {
        var key = (0, crypto_1.randomBytes)(32);
        var iv = (0, crypto_1.randomBytes)(16);
        var cipher = (0, crypto_1.createCipheriv)(this.config.algorithm, key, iv);
        return inputStream.pipe(cipher);
    };
    /**
     * Decrypt stream
     */
    VideoEncryptionService.prototype.decryptStream = function (inputStream, keyId, ivBase64) {
        // This would need to fetch the key and create the decipher
        var iv = Buffer.from(ivBase64, 'base64');
        var key = (0, crypto_1.randomBytes)(32); // Placeholder
        var decipher = (0, crypto_1.createDecipheriv)(this.config.algorithm, key, iv);
        return inputStream.pipe(decipher);
    };
    /**
     * Get encrypted video info
     */
    VideoEncryptionService.prototype.getEncryptedVideoInfo = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, video;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('encrypted_videos').findOne({ id: id })];
                    case 1:
                        video = _a.sent();
                        if (!video) {
                            throw new Error('Encrypted video not found');
                        }
                        return [2 /*return*/, video];
                }
            });
        });
    };
    /**
     * Verify integrity of encrypted video
     */
    VideoEncryptionService.prototype.verifyIntegrity = function (encryptedVideoId) {
        return __awaiter(this, void 0, void 0, function () {
            var video, currentChecksum;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.getEncryptedVideoInfo(encryptedVideoId)];
                    case 1:
                        video = _a.sent();
                        currentChecksum = this.calculateChecksum(video.metadata.encryptedPath);
                        return [2 /*return*/, currentChecksum === video.checksum];
                }
            });
        });
    };
    /**
     * Get current encryption key
     */
    VideoEncryptionService.prototype.getCurrentKey = function () {
        return __awaiter(this, void 0, void 0, function () {
            var age, maxAge;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        if (this.currentKey) {
                            age = Date.now() - this.currentKey.createdAt.getTime();
                            maxAge = this.config.keyRotationDays * 24 * 60 * 60 * 1000;
                            if (age < maxAge) {
                                return [2 /*return*/, this.currentKey];
                            }
                        }
                        return [4 /*yield*/, this.generateEncryptionKey()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    /**
     * Get key by ID
     */
    VideoEncryptionService.prototype.getKeyById = function (keyId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, key;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('encryption_keys').findOne({ id: keyId })];
                    case 1:
                        key = _a.sent();
                        if (!key) {
                            throw new Error('Encryption key not found');
                        }
                        return [2 /*return*/, key];
                }
            });
        });
    };
    /**
     * Calculate file checksum
     */
    VideoEncryptionService.prototype.calculateChecksum = function (filePath) {
        var crypto = require('crypto');
        var fs = require('fs');
        var hash = crypto.createHash('sha256');
        var data = fs.readFileSync(filePath);
        hash.update(data);
        return hash.digest('hex');
    };
    VideoEncryptionService.prototype.generateId = function () {
        return "enc_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    VideoEncryptionService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, totalEncrypted, activeKeys, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('encrypted_videos').countDocuments()];
                    case 1:
                        totalEncrypted = _a.sent();
                        return [4 /*yield*/, db.collection('encryption_keys').countDocuments()];
                    case 2:
                        activeKeys = _a.sent();
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    encryptedVideos: totalEncrypted,
                                    activeKeys: activeKeys,
                                    algorithm: this.config.algorithm
                                }
                            }];
                    case 3:
                        error_3 = _a.sent();
                        return [2 /*return*/, {
                                status: 'unhealthy',
                                details: { error: error_3.message }
                            }];
                    case 4: return [2 /*return*/];
                }
            });
        });
    };
    return VideoEncryptionService;
}(events_1.EventEmitter));
exports.VideoEncryptionService = VideoEncryptionService;
