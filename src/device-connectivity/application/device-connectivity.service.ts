import { randomUUID } from "node:crypto";
import { DeviceAdapterResolver } from "../adapters/device-adapter.contract.js";
import type {
  ConnectionState,
  ConnectivityFailure,
  ConnectivityScoreBreakdown,
  DeviceCapabilities,
  DeviceCredential,
  DeviceSession,
  DeviceTarget,
  EightFactorStreamVerification,
  ModelCertificationResult,
} from "../domain/device-connectivity.types.js";

export class DeviceConnectivityService {
  private readonly sessions = new Map<string, DeviceSession>();
  private readonly states = new Map<string, ConnectionState>();
  private readonly capabilities = new Map<string, DeviceCapabilities>();
  private readonly failures = new Map<string, ConnectivityFailure>();
  private readonly verifications = new Map<string, EightFactorStreamVerification>();

  async verifyStream(_target: DeviceTarget): Promise<EightFactorStreamVerification> {
    return {
      dnsIpResolved: false,
      tcpConnected: false,
      rtspOptionsDescribeOk: false,
      authValidated: false,
      sdpParsed: false,
      setupPlayOk: false,
      rtpPacketsReceived: false,
      videoKeyframeDecoded: false,
      overallHealthy: false,
      verificationLatencyMs: 0,
    };
  }

  async onboardDevice(target: DeviceTarget, credential: DeviceCredential) {
    const deviceId = `dev-${randomUUID()}`;
    this.states.set(deviceId, "PROBING");
    try {
      const { adapter, probeResult } = await DeviceAdapterResolver.resolveBestAdapter(target);
      this.states.set(deviceId, "IDENTIFIED");
      const authResult = await adapter.authenticate(target, credential);
      if (!authResult.success || !authResult.session) {
        this.states.set(deviceId, "AUTH_FAILED");
        if (authResult.error) this.failures.set(deviceId, authResult.error);
        throw new Error(authResult.error?.message ?? "Device authentication failed");
      }
      const session = { ...authResult.session, deviceId };
      this.sessions.set(deviceId, session);
      this.states.set(deviceId, "CONNECTED");
      const capabilities = await adapter.getCapabilities(session);
      const identity = await adapter.getIdentity(session);
      this.capabilities.set(deviceId, capabilities);
      this.states.set(deviceId, "VERIFYING");
      const verification = await this.verifyStream(target);
      this.verifications.set(deviceId, verification);
      this.states.set(deviceId, verification.overallHealthy ? "HEALTHY" : "DEGRADED");
      return {
        deviceId,
        state: this.states.get(deviceId),
        adapterType: adapter.adapterType,
        adapterVersion: adapter.adapterVersion,
        identity,
        capabilities,
        verification,
        probeResult,
      };
    } catch (error) {
      if (this.states.get(deviceId) === "PROBING") this.states.set(deviceId, "INCOMPATIBLE");
      if (!this.failures.has(deviceId)) this.failures.set(deviceId, {
        category: "protocol",
        code: "NO_VERIFIED_ADAPTER",
        retryable: false,
        operatorActionRequired: true,
        message: error instanceof Error ? error.message : "No verified device adapter is available",
        occurredAt: new Date().toISOString(),
      });
      throw error;
    }
  }

  computeConnectivityScore(deviceId: string): ConnectivityScoreBreakdown {
    const verification = this.verifications.get(deviceId);
    if (!verification) return zeroScore();
    const network = (verification.dnsIpResolved ? 10 : 0) + (verification.tcpConnected ? 10 : 0);
    const authentication = verification.authValidated ? 20 : 0;
    const videoStream = [verification.rtspOptionsDescribeOk, verification.sdpParsed, verification.setupPlayOk,
      verification.rtpPacketsReceived, verification.videoKeyframeDecoded].filter(Boolean).length * 6;
    const totalScore = network + authentication + videoStream;
    return {
      network,
      authentication,
      videoStream,
      events: 0,
      storageApi: 0,
      clock: 0,
      totalScore,
      grade: totalScore >= 90 ? "A_EXCELLENT" : totalScore >= 75 ? "B_GOOD" : totalScore >= 50 ? "C_DEGRADED" : "F_CRITICAL",
    };
  }

  getHardwareCertificationMatrix(): ModelCertificationResult[] {
    return [];
  }

  getDeviceStatus(deviceId: string) {
    return {
      deviceId,
      state: this.states.get(deviceId) ?? "UNKNOWN",
      session: this.sessions.get(deviceId),
      verification: this.verifications.get(deviceId),
      failure: this.failures.get(deviceId),
      score: this.computeConnectivityScore(deviceId),
    };
  }
}

function zeroScore(): ConnectivityScoreBreakdown {
  return { network: 0, authentication: 0, videoStream: 0, events: 0, storageApi: 0, clock: 0, totalScore: 0, grade: "F_CRITICAL" };
}
