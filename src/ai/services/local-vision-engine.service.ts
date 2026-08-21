/**
 * Local Open-Source Vision Engine Service
 * 
 * Runs 100% locally on CPU / Integrated GPU / Edge device without cloud APIs.
 * Normalizes real native hardware AI events. Local model inference must be
 * provided by a configured inference runtime before raw frames are accepted.
 */

import { randomUUID } from "node:crypto";
import type { 
  LocalVisionDetection, 
  DetectedObjectClass, 
  CameraTamperResult,
  LocalAiEngineStatus,
  BoundingBox
} from "../domain/local-ai.types.js";

export class LocalVisionEngineService {
  private activeStreams = new Set<string>();
  private inferenceCount = 0;
  private totalLatencyMs = 0;

  /**
   * Process a camera frame or metadata stream using local open-source models
   */
  async processFrame(options: {
    cameraId: string;
    branchId: string;
    zone?: "VAULT" | "ENTRANCE" | "CASH_COUNTER" | "ATM_LOBBY" | "PERIMETER" | "PARKING" | "GENERAL";
    rawImageData?: string;
    hardwareEvent?: {
      vendor: "CP_PLUS" | "DAHUA" | "HIKVISION" | "ONVIF";
      eventType: string;
      confidence: number;
      boundingBox?: BoundingBox;
      trackId?: string;
    };
  }): Promise<LocalVisionDetection[]> {
    const startTime = Date.now();
    const detectedAt = new Date();
    this.activeStreams.add(options.cameraId);

    const detections: LocalVisionDetection[] = [];

    // 1. If camera has native onboard hardware AI (CP PLUS / Dahua / Hikvision)
    if (options.hardwareEvent) {
      const classification = this.mapVendorClassification(options.hardwareEvent.eventType);
      const modelType = options.hardwareEvent.vendor === "CP_PLUS" 
        ? "CP_PLUS_IVS" 
        : options.hardwareEvent.vendor === "DAHUA" 
          ? "DAHUA_SMD" 
          : options.hardwareEvent.vendor === "HIKVISION" 
            ? "HIKVISION_ACUSENSE" 
            : "ONVIF_ONBOARD_AI";

      detections.push({
        id: `det-${randomUUID()}`,
        cameraId: options.cameraId,
        branchId: options.branchId,
        detectedAt,
        classification,
        confidence: options.hardwareEvent.confidence,
        boundingBox: options.hardwareEvent.boundingBox,
        trackId: options.hardwareEvent.trackId,
        zone: options.zone ?? "GENERAL",
        modelUsed: modelType,
      });
    } else {
      throw new Error("Local frame inference runtime is not configured");
    }

    const latency = Date.now() - startTime;
    this.inferenceCount += 1;
    this.totalLatencyMs += latency;

    return detections;
  }

  /**
   * Verify camera tampering, lens obstruction, and video freeze using local OpenCV analysis
   */
  async evaluateCameraTampering(options: {
    cameraId: string;
    branchId: string;
    frameVariance?: number;
    ssimScore?: number;
    isStreamReceivingBytes?: boolean;
  }): Promise<CameraTamperResult> {
    const evaluatedAt = new Date();
    if (options.frameVariance === undefined || options.ssimScore === undefined || options.isStreamReceivingBytes === undefined) {
      throw new Error("Observed frame variance, SSIM, and stream byte status are required");
    }
    const variance = options.frameVariance;
    const ssim = options.ssimScore;
    const receivingBytes = options.isStreamReceivingBytes;
    if (!receivingBytes) {
      throw new Error("Tamper analysis is unavailable because the stream is not receiving frames");
    }

    // Check for black frame or zero variance
    if (variance < 5.0) {
      return {
        cameraId: options.cameraId,
        branchId: options.branchId,
        evaluatedAt,
        isTampered: true,
        tamperType: "BLACK_FRAME",
        confidence: 0.99,
        varianceScore: variance,
      };
    }

    // Check for frozen frame (identical consecutive frames with SSIM > 0.999 while active)
    if (ssim > 0.998) {
      return {
        cameraId: options.cameraId,
        branchId: options.branchId,
        evaluatedAt,
        isTampered: true,
        tamperType: "FROZEN_VIDEO",
        confidence: 0.97,
        ssimScore: ssim,
      };
    }

    // Check for lens occlusion (abrupt drop in edge sharpness & high uniform color)
    if (variance < 15.0 && ssim < 0.3) {
      return {
        cameraId: options.cameraId,
        branchId: options.branchId,
        evaluatedAt,
        isTampered: true,
        tamperType: "OCCLUSION",
        confidence: 0.92,
        ssimScore: ssim,
      };
    }

    return {
      cameraId: options.cameraId,
      branchId: options.branchId,
      evaluatedAt,
      isTampered: false,
      tamperType: "NONE",
      confidence: 0.98,
      ssimScore: ssim,
      varianceScore: variance,
    };
  }

  /**
   * Return local AI engine status and confirm zero external cloud cost
   */
  getStatus(): LocalAiEngineStatus {
    return {
      online: false,
      runtime: "LOCAL_NODEJS_ONNX",
      availableModels: [],
      activeStreamsProcessed: this.activeStreams.size,
      averageInferenceLatencyMs: this.inferenceCount > 0 
        ? Math.round(this.totalLatencyMs / this.inferenceCount) 
        : 0,
      monthlyCloudCost: 0,
      externalApiDependencies: [],
    };
  }

  private mapVendorClassification(eventType: string): DetectedObjectClass {
    const lower = eventType.toLowerCase();
    if (lower.includes("human") || lower.includes("person") || lower.includes("pedestrian")) return "PERSON";
    if (lower.includes("car") || lower.includes("vehicle") || lower.includes("truck")) return "VEHICLE";
    if (lower.includes("motorcycle") || lower.includes("bike")) return "MOTORCYCLE";
    if (lower.includes("bag") || lower.includes("luggage")) return "BAG";
    if (lower.includes("weapon") || lower.includes("gun")) return "WEAPON_HAZARD";
    if (lower.includes("fire") || lower.includes("smoke")) return "SMOKE_FIRE";
    return "UNKNOWN";
  }
}

export const localVisionEngineService = new LocalVisionEngineService();
