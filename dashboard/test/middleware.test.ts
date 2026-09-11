import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { middleware } from "../proxy";

describe("dashboard middleware navigation and auth guards", () => {
  it("redirects unauthenticated root link to /login", () => {
    const req = new NextRequest("https://sentinel.example/");
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe("https://sentinel.example/login");
  });

  it("redirects unauthenticated deep link to /login with next parameter", () => {
    const req = new NextRequest("https://sentinel.example/control-room?branch=1");
    const res = middleware(req);
    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://sentinel.example/login?next=%2Fcontrol-room%3Fbranch%3D1",
    );
  });

  it("allows unauthenticated access to public routes", () => {
    const publicPaths = [
      "https://sentinel.example/login",
      "https://sentinel.example/forgot-password",
      "https://sentinel.example/reset-password",
      "https://sentinel.example/support",
      "https://sentinel.example/privacy",
      "https://sentinel.example/terms",
      "https://sentinel.example/portable-camera/enroll",
      "https://sentinel.example/live-incident/secret-incident-1",
    ];

    for (const url of publicPaths) {
      const req = new NextRequest(url);
      const res = middleware(req);
      expect(res.status).toBe(200);
    }
  });

  it("allows unauthenticated access to api endpoints", () => {
    const req = new NextRequest("https://sentinel.example/api/control/v1/auth/login");
    const res = middleware(req);
    expect(res.status).toBe(200);
  });

  it("allows access to protected routes when sentinel_access cookie is present", () => {
    const req = new NextRequest("https://sentinel.example/control-room", {
      headers: {
        cookie: "sentinel_access=valid-employee-session",
      },
    });
    const res = middleware(req);
    expect(res.status).toBe(200);
  });
});
