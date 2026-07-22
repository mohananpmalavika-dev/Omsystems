import type { StreamSecretProvider } from "./contracts.js";

export class EnvironmentSecretProvider implements StreamSecretProvider {
  private readonly secrets: Readonly<Record<string, string>>;

  constructor(json: string) {
    const parsed = JSON.parse(json) as unknown;
    if (!isStringRecord(parsed)) {
      throw new Error("STREAM_SECRETS_JSON must be a string-to-string object");
    }
    const allowedProtocols = new Set(["rtsp:", "rtsps:", "http:", "https:"]);
    for (const value of Object.values(parsed)) {
      const protocol = new URL(value).protocol;
      if (!allowedProtocols.has(protocol)) {
        throw new Error(
          "Stream secrets must contain RTSP, RTSPS, HTTP, or HTTPS URLs",
        );
      }
    }
    this.secrets = Object.freeze(parsed);
  }

  async resolve(reference: string) {
    return this.secrets[reference];
  }
}

export class HttpStreamSecretProvider implements StreamSecretProvider {
  constructor(
    private readonly baseUrl: string,
    private readonly sharedKey: string,
  ) {}

  async resolve(reference: string) {
    const url = new URL("/v1/secrets/resolve", this.baseUrl);
    url.searchParams.set("ref", reference);
    const response = await fetch(url, {
      headers: { "x-edge-media-key": this.sharedKey },
      cache: "no-store",
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Edge secret provider returned ${response.status}`);
    const body = await response.json() as { sourceUri?: unknown };
    return typeof body.sourceUri === "string" ? body.sourceUri : undefined;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string");
}
