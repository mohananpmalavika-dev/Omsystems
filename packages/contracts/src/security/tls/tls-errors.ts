/**
 * Typed TLS & Transport Security Errors
 */

import { TlsErrorCode } from "./tls-types.js";

export class SecurityConfigurationError extends Error {
  readonly code: TlsErrorCode;
  readonly details?: Record<string, unknown>;

  constructor(message: string, code: TlsErrorCode = TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN, details?: Record<string, unknown>) {
    super(message);
    this.name = "SecurityConfigurationError";
    this.code = code;
    this.details = details;
  }
}

export class TlsCertificateValidationError extends Error {
  readonly code: TlsErrorCode;
  readonly certificateSubject?: string;
  readonly host?: string;

  constructor(
    message: string,
    code: TlsErrorCode = TlsErrorCode.TLS_HANDSHAKE_FAILED,
    options?: { certificateSubject?: string; host?: string },
  ) {
    super(message);
    this.name = "TlsCertificateValidationError";
    this.code = code;
    this.certificateSubject = options?.certificateSubject;
    this.host = options?.host;
  }
}

export class DeviceCertificateUntrustedError extends Error {
  readonly deviceId: string;
  readonly fingerprint: string;
  readonly trustState: string;

  constructor(deviceId: string, fingerprint: string, trustState: string, message?: string) {
    super(
      message ||
        `Device '${deviceId}' presented untrusted or unpinned certificate (Fingerprint SHA256: ${fingerprint}, State: ${trustState}).`,
    );
    this.name = "DeviceCertificateUntrustedError";
    this.deviceId = deviceId;
    this.fingerprint = fingerprint;
    this.trustState = trustState;
  }
}
