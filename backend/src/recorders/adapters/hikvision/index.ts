/**
 * Hikvision Adapter Module
 * 
 * Complete Hikvision ISAPI implementation with:
 * - HTTP Digest authentication
 * - XML request/response handling
 * - Evidence-based observations
 * - Comprehensive feature support
 * 
 * Export barrel for clean imports.
 */

// Main adapter
export * from './hikvision-recorder-adapter.js';

// Hikvision client
export * from './hikvision-client.js';

// Parser
export * from './hikvision-parser.js';
