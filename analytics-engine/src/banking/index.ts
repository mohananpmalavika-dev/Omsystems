/**
 * Banking Analytics Module
 * 
 * Complete event-driven banking analytics system with:
 * - Normalized event types and event bus
 * - Persistent session management
 * - Rule-based workflow evaluation
 * - State machine for cash van operations
 * - Evidence-backed assessments
 */

// Core service
export * from './banking-analytics.service';

// Events
export * from './events';

// Models
export * from './models';

// Repositories
export * from './repositories';

// Rules
export * from './rules';

// Workflow
export * from './workflow';
