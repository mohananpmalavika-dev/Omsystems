/**
 * Zero-Touch Enrollment Service
 * Generates single-use signed enrollment codes and cross-platform 1-line unattended installers.
 * Exchanges enrollment tokens for mTLS device credentials and branch scan profiles.
 */

import { EventEmitter } from "node:events";
import { createHash, randomBytes } from "node:crypto";
import type { EnrollmentToken, BranchOnboardingStatus, OnboardingStage } from "../domain/zero-touch.types.js";

export class ZeroTouchEnrollmentService extends EventEmitter {
  private tokens = new Map<string, EnrollmentToken>(); // token -> record
  private branchStatuses = new Map<string, BranchOnboardingStatus>(); // branchId -> status

  constructor(private controlPlaneBaseUrl = "https://control.sentinelgrid.internal") {
    super();
  }

  /**
   * Generates a 24-hour single-use enrollment token with 1-line unattended installer scripts
   */
  public generateEnrollmentToken(
    branchId: string,
    branchName: string,
    tenantId = "tenant-bank-01",
    expiryHours = 24,
  ): EnrollmentToken {
    // Format: ENROLL-<BRANCH_CODE>-<RANDOM_HEX>
    const cleanBranch = branchId.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
    const token = `ENROLL-${cleanBranch}-${randomBytes(4).toString("hex").toUpperCase()}`;
    const expiresAt = new Date(Date.now() + expiryHours * 3600 * 1000).toISOString();

    const controlPlaneUrl = this.controlPlaneBaseUrl;

    const windowsPowerShell = `powershell -NoProfile -ExecutionPolicy Bypass -Command "iwr -useb ${controlPlaneUrl}/v1/bootstrap/win?token=${token} | iex"`;
    const linuxBash = `curl -fsSL ${controlPlaneUrl}/v1/bootstrap/linux?token=${token} | bash`;
    const dockerCompose = `docker run -d --restart always --net host -e ENROLLMENT_TOKEN="${token}" -e CONTROL_PLANE_URL="${controlPlaneUrl}" sentinelgrid/edge-agent:latest`;

    const record: EnrollmentToken = {
      token,
      branchId,
      tenantId,
      controlPlaneUrl,
      expiresAt,
      isUsed: false,
      installerScripts: {
        windowsPowerShell,
        linuxBash,
        dockerCompose,
      },
    };

    this.tokens.set(token, record);

    // Initialize branch onboarding state
    this.branchStatuses.set(branchId, {
      branchId,
      branchName,
      tenantId,
      currentStage: "ENROLLMENT_GENERATED",
      stageProgressPct: 10,
      enrollmentCode: token,
      agentConnected: false,
      camerasDiscovered: 0,
      camerasProvisioned: 0,
      elapsedSeconds: 0,
      lastUpdated: new Date().toISOString(),
    });

    this.emit("token:generated", { token, branchId });
    return record;
  }

  /**
   * Exchanges an enrollment token for mTLS device credentials and branch scan profile
   */
  public exchangeToken(
    token: string,
    agentHardwareInfo: {
      hostname: string;
      platform: "win32" | "linux" | "docker";
      macAddress: string;
    },
  ): {
    success: boolean;
    branchId?: string;
    tenantId?: string;
    agentId?: string;
    mtlsCredentials?: {
      clientCertPem: string;
      clientKeyPem: string;
      caCertPem: string;
      pinnedFingerprint: string;
    };
    scanProfile?: {
      defaultSubnets: string[];
      credentialProfiles: Array<{ vendor: string; defaultUsername: string; defaultPasswordRef: string }>;
      autoApprove: boolean;
    };
    error?: string;
  } {
    const record = this.tokens.get(token);
    if (!record) {
      return { success: false, error: "Invalid or nonexistent enrollment token" };
    }

    if (record.isUsed) {
      return { success: false, error: "Enrollment token has already been used (single-use policy)" };
    }

    if (new Date() > new Date(record.expiresAt)) {
      return { success: false, error: "Enrollment token has expired" };
    }

    // Mark token as used
    const agentId = `agent-${record.branchId.toLowerCase()}`;
    record.isUsed = true;
    record.usedAt = new Date().toISOString();
    record.enrolledAgentId = agentId;

    // Generate mock X.509 mTLS certificate for the device
    const certFingerprint = createHash("sha256").update(`${token}-${agentId}`).digest("hex");

    // Update branch onboarding state
    this.updateBranchStage(record.branchId, "AGENT_ENROLLED", 25);
    const status = this.branchStatuses.get(record.branchId);
    if (status) status.agentConnected = true;

    this.emit("agent:enrolled", { token, branchId: record.branchId, agentId, agentHardwareInfo });

    return {
      success: true,
      branchId: record.branchId,
      tenantId: record.tenantId,
      agentId,
      mtlsCredentials: {
        clientCertPem: `-----BEGIN CERTIFICATE-----\nMIIC...${certFingerprint.substring(0, 32)}...END CERTIFICATE-----`,
        clientKeyPem: `-----BEGIN PRIVATE KEY-----\nMIIE...${certFingerprint.substring(32, 64)}...END PRIVATE KEY-----`,
        caCertPem: `-----BEGIN CERTIFICATE-----\nMIIC...CA_ROOT...END CERTIFICATE-----`,
        pinnedFingerprint: certFingerprint,
      },
      scanProfile: {
        defaultSubnets: ["192.168.1.0/24", "10.0.0.0/24"],
        credentialProfiles: [
          { vendor: "CP_PLUS", defaultUsername: "admin", defaultPasswordRef: "VAULT_CPPLUS_DEFAULT" },
          { vendor: "DAHUA", defaultUsername: "admin", defaultPasswordRef: "VAULT_DAHUA_DEFAULT" },
          { vendor: "HIKVISION", defaultUsername: "admin", defaultPasswordRef: "VAULT_HIKVISION_DEFAULT" },
          { vendor: "AXIS", defaultUsername: "root", defaultPasswordRef: "VAULT_AXIS_DEFAULT" },
        ],
        autoApprove: true,
      },
    };
  }

  /**
   * Returns current onboarding status for a branch
   */
  public getBranchStatus(branchId: string): BranchOnboardingStatus | undefined {
    return this.branchStatuses.get(branchId);
  }

  /**
   * Updates current onboarding stage and progress percentage
   */
  public updateBranchStage(branchId: string, stage: OnboardingStage, progressPct: number, error?: string): void {
    const status = this.branchStatuses.get(branchId);
    if (status) {
      status.currentStage = stage;
      status.stageProgressPct = progressPct;
      status.lastUpdated = new Date().toISOString();
      if (error) status.error = error;
      this.emit("stage:updated", { branchId, stage, progressPct });
    }
  }

  /**
   * Lists all branches undergoing zero-touch onboarding
   */
  public listBranchStatuses(): BranchOnboardingStatus[] {
    return Array.from(this.branchStatuses.values());
  }
}

export const zeroTouchEnrollmentService = new ZeroTouchEnrollmentService();
