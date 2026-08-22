import { describe, it, expect } from "vitest";
import { AdapterFallbackExecutor, RecorderOperationError } from "../../edge-agent/src/recorders/adapters/adapter-fallback-executor.js";
import type { RecorderAdapter, RecorderRequest } from "../../edge-agent/src/recorders/adapters/recorder-adapter.interface.js";
import type { RecorderOperation } from "../../edge-agent/src/recorders/types/recorder-profile.types.js";

describe("AdapterFallbackExecutor", () => {
  it("executes operation using primary adapter when successful", async () => {
    const mockPrimary: RecorderAdapter = {
      family: "DAHUA_CGI",
      async execute<T>(_op: RecorderOperation, _req: RecorderRequest): Promise<T> {
        return { success: true, from: "DAHUA_CGI" } as unknown as T;
      },
    };

    const executor = new AdapterFallbackExecutor().register(mockPrimary);
    const result = await executor.executeWithFallback<any>("GET_DEVICE_INFO", ["DAHUA_CGI"], {
      recorderId: "rec-1",
      host: "192.168.1.100",
      port: 80,
    });

    expect(result.from).toBe("DAHUA_CGI");
  });

  it("falls back to secondary adapter when primary returns unsupported endpoint error", async () => {
    const mockPrimary: RecorderAdapter = {
      family: "DAHUA_CGI",
      async execute<T>(_op: RecorderOperation, _req: RecorderRequest): Promise<T> {
        const err: any = new Error("dahua_http_404_not_found");
        err.statusCode = 404;
        throw err;
      },
    };

    const mockSecondary: RecorderAdapter = {
      family: "ONVIF",
      async execute<T>(_op: RecorderOperation, _req: RecorderRequest): Promise<T> {
        return { success: true, from: "ONVIF" } as unknown as T;
      },
    };

    const executor = new AdapterFallbackExecutor()
      .register(mockPrimary)
      .register(mockSecondary);

    const result = await executor.executeWithFallback<any>("GET_DEVICE_INFO", ["DAHUA_CGI", "ONVIF"], {
      recorderId: "rec-1",
      host: "192.168.1.100",
      port: 80,
    });

    expect(result.from).toBe("ONVIF");
  });

  it("stops fallback and does not retry on 401 authentication failure (lockout protection)", async () => {
    let secondaryCalled = false;

    const mockPrimary: RecorderAdapter = {
      family: "DAHUA_CGI",
      async execute<T>(_op: RecorderOperation, _req: RecorderRequest): Promise<T> {
        const err: any = new Error("recorder_credentials_rejected");
        err.statusCode = 401;
        throw err;
      },
    };

    const mockSecondary: RecorderAdapter = {
      family: "ONVIF",
      async execute<T>(_op: RecorderOperation, _req: RecorderRequest): Promise<T> {
        secondaryCalled = true;
        return { from: "ONVIF" } as unknown as T;
      },
    };

    const executor = new AdapterFallbackExecutor()
      .register(mockPrimary)
      .register(mockSecondary);

    await expect(
      executor.executeWithFallback("GET_DEVICE_INFO", ["DAHUA_CGI", "ONVIF"], {
        recorderId: "rec-1",
        host: "192.168.1.100",
        port: 80,
      }),
    ).rejects.toThrow(RecorderOperationError);

    expect(secondaryCalled).toBe(false);
  });
});
