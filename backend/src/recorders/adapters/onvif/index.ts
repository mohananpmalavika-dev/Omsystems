/**
 * ONVIF Adapter Module
 * 
 * Complete ONVIF implementation with:
 * - SOAP envelope construction
 * - WS-Security authentication
 * - XML response parsing
 * - Evidence-based observations
 * 
 * Export barrel for clean imports.
 */

// Main adapter
export * from './onvif-recorder-adapter.js';

// ONVIF client
export * from './onvif-client.js';

// SOAP builder
export * from './onvif-soap-builder.js';

// Parser
export * from './onvif-parser.js';
