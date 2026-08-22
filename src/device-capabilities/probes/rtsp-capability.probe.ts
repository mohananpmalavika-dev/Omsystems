/**
 * RTSP Capability Probe
 * 
 * Verifies streaming capabilities through RTSP protocol testing.
 */

import type {
  CapabilityProbe,
  CapabilityProbeContext,
  CapabilityObservation,
  DeviceIdentity,
} from "../capability-probe.interface.js";
import { ProbeError } from "../capability-probe.interface.js";
import { createConnection, type Socket } from "node:net";
import { connect as createTlsConnection } from "node:tls";

/**
 * RTSP capability probe.
 * 
 * This probe performs actual RTSP DESCRIBE and SETUP to verify
 * streaming capabilities at runtime.
 */
export class RtspCapabilityProbe implements CapabilityProbe {
  readonly id = "rtsp";
  readonly priority = 85;

  supports(device: DeviceIdentity): boolean {
    return !!device.rtspUri;
  }

  async probe(context: CapabilityProbeContext): Promise<CapabilityObservation[]> {
    const { device, activeVerification } = context;

    if (!device.rtspUri) {
      throw new ProbeError(
        this.id,
        device.deviceId,
        "No RTSP URI available",
      );
    }

    const observations: CapabilityObservation[] = [];

    try {
      // Always check RTSP availability
      observations.push({
        capabilityPath: "network.rtsp",
        evidence: {
          source: "RTSP",
          observedAt: new Date(),
          confidence: 1.0,
          verified: false,
          evidenceType: "RTSP URI configured",
          reason: "RTSP endpoint configured",
        },
      });

      // Perform active verification if requested
      if (activeVerification) {
        const describeResult = await this.rtspDescribe(device);

        if (describeResult.success && describeResult.sdp) {
          // Live video verified
          observations.push({
            capabilityPath: "video.liveVideo",
            evidence: {
              source: "RTSP",
              observedAt: new Date(),
              confidence: 1.0,
              verified: true,
              evidenceType: "RTSP DESCRIBE",
              reason: "RTSP stream successfully described",
              rawReference: describeResult.sdp,
            },
          });

          // Extract codec information
          observations.push(...this.extractCodecCapabilities(describeResult.sdp, device));

          // Extract stream parameters
          observations.push(
            ...this.extractStreamParameters(describeResult.sdp, device),
          );
        } else {
          observations.push({
            capabilityPath: "video.liveVideo",
            evidence: {
              source: "RTSP",
              observedAt: new Date(),
              confidence: 0,
              verified: true,
              evidenceType: "RTSP DESCRIBE",
              reason: `RTSP verification failed: ${describeResult.error}`,
            },
          });
        }
      }

      return observations;
    } catch (error) {
      throw new ProbeError(
        this.id,
        device.deviceId,
        "Failed to probe RTSP capabilities",
        error instanceof Error ? error : undefined,
      );
    }
  }

  async verify(
    context: CapabilityProbeContext,
    capabilityPath: string,
  ): Promise<CapabilityObservation | null> {
    // For RTSP, perform active verification
    const verificationContext = { ...context, activeVerification: true };
    const observations = await this.probe(verificationContext);
    return observations.find((obs) => obs.capabilityPath === capabilityPath) ?? null;
  }

  // ============ PRIVATE METHODS ============

  private async rtspDescribe(device: DeviceIdentity): Promise<{
    success: boolean;
    sdp?: string;
    error?: string;
  }> {
    if (!device.rtspUri) {
      return {
        success: false,
        error: "No RTSP URI",
      };
    }

    try {
      const endpoint = new URL(device.rtspUri);
      if (endpoint.protocol !== "rtsp:" && endpoint.protocol !== "rtsps:") {
        return { success: false, error: `Unsupported RTSP protocol ${endpoint.protocol}` };
      }
      const secure = endpoint.protocol === "rtsps:";
      const port = endpoint.port ? Number(endpoint.port) : secure ? 322 : 554;
      const requestEndpoint = new URL(endpoint);
      requestEndpoint.username = "";
      requestEndpoint.password = "";

      return await new Promise((resolve) => {
        let response = Buffer.alloc(0);
        let settled = false;
        const finish = (result: { success: boolean; sdp?: string; error?: string }) => {
          if (settled) return;
          settled = true;
          socket.destroy();
          resolve(result);
        };
        const onConnected = () => {
          socket.write(
            `DESCRIBE ${requestEndpoint.toString()} RTSP/1.0\r\nCSeq: 1\r\nAccept: application/sdp\r\nUser-Agent: Sentinel-Grid/1.0\r\n\r\n`,
          );
        };
        const socket: Socket = secure
          ? createTlsConnection({ host: endpoint.hostname, port, servername: endpoint.hostname, rejectUnauthorized: true }, onConnected)
          : createConnection({ host: endpoint.hostname, port }, onConnected);
        socket.setTimeout(5_000);
        socket.on("data", (chunk: Buffer) => {
          response = Buffer.concat([response, chunk]);
          const headerEnd = response.indexOf("\r\n\r\n");
          if (headerEnd < 0) return;
          const headers = response.subarray(0, headerEnd).toString("utf8");
          const statusCode = Number(headers.match(/^RTSP\/\d\.\d\s+(\d{3})/i)?.[1]);
          const contentLength = Number(headers.match(/\r\nContent-Length:\s*(\d+)/i)?.[1] ?? 0);
          if (statusCode !== 200) {
            finish({ success: false, error: `RTSP DESCRIBE returned ${Number.isFinite(statusCode) ? statusCode : "an invalid response"}` });
            return;
          }
          const body = response.subarray(headerEnd + 4);
          if (body.length < contentLength) return;
          const sdp = body.subarray(0, contentLength || body.length).toString("utf8").trim();
          finish(sdp ? { success: true, sdp } : { success: false, error: "RTSP DESCRIBE returned no SDP" });
        });
        socket.on("timeout", () => finish({ success: false, error: "RTSP DESCRIBE timed out" }));
        socket.on("error", (error) => finish({ success: false, error: error.message }));
        socket.on("close", () => {
          if (!settled) finish({ success: false, error: "RTSP connection closed before a complete response" });
        });
      });
    } catch (error) {
      return { success: false, error: error instanceof Error ? error.message : "Invalid RTSP endpoint" };
    }
  }

  private extractCodecCapabilities(
    sdp: string,
    device: DeviceIdentity,
  ): CapabilityObservation[] {
    const observations: CapabilityObservation[] = [];

    // Check for H.264
    if (sdp.includes("H264") || sdp.includes("h264")) {
      observations.push({
        capabilityPath: "video.codecs.h264",
        evidence: {
          source: "RTSP",
          observedAt: new Date(),
          confidence: 1.0,
          verified: true,
          evidenceType: "RTSP SDP",
          reason: "H.264 codec found in SDP",
        },
      });
    }

    // Check for H.265
    if (sdp.includes("H265") || sdp.includes("h265") || sdp.includes("HEVC")) {
      observations.push({
        capabilityPath: "video.codecs.h265",
        evidence: {
          source: "RTSP",
          observedAt: new Date(),
          confidence: 1.0,
          verified: true,
          evidenceType: "RTSP SDP",
          reason: "H.265 codec found in SDP",
        },
      });
    }

    // Check for MJPEG
    if (sdp.includes("JPEG") || sdp.includes("MJPEG")) {
      observations.push({
        capabilityPath: "video.codecs.mjpeg",
        evidence: {
          source: "RTSP",
          observedAt: new Date(),
          confidence: 1.0,
          verified: true,
          evidenceType: "RTSP SDP",
          reason: "MJPEG codec found in SDP",
        },
      });
    }

    // Check for audio
    if (sdp.includes("m=audio")) {
      observations.push({
        capabilityPath: "audio.audioInput",
        evidence: {
          source: "RTSP",
          observedAt: new Date(),
          confidence: 0.9,
          verified: true,
          evidenceType: "RTSP SDP",
          reason: "Audio stream present in SDP",
        },
      });
    }

    return observations;
  }

  private extractStreamParameters(
    sdp: string,
    device: DeviceIdentity,
  ): CapabilityObservation[] {
    const observations: CapabilityObservation[] = [];

    // Count video streams
    const videoMatches = sdp.match(/m=video/g);
    const videoStreamCount = videoMatches ? videoMatches.length : 0;

    if (videoStreamCount > 0) {
      observations.push({
        capabilityPath: "video.streams",
        evidence: {
          source: "RTSP",
          observedAt: new Date(),
          confidence: 1.0,
          verified: true,
          evidenceType: "RTSP SDP",
          reason: `${videoStreamCount} video stream(s) found`,
        },
        value: videoStreamCount,
      });
    }

    return observations;
  }
}
