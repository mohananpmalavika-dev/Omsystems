import type { TalkSessionResponse } from "@/lib/types";

interface BrowserDirectTalkStart {
  cameraId: string;
  direct: { url: string; controlPlaneToken: string };
}

export async function startTalkFromBrowser(cameraId: string): Promise<TalkSessionResponse> {
  const authorization = await fetch("/api/talk", {
    method: "POST", headers: { "content-type": "application/json" }, credentials: "include",
    body: JSON.stringify({ cameraId }),
  });
  const body = await readJson(authorization);
  if (!authorization.ok) throw new Error(errorCode(body, "talkback_unavailable"));
  if (!isBrowserDirectTalkStart(body)) return body as TalkSessionResponse;
  const local = await fetch(body.direct.url, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify({ controlPlaneToken: body.direct.controlPlaneToken }), cache: "no-store",
  });
  const localBody = await readJson(local);
  if (!local.ok) throw new Error(errorCode(localBody, "local_talkback_gateway_unavailable"));
  return localBody as TalkSessionResponse;
}

export async function sendTalkAudio(session: TalkSessionResponse, pcm16le: ArrayBuffer) {
  const response = await fetch(session.audio.url, {
    method: "POST",
    headers: {
      authorization: `Bearer ${session.audio.bearerToken}`,
      "content-type": session.audio.contentType,
    },
    body: pcm16le,
    cache: "no-store",
  });
  if (!response.ok) throw new Error(errorCode(await readJson(response), "talkback_upload_failed"));
}

export async function stopTalk(session: TalkSessionResponse) {
  const response = await fetch(session.audio.endUrl, {
    method: "DELETE", headers: { authorization: `Bearer ${session.audio.bearerToken}` }, cache: "no-store",
  });
  if (!response.ok && response.status !== 404 && response.status !== 410) {
    throw new Error(errorCode(await readJson(response), "talkback_stop_failed"));
  }
}

function isBrowserDirectTalkStart(value: unknown): value is BrowserDirectTalkStart {
  if (!value || typeof value !== "object") return false;
  const direct = Reflect.get(value, "direct");
  return Boolean(direct && typeof direct === "object" &&
    typeof Reflect.get(direct, "url") === "string" &&
    typeof Reflect.get(direct, "controlPlaneToken") === "string");
}

async function readJson(response: Response): Promise<unknown> { return await response.json().catch(() => ({})); }
function errorCode(value: unknown, fallback: string) {
  if (!value || typeof value !== "object") return fallback;
  const error = Reflect.get(value, "error");
  return typeof error === "string" ? error : fallback;
}
