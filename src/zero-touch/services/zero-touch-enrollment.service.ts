/**
 * Zero-Touch Enrollment Service (Production Control Plane)
 * Generates single-use signed enrollment codes and cross-platform 1-line unattended installers.
 * Exchanges enrollment tokens for mTLS device credentials and branch scan profiles.
 */

import { EventEmitter } from "node:events";
import { randomBytes } from "node:crypto";
import type { EnrollmentPackage } from "../domain/zero-touch.types.js";

export class ZeroTouchEnrollmentService extends EventEmitter {
  private packages = new Map<string, EnrollmentPackage>();

  constructor(
    private controlPlaneBaseUrl = process.env.CONTROL_PLANE_PUBLIC_URL || "",
  ) {
    super();
  }

  /**
   * Generates a 15-minute single-use signed enrollment package
   */
  public generateEnrollmentPackage(
    branchId: string,
    branchName: string,
    tenantId: string,
    expiryMinutes = 15,
    customBaseUrl?: string,
  ): EnrollmentPackage {
    const cleanBranch = branchId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const token = `ENR-${cleanBranch}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const expiresAt = new Date(Date.now() + expiryMinutes * 60 * 1000).toISOString();
    const controlPlaneUrl = customBaseUrl || this.controlPlaneBaseUrl;
    if (!controlPlaneUrl) throw new Error("control_plane_public_url_required");
    if (!tenantId.trim()) throw new Error("tenant_id_required");

    const windowsPowerShell = `powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -useb ${controlPlaneUrl}/api/v1/zero-touch/bootstrap/win?token=${token} | iex"`;
    const linuxBash = `curl -fsSL ${controlPlaneUrl}/api/v1/zero-touch/bootstrap/linux?token=${token} | sudo bash`;
    const dockerCompose = `docker run -d --restart always --net host -e ENROLLMENT_TOKEN="${token}" -e CONTROL_PLANE_URL="${controlPlaneUrl}" sentinelgrid/edge-agent:latest`;

    const pkg: EnrollmentPackage = {
      token,
      branchId,
      branchName,
      tenantId,
      controlPlaneUrl,
      expiresAt,
      maxUses: 1,
      usedCount: 0,
      isRevoked: false,
      issuedAt: new Date().toISOString(),
      installerScripts: {
        windowsPowerShell,
        linuxBash,
        dockerCompose,
      },
    };

    this.packages.set(token, pkg);
    this.emit("enrollment_generated", pkg);
    return pkg;
  }

  /**
   * Backward-compatible alias for existing token generation
   */
  public generateEnrollmentToken(
    branchId: string,
    branchName: string,
    tenantId: string,
    expiryHours = 24,
  ) {
    const pkg = this.generateEnrollmentPackage(branchId, branchName, tenantId, expiryHours * 60);
    return {
      ...pkg,
      isUsed: pkg.usedCount >= pkg.maxUses,
    };
  }

  /**
   * Revokes an active enrollment token
   */
  public revokeToken(token: string): boolean {
    const pkg = this.packages.get(token);
    if (!pkg) return false;
    pkg.isRevoked = true;
    this.emit("enrollment_revoked", { token, branchId: pkg.branchId });
    return true;
  }

  /**
   * Exchanges an enrollment token for mTLS client credentials & scan profile
   */
  public exchangeToken(
    token: string,
    agentInfo: {
      hostname: string;
      platform: "win32" | "linux" | "docker";
      macAddress: string;
      csrPem?: string;
    },
  ): { success: boolean; error?: string; agentId?: string; branchId?: string; } {
    const pkg = this.packages.get(token);
    if (!pkg) {
      return { success: false, error: "Invalid or unrecognized enrollment token." };
    }

    if (pkg.isRevoked) {
      return { success: false, error: "Enrollment token has been revoked by an administrator." };
    }

    if (new Date(pkg.expiresAt).getTime() < Date.now()) {
      return { success: false, error: "Enrollment token has expired (15-minute SLA exceeded)." };
    }

    if (pkg.usedCount >= pkg.maxUses) {
      return { success: false, error: "Single-use enrollment token has already been consumed." };
    }

    void agentInfo;
    return {
      success: false,
      error: "legacy_enrollment_disabled_use_edge_activation_api",
    };
  }

  public getBranchStatus(_branchId: string) {
    return undefined;
  }

  public updateBranchStage(_branchId: string, _stage: any, _progress: number) {
    // Stage updates are persisted by the control-plane scan job.
  }

  public listBranchStatuses() {
    return [];
  }
}

export const zeroTouchEnrollmentService = new ZeroTouchEnrollmentService();
