/**
 * Camera Health Service & Tiered Probe Orchestrator
 * 
 * Coordinates multi-layer probes across branch cameras without saturating edge CPU.
 */

import type {
  CameraConfiguration,
  CameraHealth,
  BranchCameraHealthSummary,
  StreamProbeResult,
  DecodeProbeResult,
  FreezeAnalysis,
} from "./types.js";
import { networkProbe, NetworkProbe } from "./network-probe.js";
import { rtspProbe, RtspProbe } from "./rtsp-probe.js";
import { decodeProbe, DecodeProbe } from "./decode-probe.js";
import { freezeDetector, FreezeDetector } from "./freeze-detector.js";
import { cameraHealthEvaluator, CameraHealthEvaluator } from "./camera-health-evaluator.js";

export class CameraHealthService {
  constructor(
    private readonly netProbe: NetworkProbe = networkProbe,
    private readonly streamProbe: RtspProbe = rtspProbe,
    private readonly decProbe: DecodeProbe = decodeProbe,
    private readonly frzDetector: FreezeDetector = freezeDetector,
    private readonly evaluator: CameraHealthEvaluator = cameraHealthEvaluator
  ) {}

  async checkCamera(camera: CameraConfiguration): Promise<CameraHealth> {
    const observedAt = new Date();

    // 1. Layer 1: Network probe
    let network;
    try {
      network = await this.netProbe.probe(camera);
    } catch {
      // A failed collector must be visible as missing evidence, never crash a
      // branch sweep or be misclassified as a camera outage.
      return this.evaluator.evaluate({ camera, observedAt });
    }

    // A failed TCP probe is sufficient evidence for a critical path fault; do
    // not consume RTSP/decoder capacity for a camera that cannot be reached.
    if (!network.reachable) {
      return this.evaluator.evaluate({
        camera,
        network,
        observedAt,
      });
    }

    // 2. Layer 2: RTSP inspection
    let stream: StreamProbeResult | undefined;
    try {
      stream = await this.streamProbe.inspect(camera);
    } catch {
      return this.evaluator.evaluate({ camera, network, observedAt });
    }

    // 3. Layer 3: Selective frame decode sample
    let decode: DecodeProbeResult | undefined;
    if (stream.reachable) {
      try {
        decode = await this.decProbe.sample(camera);
      } catch {
        return this.evaluator.evaluate({ camera, network, stream, observedAt });
      }
    }

    // 4. Layer 4: Freeze analysis
    let freeze: FreezeAnalysis | undefined;
    if (decode?.decodable) {
      try {
        freeze = await this.frzDetector.analyze(camera);
      } catch {
        return this.evaluator.evaluate({ camera, network, stream, decode, observedAt });
      }
    }

    return this.evaluator.evaluate({
      camera,
      network,
      stream,
      decode,
      freeze,
      observedAt,
    });
  }

  async checkBranchCameras(branchId: string, cameras: CameraConfiguration[]): Promise<BranchCameraHealthSummary> {
    const results: CameraHealth[] = [];
    for (const camera of cameras) {
      results.push(await this.checkCamera(camera));
    }

    const totalCameras = results.length;
    const healthyCameras = results.filter((c) => c.state === "HEALTHY").length;
    const degradedCameras = results.filter((c) => c.state === "DEGRADED").length;
    const criticalCameras = results.filter((c) => c.state === "CRITICAL").length;
    const unknownCameras = results.filter((c) => c.state === "UNKNOWN").length;

    const streamingActive = results.filter((c) => c.streamReachable).length;
    const decodableActive = results.filter((c) => c.framesDecodable).length;
    const recordingActive = results.filter((c) => c.recordingActive).length;

    return {
      branchId,
      observedAt: new Date(),
      totalCameras,
      healthyCameras,
      degradedCameras,
      criticalCameras,
      unknownCameras,
      streamingCoverage: {
        active: streamingActive,
        total: totalCameras,
        fraction: `${streamingActive}/${totalCameras}`,
      },
      decodableCoverage: {
        active: decodableActive,
        total: totalCameras,
        fraction: `${decodableActive}/${totalCameras}`,
      },
      recordingCoverage: {
        active: recordingActive,
        total: totalCameras,
        fraction: `${recordingActive}/${totalCameras}`,
      },
      cameras: results,
    };
  }
}

export const cameraHealthService = new CameraHealthService();
