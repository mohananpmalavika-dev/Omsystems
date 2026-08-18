import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { AssetLifecycleService } from "../services/asset-lifecycle.service.js";

const assetService = new AssetLifecycleService();

export async function registerAssetLifecycleRoutes(app: FastifyInstance) {
  // 1. List Logical Devices (e.g. REC-BR118-01)
  app.get("/v1/assets/logical-devices", async (req: FastifyRequest) => {
    const branchId = (req.query as any)?.branchId;
    return { success: true, data: assetService.listLogicalDevices(branchId) };
  });

  // 2. List Physical Assets (serial numbers, warranty, lifecycle statuses)
  app.get("/v1/assets/physical-inventory", async (req: FastifyRequest) => {
    const query = req.query as any;
    return { success: true, data: assetService.listPhysicalAssets(query) };
  });

  // 3. List Regional Spare Stock Pools with min stock alerts
  app.get("/v1/assets/spares", async (req: FastifyRequest) => {
    const regionId = (req.query as any)?.regionId;
    return { success: true, data: assetService.listSpares(regionId) };
  });

  // 4. List Replacement Transactions (Sagas)
  app.get("/v1/assets/replacements", async (req: FastifyRequest) => {
    const branchId = (req.query as any)?.branchId;
    return { success: true, data: assetService.listReplacements(branchId) };
  });

  // 5. Execute 10-Step Transactional Replacement
  app.post("/v1/assets/replacements/execute", async (req: FastifyRequest, reply: FastifyReply) => {
    const body = z
      .object({
        logicalDeviceId: z.string(),
        newAssetId: z.string(),
        replacementType: z.enum(["FAILURE", "UPGRADE", "WARRANTY", "PREVENTIVE", "DAMAGE", "OTHER"]),
        performedBy: z.string().default("Field Engineer E017"),
        workOrderId: z.string().optional(),
        oldAssetDisposition: z.enum(["RETIRED", "RMA", "REPAIR_DEPOT"]).optional(),
      })
      .parse(req.body);

    try {
      const transaction = await assetService.executeReplacementTransaction(body as any);
      return {
        success: true,
        message: `Device successfully replaced. Channel mappings preserved and Digital Twin updated.`,
        data: transaction,
      };
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message });
    }
  });

  // 6. Get Hardware Lineage History for a Logical Device position
  app.get("/v1/assets/lineage/:logicalDeviceId", async (req: FastifyRequest, reply: FastifyReply) => {
    const { logicalDeviceId } = req.params as { logicalDeviceId: string };
    const lineage = assetService.getHardwareLineage(logicalDeviceId);
    if (!lineage.logicalDevice) {
      return reply.code(404).send({ success: false, error: "LOGICAL_DEVICE_NOT_FOUND" });
    }
    return { success: true, data: lineage };
  });
}
