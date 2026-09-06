import { describe, expect, it } from "vitest";
import { isPublicDashboardRoute, loginPath, safeReturnPath } from "../lib/session-navigation";
import { portableDeviceHeaders, readPortableDevice } from "../lib/portable-device";

describe("dashboard session navigation", () => {
  it.each(["https://attacker.example", "//attacker.example", "/\\attacker.example", "/login", "/api/control/v1/users", "/_next/static/app.js"])("rejects unsafe or looping return destination %s", (value) => {
    expect(safeReturnPath(value)).toBe("/");
  });
  it("preserves the requested workspace and filters through login", () => {
    const redirect = new URL(loginPath("expired", { pathname: "/branches", search: "?branchId=A005", hash: "#cameras" }), "https://dashboard.example");
    expect(redirect.searchParams.get("next")).toBe("/branches?branchId=A005#cameras");
    expect(safeReturnPath(redirect.searchParams.get("next"))).toBe("/branches?branchId=A005#cameras");
  });
  it.each(["/support", "/privacy", "/terms", "/live-incident/secret-token", "/portable-camera/enroll"])("allows public page %s without an employee login loop", (path) => {
    expect(isPublicDashboardRoute(path)).toBe(true);
  });
  it("keeps private workspace and nested responder pages protected", () => {
    expect(isPublicDashboardRoute("/cameras")).toBe(false);
    expect(isPublicDashboardRoute("/live-incident/token/admin")).toBe(false);
  });
});

describe("portable camera enrollment credentials", () => {
  it("requires reenrollment for legacy device caches missing the secret", () => {
    expect(readPortableDevice({ id: "device-1", cameraId: "camera-1" })).toBeNull();
    expect(readPortableDevice({ id: "device-1", cameraId: "camera-1", credentialSecret: " " })).toBeNull();
  });
  it("sends the device identity and its issued secret on authenticated operations", () => {
    const device = readPortableDevice({ id: "device-1", cameraId: "camera-1", credentialSecret: "issued-test-secret" });
    expect(portableDeviceHeaders(device!)).toMatchObject({
      "x-portable-device-id": "device-1", "x-portable-device-secret": "issued-test-secret",
    });
  });
});
