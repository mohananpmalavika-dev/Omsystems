/**
 * Camera Credential Resolver
 * Resolves connectionSecretRef to actual camera credentials
 */

import type { Pool } from "pg";
import { randomUUID } from "node:crypto";
import type { OnvifCredentials } from "../../edge-agent/src/devices/onvif-client.js";
import { encryptCameraPassword, readCameraPassword } from "../security/vault/camera-credential-codec.js";

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
      credential_id: string | null;
      ip_address: string;
      onvif_port: number | null;
      username: string | null;
      password: string | null;
      password_encrypted: string | null;
    }>(
      `SELECT c.ip_address, c.onvif_port,
              credential.id::text AS credential_id,
              credential.username, credential.password, credential.password_encrypted
       FROM cameras c
       LEFT JOIN LATERAL (
         SELECT id, username, password, password_encrypted
         FROM camera_credentials
         WHERE branch_id = c.branch_node_id
           AND scope = 'host-specific'
           AND ip_address = host(c.ip_address)
         ORDER BY updated_at DESC LIMIT 1
       ) credential ON true
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
        password: row.credential_id
          ? readCameraPassword({ id: row.credential_id, password: row.password, password_encrypted: row.password_encrypted })
          : "",
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
    const result = await this.pool.query<{ branch_node_id: string }>(
      `SELECT branch_node_id::text
       FROM cameras
       WHERE id = $1`,
      [cameraId],
    );
    const branchId = result.rows[0]?.branch_node_id;
    return branchId ? this.resolveBranchCredential(`branch://${branchId}/camera/${cameraId}`, cameraId) : null;
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
    const id = randomUUID();
    await this.pool.query(
      `INSERT INTO camera_credentials
         (id, branch_id, ip_address, username, password, password_encrypted, scope)
       SELECT $2::uuid, branch_node_id, host(ip_address), $3, '', $4, 'host-specific'
       FROM cameras WHERE id = $1 AND ip_address IS NOT NULL`,
      [cameraId, id, username, encryptCameraPassword(id, password)],
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
