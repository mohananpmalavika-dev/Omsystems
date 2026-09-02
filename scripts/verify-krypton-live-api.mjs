#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import dotenv from "dotenv";

const rootEnvironment = dotenv.parse(await readFile(new URL("../.env", import.meta.url)));
const dashboardEnvironment = dotenv.parse(await readFile(new URL("../dashboard/.env.local", import.meta.url)));
const baseUrl = process.argv[2] || dashboardEnvironment.CONTROL_PLANE_INTERNAL_URL ||
  rootEnvironment.CONTROL_PLANE_PUBLIC_URL;

if (!baseUrl) throw new Error("control_plane_url_unavailable");

const headers = {
  "content-type": "application/json",
  "x-user-id": dashboardEnvironment.DASHBOARD_DEV_USER_ID || "user-global-admin",
  ...(rootEnvironment.EDGE_BRIDGE_SHARED_KEY
    ? { "x-edge-bridge-key": rootEnvironment.EDGE_BRIDGE_SHARED_KEY }
    : {}),
};

const branches = await getJson("/v1/branches?action=live%3Aview");
const branch = (branches.data ?? []).find((item) => item.name === "Krypton Headquarters & SOC");
if (!branch) throw new Error("krypton_branch_not_found");

const cameraResponse = await getJson(`/v1/branches/${encodeURIComponent(branch.id)}/cameras`);
const cameras = (cameraResponse.data ?? [])
  .filter((camera) => camera.edgeAgentId)
  .sort((left, right) => statusPriority(left.status) - statusPriority(right.status));
if (cameras.length === 0) throw new Error("krypton_camera_unavailable");

const attempts = [];
for (const camera of cameras.slice(0, 3)) {
  try {
    const permission = await requestJson(
      `/v1/cameras/${encodeURIComponent(camera.id)}/live-sessions`,
      { method: "POST", body: "{}" },
    );
    if (!permission.token) throw new Error("live_token_missing");

    const gatewayOrigin = selectGatewayOrigin(permission);
    const startResponse = await fetch(new URL("/v1/live/start", gatewayOrigin), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ controlPlaneToken: permission.token }),
      signal: AbortSignal.timeout(30_000),
    });
    const live = await startResponse.json().catch(() => ({}));
    if (!startResponse.ok) {
      throw new Error(typeof live.error === "string" ? live.error : `live_start_${startResponse.status}`);
    }
    if (!live.hls?.url || !live.hls?.bearerToken) throw new Error("hls_credentials_missing");

    const playlistUrl = new URL(live.hls.url);
    if (isPrivateHostname(new URL(gatewayOrigin).hostname)) {
      playlistUrl.protocol = new URL(gatewayOrigin).protocol;
      playlistUrl.host = new URL(gatewayOrigin).host;
    }
    playlistUrl.searchParams.set("token", live.hls.bearerToken);
    const playlistResponse = await fetch(playlistUrl, {
      signal: AbortSignal.timeout(30_000),
    });
    const playlist = await playlistResponse.text();
    if (!playlistResponse.ok) throw new Error(`hls_playlist_${playlistResponse.status}`);
    if (!playlist.includes("#EXTM3U")) throw new Error("invalid_hls_playlist");

    console.log(JSON.stringify({
      success: true,
      branch: branch.name,
      camera: { id: camera.id, name: camera.name, status: camera.status },
      gatewayOrigin: new URL(gatewayOrigin).origin,
      liveStartStatus: startResponse.status,
      playlistStatus: playlistResponse.status,
      contentType: playlistResponse.headers.get("content-type"),
    }, null, 2));
    process.exit(0);
  } catch (error) {
    attempts.push({
      camera: { id: camera.id, name: camera.name, status: camera.status },
      error: error instanceof Error ? error.message : String(error),
    });
  }
}

console.error(JSON.stringify({
  success: false,
  branch: branch.name,
  attempts,
}, null, 2));
process.exit(1);

async function getJson(path) {
  return await requestJson(path);
}

async function requestJson(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { ...headers, ...init.headers },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${body.error ?? "request_failed"}`);
  }
  return body;
}

function selectGatewayOrigin(permission) {
  const candidates = [permission.localMediaGatewayUrl, permission.mediaGatewayUrl]
    .filter(Boolean);
  const local = candidates.find((value) => {
    try { return isPrivateHostname(new URL(value).hostname); } catch { return false; }
  });
  const selected = local ?? candidates[0];
  if (!selected) throw new Error("media_gateway_url_missing");
  return new URL(selected).origin;
}

function statusPriority(status) {
  return status === "online" ? 0 : status === "degraded" ? 1 : 2;
}

function isPrivateHostname(hostname) {
  if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1") return true;
  const parts = hostname.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part))) return false;
  const [first, second] = parts;
  return first === 10 || first === 127 ||
    (first === 172 && second >= 16 && second <= 31) ||
    (first === 192 && second === 168);
}
