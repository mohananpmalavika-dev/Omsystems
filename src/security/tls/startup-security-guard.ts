/**
 * Global TLS Startup Security Guard
 * 
 * Verifies that dangerous global bypasses like NODE_TLS_REJECT_UNAUTHORIZED=0
 * are never active in production runtime environments.
 */

import { SecurityConfigurationError } from "../../../packages/contracts/src/security/tls/tls-errors.js";
import { TlsErrorCode } from "../../../packages/contracts/src/security/tls/tls-types.js";

export function validateGlobalTlsConfiguration(isProduction = process.env.NODE_ENV === "production"): void {
  const globalBypass = process.env.NODE_TLS_REJECT_UNAUTHORIZED;

  if (isProduction && globalBypass === "0") {
    throw new SecurityConfigurationError(
      "Global TLS certificate verification bypass (NODE_TLS_REJECT_UNAUTHORIZED=0) is strictly forbidden in production.",
      TlsErrorCode.INSECURE_OVERRIDE_FORBIDDEN,
    );
  }
}
