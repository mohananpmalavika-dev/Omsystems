import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function controlPlaneUrl(path: string): string {
  const base = process.env.CONTROL_PLANE_INTERNAL_URL || process.env.CONTROL_PLANE_URL || process.env.CONTROL_PLANE_PUBLIC_URL;
  if (!base) throw new Error("Control plane URL is not configured");
  return new URL(path, base).toString();
}

export async function GET(request: NextRequest) {
  try {
    const base = process.env.CONTROL_PLANE_INTERNAL_URL || process.env.CONTROL_PLANE_URL || process.env.CONTROL_PLANE_PUBLIC_URL;
    if (!base) throw new Error("Control plane URL is not configured");
    const headers = new Headers();
    const auth = request.cookies.get("sentinel_access")?.value || request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
    if (auth) headers.set("authorization", `Bearer ${auth}`);
    const response = await fetch(new URL("/v1/communications/directory/branches", base), { headers, cache: "no-store" });
    const payload = await response.json();
    if (!response.ok) return NextResponse.json({ success: false, error: payload.error || "directory_unavailable" }, { status: response.status });
    const branches = (Array.isArray(payload.data) ? payload.data : []).map((branch: any) => ({
      id: branch.branchId,
      name: branch.branchName,
      code: branch.branchCode,
      employees: (branch.employees || []).map((employee: any) => ({ id: employee.employeeId, name: employee.employeeName, role: employee.role || "Staff" })),
    }));
    return NextResponse.json({ success: true, branches }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[DeviceRegister API] Directory unavailable", error);
    return NextResponse.json({ success: false, error: "directory_unavailable" }, { status: 503 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    if (body.action === "resolve") {
      const code = typeof body.enrollmentCode === "string" ? body.enrollmentCode.trim() : "";
      if (!code) return NextResponse.json({ success: false, error: "enrollment_code_required" }, { status: 400 });
      const lookup = await fetch(controlPlaneUrl("/v1/communications/enrollment-codes/resolve"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
        cache: "no-store",
      });
      const payload = await lookup.json();
      return NextResponse.json(lookup.ok ? { success: true, ...payload } : { success: false, error: payload.error || "invalid_enrollment_code" }, { status: lookup.status });
    }
    const enrollmentCode = typeof body.enrollmentCode === "string" ? body.enrollmentCode.trim() : "";
    const deviceName = typeof body.deviceName === "string" ? body.deviceName.trim() : "";
    const publicKey = typeof body.publicKey === "string" ? body.publicKey : "";
    const deviceUuid = typeof body.deviceUuid === "string" ? body.deviceUuid : "";
    if (!enrollmentCode || deviceName.length < 2 || !deviceUuid || publicKey.length < 100) {
      return NextResponse.json({ success: false, error: "invalid_enrollment_request" }, { status: 400 });
    }

    const response = await fetch(controlPlaneUrl("/v1/communications/devices/enroll"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        enrollmentCode,
        branchId: typeof body.branchId === "string" ? body.branchId : undefined,
        deviceName,
        platform: body.platform === "ANDROID" || body.platform === "IOS" || body.platform === "WINDOWS" ? body.platform : "WEB",
        publicKey,
        deviceUuid,
        linkedEmployeeIds: Array.isArray(body.linkedEmployeeIds)
          ? body.linkedEmployeeIds
          : [],
        assignedEmployeeCode: body.mode === "EMPLOYEE_SPECIFIC" && typeof body.employeeId === "string" ? body.employeeId.trim() : undefined,
        assignedEmployeeName: body.mode === "EMPLOYEE_SPECIFIC" && typeof body.employeeName === "string" ? body.employeeName.trim() : undefined,
      }),
      cache: "no-store",
    });
    const payload = await response.json();
    if (!response.ok) {
      return NextResponse.json({ success: false, error: payload.error || "enrollment_failed", message: payload.message }, { status: response.status });
    }
    const device = payload.device;
    return NextResponse.json({
      success: true,
      deviceId: device?.id,
      deviceUuid: device?.deviceUuid,
      deviceName: device?.deviceName,
      branchId: device?.branchId,
      tenantId: device?.tenantId,
      branchName: device?.branchName || "",
      mode: body.mode === "EMPLOYEE_SPECIFIC" ? "EMPLOYEE_SPECIFIC" : "BRANCH_COMMON",
      linkedEmployee: body.employeeId ? { id: body.employeeId, name: body.employeeName || "Employee" } : null,
      accessToken: payload.accessToken,
      refreshToken: payload.refreshToken,
      status: device?.status,
    }, { status: response.status, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("[DeviceRegister API] Enrollment unavailable", error);
    return NextResponse.json({ success: false, error: "enrollment_unavailable" }, { status: 503 });
  }
}
