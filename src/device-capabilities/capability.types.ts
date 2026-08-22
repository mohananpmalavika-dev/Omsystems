/**
 * Device Capability Registry - Type Definitions
 * 
 * This module defines the capability model with evidence-based verification.
 * Capabilities are NOT booleans - they distinguish between unsupported,
 * unknown, unavailable, and degraded states with explicit evidence.
 */

/**
 * Capability state represents the current operational status.
 * 
 * SUPPORTED: Device has this capability and it's working
 * UNSUPPORTED: Device definitively does not have this capability
 * UNKNOWN: Cannot determine if device has this capability
 * UNAVAILABLE: Device has capability but it's currently inaccessible
 * DEGRADED: Device has capability but with limited functionality
 * MISCONFIGURED: Device has capability but configuration is invalid
 */
export type CapabilityState =
  | "SUPPORTED"
  | "UNSUPPORTED"
  | "UNKNOWN"
  | "UNAVAILABLE"
  | "DEGRADED"
  | "MISCONFIGURED";

/**
 * Capability source indicates where the evidence came from.
 */
export type CapabilitySource =
  | "ONVIF"
  | "VENDOR_API"
  | "SNMP"
  | "RTSP"
  | "DEVICE_PROBE"
  | "MODEL_DATABASE"
  | "MANUAL"
  | "EDGE_AGENT"
  | "INFERRED";

/**
 * Verification level indicates how strongly the capability has been confirmed.
 * 
 * DECLARED: Vendor documentation or model database claims support
 * DISCOVERED: Device advertises capability through protocol introspection
 * VERIFIED: Capability was successfully executed at runtime
 */
export type CapabilityVerificationLevel =
  | "DECLARED"
  | "DISCOVERED"
  | "VERIFIED";

/**
 * Evidence freshness indicates how current the observation is.
 */
export type EvidenceFreshness = "FRESH" | "STALE" | "EXPIRED";

/**
 * Individual piece of evidence supporting a capability determination.
 */
export interface CapabilityEvidence {
  /** Where this evidence came from */
  source: CapabilitySource;

  /** When this evidence was observed */
  observedAt: Date;

  /** Confidence in this evidence (0-1) */
  confidence: number;

  /** Whether this evidence was actively verified or passively discovered */
  verified: boolean;

  /** Type of evidence (e.g., "GetCapabilities/PTZ", "RTSP DESCRIBE") */
  evidenceType?: string;

  /** Raw reference data (e.g., ONVIF response, RTSP header) */
  rawReference?: string;

  /** Human-readable explanation */
  reason?: string;

  /** When this evidence expires and should be re-checked */
  expiresAt?: Date;

  /** Current freshness of this evidence */
  freshness?: EvidenceFreshness;
}

/**
 * Base capability interface - represents a single device capability.
 */
export interface Capability {
  /** Current operational state */
  state: CapabilityState;

  /** Whether the capability is currently available for use */
  available: boolean;

  /** Overall confidence in this determination (0-1) */
  confidence: number;

  /** Highest verification level achieved */
  verificationLevel: CapabilityVerificationLevel;

  /** When this capability was first discovered */
  discoveredAt?: Date;

  /** When this capability was last verified */
  verifiedAt?: Date;

  /** All evidence supporting this capability determination */
  evidence: CapabilityEvidence[];

  /** Known limitations or constraints */
  limitations?: string[];

  /** Additional capability-specific attributes */
  attributes?: Record<string, unknown>;
}

/**
 * Capability with typed value - used when capability has parameters.
 */
export interface CapabilityValue<T> extends Capability {
  /** The value or parameters of this capability */
  value?: T;
}

// ============ VIDEO CAPABILITIES ============

export interface VideoCodecSupport {
  h264: Capability;
  h265: Capability;
  mjpeg: Capability;
  mpeg4?: Capability;
}

export interface VideoCapabilities {
  /** Live video streaming */
  liveVideo: Capability;

  /** Snapshot capture */
  snapshots: Capability;

  /** RTSP protocol support */
  rtsp: Capability;

  /** Supported codecs */
  codecs?: VideoCodecSupport;

  /** Maximum resolution */
  maxResolution?: CapabilityValue<{
    width: number;
    height: number;
  }>;

  /** Maximum frame rate */
  maxFrameRate?: CapabilityValue<number>;

  /** Number of simultaneous streams */
  streams?: CapabilityValue<number>;

  /** Stream profiles available */
  profiles?: CapabilityValue<Array<{
    name: string;
    codec: string;
    width: number;
    height: number;
    fps: number;
  }>>;
}

// ============ RECORDING CAPABILITIES ============

export interface RecordingCapabilities {
  /** Basic recording support */
  recording: Capability;

  /** Playback support */
  playback: Capability;

  /** Recording search/query */
  recordingSearch: Capability;

  /** Export/download recordings */
  export: Capability;

  /** Continuous recording */
  continuousRecording: Capability;

  /** Event-triggered recording */
  eventRecording: Capability;

  /** On-device (SD card) recording */
  onDeviceRecording: Capability;

  /** Recorder-based recording */
  recorderRecording: Capability;

  /** Retention information available */
  retentionInformation: Capability;

  /** Recording search parameters */
  searchCapabilities?: CapabilityValue<{
    byTime: boolean;
    byChannel: boolean;
    byEvent: boolean;
    byMotion: boolean;
    maxConcurrentSearches: number;
    maxSearchWindowDays: number;
  }>;
}

// ============ AUDIO CAPABILITIES ============

export interface AudioCapabilities {
  /** Audio input (microphone) */
  audioInput: Capability;

  /** Audio output (speaker) */
  audioOutput: Capability;

  /** Two-way audio */
  twoWayAudio: Capability;

  /** Audio codecs */
  codecs?: CapabilityValue<string[]>;

  /** Sample rate */
  sampleRate?: CapabilityValue<number>;
}

// ============ PTZ CAPABILITIES ============

export interface PtzCapabilities {
  /** PTZ support (any) */
  ptz: Capability;

  /** Pan movement */
  pan: Capability;

  /** Tilt movement */
  tilt: Capability;

  /** Zoom (optical or digital) */
  zoom: Capability;

  /** Absolute positioning */
  absoluteMove: Capability;

  /** Relative positioning */
  relativeMove: Capability;

  /** Continuous movement */
  continuousMove: Capability;

  /** Preset positions */
  presets: Capability;

  /** Tours/patrols */
  tours: Capability;

  /** Home position */
  homePosition: Capability;

  /** PTZ parameters */
  parameters?: CapabilityValue<{
    maxPresets: number;
    panRange: [number, number];
    tiltRange: [number, number];
    opticalZoom: number;
    digitalZoom: number;
  }>;
}

// ============ EVENT CAPABILITIES ============

export interface EventCapabilities {
  /** Motion detection */
  motionDetection: Capability;

  /** Generic events */
  events: Capability;

  /** Event metadata */
  metadata: Capability;

  /** Line crossing */
  lineCrossing: Capability;

  /** Intrusion detection */
  intrusionDetection: Capability;

  /** Tamper detection */
  tamperDetection: Capability;

  /** Event streaming/subscription */
  eventStreaming: Capability;

  /** Supported event types */
  eventTypes?: CapabilityValue<string[]>;
}

// ============ ANALYTICS CAPABILITIES ============

export interface AnalyticsCapabilities {
  /** Motion detection */
  motionDetection: Capability;

  /** Line crossing */
  lineCrossing: Capability;

  /** Intrusion detection */
  intrusionDetection: Capability;

  /** Person detection */
  personDetection: Capability;

  /** Vehicle detection */
  vehicleDetection: Capability;

  /** Face metadata */
  faceMetadata: Capability;

  /** License plate metadata */
  licensePlateMetadata: Capability;

  /** Object metadata */
  objectMetadata: Capability;

  /** Tamper detection */
  tamperDetection: Capability;

  /** Metadata streaming */
  metadataStreaming: Capability;

  /** Analytics features */
  features?: CapabilityValue<string[]>;
}

// ============ STORAGE CAPABILITIES ============

export interface StorageCapabilities {
  /** On-board storage (SD card) */
  onboardStorage: Capability;

  /** Storage telemetry */
  storageTelemetry: Capability;

  /** Storage capacity */
  capacity?: CapabilityValue<number>;

  /** Used space */
  usedSpace?: CapabilityValue<number>;

  /** Storage status */
  status?: CapabilityValue<"healthy" | "warning" | "critical" | "missing">;
}

// ============ NETWORK CAPABILITIES ============

export interface NetworkCapabilities {
  /** RTSP support */
  rtsp: Capability;

  /** ONVIF support */
  onvif: {
    core: Capability;
    profileS: Capability;
    profileT: Capability;
    profileG: Capability;
    profileM: Capability;
  };

  /** SNMP support */
  snmp: Capability;

  /** IPv6 support */
  ipv6: Capability;

  /** NTP time sync */
  ntp: Capability;

  /** Multicast streaming */
  multicast: Capability;

  /** HTTP/HTTPS */
  http: Capability;
  https: Capability;
}

// ============ SECURITY CAPABILITIES ============

export interface SecurityCapabilities {
  /** HTTPS support */
  https: Capability;

  /** TLS version */
  tls: Capability;

  /** Secure boot */
  secureBoot: Capability;

  /** Signed firmware */
  signedFirmware: Capability;

  /** Certificate management */
  certificateManagement: Capability;

  /** Client certificates */
  clientCertificates: Capability;

  /** TPM support */
  tpm: Capability;

  /** Attestation */
  attestation: Capability;

  /** Firmware integrity */
  firmwareIntegrity: Capability;

  /** Audit logging */
  auditLogging: Capability;

  /** TLS version */
  tlsVersion?: CapabilityValue<string>;

  /** Cipher suites */
  cipherSuites?: CapabilityValue<string[]>;
}

// ============ MANAGEMENT CAPABILITIES ============

export interface ManagementCapabilities {
  /** Firmware upgrade */
  firmwareUpgrade: Capability;

  /** Configuration backup */
  configurationBackup: Capability;

  /** Remote reboot */
  remoteReboot: Capability;

  /** Factory reset */
  factoryReset: Capability;

  /** Log access */
  logAccess: Capability;

  /** Diagnostics */
  diagnostics: Capability;

  /** Time synchronization */
  timeSynchronization: Capability;

  /** Firmware version */
  firmwareVersion?: CapabilityValue<string>;
}

// ============ DEVICE CAPABILITY SET ============

/**
 * Complete capability set for a device.
 * Organized by domain for maintainability.
 */
export interface DeviceCapabilitySet {
  /** Device identity */
  deviceId: string;
  tenantId: string;

  /** When this capability set was last updated */
  lastUpdatedAt: Date;

  /** Video capabilities */
  video?: VideoCapabilities;

  /** Recording capabilities */
  recording?: RecordingCapabilities;

  /** Audio capabilities */
  audio?: AudioCapabilities;

  /** PTZ capabilities */
  ptz?: PtzCapabilities;

  /** Event capabilities */
  events?: EventCapabilities;

  /** Analytics capabilities */
  analytics?: AnalyticsCapabilities;

  /** Storage capabilities */
  storage?: StorageCapabilities;

  /** Network capabilities */
  network?: NetworkCapabilities;

  /** Security capabilities */
  security?: SecurityCapabilities;

  /** Management capabilities */
  management?: ManagementCapabilities;
}

// ============ EFFECTIVE CAPABILITY ============

/**
 * Effective capability combines device intrinsic support with platform support.
 */
export interface EffectiveCapability {
  /** Device intrinsic support */
  deviceSupport: CapabilityState;

  /** Platform integration support */
  platformSupport: CapabilityState;

  /** Effective state (combined) */
  effectiveState: CapabilityState;

  /** Whether effectively available */
  effectivelyAvailable: boolean;

  /** Reason if unavailable */
  unavailabilityReason?: string;

  /** Dependencies that affect availability */
  dependencies?: Array<{
    nodeId: string;
    nodeType: string;
    state: string;
    reason?: string;
  }>;
}

// ============ CAPABILITY KEYS ============

/**
 * Type-safe capability keys for querying.
 */
export type CapabilityKey =
  | "video.liveVideo"
  | "video.snapshots"
  | "video.rtsp"
  | "video.codecs.h264"
  | "video.codecs.h265"
  | "video.codecs.mjpeg"
  | "recording.recording"
  | "recording.playback"
  | "recording.recordingSearch"
  | "recording.export"
  | "audio.audioInput"
  | "audio.audioOutput"
  | "audio.twoWayAudio"
  | "ptz.ptz"
  | "ptz.pan"
  | "ptz.tilt"
  | "ptz.zoom"
  | "ptz.presets"
  | "ptz.tours"
  | "events.motionDetection"
  | "events.lineCrossing"
  | "events.intrusionDetection"
  | "analytics.personDetection"
  | "analytics.vehicleDetection"
  | "analytics.faceMetadata"
  | "analytics.licensePlateMetadata"
  | "storage.onboardStorage"
  | "storage.storageTelemetry"
  | "network.rtsp"
  | "network.onvif.core"
  | "network.onvif.profileS"
  | "network.onvif.profileT"
  | "network.onvif.profileG"
  | "network.snmp"
  | "security.https"
  | "security.secureBoot"
  | "security.signedFirmware"
  | "management.firmwareUpgrade"
  | "management.remoteReboot";

// ============ CAPABILITY CHANGE EVENT ============

/**
 * Event emitted when a capability changes state.
 */
export interface DeviceCapabilityChanged {
  tenantId: string;
  deviceId: string;
  capability: CapabilityKey;
  previousState: CapabilityState;
  newState: CapabilityState;
  previousAvailable: boolean;
  newAvailable: boolean;
  reason?: string;
  evidence: CapabilityEvidence[];
  observedAt: Date;
}

/**
 * Capability drift detection events.
 */
export type CapabilityDriftType =
  | "CAPABILITY_ADDED"
  | "CAPABILITY_REMOVED"
  | "CAPABILITY_UNAVAILABLE"
  | "CAPABILITY_RECOVERED"
  | "CAPABILITY_DEGRADED"
  | "CAPABILITY_CONFIGURATION_CHANGED";

export interface CapabilityDriftEvent {
  tenantId: string;
  deviceId: string;
  driftType: CapabilityDriftType;
  capability: CapabilityKey;
  previousValue?: string;
  newValue?: string;
  detectedAt: Date;
  probableCause?: string;
}

// ============ CAPABILITY ERRORS ============

/**
 * Error thrown when a capability is not supported.
 */
export class CapabilityNotSupportedError extends Error {
  constructor(
    public readonly deviceId: string,
    public readonly capability: CapabilityKey,
    public readonly state: CapabilityState,
  ) {
    super(`Device ${deviceId} does not support capability ${capability} (state: ${state})`);
    this.name = "CapabilityNotSupportedError";
  }
}

/**
 * Error thrown when a capability is supported but unavailable.
 */
export class CapabilityUnavailableError extends Error {
  constructor(
    public readonly deviceId: string,
    public readonly capability: CapabilityKey,
    public readonly reason?: string,
  ) {
    super(
      `Device ${deviceId} capability ${capability} is unavailable${reason ? `: ${reason}` : ""}`,
    );
    this.name = "CapabilityUnavailableError";
  }
}

/**
 * Error thrown when a capability state is unknown.
 */
export class CapabilityUnknownError extends Error {
  constructor(
    public readonly deviceId: string,
    public readonly capability: CapabilityKey,
  ) {
    super(`Device ${deviceId} capability ${capability} state is unknown - verification required`);
    this.name = "CapabilityUnknownError";
  }
}
