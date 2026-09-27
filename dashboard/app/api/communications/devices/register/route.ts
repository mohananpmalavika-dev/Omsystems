import { NextRequest, NextResponse } from "next/server";
import { Pool } from "pg";
import { randomBytes, createHash } from "crypto";

export const dynamic = "force-dynamic";

let pgPool: Pool | null = null;
function getPool(): Pool | null {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return null;
  if (!pgPool) {
    pgPool = new Pool({
      connectionString,
      max: 10,
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 5000,
    });
  }
  return pgPool;
}

// Fallback in-memory directory if database is starting or in dev mode
const defaultBranches = [
  {
    id: "branch-kochi-main",
    name: "Kochi Main Branch",
    employees: [
      { id: "emp-sunil-01", name: "Sunil Kumar", role: "Chief Security Officer" },
      { id: "emp-rajan-02", name: "Rajan M.", role: "Branch Operations Manager" },
      { id: "emp-anil-03", name: "Anil V.", role: "Front Desk & Reception" },
    ],
  },
  {
    id: "branch-tvm-hub",
    name: "Trivandrum Central Hub",
    employees: [
      { id: "emp-pradeep-04", name: "Pradeep Nair", role: "Security Patrol Lead" },
      { id: "emp-deepa-05", name: "Deepa Thomas", role: "Facility Manager" },
    ],
  },
  {
    id: "branch-clt-zone",
    name: "Calicut Retail Zone",
    employees: [
      { id: "emp-faisal-06", name: "Faisal Rahman", role: "Store Safety Officer" },
      { id: "emp-vipin-07", name: "Vipin K.", role: "Operations Lead" },
    ],
  },
];

/**
 * GET: Retrieve list of branches and employees for device enrollment (Public/No-Auth)
 */
export async function GET() {
  const pool = getPool();
  if (!pool) {
    return NextResponse.json({ success: true, branches: defaultBranches });
  }

  try {
    // 1. Fetch active branches
    const branchRes = await pool.query(`
      SELECT id, name, code 
      FROM resource_nodes 
      WHERE node_type = 'branch' AND is_active = true
      ORDER BY name ASC
      LIMIT 50
    `);

    // 2. Fetch users/employees
    const userRes = await pool.query(`
      SELECT u.id, u.full_name as name, u.role, u.branch_id
      FROM users u
      WHERE u.is_active = true
      ORDER BY u.full_name ASC
      LIMIT 200
    `);

    if (branchRes.rows.length === 0) {
      return NextResponse.json({ success: true, branches: defaultBranches });
    }

    const branches = branchRes.rows.map((b) => {
      const branchEmployees = userRes.rows
        .filter((u) => u.branch_id === b.id)
        .map((u) => ({
          id: u.id,
          name: u.name,
          role: u.role || "Staff",
        }));

      return {
        id: b.id,
        name: b.name,
        code: b.code,
        employees: branchEmployees,
      };
    });

    return NextResponse.json({ success: true, branches });
  } catch (err: any) {
    console.error("[DeviceRegister API] Directory fetch failed, using fallback:", err.message);
    return NextResponse.json({ success: true, branches: defaultBranches });
  }
}

/**
 * POST: Zero-Login Device Enrollment / Registration
 * Links device either to:
 * - Branch Common (Intercom / Shared Kiosk)
 * - Specific Employee
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { branchId, branchName, mode, employeeId, employeeName, deviceName, platform = "WEB" } = body;

    if (!branchId) {
      return NextResponse.json(
        { success: false, error: "branch_required", message: "Branch selection is required" },
        { status: 400 }
      );
    }

    const isEmployeeSpecific = mode === "EMPLOYEE_SPECIFIC" && Boolean(employeeId);
    const resolvedDeviceName = deviceName?.trim() || 
      (isEmployeeSpecific ? `${employeeName || "Employee"} Device` : `${branchName || "Branch"} Intercom`);

    const deviceUuid = `dev-${randomBytes(8).toString("hex")}`;
    const rawSecret = randomBytes(32).toString("hex");
    const credentialHash = createHash("sha256").update(rawSecret).digest("hex");
    const publicKey = `pub-${randomBytes(32).toString("base64")}`;
    const deviceType = isEmployeeSpecific ? "EMPLOYEE_MOBILE" : "BRANCH_SHARED";
    const deviceToken = `jwt-device-${Buffer.from(JSON.stringify({
      deviceUuid,
      deviceId: null,
      branchId,
      employeeId: isEmployeeSpecific ? employeeId : undefined,
      deviceType,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 60 * 60 * 24 * 30,
    })).toString("base64url")}`;

    const pool = getPool();
    let dbDeviceId = `dev-${randomBytes(12).toString("hex")}`;

    if (pool) {
      try {
        // Resolve tenant_id from branch
        const tenantRes = await pool.query(
          "SELECT tenant_id, name FROM resource_nodes WHERE id = $1 LIMIT 1",
          [branchId]
        );
        const tenantId = tenantRes.rows[0]?.tenant_id || "00000000-0000-0000-0000-000000000001";

        // Insert into communication_devices
        const insertDeviceRes = await pool.query(
          `INSERT INTO communication_devices (
            tenant_id, branch_id, device_name, device_uuid,
            device_type, platform, public_key, credential_hash,
            status, last_seen_at, registered_at
          ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'ACTIVE', NOW(), NOW())
          RETURNING id`,
          [
            tenantId,
            branchId,
            resolvedDeviceName,
            deviceUuid,
            deviceType,
            platform,
            publicKey,
            credentialHash,
          ]
        );

        if (insertDeviceRes.rows[0]?.id) {
          dbDeviceId = insertDeviceRes.rows[0].id;
        }

        // If employee specific, map to communication_device_employees
        if (isEmployeeSpecific && employeeId) {
          try {
            await pool.query(
              `INSERT INTO communication_device_employees (
                device_id, employee_id, tenant_id, is_primary,
                can_receive_calls, can_make_calls, linked_at
              ) VALUES ($1, $2, $3, true, true, true, NOW())
              ON CONFLICT (device_id, employee_id) DO NOTHING`,
              [dbDeviceId, employeeId, tenantId]
            );
          } catch (empErr: any) {
            console.warn("[DeviceRegister API] Employee mapping warning:", empErr.message);
          }
        }
      } catch (dbErr: any) {
        console.error("[DeviceRegister API] Database insert warning:", dbErr.message);
      }
    }

    return NextResponse.json({
      success: true,
      message: "Device enrolled and activated successfully",
      deviceId: dbDeviceId,
      deviceUuid,
      deviceName: resolvedDeviceName,
      branchId,
      branchName: branchName || "Branch",
      mode: isEmployeeSpecific ? "EMPLOYEE_SPECIFIC" : "BRANCH_COMMON",
      deviceType,
      linkedEmployee: isEmployeeSpecific
        ? {
            id: employeeId,
            name: employeeName || "Employee",
          }
        : null,
      accessToken: deviceToken,
      refreshToken: `ref-${rawSecret}`,
    });
  } catch (err: any) {
    console.error("[DeviceRegister API] Error:", err);
    return NextResponse.json(
      { success: false, error: "registration_failed", message: err.message || "Failed to register device" },
      { status: 500 }
    );
  }
}
