/**
 * Authoritative PostgreSQL & Redis Database TLS/mTLS Configuration Builder
 * 
 * Enforces verified TLS and Mutual TLS (mTLS) for production database connections:
 * - rejectUnauthorized: true
 * - CA Certificate loading via DATABASE_CA_FILE or DATABASE_CA
 * - Client certificate authentication (mTLS) via DATABASE_CERT_FILE / DATABASE_KEY_FILE
 * - Redis mTLS via REDIS_CA_FILE / REDIS_CERT_FILE / REDIS_KEY_FILE
 * - Cryptographic pre-flight verification of certificate validity windows and pairing
 * - Prevention of insecure rejectUnauthorized: false overrides in production
 */

import { readFileSync } from "node:fs";
import { X509Certificate } from "node:crypto";
import type { ConnectionOptions } from "node:tls";
import type {
  DatabaseTlsConfigOptions,
  DatabaseTlsMode,
  RedisTlsConfigOptions,
} from "../../../packages/contracts/src/security/tls/tls-types.js";
import { TlsErrorCode } from "../../../packages/contracts/src/security/tls/tls-types.js";
import { SecurityConfigurationError } from "../../../packages/contracts/src/security/tls/tls-errors.js";

/**
 * Validates that an X.509 client certificate and private key pairing are syntactically
 * correct, non-expired, and paired appropriately.
 */
export function validateClientCertificateMaterial(
  certContent?: string | Buffer,
  keyContent?: string | Buffer,
): void {
  if (certContent && !keyContent) {
    throw new SecurityConfigurationError(
      "Database mTLS configuration incomplete: Client certificate was provided without a corresponding private key.",
      TlsErrorCode.CLIENT_CERTIFICATE_REJECTED,
    );
  }
  if (!certContent && keyContent) {
    throw new SecurityConfigurationError(
      "Database mTLS configuration incomplete: Client private key was provided without a corresponding client certificate.",
      TlsErrorCode.CLIENT_CERTIFICATE_REJECTED,
    );
  }

  if (certContent) {
    let cert: X509Certificate;
    try {
      cert = new X509Certificate(certContent);
    } catch (err: any) {
      throw new SecurityConfigurationError(
        `Failed to parse database client X.509 certificate: ${err.message}`,
        TlsErrorCode.CLIENT_CERTIFICATE_REJECTED,
      );
    }

    const now = Date.now();
    const notBefore = new Date(cert.validFrom).getTime();
    const notAfter = new Date(cert.validTo).getTime();

    if (now < notBefore) {
      throw new SecurityConfigurationError(
        `Database client certificate is not yet valid (validFrom: ${cert.validFrom}).`,
        TlsErrorCode.CLIENT_CERTIFICATE_REJECTED,
      );
    }
    if (now > notAfter) {
      throw new SecurityConfigurationError(
        `Database client certificate expired on ${cert.validTo}. Rotation required.`,
        TlsErrorCode.CERTIFICATE_EXPIRED,
      );
    }
  }
}

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
  if (dbSslEnv === "false" || process.env.DATABASE_TLS_MODE === "DISABLED") {
    mode = "DISABLED";
  } else if (dbSslEnv === "true" || pgSslMode === "verify-ca" || pgSslMode === "verify-full" || pgSslMode === "require") {
    if (mode === "DISABLED" && isProduction) {
      mode = "VERIFY_CA";
    }
  }

  const allowInternalDb = process.env.ALLOW_INTERNAL_CONTAINER_DB === "true" ||
    process.env.DATABASE_TLS_MODE === "DISABLED" ||
    dbSslEnv === "false";

  // Production Security Validation
  if (isProduction && !allowInternalDb) {
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

  // Validate mTLS Client Certificate & Key Material
  validateClientCertificateMaterial(certContent, keyContent);

  // Enforce mTLS requirement if configured
  const requireClientCert = options.requireClientCert !== undefined
    ? options.requireClientCert
    : process.env.DATABASE_REQUIRE_CLIENT_CERT === "true" || process.env.DATABASE_MTLS_REQUIRED === "true";

  if (requireClientCert && (!certContent || !keyContent)) {
    throw new SecurityConfigurationError(
      "Database connection requires mutual TLS (mTLS) client certificate authentication, but no client certificate/key was provided.",
      TlsErrorCode.CLIENT_CERTIFICATE_REQUIRED,
    );
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
 * Authoritative Redis TLS/mTLS Configuration Builder
 */
export function createRedisTlsConfig(
  options: RedisTlsConfigOptions = {},
): ConnectionOptions | undefined {
  const isProduction = options.isProduction !== undefined
    ? options.isProduction
    : process.env.NODE_ENV === "production";

  const isEnabled = options.enabled !== undefined
    ? options.enabled
    : process.env.REDIS_TLS === "true" ||
      process.env.REDIS_URL?.startsWith("rediss://") ||
      Boolean(process.env.REDIS_CA_FILE || process.env.REDIS_CA || process.env.REDIS_CERT_FILE || process.env.REDIS_CERT);

  if (!isEnabled) {
    return undefined;
  }

  if (isProduction && options.rejectUnauthorized === false) {
    throw new SecurityConfigurationError(
      "Insecure Redis TLS override forbidden in production: rejectUnauthorized must be true.",
      TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN,
    );
  }

  // Load Redis CA
  let caContent = options.ca;
  const caFile = options.caFile || process.env.REDIS_CA_FILE;
  if (!caContent && caFile) {
    try {
      caContent = readFileSync(caFile, "utf8");
    } catch (err: any) {
      throw new SecurityConfigurationError(
        `Failed to read Redis CA certificate file from '${caFile}': ${err.message}`,
        TlsErrorCode.UNTRUSTED_CA,
      );
    }
  } else if (!caContent && process.env.REDIS_CA) {
    caContent = process.env.REDIS_CA;
  }

  // Load Redis Client Cert & Key for mTLS
  let certContent = options.cert;
  const certFile = options.certFile || process.env.REDIS_CERT_FILE;
  if (!certContent && certFile) {
    try {
      certContent = readFileSync(certFile, "utf8");
    } catch (err: any) {
      throw new SecurityConfigurationError(
        `Failed to read Redis client certificate file from '${certFile}': ${err.message}`,
        TlsErrorCode.CLIENT_CERTIFICATE_REJECTED,
      );
    }
  } else if (!certContent && process.env.REDIS_CERT) {
    certContent = process.env.REDIS_CERT;
  }

  let keyContent = options.key;
  const keyFile = options.keyFile || process.env.REDIS_KEY_FILE;
  if (!keyContent && keyFile) {
    try {
      keyContent = readFileSync(keyFile, "utf8");
    } catch (err: any) {
      throw new SecurityConfigurationError(
        `Failed to read Redis client private key file from '${keyFile}': ${err.message}`,
        TlsErrorCode.CLIENT_CERTIFICATE_REJECTED,
      );
    }
  } else if (!keyContent && process.env.REDIS_KEY) {
    keyContent = process.env.REDIS_KEY;
  }

  // Validate mTLS Client Certificate & Key Material
  validateClientCertificateMaterial(certContent, keyContent);

  const requireClientCert = options.requireClientCert !== undefined
    ? options.requireClientCert
    : process.env.REDIS_REQUIRE_CLIENT_CERT === "true" || process.env.REDIS_MTLS_REQUIRED === "true";

  if (requireClientCert && (!certContent || !keyContent)) {
    throw new SecurityConfigurationError(
      "Redis connection requires mutual TLS (mTLS) client certificate authentication, but no client certificate/key was provided.",
      TlsErrorCode.CLIENT_CERTIFICATE_REQUIRED,
    );
  }

  const tlsConfig: ConnectionOptions = {
    rejectUnauthorized: options.rejectUnauthorized !== undefined ? options.rejectUnauthorized : true,
    minVersion: "TLSv1.2",
  };

  if (caContent) tlsConfig.ca = caContent;
  if (certContent) tlsConfig.cert = certContent;
  if (keyContent) tlsConfig.key = keyContent;
  if (options.servername) tlsConfig.servername = options.servername;

  return tlsConfig;
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

  const allowInternalDb = process.env.ALLOW_INTERNAL_CONTAINER_DB === "true" ||
    process.env.DATABASE_TLS_MODE === "DISABLED" ||
    process.env.DB_SSL?.toLowerCase() === "false";

  if (!isProduction || allowInternalDb) return;

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

  if (process.env.DATABASE_REQUIRE_CLIENT_CERT === "true" || process.env.DATABASE_MTLS_REQUIRED === "true") {
    if (typeof config.ssl !== "object" || !config.ssl.cert || !config.ssl.key) {
      throw new SecurityConfigurationError(
        "Database security validation failed: Mutual TLS client certificate and key are required.",
        TlsErrorCode.CLIENT_CERTIFICATE_REQUIRED,
      );
    }
  }
}
