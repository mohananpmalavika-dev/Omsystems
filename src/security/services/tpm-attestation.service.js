"use strict";
/**
 * TPM Attestation Service
 * Trusted Platform Module support and device attestation
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
exports.TPMAttestationService = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var TPMAttestationService = /** @class */ (function (_super) {
    __extends(TPMAttestationService, _super);
    function TPMAttestationService() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    TPMAttestationService.prototype.getTPMStatus = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, status;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('tpm_status').findOne({ deviceId: deviceId })];
                    case 1:
                        status = _a.sent();
                        if (!!status) return [3 /*break*/, 3];
                        status = {
                            deviceId: deviceId,
                            deviceName: "Device-".concat(deviceId),
                            present: false,
                            enabled: false,
                            version: 'unknown',
                            manufacturer: 'unknown',
                            firmwareVersion: 'unknown',
                            attestationSupported: false,
                            sealingSupported: false
                        };
                        return [4 /*yield*/, db.collection('tpm_status').insertOne(status)];
                    case 2:
                        _a.sent();
                        _a.label = 3;
                    case 3: return [2 /*return*/, status];
                }
            });
        });
    };
    TPMAttestationService.prototype.listTPMDevices = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('tpm_status').find({ present: true }).toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    TPMAttestationService.prototype.requestAttestation = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var result, db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        result = {
                            success: true,
                            timestamp: new Date(),
                            quote: Buffer.from('tpm_quote_placeholder').toString('base64'),
                            signature: Buffer.from('signature_placeholder').toString('base64'),
                            pcrs: {
                                0: 'pcr0_value',
                                1: 'pcr1_value'
                            },
                            nonce: Buffer.from('nonce').toString('base64'),
                            verified: true,
                            trustLevel: types_js_1.TrustLevel.VERIFIED,
                            anomalies: []
                        };
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('tpm_attestations').insertOne({
                                deviceId: deviceId,
                                result: result,
                                timestamp: new Date()
                            })];
                    case 1:
                        _a.sent();
                        this.emit('attestation:completed', { deviceId: deviceId, success: result.success });
                        return [2 /*return*/, result];
                }
            });
        });
    };
    TPMAttestationService.prototype.verifyAttestation = function (deviceId, quote, signature, pcrs) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.requestAttestation(deviceId)];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    TPMAttestationService.prototype.createTPMKey = function (deviceId, keyType, algorithm) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        id: "tpm_key_".concat(Date.now()),
                        deviceId: deviceId,
                        keyType: keyType,
                        algorithm: algorithm,
                        createdAt: new Date()
                    }];
            });
        });
    };
    TPMAttestationService.prototype.getTPMKeys = function (deviceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('tpm_keys').find({ deviceId: deviceId }).toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    TPMAttestationService.prototype.sealData = function (deviceId, data, pcrSelection) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, Buffer.from('sealed_data_placeholder')];
            });
        });
    };
    TPMAttestationService.prototype.unsealData = function (deviceId, sealedData) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, Buffer.from('unsealed_data_placeholder')];
            });
        });
    };
    TPMAttestationService.prototype.generateQuote = function (deviceId, nonce, pcrSelection) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                return [2 /*return*/, {
                        quote: Buffer.from('quote').toString('base64'),
                        signature: Buffer.from('signature').toString('base64'),
                        pcrs: {},
                        nonce: nonce
                    }];
            });
        });
    };
    TPMAttestationService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, devicesWithTPM;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('tpm_status').countDocuments({ present: true })];
                    case 1:
                        devicesWithTPM = _a.sent();
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: { devicesWithTPM: devicesWithTPM }
                            }];
                }
            });
        });
    };
    return TPMAttestationService;
}(events_1.EventEmitter));
exports.TPMAttestationService = TPMAttestationService;
