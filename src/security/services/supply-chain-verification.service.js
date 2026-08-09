"use strict";
/**
 * Supply Chain Verification Service
 * Verify software packages, updates, and signatures
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
exports.SupplyChainVerificationService = void 0;
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var crypto_1 = require("crypto");
var fs = require("fs/promises");
var SupplyChainVerificationService = /** @class */ (function (_super) {
    __extends(SupplyChainVerificationService, _super);
    function SupplyChainVerificationService() {
        return _super !== null && _super.apply(this, arguments) || this;
    }
    SupplyChainVerificationService.prototype.verifyPackage = function (packagePath) {
        return __awaiter(this, void 0, void 0, function () {
            var db, stats, data, checksum, pkg;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, fs.stat(packagePath)];
                    case 1:
                        stats = _a.sent();
                        return [4 /*yield*/, fs.readFile(packagePath)];
                    case 2:
                        data = _a.sent();
                        checksum = (0, crypto_1.createHash)('sha256').update(data).digest('hex');
                        pkg = {
                            id: this.generateId(),
                            name: packagePath.split('/').pop() || 'unknown',
                            version: '1.0.0',
                            type: 'update',
                            vendor: 'unknown',
                            localPath: packagePath,
                            size: stats.size,
                            checksum: checksum,
                            checksumAlgorithm: 'sha256',
                            verificationStatus: types_js_1.VerificationStatus.VERIFIED,
                            verifiedAt: new Date(),
                            trustedPublisher: true,
                            vulnerabilities: [],
                            metadata: {}
                        };
                        return [4 /*yield*/, db.collection('software_packages').insertOne(pkg)];
                    case 3:
                        _a.sent();
                        this.emit('package:verified', { packageId: pkg.id });
                        return [2 /*return*/, pkg];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.verifySignature = function (packagePath, signaturePath, publicKey) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Placeholder for signature verification
                return [2 /*return*/, true];
            });
        });
    };
    SupplyChainVerificationService.prototype.verifyChecksum = function (packagePath, expectedChecksum, algorithm) {
        return __awaiter(this, void 0, void 0, function () {
            var data, actualChecksum;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.readFile(packagePath)];
                    case 1:
                        data = _a.sent();
                        actualChecksum = (0, crypto_1.createHash)(algorithm).update(data).digest('hex');
                        return [2 /*return*/, actualChecksum === expectedChecksum];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.addTrustedPublisher = function (name, publicKey, certificate) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('trusted_publishers').insertOne({
                                id: this.generateId(),
                                name: name,
                                publicKeys: [publicKey],
                                certificateFingerprints: [certificate],
                                verified: true,
                                addedAt: new Date(),
                                addedBy: 'system'
                            })];
                    case 1:
                        _a.sent();
                        this.emit('publisher:added', { name: name });
                        return [2 /*return*/];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.listTrustedPublishers = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('trusted_publishers').find().toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.removeTrustedPublisher = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('trusted_publishers').deleteOne({ id: id })];
                    case 1:
                        _a.sent();
                        this.emit('publisher:removed', { id: id });
                        return [2 /*return*/];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.parseSBOM = function (sbomPath) {
        return __awaiter(this, void 0, void 0, function () {
            var data;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, fs.readFile(sbomPath, 'utf-8')];
                    case 1:
                        data = _a.sent();
                        return [2 /*return*/, JSON.parse(data)];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.validateSBOM = function (sbomPath) {
        return __awaiter(this, void 0, void 0, function () {
            var _a;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        _b.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.parseSBOM(sbomPath)];
                    case 1:
                        _b.sent();
                        return [2 /*return*/, true];
                    case 2:
                        _a = _b.sent();
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.scanForVulnerabilities = function (packageId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Placeholder - would integrate with vulnerability databases
                return [2 /*return*/, []];
            });
        });
    };
    SupplyChainVerificationService.prototype.checkCVE = function (cveId) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Placeholder - would query CVE database
                return [2 /*return*/, null];
            });
        });
    };
    SupplyChainVerificationService.prototype.registerPackage = function (pkg) {
        return __awaiter(this, void 0, void 0, function () {
            var db, newPkg;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        newPkg = __assign({ id: this.generateId() }, pkg);
                        return [4 /*yield*/, db.collection('software_packages').insertOne(newPkg)];
                    case 1:
                        _a.sent();
                        return [2 /*return*/, newPkg];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.getPackage = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('software_packages').findOne({ id: id })];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.listPackages = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var db, query;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = {};
                        if (filters.type)
                            query.type = filters.type;
                        if (filters.vendor)
                            query.vendor = filters.vendor;
                        if (filters.verificationStatus)
                            query.verificationStatus = filters.verificationStatus;
                        return [4 /*yield*/, db.collection('software_packages').find(query).toArray()];
                    case 1: return [2 /*return*/, _a.sent()];
                }
            });
        });
    };
    SupplyChainVerificationService.prototype.generateId = function () {
        return "supply_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    SupplyChainVerificationService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, totalPackages;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('software_packages').countDocuments()];
                    case 1:
                        totalPackages = _a.sent();
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: { totalPackages: totalPackages }
                            }];
                }
            });
        });
    };
    return SupplyChainVerificationService;
}(events_1.EventEmitter));
exports.SupplyChainVerificationService = SupplyChainVerificationService;
