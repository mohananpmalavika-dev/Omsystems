"use strict";
/**
 * Security Services Index
 * Central export point for all enterprise security services
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
exports.SecurityServicesFactory = exports.SecurityPostureService = exports.TPMAttestationService = exports.SecureBootVerificationService = exports.SupplyChainVerificationService = exports.RansomwareDetectionService = exports.ImmutableStorageService = exports.VideoEncryptionService = exports.TamperDetectionService = exports.ZeroTrustPolicyEngine = exports.HSMService = exports.PasswordRotationService = exports.CertificateManagementService = exports.SecretVaultService = void 0;
var secret_vault_service_js_1 = require("./secret-vault.service.js");
Object.defineProperty(exports, "SecretVaultService", { enumerable: true, get: function () { return secret_vault_service_js_1.SecretVaultService; } });
var certificate_management_service_js_1 = require("./certificate-management.service.js");
Object.defineProperty(exports, "CertificateManagementService", { enumerable: true, get: function () { return certificate_management_service_js_1.CertificateManagementService; } });
var password_rotation_service_js_1 = require("./password-rotation.service.js");
Object.defineProperty(exports, "PasswordRotationService", { enumerable: true, get: function () { return password_rotation_service_js_1.PasswordRotationService; } });
var hsm_service_js_1 = require("./hsm.service.js");
Object.defineProperty(exports, "HSMService", { enumerable: true, get: function () { return hsm_service_js_1.HSMService; } });
var zero_trust_policy_service_js_1 = require("./zero-trust-policy.service.js");
Object.defineProperty(exports, "ZeroTrustPolicyEngine", { enumerable: true, get: function () { return zero_trust_policy_service_js_1.ZeroTrustPolicyEngine; } });
var tamper_detection_service_js_1 = require("./tamper-detection.service.js");
Object.defineProperty(exports, "TamperDetectionService", { enumerable: true, get: function () { return tamper_detection_service_js_1.TamperDetectionService; } });
var video_encryption_service_js_1 = require("./video-encryption.service.js");
Object.defineProperty(exports, "VideoEncryptionService", { enumerable: true, get: function () { return video_encryption_service_js_1.VideoEncryptionService; } });
var immutable_storage_service_js_1 = require("./immutable-storage.service.js");
Object.defineProperty(exports, "ImmutableStorageService", { enumerable: true, get: function () { return immutable_storage_service_js_1.ImmutableStorageService; } });
var ransomware_detection_service_js_1 = require("./ransomware-detection.service.js");
Object.defineProperty(exports, "RansomwareDetectionService", { enumerable: true, get: function () { return ransomware_detection_service_js_1.RansomwareDetectionService; } });
var supply_chain_verification_service_js_1 = require("./supply-chain-verification.service.js");
Object.defineProperty(exports, "SupplyChainVerificationService", { enumerable: true, get: function () { return supply_chain_verification_service_js_1.SupplyChainVerificationService; } });
var secure_boot_verification_service_js_1 = require("./secure-boot-verification.service.js");
Object.defineProperty(exports, "SecureBootVerificationService", { enumerable: true, get: function () { return secure_boot_verification_service_js_1.SecureBootVerificationService; } });
var tpm_attestation_service_js_1 = require("./tpm-attestation.service.js");
Object.defineProperty(exports, "TPMAttestationService", { enumerable: true, get: function () { return tpm_attestation_service_js_1.TPMAttestationService; } });
var security_posture_service_js_1 = require("./security-posture.service.js");
Object.defineProperty(exports, "SecurityPostureService", { enumerable: true, get: function () { return security_posture_service_js_1.SecurityPostureService; } });
/**
 * Security Services Factory
 * Initializes and manages all security services
 */
var secret_vault_service_js_2 = require("./secret-vault.service.js");
var certificate_management_service_js_2 = require("./certificate-management.service.js");
var password_rotation_service_js_2 = require("./password-rotation.service.js");
var hsm_service_js_2 = require("./hsm.service.js");
var zero_trust_policy_service_js_2 = require("./zero-trust-policy.service.js");
var security_posture_service_js_2 = require("./security-posture.service.js");
var events_1 = require("events");
var SecurityServicesFactory = /** @class */ (function (_super) {
    __extends(SecurityServicesFactory, _super);
    function SecurityServicesFactory() {
        return _super.call(this) || this;
    }
    SecurityServicesFactory.getInstance = function () {
        if (!SecurityServicesFactory.instance) {
            SecurityServicesFactory.instance = new SecurityServicesFactory();
        }
        return SecurityServicesFactory.instance;
    };
    /**
     * Initialize all security services
     */
    SecurityServicesFactory.prototype.initialize = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                try {
                    // Initialize services in dependency order
                    this.secretVault = new secret_vault_service_js_2.SecretVaultService();
                    this.certificateManagement = new certificate_management_service_js_2.CertificateManagementService();
                    this.passwordRotation = new password_rotation_service_js_2.PasswordRotationService(this.secretVault);
                    this.hsm = new hsm_service_js_2.HSMService();
                    this.zeroTrust = new zero_trust_policy_service_js_2.ZeroTrustPolicyEngine();
                    this.securityPosture = new security_posture_service_js_2.SecurityPostureService();
                    // Wire up event handlers
                    this.setupEventHandlers();
                    this.emit('security:initialized');
                    console.log('Security services initialized successfully');
                }
                catch (error) {
                    this.emit('security:initialization-failed', { error: error.message });
                    throw new Error("Failed to initialize security services: ".concat(error.message));
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Setup cross-service event handlers
     */
    SecurityServicesFactory.prototype.setupEventHandlers = function () {
        var _this = this;
        // Certificate expiration notifications
        this.certificateManagement.on('certificate:expiring-soon', function (data) {
            _this.emit('security:alert', {
                type: 'certificate_expiring',
                severity: 'warning',
                data: data
            });
        });
        // Secret rotation notifications
        this.secretVault.on('secret:expiring-soon', function (data) {
            _this.emit('security:alert', {
                type: 'secret_expiring',
                severity: 'warning',
                data: data
            });
        });
        // Password rotation failures
        this.passwordRotation.on('rotation:failed', function (data) {
            _this.emit('security:alert', {
                type: 'rotation_failed',
                severity: 'high',
                data: data
            });
        });
        // Zero Trust access denials
        this.zeroTrust.on('access:evaluated', function (data) {
            if (data.decision === 'deny') {
                _this.emit('security:alert', {
                    type: 'access_denied',
                    severity: 'medium',
                    data: data
                });
            }
        });
    };
    /**
     * Health check for all services
     */
    SecurityServicesFactory.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var results, _a, _b, _c, _d, _e;
            return __generator(this, function (_f) {
                switch (_f.label) {
                    case 0:
                        results = {};
                        if (!this.secretVault) return [3 /*break*/, 2];
                        _a = results;
                        return [4 /*yield*/, this.secretVault.healthCheck()];
                    case 1:
                        _a.secretVault = _f.sent();
                        _f.label = 2;
                    case 2:
                        if (!this.certificateManagement) return [3 /*break*/, 4];
                        _b = results;
                        return [4 /*yield*/, this.certificateManagement.healthCheck()];
                    case 3:
                        _b.certificateManagement = _f.sent();
                        _f.label = 4;
                    case 4:
                        if (!this.passwordRotation) return [3 /*break*/, 6];
                        _c = results;
                        return [4 /*yield*/, this.passwordRotation.healthCheck()];
                    case 5:
                        _c.passwordRotation = _f.sent();
                        _f.label = 6;
                    case 6:
                        if (!this.hsm) return [3 /*break*/, 8];
                        _d = results;
                        return [4 /*yield*/, this.hsm.healthCheck()];
                    case 7:
                        _d.hsm = _f.sent();
                        _f.label = 8;
                    case 8:
                        if (!this.zeroTrust) return [3 /*break*/, 10];
                        _e = results;
                        return [4 /*yield*/, this.zeroTrust.healthCheck()];
                    case 9:
                        _e.zeroTrust = _f.sent();
                        _f.label = 10;
                    case 10: return [2 /*return*/, results];
                }
            });
        });
    };
    /**
     * Shutdown all services gracefully
     */
    SecurityServicesFactory.prototype.shutdown = function () {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                if (this.certificateManagement) {
                    this.certificateManagement.stopMonitoring();
                }
                if (this.passwordRotation) {
                    this.passwordRotation.stopScheduler();
                }
                this.emit('security:shutdown');
                return [2 /*return*/];
            });
        });
    };
    return SecurityServicesFactory;
}(events_1.EventEmitter));
exports.SecurityServicesFactory = SecurityServicesFactory;
