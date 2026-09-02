/**
 * Canonical Trusted TLS Configuration Builder
 * 
 * Enforces verified TLS for production network connections:
 * - rejectUnauthorized: true
 * - Minimum TLS version: TLSv1.2 (or TLSv1.3)
 * - Explicit CA / Certificate / Key configuration
 */

import type { ConnectionOptions } from "node:tls";
import type { TrustedTlsOptions } from "../../../packages/contracts/src/security/tls/tls-types.js";
import {
  SecurityConfigurationError,
  TlsCertificateValidationError,
} from "../../../packages/contracts/src/security/tls/tls-errors.js";
import { TlsErrorCode } from "../../../packages/contracts/src/security/tls/tls-types.js";

export function createTrustedTlsConfig(options: TrustedTlsOptions = {}): ConnectionOptions {
  // If rejectUnauthorized is explicitly provided and false in production, reject it
  const isProduction = process.env.NODE_ENV === "production";
  if (isProduction && options.rejectUnauthorized === false) {
    throw new SecurityConfigurationError(
      "Insecure TLS override forbidden in production: rejectUnauthorized must be true for production traffic.",
      TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN,
    );
  }

  const config: ConnectionOptions = {
    rejectUnauthorized: options.rejectUnauthorized !== undefined ? options.rejectUnauthorized : true,
    minVersion: options.minVersion || "TLSv1.2",
  };

  if (options.ca) {
    config.ca = options.ca;
  }
  if (options.cert) {
    config.cert = options.cert;
  }
  if (options.key) {
    config.key = options.key;
  }
  if (options.servername) {
    config.servername = options.servername;
  }
  if (options.checkServerIdentity) {
    config.checkServerIdentity = options.checkServerIdentity;
  }

  return config;
}
