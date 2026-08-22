/**
 * Recorder Core Services
 * 
 * Orchestration layer for evidence acquisition and assessment.
 * Export barrel for clean imports.
 */

// Evidence service (orchestration)
export * from './recorder-evidence.service.js';

// Adapter factory
export * from './recorder-adapter.factory.js';

// Evidence evaluator (assessment)
export * from './recorder-evidence-evaluator.js';
