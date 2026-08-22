"use strict";
/**
 * Certificate Management Service
 * Track, renew, and manage X.509 certificates across the platform
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
var __spreadArray = (this && this.__spreadArray) || function (to, from, pack) {
    if (pack || arguments.length === 2) for (var i = 0, l = from.length, ar; i < l; i++) {
        if (ar || !(i in from)) {
            if (!ar) ar = Array.prototype.slice.call(from, 0, i);
            ar[i] = from[i];
        }
    }
    return to.concat(ar || Array.prototype.slice.call(from));
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CertificateManagementService = void 0;
var node_forge_1 = require("node-forge");
var types_js_1 = require("../types.js");
var database_js_1 = require("../../config/database.js");
var events_1 = require("events");
var child_process_1 = require("child_process");
var util_1 = require("util");
var execAsync = (0, util_1.promisify)(child_process_1.exec);
var CertificateManagementService = /** @class */ (function (_super) {
    __extends(CertificateManagementService, _super);
    function CertificateManagementService() {
        var _this = _super.call(this) || this;
        _this.WARNING_DAYS = 30;
        _this.CRITICAL_DAYS = 7;
        _this.monitoringInterval = null;
        _this.startMonitoring();
        return _this;
    }
    /**
     * Import a certificate
     */
    CertificateManagementService.prototype.importCertificate = function (name, type, pemCertificate, pemPrivateKey, pemChain) {
        return __awaiter(this, void 0, void 0, function () {
            var db, cert, commonName, subjectAlternativeNames, issuer, serialNumber, notBefore, notAfter, fingerprint, publicKey, algorithm, keySize, certificate, error_1;
            var _a, _b;
            return __generator(this, function (_c) {
                switch (_c.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        _c.label = 1;
                    case 1:
                        _c.trys.push([1, 4, , 5]);
                        cert = node_forge_1.default.pki.certificateFromPem(pemCertificate);
                        commonName = ((_a = cert.subject.getField('CN')) === null || _a === void 0 ? void 0 : _a.value) || '';
                        subjectAlternativeNames = this.extractSANs(cert);
                        issuer = ((_b = cert.issuer.getField('CN')) === null || _b === void 0 ? void 0 : _b.value) || '';
                        serialNumber = cert.serialNumber;
                        notBefore = cert.validity.notBefore;
                        notAfter = cert.validity.notAfter;
                        fingerprint = this.calculateFingerprint(pemCertificate);
                        publicKey = cert.publicKey;
                        algorithm = publicKey.algorithm || 'RSA';
                        keySize = publicKey.n ? publicKey.n.bitLength() : 0;
                        certificate = {
                            id: this.generateId(),
                            name: name,
                            type: type,
                            commonName: commonName,
                            subjectAlternativeNames: subjectAlternativeNames,
                            issuer: issuer,
                            serialNumber: serialNumber,
                            fingerprint: fingerprint,
                            algorithm: algorithm,
                            keySize: keySize,
                            notBefore: notBefore,
                            notAfter: notAfter,
                            status: this.determineStatus(notBefore, notAfter),
                            pemCertificate: pemCertificate,
                            pemPrivateKey: pemPrivateKey,
                            pemChain: pemChain,
                            autoRenew: false,
                            renewDaysBeforeExpiry: 30,
                            usedBy: [],
                            tags: [],
                            metadata: {},
                            createdAt: new Date(),
                            updatedAt: new Date()
                        };
                        // Validate certificate
                        return [4 /*yield*/, this.validateCertificateData(certificate)];
                    case 2:
                        // Validate certificate
                        _c.sent();
                        // Store in database
                        return [4 /*yield*/, db.collection('certificates').insertOne(certificate)];
                    case 3:
                        // Store in database
                        _c.sent();
                        this.emit('certificate:imported', { certificateId: certificate.id, name: name, commonName: commonName });
                        return [2 /*return*/, certificate];
                    case 4:
                        error_1 = _c.sent();
                        throw new Error("Failed to import certificate: ".concat(error_1.message));
                    case 5: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Get a certificate by ID
     */
    CertificateManagementService.prototype.getCertificate = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, certificate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('certificates').findOne({ id: id })];
                    case 1:
                        certificate = _a.sent();
                        if (!certificate) {
                            throw new Error('Certificate not found');
                        }
                        return [2 /*return*/, certificate];
                }
            });
        });
    };
    /**
     * List certificates with filters
     */
    CertificateManagementService.prototype.listCertificates = function () {
        return __awaiter(this, arguments, void 0, function (filters) {
            var db, query, thresholdDate, certificates;
            if (filters === void 0) { filters = {}; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        query = {};
                        if (filters.type) {
                            query.type = filters.type;
                        }
                        if (filters.status) {
                            query.status = filters.status;
                        }
                        if (filters.expiringSoon) {
                            thresholdDate = new Date();
                            thresholdDate.setDate(thresholdDate.getDate() + (filters.expiryDays || 30));
                            query.notAfter = {
                                $gte: new Date(),
                                $lte: thresholdDate
                            };
                        }
                        return [4 /*yield*/, db.collection('certificates')
                                .find(query)
                                .sort({ notAfter: 1 })
                                .toArray()];
                    case 1:
                        certificates = _a.sent();
                        return [2 /*return*/, certificates];
                }
            });
        });
    };
    /**
     * Delete a certificate
     */
    CertificateManagementService.prototype.deleteCertificate = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, certificate;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getCertificate(id)];
                    case 1:
                        certificate = _a.sent();
                        // Check if certificate is in use
                        if (certificate.usedBy && certificate.usedBy.length > 0) {
                            throw new Error('Cannot delete certificate that is in use');
                        }
                        return [4 /*yield*/, db.collection('certificates').deleteOne({ id: id })];
                    case 2:
                        _a.sent();
                        this.emit('certificate:deleted', { certificateId: id });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Verify certificate validity
     */
    CertificateManagementService.prototype.verifyCertificate = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, certificate, check, cert, now, chainValid, ocspStatus, error_2, error_3;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getCertificate(id)];
                    case 1:
                        certificate = _a.sent();
                        check = {
                            certificateId: id,
                            timestamp: new Date(),
                            status: types_js_1.CertificateStatus.VALID,
                            daysUntilExpiry: this.calculateDaysUntilExpiry(certificate.notAfter),
                            validationErrors: [],
                            revocationChecked: false
                        };
                        _a.label = 2;
                    case 2:
                        _a.trys.push([2, 10, , 11]);
                        cert = node_forge_1.default.pki.certificateFromPem(certificate.pemCertificate);
                        now = new Date();
                        if (now < certificate.notBefore) {
                            check.status = types_js_1.CertificateStatus.INVALID;
                            check.validationErrors.push('Certificate not yet valid');
                        }
                        else if (now > certificate.notAfter) {
                            check.status = types_js_1.CertificateStatus.EXPIRED;
                            check.validationErrors.push('Certificate expired');
                        }
                        else if (check.daysUntilExpiry <= this.CRITICAL_DAYS) {
                            check.status = types_js_1.CertificateStatus.EXPIRING_SOON;
                            check.validationErrors.push("Certificate expires in ".concat(check.daysUntilExpiry, " days"));
                        }
                        else if (check.daysUntilExpiry <= this.WARNING_DAYS) {
                            check.status = types_js_1.CertificateStatus.EXPIRING_SOON;
                        }
                        if (!(certificate.pemChain && certificate.pemChain.length > 0)) return [3 /*break*/, 4];
                        return [4 /*yield*/, this.validateChain(id)];
                    case 3:
                        chainValid = _a.sent();
                        if (!chainValid) {
                            check.validationErrors.push('Certificate chain validation failed');
                        }
                        _a.label = 4;
                    case 4:
                        _a.trys.push([4, 6, , 7]);
                        return [4 /*yield*/, this.checkOCSP(certificate)];
                    case 5:
                        ocspStatus = _a.sent();
                        check.revocationChecked = true;
                        check.ocspStatus = ocspStatus;
                        if (ocspStatus === 'revoked') {
                            check.status = types_js_1.CertificateStatus.REVOKED;
                            check.validationErrors.push('Certificate has been revoked');
                        }
                        return [3 /*break*/, 7];
                    case 6:
                        error_2 = _a.sent();
                        // OCSP check failed - non-fatal
                        console.warn("OCSP check failed for certificate ".concat(id, ":"), error_2.message);
                        return [3 /*break*/, 7];
                    case 7: 
                    // Update certificate status
                    return [4 /*yield*/, db.collection('certificates').updateOne({ id: id }, {
                            $set: {
                                status: check.status,
                                lastCheckedAt: check.timestamp,
                                nextCheckAt: this.calculateNextCheckDate(check.status)
                            }
                        })];
                    case 8:
                        // Update certificate status
                        _a.sent();
                        // Store check result
                        return [4 /*yield*/, db.collection('certificate_checks').insertOne(check)];
                    case 9:
                        // Store check result
                        _a.sent();
                        this.emit('certificate:verified', { certificateId: id, status: check.status });
                        return [2 /*return*/, check];
                    case 10:
                        error_3 = _a.sent();
                        check.status = types_js_1.CertificateStatus.INVALID;
                        check.validationErrors.push(error_3.message);
                        return [2 /*return*/, check];
                    case 11: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Renew a certificate
     */
    CertificateManagementService.prototype.renewCertificate = function (id) {
        return __awaiter(this, void 0, void 0, function () {
            var db, certificate, csr, newCertPem, renewedCert, _i, _a, usage, error_4;
            return __generator(this, function (_b) {
                switch (_b.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getCertificate(id)];
                    case 1:
                        certificate = _b.sent();
                        _b.label = 2;
                    case 2:
                        _b.trys.push([2, 11, , 12]);
                        return [4 /*yield*/, this.generateCSR(certificate)];
                    case 3:
                        csr = _b.sent();
                        return [4 /*yield*/, this.submitCSRToCA(csr, certificate)];
                    case 4:
                        newCertPem = _b.sent();
                        return [4 /*yield*/, this.importCertificate("".concat(certificate.name, " (Renewed)"), certificate.type, newCertPem, certificate.pemPrivateKey, certificate.pemChain)];
                    case 5:
                        renewedCert = _b.sent();
                        _i = 0, _a = certificate.usedBy;
                        _b.label = 6;
                    case 6:
                        if (!(_i < _a.length)) return [3 /*break*/, 9];
                        usage = _a[_i];
                        return [4 /*yield*/, this.trackUsage(renewedCert.id, usage.resourceType, usage.resourceId)];
                    case 7:
                        _b.sent();
                        _b.label = 8;
                    case 8:
                        _i++;
                        return [3 /*break*/, 6];
                    case 9: 
                    // Mark old certificate as deprecated
                    return [4 /*yield*/, db.collection('certificates').updateOne({ id: id }, {
                            $set: {
                                tags: __spreadArray(__spreadArray([], certificate.tags, true), ['deprecated'], false),
                                metadata: __assign(__assign({}, certificate.metadata), { replacedBy: renewedCert.id })
                            }
                        })];
                    case 10:
                        // Mark old certificate as deprecated
                        _b.sent();
                        this.emit('certificate:renewed', {
                            oldCertificateId: id,
                            newCertificateId: renewedCert.id
                        });
                        return [2 /*return*/, renewedCert];
                    case 11:
                        error_4 = _b.sent();
                        throw new Error("Failed to renew certificate: ".concat(error_4.message));
                    case 12: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Revoke a certificate
     */
    CertificateManagementService.prototype.revokeCertificate = function (id, reason) {
        return __awaiter(this, void 0, void 0, function () {
            var db;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('certificates').updateOne({ id: id }, {
                                $set: {
                                    status: types_js_1.CertificateStatus.REVOKED,
                                    metadata: {
                                        revokedAt: new Date(),
                                        revocationReason: reason
                                    }
                                }
                            })];
                    case 1:
                        _a.sent();
                        this.emit('certificate:revoked', { certificateId: id, reason: reason });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Check for expiring certificates
     */
    CertificateManagementService.prototype.checkExpiringCertificates = function () {
        return __awaiter(this, arguments, void 0, function (daysThreshold) {
            var certificates, _i, certificates_1, cert, daysUntilExpiry;
            if (daysThreshold === void 0) { daysThreshold = 30; }
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0: return [4 /*yield*/, this.listCertificates({
                            expiringSoon: true,
                            expiryDays: daysThreshold
                        })];
                    case 1:
                        certificates = _a.sent();
                        for (_i = 0, certificates_1 = certificates; _i < certificates_1.length; _i++) {
                            cert = certificates_1[_i];
                            daysUntilExpiry = this.calculateDaysUntilExpiry(cert.notAfter);
                            this.emit('certificate:expiring-soon', {
                                certificateId: cert.id,
                                name: cert.name,
                                commonName: cert.commonName,
                                daysUntilExpiry: daysUntilExpiry,
                                expiresAt: cert.notAfter
                            });
                        }
                        return [2 /*return*/, certificates];
                }
            });
        });
    };
    /**
     * Auto-renew certificates
     */
    CertificateManagementService.prototype.autoRenewCertificates = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, now, certificates, renewed, _i, certificates_2, cert, daysUntilExpiry, renewedCert, error_5;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        now = new Date();
                        return [4 /*yield*/, db.collection('certificates')
                                .find({
                                autoRenew: true,
                                status: { $in: [types_js_1.CertificateStatus.VALID, types_js_1.CertificateStatus.EXPIRING_SOON] }
                            })
                                .toArray()];
                    case 1:
                        certificates = _a.sent();
                        renewed = [];
                        _i = 0, certificates_2 = certificates;
                        _a.label = 2;
                    case 2:
                        if (!(_i < certificates_2.length)) return [3 /*break*/, 7];
                        cert = certificates_2[_i];
                        daysUntilExpiry = this.calculateDaysUntilExpiry(cert.notAfter);
                        if (!(daysUntilExpiry <= cert.renewDaysBeforeExpiry)) return [3 /*break*/, 6];
                        _a.label = 3;
                    case 3:
                        _a.trys.push([3, 5, , 6]);
                        return [4 /*yield*/, this.renewCertificate(cert.id)];
                    case 4:
                        renewedCert = _a.sent();
                        renewed.push(renewedCert);
                        return [3 /*break*/, 6];
                    case 5:
                        error_5 = _a.sent();
                        console.error("Failed to auto-renew certificate ".concat(cert.id, ":"), error_5);
                        this.emit('certificate:renewal-failed', {
                            certificateId: cert.id,
                            error: error_5.message
                        });
                        return [3 /*break*/, 6];
                    case 6:
                        _i++;
                        return [3 /*break*/, 2];
                    case 7: return [2 /*return*/, renewed];
                }
            });
        });
    };
    /**
     * Validate certificate chain
     */
    CertificateManagementService.prototype.validateChain = function (certificateId) {
        return __awaiter(this, void 0, void 0, function () {
            var certificate, cert, chain, caStore_1, error_6;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 2, , 3]);
                        return [4 /*yield*/, this.getCertificate(certificateId)];
                    case 1:
                        certificate = _a.sent();
                        if (!certificate.pemChain || certificate.pemChain.length === 0) {
                            return [2 /*return*/, true]; // No chain to validate
                        }
                        cert = node_forge_1.default.pki.certificateFromPem(certificate.pemCertificate);
                        chain = certificate.pemChain.map(function (pem) { return node_forge_1.default.pki.certificateFromPem(pem); });
                        caStore_1 = node_forge_1.default.pki.createCaStore();
                        chain.forEach(function (c) { return caStore_1.addCertificate(c); });
                        // Verify certificate against chain
                        try {
                            node_forge_1.default.pki.verifyCertificateChain(caStore_1, __spreadArray([cert], chain, true));
                            return [2 /*return*/, true];
                        }
                        catch (error) {
                            console.error('Chain validation failed:', error);
                            return [2 /*return*/, false];
                        }
                        return [3 /*break*/, 3];
                    case 2:
                        error_6 = _a.sent();
                        console.error('Error validating chain:', error_6);
                        return [2 /*return*/, false];
                    case 3: return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Track certificate usage
     */
    CertificateManagementService.prototype.trackUsage = function (certificateId, resourceType, resourceId) {
        return __awaiter(this, void 0, void 0, function () {
            var db, certificate, existingUsage, usage;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, this.getCertificate(certificateId)];
                    case 1:
                        certificate = _a.sent();
                        existingUsage = certificate.usedBy.find(function (u) { return u.resourceType === resourceType && u.resourceId === resourceId; });
                        if (existingUsage) {
                            return [2 /*return*/]; // Already tracked
                        }
                        usage = {
                            resourceType: resourceType,
                            resourceId: resourceId,
                            resourceName: "".concat(resourceType, "-").concat(resourceId),
                            purpose: 'SSL/TLS'
                        };
                        return [4 /*yield*/, db.collection('certificates').updateOne({ id: certificateId }, {
                                $push: { usedBy: usage }
                            })];
                    case 2:
                        _a.sent();
                        this.emit('certificate:usage-tracked', { certificateId: certificateId, usage: usage });
                        return [2 /*return*/];
                }
            });
        });
    };
    /**
     * Helper: Extract Subject Alternative Names
     */
    CertificateManagementService.prototype.extractSANs = function (cert) {
        var sans = [];
        var altNames = cert.getExtension('subjectAltName');
        if (altNames && altNames.altNames) {
            altNames.altNames.forEach(function (alt) {
                if (alt.type === 2) { // DNS
                    sans.push(alt.value);
                }
                else if (alt.type === 7) { // IP
                    sans.push(alt.ip);
                }
            });
        }
        return sans;
    };
    /**
     * Helper: Calculate fingerprint
     */
    CertificateManagementService.prototype.calculateFingerprint = function (pemCertificate) {
        var _a;
        var cert = node_forge_1.default.pki.certificateFromPem(pemCertificate);
        var der = node_forge_1.default.asn1.toDer(node_forge_1.default.pki.certificateToAsn1(cert)).getBytes();
        var md = node_forge_1.default.md.sha256.create();
        md.update(der);
        return ((_a = md.digest().toHex().toUpperCase().match(/.{2}/g)) === null || _a === void 0 ? void 0 : _a.join(':')) || '';
    };
    /**
     * Helper: Determine certificate status
     */
    CertificateManagementService.prototype.determineStatus = function (notBefore, notAfter) {
        var now = new Date();
        if (now < notBefore) {
            return types_js_1.CertificateStatus.INVALID;
        }
        if (now > notAfter) {
            return types_js_1.CertificateStatus.EXPIRED;
        }
        var daysUntilExpiry = this.calculateDaysUntilExpiry(notAfter);
        if (daysUntilExpiry <= this.WARNING_DAYS) {
            return types_js_1.CertificateStatus.EXPIRING_SOON;
        }
        return types_js_1.CertificateStatus.VALID;
    };
    /**
     * Helper: Calculate days until expiry
     */
    CertificateManagementService.prototype.calculateDaysUntilExpiry = function (notAfter) {
        var now = new Date();
        var diffTime = notAfter.getTime() - now.getTime();
        return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    };
    /**
     * Helper: Calculate next check date based on status
     */
    CertificateManagementService.prototype.calculateNextCheckDate = function (status) {
        var now = new Date();
        switch (status) {
            case types_js_1.CertificateStatus.EXPIRED:
            case types_js_1.CertificateStatus.REVOKED:
                // Check daily
                return new Date(now.getTime() + 24 * 60 * 60 * 1000);
            case types_js_1.CertificateStatus.EXPIRING_SOON:
                // Check every 6 hours
                return new Date(now.getTime() + 6 * 60 * 60 * 1000);
            case types_js_1.CertificateStatus.VALID:
            default:
                // Check daily
                return new Date(now.getTime() + 24 * 60 * 60 * 1000);
        }
    };
    /**
     * Helper: Validate certificate data
     */
    CertificateManagementService.prototype.validateCertificateData = function (certificate) {
        return __awaiter(this, void 0, void 0, function () {
            var errors;
            return __generator(this, function (_a) {
                errors = [];
                if (!certificate.commonName) {
                    errors.push('Common Name is required');
                }
                if (certificate.keySize < 2048) {
                    errors.push('Key size must be at least 2048 bits');
                }
                if (certificate.algorithm !== 'RSA' && certificate.algorithm !== 'ECDSA') {
                    errors.push('Only RSA and ECDSA algorithms are supported');
                }
                if (errors.length > 0) {
                    throw new Error("Certificate validation failed: ".concat(errors.join(', ')));
                }
                return [2 /*return*/];
            });
        });
    };
    /**
     * Helper: Generate CSR for renewal
     */
    CertificateManagementService.prototype.generateCSR = function (certificate) {
        return __awaiter(this, void 0, void 0, function () {
            var keys, csr;
            return __generator(this, function (_a) {
                keys = node_forge_1.default.pki.rsa.generateKeyPair(certificate.keySize);
                csr = node_forge_1.default.pki.createCertificationRequest();
                csr.publicKey = keys.publicKey;
                csr.setSubject([{
                        name: 'commonName',
                        value: certificate.commonName
                    }]);
                // Add SANs
                if (certificate.subjectAlternativeNames.length > 0) {
                    csr.setAttributes([{
                            name: 'extensionRequest',
                            extensions: [{
                                    name: 'subjectAltName',
                                    altNames: certificate.subjectAlternativeNames.map(function (san) { return ({
                                        type: 2, // DNS
                                        value: san
                                    }); })
                                }]
                        }]);
                }
                // Sign CSR
                csr.sign(keys.privateKey);
                return [2 /*return*/, node_forge_1.default.pki.certificationRequestToPem(csr)];
            });
        });
    };
    /**
     * Helper: Submit CSR to CA (placeholder)
     */
    CertificateManagementService.prototype.submitCSRToCA = function (csr, certificate) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // This is a placeholder - actual implementation depends on CA type
                // Examples:
                // - Let's Encrypt ACME
                // - Internal CA REST API
                // - External CA portal
                throw new Error('CA integration not configured. Please configure a Certificate Authority.');
            });
        });
    };
    /**
     * Helper: Check OCSP status
     */
    CertificateManagementService.prototype.checkOCSP = function (certificate) {
        return __awaiter(this, void 0, void 0, function () {
            return __generator(this, function (_a) {
                // Placeholder for OCSP checking
                // Would use certificate's OCSP responder URL
                return [2 /*return*/, 'good'];
            });
        });
    };
    /**
     * Start monitoring certificates
     */
    CertificateManagementService.prototype.startMonitoring = function () {
        var _this = this;
        // Check certificates every hour
        this.monitoringInterval = setInterval(function () { return __awaiter(_this, void 0, void 0, function () {
            var error_7;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 3, , 4]);
                        return [4 /*yield*/, this.checkExpiringCertificates(30)];
                    case 1:
                        _a.sent();
                        return [4 /*yield*/, this.autoRenewCertificates()];
                    case 2:
                        _a.sent();
                        return [3 /*break*/, 4];
                    case 3:
                        error_7 = _a.sent();
                        console.error('Certificate monitoring error:', error_7);
                        return [3 /*break*/, 4];
                    case 4: return [2 /*return*/];
                }
            });
        }); }, 60 * 60 * 1000);
    };
    /**
     * Stop monitoring
     */
    CertificateManagementService.prototype.stopMonitoring = function () {
        if (this.monitoringInterval) {
            clearInterval(this.monitoringInterval);
            this.monitoringInterval = null;
        }
    };
    /**
     * Generate unique ID
     */
    CertificateManagementService.prototype.generateId = function () {
        return "cert_".concat(Date.now(), "_").concat(Math.random().toString(36).substr(2, 9));
    };
    /**
     * Health check
     */
    CertificateManagementService.prototype.healthCheck = function () {
        return __awaiter(this, void 0, void 0, function () {
            var db, totalCerts, expiring, expired, revoked, error_8;
            return __generator(this, function (_a) {
                switch (_a.label) {
                    case 0:
                        _a.trys.push([0, 5, , 6]);
                        db = (0, database_js_1.getDatabase)();
                        return [4 /*yield*/, db.collection('certificates').countDocuments()];
                    case 1:
                        totalCerts = _a.sent();
                        return [4 /*yield*/, this.checkExpiringCertificates(30)];
                    case 2:
                        expiring = (_a.sent()).length;
                        return [4 /*yield*/, this.listCertificates({ status: types_js_1.CertificateStatus.EXPIRED })];
                    case 3:
                        expired = (_a.sent()).length;
                        return [4 /*yield*/, this.listCertificates({ status: types_js_1.CertificateStatus.REVOKED })];
                    case 4:
                        revoked = (_a.sent()).length;
                        return [2 /*return*/, {
                                status: 'healthy',
                                details: {
                                    totalCertificates: totalCerts,
                                    expiring: expiring,
                                    expired: expired,
                                    revoked: revoked,
                                    monitoringActive: this.monitoringInterval !== null
                                }
                            }];
                    case 5:
                        error_8 = _a.sent();
                        return [2 /*return*/, {
                                status: 'unhealthy',
                                details: {
                                    error: error_8.message
                                }
                            }];
                    case 6: return [2 /*return*/];
                }
            });
        });
    };
    return CertificateManagementService;
}(events_1.EventEmitter));
exports.CertificateManagementService = CertificateManagementService;
