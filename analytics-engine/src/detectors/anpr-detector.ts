/**
 * ANPR (Automatic Number Plate Recognition) Detector
 * Detects vehicles and reads license plates
 */

import {
  BaseDetector,
  type DetectedObject,
  type DetectionFrame,
  type DetectionResult,
  getInferenceObjects,
  normalizeBoundingBox,
  shouldRunLocalSpecialtyInference,
} from "./base-detector.js";
import {
  loadObjectInference,
  loadPlateTextInference,
  modelUnavailableReason,
  type ObjectFrameInference,
  type PlateTextInference,
} from "../inference/configured-model-inference.js";

export interface ANPRConfig {
  modelPath?: string;
  plateConfidence: number;
  ocrConfidence: number;
  countryCode: string; // e.g., "IN", "US", "UK"
  plateFormats: RegExp[]; // Expected plate formats
  watchlistEnabled: boolean;
}

export interface PlateReading {
  plateNumber: string;
  confidence: number;
  country: string;
  region?: string;
  characters: Array<{
    char: string;
    confidence: number;
    bbox: { x: number; y: number; width: number; height: number };
  }>;
  plateType?: "standard" | "commercial" | "government" | "diplomatic";
}

export interface VehicleInfo {
  type: "car" | "motorcycle" | "bus" | "truck";
  color?: string;
  make?: string;
  model?: string;
}

export interface WatchlistPlate {
  plateNumber: string;
  reason: string;
  severity: "critical" | "high" | "medium";
  alertAuthorities: boolean;
  metadata?: Record<string, unknown>;
}

export interface ANPRInference {
  detection?: ObjectFrameInference;
  recognition?: PlateTextInference;
}

export class ANPRDetector extends BaseDetector {
  private config: ANPRConfig;
  private detectionModel: ObjectFrameInference | null;
  private ocrModel: PlateTextInference | null;
  private modelLoadError: string | null = null;
  private watchlists = new Map<string, WatchlistPlate[]>();
  private isInitialized = false;

  // Indian plate format examples
  private static readonly INDIAN_FORMATS = [
    /^[A-Z]{2}[0-9]{2}[A-Z]{1,2}[0-9]{4}$/, // Standard: DL01CA1234
    /^[A-Z]{2}[0-9]{2}[0-9]{4}$/, // Old format: DL011234
    /^[0-9]{2}BH[0-9]{4}[A-Z]{1,2}$/, // Bharat series: 22BH1234AB
  ];

  constructor(config: Partial<ANPRConfig> = {}, inference: ANPRInference = {}) {
    super("anpr", "1.0.0");
    this.detectionModel = inference.detection ?? null;
    this.ocrModel = inference.recognition ?? null;
    this.config = {
      plateConfidence: config.plateConfidence ?? 0.7,
      ocrConfidence: config.ocrConfidence ?? 0.8,
      countryCode: config.countryCode ?? "IN",
      plateFormats: config.plateFormats ?? ANPRDetector.INDIAN_FORMATS,
      watchlistEnabled: config.watchlistEnabled ?? false,
      modelPath: config.modelPath,
    };
  }

  async initialize(): Promise<void> {
    try {
      this.detectionModel ??= await loadObjectInference("anpr-detector", this.config.plateConfidence);
      this.ocrModel ??= await loadPlateTextInference("anpr-recognizer");
      this.modelLoadError = null;
      console.log("ANPR detector loaded local plate detection and CTC recognition models");
    } catch (error) {
      this.detectionModel = null;
      this.ocrModel = null;
      this.modelLoadError = error instanceof Error ? error.message : `${modelUnavailableReason("anpr-detector")}; ${modelUnavailableReason("anpr-recognizer")}`;
      console.warn(`ANPR detector running in normalized-observation mode: ${this.modelLoadError}`);
    }
    this.isInitialized = true;
  }

  async detect(frame: DetectionFrame): Promise<DetectionResult[]> {
    if (!this.isInitialized) {
      throw new Error("ANPRDetector not initialized");
    }

    const normalizedReadings = await this.readPlateObservations(frame);

    const results: DetectionResult[] = [];
    const plateObjects: Array<
      DetectedObject & { plateReading?: PlateReading; vehicle?: VehicleInfo; watchlistMatch?: WatchlistPlate }
    > = [];

    for (const reading of normalizedReadings) {
      if (reading.plateReading.confidence < this.config.ocrConfidence) continue;

      // Validate plate format
      if (!this.validatePlateFormat(reading.plateReading.plateNumber)) {
        continue;
      }

      const normalizedBox = normalizeBoundingBox(
        reading.boundingBox,
        frame.width,
        frame.height,
      );

      const plateObj: DetectedObject & {
        plateReading?: PlateReading;
        vehicle?: VehicleInfo;
        watchlistMatch?: WatchlistPlate;
      } = {
        label: "license-plate",
        confidence: reading.plateReading.confidence,
        boundingBox: normalizedBox,
        trackId: reading.trackId,
        plateReading: reading.plateReading,
        vehicle: reading.vehicle,
      };

      // Check watchlist
      if (this.config.watchlistEnabled) {
        const match = this.checkWatchlist(
          reading.plateReading.plateNumber,
          frame.tenantId,
        );
        if (match) {
          plateObj.watchlistMatch = match;
        }
      }

      plateObjects.push(plateObj);
    }

    if (plateObjects.length > 0) {
      // ANPR detection event
      results.push({
        detectionType: "anpr",
        confidence: Math.max(...plateObjects.map((p) => p.confidence)),
        objects: plateObjects,
        metadata: {
          plateCount: plateObjects.length,
          plates: plateObjects.map((p) => p.plateReading!.plateNumber),
        },
        requiresAlert: false, // ANPR alone doesn't alert
      });

      // Watchlist matches (if any)
      const watchlistMatches = plateObjects.filter((p) => p.watchlistMatch);
      if (watchlistMatches.length > 0) {
        results.push({
          detectionType: "watchlist-match",
          confidence: 1.0,
          objects: watchlistMatches,
          metadata: {
            matchCount: watchlistMatches.length,
            matches: watchlistMatches.map((p) => ({
              plateNumber: p.plateReading!.plateNumber,
              reason: p.watchlistMatch!.reason,
              severity: p.watchlistMatch!.severity,
            })),
          },
          requiresAlert: true, // Watchlist match requires immediate alert
        });
      }
    }

    return results;
  }

  /**
   * Validate plate number against known formats
   */
  private validatePlateFormat(plateNumber: string): boolean {
    return this.config.plateFormats.some((format) => format.test(plateNumber));
  }

  /**
   * Check if plate is on watchlist
   */
  private checkWatchlist(
    plateNumber: string,
    tenantId: string,
  ): WatchlistPlate | null {
    const watchlist = this.watchlists.get(tenantId);
    if (!watchlist) return null;

    // Normalize plate number (remove spaces, uppercase)
    const normalizedPlate = plateNumber.replace(/\s+/g, "").toUpperCase();

    return (
      watchlist.find(
        (entry) =>
          entry.plateNumber.replace(/\s+/g, "").toUpperCase() === normalizedPlate,
      ) || null
    );
  }

  /**
   * Load watchlist for a tenant
   */
  async loadWatchlist(tenantId: string, plates: WatchlistPlate[]): Promise<void> {
    this.watchlists.set(tenantId, plates);
    console.log(
      `Loaded ANPR watchlist for tenant ${tenantId} with ${plates.length} plates`,
    );
  }

  /**
   * Add plate to watchlist
   */
  async addToWatchlist(
    tenantId: string,
    plate: WatchlistPlate,
  ): Promise<void> {
    const watchlist = this.watchlists.get(tenantId) || [];
    watchlist.push(plate);
    this.watchlists.set(tenantId, watchlist);
  }

  /**
   * Remove plate from watchlist
   */
  async removeFromWatchlist(
    tenantId: string,
    plateNumber: string,
  ): Promise<void> {
    const watchlist = this.watchlists.get(tenantId);
    if (!watchlist) return;

    const normalizedPlate = plateNumber.replace(/\s+/g, "").toUpperCase();
    const filtered = watchlist.filter(
      (entry) =>
        entry.plateNumber.replace(/\s+/g, "").toUpperCase() !== normalizedPlate,
    );
    this.watchlists.set(tenantId, filtered);
  }

  /**
   * Clear watchlist for a tenant
   */
  clearWatchlist(tenantId: string): void {
    this.watchlists.delete(tenantId);
  }

  /**
   * Normalize observations produced by a dedicated plate/OCR model worker.
   */
  private async readPlateObservations(frame: DetectionFrame): Promise<Array<{
    confidence: number;
    boundingBox: { x: number; y: number; width: number; height: number };
    trackId?: string;
    plateReading: PlateReading;
    vehicle?: VehicleInfo;
  }>> {
    const runLocal = shouldRunLocalSpecialtyInference(frame) && this.detectionModel && this.ocrModel;
    const localPlates = runLocal
      ? (await this.detectionModel!.run(frame)).filter((item) => item.label === "license-plate")
      : [];
    const localReadings = await Promise.all(localPlates.map(async (item) => {
      const recognition = await this.ocrModel!.run(frame, item.boundingBox);
      const text = recognition.text.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      const characterWidth = text.length > 0 ? 1 / text.length : 1;
      return {
        confidence: Math.min(item.confidence, recognition.confidence),
        boundingBox: {
          x: item.boundingBox.x * frame.width,
          y: item.boundingBox.y * frame.height,
          width: item.boundingBox.width * frame.width,
          height: item.boundingBox.height * frame.height,
        },
        trackId: item.trackId,
        plateReading: {
          plateNumber: text,
          confidence: Math.min(item.confidence, recognition.confidence),
          country: this.config.countryCode,
          characters: recognition.characters.map((character, index) => ({
            ...character,
            bbox: { x: index * characterWidth, y: 0, width: characterWidth, height: 1 },
          })),
        },
      };
    }));
    const normalized = getInferenceObjects(frame, ["license-plate"]).flatMap((item) => {
      const plateNumber = item.attributes?.plateNumber;
      if (typeof plateNumber !== "string") return [];
      const normalized = plateNumber.replace(/[^a-zA-Z0-9]/g, "").toUpperCase();
      return [{
        confidence: item.confidence,
        boundingBox: {
          x: item.boundingBox.x * frame.width,
          y: item.boundingBox.y * frame.height,
          width: item.boundingBox.width * frame.width,
          height: item.boundingBox.height * frame.height,
        },
        trackId: item.trackId,
        plateReading: {
          plateNumber: normalized,
          confidence: item.confidence,
          country: typeof item.attributes?.country === "string" ? item.attributes.country : this.config.countryCode,
          characters: [],
        },
        vehicle: item.attributes?.vehicle && typeof item.attributes.vehicle === "object"
          ? item.attributes.vehicle as VehicleInfo
          : undefined,
      }];
    });
    return [...normalized, ...localReadings];
  }

  /**
   * Extract plate region from vehicle detection
   */
  private async extractPlateRegion(
    vehicleBox: { x: number; y: number; width: number; height: number },
    imageData: Buffer,
  ): Promise<Buffer | null> {
    // TODO: Extract plate region from image
    // Typical plate location: bottom 30% of vehicle, centered
    return null;
  }

  /**
   * Perform OCR on plate image
   */
  private async recognizePlate(plateImage: Buffer): Promise<PlateReading | null> {
    // TODO: Run OCR model
    // 1. Preprocess image (resize, enhance contrast, denoise)
    // 2. Run character segmentation
    // 3. Run character recognition
    // 4. Post-process (fix common OCR errors)
    // 5. Validate format
    return null;
  }

  /**
   * Correct common OCR errors
   */
  private correctOCRErrors(text: string): string {
    // Common confusions in plate recognition
    const corrections: Record<string, string> = {
      "0": "O", // Context-dependent
      "O": "0",
      "1": "I",
      "I": "1",
      "5": "S",
      "S": "5",
      "8": "B",
      "B": "8",
      "2": "Z",
      "Z": "2",
    };

    // Apply corrections based on plate format rules
    // e.g., First two chars are always letters in Indian plates
    return text;
  }

  /**
   * Get vehicle entry/exit events
   */
  async getVehicleEvents(
    tenantId: string,
    plateNumber?: string,
    from?: Date,
    to?: Date,
  ): Promise<
    Array<{
      plateNumber: string;
      timestamp: Date;
      camera: string;
      direction: "entry" | "exit";
    }>
  > {
    // TODO: Query database for vehicle events
    return [];
  }

  async cleanup(): Promise<void> {
    this.detectionModel = null;
    this.ocrModel = null;
    this.watchlists.clear();
    this.isInitialized = false;
  }

  getHealth() {
    return {
      status: this.isInitialized && this.detectionModel && this.ocrModel
        ? ("healthy" as const)
        : this.isInitialized ? ("degraded" as const) : ("unhealthy" as const),
      details: this.isInitialized && this.detectionModel && this.ocrModel
        ? `Local plate detection and OCR active (watchlist ${this.config.watchlistEnabled ? "enabled" : "disabled"})`
        : this.isInitialized
          ? `Normalized plate/OCR observations only. ${this.modelLoadError ?? "Local models unavailable"}`
        : "ANPR detector not initialized",
      metadata: {
        watchlistEnabled: this.config.watchlistEnabled,
        watchlistsLoaded: this.watchlists.size,
        countryCode: this.config.countryCode,
        localDetection: Boolean(this.detectionModel),
        localRecognition: Boolean(this.ocrModel),
      },
    };
  }
}
