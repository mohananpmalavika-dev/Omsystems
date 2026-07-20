import type {
  ConsumedSession,
  ControlPlaneClient,
} from "./contracts.js";

export class HttpControlPlaneClient implements ControlPlaneClient {
  constructor(
    private readonly baseUrl: string,
    private readonly sharedKey: string,
  ) {}

  async consumeLiveSession(token: string): Promise<ConsumedSession> {
    const response = await fetch(
      new URL("/internal/live-sessions/consume", this.baseUrl),
      {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-media-gateway-key": this.sharedKey,
        },
        body: JSON.stringify({ token }),
      },
    );
    if (!response.ok) {
      throw new GatewayError(
        response.status === 401 ? 401 : 502,
        response.status === 401
          ? "invalid_live_session"
          : "control_plane_unavailable",
      );
    }
    return await response.json() as ConsumedSession;
  }
}

export class GatewayError extends Error {
  constructor(
    readonly statusCode: number,
    readonly code: string,
  ) {
    super(code);
  }
}
