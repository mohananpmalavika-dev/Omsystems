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
    return Object.hasOwn(this.secrets, reference) ? this.secrets[reference] : undefined;
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
      signal: AbortSignal.timeout(15_000),
      redirect: "error",
    });
    if (response.status === 404) return undefined;
    if (!response.ok) throw new Error(`Edge secret provider returned ${response.status}`);
    const body = await response.json() as { sourceUri?: unknown };
    if (typeof body.sourceUri !== "string") return undefined;
    if (!["rtsp:", "rtsps:", "http:", "https:"].includes(new URL(body.sourceUri).protocol)) {
      throw new Error("Edge secret provider returned an unsupported media protocol");
    }
    return body.sourceUri;
  }
}

function isStringRecord(value: unknown): value is Record<string, string> {
  return typeof value === "object" && value !== null && !Array.isArray(value) &&
    Object.values(value).every((item) => typeof item === "string");
}
