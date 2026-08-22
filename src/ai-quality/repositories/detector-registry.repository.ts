import type {
  Detector,
  ModelVersion,
  DatasetVersion,
  HardwareProfile,
} from "../domain/ai-quality.types.js";

export class DetectorRegistryRepository {
  private readonly detectors = new Map<string, Detector>();
  private readonly models = new Map<string, ModelVersion>();
  private readonly datasets = new Map<string, DatasetVersion>();
  private readonly hardwareProfiles = new Map<string, HardwareProfile>();

  constructor() {
  }

  private seedDefaults(): void {
    // 1. Hardware Profiles
    const rtxA4000: HardwareProfile = {
      id: "hw-rtx-a4000",
      name: "NVIDIA RTX A4000",
      chipset: "Ampere GA104",
      gpuModel: "RTX A4000",
      gpuMemoryGb: 16,
      ramGb: 64,
      os: "Ubuntu 22.04 LTS",
      driverVersion: "535.129.03",
      cudaVersion: "12.2",
      tensorrtVersion: "8.6.1",
      isEdgeDevice: false,
    };

    const nvidiaL4: HardwareProfile = {
      id: "hw-nvidia-l4",
      name: "NVIDIA L4 Tensor Core",
      chipset: "Ada Lovelace AD104",
      gpuModel: "NVIDIA L4",
      gpuMemoryGb: 24,
      ramGb: 64,
      os: "Ubuntu 22.04 LTS",
      driverVersion: "535.129.03",
      cudaVersion: "12.2",
      tensorrtVersion: "8.6.1",
      isEdgeDevice: false,
    };

    const jetsonOrin: HardwareProfile = {
      id: "hw-jetson-orin",
      name: "NVIDIA Jetson AGX Orin",
      chipset: "Orin 2048-core",
      gpuModel: "Jetson Orin Integrated",
      gpuMemoryGb: 32,
      ramGb: 32,
      os: "Linux for Tegra 35.4.1",
      driverVersion: "JetPack 5.1.2",
      cudaVersion: "11.4",
      tensorrtVersion: "8.5.2",
      isEdgeDevice: true,
    };

    const intelCpu: HardwareProfile = {
      id: "hw-intel-cpu",
      name: "Intel Xeon AVX-512 CPU",
      chipset: "x86_64",
      ramGb: 32,
      os: "Ubuntu 22.04 LTS",
      isEdgeDevice: false,
    };

    this.hardwareProfiles.set(rtxA4000.id, rtxA4000);
    this.hardwareProfiles.set(nvidiaL4.id, nvidiaL4);
    this.hardwareProfiles.set(jetsonOrin.id, jetsonOrin);
    this.hardwareProfiles.set(intelCpu.id, intelCpu);

    // 2. Datasets
    const intrusionValDataset: DatasetVersion = {
      id: "ds-bank-intrusion-2026-08",
      name: "BANK-INTRUSION-VALIDATION",
      version: "2026.08.3",
      purpose: "validation",
      videoCount: 8421,
      durationHours: 1917,
      positiveSamples: 12843,
      negativeSamples: 45200,
      manifestUri: "s3://sentinel-ai-eval/manifests/bank-intrusion-2026-08.json.gz",
      manifestSha256: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
      branchesRepresentedCount: 73,
      distribution: {
        dayPercent: 58,
        nightPercent: 42,
        indoorPercent: 49,
        outdoorPercent: 51,
        rainPercent: 18,
        lowLightPercent: 34,
      },
      createdAt: "2026-08-01T00:00:00Z",
    };

    this.datasets.set(intrusionValDataset.id, intrusionValDataset);

    // 3. Detectors
    const detectorsList: Detector[] = [
      {
        id: "det-intrusion",
        code: "intrusion",
        name: "Vault & Perimeter Intrusion Detector",
        category: "security",
        description: "Detects unauthorized human / vehicle entry into designated bank zones, vaults, and ATM cubicles.",
        status: "certified",
        currentProductionModelId: "model-intrusion-v3-2",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-line-crossing",
        code: "line_crossing",
        name: "Tripwire / Line Crossing Detector",
        category: "security",
        description: "Detects directional crossing across virtual teller counters or restricted perimeter barriers.",
        status: "certified",
        currentProductionModelId: "model-line-crossing-v2-7",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-loitering",
        code: "loitering",
        name: "ATM Lobby Loitering Detector",
        category: "security",
        description: "Identifies persons remaining stationary in ATM lobbies or customer counters exceeding configured dwell thresholds.",
        status: "certified",
        currentProductionModelId: "model-loitering-v2-1",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-tamper",
        code: "tamper",
        name: "Camera Anti-Tamper & Video Health Detector",
        category: "video_health",
        description: "Detects spray paint, lens cover, severe defocus, camera displacement, blank frame, or frozen video.",
        status: "certified",
        currentProductionModelId: "model-tamper-v2-0",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-anpr",
        code: "anpr",
        name: "Indian High-Security ANPR Detector",
        category: "security",
        description: "Automatic Number Plate Recognition optimized for Indian state formats (KL, TN, KA, MH, DL).",
        status: "certified",
        currentProductionModelId: "model-anpr-v4-0",
        createdAt: "2026-01-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-face-recognition",
        code: "face_recognition",
        name: "Biometric Face Watchlist Matcher",
        category: "security",
        description: "Biometric matching against local suspicious list. (EXPERIMENTAL / PILOT ONLY)",
        status: "experimental",
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
      {
        id: "det-fall-detection",
        code: "fall_detection",
        name: "Customer / Staff Fall Detector",
        category: "safety",
        description: "Emergency slip-and-fall detection for banking halls. (VALIDATION / CANDIDATE)",
        status: "validation",
        createdAt: "2026-06-01T00:00:00Z",
        updatedAt: "2026-08-16T00:00:00Z",
      },
    ];

    for (const d of detectorsList) {
      this.detectors.set(d.id, d);
    }

    // 4. Model Versions
    const intrusionV32: ModelVersion = {
      id: "model-intrusion-v3-2",
      detectorId: "det-intrusion",
      version: "3.2.0",
      modelName: "YOLOv8-BankIntrusion-TensorRT",
      framework: "tensorrt",
      artifactUri: "models/security/intrusion/yolov8_bank_v3.2.engine",
      artifactSha256: "8c4f92d3b2e5a1768f498c392c0192e47854298192a837c92b8d4e912401f8aa",
      inputWidth: 640,
      inputHeight: 640,
      defaultThreshold: 0.60,
      trainingDatasetId: "ds-bank-intrusion-2026-08",
      validationDatasetId: "ds-bank-intrusion-2026-08",
      lifecycle: "production",
      createdAt: "2026-08-10T00:00:00Z",
      createdBy: "usr-ai-engineer-1",
    };

    const intrusionV33Candidate: ModelVersion = {
      id: "model-intrusion-v3-3-candidate",
      detectorId: "det-intrusion",
      version: "3.3.0-rc1",
      modelName: "YOLOv8-BankIntrusion-AttentionEnhanced",
      framework: "onnx",
      artifactUri: "models/security/intrusion/yolov8_bank_v3.3_rc1.onnx",
      artifactSha256: "f4219a84b392e10497528a9b3c4d5e6f7a8b9c0d1e2f3a4b5c6d7e8f9a0b1c2d",
      inputWidth: 640,
      inputHeight: 640,
      defaultThreshold: 0.62,
      trainingDatasetId: "ds-bank-intrusion-2026-08",
      validationDatasetId: "ds-bank-intrusion-2026-08",
      lifecycle: "candidate",
      createdAt: "2026-08-15T00:00:00Z",
      createdBy: "usr-ai-engineer-1",
    };

    this.models.set(intrusionV32.id, intrusionV32);
    this.models.set(intrusionV33Candidate.id, intrusionV33Candidate);
  }

  async getDetector(id: string): Promise<Detector | null> {
    return this.detectors.get(id) || null;
  }

  async getDetectorByCode(code: string): Promise<Detector | null> {
    for (const d of this.detectors.values()) {
      if (d.code === code) return d;
    }
    return null;
  }

  async listDetectors(): Promise<Detector[]> {
    return Array.from(this.detectors.values());
  }

  async saveDetector(detector: Detector): Promise<void> {
    this.detectors.set(detector.id, detector);
  }

  async getModelVersion(id: string): Promise<ModelVersion | null> {
    return this.models.get(id) || null;
  }

  async listModelVersions(detectorId?: string): Promise<ModelVersion[]> {
    const list = Array.from(this.models.values());
    if (detectorId) {
      return list.filter((m) => m.detectorId === detectorId);
    }
    return list;
  }

  async saveModelVersion(model: ModelVersion): Promise<void> {
    this.models.set(model.id, model);
  }

  async getDatasetVersion(id: string): Promise<DatasetVersion | null> {
    return this.datasets.get(id) || null;
  }

  async listDatasets(): Promise<DatasetVersion[]> {
    return Array.from(this.datasets.values());
  }

  async getHardwareProfile(id: string): Promise<HardwareProfile | null> {
    return this.hardwareProfiles.get(id) || null;
  }

  async listHardwareProfiles(): Promise<HardwareProfile[]> {
    return Array.from(this.hardwareProfiles.values());
  }
}
