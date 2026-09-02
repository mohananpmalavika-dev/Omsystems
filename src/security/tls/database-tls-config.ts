/**
 * Authoritative PostgreSQL Database TLS Configuration Builder
 * 
 * Enforces verified TLS for production PostgreSQL connections:
 * - rejectUnauthorized: true
 * - CA Certificate loading via DATABASE_CA_FILE or DATABASE_CA
 * - Client certificate authentication support
 * - Prevention of insecure rejectUnauthorized: false overrides in production
 */

import { readFileSync } from "node:fs";
import type { ConnectionOptions } from "node:tls";
import type { DatabaseTlsConfigOptions, DatabaseTlsMode } from "../../../packages/contracts/src/security/tls/tls-types.js";
import { TlsErrorCode } from "../../../packages/contracts/src/security/tls/tls-types.js";
import { SecurityConfigurationError } from "../../../packages/contracts/src/security/tls/tls-errors.js";

export function createDatabaseTlsConfig(
  options: DatabaseTlsConfigOptions = {},
): ConnectionOptions | boolean | undefined {
  const isProduction = options.isProduction !== undefined
    ? options.isProduction
    : process.env.NODE_ENV === "production";

  // Resolve Database TLS Mode
  let mode: DatabaseTlsMode = options.mode ||
    (process.env.DATABASE_TLS_MODE as DatabaseTlsMode) ||
    (isProduction ? "VERIFY_CA" : "DISABLED");

  // If DB_SSL or PGSSLMODE specifies requirement
  const dbSslEnv = process.env.DB_SSL?.toLowerCase();
  const pgSslMode = process.env.PGSSLMODE?.toLowerCase();
  if (dbSslEnv === "true" || pgSslMode === "verify-ca" || pgSslMode === "verify-full" || pgSslMode === "require") {
    if (mode === "DISABLED" && isProduction) {
      mode = "VERIFY_CA";
    }
  }

  // Production Security Validation
  if (isProduction) {
    if (mode === "DISABLED") {
      throw new SecurityConfigurationError(
        "Production PostgreSQL requires verified TLS transport (DATABASE_TLS_MODE must be VERIFY_CA or VERIFY_FULL). Plaintext database connections are forbidden in production.",
        TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN,
      );
    }
    if (options.rejectUnauthorized === false) {
      throw new SecurityConfigurationError(
        "Production PostgreSQL requires verified certificates: rejectUnauthorized: false is forbidden.",
        TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN,
      );
    }
  }

  // Development / Disabled mode
  if (mode === "DISABLED") {
    return false;
  }

  // Load CA certificate if provided
  let caContent = options.ca;
  const caFile = options.caFile || process.env.DATABASE_CA_FILE || process.env.PGSSLROOTCERT;
  if (!caContent && caFile) {
    try {
      caContent = readFileSync(caFile, "utf8");
    } catch (err: any) {
      throw new SecurityConfigurationError(
        `Failed to read PostgreSQL CA certificate file from '${caFile}': ${err.message}`,
        TlsErrorCode.UNTRUSTED_CA,
      );
    }
  } else if (!caContent && process.env.DATABASE_CA) {
    caContent = process.env.DATABASE_CA;
  }

  // Load Client certificate & key if mTLS configured
  let certContent = options.cert;
  const certFile = options.certFile || process.env.DATABASE_CERT_FILE || process.env.PGSSLCERT;
  if (!certContent && certFile) {
    try {
      certContent = readFileSync(certFile, "utf8");
    } catch (err: any) {
      throw new SecurityConfigurationError(
        `Failed to read PostgreSQL client certificate file from '${certFile}': ${err.message}`,
        TlsErrorCode.CLIENT_CERTIFICATE_REJECTED,
      );
    }
  } else if (!certContent && process.env.DATABASE_CERT) {
    certContent = process.env.DATABASE_CERT;
  }

  let keyContent = options.key;
  const keyFile = options.keyFile || process.env.DATABASE_KEY_FILE || process.env.PGSSLKEY;
  if (!keyContent && keyFile) {
    try {
      keyContent = readFileSync(keyFile, "utf8");
    } catch (err: any) {
      throw new SecurityConfigurationError(
        `Failed to read PostgreSQL client private key file from '${keyFile}': ${err.message}`,
        TlsErrorCode.CLIENT_CERTIFICATE_REJECTED,
      );
    }
  } else if (!keyContent && process.env.DATABASE_KEY) {
    keyContent = process.env.DATABASE_KEY;
  }

  const sslConfig: ConnectionOptions = {
    rejectUnauthorized: true,
    minVersion: "TLSv1.2",
  };

  if (caContent) {
    sslConfig.ca = caContent;
  }
  if (certContent) {
    sslConfig.cert = certContent;
  }
  if (keyContent) {
    sslConfig.key = keyContent;
  }
  if (options.servername) {
    sslConfig.servername = options.servername;
  }

  return sslConfig;
}

/**
 * Validates database security configuration at startup.
 * Throws SecurityConfigurationError if requirements are violated without logging sensitive secrets.
 */
export function validateDatabaseSecurityConfiguration(config: {
  isProduction?: boolean;
  ssl?: any;
  databaseUrl?: string;
  host?: string;
}): void {
  const isProduction = config.isProduction !== undefined
    ? config.isProduction
    : process.env.NODE_ENV === "production";

  if (!isProduction) return;

  if (config.ssl === false || !config.ssl) {
    throw new SecurityConfigurationError(
      "Database security validation failed: TLS is disabled in production environment.",
      TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN,
    );
  }

  if (typeof config.ssl === "object" && config.ssl.rejectUnauthorized === false) {
    throw new SecurityConfigurationError(
      "Database security validation failed: rejectUnauthorized is false in production environment.",
      TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN,
    );
  }
}
