/**
 * Local Open-Source AI Engine Domain Types
 * 
 * Free, self-hosted, on-premise computer vision, ANPR, face matching,
 * and incident analysis domain types with zero cloud subscriptions.
 */

export type LocalAiModelType = 
  | "YOLO_V8_NANO"
  | "YOLO_V11_NANO"
  | "ONVIF_ONBOARD_AI"
  | "CP_PLUS_IVS"
  | "DAHUA_SMD"
  | "HIKVISION_ACUSENSE"
  | "LOCAL_OPENCV_TAMPER"
  | "PADDLE_OCR_ANPR"
  | "LOCAL_VECTOR_FACE";

export type DetectedObjectClass = 
  | "PERSON"
  | "VEHICLE"
  | "MOTORCYCLE"
  | "BICYCLE"
  | "BAG"
  | "BACKPACK"
  | "WEAPON_HAZARD"
  | "SMOKE_FIRE"
  | "SUSPICIOUS_PACKAGE"
  | "UNKNOWN";

export interface BoundingBox {
  x: number;      // 0.0 to 1.0 (normalized)
  y: number;      // 0.0 to 1.0
  width: number;  // 0.0 to 1.0
  height: number; // 0.0 to 1.0
}

export interface LocalVisionDetection {
  id: string;
  cameraId: string;
  branchId: string;
  detectedAt: Date;
  classification: DetectedObjectClass;
  confidence: number; // 0.0 to 1.0
  boundingBox?: BoundingBox;
  trackId?: string;
  zone?: "VAULT" | "ENTRANCE" | "CASH_COUNTER" | "ATM_LOBBY" | "PERIMETER" | "PARKING" | "GENERAL";
  motionVector?: { dx: number; dy: number; speed: number };
  attributes?: Record<string, unknown>;
  modelUsed: LocalAiModelType;
}

export interface CameraTamperResult {
  cameraId: string;
  branchId: string;
  evaluatedAt: Date;
  isTampered: boolean;
  tamperType: "NONE" | "OCCLUSION" | "LENS_BLUR" | "DEFOCUS" | "SCENE_SHIFT" | "FROZEN_VIDEO" | "BLACK_FRAME";
  confidence: number;
  ssimScore?: number;
  varianceScore?: number;
}

export interface AnprRecognitionRequest {
  cameraId: string;
  branchId: string;
  imageBuffer?: string; // base64 or raw image descriptor
  frameTimestamp?: Date;
  regionHint?: string;
}

export interface AnprRecognitionResult {
  id: string;
  cameraId: string;
  branchId: string;
  recognizedAt: Date;
  plateNumber: string;
  normalizedPlate: string;
  confidence: number;
  vehicleType: "CAR" | "TRUCK" | "BUS" | "MOTORCYCLE" | "VAN" | "UNKNOWN";
  vehicleColor?: string;
  stateCode?: string;
  isWatchlistMatch: boolean;
  matchedWatchlistId?: string;
  matchedListType?: "STOLEN" | "WANTED" | "SUSPICIOUS" | "VIP" | "STAFF";
  boundingBox?: BoundingBox;
}

export interface FaceMatchRequest {
  cameraId: string;
  branchId: string;
  embeddingVector: number[]; // 512-dimension vector
  detectedAt?: Date;
  minSimilarityThreshold?: number; // default 0.75
}

export interface FaceMatchCandidate {
  personId: string;
  name: string;
  watchlistType: "WANTED" | "BLACK_LIST" | "VIP" | "STAFF" | "SUSPECT";
  similarity: number; // 0.0 to 1.0 (Cosine similarity)
  watchlistId: string;
  notes?: string;
}

export interface FaceMatchResult {
  id: string;
  cameraId: string;
  branchId: string;
  matchedAt: Date;
  matched: boolean;
  candidate?: FaceMatchCandidate;
  confidence: number;
}

export interface LocalAiEngineStatus {
  online: boolean;
  runtime: "LOCAL_NODEJS_ONNX" | "LOCAL_CPU" | "EMBEDDED_EDGE";
  availableModels: LocalAiModelType[];
  activeStreamsProcessed: number;
  averageInferenceLatencyMs: number;
  monthlyCloudCost: 0; // 100% Free
  externalApiDependencies: [];
}
