/**
 * AI Assistant V2 - Truthful Orchestration Layer
 * 
 * This module provides a refactored AI Assistant that replaces fake
 * operational claims with verified results from real domain services.
 * 
 * ## Key Improvements
 * 
 * 1. **No False Success Claims**
 *    - Camera control returns VerifiedSuccess only when state is confirmed
 *    - All results include evidence trails from domain services
 *    - Unverified operations are explicitly marked as PARTIAL
 * 
 * 2. **Real Service Integration**
 *    - CameraService for camera resolution and state
 *    - CameraControlService for start/stop with verification
 *    - SystemHealthService for actual health aggregation
 *    - DetectionSearchService for real detection queries
 *    - InvestigationService for persistent ReID workflows
 *    - AnalyticsService for live metrics
 *    - ReportService for actual report generation
 * 
 * 3. **Comprehensive Audit Trail**
 *    - Every operation is audited with evidence IDs
 *    - Authorization decisions are recorded
 *    - Execution duration is tracked
 * 
 * 4. **Capability Management**
 *    - Commands check service availability before execution
 *    - Graceful degradation when services are unavailable
 *    - Explicit UNKNOWN state handling
 * 
 * 5. **Separation of Concerns**
 *    - Commands handle execution logic
 *    - Presenter handles natural language formatting
 *    - Registries manage availability and mapping
 *    - Services provide domain operations
 * 
 * ## Usage
 * 
 * ```typescript
 * import { createAIAssistantV2 } from './assistant';
 * import { commandRegistry } from './assistant/registry';
 * import { StartCameraCommand, StopCameraCommand } from './assistant/commands';
 * 
 * // Register commands
 * commandRegistry.register(
 *   {
 *     id: 'camera-start',
 *     name: 'Start Camera',
 *     risk: CommandRisk.SIDE_EFFECT,
 *     requires: ['camera-service', 'camera-control'],
 *     enabled: true
 *   },
 *   new StartCameraCommand(cameraService, cameraControl, authorization, audit),
 *   ['CAMERA_START']
 * );
 * 
 * // Create assistant
 * const assistant = createAIAssistantV2({ debug: true });
 * 
 * // Process queries
 * const response = await assistant.processQuery(
 *   'Start camera 5',
 *   {
 *     id: 'user_123',
 *     roles: ['operator'],
 *     siteIds: ['site_main']
 *   },
 *   'session_abc'
 * );
 * 
 * console.log(response.message);
 * console.log('Verified:', response.evidence?.length > 0);
 * ```
 * 
 * ## Architecture
 * 
 * ```
 * User Query
 *     ↓
 * Intent Parser
 *     ↓
 * Command Registry (resolves intent → command)
 *     ↓
 * Capability Check (validates requirements)
 *     ↓
 * Command Execution
 *     ├→ Resource Resolution
 *     ├→ Authorization
 *     ├→ Domain Service Call
 *     ├→ State Verification
 *     └→ Audit Recording
 *     ↓
 * Result Presenter
 *     ↓
 * Natural Language Response
 * ```
 */

// Core assistant
export * from './ai-assistant-v2.js';

// Types
export * from './types/index.js';

// Commands
export * from './commands/index.js';

// Registry
export * from './registry/index.js';

// Services
export * from './services/index.js';

// Presentation
export * from './presentation/index.js';
