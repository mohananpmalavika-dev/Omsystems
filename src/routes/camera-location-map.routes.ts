import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { ControlPlaneStore } from "../control-plane-store.js";
import http from "http";

const querySchema = z.object({
  branchId: z.string().optional(),
  status: z.enum(["online", "offline", "degraded", "unknown"]).optional(),
  includeOffline: z.enum(["true", "false"]).optional().transform((v) => v === "true"),
  useIpGeolocation: z.enum(["true", "false"]).optional().transform((v) => v !== "false"), // Default true
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
  ipAddress?: string;
  locationSource?: "ip-geolocation" | "branch-metadata" | "camera-metadata";
  city?: string;
  country?: string;
}

interface IpGeolocationResult {
  latitude: number;
  longitude: number;
  city?: string;
  country?: string;
  source: string;
}

/**
 * Get GPS coordinates from IP address using ip-api.com (free, no API key required)
 * Limited to 45 requests per minute from same IP
 */
async function getLocationFromIp(ipAddress: string): Promise<IpGeolocationResult | null> {
  // Skip private IP addresses - they won't have public geolocation
  if (isPrivateIp(ipAddress)) {
    return null;
  }

  return new Promise((resolve) => {
    const url = `http://ip-api.com/json/${ipAddress}?fields=status,lat,lon,city,country`;
    
    const req = http.get(url, { timeout: 3000 }, (res) => {
      let data = "";
      
      res.on("data", (chunk) => {
        data += chunk;
      });
      
      res.on("end", () => {
        try {
          const result = JSON.parse(data);
          
          if (result.status === "success" && result.lat && result.lon) {
            resolve({
              latitude: result.lat,
              longitude: result.lon,
              city: result.city,
              country: result.country,
              source: "ip-api.com",
            });
          } else {
            resolve(null);
          }
        } catch {
          resolve(null);
        }
      });
    });
    
    req.on("error", () => {
      resolve(null);
    });
    
    req.on("timeout", () => {
      req.destroy();
      resolve(null);
    });
  });
}

/**
 * Check if IP is private/local (won't have public geolocation)
 */
function isPrivateIp(ip: string): boolean {
  if (!ip) return true;
  
  // Check for private IP ranges
  const parts = ip.split(".").map(Number);
  if (parts.length !== 4) return true;
  
  // 10.0.0.0 – 10.255.255.255
  if (parts[0] === 10) return true;
  
  // 172.16.0.0 – 172.31.255.255
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true;
  
  // 192.168.0.0 – 192.168.255.255
  if (parts[0] === 192 && parts[1] === 168) return true;
  
  // Localhost
  if (parts[0] === 127) return true;
  
  return false;
}

/**
 * Camera Location Map API Routes
 * Provides GPS-based camera location data for map visualization
 * Supports IP-based geolocation for cameras with public IPs
 */
export async function registerCameraLocationMapRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore,
) {
  /**
   * GET /v1/camera-locations
   * Returns all cameras with GPS coordinates for map display
   * 
   * Query params:
   *  - useIpGeolocation: true/false (default: true) - Use camera IP for geolocation
   *  - branchId: filter by branch
   *  - status: filter by camera status
   *  - includeOffline: true/false (default: true)
   */
  app.get("/v1/camera-locations", async (request, reply) => {
    const query = querySchema.parse(request.query);
    const tenantId = request.currentUser.tenantId;

    try {
      // Get all cameras for the tenant
      const allCameras = await store.listCameras(tenantId);
      
      // Get branches to access metadata (including GPS coordinates)
      const branches: any[] = (await (store as any).listAccessibleNodes?.(request.currentUser, "live:view", "branch")) || [];
      const branchMap = new Map(branches.map((b: any) => [b.id, b]));

      // Filter cameras that have location data
      const camerasWithLocation: CameraWithLocation[] = [];

      // Process cameras in batches to avoid rate limiting IP geolocation API
      const batchSize = 10;
      for (let i = 0; i < allCameras.length; i += batchSize) {
        const batch = allCameras.slice(i, i + batchSize);
        
        await Promise.all(
          batch.map(async (camera) => {
            // Skip if filtering by branch and this camera doesn't match
            if (query.branchId && camera.branchId !== query.branchId) {
              return;
            }

            // Skip if filtering by status and this camera doesn't match
            if (query.status && camera.status !== query.status) {
              return;
            }

            // Skip offline cameras if requested
            if (query.includeOffline === false && camera.status === "offline") {
              return;
            }

            const branch: any = branchMap.get(camera.branchId);
            if (!branch) return;

            let latitude: number | undefined;
            let longitude: number | undefined;
            let locationSource: "ip-geolocation" | "branch-metadata" | "camera-metadata" = "branch-metadata";
            let city: string | undefined;
            let country: string | undefined;

            // Priority 1: Check camera's own metadata for GPS coordinates
            const cameraMetadata = (camera as any).metadata || {};
            const cameraLocation = cameraMetadata.location;
            
            if (cameraLocation?.latitude && cameraLocation?.longitude) {
              latitude = cameraLocation.latitude;
              longitude = cameraLocation.longitude;
              locationSource = "camera-metadata";
              city = cameraLocation.city;
              country = cameraLocation.country;
            }
            
            // Priority 2: Try IP-based geolocation if enabled and camera has IP address
            if (!latitude && query.useIpGeolocation && camera.ipAddress) {
              try {
                const ipLocation = await getLocationFromIp(camera.ipAddress);
                if (ipLocation) {
                  latitude = ipLocation.latitude;
                  longitude = ipLocation.longitude;
                  locationSource = "ip-geolocation";
                  city = ipLocation.city;
                  country = ipLocation.country;
                }
              } catch (error) {
                app.log.warn({ 
                  cameraId: camera.id, 
                  ipAddress: camera.ipAddress, 
                  error 
                }, "IP geolocation failed");
              }
            }

            // Priority 3: Fall back to branch location
            if (!latitude) {
              const branchMetadata = (branch as any).metadata || {};
              const branchLocation = branchMetadata.location;

              // Accept both formats: {lat, lng} or {latitude, longitude}
              latitude = branchLocation?.latitude ?? branchLocation?.lat;
              longitude = branchLocation?.longitude ?? branchLocation?.lng;
              locationSource = "branch-metadata";
            }

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
                ipAddress: locationSource === "ip-geolocation" ? camera.ipAddress : undefined,
                locationSource,
                city,
                country,
              });
            }
          })
        );
      }

      return reply.send({
        success: true,
        data: camerasWithLocation,
        total: camerasWithLocation.length,
        ipGeolocationEnabled: query.useIpGeolocation,
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
      const branches: any[] = (await (store as any).listAccessibleNodes?.(request.currentUser, "live:view", "branch")) || [];

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
    const query = querySchema.parse(request.query);
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

      let latitude: number | undefined;
      let longitude: number | undefined;
      let locationSource: "ip-geolocation" | "branch-metadata" | "camera-metadata" = "branch-metadata";
      let city: string | undefined;
      let country: string | undefined;

      // Check camera metadata first
      const cameraMetadata = (camera as any).metadata || {};
      const cameraLocation = cameraMetadata.location;
      
      if (cameraLocation?.latitude && cameraLocation?.longitude) {
        latitude = cameraLocation.latitude;
        longitude = cameraLocation.longitude;
        locationSource = "camera-metadata";
      }

      // Try IP geolocation if enabled
      if (!latitude && query.useIpGeolocation && camera.ipAddress) {
        const ipLocation = await getLocationFromIp(camera.ipAddress);
        if (ipLocation) {
          latitude = ipLocation.latitude;
          longitude = ipLocation.longitude;
          locationSource = "ip-geolocation";
          city = ipLocation.city;
          country = ipLocation.country;
        }
      }

      // Fall back to branch location
      if (!latitude) {
        const metadata = (branch as any).metadata || {};
        const location = metadata.location;
        latitude = location?.latitude ?? location?.lat;
        longitude = location?.longitude ?? location?.lng;
      }

      if (
        typeof latitude !== "number" ||
        typeof longitude !== "number" ||
        isNaN(latitude) ||
        isNaN(longitude)
      ) {
        return reply.code(404).send({
          success: false,
          error: "location_not_configured",
          message: "GPS coordinates not available for this camera",
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
          ipAddress: locationSource === "ip-geolocation" ? camera.ipAddress : undefined,
          locationSource,
          city,
          country,
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
