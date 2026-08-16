import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore } from "../control-plane-store.js";
import { VirtualGuardSchedulerService } from "../services/virtual-guard-scheduler.service.js";

export async function registerVirtualGuardRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  const service = new VirtualGuardSchedulerService(store);

  // Get current arming status and schedule for a branch
  app.get("/v1/operations/virtual-guard/:branchId", async (request) => {
    const { branchId } = request.params as { branchId: string };
    const config = service.getBranchConfig(branchId);
    const isArmed = service.isCurrentlyArmed(branchId);
    return { success: true, data: { ...config, currentlyArmed: isArmed } };
  });

  // Update schedule or arming toggle
  app.put("/v1/operations/virtual-guard/:branchId", async (request) => {
    const { branchId } = request.params as { branchId: string };
    const body = request.body as any;
    const config = { ...service.getBranchConfig(branchId), ...body, branchId };
    service.setBranchConfig(config);
    return { success: true, message: "Virtual Guard configuration updated.", data: config };
  });

  // Test Auto-Talkdown speaker broadcast
  app.post("/v1/operations/virtual-guard/:branchId/test-talkdown", async (request) => {
    const { branchId } = request.params as { branchId: string };
    const body = (request.body as any) || {};
    const result = await service.triggerNightIntrusionEvent(
      branchId,
      body.cameraId || "cam-1",
      body.detectionType || "AFTER_HOURS_HUMAN_INTRUSION",
    );
    return {
      success: true,
      message: "Test Virtual Guard Talkdown event executed.",
      data: result,
    };
  });
}
