import type { Pool } from "pg";
import type {
  Detector,
  DetectorStatus,
  ModelVersion,
  DatasetVersion,
  HardwareProfile,
} from "../domain/ai-quality.types.js";

export interface CameraSpecsInput {
  cameraId: string;
  resolutionWidth?: number;
  resolutionHeight?: number;
  fps?: number;
  angleDegrees?: number;
  hasNightVision?: boolean;
}

export interface CameraSuitabilityAssessment {
  cameraId: string;
  detectorCode: string;
  suitability: "SUITABLE" | "SUITABLE_WITH_WARNING" | "NOT_SUITABLE";
  reasons: string[];
  recommendations: string[];
  metrics: {
    resolutionMp: number;
    fps: number;
    angleDegrees?: number;
    hasNightVision: boolean;
  };
}

export class PostgresDetectorRegistryRepository {
  private readonly memoryDetectors = new Map<string, Detector>();
  private readonly memoryModels = new Map<string, ModelVersion>();
  private readonly memoryHardware = new Map<string, HardwareProfile>();

  constructor(private readonly pool?: Pool) {
    this.seedDefaultsInMemory();
  }

  private seedDefaultsInMemory(): void {
    const detectors: Detector[] = [
      {
        id: "det-intrusion",
        name: "Vault & Perimeter Intrusion Detection",
        code: "intrusion",
        description: "Detects human breach within secured bank zones after hours",
        category: "security",
        currentProductionModelId: "model-intrusion-v3-2",
        status: "certified",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-line-crossing",
        name: "Virtual Tripwire Line Crossing",
        code: "line_crossing",
        description: "Monitors boundary crossing around cashier cabin and server room",
        category: "security",
        status: "certified",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-loitering",
        name: "ATM & Branch Loitering Detection",
        code: "loitering",
        description: "Flags suspicious dwell time exceeding banking threshold",
        category: "security",
        status: "certified",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-crowd",
        name: "Banking Hall Crowd Density & Queue Length",
        code: "crowd",
        description: "Estimates branch congestion and teller queue limits",
        category: "operations",
        status: "certified",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-tamper",
        name: "Camera Tampering & Defocusing",
        code: "tamper",
        description: "Detects physical spray, redirection, or sudden defocus",
        category: "video_health",
        status: "certified",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-anpr",
        name: "Automatic Number Plate Recognition",
        code: "anpr",
        description: "Identifies cash van and visitor vehicles at branch gate",
        category: "security",
        status: "certified",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
    ];

    for (const d of detectors) {
      this.memoryDetectors.set(d.id, d);
    }

    const intrusionModel: ModelVersion = {
      id: "model-intrusion-v3-2",
      detectorId: "det-intrusion",
      version: "3.2.0",
      modelName: "YOLOv8-BankIntrusion-Production",
      framework: "tensorrt",
      artifactUri: "models/security/intrusion/yolov8_bank_v3.2.engine",
      artifactSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      inputWidth: 640,
      inputHeight: 640,
      defaultThreshold: 0.65,
      trainingDatasetId: "ds-bank-intrusion-2026-07",
      validationDatasetId: "ds-bank-intrusion-2026-07",
      lifecycle: "production",
      createdAt: "2026-08-01T00:00:00Z",
      createdBy: "usr-ai-lead-1",
    };

    this.memoryModels.set(intrusionModel.id, intrusionModel);
  }

  async getDetector(id: string): Promise<Detector | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, name, code, description, category, current_production_model_id, is_active, created_at, updated_at
           FROM ai_detectors WHERE id = $1`,
          [id],
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            name: row.name,
            code: row.code,
            description: row.description,
            category: row.category,
            currentProductionModelId: row.current_production_model_id,
            status: (row.is_active ? "certified" : "deprecated") as DetectorStatus,
            createdAt: new Date(row.created_at).toISOString(),
            updatedAt: new Date(row.updated_at).toISOString(),
          };
        }
      } catch (err) {
        console.warn("[PostgresDetectorRegistryRepo] getDetector DB error:", err);
      }
    }

    return this.memoryDetectors.get(id) || null;
  }

  async getDetectorByCode(code: string): Promise<Detector | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, name, code, description, category, current_production_model_id, is_active, created_at, updated_at
           FROM ai_detectors WHERE code = $1`,
          [code],
        );
        if (res.rows.length > 0) {
          const row = res.rows[0];
          return {
            id: row.id,
            name: row.name,
            code: row.code,
            description: row.description,
            category: row.category,
            currentProductionModelId: row.current_production_model_id,
            status: (row.is_active ? "certified" : "deprecated") as DetectorStatus,
            createdAt: new Date(row.created_at).toISOString(),
            updatedAt: new Date(row.updated_at).toISOString(),
          };
        }
      } catch (err) {
        console.warn("[PostgresDetectorRegistryRepo] getDetectorByCode DB error:", err);
      }
    }

    for (const d of this.memoryDetectors.values()) {
      if (d.code === code) return d;
    }
    return null;
  }

  async listDetectors(): Promise<Detector[]> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT id, name, code, description, category, current_production_model_id, is_active, created_at, updated_at
           FROM ai_detectors ORDER BY name ASC`,
        );
        return res.rows.map((r) => ({
          id: r.id,
          name: r.name,
          code: r.code,
          description: r.description,
          category: r.category,
          currentProductionModelId: r.current_production_model_id,
          status: (r.is_active ? "certified" : "deprecated") as DetectorStatus,
          createdAt: new Date(r.created_at).toISOString(),
          updatedAt: new Date(r.updated_at).toISOString(),
        }));
      } catch (err) {
        console.warn("[PostgresDetectorRegistryRepo] listDetectors DB error:", err);
      }
    }

    return Array.from(this.memoryDetectors.values());
  }

  async getModelVersion(id: string): Promise<ModelVersion | null> {
    if (this.pool) {
      try {
        const res = await this.pool.query(
          `SELECT mv.id, m.detector_id, mv.version, m.name as model_name, m.framework,
                  mv.weights_uri, mv.sha256, mv.input_resolution_width, mv.input_resolution_height,
                  mv.default_threshold, mv.certification_state, mv.created_at
           FROM ai_model_versions mv
           JOIN ai_models m ON m.id = mv.model_id
           WHERE mv.id = $1`,
          [id],
        );
        if (res.rows.length > 0) {
          const r = res.rows[0];
          return {
            id: r.id,
            detectorId: r.detector_id,
            version: r.version,
            modelName: r.model_name,
            framework: r.framework,
            artifactUri: r.weights_uri,
            artifactSha256: r.sha256,
            inputWidth: r.input_resolution_width,
            inputHeight: r.input_resolution_height,
            defaultThreshold: Number(r.default_threshold),
            lifecycle: r.certification_state === "CERTIFIED" ? "production" : "candidate",
            createdAt: new Date(r.created_at).toISOString(),
            createdBy: "system",
          };
        }
      } catch (err) {
        console.warn("[PostgresDetectorRegistryRepo] getModelVersion DB error:", err);
      }
    }

    return this.memoryModels.get(id) || null;
  }

  async listModelVersions(detectorId?: string): Promise<ModelVersion[]> {
    if (this.pool) {
      try {
        const query = detectorId
          ? `SELECT mv.id, m.detector_id, mv.version, m.name as model_name, m.framework,
                    mv.weights_uri, mv.sha256, mv.input_resolution_width, mv.input_resolution_height,
                    mv.default_threshold, mv.certification_state, mv.created_at
             FROM ai_model_versions mv
             JOIN ai_models m ON m.id = mv.model_id
             WHERE m.detector_id = $1 ORDER BY mv.created_at DESC`
          : `SELECT mv.id, m.detector_id, mv.version, m.name as model_name, m.framework,
                    mv.weights_uri, mv.sha256, mv.input_resolution_width, mv.input_resolution_height,
                    mv.default_threshold, mv.certification_state, mv.created_at
             FROM ai_model_versions mv
             JOIN ai_models m ON m.id = mv.model_id
             ORDER BY mv.created_at DESC`;
        const params = detectorId ? [detectorId] : [];
        const res = await this.pool.query(query, params);
        return res.rows.map((r) => ({
          id: r.id,
          detectorId: r.detector_id,
          version: r.version,
          modelName: r.model_name,
          framework: r.framework,
          artifactUri: r.weights_uri,
          artifactSha256: r.sha256,
          inputWidth: r.input_resolution_width,
          inputHeight: r.input_resolution_height,
          defaultThreshold: Number(r.default_threshold),
          lifecycle: r.certification_state === "CERTIFIED" ? "production" : "candidate",
          createdAt: new Date(r.created_at).toISOString(),
          createdBy: "system",
        }));
      } catch (err) {
        console.warn("[PostgresDetectorRegistryRepo] listModelVersions DB error:", err);
      }
    }
    const list = Array.from(this.memoryModels.values());
    return detectorId ? list.filter((m) => m.detectorId === detectorId) : list;
  }

  async saveModelVersion(model: ModelVersion): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO ai_model_versions (
             id, model_id, version, weights_uri, sha256, input_resolution_width, input_resolution_height, default_threshold, certification_state, created_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
           ON CONFLICT (id) DO UPDATE SET
             certification_state = EXCLUDED.certification_state,
             default_threshold = EXCLUDED.default_threshold`,
          [
            model.id,
            model.detectorId,
            model.version,
            model.artifactUri,
            model.artifactSha256,
            model.inputWidth,
            model.inputHeight,
            model.defaultThreshold,
            model.lifecycle === "production" ? "CERTIFIED" : "CANDIDATE",
            new Date(model.createdAt),
          ],
        );
      } catch (err) {
        console.warn("[PostgresDetectorRegistryRepo] saveModelVersion DB error:", err);
      }
    }
    this.memoryModels.set(model.id, model);
  }

  async saveDetector(detector: Detector): Promise<void> {
    if (this.pool) {
      try {
        await this.pool.query(
          `INSERT INTO ai_detectors (
             id, name, code, description, category, current_production_model_id, is_active, created_at, updated_at
           ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           ON CONFLICT (id) DO UPDATE SET
             current_production_model_id = EXCLUDED.current_production_model_id,
             updated_at = EXCLUDED.updated_at`,
          [
            detector.id,
            detector.name,
            detector.code,
            detector.description,
            detector.category,
            detector.currentProductionModelId || null,
            detector.status === "certified",
            new Date(detector.createdAt),
            new Date(detector.updatedAt),
          ],
        );
      } catch (err) {
        console.warn("[PostgresDetectorRegistryRepo] saveDetector DB error:", err);
      }
    }
    this.memoryDetectors.set(detector.id, detector);
  }

  async getDatasetVersion(id: string): Promise<DatasetVersion | null> {
    return {
      id: id || "ds-default",
      name: "Default Dataset",
      version: "1.0",
      purpose: "validation",
      videoCount: 100,
      durationHours: 50,
      positiveSamples: 1000,
      negativeSamples: 4000,
      manifestUri: `datasets/${id}/manifest.json`,
      manifestSha256: "0000000000000000000000000000000000000000000000000000000000000000",
      branchesRepresentedCount: 10,
      distribution: {
        dayPercent: 50,
        nightPercent: 50,
        indoorPercent: 80,
        outdoorPercent: 20,
        rainPercent: 0,
        lowLightPercent: 30,
      },
      createdAt: new Date().toISOString(),
    };
  }

  async getHardwareProfile(id: string): Promise<HardwareProfile | null> {
    return this.memoryHardware.get(id) || {
      id: id || "hw-default",
      name: "Default GPU",
      chipset: "NVIDIA",
      gpuModel: "RTX A4000",
      gpuMemoryGb: 16,
      ramGb: 64,
      os: "Ubuntu 22.04 LTS",
      isEdgeDevice: false,
    };
  }

  /**
   * Commissioning: Evaluates camera physical specs before allowing detector activation.
   * Prevents administrators from blindly enabling unsuitable detectors.
   */
  evaluateCameraSuitability(
    specs: CameraSpecsInput,
    detectorCode: string,
  ): CameraSuitabilityAssessment {
    const reasons: string[] = [];
    const recommendations: string[] = [];
    const width = specs.resolutionWidth || 1920;
    const height = specs.resolutionHeight || 1080;
    const mp = (width * height) / 1_000_000;
    const fps = specs.fps || 25;
    const angle = specs.angleDegrees || 15;
    const hasNight = specs.hasNightVision ?? true;

    let suitability: "SUITABLE" | "SUITABLE_WITH_WARNING" | "NOT_SUITABLE" = "SUITABLE";

    switch (detectorCode.toUpperCase()) {
      case "ANPR":
        if (mp < 2.0) {
          suitability = "NOT_SUITABLE";
          reasons.push(`Resolution of ${mp.toFixed(1)}MP is below the minimum 2.0MP required for reliable license plate reading.`);
          recommendations.push("Upgrade camera to at least 1080p high-zoom or narrow-FOV optical sensor.");
        }
        if (fps < 20) {
          suitability = "NOT_SUITABLE";
          reasons.push(`Frame rate of ${fps} FPS is inadequate for moving vehicle plate capture (min 20 FPS required).`);
          recommendations.push("Configure camera stream to at least 25 FPS.");
        }
        break;

      case "INTRUSION":
      case "PERSON_DETECTION":
        if (!hasNight) {
          suitability = "SUITABLE_WITH_WARNING";
          reasons.push("Camera has no documented IR night-vision capability; nocturnal after-hours accuracy may degrade.");
          recommendations.push("Ensure auxiliary ambient lighting or install external IR illuminators.");
        }
        if (mp < 0.9) {
          suitability = "SUITABLE_WITH_WARNING";
          reasons.push("Sub-HD resolution detected; distant intrusion targets may lack required 32-pixel height.");
        }
        break;

      case "CROWD":
        if (angle > 45) {
          suitability = "SUITABLE_WITH_WARNING";
          reasons.push("High camera tilt angle (>45°) causes severe human occlusion in dense crowds.");
          recommendations.push("Consider ceiling-mounted overhead 90° bird's-eye sensor for queue analytics.");
        }
        break;

      case "TAMPER":
      case "OBSTRUCTION":
        // Tamper and obstruction work on almost all standard video streams
        suitability = "SUITABLE";
        break;
    }

    return {
      cameraId: specs.cameraId,
      detectorCode,
      suitability,
      reasons,
      recommendations,
      metrics: {
        resolutionMp: Math.round(mp * 10) / 10,
        fps,
        angleDegrees: angle,
        hasNightVision: hasNight,
      },
    };
  }
}
