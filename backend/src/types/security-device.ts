/**
 * Unified Physical Security Device Types
 * 
 * Banking-grade security device integration layer supporting CCTV, access control,
 * intrusion detection, fire safety, ATM security, vault monitoring, and environmental sensors.
 * 
 * Integrates with existing Digital Twin architecture for spatial awareness and
 * correlated incident management.
 */

/**
 * Comprehensive security device types for banking environments
 */
export type SecurityDeviceType =
  // Video surveillance
  | 'CAMERA'
  | 'NVR'
  | 'DVR'
  | 'VIDEO_ENCODER'
  | 'VIDEO_DECODER'
  
  // Access control
  | 'ACCESS_CONTROLLER'
  | 'DOOR'
  | 'DOOR_LOCK'
  | 'CARD_READER'
  | 'BIOMETRIC_READER'
  | 'FINGERPRINT_READER'
  | 'FACE_RECOGNITION_TERMINAL'
  | 'TURNSTILE'
  | 'GATE'
  
  // Intrusion & alarm
  | 'INTRUSION_PANEL'
  | 'AX_PRO_HUB'
  | 'AX_PRO_PIR'
  | 'AX_PRO_PIRCAM'
  | 'AX_PRO_MAGNETIC_CONTACT'
  | 'AX_PRO_GLASS_BREAK'
  | 'AX_PRO_SHOCK'
  | 'AX_PRO_SMOKE'
  | 'AX_PRO_WATER'
  | 'AX_PRO_TEMPERATURE'
  | 'AX_PRO_PANIC'
  | 'AX_PRO_KEYPAD'
  | 'AX_PRO_TAG_READER'
  | 'AX_PRO_KEYFOB'
  | 'AX_PRO_SOUNDER'
  | 'AX_PRO_REPEATER'
  | 'AX_PRO_OUTPUT'
  | 'ALARM_ZONE'
  | 'ALARM_SIREN'
  | 'PANIC_BUTTON'
  | 'DURESS_BUTTON'
  | 'EMERGENCY_BUTTON'
  | 'MOTION_SENSOR'
  | 'PIR_SENSOR'
  | 'GLASS_BREAK_SENSOR'
  | 'DOOR_CONTACT'
  | 'WINDOW_CONTACT'
  | 'VIBRATION_SENSOR'
  
  // Fire & safety
  | 'FIRE_PANEL'
  | 'FIRE_SENSOR'
  | 'SMOKE_DETECTOR'
  | 'HEAT_DETECTOR'
  | 'CO_DETECTOR'
  | 'GAS_DETECTOR'
  | 'FIRE_SUPPRESSION_SYSTEM'
  | 'FIRE_EXTINGUISHER_MONITOR'
  | 'EMERGENCY_LIGHTING'
  | 'EXIT_SIGN'
  
  // Banking-specific
  | 'ATM'
  | 'ATM_CAMERA'
  | 'VAULT'
  | 'VAULT_DOOR'
  | 'SAFE'
  | 'CASH_COUNTER'
  | 'TELLER_STATION'
  | 'STRONG_ROOM'
  | 'CASH_DRAWER_SENSOR'
  | 'BILL_VALIDATOR'
  | 'COIN_DISPENSER'
  
  // Power & environmental
  | 'UPS'
  | 'POWER_SUPPLY'
  | 'BATTERY_BACKUP'
  | 'GENERATOR'
  | 'POWER_MONITOR'
  | 'TEMPERATURE_SENSOR'
  | 'HUMIDITY_SENSOR'
  | 'WATER_LEAK_SENSOR'
  | 'FLOOD_SENSOR'
  
  // Network & infrastructure
  | 'NETWORK_SWITCH'
  | 'ROUTER'
  | 'FIREWALL'
  | 'WIRELESS_AP'
  | 'NETWORK_GATEWAY'
  | 'EDGE_GATEWAY'
  
  // Communication
  | 'INTERCOM'
  | 'PA_SYSTEM'
  | 'TWO_WAY_AUDIO'
  | 'EMERGENCY_PHONE'
  
  // Miscellaneous
  | 'VISITOR_MANAGEMENT_KIOSK'
  | 'BARRIER_ARM'
  | 'SHUTTER_SENSOR'
  | 'LIGHTING_CONTROLLER'
  | 'ENVIRONMENTAL_CONTROLLER';

/**
 * Device operational status
 */
export type DeviceStatus =
  | 'ONLINE'          // Device is operational
  | 'OFFLINE'         // Device is not reachable
  | 'DEGRADED'        // Device is operational with issues
  | 'ALARM'           // Device is in alarm state
  | 'MAINTENANCE'     // Device is under maintenance
  | 'DISABLED'        // Device is administratively disabled
  | 'PROVISIONING'    // Device is being set up
  | 'UNKNOWN';        // Status cannot be determined

/**
 * Device health indicators
 */
export type DeviceHealth =
  | 'EXCELLENT'       // 90-100% health
  | 'GOOD'           // 70-89% health
  | 'FAIR'           // 50-69% health
  | 'POOR'           // 30-49% health
  | 'CRITICAL'       // Below 30% health
  | 'UNKNOWN';

/**
 * Communication protocols supported by devices
 */
export type DeviceProtocol =
  | 'ONVIF'           // Open Network Video Interface Forum
  | 'RTSP'            // Real Time Streaming Protocol
  | 'HTTP_API'        // Generic HTTP REST API
  | 'HTTPS_API'       // Secure HTTP REST API
  | 'REST'            // RESTful API
  | 'SOAP'            // Simple Object Access Protocol
  | 'SNMP'            // Simple Network Management Protocol
  | 'MQTT'            // Message Queuing Telemetry Transport
  | 'MODBUS_TCP'      // Modbus over TCP
  | 'MODBUS_RTU'      // Modbus RTU serial
  | 'BACNET'          // Building Automation and Control Network
  | 'RS485'           // Serial communication
  | 'RS232'           // Serial communication
  | 'WIEGAND'         // Access control protocol
  | 'DRY_CONTACT'     // Physical relay/contact closure
  | 'GPIO'            // General Purpose I/O
  | 'WEBSOCKET'       // WebSocket protocol
  | 'VENDOR_SDK'      // Proprietary vendor SDK
  | 'ISAPI'           // Hikvision Intelligent Security API
  | 'AX_PRO'          // Hikvision AX PRO integration transport
  | 'EDGE_GATEWAY'    // Abstracted through edge gateway
  | 'UNKNOWN';

/**
 * Device capabilities define what operations can be performed
 */
export type DeviceCapability =
  // Read-only capabilities
  | 'VIEW'                    // View device information
  | 'HEALTH_READ'             // Read health metrics
  | 'EVENT_READ'              // Read events
  | 'STATUS_READ'             // Read status
  | 'METRICS_READ'            // Read performance metrics
  | 'LOG_READ'                // Read device logs
  
  // Control capabilities
  | 'REBOOT'                  // Reboot device
  | 'RESET'                   // Reset device to defaults
  | 'FIRMWARE_UPDATE'         // Update firmware
  | 'CONFIG_UPDATE'           // Update configuration
  
  // Camera-specific
  | 'PTZ'                     // Pan-Tilt-Zoom control
  | 'SNAPSHOT'                // Capture snapshot
  | 'RECORDING_CONTROL'       // Start/stop recording
  | 'PRIVACY_MODE'            // Enable/disable privacy mask
  
  // Access control
  | 'LOCK'                    // Lock door/gate
  | 'UNLOCK'                  // Unlock door/gate
  | 'GRANT_ACCESS'            // Grant temporary access
  | 'REVOKE_ACCESS'           // Revoke access
  | 'ACCESS_LOG'              // Read access logs
  
  // Alarm system
  | 'ARM'                     // Arm alarm system
  | 'DISARM'                  // Disarm alarm system
  | 'ARM_STAY'                // Arm in stay mode
  | 'ARM_AWAY'                // Arm in away mode
  | 'ACK_ALARM'               // Acknowledge alarm
  | 'SILENCE_ALARM'           // Silence siren
  | 'TEST_ALARM'              // Test alarm system
  
  // Emergency
  | 'TRIGGER_PANIC'           // Trigger panic alarm
  | 'LOCKDOWN'                // Initiate facility lockdown
  | 'EVACUATE'                // Trigger evacuation
  | 'ALL_CLEAR'               // Send all-clear signal
  
  // Power management
  | 'POWER_CYCLE'             // Power cycle device
  | 'BATTERY_TEST'            // Test battery backup
  | 'SELF_TEST'               // Run self-diagnostics;

/**
 * Event severity levels
 */
export type EventSeverity =
  | 'P0'          // System-wide critical emergency
  | 'P1'          // Branch-level emergency
  | 'P2'          // High priority incident
  | 'P3'          // Medium priority event
  | 'P4'          // Low priority event
  | 'INFO';       // Informational event

/**
 * Security device event types
 */
export type SecurityDeviceEventType =
  // Generic device events
  | 'DEVICE_ONLINE'
  | 'DEVICE_OFFLINE'
  | 'DEVICE_DEGRADED'
  | 'DEVICE_REBOOT'
  | 'DEVICE_TAMPER'
  | 'DEVICE_LOW_BATTERY'
  | 'DEVICE_POWER_LOSS'
  | 'DEVICE_COMMUNICATION_FAILURE'
  | 'DEVICE_CONFIG_CHANGE'
  | 'DEVICE_FIRMWARE_UPDATE'
  | 'AX_PRO_EVENT_UNMAPPED'
  
  // Access control events
  | 'ACCESS_GRANTED'
  | 'ACCESS_DENIED'
  | 'ACCESS_DENIED_INVALID_CREDENTIAL'
  | 'ACCESS_DENIED_WRONG_TIME'
  | 'ACCESS_DENIED_REVOKED'
  | 'DOOR_OPENED'
  | 'DOOR_CLOSED'
  | 'DOOR_FORCED_OPEN'
  | 'DOOR_HELD_OPEN'
  | 'DOOR_PROPPED_OPEN'
  | 'LOCK_FAILURE'
  | 'TAILGATING_DETECTED'
  | 'ANTIPASSBACK_VIOLATION'
  | 'DURESS_CODE_USED'
  
  // Intrusion & alarm events
  | 'ALARM_ARMED'
  | 'ALARM_DISARMED'
  | 'ALARM_TRIGGERED'
  | 'ALARM_ZONE_TRIGGERED'
  | 'ALARM_ACKNOWLEDGED'
  | 'ALARM_CLEARED'
  | 'MOTION_DETECTED'
  | 'GLASS_BREAK_DETECTED'
  | 'VIBRATION_DETECTED'
  | 'PERIMETER_BREACH'
  | 'INTRUSION_DETECTED'
  
  // Emergency events
  | 'PANIC_BUTTON_PRESSED'
  | 'DURESS_BUTTON_PRESSED'
  | 'EMERGENCY_BUTTON_PRESSED'
  | 'EMERGENCY_CALL_ACTIVATED'
  
  // Fire & safety events
  | 'FIRE_ALARM_TRIGGERED'
  | 'SMOKE_DETECTED'
  | 'HEAT_DETECTED'
  | 'CO_DETECTED'
  | 'GAS_LEAK_DETECTED'
  | 'FIRE_SUPPRESSION_ACTIVATED'
  | 'FIRE_ALARM_TEST'
  | 'FIRE_ALARM_ACKNOWLEDGED'
  | 'FIRE_ALARM_CLEARED'
  | 'EMERGENCY_EXIT_BLOCKED'
  | 'EXTINGUISHER_MISSING'
  
  // Banking-specific events
  | 'VAULT_OPENED'
  | 'VAULT_CLOSED'
  | 'VAULT_FORCED_OPEN'
  | 'VAULT_UNAUTHORIZED_ACCESS'
  | 'VAULT_DUAL_CONTROL_VIOLATION'
  | 'SAFE_OPENED'
  | 'SAFE_CLOSED'
  | 'CASH_DRAWER_OPENED'
  | 'CASH_COUNTER_ALERT'
  | 'TELLER_PANIC'
  | 'ATM_TAMPER'
  | 'ATM_SKIMMER_DETECTED'
  | 'ATM_CASH_LOW'
  | 'ATM_CASH_OUT'
  | 'ATM_CASH_JAM'
  | 'ATM_CARD_READER_ERROR'
  | 'ATM_DISPENSER_ERROR'
  | 'ATM_OUT_OF_SERVICE'
  | 'ATM_VANDALISM'
  | 'ATM_CABINET_OPENED'
  | 'ATM_DOOR_OPENED'
  
  // Power & environmental events
  | 'UPS_ON_BATTERY'
  | 'UPS_LOW_BATTERY'
  | 'UPS_CRITICAL_BATTERY'
  | 'UPS_BATTERY_FAILURE'
  | 'UPS_OVERLOAD'
  | 'POWER_FAILURE'
  | 'POWER_RESTORED'
  | 'GENERATOR_STARTED'
  | 'GENERATOR_STOPPED'
  | 'TEMPERATURE_HIGH'
  | 'TEMPERATURE_LOW'
  | 'TEMPERATURE_CRITICAL'
  | 'HUMIDITY_HIGH'
  | 'HUMIDITY_LOW'
  | 'WATER_LEAK_DETECTED'
  | 'FLOOD_DETECTED'
  
  // Network events
  | 'NETWORK_DISCONNECTED'
  | 'NETWORK_CONNECTED'
  | 'NETWORK_DEGRADED'
  | 'BANDWIDTH_EXCEEDED'
  | 'PACKET_LOSS_HIGH'
  | 'LATENCY_HIGH'
  
  // Camera-specific events
  | 'CAMERA_MOTION_DETECTED'
  | 'CAMERA_TAMPERING'
  | 'CAMERA_OBSTRUCTION'
  | 'CAMERA_DEFOCUS'
  | 'CAMERA_RECORDING_STARTED'
  | 'CAMERA_RECORDING_STOPPED'
  | 'CAMERA_STORAGE_FULL'
  | 'CAMERA_STORAGE_FAILURE'
  
  // Other events
  | 'VISITOR_CHECKED_IN'
  | 'VISITOR_CHECKED_OUT'
  | 'SHUTTER_OPENED'
  | 'SHUTTER_CLOSED'
  | 'BARRIER_OPENED'
  | 'BARRIER_CLOSED';

/**
 * Core security device model
 */
export interface SecurityDevice {
  id: string;
  tenantId: string;
  branchId: string;
  
  // Device identification
  type: SecurityDeviceType;
  name: string;
  description?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  
  // Network information
  ipAddress?: string;
  macAddress?: string;
  port?: number;
  protocol: DeviceProtocol;
  
  // Status & health
  status: DeviceStatus;
  health: DeviceHealth;
  lastSeenAt?: Date;
  lastHealthCheckAt?: Date;
  
  // Capabilities
  capabilities: DeviceCapability[];
  
  // Relationships
  parentDeviceId?: string;        // For devices connected through parent (e.g., camera → NVR)
  controllerDeviceId?: string;    // For devices managed by controller (e.g., door → access controller)
  
  // Digital Twin integration
  digitalTwinObjectId?: string;   // Link to floor plan object
  
  // Device-specific metadata
  metadata: Record<string, any>;
  
  // Credentials reference (never store actual credentials here)
  credentialRefId?: string;
  
  // Configuration
  pollingIntervalSeconds?: number;
  eventBufferSize?: number;
  autoDiscovered: boolean;
  enrollmentStatus: 'DISCOVERED' | 'PENDING_REVIEW' | 'APPROVED' | 'PROVISIONING' | 'ACTIVE' | 'REJECTED';
  
  // Audit fields
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
  updatedBy?: string;
}

/**
 * Device health snapshot with detailed metrics
 */
export interface SecurityDeviceHealthSnapshot {
  id: string;
  deviceId: string;
  tenantId: string;
  branchId: string;
  
  // Overall health
  health: DeviceHealth;
  healthScore: number;          // 0-100
  
  // Connectivity
  isOnline: boolean;
  responseTimeMs?: number;
  packetLossPercent?: number;
  signalStrengthDbm?: number;
  
  // Device-specific metrics
  cpuUsagePercent?: number;
  memoryUsagePercent?: number;
  storageUsagePercent?: number;
  temperatureCelsius?: number;
  
  // Power
  powerStatus?: 'AC' | 'BATTERY' | 'GENERATOR' | 'UNKNOWN';
  batteryLevelPercent?: number;
  batteryVoltage?: number;
  upsRuntimeMinutes?: number;
  
  // Error indicators
  errorCount: number;
  warningCount: number;
  lastErrorMessage?: string;
  lastErrorAt?: Date;
  
  // Maintenance indicators
  uptimeSeconds?: number;
  lastRebootAt?: Date;
  lastMaintenanceAt?: Date;
  nextMaintenanceDue?: Date;
  
  // Metadata
  metadata: Record<string, any>;
  
  capturedAt: Date;
  createdAt: Date;
}

/**
 * Security device event
 */
export interface SecurityDeviceEvent {
  id: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  
  // Event classification
  eventType: SecurityDeviceEventType;
  severity: EventSeverity;
  category: 'ACCESS' | 'ALARM' | 'FIRE' | 'BANKING' | 'POWER' | 'NETWORK' | 'MAINTENANCE' | 'OTHER';
  
  // Event details
  title: string;
  description?: string;
  
  // Timing
  occurredAt: Date;           // When event actually occurred on device
  receivedAt: Date;           // When event received by platform
  processedAt?: Date;         // When event was processed
  
  // Context
  userId?: string;            // Associated user (e.g., for access events)
  credential?: string;        // Credential used (never store actual credential value)
  location?: string;          // Physical location description
  
  // Correlation
  correlationId?: string;     // Group related events
  parentEventId?: string;     // Reference to parent event
  incidentId?: string;        // Associated incident ID
  
  // Processing status
  processed: boolean;
  acknowledged: boolean;
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  
  // Related data
  payload: Record<string, any>;       // Raw event payload
  normalizedPayload?: Record<string, any>;  // Normalized/parsed payload
  
  // Media attachments
  snapshotUrl?: string;
  videoUrl?: string;
  attachedCameraIds?: string[];
  
  // Metadata
  metadata: Record<string, any>;
  
  createdAt: Date;
}

/**
 * Device command for executing operations
 */
export interface DeviceCommand {
  id: string;
  tenantId: string;
  branchId: string;
  deviceId: string;
  
  // Command details
  command: DeviceCapability;
  parameters?: Record<string, any>;
  
  // Authorization
  requestedBy: string;
  approvedBy?: string;
  requiresApproval: boolean;
  requiresMFA: boolean;
  reason?: string;
  
  // Execution
  status: 'PENDING' | 'APPROVED' | 'EXECUTING' | 'COMPLETED' | 'FAILED' | 'REJECTED' | 'TIMEOUT';
  result?: Record<string, any>;
  errorMessage?: string;
  
  // Timing
  requestedAt: Date;
  approvedAt?: Date;
  executedAt?: Date;
  completedAt?: Date;
  timeoutSeconds: number;
  
  // Audit
  auditLog: CommandAuditEntry[];
  
  createdAt: Date;
  updatedAt: Date;
}

export interface CommandAuditEntry {
  timestamp: Date;
  action: string;
  performedBy: string;
  details?: Record<string, any>;
}

/**
 * Device command result
 */
export interface DeviceCommandResult {
  commandId: string;
  success: boolean;
  result?: Record<string, any>;
  errorMessage?: string;
  executionTimeMs: number;
  completedAt: Date;
}

/**
 * Device adapter interface - all adapters must implement this
 */
export interface SecurityDeviceAdapter {
  /**
   * Adapter metadata
   */
  adapterName: string;
  adapterVersion: string;
  supportedProtocols: DeviceProtocol[];
  supportedDeviceTypes: SecurityDeviceType[];
  
  /**
   * Initialize the adapter
   */
  initialize(config: Record<string, any>): Promise<void>;
  
  /**
   * Discover devices on the network
   */
  discover(network: string, options?: DiscoveryOptions): Promise<DiscoveredDevice[]>;
  
  /**
   * Connect to a device
   */
  connect(device: SecurityDevice): Promise<ConnectionResult>;
  
  /**
   * Disconnect from a device
   */
  disconnect(device: SecurityDevice): Promise<void>;
  
  /**
   * Get device health
   */
  getHealth(device: SecurityDevice): Promise<SecurityDeviceHealthSnapshot>;
  
  /**
   * Get current device state
   */
  getState(device: SecurityDevice): Promise<DeviceState>;
  
  /**
   * Get device events since timestamp
   */
  getEvents(device: SecurityDevice, since?: Date, limit?: number): Promise<SecurityDeviceEvent[]>;
  
  /**
   * Execute a command on the device
   */
  executeCommand(device: SecurityDevice, command: DeviceCommand): Promise<DeviceCommandResult>;
  
  /**
   * Test device connectivity
   */
  testConnection(device: SecurityDevice): Promise<boolean>;
  
  /**
   * Get device capabilities
   */
  getCapabilities(device: SecurityDevice): Promise<DeviceCapability[]>;
}

/**
 * Discovery options
 */
export interface DiscoveryOptions {
  timeoutSeconds?: number;
  includeDeviceTypes?: SecurityDeviceType[];
  excludeDeviceTypes?: SecurityDeviceType[];
  deepScan?: boolean;
  followRelationships?: boolean;
}

/**
 * Discovered device
 */
export interface DiscoveredDevice {
  ipAddress: string;
  macAddress?: string;
  port?: number;
  deviceType?: SecurityDeviceType;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  protocol: DeviceProtocol;
  capabilities?: DeviceCapability[];
  metadata: Record<string, any>;
  discoveredAt: Date;
  confidence: number;         // 0-100: How confident we are in the device identification
}

/**
 * Connection result
 */
export interface ConnectionResult {
  success: boolean;
  deviceInfo?: DeviceInfo;
  errorMessage?: string;
  capabilities?: DeviceCapability[];
}

/**
 * Device information
 */
export interface DeviceInfo {
  manufacturer: string;
  model: string;
  serialNumber?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  macAddress?: string;
  supportedProtocols: DeviceProtocol[];
  metadata: Record<string, any>;
}

/**
 * Generic device state
 */
export interface DeviceState {
  status: DeviceStatus;
  health: DeviceHealth;
  isOnline: boolean;
  lastSeenAt: Date;
  stateData: Record<string, any>;
}

/**
 * Device relationship for hierarchical device structures
 */
export interface DeviceRelationship {
  id: string;
  parentDeviceId: string;
  childDeviceId: string;
  relationshipType: 'PHYSICAL_CONNECTION' | 'LOGICAL_CONTROL' | 'DATA_FLOW' | 'POWER_SUPPLY' | 'NETWORK_DEPENDENCY';
  metadata: Record<string, any>;
  createdAt: Date;
}

/**
 * Device integration configuration
 */
export interface DeviceIntegration {
  id: string;
  tenantId: string;
  name: string;
  description?: string;
  
  // Integration type
  integrationType: 'DIRECT' | 'EDGE_GATEWAY' | 'CLOUD_BRIDGE' | 'VENDOR_API';
  
  // Adapter configuration
  adapterName: string;
  adapterVersion: string;
  protocol: DeviceProtocol;
  
  // Connection details (credentials stored separately)
  connectionConfig: Record<string, any>;
  credentialRefId?: string;
  
  // Integration health
  status: 'ACTIVE' | 'INACTIVE' | 'ERROR' | 'MAINTENANCE';
  lastSyncAt?: Date;
  lastErrorAt?: Date;
  lastErrorMessage?: string;
  
  // Settings
  pollingIntervalSeconds: number;
  autoReconnect: boolean;
  maxRetries: number;
  
  // Statistics
  devicesManaged: number;
  eventsProcessedToday: number;
  totalEventsProcessed: number;
  
  // Metadata
  metadata: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;
}

/**
 * Branch security posture - aggregate view of all security devices
 */
export interface BranchSecurityPosture {
  branchId: string;
  tenantId: string;
  
  // Overall status
  overallStatus: 'NORMAL' | 'WARNING' | 'CRITICAL' | 'EMERGENCY';
  securityScore: number;      // 0-100
  
  // Device summary by category
  cctv: DeviceCategoryStatus;
  accessControl: DeviceCategoryStatus;
  intrusion: DeviceCategoryStatus;
  fire: DeviceCategoryStatus;
  banking: DeviceCategoryStatus;
  power: DeviceCategoryStatus;
  network: DeviceCategoryStatus;
  
  // Active issues
  activeAlarms: number;
  criticalIssues: number;
  warnings: number;
  
  // Recent events
  recentEvents: SecurityDeviceEvent[];
  
  // Correlation insights
  correlatedIncidents: number;
  aiInsights?: string[];
  
  // Metadata
  lastUpdated: Date;
  metadata: Record<string, any>;
}

/**
 * Device category status
 */
export interface DeviceCategoryStatus {
  totalDevices: number;
  onlineDevices: number;
  offlineDevices: number;
  degradedDevices: number;
  alarmDevices: number;
  healthScore: number;        // 0-100
  status: 'NORMAL' | 'WARNING' | 'CRITICAL';
}

/**
 * Correlated security incident
 */
export interface CorrelatedSecurityIncident {
  id: string;
  tenantId: string;
  branchId: string;
  
  // Incident classification
  incidentType: string;
  severity: EventSeverity;
  confidence: number;         // 0-100: AI confidence in correlation
  
  // Incident details
  title: string;
  description: string;
  aiSummary?: string;
  
  // Involved devices and events
  deviceIds: string[];
  eventIds: string[];
  primaryEventId: string;
  
  // Timeline
  firstEventAt: Date;
  lastEventAt: Date;
  detectedAt: Date;
  
  // Response status
  status: 'ACTIVE' | 'ACKNOWLEDGED' | 'INVESTIGATING' | 'RESOLVED' | 'FALSE_POSITIVE';
  acknowledgedBy?: string;
  acknowledgedAt?: Date;
  resolvedBy?: string;
  resolvedAt?: Date;
  
  // Evidence
  attachedCameraIds?: string[];
  snapshotUrls?: string[];
  videoUrls?: string[];
  evidencePackageUrl?: string;
  
  // Actions taken
  actionsLog: IncidentAction[];
  
  // Escalation
  escalationLevel: number;
  escalatedTo?: string[];
  notificationsSent: number;
  
  // Metadata
  metadata: Record<string, any>;
  
  createdAt: Date;
  updatedAt: Date;
}

export interface IncidentAction {
  timestamp: Date;
  action: string;
  performedBy: string;
  details?: Record<string, any>;
}

// Request/Response DTOs

export interface CreateSecurityDeviceRequest {
  tenantId?: string;
  branchId: string;
  type: SecurityDeviceType;
  name: string;
  description?: string;
  manufacturer?: string;
  model?: string;
  serialNumber?: string;
  firmwareVersion?: string;
  hardwareVersion?: string;
  ipAddress?: string;
  macAddress?: string;
  port?: number;
  protocol: DeviceProtocol;
  capabilities?: DeviceCapability[];
  parentDeviceId?: string;
  controllerDeviceId?: string;
  digitalTwinObjectId?: string;
  credentialRefId?: string;
  pollingIntervalSeconds?: number;
  metadata?: Record<string, any>;
}

export interface UpdateSecurityDeviceRequest {
  name?: string;
  description?: string;
  ipAddress?: string;
  port?: number;
  status?: DeviceStatus;
  capabilities?: DeviceCapability[];
  digitalTwinObjectId?: string;
  pollingIntervalSeconds?: number;
  metadata?: Record<string, any>;
}

export interface BulkEnrollDevicesRequest {
  branchId: string;
  discoveredDeviceIds: string[];
  approvedBy: string;
  autoProvision: boolean;
}

export interface ExecuteDeviceCommandRequest {
  command: DeviceCapability;
  parameters?: Record<string, any>;
  requiresApproval?: boolean;
  requiresMFA?: boolean;
  reason?: string;
  timeoutSeconds?: number;
}

export interface GetDeviceEventsRequest {
  deviceIds?: string[];
  eventTypes?: SecurityDeviceEventType[];
  severities?: EventSeverity[];
  categories?: string[];
  startTime?: Date;
  endTime?: Date;
  acknowledged?: boolean;
  processed?: boolean;
  limit?: number;
  offset?: number;
}

export interface GetBranchPostureRequest {
  branchId: string;
  includeRecentEvents?: boolean;
  eventLimit?: number;
}

export interface DeviceCorrelationRequest {
  branchId?: string;
  timeWindowMinutes?: number;
  minConfidence?: number;
  includeEventTypes?: SecurityDeviceEventType[];
}

export interface CreateDeviceIntegrationRequest {
  name: string;
  description?: string;
  integrationType: 'DIRECT' | 'EDGE_GATEWAY' | 'CLOUD_BRIDGE' | 'VENDOR_API';
  adapterName: string;
  protocol: DeviceProtocol;
  connectionConfig: Record<string, any>;
  credentialRefId?: string;
  pollingIntervalSeconds?: number;
  autoReconnect?: boolean;
  maxRetries?: number;
  metadata?: Record<string, any>;
}

// WebSocket real-time event types

export interface SecurityDeviceRealtimeEvent {
  type: 'DEVICE_STATUS_CHANGE'
      | 'DEVICE_ALARM'
      | 'PANIC_BUTTON'
      | 'DOOR_EVENT'
      | 'FIRE_ALARM'
      | 'ATM_ALERT'
      | 'VAULT_ALERT'
      | 'UPS_ALERT'
      | 'CORRELATED_INCIDENT';
  tenantId: string;
  branchId: string;
  deviceId?: string;
  data: any;
  timestamp: Date;
}

export interface DeviceStatusChangeEvent {
  deviceId: string;
  deviceName: string;
  deviceType: SecurityDeviceType;
  branchId: string;
  previousStatus: DeviceStatus;
  newStatus: DeviceStatus;
  health: DeviceHealth;
  timestamp: Date;
}

export interface PanicButtonEvent {
  deviceId: string;
  deviceName: string;
  branchId: string;
  branchName: string;
  location?: string;
  triggeredBy?: string;
  nearbyCameraIds: string[];
  incidentId: string;
  timestamp: Date;
}

export interface DoorAlertEvent {
  deviceId: string;
  doorName: string;
  branchId: string;
  eventType: 'FORCED_OPEN' | 'HELD_OPEN' | 'UNAUTHORIZED_ACCESS';
  credential?: string;
  relatedCameraIds: string[];
  timestamp: Date;
}

export interface FireAlarmEvent {
  deviceId: string;
  sensorName: string;
  branchId: string;
  branchName: string;
  alarmType: 'FIRE' | 'SMOKE' | 'HEAT' | 'GAS' | 'CO';
  zone?: string;
  severity: EventSeverity;
  relatedCameraIds: string[];
  evacuationRequired: boolean;
  incidentId: string;
  timestamp: Date;
}

export interface CorrelatedIncidentEvent {
  incidentId: string;
  branchId: string;
  branchName: string;
  incidentType: string;
  severity: EventSeverity;
  title: string;
  description: string;
  confidence: number;
  involvedDeviceCount: number;
  deviceIds: string[];
  primaryCameraIds: string[];
  aiSummary?: string;
  actionRequired: boolean;
  timestamp: Date;
}
