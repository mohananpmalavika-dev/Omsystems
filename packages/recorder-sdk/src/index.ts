/**
 * Recorder SDK
 * 
 * Canonical recorder driver SDK for unified DVR/NVR integration.
 * 
 * @packageDocumentation
 */

// Core Types
export type {
  RecorderVendor,
  RecorderProtocol,
  RecorderIdentity,
  RecorderContext,
  DeviceEndpoint,
  CredentialRef,
  HealthState,
  CapabilityState,
  RecorderCapabilities,
  DeviceInfo,
  StorageType,
  StorageVolume,
  StorageStatus,
  ChannelSourceType,
  ChannelConnectionState,
  ChannelRecordingState,
  RecorderChannel,
  StreamProfile,
  StreamEndpoint,
  StreamRequest,
  RecordingSegment,
  RecordingSearchRequest,
  RecordingSearchResult,
  RecorderProbeResult,
  RecorderDriverErrorCode,
} from "./core/recorder-driver.types.js";

export {
  RecorderDriverError,
  RecorderConnectionError,
  RecorderAuthenticationError,
  RecorderTimeoutError,
  RecorderProtocolError,
  UnsupportedCapabilityError,
} from "./core/recorder-driver.types.js";

// Core Interfaces & Registry
export type {
  RecorderDriver,
  ProbeOptions,
  ChannelStatus,
  RecordingStatus,
  DeviceTimeResult,
  DriverDetectionResult,
  DriverDetector,
} from "./core/recorder-driver.interface.js";

export {
  DriverRegistry,
  RecorderDriverRegistry,
  UnsupportedProtocolError,
  globalDriverRegistry,
} from "./core/driver-registry.js";

export { DefaultDriverDetector } from "./core/driver-detector.js";
export { CircuitBreaker } from "./core/circuit-breaker.js";
export { RecorderSession } from "./core/recorder-session.js";
export { RecorderManager, recorderManager } from "./core/recorder-manager.js";

// Transport Layer
export type {
  HttpTransportConfig,
  HttpRequestOptions,
  HttpResponse,
  AuthProvider,
} from "./transport/recorder-http-transport.js";

export {
  DEFAULT_HTTP_CONFIG,
  BasicAuthProvider,
  DigestAuthProvider,
} from "./transport/recorder-http-transport.js";

export {
  RecorderHttpClient,
  type CredentialResolver,
  InMemoryCredentialResolver,
} from "./transport/recorder-http-client.js";

// Drivers
export { DahuaCGIDriver } from "./drivers/dahua/dahua-cgi.driver.js";
export { HikvisionISAPIDriver } from "./drivers/hikvision/hikvision-isapi.driver.js";
export { ONVIFDriver } from "./drivers/onvif/onvif.driver.js";
export { UniviewDriver } from "./drivers/uniview/uniview.driver.js";
export { GenericRecorderDriver } from "./drivers/generic/generic-rtsp.driver.js";

// Pure Parsers
export {
  parseDahuaKeyValue,
  parseDahuaSystemInfo,
  parseDahuaStorage,
  parseDahuaChannels,
  parseDahuaFindMedia,
  formatDahuaPlaybackTime,
} from "./drivers/dahua/dahua.parsers.js";

export {
  extractXmlTag,
  extractXmlBlocks,
  parseHikvisionDeviceInfo,
  parseHikvisionStorage,
  parseHikvisionChannels,
  parseHikvisionSearch,
  formatHikvisionUtc,
} from "./drivers/hikvision/hikvision.parsers.js";

export {
  parseOnvifDeviceInformation,
  parseOnvifProfiles,
  parseOnvifStreamUri,
  parseOnvifRecordings,
} from "./drivers/onvif/onvif.parsers.js";

// Substream & Multi-Branch DVR Builders
export {
  SubstreamUrlBuilder,
  type DvrBrand,
  type StreamProfileType,
  type DvrChannelEndpoint,
  type BranchDvrConfig,
} from "./core/substream-url-builder.js";

export {
  DvrProfileManager,
  ENTERPRISE_INDUSTRY_PROFILES,
  type BranchIndustryProfile,
  type BranchChannelProfile,
  type ChannelAnalyticsRuleConfig,
} from "./core/dvr-profile-manager.js";
