import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";

const querySchema = z.object({
  branchId: z.string().optional(),
  status: z.enum(["online", "offline", "degraded", "unknown"]).optional(),
  includeOffline: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
});

interface CameraWithLocation {
  id: string;
  name: string;
  branchId: string;
  branchName: string;
  latitude: number;
  longitude: number;
  status: "online" | "offline" | "degraded" | "unknown";
  lastSeen?: string;
  locationType?: string;
  physicalType?: string;
  vendor?: string;
  model?: string;
  uptime?: number;
}

/**
 * Camera Location Map API Routes
 * Provides GPS-based camera location data for map visualization
 */
export async function registerCameraLocationMapRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  /**
   * GET /v1/camera-locations
   * Returns all cameras with GPS coordinates for map display
   */
  app.get("/v1/camera-locations", async (request, reply) => {
    const query = querySchema.parse(request.query);
    const tenantId = request.currentUser.tenantId;

    try {
      // Get all cameras for the tenant
      const allCameras = await store.listCameras(tenantId);
      
      // Get branches to access metadata (including GPS coordinates)
      const branches = await store.listNodes(tenantId, "branch");
      const branchMap = new Map(branches.map((b) => [b.id, b]));

      // Filter cameras that have location data
      const camerasWithLocation: CameraWithLocation[] = [];

      for (const camera of allCameras) {
        // Skip if filtering by branch and this camera doesn't match
        if (query.branchId && camera.branchId !== query.branchId) {
          continue;
        }

        // Skip if filtering by status and this camera doesn't match
        if (query.status && camera.status !== query.status) {
          continue;
        }

        // Skip offline cameras if requested
        if (query.includeOffline === false && camera.status === "offline") {
          continue;
        }

        const branch = branchMap.get(camera.branchId);
        if (!branch) continue;

        // Check if branch has metadata with GPS coordinates
        const metadata = (branch as any).metadata || {};
        const location = metadata.location;

        // Accept both formats: {lat, lng} or {latitude, longitude}
        const latitude = location?.latitude ?? location?.lat;
        const longitude = location?.longitude ?? location?.lng;

        if (
          typeof latitude === "number" &&
          typeof longitude === "number" &&
          !isNaN(latitude) &&
          !isNaN(longitude)
        ) {
          // Calculate uptime if lastSeenAt exists
          let uptime: number | undefined;
          if (camera.lastSeenAt && camera.status === "online") {
            const now = Date.now();
            const lastSeen = new Date(camera.lastSeenAt).getTime();
            const daysSinceLastSeen = (now - lastSeen) / (1000 * 60 * 60 * 24);
            // Simple uptime calculation: assume 99% if seen recently
            uptime = daysSinceLastSeen < 1 ? 99.5 : 95.0;
          }

          camerasWithLocation.push({
            id: camera.id,
            name: camera.name,
            branchId: camera.branchId,
            branchName: branch.name,
            latitude,
            longitude,
            status: camera.status,
            lastSeen: camera.lastSeenAt || undefined,
            locationType: camera.locationType,
            physicalType: camera.physicalType,
            vendor: camera.vendor,
            model: camera.model,
            uptime,
          });
        }
      }

      return reply.send({
        success: true,
        data: camerasWithLocation,
        total: camerasWithLocation.length,
      });
    } catch (error: any) {
      app.log.error({ error, tenantId }, "Failed to fetch camera locations");
      return reply.code(500).send({
        success: false,
        error: "failed_to_fetch_camera_locations",
        message: error.message,
      });
    }
  });

  /**
   * GET /v1/camera-locations/branches
   * Returns branch clusters with camera counts and health statistics
   */
  app.get("/v1/camera-locations/branches", async (request, reply) => {
    const query = querySchema.parse(request.query);
    const tenantId = request.currentUser.tenantId;

    try {
      const allCameras = await store.listCameras(tenantId);
      const branches = await store.listNodes(tenantId, "branch");

      interface BranchCluster {
        id: string;
        name: string;
        latitude: number;
        longitude: number;
        totalCameras: number;
        healthyCameras: number;
        warningCameras: number;
        criticalCameras: number;
        offlineCameras: number;
      }

      const branchClusters: BranchCluster[] = [];

      for (const branch of branches) {
        const metadata = (branch as any).metadata || {};
        const location = metadata.location;

        const latitude = location?.latitude ?? location?.lat;
        const longitude = location?.longitude ?? location?.lng;

        if (
          typeof latitude === "number" &&
          typeof longitude === "number" &&
          !isNaN(latitude) &&
          !isNaN(longitude)
        ) {
          // Count cameras by status for this branch
          const branchCameras = allCameras.filter((c) => c.branchId === branch.id);
          const totalCameras = branchCameras.length;

          if (totalCameras === 0) continue; // Skip branches with no cameras

          const healthyCameras = branchCameras.filter((c) => c.status === "online").length;
          const offlineCameras = branchCameras.filter((c) => c.status === "offline").length;
          const degradedCameras = branchCameras.filter((c) => c.status === "degraded").length;
          const unknownCameras = branchCameras.filter((c) => c.status === "unknown").length;

          branchClusters.push({
            id: branch.id,
            name: branch.name,
            latitude,
            longitude,
            totalCameras,
            healthyCameras,
            warningCameras: degradedCameras + unknownCameras,
            criticalCameras: 0, // Can be enhanced based on alert severity
            offlineCameras,
          });
        }
      }

      return reply.send({
        success: true,
        data: branchClusters,
        total: branchClusters.length,
      });
    } catch (error: any) {
      app.log.error({ error, tenantId }, "Failed to fetch branch clusters");
      return reply.code(500).send({
        success: false,
        error: "failed_to_fetch_branch_clusters",
        message: error.message,
      });
    }
  });

  /**
   * GET /v1/camera-locations/:cameraId
   * Get specific camera location details
   */
  app.get("/v1/camera-locations/:cameraId", async (request, reply) => {
    const { cameraId } = z.object({ cameraId: z.string() }).parse(request.params);
    const tenantId = request.currentUser.tenantId;

    try {
      const camera = await store.getCamera(cameraId);
      if (!camera || camera.tenantId !== tenantId) {
        return reply.code(404).send({
          success: false,
          error: "camera_not_found",
        });
      }

      const branch = await store.getNode(camera.branchId);
      if (!branch) {
        return reply.code(404).send({
          success: false,
          error: "branch_not_found",
        });
      }

      const metadata = (branch as any).metadata || {};
      const location = metadata.location;

      const latitude = location?.latitude ?? location?.lat;
      const longitude = location?.longitude ?? location?.lng;

      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        isNaN(latitude) ||
        isNaN(longitude)
      ) {
        return reply.code(404).send({
          success: false,
          error: "location_not_configured",
          message: "GPS coordinates not configured for this camera's branch",
        });
      }

      return reply.send({
        success: true,
        data: {
          id: camera.id,
          name: camera.name,
          branchId: camera.branchId,
          branchName: branch.name,
          latitude,
          longitude,
          status: camera.status,
          lastSeen: camera.lastSeenAt,
          locationType: camera.locationType,
          physicalType: camera.physicalType,
          vendor: camera.vendor,
          model: camera.model,
        },
      });
    } catch (error: any) {
      app.log.error({ error, cameraId, tenantId }, "Failed to fetch camera location");
      return reply.code(500).send({
        success: false,
        error: "failed_to_fetch_camera_location",
        message: error.message,
      });
    }
  });
}
