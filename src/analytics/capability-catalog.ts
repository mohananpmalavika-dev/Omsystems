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
    c("helmet", "Helmet detection"), c("no-helmet", "No helmet", "open-model", "P2"),
    c("no-safety-vest", "No safety vest", "open-model", "P2"), c("no-gloves", "No gloves", "open-model", "P2"),
    c("no-shoes", "No safety shoes", "open-model", "P2"), c("fire-extinguisher-missing", "Fire extinguisher missing", "open-model", "P1"),
    c("fire-exit-blocked", "Fire exit blocked", "open-model", "P1"), c("spill", "Spill detection", "open-model", "P2"),
    c("gas-leak-visual", "Camera-assisted gas leak", "open-model", "P1"), c("arc-flash", "Arc flash", "open-model", "P1"),
    c("explosion", "Explosion detection", "open-model", "P1"), c("fall", "Fall detection", "open-model", "P1"),
  ]},
  { id: "security", name: "Security analytics", description: "Perimeter, objects, access, and camera integrity", capabilities: [
    c("intrusion", "Intrusion", "derived", "P1"), c("tailgating", "Tailgating", "derived", "P2"),
    c("loitering", "Loitering", "derived", "P2"), c("line-crossing", "Line crossing", "derived", "P2"),
    c("fence-climbing", "Fence climbing", "open-model", "P1"), c("object-removal", "Object removal", "derived", "P2"),
    c("object-left-behind", "Object left behind", "derived", "P2"), c("camera-tampering", "Camera tampering", "core", "P1"),
    c("camera-covered", "Camera covered", "core", "P1"), c("camera-defocused", "Camera defocused", "core", "P2"),
    c("camera-moved", "Camera moved", "core", "P2"), c("camera-vibration", "Camera vibration", "core"),
    c("video-loss", "Video loss", "core", "P1"), c("scene-change", "Scene change", "core", "P2"),
    c("forced-door-open", "Forced door open", "derived", "P1"), c("restricted-area-violation", "Restricted area violation", "derived", "P1"),
  ]},
  { id: "retail", name: "Retail analytics", description: "Footfall, service, shelf, and customer flow", capabilities: [
    c("customer-counting", "Customer counting", "derived"), c("footfall", "Footfall", "derived"),
    c("queue-length", "Queue length", "derived"), c("queue-wait-time", "Queue waiting time", "derived"),
    c("heatmap", "Heat maps", "derived"), c("shelf-monitoring", "Shelf monitoring"), c("product-pickup", "Product pickup"),
    c("product-return", "Product return"), c("checkout-analytics", "Checkout analytics", "derived"),
    c("customer-flow", "Customer flow", "derived"), c("conversion-analytics", "Conversion analytics", "derived"),
  ]},
  { id: "banking", name: "Banking analytics", description: "Branch, ATM, vault, and dual-control scenarios", capabilities: [
    c("cash-counter-monitoring", "Cash counter monitoring", "derived", "P2"), c("teller-presence", "Teller presence", "derived"),
    c("vault-door-monitoring", "Vault door monitoring", "open-model", "P1"), c("atm-queue", "ATM queue", "derived"),
    c("atm-tampering", "ATM tampering", "open-model", "P1"), c("atm-skimming", "ATM skimming detection", "open-model", "P1"),
    c("cash-van-arrival", "Cash van arrival"), c("strong-room-entry", "Strong room entry", "derived", "P1"),
    c("cash-tray-left-open", "Cash tray left open", "open-model", "P1"), c("dual-control-verification", "Dual control verification", "derived", "P1"),
  ]},
  { id: "industrial", name: "Industrial analytics", description: "Machines, material handling, hazards, and worker safety", capabilities: [
    c("forklift", "Forklift detection"), c("crane", "Crane detection"), c("machine-running", "Machine running", "derived"),
    c("machine-idle", "Machine idle", "derived"), c("conveyor-blockage", "Conveyor blockage", "open-model", "P2"),
    c("restricted-machinery-zone", "Restricted machinery zone", "derived", "P1"), c("worker-near-hazard", "Worker near hazard", "derived", "P1"),
    c("fall-from-height", "Fall from height", "open-model", "P1"), c("smoke-near-machine", "Smoke near machine", "derived", "P1"),
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
];

export const AI_CAPABILITIES = AI_CAPABILITY_DOMAINS.flatMap((domain) =>
  domain.capabilities.map((capability) => ({ ...capability, domainId: domain.id, domainName: domain.name })),
);

const capabilityIds = new Set(AI_CAPABILITIES.map((capability) => capability.id));
export function isAiCapability(value: string): boolean { return capabilityIds.has(value); }

