#!/usr/bin/env node

import { readFile } from "node:fs/promises";
import dotenv from "dotenv";

const rootEnvironment = dotenv.parse(await readFile(new URL("../.env", import.meta.url)));
const dashboardEnvironment = dotenv.parse(await readFile(new URL("../dashboard/.env.local", import.meta.url)));
const baseUrl = process.argv[2] || dashboardEnvironment.CONTROL_PLANE_INTERNAL_URL ||
  rootEnvironment.CONTROL_PLANE_PUBLIC_URL;

if (!baseUrl) throw new Error("control_plane_url_unavailable");

const headers = {
  "x-user-id": dashboardEnvironment.DASHBOARD_DEV_USER_ID || "user-global-admin",
  ...(rootEnvironment.EDGE_BRIDGE_SHARED_KEY
    ? { "x-edge-bridge-key": rootEnvironment.EDGE_BRIDGE_SHARED_KEY }
    : {}),
};

const branches = await getJson("/v1/branches?action=device%3Aconfigure");
const report = await Promise.all((branches.data ?? []).map(async (branch) => {
  const [cameraResponse, agentResponse] = await Promise.all([
    getJson(`/v1/branches/${encodeURIComponent(branch.id)}/cameras`),
    getJson(`/v1/branches/${encodeURIComponent(branch.id)}/edge-agents`),
  ]);
  const agents = (agentResponse.data ?? []).map((agent) => ({
    id: agent.id,
    name: agent.name,
    status: agent.status,
    lastSeenAt: agent.lastSeenAt ?? null,
    publicMediaOrigin: safeOrigin(agent.publicMediaUrl),
    localMediaOrigin: safeOrigin(agent.localMediaUrl),
  }));
  const cameras = cameraResponse.data ?? [];

  return {
    branchId: branch.id,
    branchName: branch.name,
    cameraCount: cameras.length,
    camerasByStatus: Object.groupBy(cameras, (camera) => camera.status ?? "unknown"),
    cameraAssignments: Object.groupBy(cameras, (camera) => camera.edgeAgentId ?? "unassigned"),
    agents,
  };
}));

console.log(JSON.stringify({
  controlPlaneOrigin: new URL(baseUrl).origin,
  branches: report.map((branch) => ({
    ...branch,
    camerasByStatus: countGroups(branch.camerasByStatus),
    cameraAssignments: countGroups(branch.cameraAssignments),
  })),
}, null, 2));

async function getJson(path) {
  const response = await fetch(new URL(path, baseUrl), {
    headers,
    signal: AbortSignal.timeout(15_000),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(`${path}: ${response.status} ${body.error ?? "request_failed"}`);
  }
  return body;
}

function safeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(value).origin;
  } catch {
    return "invalid_url";
  }
}

function countGroups(groups) {
  return Object.fromEntries(Object.entries(groups).map(([key, values]) => [key, values.length]));
}
