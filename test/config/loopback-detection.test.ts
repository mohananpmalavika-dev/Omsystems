import { describe, it, expect } from "vitest";
import { isLoopbackHost, isLoopbackUrl } from "../../src/config/loopback-guard.js";

describe("Loopback Detection & Security Guard Tests", () => {
  it("identifies standard loopback hostnames and IPv4/IPv6 addresses", () => {
    expect(isLoopbackHost("localhost")).toBe(true);
    expect(isLoopbackHost("localhost.")).toBe(true);
    expect(isLoopbackHost("127.0.0.1")).toBe(true);
    expect(isLoopbackHost("127.0.0.2")).toBe(true);
    expect(isLoopbackHost("127.100.200.50")).toBe(true);
    expect(isLoopbackHost("::1")).toBe(true);
    expect(isLoopbackHost("[::1]")).toBe(true);
    expect(isLoopbackHost("0.0.0.0")).toBe(true);
  });

  it("does not flag legitimate internal service or external hostnames as loopback", () => {
    expect(isLoopbackHost("postgres.service.internal")).toBe(false);
    expect(isLoopbackHost("redis-cluster.sentinel.internal")).toBe(false);
    expect(isLoopbackHost("10.0.0.15")).toBe(false);
    expect(isLoopbackHost("192.168.1.100")).toBe(false);
    expect(isLoopbackHost("api.sentinel.cloud")).toBe(false);
  });

  it("identifies loopback URLs with various schemes and ports", () => {
    expect(isLoopbackUrl("http://localhost:3000")).toBe(true);
    expect(isLoopbackUrl("https://127.0.0.1:8080/api")).toBe(true);
    expect(isLoopbackUrl("redis://localhost:6379")).toBe(true);
    expect(isLoopbackUrl("postgresql://user:pass@127.0.0.1:5432/sentinel")).toBe(true);
    expect(isLoopbackUrl("nats://127.0.0.1:4222")).toBe(true);
    expect(isLoopbackUrl("ws://[::1]:3000/ws")).toBe(true);
  });

  it("does not flag remote service URLs as loopback", () => {
    expect(isLoopbackUrl("postgresql://user:pass@postgres.service.internal:5432/sentinel")).toBe(false);
    expect(isLoopbackUrl("rediss://redis.service.internal:6379")).toBe(false);
    expect(isLoopbackUrl("https://control.sentinel.internal/api/v1")).toBe(false);
  });
});
