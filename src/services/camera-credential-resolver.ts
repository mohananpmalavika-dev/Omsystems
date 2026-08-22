/**
 * Camera Credential Resolver
 * Resolves connectionSecretRef to actual camera credentials
 */

import type { Pool } from "pg";
import type { OnvifCredentials } from "../../edge-agent/src/devices/onvif-client.js";

export interface CameraConnection {
  host: string;
  port?: number;
  credentials: OnvifCredentials;
  onvifServiceUrl: string;
}

export interface CameraCredentialSource {
  ipAddress?: string;
  onvifPort?: number;
  username?: string;
  password?: string;
}

/**
 * Resolves camera credentials from various storage patterns
 */
export class CameraCredentialResolver {
  constructor(private readonly pool: Pool) {}

  /**
   * Resolve connection details from connectionSecretRef
   * 
   * Supports patterns:
   * - Direct format: "onvif://<username>:<password>@<host>:<port>/device_service"
   * - Branch reference: "branch://<branchId>/camera/<cameraId>"
   * - Vault reference: "vault://branches/<branchId>/cameras/<cameraId>"
   * - Edge reference: "edge://<edgeAgentId>/camera/<cameraId>"
   */
  async resolve(
    connectionSecretRef: string,
    cameraId?: string,
  ): Promise<CameraConnection | null> {
    // Direct ONVIF URL format
    if (connectionSecretRef.startsWith("onvif://")) {
      return this.parseDirectOnvifUrl(connectionSecretRef);
    }

    // Branch-based credential lookup
    if (connectionSecretRef.startsWith("branch://")) {
      return this.resolveBranchCredential(connectionSecretRef, cameraId);
    }

    // Vault-based credential lookup
    if (connectionSecretRef.startsWith("vault://")) {
      return this.resolveVaultCredential(connectionSecretRef, cameraId);
    }

    // Edge agent credential lookup
    if (connectionSecretRef.startsWith("edge://")) {
      return this.resolveEdgeCredential(connectionSecretRef, cameraId);
    }

    // Fallback: try to resolve from camera record
    if (cameraId) {
      return this.resolveCameraCredential(cameraId);
    }

    return null;
  }

  /**
   * Parse direct ONVIF URL: onvif://username:password@host:port/device_service
   */
  private parseDirectOnvifUrl(url: string): CameraConnection | null {
    try {
      const parsed = new URL(url.replace("onvif://", "http://"));
      
      if (!parsed.username || !parsed.hostname) {
        return null;
      }

      const port = parsed.port ? parseInt(parsed.port, 10) : 80;
      const servicePath = parsed.pathname || "/onvif/device_service";

      return {
        host: parsed.hostname,
        port,
        credentials: {
          username: decodeURIComponent(parsed.username),
          password: decodeURIComponent(parsed.password || ""),
        },
        onvifServiceUrl: `http://${parsed.hostname}:${port}${servicePath}`,
      };
    } catch {
      return null;
    }
  }

  /**
   * Resolve credentials from branch-level storage
   * Format: branch://<branchId>/camera/<cameraId>
   */
  private async resolveBranchCredential(
    connectionSecretRef: string,
    cameraId?: string,
  ): Promise<CameraConnection | null> {
    const match = connectionSecretRef.match(/^branch:\/\/([^/]+)\/camera\/([^/]+)$/);
    if (!match) return null;

    const [, branchId, refCameraId] = match;
    const targetCameraId = cameraId || refCameraId;

    // Query camera and branch credentials
    const result = await this.pool.query<{
      ip_address: string;
      onvif_port: number | null;
      username: string | null;
      password: string | null;
      default_username?: string | null;
      default_password?: string | null;
    }>(
      `SELECT 
        c.ip_address,
        c.onvif_port,
        COALESCE(c.username, bc.default_username, 'admin') as username,
        COALESCE(c.password, bc.default_password, '') as password
       FROM cameras c
       LEFT JOIN branch_credentials bc ON bc.branch_id = c.branch_node_id
       WHERE c.id = $1 AND c.branch_node_id = $2`,
      [targetCameraId, branchId],
    );

    if (result.rows.length === 0 || !result.rows[0]?.ip_address) {
      return null;
    }

    const row = result.rows[0];
    return {
      host: row.ip_address,
      port: row.onvif_port || 80,
      credentials: {
        username: row.username || "admin",
        password: row.password || "",
      },
      onvifServiceUrl: `http://${row.ip_address}:${row.onvif_port || 80}/onvif/device_service`,
    };
  }

  /**
   * Resolve credentials from vault storage
   * Format: vault://branches/<branchId>/cameras/<cameraId>
   */
  private async resolveVaultCredential(
    connectionSecretRef: string,
    cameraId?: string,
  ): Promise<CameraConnection | null> {
    const match = connectionSecretRef.match(/^vault:\/\/branches\/([^/]+)\/cameras\/([^/]+)$/);
    if (!match) return null;

    const [, branchId, refCameraId] = match;
    const targetCameraId = cameraId || refCameraId;

    // For now, use similar logic to branch credentials
    // In production, this would integrate with SecretVaultService
    return this.resolveBranchCredential(`branch://${branchId}/camera/${targetCameraId}`, targetCameraId);
  }

  /**
   * Resolve credentials via edge agent
   * Format: edge://<edgeAgentId>/camera/<cameraId>
   */
  private async resolveEdgeCredential(
    connectionSecretRef: string,
    cameraId?: string,
  ): Promise<CameraConnection | null> {
    const match = connectionSecretRef.match(/^edge:\/\/([^/]+)\/camera\/([^/]+)$/);
    if (!match) return null;

    const [, edgeAgentId, refCameraId] = match;
    const targetCameraId = cameraId || refCameraId;

    // Edge credentials are typically managed by the edge agent
    // Control plane should not have direct access
    // This would typically require a request to the edge agent
    return null;
  }

  /**
   * Resolve credentials directly from camera record
   */
  private async resolveCameraCredential(cameraId: string): Promise<CameraConnection | null> {
    const result = await this.pool.query<CameraCredentialSource>(
      `SELECT ip_address, onvif_port, username, password
       FROM cameras
       WHERE id = $1`,
      [cameraId],
    );

    if (result.rows.length === 0 || !result.rows[0]?.ipAddress) {
      return null;
    }

    const row = result.rows[0];
    const port = row.onvifPort || 80;

    return {
      host: row.ipAddress!,
      port,
      credentials: {
        username: row.username || "admin",
        password: row.password || "",
      },
      onvifServiceUrl: `http://${row.ipAddress}:${port}/onvif/device_service`,
    };
  }

  /**
   * Get camera IP and ONVIF details from database
   */
  async getCameraOnvifEndpoint(cameraId: string): Promise<{
    host: string;
    port: number;
    serviceUrl: string;
  } | null> {
    const result = await this.pool.query<{
      ip_address: string | null;
      onvif_port: number | null;
    }>(
      `SELECT ip_address, onvif_port
       FROM cameras
       WHERE id = $1`,
      [cameraId],
    );

    if (result.rows.length === 0 || !result.rows[0]?.ip_address) {
      return null;
    }

    const row = result.rows[0];
    const port = row.onvif_port || 80;
    const ipAddress = row.ip_address;
    
    if (!ipAddress) {
      return null;
    }
    
    return {
      host: ipAddress,
      port,
      serviceUrl: `http://${ipAddress}:${port}/onvif/device_service`,
    };
  }

  /**
   * Store camera credentials securely
   */
  async storeCredentials(
    cameraId: string,
    username: string,
    password: string,
  ): Promise<void> {
    // In production, this would encrypt the password
    // For now, store as-is (should be encrypted at database level)
    await this.pool.query(
      `UPDATE cameras
       SET username = $2, password = $3, updated_at = now()
       WHERE id = $1`,
      [cameraId, username, password],
    );
  }

  /**
   * Test credentials against camera
   */
  async testCredentials(
    host: string,
    port: number,
    username: string,
    password: string,
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const { OnvifClient } = await import("../../edge-agent/src/devices/onvif-client.js");
      const client = new OnvifClient(
        `http://${host}:${port}/onvif/device_service`,
        { username, password },
        5000,
      );

      await client.ping();
      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

/**
 * Helper to parse various credential reference formats
 */
export function parseCredentialRef(ref: string): {
  type: "onvif" | "branch" | "vault" | "edge" | "unknown";
  branchId?: string;
  cameraId?: string;
  edgeAgentId?: string;
  directUrl?: string;
} {
  if (ref.startsWith("onvif://")) {
    return { type: "onvif", directUrl: ref };
  }

  const branchMatch = ref.match(/^branch:\/\/([^/]+)\/camera\/([^/]+)$/);
  if (branchMatch) {
    return { type: "branch", branchId: branchMatch[1], cameraId: branchMatch[2] };
  }

  const vaultMatch = ref.match(/^vault:\/\/branches\/([^/]+)\/cameras\/([^/]+)$/);
  if (vaultMatch) {
    return { type: "vault", branchId: vaultMatch[1], cameraId: vaultMatch[2] };
  }

  const edgeMatch = ref.match(/^edge:\/\/([^/]+)\/camera\/([^/]+)$/);
  if (edgeMatch) {
    return { type: "edge", edgeAgentId: edgeMatch[1], cameraId: edgeMatch[2] };
  }

  return { type: "unknown" };
}
