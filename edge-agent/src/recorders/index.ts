/**
 * CP PLUS & Multi-Vendor Recorder Compatibility Layer
 * 
 * Barrel export providing unified access to fingerprinting, capability detection,
 * protocol routing, and vendor adapters.
 */

// Legacy DVR Adapter & Utilities
export * from "./dvr-adapter.js";

// Core Types
export * from "./types/recorder-profile.types.js";

// Fingerprinting & Probes
export * from "./fingerprint/recorder-fingerprint.service.js";
export * from "./fingerprint/evidence-aggregator.js";
export * from "./fingerprint/confidence-scorer.js";
export * from "./fingerprint/fingerprint-signature.js";

// Capability Matrix & Registry
export * from "./capabilities/capability-detector.js";
export * from "./capabilities/capability-registry.js";

// Dynamic Protocol Router & Fallbacks
export * from "./routing/recorder-protocol-router.js";
export * from "./routing/operation-policy.js";

// Vendor Adapters
export * from "./adapters/recorder-adapter.interface.js";
export * from "./adapters/dahua-recorder.adapter.js";
export * from "./adapters/hikvision-recorder.adapter.js";
export * from "./adapters/onvif-recorder.adapter.js";
export * from "./adapters/rtsp-recorder.adapter.js";
export * from "./adapters/adapter-fallback-executor.js";

// Profiles & Sync
export * from "./profiles/recorder-profile.repository.js";
export * from "./profiles/recorder-profile-sync.js";
