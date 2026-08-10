/**
 * Camera Service Interfaces
 * 
 * Domain service contracts for camera operations.
 * Commands use these to interact with real camera infrastructure.
 */

/**
 * Camera entity
 */
export interface Camera {
  id: string;
  name: string;
  siteId: string;
  location?: string;
  type?: string;
  status: CameraStatus;
  streamUrl?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Camera status
 */
export enum CameraStatus {
  ONLINE = 'ONLINE',
  OFFLINE = 'OFFLINE',
  STARTING = 'STARTING',
  STOPPING = 'STOPPING',
  ERROR = 'ERROR',
  UNKNOWN = 'UNKNOWN'
}

/**
 * Camera runtime state
 */
export interface CameraRuntimeState {
  cameraId: string;
  status: CameraStatus;
  streamConnected: boolean;
  recordingActive: boolean;
  analyticsActive: boolean;
  lastFrameAt?: Date;
  uptime?: number;
  metadata?: Record<string, unknown>;
}

/**
 * Camera resolution result
 */
export interface CameraResolutionResult {
  found: boolean;
  camera?: Camera;
  ambiguous: boolean;
  matches?: Camera[];
}

/**
 * Camera Service
 * 
 * Provides camera lookup and state queries
 */
export interface CameraService {
  /**
   * Resolve a camera by reference (ID, name, or partial match)
   */
  resolve(reference: string): Promise<CameraResolutionResult>;
  
  /**
   * Get camera by ID
   */
  getById(cameraId: string): Promise<Camera | null>;
  
  /**
   * Find cameras by location
   */
  findByLocation(location: string): Promise<Camera[]>;
  
  /**
   * Find cameras by site
   */
  findBySite(siteId: string): Promise<Camera[]>;
  
  /**
   * Get runtime state for a camera
   */
  getRuntimeState(cameraId: string): Promise<CameraRuntimeState>;
  
  /**
   * List all cameras
   */
  list(filter?: {
    siteIds?: string[];
    status?: CameraStatus;
    location?: string;
  }): Promise<Camera[]>;
}

/**
 * Camera control operation result
 */
export interface CameraOperationResult {
  operationId: string;
  cameraId: string;
  requestedState: CameraStatus;
  previousState: CameraStatus;
  accepted: boolean;
  reason?: string;
}

/**
 * Camera control result with verification
 */
export interface CameraControlResult extends CameraOperationResult {
  verified: boolean;
  finalState: CameraStatus;
  streamConnected: boolean;
}

/**
 * Camera Control Service
 * 
 * Performs camera control operations with verification
 */
export interface CameraControlService {
  /**
   * Start a camera and verify it reached running state
   */
  startAndVerify(
    cameraId: string,
    options?: {
      timeoutMs?: number;
      idempotencyKey?: string;
    }
  ): Promise<CameraControlResult>;
  
  /**
   * Stop a camera and verify it reached stopped state
   */
  stopAndVerify(
    cameraId: string,
    options?: {
      timeoutMs?: number;
      idempotencyKey?: string;
    }
  ): Promise<CameraControlResult>;
  
  /**
   * Restart a camera
   */
  restart(
    cameraId: string,
    options?: {
      timeoutMs?: number;
      idempotencyKey?: string;
    }
  ): Promise<CameraControlResult>;
  
  /**
   * Start camera without waiting for verification
   * Returns immediately after command is sent
   */
  start(cameraId: string): Promise<CameraOperationResult>;
  
  /**
   * Stop camera without waiting for verification
   */
  stop(cameraId: string): Promise<CameraOperationResult>;
}
