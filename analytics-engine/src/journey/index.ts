/**
 * Journey System - Public API
 * 
 * Complete cross-camera journey tracking system for CCTV platforms.
 * 
 * @example
 * ```typescript
 * import { initializeJourneySystem, JourneyService } from './journey.js';
 * 
 * // Initialize on startup
 * await initializeJourneySystem(pool);
 * 
 * // Get journey service
 * const journeyService = getJourneyService(pool, ...);
 * 
 * // Query journey
 * const journey = await journeyService.getPersonJourney(tenantId, personId);
 * ```
 */

// Core Types
export type {
  // Observations
  PersonObservation,
  NewPersonObservation,
  
  // Transitions
  PersonTransition,
  TransitionStatus,
  
  // Identity
  GlobalPerson,
  GlobalPersonStatus,
  IdentityResolution,
  AssociationMethod,
  
  // Topology
  CameraTransitionRule,
  TopologyScoreParams,
  TemporalFeasibility,
  
  // Journey
  PersonJourney,
  JourneyAppearance,
  JourneyTransition,
  JourneyGap,
  JourneySession,
  JourneySessionStatus,
  JourneyQueryOptions,
  JourneyStatistics,
  
  // Search
  PersonSearchRequest,
  PersonSearchMatch,
  
  // Embedding
  ReIdSample,
  EmbeddingQuality,
  TrackEmbeddingState,
  
  // Candidates
  CandidateObservation,
  
  // Bounding box
  BoundingBox
} from './journey.types.js';

// Services
export {
  EmbeddingService,
  TrackEmbeddingAccumulator,
  EmbeddingQualityAssessor,
  getEmbeddingService
} from './embedding.service.js';

export {
  ObservationRepository,
  getObservationRepository
} from './observation.repository.js';

export {
  CameraTopologyService,
  getCameraTopologyService
} from './topology.service.js';

export {
  ReIdVectorRepository,
  getReIdVectorRepository
} from './reid-vector.repository.js';

export {
  GlobalIdentityResolver,
  getGlobalIdentityResolver
} from './global-identity-resolver.js';

export {
  PersonTransitionCorrelator,
  getPersonTransitionCorrelator
} from './transition-correlator.js';

export {
  JourneyService,
  getJourneyService
} from './journey.service.js';

// Integration
export {
  JourneyIntegration
} from './human-analytics-integration.js';

// Initialization
export {
  initializeJourneySystem
} from './initialize-journey-system.js';

// Re-export vector store types for convenience
export type {
  ReIdEmbedding,
  ReIdMatch,
  ReIdSearchResult
} from '../reid/vector-store.service.js';
