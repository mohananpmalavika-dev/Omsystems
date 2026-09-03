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

const activation = await requestJson("/v1/analytics/enable-all-fleet-cameras", {
  method: "POST",
  body: "{}",
});

const branches = await requestJson("/v1/branches?action=analytics%3Aconfigure");
const cameraRows = (await Promise.all((branches.data ?? []).map(async (branch) => {
  const response = await requestJson(`/v1/branches/${encodeURIComponent(branch.id)}/cameras`);
  return (response.data ?? []).map((camera) => ({
    branchId: branch.id,
    branchName: branch.name,
    cameraId: camera.id,
    cameraName: camera.name || camera.model || "Unnamed camera",
  }));
}))).flat();

const verification = await Promise.all(cameraRows.map(async (camera) => {
  const response = await requestJson(`/v1/cameras/${encodeURIComponent(camera.cameraId)}/analytics/rules`);
  const rules = response.data ?? [];
  return {
    ...camera,
    enabledRuleCount: rules.filter((rule) => rule.enabled).length,
    configuredRuleCount: rules.length,
  };
}));

const missing = verification.filter((camera) => camera.enabledRuleCount === 0);
const engineResponse = await requestWithStatus("/v1/analytics/engine-health");
const engine = engineResponse.body;
console.log(JSON.stringify({
  controlPlaneOrigin: new URL(baseUrl).origin,
  activation: {
    success: activation.success === true,
    branchCount: activation.branchCount ?? 0,
    cameraCount: activation.cameraCount ?? 0,
    capabilityCount: activation.capabilityCount ?? 0,
    created: activation.created ?? 0,
    reEnabled: activation.enabled ?? 0,
    unchanged: activation.unchanged ?? 0,
  },
  verification: {
    cameraCount: verification.length,
    camerasWithAiEnabled: verification.length - missing.length,
    camerasWithoutAiEnabled: missing.length,
    enabledRuleCount: verification.reduce((sum, camera) => sum + camera.enabledRuleCount, 0),
    missing,
  },
  engine: {
    httpStatus: engineResponse.status,
    status: engine.status ?? "unknown",
    aiState: engine.aiState ?? "AI_UNAVAILABLE",
    initialized: engine.pipeline?.initialized === true,
    modelsReady: engine.pipeline?.models?.ready === true,
    initializationError: engine.initializationError ?? null,
    activeStreams: engine.streams?.active ?? 0,
    streamStats: engine.streams?.stats ?? null,
  },
}, null, 2));

async function requestJson(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { ...headers, ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${body.error ?? body.message ?? "request_failed"}`);
  }
  return body;
}

async function requestWithStatus(path, init = {}) {
  const response = await fetch(new URL(path, baseUrl), {
    ...init,
    headers: { ...headers, ...init.headers },
    signal: AbortSignal.timeout(30_000),
  });
  return {
    status: response.status,
    body: await response.json().catch(() => ({})),
  };
}
