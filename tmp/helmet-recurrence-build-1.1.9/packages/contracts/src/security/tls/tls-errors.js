/**
 * Typed TLS & Transport Security Errors
 */
import { TlsErrorCode } from "./tls-types.js";
export class SecurityConfigurationError extends Error {
    code;
    details;
    constructor(message, code = TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN, details) {
        super(message);
        this.name = "SecurityConfigurationError";
        this.code = code;
        this.details = details;
    }
}
export class TlsCertificateValidationError extends Error {
    code;
    certificateSubject;
    host;
    constructor(message, code = TlsErrorCode.TLS_HANDSHAKE_FAILED, options) {
        super(message);
        this.name = "TlsCertificateValidationError";
        this.code = code;
        this.certificateSubject = options?.certificateSubject;
        this.host = options?.host;
    }
}
export class DeviceCertificateUntrustedError extends Error {
    deviceId;
    fingerprint;
    trustState;
    constructor(deviceId, fingerprint, trustState, message) {
        super(message ||
            `Device '${deviceId}' presented untrusted or unpinned certificate (Fingerprint SHA256: ${fingerprint}, State: ${trustState}).`);
        this.name = "DeviceCertificateUntrustedError";
        this.deviceId = deviceId;
        this.fingerprint = fingerprint;
        this.trustState = trustState;
    }
}
