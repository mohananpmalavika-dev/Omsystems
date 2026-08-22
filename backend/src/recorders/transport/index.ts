/**
 * Recorder Transport Layer
 * 
 * Common transport infrastructure for all recorder adapters.
 * Export barrel for clean imports.
 */

// HTTP transport
export * from './recorder-http-transport.js';

// Authentication providers
export * from './recorder-auth.js';

// Error mapping
export * from './error-mapper.js';

// Request limiting
export * from './request-limiter.js';
