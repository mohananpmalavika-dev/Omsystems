/**
 * Camera Credential Resolver Tests
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { CameraCredentialResolver, parseCredentialRef } from "./camera-credential-resolver.js";
import type { Pool } from "pg";

describe("CameraCredentialResolver", () => {
  let mockPool: any;
  let resolver: CameraCredentialResolver;

  beforeEach(() => {
    mockPool = {
      query: vi.fn(),
    };
    resolver = new CameraCredentialResolver(mockPool);
  });

  // ========== Direct ONVIF URL Tests ==========

  describe("Direct ONVIF URL", () => {
    it("should parse onvif:// URL with credentials", async () => {
      const connection = await resolver.resolve(
        "onvif://admin:password123@192.168.1.100:80/onvif/device_service",
      );

      expect(connection).not.toBeNull();
      expect(connection?.host).toBe("192.168.1.100");
      expect(connection?.port).toBe(80);
      expect(connection?.credentials.username).toBe("admin");
      expect(connection?.credentials.password).toBe("password123");
      expect(connection?.onvifServiceUrl).toBe(
        "http://192.168.1.100:80/onvif/device_service",
      );
    });

    it("should parse onvif:// URL without port (default 80)", async () => {
      const connection = await resolver.resolve(
        "onvif://admin:pass@192.168.1.100/onvif/device_service",
      );

      expect(connection?.port).toBe(80);
      expect(connection?.onvifServiceUrl).toBe(
        "http://192.168.1.100:80/onvif/device_service",
      );
    });

    it("should parse onvif:// URL with empty password", async () => {
      const connection = await resolver.resolve(
        "onvif://admin@192.168.1.100:80/onvif/device_service",
      );

      expect(connection?.credentials.username).toBe("admin");
      expect(connection?.credentials.password).toBe("");
    });

    it("should decode URL-encoded credentials", async () => {
      const connection = await resolver.resolve(
        "onvif://admin%40company:pass%40word@192.168.1.100/onvif/device_service",
      );

      expect(connection?.credentials.username).toBe("admin@company");
      expect(connection?.credentials.password).toBe("pass@word");
    });

    it("should return null for malformed onvif:// URL", async () => {
      const connection = await resolver.resolve("onvif://invalid");
      expect(connection).toBeNull();
    });
  });

  // ========== Branch Credential Tests ==========

  describe("Branch Credentials", () => {
    it("should resolve branch:// reference with camera credentials", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            ip_address: "192.168.1.100",
            onvif_port: 8080,
            username: "camera_user",
            password: "camera_pass",
          },
        ],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const connection = await resolver.resolve(
        "branch://blr-001/camera/cam-123",
        "cam-123",
      );

      expect(connection).not.toBeNull();
      expect(connection?.host).toBe("192.168.1.100");
      expect(connection?.port).toBe(8080);
      expect(connection?.credentials.username).toBe("camera_user");
      expect(connection?.credentials.password).toBe("camera_pass");
    });

    it("should use branch default credentials when camera has none", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            ip_address: "192.168.1.100",
            onvif_port: 80,
            username: "branch_admin",
            password: "branch_pass",
            default_username: null,
            default_password: null,
          },
        ],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const connection = await resolver.resolve(
        "branch://blr-001/camera/cam-123",
        "cam-123",
      );

      expect(connection?.credentials.username).toBe("branch_admin");
      expect(connection?.credentials.password).toBe("branch_pass");
    });

    it("should return null when camera not found", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        command: "",
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const connection = await resolver.resolve(
        "branch://blr-001/camera/cam-999",
        "cam-999",
      );

      expect(connection).toBeNull();
    });

    it("should return null when camera has no IP address", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            ip_address: null,
            onvif_port: 80,
            username: "admin",
            password: "pass",
          },
        ],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const connection = await resolver.resolve(
        "branch://blr-001/camera/cam-123",
        "cam-123",
      );

      expect(connection).toBeNull();
    });
  });

  // ========== Vault Credential Tests ==========

  describe("Vault Credentials", () => {
    it("should resolve vault:// reference", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            ip_address: "192.168.1.100",
            onvif_port: 80,
            username: "vault_user",
            password: "vault_pass",
          },
        ],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const connection = await resolver.resolve(
        "vault://branches/blr-001/cameras/cam-123",
        "cam-123",
      );

      expect(connection).not.toBeNull();
      expect(connection?.credentials.username).toBe("vault_user");
    });
  });

  // ========== Edge Credential Tests ==========

  describe("Edge Credentials", () => {
    it("should return null for edge:// reference (not implemented)", async () => {
      const connection = await resolver.resolve(
        "edge://edge-001/camera/cam-123",
        "cam-123",
      );

      expect(connection).toBeNull();
    });
  });

  // ========== Camera Credential Lookup Tests ==========

  describe("Camera Credential Lookup", () => {
    it("should resolve credentials from camera ID", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            ipAddress: "192.168.1.100",
            onvifPort: 80,
            username: "admin",
            password: "password",
          },
        ],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const connection = await resolver.resolve("unknown://format", "cam-123");

      expect(connection).not.toBeNull();
    });
  });

  // ========== Endpoint Lookup Tests ==========

  describe("Get Camera ONVIF Endpoint", () => {
    it("should get ONVIF endpoint for camera", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            ip_address: "192.168.1.100",
            onvif_port: 8080,
          },
        ],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const endpoint = await resolver.getCameraOnvifEndpoint("cam-123");

      expect(endpoint).not.toBeNull();
      expect(endpoint?.host).toBe("192.168.1.100");
      expect(endpoint?.port).toBe(8080);
      expect(endpoint?.serviceUrl).toBe("http://192.168.1.100:8080/onvif/device_service");
    });

    it("should use default port 80 when not specified", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          {
            ip_address: "192.168.1.100",
            onvif_port: null,
          },
        ],
        command: "",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      const endpoint = await resolver.getCameraOnvifEndpoint("cam-123");

      expect(endpoint?.port).toBe(80);
    });

    it("should return null when camera not found", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        command: "",
        rowCount: 0,
        oid: 0,
        fields: [],
      });

      const endpoint = await resolver.getCameraOnvifEndpoint("cam-999");

      expect(endpoint).toBeNull();
    });
  });

  // ========== Credential Storage Tests ==========

  describe("Store Credentials", () => {
    it("should store camera credentials", async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [],
        command: "UPDATE",
        rowCount: 1,
        oid: 0,
        fields: [],
      });

      await resolver.storeCredentials("cam-123", "newuser", "newpass");

      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("UPDATE cameras"),
        ["cam-123", "newuser", "newpass"],
      );
    });
  });

  // ========== Credential Testing Tests ==========

  describe("Test Credentials", () => {
    it("should test valid credentials", async () => {
      // This would require mocking the OnvifClient
      // For now, just verify the method exists
      expect(resolver.testCredentials).toBeDefined();
    });
  });
});

// ========== Credential Reference Parser Tests ==========

describe("parseCredentialRef", () => {
  it("should parse onvif:// URL", () => {
    const parsed = parseCredentialRef(
      "onvif://admin:pass@192.168.1.100/onvif/device_service",
    );
    expect(parsed.type).toBe("onvif");
    expect(parsed.directUrl).toBe("onvif://admin:pass@192.168.1.100/onvif/device_service");
  });

  it("should parse branch:// reference", () => {
    const parsed = parseCredentialRef("branch://blr-001/camera/cam-123");
    expect(parsed.type).toBe("branch");
    expect(parsed.branchId).toBe("blr-001");
    expect(parsed.cameraId).toBe("cam-123");
  });

  it("should parse vault:// reference", () => {
    const parsed = parseCredentialRef("vault://branches/blr-001/cameras/cam-123");
    expect(parsed.type).toBe("vault");
    expect(parsed.branchId).toBe("blr-001");
    expect(parsed.cameraId).toBe("cam-123");
  });

  it("should parse edge:// reference", () => {
    const parsed = parseCredentialRef("edge://edge-001/camera/cam-123");
    expect(parsed.type).toBe("edge");
    expect(parsed.edgeAgentId).toBe("edge-001");
    expect(parsed.cameraId).toBe("cam-123");
  });

  it("should return unknown for unrecognized format", () => {
    const parsed = parseCredentialRef("unknown://format");
    expect(parsed.type).toBe("unknown");
  });
});

