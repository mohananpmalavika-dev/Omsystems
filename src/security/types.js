"use strict";
/**
 * Enterprise Security Types
 * Comprehensive type definitions for cybersecurity components
 */
Object.defineProperty(exports, "__esModule", { value: true });
exports.ComplianceFramework = exports.BootStatus = exports.VerificationStatus = exports.ThreatLevel = exports.RetentionStatus = exports.EncryptionAlgorithm = exports.TamperEventType = exports.HSMOperationType = exports.RotationStatus = exports.CertificateType = exports.CertificateStatus = exports.SecretType = exports.AccessDecision = exports.TrustLevel = void 0;
// ============================================================================
// Zero Trust Types
// ============================================================================
var TrustLevel;
(function (TrustLevel) {
    TrustLevel["UNKNOWN"] = "unknown";
    TrustLevel["UNTRUSTED"] = "untrusted";
    TrustLevel["LOW"] = "low";
    TrustLevel["MEDIUM"] = "medium";
    TrustLevel["HIGH"] = "high";
    TrustLevel["VERIFIED"] = "verified";
})(TrustLevel || (exports.TrustLevel = TrustLevel = {}));
var AccessDecision;
(function (AccessDecision) {
    AccessDecision["ALLOW"] = "allow";
    AccessDecision["DENY"] = "deny";
    AccessDecision["CHALLENGE"] = "challenge";
    AccessDecision["STEP_UP"] = "step_up";
})(AccessDecision || (exports.AccessDecision = AccessDecision = {}));
// ============================================================================
// Secret Vault Types
// ============================================================================
var SecretType;
(function (SecretType) {
    SecretType["PASSWORD"] = "password";
    SecretType["API_KEY"] = "api_key";
    SecretType["TOKEN"] = "token";
    SecretType["CERTIFICATE"] = "certificate";
    SecretType["PRIVATE_KEY"] = "private_key";
    SecretType["DATABASE_CREDENTIAL"] = "database_credential";
    SecretType["SSH_KEY"] = "ssh_key";
    SecretType["ENCRYPTION_KEY"] = "encryption_key";
    SecretType["SIGNING_KEY"] = "signing_key";
})(SecretType || (exports.SecretType = SecretType = {}));
// ============================================================================
// Certificate Management Types
// ============================================================================
var CertificateStatus;
(function (CertificateStatus) {
    CertificateStatus["VALID"] = "valid";
    CertificateStatus["EXPIRING_SOON"] = "expiring_soon";
    CertificateStatus["EXPIRED"] = "expired";
    CertificateStatus["REVOKED"] = "revoked";
    CertificateStatus["INVALID"] = "invalid";
})(CertificateStatus || (exports.CertificateStatus = CertificateStatus = {}));
var CertificateType;
(function (CertificateType) {
    CertificateType["SSL_TLS"] = "ssl_tls";
    CertificateType["CLIENT"] = "client";
    CertificateType["CODE_SIGNING"] = "code_signing";
    CertificateType["EMAIL"] = "email";
    CertificateType["ROOT_CA"] = "root_ca";
    CertificateType["INTERMEDIATE_CA"] = "intermediate_ca";
})(CertificateType || (exports.CertificateType = CertificateType = {}));
// ============================================================================
// Password Rotation Types
// ============================================================================
var RotationStatus;
(function (RotationStatus) {
    RotationStatus["PENDING"] = "pending";
    RotationStatus["IN_PROGRESS"] = "in_progress";
    RotationStatus["SUCCESS"] = "success";
    RotationStatus["FAILED"] = "failed";
    RotationStatus["SKIPPED"] = "skipped";
})(RotationStatus || (exports.RotationStatus = RotationStatus = {}));
// ============================================================================
// HSM Types
// ============================================================================
var HSMOperationType;
(function (HSMOperationType) {
    HSMOperationType["SIGN"] = "sign";
    HSMOperationType["VERIFY"] = "verify";
    HSMOperationType["ENCRYPT"] = "encrypt";
    HSMOperationType["DECRYPT"] = "decrypt";
    HSMOperationType["GENERATE_KEY"] = "generate_key";
    HSMOperationType["DERIVE_KEY"] = "derive_key";
    HSMOperationType["WRAP_KEY"] = "wrap_key";
    HSMOperationType["UNWRAP_KEY"] = "unwrap_key";
})(HSMOperationType || (exports.HSMOperationType = HSMOperationType = {}));
// ============================================================================
// Tamper Detection Types
// ============================================================================
var TamperEventType;
(function (TamperEventType) {
    TamperEventType["PHYSICAL_TAMPER"] = "physical_tamper";
    TamperEventType["CHASSIS_OPENED"] = "chassis_opened";
    TamperEventType["DEVICE_UNPLUGGED"] = "device_unplugged";
    TamperEventType["USB_INSERTED"] = "usb_inserted";
    TamperEventType["CONFIG_MODIFIED"] = "config_modified";
    TamperEventType["FIRMWARE_MODIFIED"] = "firmware_modified";
    TamperEventType["DISK_REMOVED"] = "disk_removed";
    TamperEventType["NETWORK_DISCONNECTED"] = "network_disconnected";
    TamperEventType["GPS_SPOOFING"] = "gps_spoofing";
    TamperEventType["CLOCK_MANIPULATION"] = "clock_manipulation";
    TamperEventType["UNAUTHORIZED_ACCESS"] = "unauthorized_access";
    TamperEventType["INTEGRITY_VIOLATION"] = "integrity_violation";
})(TamperEventType || (exports.TamperEventType = TamperEventType = {}));
// ============================================================================
// Video Encryption Types
// ============================================================================
var EncryptionAlgorithm;
(function (EncryptionAlgorithm) {
    EncryptionAlgorithm["AES_256_GCM"] = "aes-256-gcm";
    EncryptionAlgorithm["AES_256_CBC"] = "aes-256-cbc";
    EncryptionAlgorithm["CHACHA20_POLY1305"] = "chacha20-poly1305";
})(EncryptionAlgorithm || (exports.EncryptionAlgorithm = EncryptionAlgorithm = {}));
// ============================================================================
// Immutable Storage Types
// ============================================================================
var RetentionStatus;
(function (RetentionStatus) {
    RetentionStatus["ACTIVE"] = "active";
    RetentionStatus["LOCKED"] = "locked";
    RetentionStatus["EXPIRED"] = "expired";
    RetentionStatus["LEGAL_HOLD"] = "legal_hold";
})(RetentionStatus || (exports.RetentionStatus = RetentionStatus = {}));
// ============================================================================
// Ransomware Detection Types
// ============================================================================
var ThreatLevel;
(function (ThreatLevel) {
    ThreatLevel["INFO"] = "info";
    ThreatLevel["LOW"] = "low";
    ThreatLevel["MEDIUM"] = "medium";
    ThreatLevel["HIGH"] = "high";
    ThreatLevel["CRITICAL"] = "critical";
})(ThreatLevel || (exports.ThreatLevel = ThreatLevel = {}));
// ============================================================================
// Supply Chain Verification Types
// ============================================================================
var VerificationStatus;
(function (VerificationStatus) {
    VerificationStatus["VERIFIED"] = "verified";
    VerificationStatus["UNVERIFIED"] = "unverified";
    VerificationStatus["FAILED"] = "failed";
    VerificationStatus["UNKNOWN"] = "unknown";
})(VerificationStatus || (exports.VerificationStatus = VerificationStatus = {}));
// ============================================================================
// Secure Boot Types
// ============================================================================
var BootStatus;
(function (BootStatus) {
    BootStatus["VERIFIED"] = "verified";
    BootStatus["FAILED"] = "failed";
    BootStatus["UNKNOWN"] = "unknown";
    BootStatus["DISABLED"] = "disabled";
})(BootStatus || (exports.BootStatus = BootStatus = {}));
// ============================================================================
// Compliance Types
// ============================================================================
var ComplianceFramework;
(function (ComplianceFramework) {
    ComplianceFramework["ISO_27001"] = "iso_27001";
    ComplianceFramework["IEC_62443"] = "iec_62443";
    ComplianceFramework["NIST_CSF"] = "nist_csf";
    ComplianceFramework["CIS_CONTROLS"] = "cis_controls";
    ComplianceFramework["SOC_2"] = "soc_2";
    ComplianceFramework["GDPR"] = "gdpr";
    ComplianceFramework["HIPAA"] = "hipaa";
    ComplianceFramework["PCI_DSS"] = "pci_dss";
})(ComplianceFramework || (exports.ComplianceFramework = ComplianceFramework = {}));
