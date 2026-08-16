import type { LiveSessionResponse } from "@/lib/types";

interface BrowserDirectLiveStart {
  cameraId: string;
  direct: {
    url: string;
    controlPlaneToken: string;
  };
}

export async function startLiveFromBrowser(
  cameraId: string,
  profile: "main" | "sub" = "sub",
): Promise<LiveSessionResponse> {
  const token = typeof window !== "undefined" ? localStorage.getItem("accessToken") : null;
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (token) {
    headers["x-sentinel-session"] = token;
    headers["authorization"] = `Bearer ${token}`;
  }

  const authorization = await fetch("/api/live", {
    method: "POST",
    headers,
    credentials: "include",
    body: JSON.stringify({ cameraId, profile }),
  });
  const body = await readJson(authorization);
  if (!authorization.ok) throw new Error(errorCode(body, "live_session_unavailable"));
  if (!isBrowserDirectLiveStart(body)) return body as LiveSessionResponse;

  const localResponse = await fetch(body.direct.url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: body.direct.controlPlaneToken }),
    cache: "no-store",
  });
  const localBody = await readJson(localResponse);
  if (!localResponse.ok) throw new Error(errorCode(localBody, "local_media_gateway_unavailable"));
  return localBody as LiveSessionResponse;
}

function isBrowserDirectLiveStart(value: unknown): value is BrowserDirectLiveStart {
  if (!value || typeof value !== "object") return false;
  const direct = Reflect.get(value, "direct");
  return Boolean(direct && typeof direct === "object" &&
    typeof Reflect.get(direct, "url") === "string" &&
    typeof Reflect.get(direct, "controlPlaneToken") === "string");
}

async function readJson(response: Response): Promise<unknown> {
  return await response.json().catch(() => ({}));
}

function errorCode(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = Reflect.get(value, "error");
  return typeof error === "string" ? error : fallback;
}
