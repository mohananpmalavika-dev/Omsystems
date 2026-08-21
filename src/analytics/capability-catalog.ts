export type AiCapabilityStage = "core" | "open-model" | "derived";

export interface AiCapability {
  id: string;
  name: string;
  stage: AiCapabilityStage;
  defaultSeverity: "P1" | "P2" | "P3" | "P4" | "P5";
  description: string;
}

export interface AiCapabilityDomain {
  id: string;
  name: string;
  description: string;
  capabilities: AiCapability[];
}

const c = (
  id: string,
  name: string,
  stage: AiCapabilityStage = "open-model",
  defaultSeverity: AiCapability["defaultSeverity"] = "P3",
  description = name,
): AiCapability => ({ id, name, stage, defaultSeverity, description });

export const AI_CAPABILITY_DOMAINS: AiCapabilityDomain[] = [
  { id: "human", name: "Human analytics", description: "People, behaviour, identity continuity, and PPE", capabilities: [
    c("person", "Person detection", "core"), c("person-tracking", "Cross-frame person tracking", "derived"),
    c("person-reidentification", "Cross-camera person re-identification"), c("person-counting", "Person counting", "derived"),
    c("occupancy-counting", "Occupancy counting", "derived"), c("dwell-time", "Dwell time", "derived"),
    c("crowd-density", "Crowd density", "derived"),
    c("running", "Running detection", "derived"), c("fighting", "Fighting detection", "open-model", "P2"),
    c("abnormal-behaviour", "Abnormal behaviour", "open-model", "P2"), c("sleeping-person", "Sleeping person"),
    c("sitting-person", "Sitting person"), c("crawling-person", "Crawling person", "open-model", "P2"),
    c("hands-raised", "Hands raised"), c("weapon", "Weapon detection", "open-model", "P1"),
    c("ppe-compliance", "PPE compliance", "open-model", "P2"),
  ]},
  { id: "vehicle", name: "Vehicle analytics", description: "Traffic, parking, classification, and vehicle identity", capabilities: [
    c("vehicle", "Vehicle detection", "core"), c("anpr", "ANPR"), c("vehicle-classification", "Vehicle classification"),
    c("vehicle-counting", "Vehicle counting", "derived"), c("speed-estimation", "Speed estimation", "derived"),
    c("wrong-way", "Wrong-way detection", "derived", "P2"), c("illegal-parking", "Illegal parking", "derived", "P2"),
    c("parking-occupancy", "Parking occupancy", "derived"), c("parking-duration", "Parking duration", "derived"),
    c("vehicle-reidentification", "Vehicle re-identification"), c("motorcycle", "Motorcycle detection"),
    c("bicycle", "Bicycle detection"), c("bus", "Bus detection"), c("truck", "Truck detection"),
    c("vehicle-colour", "Vehicle colour recognition"), c("vehicle-make", "Vehicle make recognition"),
    c("vehicle-model", "Vehicle model recognition"),
  ]},
  { id: "face", name: "Face analytics", description: "Consent-aware face attributes and watchlists", capabilities: [
    c("face", "Face detection"), c("face-recognition", "Face recognition"), c("unknown-person", "Unknown person detection"),
    c("watchlist-match", "Watchlist matching", "open-model", "P1"), c("vip-detection", "VIP detection"),
    c("blacklist-detection", "Blacklist detection", "open-model", "P1"), c("mask-detection", "Mask detection"),
    c("beard-detection", "Beard detection"), c("glasses-detection", "Glasses detection"),
    c("age-estimation", "Age estimation"), c("gender-estimation", "Gender estimation"), c("emotion-recognition", "Emotion recognition"),
  ]},
  { id: "safety", name: "Fire & safety", description: "Immediate life-safety and PPE conditions", capabilities: [
    c("fire", "Fire detection", "open-model", "P1"), c("smoke", "Smoke detection", "open-model", "P1"),
    c("fire-smoke", "Combined fire / smoke detection", "open-model", "P1"),
    c("helmet", "Helmet detection"), c("no-helmet", "No helmet", "open-model", "P2"),
    c("no-safety-vest", "No safety vest", "open-model", "P2"), c("no-gloves", "No gloves", "open-model", "P2"),
    c("no-shoes", "No safety shoes", "open-model", "P2"), c("fire-extinguisher-missing", "Fire extinguisher missing", "open-model", "P1"),
    c("fire-exit-blocked", "Fire exit blocked", "open-model", "P1"), c("spill", "Spill detection", "open-model", "P2"),
    c("gas-leak-visual", "Camera-assisted gas leak", "open-model", "P1"), c("arc-flash", "Arc flash", "open-model", "P1"),
    c("explosion", "Explosion detection", "open-model", "P1"), c("fall", "Fall detection", "open-model", "P1"),
  ]},
  { id: "security", name: "Security analytics", description: "Perimeter, objects, access, and camera integrity", capabilities: [
    c("intrusion", "Intrusion", "derived", "P1"), c("tailgating", "Tailgating", "derived", "P2"),
    c("motion", "Motion detection", "core"), c("object", "Generic object detection", "open-model"),
    c("loitering", "Loitering", "derived", "P2"), c("line-crossing", "Line crossing", "derived", "P2"),
    c("fence-climbing", "Fence climbing", "open-model", "P1"), c("object-removal", "Object removal", "derived", "P2"),
    c("object-left-behind", "Object left behind", "derived", "P2"), c("camera-tampering", "Camera tampering", "core", "P1"),
    c("camera-covered", "Camera covered", "core", "P1"), c("camera-defocused", "Camera defocused", "core", "P2"),
    c("camera-moved", "Camera moved", "core", "P2"), c("camera-vibration", "Camera vibration", "core"),
    c("video-loss", "Video loss", "core", "P1"), c("scene-change", "Scene change", "core", "P2"),
    c("forced-door-open", "Forced door open", "derived", "P1"), c("restricted-area-violation", "Restricted area violation", "derived", "P1"),
  ]},
  { id: "retail", name: "Retail analytics", description: "Footfall, service, shelf, and customer flow", capabilities: [
    c("shoplifting", "Shoplifting detection", "open-model", "P2"),
    c("customer-counting", "Customer counting", "derived"), c("footfall", "Footfall", "derived"),
    c("queue-length", "Queue length", "derived"), c("queue-wait-time", "Queue waiting time", "derived"),
    c("queue", "Queue analysis", "derived"),
    c("heatmap", "Heat maps", "derived"), c("shelf-monitoring", "Shelf monitoring"), c("product-pickup", "Product pickup"),
    c("product-return", "Product return"), c("checkout-analytics", "Checkout analytics", "derived"),
    c("customer-flow", "Customer flow", "derived"), c("conversion-analytics", "Conversion analytics", "derived"),
  ]},
  { id: "banking", name: "Banking analytics", description: "Branch, ATM, vault, and dual-control scenarios", capabilities: [
    c("person-in-vault-after-hours", "Person in vault after hours", "derived", "P1"),
    c("cash-counter-monitoring", "Cash counter monitoring", "derived", "P2"), c("teller-presence", "Teller presence", "derived"),
    c("vault-door-monitoring", "Vault door monitoring", "open-model", "P1"), c("atm-queue", "ATM queue", "derived"),
    c("atm-tampering", "ATM tampering", "open-model", "P1"), c("atm-skimming", "ATM skimming detection", "open-model", "P1"),
    c("cash-van-arrival", "Cash van arrival"), c("strong-room-entry", "Strong room entry", "derived", "P1"),
    c("cash-tray-left-open", "Cash tray left open", "open-model", "P1"), c("dual-control-verification", "Dual control verification", "derived", "P1"),
  ]},
  
  /**
   * Industrial Analytics v2.0 - Architectural Overview
   * 
   * The industrial analytics capabilities now use a layered architecture:
   * 
   * 1. Detection Layer (open-model):
   *    - Equipment detection via ONNX Runtime (YOLOv8-based)
   *    - Model path: INDUSTRIAL_EQUIPMENT_MODEL_PATH
   *    - Classes: forklift, crane, excavator, conveyor, AGV, etc.
   *    - NO simulated detection - real inference or capability reports unavailable
   * 
   * 2. Tracking Layer (derived):
   *    - IoU-based multi-object tracking with Kalman filtering
   *    - Maintains equipment identity across frames
   *    - Velocity estimation, trajectory, zone tracking
   *    - Movement state: moving, stationary, unknown
   * 
   * 3. Analytics Layer (derived):
   *    - Rule-based safety evaluation (IndustrialRuleEngine)
   *    - Proximity detection (worker-equipment distance)
   *    - Zone violations (equipment/person in restricted areas)
   *    - Idle detection (equipment stationary beyond threshold)
   *    - Temporal confirmation (reduces false positives)
   * 
   * Capability Status:
   * - Available: Model deployed, tracker active, rules registered
   * - Degraded: Person detector unavailable (proximity limited)
   * - Unavailable: Equipment model not deployed
   * 
   * Health monitoring runs every 60s and reports exact dependency status.
   */
  { id: "industrial", name: "Industrial analytics", description: "Equipment detection, tracking, safety zones, and worker proximity (v2.0 - Real Detection)", capabilities: [
    // Equipment detection (now using real ONNX models, not simulated)
    c("forklift", "Forklift detection", "open-model"), 
    c("pallet-jack", "Pallet jack detection", "open-model"),
    c("reach-truck", "Reach truck detection", "open-model"),
    c("crane", "Crane detection", "open-model"), 
    c("overhead-crane", "Overhead crane detection", "open-model"),
    c("excavator", "Excavator detection", "open-model"),
    c("bulldozer", "Bulldozer detection", "open-model"),
    c("loader", "Loader detection", "open-model"),
    c("conveyor-belt", "Conveyor belt detection", "open-model"),
    c("cnc-machine", "CNC machine detection", "open-model"),
    c("agv", "AGV detection", "open-model"),
    c("robot-arm", "Robot arm detection", "open-model"),
    
    // Equipment tracking and state (derived from detections + tracker)
    c("equipment-tracking", "Equipment tracking", "derived"),
    c("equipment-velocity", "Equipment velocity estimation", "derived"),
    c("equipment-trajectory", "Equipment trajectory", "derived"),
    c("machine-running", "Machine running state", "derived"),
    c("machine-idle", "Machine idle state", "derived"),
    c("machine-stationary", "Machine stationary detection", "derived"),
    
    // Safety analytics (derived from rules engine)
    c("unsafe-proximity", "Unsafe worker-equipment proximity", "derived", "P1"),
    c("equipment-restricted-zone", "Equipment in restricted zone", "derived", "P1"), 
    c("person-equipment-zone", "Person in equipment-only zone", "derived", "P1"),
    c("equipment-idle-too-long", "Equipment idle too long", "derived", "P2"),
    c("restricted-machinery-zone", "Restricted machinery zone violation", "derived", "P1"), 
    c("worker-near-hazard", "Worker near hazard", "derived", "P1"),
    c("equipment-pedestrian-zone", "Equipment in pedestrian zone", "derived", "P1"),
    
    // Other safety features (open-model)
    c("conveyor-blockage", "Conveyor blockage", "open-model", "P2"),
    c("fall-from-height", "Fall from height", "open-model", "P1"), 
    c("smoke-near-machine", "Smoke near machine", "derived", "P1"),
  ]},
  { id: "smart-city", name: "Smart city analytics", description: "Road, pedestrian, crowd, and environmental events", capabilities: [
    c("traffic-counting", "Traffic counting", "derived"), c("congestion", "Congestion detection", "derived"),
    c("illegal-u-turn", "Illegal U-turn", "derived", "P2"), c("accident", "Accident detection", "open-model", "P1"),
    c("pedestrian-crossing", "Pedestrian crossing", "derived"), c("crowd-gathering", "Crowd gathering", "derived", "P2"),
    c("road-blockage", "Road blockage", "open-model", "P2"), c("garbage-dumping", "Garbage dumping", "open-model", "P2"),
    c("water-logging", "Water logging", "open-model", "P2"),
  ]},
  { id: "camera-health", name: "AI camera health", description: "Visual quality, stream quality, and sensor diagnostics", capabilities: [
    c("dirty-lens", "Dirty lens", "core"), c("blur", "Blur detection", "core"), c("over-exposure", "Over exposure", "core"),
    c("under-exposure", "Under exposure", "core"), c("night-vision-failure", "Night vision failure", "core", "P2"),
    c("rain-on-lens", "Rain on lens", "core"), c("fog", "Fog detection", "core"), c("spider-web", "Spider web detection"),
    c("camera-tilt", "Camera tilt", "core", "P2"), c("camera-blocked", "Camera blocked", "core", "P1"),
    c("low-fps", "Low FPS", "core", "P2"), c("bitrate-drop", "Bitrate drop", "core", "P2"),
    c("frozen-video", "Frozen video", "core", "P1"), c("colour-shift", "Colour shift", "core"), c("sensor-failure", "Sensor failure", "core", "P1"),
  ]},
  { id: "search", name: "AI search", description: "Attribute and natural-language search over indexed detections", capabilities: [
    c("attribute-search", "Attribute search", "derived"), c("natural-language-video-search", "Natural-language video search", "derived"),
  ]},
  { id: "investigation", name: "AI investigation", description: "Cross-camera timelines, routes, and last-seen evidence", capabilities: [
    c("cross-camera-timeline", "Cross-camera timeline", "derived"), c("route-reconstruction", "Route reconstruction", "derived"),
    c("last-seen", "Last-seen investigation", "derived"), c("object-origin", "Object origin investigation", "derived"),
  ]},
  { id: "prediction", name: "AI prediction", description: "Failure, capacity, interruption, and branch-risk forecasts", capabilities: [
    c("camera-failure-prediction", "Camera failure prediction", "derived", "P2"), c("hdd-failure-prediction", "HDD failure prediction", "derived", "P1"),
    c("switch-failure-prediction", "Switch failure prediction", "derived", "P1"), c("network-congestion-prediction", "Network congestion prediction", "derived"),
    c("storage-exhaustion-prediction", "Storage exhaustion prediction", "derived", "P1"), c("recording-interruption-prediction", "Recording interruption prediction", "derived", "P1"),
    c("branch-risk-score", "Branch risk score", "derived"), c("incident-probability", "Incident probability", "derived"),
  ]},
  { id: "reporting", name: "AI reporting", description: "Scheduled operational, compliance, and executive summaries", capabilities: [
    c("daily-incident-summary", "Daily incident summary", "derived"), c("weekly-ai-summary", "Weekly AI summary", "derived"),
    c("monthly-compliance-report", "Monthly compliance report", "derived"), c("executive-dashboard", "Executive dashboard", "derived"),
    c("top-incident-locations", "Top incident locations", "derived"), c("heatmap-report", "Heat-map reports", "derived"),
    c("vehicle-statistics", "Vehicle statistics", "derived"), c("visitor-statistics", "Visitor statistics", "derived"),
  ]},
  { id: "assistant", name: "AI assistant", description: "Private natural-language operations queries without a paid LLM dependency", capabilities: [
    c("operations-query", "Operations query", "derived"), c("alert-query", "Alert query", "derived"),
    c("branch-comparison", "Branch comparison", "derived"), c("visual-attribute-query", "Visual attribute query", "derived"),
  ]},
  
  /**
   * Security Device Analytics - Unified Physical Security
   * 
   * Comprehensive physical security device integration and event correlation.
   * Transforms security device infrastructure into an intelligent, automated response system.
   * 
   * Architecture:
   * - Multi-protocol device adapters (ONVIF, SNMP, REST, MQTT)
   * - Real-time event correlation engine
   * - Automated incident creation with evidence attachment
   * - Emergency response workflows (panic button, fire, intrusion)
   * - Branch security posture calculation
   * - Device health monitoring and predictive maintenance
   * 
   * Device Categories:
   * - CCTV: Cameras, NVRs, DVRs (ONVIF/RTSP)
   * - Access Control: Controllers, doors, readers (REST/MQTT)
   * - Intrusion: Panels, sensors, glass break (SNMP/REST)
   * - Fire Safety: Panels, detectors, suppressors (REST)
   * - Banking: ATMs, vaults, cash counters (REST)
   * - Power: UPS, generators (SNMP)
   * - Network: Switches, routers (SNMP)
   * 
   * Correlation Capabilities:
   * - Multi-device event fusion to single high-confidence incidents
   * - Time-windowed event buffering with configurable thresholds
   * - Automatic camera attachment for visual evidence
   * - AI-generated incident summaries and recommended actions
   * - Event suppression to prevent alert fatigue
   * 
   * Emergency Response:
   * - Panic button: Instant P1, auto-attach cameras, multi-channel notifications
   * - Fire/smoke: Evacuation protocols, zone identification
   * - Vault access: Unauthorized access detection with audit trail
   * - Forced entry: Perimeter breach with response coordination
   * 
   * Status: Core infrastructure complete, adapters deployed
   */
  { id: "security-devices", name: "Security device analytics", description: "Unified physical security device management, event correlation, and emergency response", capabilities: [
    // Core device management
    c("security-device-management", "Security device management", "core"),
    c("security-device-health", "Security device health monitoring", "derived", "P2"),
    c("security-device-discovery", "Network device discovery", "derived"),
    c("security-device-enrollment", "Device enrollment and provisioning", "derived"),
    
    // Device protocols and adapters
    c("onvif-integration", "ONVIF camera integration", "core"),
    c("snmp-integration", "SNMP device integration", "core"),
    c("rest-api-integration", "REST API device integration", "core"),
    c("mqtt-integration", "MQTT IoT device integration", "core"),
    
    // Panic button and emergency
    c("panic-button-detection", "Panic button detection", "core", "P1"),
    c("panic-emergency-response", "Panic emergency response workflow", "derived", "P1"),
    c("duress-button", "Duress button detection", "core", "P1"),
    c("emergency-button", "Emergency button detection", "core", "P1"),
    c("emergency-camera-attachment", "Emergency camera auto-attachment", "derived", "P1"),
    
    // Access control and doors
    c("door-forced-open", "Door forced open detection", "core", "P1"),
    c("door-propped-open", "Door propped open detection", "core", "P2"),
    c("access-denied", "Access denied event", "core"),
    c("unauthorized-access", "Unauthorized access detection", "derived", "P1"),
    c("tailgating-access", "Tailgating detection (access)", "derived", "P2"),
    
    // Vault and banking security
    c("vault-door-opened", "Vault door opened", "core", "P1"),
    c("vault-forced-open", "Vault forced open", "core", "P1"),
    c("vault-unauthorized-access", "Vault unauthorized access", "derived", "P1"),
    c("vault-after-hours", "Vault access after hours", "derived", "P1"),
    c("vault-event-correlation", "Vault event correlation", "derived", "P1"),
    
    // ATM security
    c("atm-cabinet-opened", "ATM cabinet opened", "core", "P1"),
    c("atm-tamper-detection", "ATM tamper detection", "core", "P1"),
    c("atm-vandalism", "ATM vandalism detection", "open-model", "P1"),
    c("atm-event-correlation", "ATM event correlation", "derived", "P1"),
    
    // Fire and safety devices
    c("fire-alarm-triggered", "Fire alarm triggered", "core", "P1"),
    c("smoke-detection-device", "Smoke detector activation", "core", "P1"),
    c("heat-detection-device", "Heat detector activation", "core", "P1"),
    c("fire-suppression-activated", "Fire suppression activated", "core", "P1"),
    c("fire-event-correlation", "Fire event correlation", "derived", "P1"),
    
    // Intrusion detection
    c("intrusion-panel-alarm", "Intrusion panel alarm", "core", "P1"),
    c("motion-sensor-triggered", "Motion sensor triggered", "core", "P2"),
    c("glass-break-sensor", "Glass break sensor", "core", "P1"),
    c("perimeter-breach", "Perimeter breach detection", "derived", "P1"),
    c("forced-entry-correlation", "Forced entry correlation", "derived", "P1"),
    
    // Power and infrastructure
    c("ups-on-battery", "UPS on battery", "core", "P2"),
    c("ups-low-battery", "UPS low battery", "core", "P1"),
    c("ups-critical-battery", "UPS critical battery", "core", "P1"),
    c("power-failure-detected", "Power failure detected", "core", "P1"),
    c("power-failure-cascade", "Power failure cascade detection", "derived", "P1"),
    c("generator-activated", "Generator activated", "core"),
    
    // Environmental monitoring
    c("temperature-high", "Temperature high", "core", "P2"),
    c("temperature-critical", "Temperature critical", "core", "P1"),
    c("water-leak-detected", "Water leak detected", "core", "P1"),
    c("flood-detected", "Flood detected", "core", "P1"),
    c("humidity-high", "Humidity high", "core", "P2"),
    c("gas-leak-detected", "Gas leak detected", "core", "P1"),
    c("environmental-threat-correlation", "Environmental threat correlation", "derived", "P1"),
    
    // Event correlation and intelligence
    c("multi-device-correlation", "Multi-device event correlation", "derived"),
    c("security-incident-fusion", "Security incident fusion", "derived", "P1"),
    c("false-positive-suppression", "False positive suppression", "derived"),
    c("confidence-scoring", "Correlation confidence scoring", "derived"),
    c("evidence-attachment", "Automatic evidence attachment", "derived"),
    c("incident-timeline-reconstruction", "Incident timeline reconstruction", "derived"),
    
    // Branch security posture
    c("branch-security-score", "Branch security posture score", "derived"),
    c("device-category-health", "Device category health", "derived"),
    c("security-risk-assessment", "Security risk assessment", "derived"),
    c("compliance-monitoring", "Security compliance monitoring", "derived"),
    
    // Device commands and control
    c("device-remote-control", "Device remote control", "core"),
    c("device-command-rbac", "Device command RBAC", "core"),
    c("device-command-mfa", "Device command MFA", "core"),
    c("device-command-approval", "Device command approval workflow", "derived"),
    c("device-command-audit", "Device command audit logging", "core"),
    
    // Real-time monitoring
    c("device-status-realtime", "Real-time device status", "core"),
    c("device-alarm-notification", "Device alarm notification", "core", "P1"),
    c("websocket-device-events", "WebSocket device events", "core"),
    c("soc-escalation", "SOC escalation workflow", "derived", "P1"),
    
    // Predictive and analytics
    c("device-failure-prediction", "Security device failure prediction", "derived", "P2"),
    c("pattern-anomaly-detection", "Security pattern anomaly detection", "derived", "P2"),
    c("incident-probability-forecast", "Incident probability forecast", "derived"),
  ]},
];


export const AI_CAPABILITIES = AI_CAPABILITY_DOMAINS.flatMap((domain) =>
  domain.capabilities.map((capability) => ({ ...capability, domainId: domain.id, domainName: domain.name })),
);

const capabilityIds = new Set(AI_CAPABILITIES.map((capability) => capability.id));
export function isAiCapability(value: string): boolean { return capabilityIds.has(value); }
