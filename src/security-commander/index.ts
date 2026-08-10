/**
 * AI Security Commander
 * 
 * Main export module for the Security Commander system.
 * 
 * @example
 * ```typescript
 * import { SecurityCommanderService, EventIngestionService } from './security-commander';
 * 
 * // Initialize
 * const commander = new SecurityCommanderService(pool, {
 *   useLLM: true,
 *   ollamaUrl: 'http://localhost:11434'
 * });
 * 
 * // Execute natural language query
 * const response = await commander.execute(
 *   "Show me everything abnormal in the last 30 minutes",
 *   { userId, tenantId, permissions }
 * );
 * ```
 */

// Core Types
export * from './types/index.js';

// Event Normalization
export * from './normalizers/index.js';

// Event Ingestion
export { EventIngestionService } from './services/event-ingestion.service.js';

// Anomaly Detection
export * from './anomaly/index.js';

// Correlation
export * from './correlation/index.js';

// Investigation
export { InvestigationService } from './services/investigation.service.js';

// Evidence
export { EvidenceService } from './services/evidence.service.js';

// Correlation Service
export { CorrelationService } from './services/correlation.service.js';

// LLM Integration
export * from './llm/index.js';

// Commander Service
export { SecurityCommanderService } from './services/commander.service.js';

// Playbooks
export * from './playbooks/index.js';

// API
export * from './api/index.js';

// Repositories
export * from './repositories/index.js';

// Integration Bridges
export { AnalyticsBridge, CameraHealthBridge, RecorderHealthBridge } from './integrations/analytics-bridge.js';
