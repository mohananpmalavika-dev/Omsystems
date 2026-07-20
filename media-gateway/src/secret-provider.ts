import type { StreamSecretProvider } from "./contracts.js";

export class EnvironmentSecretProvider implements StreamSecretProvider {
  private readonly secrets: Readonly<Record<string, string>>;

  constructor(json: string) {
    const parsed = JSON.parse(json) as unknown;
    if (!isStringRecord(parsed)) {
      throw new Error("STREAM_SECRETS_JSON must be a string-to-string object");
    }
    for (const value of Object.values(parsed)) {
      const protocol = new URL(value).protocol;
      if (protocol !== "rtsp:" && protocol !== "rtsps:") {
        throw new Error("Stream secrets must contain RTSP or RTSPS URLs");
      }
    }
    this.secrets = Object.freeze(parsed);
  }

  async resolve(reference: string) {
    return this.secrets[reference];
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string");
}
