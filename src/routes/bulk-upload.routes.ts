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
}
