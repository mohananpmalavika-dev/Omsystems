import type { ControlPlaneStore } from "../control-plane-store.js";
import type { Camera, EdgeAgent, EdgeCommand } from "../domain/models.js";
import { edgeAgentServesBranch } from "../edge-agent/branch-assignments.js";

export async function requestCameraRecovery(store: ControlPlaneStore, cameras: Camera[], requestedBy: string) {
  const commands: EdgeCommand[] = [];
  const skipped: Array<{ cameraId: string; error: string; message: string }> = [];
  const agents = new Map<string, EdgeAgent | undefined>();
  const pending = new Map<string, EdgeCommand[]>();
  for (const camera of cameras) {
    if (!camera.edgeAgentId) {
      skipped.push({ cameraId: camera.id, error: "camera_recovery_requires_edge_agent", message: `Assign ${camera.name} to a Branch Gateway before reconnecting it.` });
      continue;
    }
    if (!agents.has(camera.edgeAgentId)) agents.set(camera.edgeAgentId, await store.getEdgeAgent(camera.edgeAgentId));
    const agent = agents.get(camera.edgeAgentId);
    const seenAt = Date.parse(agent?.lastSeenAt ?? "");
    if (!agent || !edgeAgentServesBranch(agent, camera.branchId) || agent.status !== "online" ||
        !Number.isFinite(seenAt) || Date.now() - seenAt > 90_000) {
      skipped.push({ cameraId: camera.id, error: "edge_agent_not_connected", message: `The Branch Gateway for ${camera.name} is offline or its heartbeat is stale. Reconnect the gateway first.` });
      continue;
    }
    if (!pending.has(camera.branchId)) pending.set(camera.branchId, await store.listEdgeCommands(camera.branchId, 500));
    const existing = pending.get(camera.branchId)!.find(command => command.type === "recover-camera" &&
      command.edgeAgentId === agent.id && command.payload.cameraId === camera.id &&
      (command.status === "queued" || command.status === "running"));
    const command = existing ?? await store.createEdgeCommand({
      edgeAgentId: agent.id, type: "recover-camera", payload: { cameraId: camera.id, branchId: camera.branchId }, requestedBy,
    });
    if (!existing) pending.get(camera.branchId)!.push(command);
    commands.push(command);
  }
  return {
    queuedCount: commands.length,
    cameraIds: commands.map(command => String(command.payload.cameraId)),
    commands: commands.map(command => ({ id: command.id, cameraId: String(command.payload.cameraId), status: command.status })),
    skipped,
  };
}
