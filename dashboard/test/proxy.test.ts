import { afterEach, describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { proxy } from "../proxy";

const originalUsername = process.env.DASHBOARD_ACCESS_USERNAME;
const originalPassword = process.env.DASHBOARD_ACCESS_PASSWORD;

afterEach(() => {
  restore("DASHBOARD_ACCESS_USERNAME", originalUsername);
  restore("DASHBOARD_ACCESS_PASSWORD", originalPassword);
});

describe("dashboard proxy authentication", () => {
  it("allows local development when credentials are not configured", () => {
    delete process.env.DASHBOARD_ACCESS_USERNAME;
    delete process.env.DASHBOARD_ACCESS_PASSWORD;
    expect(proxy(request()).status).toBe(200);
  });

  it("challenges invalid credentials and accepts valid credentials", () => {
    process.env.DASHBOARD_ACCESS_USERNAME = "sentinel-admin";
    process.env.DASHBOARD_ACCESS_PASSWORD = "temporary-secret";

    const denied = proxy(request());
    expect(denied.status).toBe(401);
    expect(denied.headers.get("www-authenticate")).toContain("Sentinel Grid");

    const authorization = `Basic ${
      Buffer.from("sentinel-admin:temporary-secret").toString("base64")
    }`;
    expect(proxy(request(authorization)).status).toBe(200);
  });
});

function request(authorization?: string) {
  return new NextRequest("https://sentinel.example/", {
    headers: authorization ? { authorization } : undefined,
  });
}

function restore(name: string, value: string | undefined) {
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
}
