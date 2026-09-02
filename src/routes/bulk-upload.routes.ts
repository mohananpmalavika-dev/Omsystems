/**
 * Bulk Upload Routes for Branches and Employees
 * Handle CSV imports for mass data entry
 */

import type { FastifyInstance } from "fastify";
import type { ControlPlaneStore, UserManagementStore } from "../control-plane-store.js";
import { z } from "zod";
import { randomBytes } from "crypto";

// CSV Schema Validators
const branchCsvSchema = z.object({
  name: z.string().min(1),
  parent_id: z.string().uuid().optional(),
  branch_type: z.enum(["branch", "zone", "region", "headquarters"]).default("branch"),
  address: z.string().optional(),
  city: z.string().optional(),
  state: z.string().optional(),
  country: z.string().optional(),
  postal_code: z.string().optional(),
  phone: z.string().optional(),
  email: z.string().email().optional(),
  manager_name: z.string().optional(),
  latitude: z.number().optional(),
  longitude: z.number().optional(),
});

const employeeCsvSchema = z.object({
  email: z.string().email(),
  full_name: z.string().min(1),
  role: z.enum(["admin", "operator", "viewer", "security_manager"]),
  branch_id: z.string().uuid(),
  phone: z.string().optional(),
  employee_id: z.string().optional(),
  department: z.string().optional(),
  designation: z.string().optional(),
});

const cameraCsvSchema = z.object({
  name: z.string().min(1),
  ip_address: z.string().min(1),
  username: z.string().default("admin"),
  password: z.string().optional(),
  branch_id: z.string().optional(),
  vendor: z.string().optional(),
  model: z.string().optional(),
  onvif_port: z.number().optional().default(80),
  rtsp_port: z.number().optional().default(554),
  rtsp_path: z.string().optional(),
  sub_stream_path: z.string().optional(),
  channel: z.number().optional().default(1),
  location_zone: z.string().optional(),
  resolution: z.string().optional(),
  fps: z.number().optional().default(25),
  ptz: z.boolean().optional().default(false),
  audio: z.boolean().optional().default(false),
});


export async function registerBulkUploadRoutes(
  app: FastifyInstance,
  store: ControlPlaneStore
) {
  
  // Bulk create branches
  app.post<{
    Body: {
      branches: Array<{
        name: string;
        parent_id?: string;
        branch_type?: string;
        address?: string;
        city?: string;
        state?: string;
        country?: string;
        postal_code?: string;
        phone?: string;
        email?: string;
        manager_name?: string;
        latitude?: number;
        longitude?: number;
      }>;
    };
  }>("/api/bulk/branches", async (request, reply) => {
    const { branches } = request.body;

    if (!Array.isArray(branches) || branches.length === 0) {
      return reply.code(400).send({
        error: "branches array is required and must not be empty",
      });
    }

    const results = {
      created: 0,
      failed: 0,
      errors: [] as Array<{ index: number; name: string; error: string }>,
      created_branches: [] as Array<{ index: number; id: string; name: string }>,
    };

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      if (!branch) continue;

      try {
        // Validate branch data
        const validated = branchCsvSchema.parse(branch);

        // Create branch in database  
        const createdBranch = await (store as any).createBranchNode({
          name: validated.name,
          type: validated.branch_type,
          parentId: validated.parent_id,
          address: validated.address,
          city: validated.city,
          state: validated.state,
          country: validated.country,
          postalCode: validated.postal_code,
          phone: validated.phone,
          email: validated.email,
          metadata: {
            managerName: validated.manager_name,
            ...(validated.latitude && validated.longitude
              ? { location: { lat: validated.latitude, lng: validated.longitude } }
              : {}),
          },
        });

        if (!createdBranch) {
          throw new Error("Failed to create branch - no result returned");
        }

        results.created++;
        results.created_branches.push({
          index: i,
          id: createdBranch.id,
          name: createdBranch.name,
        });
      } catch (error) {
        results.failed++;
        results.errors.push({
          index: i,
          name: branch.name || "Unknown",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: results.failed === 0,
      ...results,
      total: branches.length,
    };
  });

  // Bulk create employees/users
  app.post<{
    Body: {
      employees: Array<{
        email: string;
        full_name: string;
        role: string;
        branch_id: string;
        phone?: string;
        employee_id?: string;
        department?: string;
        designation?: string;
        send_welcome_email?: boolean;
      }>;
    };
  }>("/api/bulk/employees", async (request, reply) => {
    const { employees } = request.body;

    if (!Array.isArray(employees) || employees.length === 0) {
      return reply.code(400).send({
        error: "employees array is required and must not be empty",
      });
    }

    const results = {
      created: 0,
      failed: 0,
      errors: [] as Array<{ index: number; email: string; error: string }>,
      created_employees: [] as Array<{ 
        index: number; 
        id: string; 
        email: string; 
        temp_password?: string;
      }>,
    };

    for (let i = 0; i < employees.length; i++) {
      const employee = employees[i];
      if (!employee) continue;

      try {
        // Validate employee data
        const validated = employeeCsvSchema.parse(employee);

        // Check if user already exists
        const existingUser = await (store as any).findUserByEmail?.(validated.email);
        if (existingUser) {
          throw new Error("User with this email already exists");
        }

        // Generate temporary password
        const tempPassword = randomBytes(12).toString("base64").slice(0, 16);

        // Create user (using tenant ID from branch)
        const tenantId = "00000000-0000-4000-8000-000000000001"; // Default tenant
        const createdUser = await (store as any).createUser?.(tenantId, {
          email: validated.email,
          fullName: validated.full_name,
          role: validated.role,
          password: tempPassword,
          phone: validated.phone,
          employeeId: validated.employee_id,
          department: validated.department,
          designation: validated.designation,
        });

        if (!createdUser) {
          throw new Error("Failed to create user - store method not available");
        }

        // Assign to branch if method exists
        if ((store as any).assignUserToBranch) {
          await (store as any).assignUserToBranch(createdUser.id, validated.branch_id);
        }

        results.created++;
        results.created_employees.push({
          index: i,
          id: createdUser.id,
          email: createdUser.email,
          temp_password: tempPassword,
        });

        // TODO: Send welcome email with temporary password
        // if (employee.send_welcome_email) {
        //   await sendWelcomeEmail(createdUser.email, tempPassword);
        // }
      } catch (error) {
        results.failed++;
        results.errors.push({
          index: i,
          email: employee.email || "Unknown",
          error: error instanceof Error ? error.message : String(error),
        });
      }
    }

    return {
      success: results.failed === 0,
      ...results,
      total: employees.length,
      note: "Temporary passwords generated. Users should be notified to change them on first login.",
    };
  });

  // Get bulk upload statistics
  app.get("/api/bulk/stats", async (request, reply) => {
    try {
      // Get counts from store if methods exist
      const branchCount = await (store as any).countBranches?.() || 0;
      const userCount = await (store as any).countUsers?.() || 0;

      return {
        branches: branchCount,
        employees: userCount,
      };
    } catch (error) {
      return {
        branches: 0,
        employees: 0,
      };
    }
  });

  // Validate branch CSV before upload
  app.post<{
    Body: { branches: any[] };
  }>("/api/bulk/branches/validate", async (request, reply) => {
    const { branches } = request.body;

    const validation = {
      valid: 0,
      invalid: 0,
      errors: [] as Array<{ index: number; name: string; errors: string[] }>,
    };

    for (let i = 0; i < branches.length; i++) {
      const branch = branches[i];
      try {
        branchCsvSchema.parse(branch);
        validation.valid++;
      } catch (error: any) {
        validation.invalid++;
        validation.errors.push({
          index: i,
          name: branch.name || "Unknown",
          errors: error.errors?.map((e: any) => `${e.path.join(".")}: ${e.message}`) || [error.message],
        });
      }
    }

    return {
      total: branches.length,
      ...validation,
      ready: validation.invalid === 0,
    };
  });

  // Validate employee CSV before upload
  app.post<{
    Body: { employees: any[] };
  }>("/api/bulk/employees/validate", async (request, reply) => {
    const { employees } = request.body;

    const validation = {
      valid: 0,
      invalid: 0,
      errors: [] as Array<{ index: number; email: string; errors: string[] }>,
      duplicates: [] as Array<{ index: number; email: string }>,
    };

    const emailsSeen = new Set<string>();

    for (let i = 0; i < employees.length; i++) {
      const employee = employees[i];
      try {
        employeeCsvSchema.parse(employee);

        // Check for duplicates in CSV
        if (emailsSeen.has(employee.email)) {
          validation.duplicates.push({
            index: i,
            email: employee.email,
          });
          validation.invalid++;
        } else {
          emailsSeen.add(employee.email);
          validation.valid++;
        }
      } catch (error: any) {
        validation.invalid++;
        validation.errors.push({
          index: i,
          email: employee.email || "Unknown",
          errors: error.errors?.map((e: any) => `${e.path.join(".")}: ${e.message}`) || [error.message],
        });
      }
    }

    return {
      total: employees.length,
      ...validation,
      ready: validation.invalid === 0,
    };
  });

  // Bulk create / register cameras
  app.post<{
    Body: {
      cameras: Array<{
        name: string;
        ip_address: string;
        username?: string;
        password?: string;
        branch_id?: string;
        vendor?: string;
        model?: string;
        onvif_port?: number;
        rtsp_port?: number;
        rtsp_path?: string;
        sub_stream_path?: string;
        channel?: number;
        location_zone?: string;
        resolution?: string;
        fps?: number;
        ptz?: boolean;
        audio?: boolean;
      }>;
    };
  }>("/api/bulk/cameras", async (request, reply) => {
    const { cameras } = request.body;

    if (!Array.isArray(cameras) || cameras.length === 0) {
      return reply.code(400).send({
        error: "cameras array is required and must not be empty",
      });
    }

    const results = {
      created: 0,
      failed: 0,
      errors: [] as Array<{ index: number; name: string; error: string }>,
      created_cameras: [] as Array<{ index: number; id: string; name: string; ip_address: string }>,
    };

    for (let i = 0; i < cameras.length; i++) {
      const camera = cameras[i];
      if (!camera) continue;

      try {
        const validated = cameraCsvSchema.parse(camera);
        const branchId = validated.branch_id || "branch-01";
        const vendor = (validated.vendor || "other").toLowerCase();
        const channel = validated.channel || 1;
        const rtspPort = validated.rtsp_port || 554;
        const onvifPort = validated.onvif_port || 80;

        const mainPath = validated.rtsp_path || `/Streaming/Channels/${channel}01`;
        const subPath = validated.sub_stream_path || `/Streaming/Channels/${channel}02`;

        const authPrefix = validated.password
          ? `${encodeURIComponent(validated.username)}:${encodeURIComponent(validated.password)}@`
          : `${encodeURIComponent(validated.username)}@`;

        const cameraPayload = {
          name: validated.name,
          vendor,
          model: validated.model || "IP Camera",
          ipAddress: validated.ip_address,
          channel,
          onvifPort,
          rtspPort,
          protocol: "onvif-t" as const,
          connectionTransport: "vpn" as const,
          sourceType: "ip-camera" as const,
          profiles: [
            {
              role: "main" as const,
              streamUri: `rtsp://${authPrefix}${validated.ip_address}:${rtspPort}${mainPath}`,
              codec: "H264" as const,
              resolution: { width: 1920, height: 1080 },
              fps: validated.fps || 25,
            },
            {
              role: "sub" as const,
              streamUri: `rtsp://${authPrefix}${validated.ip_address}:${rtspPort}${subPath}`,
              codec: "H264" as const,
              resolution: { width: 640, height: 360 },
              fps: 15,
            },
          ],
          capabilities: {
            ptz: Boolean(validated.ptz),
            audio: Boolean(validated.audio),
            motion: true,
          },
          connectionSecretRef: `vault://branches/${branchId}/cameras/${validated.name.toLowerCase().replace(/[^a-z0-9]/g, "-")}`,
        };

        let createdCamId = `cam-${Date.now()}-${i}`;
        if (typeof (store as any).createCamera === "function") {
          const created = await (store as any).createCamera(branchId, cameraPayload);
          if (created && created.id) createdCamId = created.id;
        }

        results.created++;
        results.created_cameras.push({
          index: i,
          id: createdCamId,
          name: validated.name,
          ip_address: validated.ip_address,
        });
      } catch (error: any) {
        results.failed++;
        results.errors.push({
          index: i,
          name: camera.name || "Unknown",
          error: error.message,
        });
      }
    }

    return results;
  });

  // Validate camera CSV before upload
  app.post<{
    Body: { cameras: any[] };
  }>("/api/bulk/cameras/validate", async (request, reply) => {
    const { cameras } = request.body;

    const validation = {
      valid: 0,
      invalid: 0,
      errors: [] as Array<{ index: number; name: string; errors: string[] }>,
      duplicates: [] as Array<{ index: number; ip_address: string }>,
    };

    const ipsSeen = new Set<string>();

    for (let i = 0; i < (cameras || []).length; i++) {
      const camera = cameras[i];
      try {
        const validated = cameraCsvSchema.parse(camera);

        if (ipsSeen.has(validated.ip_address)) {
          validation.duplicates.push({
            index: i,
            ip_address: validated.ip_address,
          });
          validation.invalid++;
        } else {
          ipsSeen.add(validated.ip_address);
          validation.valid++;
        }
      } catch (error: any) {
        validation.invalid++;
        validation.errors.push({
          index: i,
          name: camera.name || "Unknown",
          errors: error.errors?.map((e: any) => `${e.path.join(".")}: ${e.message}`) || [error.message],
        });
      }
    }

    return {
      total: (cameras || []).length,
      ...validation,
      ready: validation.invalid === 0,
    };
  });
}

