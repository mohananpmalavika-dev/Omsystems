/**
 * Recorder Integration Framework
 * 
 * Evidence-based recorder acquisition and assessment subsystem.
 * 
 * ARCHITECTURE:
 * 
 * 1. Contracts Layer
 *    - Evidence type system (EvidenceValue<T>)
 *    - Evidence structures (RecorderEvidence, ChannelEvidence, etc.)
 *    - Evidence helpers (observed(), unknown(), etc.)
 * 
 * 2. Transport Layer
 *    - HTTP transport with retry/timeout
 *    - Authentication providers (Basic, Digest, ONVIF WS-Security, etc.)
 *    - Error normalization
 *    - Concurrency control
 * 
 * 3. Adapter Layer
 *    - ONVIF: Complete SOAP/WS-Security implementation
 *    - Hikvision: Complete ISAPI/Digest implementation
 *    - Dahua: TODO
 *    - Generic RTSP: TODO
 * 
 * 4. Core Layer
 *    - RecorderEvidenceService: Orchestration
 *    - RecorderAdapterFactory: Adapter creation
 *    - RecorderEvidenceEvaluator: Assessment (policy layer)
 * 
 * 5. Persistence Layer
 *    - EvidenceRepository: Database storage
 *    - Evidence snapshots
 *    - Historical trending
 * 
 * CRITICAL PRINCIPLES:
 * 
 * - Evidence ≠ Assessment
 *   Adapters acquire facts. Evaluator applies policy.
 * 
 * - Unknown ≠ False
 *   UNKNOWN means "cannot verify", not "verified false"
 * 
 * - Never Invent Values
 *   Return UNKNOWN/UNSUPPORTED instead of guessing
 * 
 * - Preserve Observation Metadata
 *   Include source, timestamp, confidence, latency
 * 
 * @module recorders
 */

// ============================================================================
// CONTRACTS (Evidence Model)
// ============================================================================

export {
  // Evidence value system
  type EvidenceValue,
  type EvidenceState,
  type EvidenceSource,
  type EvidenceError,
  type RecorderErrorCode,
  type EvidenceFreshness,
  type FreshnessThresholds,
  type RecorderAdapterType,
  
  // Evidence value utilities
  calculateFreshness,
  isObserved,
  isFailed,
  isRetriableError,
  stateToErrorCode,
  DEFAULT_FRESHNESS_THRESHOLDS
} from './contracts/evidence-value.js';

export {
  // Evidence structures
  type RecorderEvidence,
  type DeviceInfo,
  type RecorderCapabilities,
  type StorageEvidence,
  type DiskEvidence,
  type DiskState,
  type StorageGroupEvidence,
  type DeviceClockEvidence,
  type ChannelEvidence,
  type StreamMetadata,
  type StreamProfile,
  type RecordingSegment,
  type RecordingType,
  type RecordingSearchRequest,
  type RecorderProbe
} from './contracts/recorder-evidence.js';

export {
  // Evidence helpers
  observed,
  unknown,
  unsupported,
  authFailed,
  timedOut,
  unreachable,
  malformed,
  rateLimited,
  deviceError,
  fromError,
  combineEvidence,
  requireObserved,
  getValueOr,
  isActionable
} from './contracts/evidence-helpers.js';

// ============================================================================
// TRANSPORT (Common Infrastructure)
// ============================================================================

export {
  // HTTP transport
  RecorderHttpTransport,
  type HttpTransportConfig,
  type HttpRequestOptions,
  type HttpResponse,
  RecorderTransportError
} from './transport/recorder-http-transport.js';

export {
  // Authentication
  type RecorderCredentials,
  type AuthHeaders,
  type AuthProvider,
  type AuthRequestOptions,
  BasicAuthProvider,
  DigestAuthProvider,
  OnvifWsSecurityProvider,
  SessionAuthProvider,
  ApiKeyAuthProvider,
  createAuthProvider
} from './transport/recorder-auth.js';

export {
  // Error mapping
  errorToEvidenceState,
  errorCodeToState,
  isUnreachableError,
  isAuthError,
  isRetriableError as isTransportRetriable,
  getUserMessage,
  getTechnicalDetails
} from './transport/error-mapper.js';

export {
  // Request limiting
  RecorderRequestLimiter,
  RequestPriority,
  type RequestLimiterConfig,
  type RequestStats,
  globalRequestLimiter
} from './transport/request-limiter.js';

// ============================================================================
// ADAPTERS (Vendor Implementations)
// ============================================================================

// ONVIF adapter
export {
  OnvifRecorderAdapter,
  type OnvifAdapterConfig,
  OnvifClient,
  type OnvifClientConfig,
  type OnvifServiceEndpoints,
  OnvifSoapBuilder,
  OnvifDeviceOperations,
  OnvifMediaOperations,
  OnvifRecordingOperations,
  OnvifSearchOperations,
  ONVIF_NAMESPACES,
  OnvifParser,
  sanitizeOnvifUri,
  extractOnvifHost,
  buildServiceUrl
} from './adapters/onvif/index.js';

// Hikvision adapter
export {
  HikvisionRecorderAdapter,
  type HikvisionAdapterConfig,
  HikvisionClient,
  type HikvisionClientConfig,
  HikvisionParser,
  buildSearchRequest,
  sanitizeHikvisionUri
} from './adapters/hikvision/index.js';

// TODO: Dahua adapter
// TODO: Generic RTSP adapter

// ============================================================================
// CORE (Orchestration & Assessment)
// ============================================================================

export {
  // Evidence service (orchestration)
  RecorderEvidenceService,
  type EvidenceCollectionConfig,
  type EvidenceCollectionResult
} from './core/recorder-evidence.service.js';

export {
  // Adapter factory
  RecorderAdapterFactory,
  type AdapterConfig,
  type RecorderAdapter
} from './core/recorder-adapter.factory.js';

export {
  // Evidence evaluator (assessment)
  RecorderEvidenceEvaluator,
  type OperationalStatus,
  type RecordingComplianceStatus,
  type AssessmentReason,
  type RecorderAssessment,
  type ChannelAssessment,
  type StorageAssessment
} from './core/recorder-evidence-evaluator.js';

// ============================================================================
// PERSISTENCE (Database Layer)
// ============================================================================

export {
  // Evidence repository
  EvidenceRepository,
  type EvidenceSnapshotRow,
  type ChannelEvidenceRow
} from './persistence/evidence-repository.js';

// ============================================================================
// USAGE EXAMPLES
// ============================================================================

/**
 * Example 1: Collect Evidence
 * 
 * ```typescript
 * const evidenceService = new RecorderEvidenceService(adapterFactory);
 * 
 * const result = await evidenceService.collectEvidence({
 *   recorderId: 'rec-123',
 *   tenantId: 'tenant-456',
 *   recorderUrl: 'http://192.168.1.100',
 *   adapterType: 'auto',
 *   credentials: { username: 'admin', password: 'pass' }
 * });
 * 
 * console.log(result.evidence);
 * console.log(result.success);
 * ```
 */

/**
 * Example 2: Evaluate Evidence
 * 
 * ```typescript
 * const evaluator = new RecorderEvidenceEvaluator();
 * const assessment = evaluator.evaluateRecorder(evidence);
 * 
 * console.log(assessment.status); // HEALTHY, DEGRADED, FAILED, UNKNOWN
 * console.log(assessment.reasons); // ['STORAGE_FULL', 'RECORDING_STOPPED']
 * ```
 */

/**
 * Example 3: Check Evidence State
 * 
 * ```typescript
 * import { isObserved } from '@/recorders';
 * 
 * if (isObserved(evidence.recordingActive)) {
 *   const isRecording = evidence.recordingActive.value;
 * } else {
 *   console.log(`Cannot verify: ${evidence.recordingActive.state}`);
 * }
 * ```
 */

/**
 * Example 4: Persist Evidence
 * 
 * ```typescript
 * const repository = new EvidenceRepository(pool);
 * 
 * await repository.saveEvidence(evidence);
 * const latest = await repository.getLatestEvidence(recorderId);
 * ```
 */

/**
 * Example 5: Create Adapter
 * 
 * ```typescript
 * const factory = new RecorderAdapterFactory();
 * 
 * const adapter = await factory.createAdapter({
 *   type: 'onvif',
 *   recorderId: 'rec-123',
 *   recorderUrl: 'http://192.168.1.100',
 *   credentials: { username: 'admin', password: 'pass' }
 * });
 * 
 * const info = await adapter.getDeviceInfo();
 * ```
 */
