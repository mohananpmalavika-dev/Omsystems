import { ConfigurationErrorCode } from "./config-types.js";

export interface ConfigurationErrorDetails {
  key?: string;
  reason: string;
  code?: ConfigurationErrorCode;
  endpoint?: string;
}

export class ProductionConfigurationError extends Error {
  public readonly code: ConfigurationErrorCode;
  public readonly key?: string;
  public readonly endpoint?: string;

  constructor(details: ConfigurationErrorDetails | string) {
    const message = typeof details === "string" ? details : `[${details.code || ConfigurationErrorCode.REQUIRED_CONFIG_MISSING}] ${details.key ? `${details.key}: ` : ""}${details.reason}`;
    super(message);
    this.name = "ProductionConfigurationError";
    if (typeof details === "object") {
      this.code = details.code || ConfigurationErrorCode.REQUIRED_CONFIG_MISSING;
      this.key = details.key;
      this.endpoint = details.endpoint;
    } else {
      this.code = ConfigurationErrorCode.REQUIRED_CONFIG_MISSING;
    }
  }
}
