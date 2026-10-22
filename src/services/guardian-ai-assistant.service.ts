/**
 * KryptonAI Assistant Service
 * 
 * JARVIS-like AI assistant for security operations with:
 * - Natural language commands
 * - Proactive suggestions
 * - Context-aware responses
 * - Function calling for system control
 * - Voice interaction
 */

import { z } from "zod";
import type { Pool } from "pg";
import { activeCamera } from "../database/active-resource.js";
import { CCTV_VMS_PRIMER, cctvKnowledgeAnswer } from "./guardian-cctv-knowledge.js";
import { detectLanguage, getLocalizedGuide } from "./guardian-feature-guides.js";
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

function getEnv(name: string): string {
  if (process.env[name]) return process.env[name]!;
  try {
    const envPath = resolve(process.cwd(), ".env");
    if (existsSync(envPath)) {
      const content = readFileSync(envPath, "utf-8");
      for (const line of content.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const [k, ...rest] = trimmed.split("=");
        if (k && k.trim() === name) {
          return rest.join("=").trim().replace(/^["']|["']$/g, "");
        }
      }
    }
  } catch {
    // ignore
  }
  return "";
}

// Function definitions for GPT-4 / Groq function calling
const GUARDIAN_FUNCTIONS = [
  {
    name: "show_camera_feed",
    description: "Display live feed from specific cameras",
    parameters: {
      type: "object",
      properties: {
        cameraIds: {
          type: "array",
          items: { type: "string" },
          description: "Array of camera IDs to display",
        },
        layout: {
          type: ["string", "null"],
          enum: ["single", "grid", "mosaic", null],
          description: "Display layout for multiple cameras",
        },
      },
      required: ["cameraIds"],
    },
  },
  {
    name: "control_live_wall",
    description: "Control, filter, layout, and switch the Sentinel Live Camera Wall based on natural language criteria (e.g., 'Show all entrance cameras with active movement', 'Switch to Warehouse Zone B', 'Show cameras that triggered unauthorized access in the last 15 minutes', 'Switch to 1+5 / 3x3 layout')",
    parameters: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description: "Filter criteria or target area/zone description",
        },
        cameraIds: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Explicit camera IDs if identified",
        },
        gridSize: {
          type: ["string", "null"],
          enum: ["1x1", "2x2", "3x3", "4x4", "5x5", "6x6", "1+5", "1+7", "2+8", null],
          description: "Target layout grid size if specified",
        },
        filterType: {
          type: ["string", "null"],
          enum: ["location", "motion", "alert", "preset", "all", null],
          description: "Type of filtering to apply to the live wall",
        },
        timeWindowMinutes: {
          type: ["number", "null"],
          description: "Time window in minutes for recent alert or movement queries",
        },
      },
      required: ["query"],
    },
  },
  {
    name: "lock_doors",
    description: "Lock doors in specified locations",
    parameters: {
      type: "object",
      properties: {
        locations: {
          type: "array",
          items: { type: "string" },
          description: "Locations where doors should be locked (e.g., 'floor 3', 'main entrance')",
        },
        reason: {
          type: ["string", "null"],
          description: "Reason for locking doors",
        },
      },
      required: ["locations"],
    },
  },
  {
    name: "dispatch_guard",
    description: "Dispatch security guard to a location",
    parameters: {
      type: "object",
      properties: {
        location: {
          type: "string",
          description: "Location where guard should be dispatched",
        },
        priority: {
          type: "string",
          enum: ["low", "medium", "high", "critical"],
          description: "Priority level of dispatch",
        },
        reason: {
          type: ["string", "null"],
          description: "Reason for dispatch",
        },
      },
      required: ["location", "priority"],
    },
  },
  {
    name: "get_alert_summary",
    description: "Get summary of recent alerts",
    parameters: {
      type: "object",
      properties: {
        timeRange: {
          type: ["string", "null"],
          enum: ["1h", "4h", "24h", "7d", null],
          description: "Time range for alert summary",
        },
        severity: {
          type: ["string", "null"],
          enum: ["low", "medium", "high", "critical", null],
          description: "Filter by severity level",
        },
      },
    },
  },
  {
    name: "search_person",
    description: "Search for a person across all cameras",
    parameters: {
      type: "object",
      properties: {
        description: {
          type: "string",
          description: "Description of the person (e.g., 'man in red shirt')",
        },
        timeRange: {
          type: ["string", "null"],
          description: "Time range to search (e.g., 'last 2 hours')",
        },
      },
      required: ["description"],
    },
  },
  {
    name: "get_branch_status",
    description: "Get operational status of branches",
    parameters: {
      type: "object",
      properties: {
        branchIds: {
          type: ["array", "null"],
          items: { type: "string" },
          description: "Specific branch IDs, or empty for all branches",
        },
      },
    },
  },
  {
    name: "trigger_alarm",
    description: "Trigger alarm or announcement",
    parameters: {
      type: "object",
      properties: {
        type: {
          type: "string",
          enum: ["siren", "announcement", "silent"],
          description: "Type of alarm to trigger",
        },
        location: {
          type: "string",
          description: "Location where alarm should sound",
        },
        message: {
          type: ["string", "null"],
          description: "Custom message for announcement",
        },
      },
      required: ["type", "location"],
    },
  },
  {
    name: "analyze_incident",
    description: "Analyze a security incident using AI",
    parameters: {
      type: "object",
      properties: {
        incidentId: {
          type: "string",
          description: "ID of the incident to analyze",
        },
        includeContext: {
          type: ["boolean", "null"],
          description: "Include surrounding context (before/after footage)",
        },
      },
      required: ["incidentId"],
    },
  },
  {
    name: "get_camera_locations",
    description: "Get list of camera locations or find cameras near a location",
    parameters: {
      type: "object",
      properties: {
        nearLocation: {
          type: ["string", "null"],
          description: "Find cameras near this location (e.g., 'parking lot', 'entrance')",
        },
        type: {
          type: ["string", "null"],
          enum: ["all", "indoor", "outdoor", "ptz", null],
          description: "Filter by camera type",
        },
      },
    },
  },
  {
    name: "navigate_to_menu",
    description: "Open, navigate to, or display any menu, module, dashboard, or page in the application (e.g., Live Video Wall, Executive MIS Reports, Incident Response, Camera Health, Face Recognition, NBFC Operations, Settings, etc.)",
    parameters: {
      type: "object",
      properties: {
        target: {
          type: "string",
          description: "Name, label, or path of the target menu/page to open (e.g., 'Live Video Wall', 'Executive MIS Reports', 'Face Recognition', 'Camera Health', '/control-room', '/reports/mis', '/incidents')",
        },
      },
      required: ["target"],
    },
  },
];

export interface AppRouteItem {
  label: string;
  href: string;
  category: string;
  keywords: string[];
}

export const APP_ROUTES: AppRouteItem[] = [
  // WORKSPACE
  { label: "NBFC Operations", href: "/nbfc-operations", category: "WORKSPACE", keywords: ["nbfc", "nbfc operations", "gold loan", "vault", "vault operations", "banking", "finance", "loan", "dual custody", "nbfc module"] },
  { label: "My Operations Dashboard", href: "/role-dashboard", category: "WORKSPACE", keywords: ["role", "my operations", "role dashboard", "my dashboard"] },
  { label: "Module Directory", href: "/modules", category: "WORKSPACE", keywords: ["module", "directory", "modules", "app list", "module directory", "all modules"] },
  { label: "Support Center", href: "/support", category: "WORKSPACE", keywords: ["support", "help", "contact", "support center", "helpdesk"] },

  // OPERATIONS
  { label: "Command Center", href: "/", category: "OPERATIONS", keywords: ["command center", "home", "main", "overview", "dashboard", "main dashboard"] },
  { label: "Executive Dashboard", href: "/dashboards", category: "OPERATIONS", keywords: ["executive dashboard", "executive overview", "kpi dashboard"] },
  { label: "Branch Overview", href: "/operations/branches", category: "OPERATIONS", keywords: ["branches", "branch overview", "branch list", "all branches", "branch management"] },
  { label: "Live Video Wall", href: "/control-room", category: "OPERATIONS", keywords: ["video wall", "live video", "live video wall", "control room", "cameras live", "live stream", "video stream", "wall", "live wall", "live cctv", "grid view", "live view", "cctv wall"] },
  { label: "AI Alerts & Incident Hub", href: "/analytics/alerts", category: "OPERATIONS", keywords: ["alerts", "ai alerts", "incident hub", "alert hub", "threats", "alert analytics", "open alerts", "alerts hub"] },
  { label: "Alert Queue", href: "/operations/alerts", category: "OPERATIONS", keywords: ["alert queue", "active alerts", "pending alerts", "queue", "operator queue"] },
  { label: "Incident Response", href: "/incidents", category: "OPERATIONS", keywords: ["incidents", "incident response", "dispatch", "emergency", "incident list", "guard dispatch"] },
  { label: "Security Operations", href: "/security-operations", category: "OPERATIONS", keywords: ["security operations", "soc", "sec ops", "soc command", "soc console"] },
  { label: "Video Processing", href: "/operations/media-pipeline", category: "OPERATIONS", keywords: ["video processing", "media pipeline", "transcoding", "streams", "pipeline"] },
  { label: "High Availability", href: "/operations/ha-failover", category: "OPERATIONS", keywords: ["high availability", "ha", "failover", "redundancy", "cluster"] },
  { label: "Edge Agent Management", href: "/operations/edge-fleet", category: "OPERATIONS", keywords: ["edge agent", "fleet", "gateways", "edge fleet", "install agent", "install edge agent", "agent installer", "edge installer", "edge agent setup"] },
  { label: "Infrastructure Operations", href: "/operations/infrastructure", category: "OPERATIONS", keywords: ["infrastructure", "infra", "topology", "hardware topology"] },
  { label: "Fleet Maintenance Command", href: "/operations/maintenance", category: "OPERATIONS", keywords: ["fleet maintenance", "maintenance command"] },
  { label: "Fleet Observability & SLO", href: "/operations/observability", category: "OPERATIONS", keywords: ["observability", "slo", "metrics", "fleet slo"] },
  { label: "Performance Observability", href: "/performance", category: "OPERATIONS", keywords: ["performance", "latency", "system load", "cpu", "memory"] },

  // DEVICE HEALTH & MAINTENANCE
  { label: "Camera Health", href: "/operations/cameras", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["camera health", "cameras", "camera status", "camera uptime", "all cameras", "camera list", "cctv health", "cameras offline", "camera monitoring"] },
  { label: "Recorder Health", href: "/maintenance/dvr-nvr-monitor", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["recorder", "dvr", "nvr", "recorder health", "dvr status", "nvr status", "recorders"] },
  { label: "Hardware Compatibility Lab", href: "/maintenance/compatibility", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["compatibility", "hardware compatibility", "lab"] },
  { label: "Storage & SATA HDDs", href: "/operations/storage", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["storage", "hdd", "hard disk", "sata", "disk", "smart", "sata hdd", "hdd health", "drive health"] },
  { label: "Recording Health", href: "/operations/recording", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["recording health", "recording status", "recording check"] },
  { label: "Recover Recording Gaps", href: "/operations/recording/recovery", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["recording recovery", "gaps", "missing recording", "recovery"] },
  { label: "Archive Storage", href: "/operations/recording/archive", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["archive", "cold storage", "archive storage"] },
  { label: "Retention Compliance (90d)", href: "/compliance/recording", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["retention compliance", "90 days", "retention", "90d"] },
  { label: "Network & WAN Links", href: "/operations/network", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["network", "wan", "internet", "bandwidth", "connectivity", "internet health"] },
  { label: "Power & UPS Telemetry", href: "/operations/ups", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["ups", "power", "battery", "inverter", "ups telemetry"] },
  { label: "Edge Gateways", href: "/operations/edge-agents", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["edge gateways", "edge agents", "gateways"] },
  { label: "Device Connectivity", href: "/operations/device-connectivity", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["device connectivity", "connectivity status"] },
  { label: "Run Health Checks", href: "/maintenance/health", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["run health checks", "health checks", "system health check"] },
  { label: "Maintenance Alerts", href: "/maintenance/alerts", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["maintenance alerts", "hardware alerts"] },
  { label: "Connection Diagnostics", href: "/diagnostics", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["diagnostics", "ping", "test connection", "network diagnostics"] },
  { label: "Security Device Inventory", href: "/security-devices", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["security devices", "device inventory", "devices", "inventory", "device list", "iot devices"] },
  { label: "Network Device Discovery", href: "/security-devices/discovery", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["network device discovery", "discovery", "discover devices", "radar", "scan network"] },
  { label: "Branch Security Posture", href: "/security-devices/branch-posture", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["branch posture", "security posture", "branch security posture"] },
  { label: "Security Device Integrations", href: "/security-devices/integrations", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["security device integrations", "device integrations", "device workflow"] },
  { label: "Portable Camera Enrollment", href: "/portable-camera/enroll", category: "DEVICE HEALTH & MAINTENANCE", keywords: ["portable camera", "portable camera enrollment", "body cam"] },

  // INVESTIGATE & PLAYBACK
  { label: "AI Smart Video Search", href: "/video-search", category: "INVESTIGATE & PLAYBACK", keywords: ["search", "video search", "ai search", "find person", "smart search", "ai video search", "search footage"] },
  { label: "Multi-Camera Synced Playback", href: "/playback/synced", category: "INVESTIGATE & PLAYBACK", keywords: ["playback", "synced playback", "replay", "video playback", "multi camera playback", "camera playback"] },
  { label: "Audio Stream Monitoring", href: "/video/audio", category: "INVESTIGATE & PLAYBACK", keywords: ["audio", "listen", "microphone", "sound", "audio stream", "audio monitoring"] },
  { label: "Video Timeline Bookmarks", href: "/playback/bookmarks", category: "INVESTIGATE & PLAYBACK", keywords: ["bookmarks", "video bookmarks", "timeline bookmarks"] },
  { label: "Video Recordings Vault", href: "/recordings", category: "INVESTIGATE & PLAYBACK", keywords: ["recordings", "video recordings", "recordings vault", "cctv footage", "recorded videos", "vault footage"] },
  { label: "Evidence & Chain of Custody", href: "/evidence", category: "INVESTIGATE & PLAYBACK", keywords: ["evidence", "custody", "export video", "chain of custody"] },
  { label: "Root-Cause Analysis (RCA)", href: "/operations/rca-analysis", category: "INVESTIGATE & PLAYBACK", keywords: ["rca", "root cause", "root cause analysis", "analysis"] },

  // INTELLIGENCE & AI
  { label: "AI Command Center", href: "/operations/ai-command-center", category: "INTELLIGENCE & AI", keywords: ["ai command center", "ai command", "ai center"] },
  { label: "Predictive Health & Forecasts", href: "/maintenance/predictive", category: "INTELLIGENCE & AI", keywords: ["predictive", "forecast", "predictive health", "failure forecast"] },
  { label: "Video Analytics Hub", href: "/analytics", category: "INTELLIGENCE & AI", keywords: ["video analytics", "analytics", "analytics hub"] },
  { label: "Analytics Performance Dashboard", href: "/analytics/dashboard", category: "INTELLIGENCE & AI", keywords: ["analytics dashboard", "analytics performance"] },
  { label: "AI Rules & Automation", href: "/analytics/rules", category: "INTELLIGENCE & AI", keywords: ["ai rules", "rules", "automation", "alert rules", "line crossing", "line cross", "tripwire", "virtual tripwire", "boundary", "zone designer", "polygon zone", "zone", "tripwire setting", "line cross setting", "line cross evide set cheyyunnath"] },
  { label: "Face Recognition & Watchlists", href: "/analytics/face-recognition", category: "INTELLIGENCE & AI", keywords: ["face", "face recognition", "watchlist", "face id", "blacklist", "whitelist", "vip", "facial", "face recognition open", "faces"] },
  { label: "ANPR & Vehicle Telemetry", href: "/analytics/anpr", category: "INTELLIGENCE & AI", keywords: ["anpr", "vehicle", "license plate", "cars", "number plate", "vehicle telemetry", "anpr tracking"] },
  { label: "Vehicle Analytics", href: "/analytics/vehicles", category: "INTELLIGENCE & AI", keywords: ["vehicles", "vehicle analytics", "parking"] },
  { label: "People Counting & Heatmaps", href: "/analytics/people", category: "INTELLIGENCE & AI", keywords: ["people", "people counting", "heatmap", "footfall", "person counting", "heatmaps"] },
  { label: "Crowd & Counter Queue", href: "/analytics/crowd", category: "INTELLIGENCE & AI", keywords: ["crowd", "queue", "congestion", "waiting", "crowd density", "queue length"] },
  { label: "Multi-Camera Person Re-ID", href: "/analytics/reid", category: "INTELLIGENCE & AI", keywords: ["reid", "person reid", "tracking", "re-identification"] },
  { label: "Access Tailgating & Airlocks", href: "/analytics/tailgating", category: "INTELLIGENCE & AI", keywords: ["tailgating", "airlock", "piggybacking", "access breach"] },
  { label: "Camera Tamper & Defocus", href: "/analytics/camera-tamper", category: "INTELLIGENCE & AI", keywords: ["tamper", "camera tamper", "defocus", "blind", "tampering"] },
  { label: "Camera Obstruction & Dark Frame", href: "/analytics/camera-obstruction", category: "INTELLIGENCE & AI", keywords: ["obstruction", "dark frame", "camera obstruction"] },
  { label: "Worker & Elderly Fall", href: "/analytics/fall", category: "INTELLIGENCE & AI", keywords: ["fall", "fall detection", "worker fall", "elderly fall"] },
  { label: "Abandoned & Unattended Objects", href: "/analytics/abandoned-objects", category: "INTELLIGENCE & AI", keywords: ["abandoned", "unattended", "bag", "unattended object", "bomb threat"] },
  { label: "Banking & Cash Counters", href: "/analytics/banking", category: "INTELLIGENCE & AI", keywords: ["banking counters", "cash counter", "teller camera", "cash area"] },
  { label: "ANPR Logistics Tracking", href: "/analytics/anpr-logistics", category: "INTELLIGENCE & AI", keywords: ["anpr logistics", "logistics tracking", "truck tracking"] },
  { label: "Authorized Counter & Locker Persons", href: "/analytics/banking/authorized-persons", category: "INTELLIGENCE & AI", keywords: ["authorized persons", "locker persons", "counter persons"] },
  { label: "NBFC Watchlist Management", href: "/analytics/nbfc-watchlist", category: "INTELLIGENCE & AI", keywords: ["nbfc watchlist", "gold loan watchlist"] },
  { label: "Branch Performance Comparison", href: "/analytics/branch-comparison", category: "INTELLIGENCE & AI", keywords: ["branch comparison", "branch performance"] },
  { label: "Industrial Safety & PPE", href: "/analytics/industrial", category: "INTELLIGENCE & AI", keywords: ["industrial safety", "ppe", "helmet", "safety vest"] },
  { label: "Digital Twin (Spatial 3D)", href: "/digital-twin", category: "INTELLIGENCE & AI", keywords: ["digital twin", "3d", "spatial", "3d map", "twin", "spatial 3d"] },
  { label: "Infrastructure Twin", href: "/infrastructure-twin", category: "INTELLIGENCE & AI", keywords: ["infrastructure twin", "infra twin"] },
  { label: "Multi-Site Federation", href: "/federation", category: "INTELLIGENCE & AI", keywords: ["federation", "multi site", "cross organization"] },

  // FLEET MAINTENANCE
  { label: "Device Configuration Center", href: "/maintenance/device-configuration", category: "FLEET MAINTENANCE", keywords: ["device configuration", "device config"] },
  { label: "Correlated Device Health", href: "/security/device-health", category: "FLEET MAINTENANCE", keywords: ["device health", "correlated health"] },
  { label: "Camera Location Map", href: "/maintenance/camera-map", category: "FLEET MAINTENANCE", keywords: ["camera map", "location map", "map"] },
  { label: "Hardware Asset Registry", href: "/maintenance/assets", category: "FLEET MAINTENANCE", keywords: ["assets", "asset registry", "hardware assets"] },
  { label: "Asset Replacement & Lineage", href: "/operations/assets", category: "FLEET MAINTENANCE", keywords: ["asset replacement", "lineage"] },
  { label: "Maintenance Work Orders", href: "/maintenance/workorders", category: "FLEET MAINTENANCE", keywords: ["work orders", "maintenance work orders", "tickets"] },
  { label: "Vendor & Service Directory", href: "/maintenance/vendors", category: "FLEET MAINTENANCE", keywords: ["vendors", "service directory", "vendor list"] },
  { label: "AMC & Warranty Contracts", href: "/maintenance/amc", category: "FLEET MAINTENANCE", keywords: ["amc", "warranty", "contracts", "amc contracts"] },
  { label: "Maintenance Reports & SLA", href: "/maintenance/reports", category: "FLEET MAINTENANCE", keywords: ["maintenance reports", "sla reports"] },

  // COMPLIANCE & GOVERNANCE
  { label: "Assurance Hub", href: "/compliance/overview", category: "COMPLIANCE & GOVERNANCE", keywords: ["assurance hub", "compliance overview", "assurance"] },
  { label: "Compliance Frameworks", href: "/compliance", category: "COMPLIANCE & GOVERNANCE", keywords: ["compliance", "frameworks", "compliance frameworks", "rbi compliance"] },
  { label: "Compliance Dashboard", href: "/compliance/dashboard", category: "COMPLIANCE & GOVERNANCE", keywords: ["compliance dashboard"] },
  { label: "Assessments & Audits", href: "/compliance/assessments", category: "COMPLIANCE & GOVERNANCE", keywords: ["assessments", "audits", "compliance assessments"] },
  { label: "Controls & Remediation", href: "/compliance/controls", category: "COMPLIANCE & GOVERNANCE", keywords: ["controls", "remediation", "compliance controls"] },
  { label: "Compliance Risk Register", href: "/compliance/risks", category: "COMPLIANCE & GOVERNANCE", keywords: ["risks", "risk register", "compliance risks"] },
  { label: "Compliance Policies", href: "/compliance/policies", category: "COMPLIANCE & GOVERNANCE", keywords: ["policies", "compliance policies"] },
  { label: "Compliance Evidence", href: "/compliance/evidence", category: "COMPLIANCE & GOVERNANCE", keywords: ["compliance evidence"] },
  { label: "Compliance Findings", href: "/compliance/findings", category: "COMPLIANCE & GOVERNANCE", keywords: ["findings", "compliance findings"] },
  { label: "Compliance Certificates", href: "/compliance/certificates", category: "COMPLIANCE & GOVERNANCE", keywords: ["certificates", "compliance certificates"] },
  { label: "Privacy Governance (DPIA)", href: "/maintenance/privacy", category: "COMPLIANCE & GOVERNANCE", keywords: ["privacy", "dpia", "privacy governance"] },
  { label: "Privacy Processing Purposes", href: "/maintenance/privacy/purposes", category: "COMPLIANCE & GOVERNANCE", keywords: ["privacy purposes", "purposes"] },
  { label: "Privacy Control Policies", href: "/maintenance/privacy/controls", category: "COMPLIANCE & GOVERNANCE", keywords: ["privacy controls", "privacy policies"] },
  { label: "Privacy Breach Incident Log", href: "/maintenance/privacy/breaches", category: "COMPLIANCE & GOVERNANCE", keywords: ["privacy breaches", "breach log"] },
  { label: "Camera Privacy Controls", href: "/maintenance/privacy/cameras", category: "COMPLIANCE & GOVERNANCE", keywords: ["camera privacy"] },

  // AUDIT & REPORTING
  { label: "Executive Dashboard (NEW)", href: "/mis-dashboard", category: "AUDIT & REPORTING", keywords: ["mis dashboard", "executive dashboard new", "mis overview", "executive kpi"] },
  { label: "Financial TCO & ROI", href: "/reports/financial", category: "AUDIT & REPORTING", keywords: ["financial", "financial tco", "roi", "tco", "cost analysis", "roi report"] },
  { label: "Branch Benchmarking", href: "/reports/benchmarking", category: "AUDIT & REPORTING", keywords: ["benchmarking", "branch benchmarking", "benchmark"] },
  { label: "Compliance Scorecard", href: "/reports/compliance", category: "AUDIT & REPORTING", keywords: ["compliance scorecard", "scorecard", "compliance report"] },
  { label: "Executive MIS Reports & Graphs", href: "/reports/mis", category: "AUDIT & REPORTING", keywords: ["mis", "mis reports", "mis report", "executive reports", "graphs", "charts", "management report", "all in one report", "mis graph", "mis chart", "graphic reports", "mis reports open"] },
  { label: "Daily Surveillance Digest", href: "/reports", category: "AUDIT & REPORTING", keywords: ["daily digest", "surveillance digest", "reports", "export report", "daily report", "surveillance report"] },
  { label: "Branch Compliance Audit", href: "/audit/branch-compliance", category: "AUDIT & REPORTING", keywords: ["branch compliance", "compliance audit", "branch audit"] },
  { label: "Camera Health Audit", href: "/audit/health", category: "AUDIT & REPORTING", keywords: ["camera audit", "health audit", "camera compliance"] },
  { label: "Maintenance & SLA Audit", href: "/audit/maintenance", category: "AUDIT & REPORTING", keywords: ["sla audit", "maintenance audit"] },
  { label: "Activity & Access Logs", href: "/activity-report", category: "AUDIT & REPORTING", keywords: ["activity logs", "activity report", "access logs", "audit log", "user activity", "audit trail", "logs", "activity"] },

  // ADMINISTRATION
  { label: "Organization & Locations", href: "/admin/organization?tab=hierarchy", category: "ADMINISTRATION", keywords: ["organization", "hierarchy", "branches organization", "locations", "company tree", "org hierarchy"] },
  { label: "Employees & Location Access", href: "/admin/organization?tab=employees", category: "ADMINISTRATION", keywords: ["employees", "employee access", "staff"] },
  { label: "Roles & Menu Access", href: "/admin/organization?tab=roles", category: "ADMINISTRATION", keywords: ["roles", "role management", "menu access", "permissions"] },
  { label: "Platform Capability Matrix", href: "/admin/platform/capabilities", category: "ADMINISTRATION", keywords: ["capability matrix", "platform capabilities"] },
  { label: "Feature Management", href: "/admin/features", category: "ADMINISTRATION", keywords: ["features", "feature management", "feature flags", "modules toggle"] },
  { label: "Branch Onboarding Wizard", href: "/admin/branch-onboarding", category: "ADMINISTRATION", keywords: ["branch onboarding", "onboarding", "new branch", "onboarding wizard", "add branch"] },
  { label: "Zero-Touch Provisioning (ZTP)", href: "/admin/zero-touch", category: "ADMINISTRATION", keywords: ["zero touch", "ztp", "ztp provisioning"] },
  { label: "ZTP Fleet Diagnostics", href: "/admin/zero-touch/diagnostics", category: "ADMINISTRATION", keywords: ["ztp diagnostics", "fleet diagnostics"] },
  { label: "AI Quality & Model Registry", href: "/admin/ai-quality", category: "ADMINISTRATION", keywords: ["ai quality", "model registry"] },
  { label: "HA Topology & Chaos Lab", href: "/admin/ha-topology", category: "ADMINISTRATION", keywords: ["ha topology", "chaos lab"] },
  { label: "Media Gateway Failover", href: "/admin/media-gateway-failover", category: "ADMINISTRATION", keywords: ["media gateway failover", "gateway failover"] },
  { label: "Storage Failover Console", href: "/admin/storage-failover", category: "ADMINISTRATION", keywords: ["storage failover"] },
  { label: "Recording N+1 Failover", href: "/admin/recording-failover", category: "ADMINISTRATION", keywords: ["recording failover", "n+1 failover"] },
  { label: "Signed Edge Config Bundles", href: "/admin/signed-configuration", category: "ADMINISTRATION", keywords: ["signed config", "edge config bundles"] },
  { label: "Database Manager", href: "/admin/database", category: "ADMINISTRATION", keywords: ["database", "db manager", "database manager"] },
  { label: "Device Registry & ONVIF", href: "/maintenance/device-management", category: "ADMINISTRATION", keywords: ["device registry", "onvif registry"] },
  { label: "Notification Policies", href: "/operations/alert-notification-policy", category: "ADMINISTRATION", keywords: ["notification policies", "notifications", "alert policies"] },
  { label: "Camera Import / Export (Excel)", href: "/admin/camera-import-export", category: "ADMINISTRATION", keywords: ["camera import", "camera export", "excel import"] },
  { label: "Stream Quality Settings", href: "/admin/system", category: "ADMINISTRATION", keywords: ["stream quality", "main stream", "sub stream"] },
  { label: "System Settings", href: "/settings", category: "ADMINISTRATION", keywords: ["settings", "system settings", "preferences", "config", "configuration"] },
  { label: "Users & RBAC", href: "/admin/organization?tab=employees", category: "ADMINISTRATION", keywords: ["users", "rbac", "user management", "accounts", "permissions", "user list"] },
  { label: "Account & Security Settings", href: "/account/security", category: "ADMINISTRATION", keywords: ["account settings", "profile", "change password", "my account", "security settings"] },
  { label: "Mobile Operations View", href: "/mobile", category: "ADMINISTRATION", keywords: ["mobile", "mobile view", "mobile operations"] },
];

/**
 * Strips conversational command prefixes/suffixes in English, Malayalam & Manglish
 */
export function cleanNavQuery(rawQuery: string): string {
  let q = rawQuery.toLowerCase().trim();

  // Strip common navigation prefix/suffix phrases in English, Malayalam & Manglish
  const removePhrases = [
    "after login",
    "ethu menu open aakan paranjalum",
    "open aakan paranjalum",
    "open cheyyan paranjalum",
    "open aakanamennu",
    "open cheyyanamennu",
    "open aaki tharaamo",
    "open aakki tharaamo",
    "open aaki tharu",
    "open aakki tharu",
    "open cheythu tharu",
    "open cheythu tharaamo",
    "open cheyyanam",
    "open cheyyaamo",
    "open cheyyumo",
    "open cheyyuka",
    "open cheyyaan",
    "open cheyyu",
    "open cheyy",
    "open chey",
    "open aakkanam",
    "open aakanam",
    "open aakkamo",
    "open aakamo",
    "open aakkumo",
    "open aakumo",
    "open aakkuka",
    "open aakuka",
    "open aakkan",
    "open aakan",
    "open aakku",
    "open aaku",
    "open aakk",
    "open aak",
    "open",
    "kaanichu tharaamo",
    "kaanichu tharu",
    "kaanich tharaamo",
    "kaanich tharu",
    "kaanikkaamo",
    "kaanikkumo",
    "kaanikkanam",
    "kaanikkuka",
    "kaanikkan",
    "kaanikku",
    "kaanikk",
    "eduthu tharaamo",
    "eduthu tharu",
    "eduth tharaamo",
    "eduth tharu",
    "edukkaamo",
    "edukkumo",
    "edukkanam",
    "edukkuka",
    "edukkan",
    "edukku",
    "edukk",
    "thuranu tharaamo",
    "thuranu tharu",
    "thurannu tharaamo",
    "thurannu tharu",
    "thurakkaamo",
    "thurakkumo",
    "thurakkanam",
    "thurakkuka",
    "thurakkan",
    "thurakku",
    "navigate to",
    "navigate",
    "go to",
    "goto",
    "pokanam",
    "pokaamo",
    "pokumo",
    "pokaan",
    "pokaam",
    "pokuka",
    "poku",
    "show me",
    "show",
    "view",
    "launch",
    "start",
    "load",
    "display",
    "paranjalum",
    "paranjal",
    "ethu menu",
    "ethu page",
    "ethu",
    "evideyaanu",
    "evideyanu",
    "evideya",
    "evidanu",
    "evidya",
    "evide",
    "engane aaanu",
    "engane aanu",
    "enganeyanu",
    "engane",
    "engana",
    "enganeya",
    "set cheyyunnath",
    "set cheyyunath",
    "set cheyyaam",
    "set cheyyan",
    "set cheyyanam",
    "set aakkanam",
    "set aakku",
    "set aakk",
    "set cheyuka",
    "set cheyyuka",
    "work aakunnilla",
    "work aavunnilla",
    "work cheyyunnilla",
    "please",
    "can you",
    "could you",
    "kryptonai",
    "krypton",
    "onnu",
    "enikku",
    "njan",
    "page",
    "menu",
    "screen",
    "module",
    "dashboard",
    "section",
    "window",
  ];

  // Sort phrases by descending length so multi-word phrases match first
  removePhrases.sort((a, b) => b.length - a.length);

  for (const phrase of removePhrases) {
    const regex = new RegExp(`\\b${phrase}\\b`, "gi");
    q = q.replace(regex, " ");
  }

  return q.replace(/\s+/g, " ").trim();
}

export function resolveAppRoute(query: string): AppRouteItem | null {
  if (!query) return null;
  const raw = query.toLowerCase().trim();
  const cleaned = cleanNavQuery(query);

  // 1. Direct href match with raw or cleaned
  let match = APP_ROUTES.find(
    (r) =>
      r.href.toLowerCase() === raw ||
      r.href.toLowerCase() === cleaned ||
      r.href.toLowerCase() === `/${cleaned}` ||
      (cleaned.length >= 3 && r.href.toLowerCase().endsWith(`/${cleaned}`))
  );
  if (match) return match;

  // 2. Exact label match with raw or cleaned
  match = APP_ROUTES.find(
    (r) =>
      r.label.toLowerCase() === raw ||
      r.label.toLowerCase() === cleaned
  );
  if (match) return match;

  // 3. Label contains cleaned, or cleaned contains label
  if (cleaned.length >= 3) {
    match = APP_ROUTES.find(
      (r) =>
        r.label.toLowerCase().includes(cleaned) ||
        cleaned.includes(r.label.toLowerCase())
    );
    if (match) return match;

    // 3b. All words in cleaned query match inside label or keyword
    const words = cleaned.split(" ").filter((w) => w.length >= 3);
    if (words.length >= 2) {
      match = APP_ROUTES.find(
        (r) =>
          words.every((w) => r.label.toLowerCase().includes(w)) ||
          r.keywords.some((k) => words.every((w) => k.includes(w)))
      );
      if (match) return match;
    }
  }

  // 4. Keyword exact match with cleaned
  if (cleaned.length >= 2) {
    match = APP_ROUTES.find((r) =>
      r.keywords.some((k) => k === cleaned)
    );
    if (match) return match;
  }

  // 5. Keyword substring match with cleaned
  if (cleaned.length >= 3) {
    match = APP_ROUTES.find((r) =>
      r.keywords.some((k) => k.length >= 3 && (cleaned.includes(k) || k.includes(cleaned)))
    );
    if (match) return match;
  }

  // 6. Keyword match against raw query as fallback
  match = APP_ROUTES.find((r) =>
    r.keywords.some((k) => raw.includes(k) && k.length >= 3)
  );
  if (match) return match;

  return null;
}

type FeatureGuide = { purpose: string; working: string; steps: string[] };

const FEATURE_GUIDES: Record<string, FeatureGuide> = {
  "/control-room": { purpose: "Monitor live cameras across branches from one workspace.", working: "Choose a branch or camera and the wall displays the available live feeds; operators can inspect an individual feed and its alerts.", steps: ["Open Live branch coverage.", "Select the branch and cameras.", "Choose a layout and inspect the live feeds."] },
  "/analytics/rules": { purpose: "Define detection zones and automate responses to video events.", working: "A camera rule watches a selected line or zone and creates the configured response when its condition is detected.", steps: ["Select a branch and camera.", "Draw a virtual tripwire with two points or a polygon zone with at least three points, then save it.", "Choose the matching condition and alert action, then save the rule."] },
  "/analytics/face-recognition": { purpose: "Review face detections and manage authorized or watched people.", working: "Enrolled face records and watchlists are compared with supported camera detections so operators can review matches and alerts.", steps: ["Open Face Recognition & Watchlists.", "Choose the relevant camera, person, or watchlist.", "Verify any match against the source video before acting."] },
  "/analytics/anpr": { purpose: "Review recognized vehicle plates and related vehicle events.", working: "Supported camera detections extract plate details for searches, logs, and configured alerts.", steps: ["Open ANPR & Vehicle Telemetry.", "Select the camera, branch, or time range.", "Review plate events and verify the image before taking action."] },
  "/video-search": { purpose: "Find relevant recorded video quickly during an investigation.", working: "Search criteria narrow footage and event results; the operator reviews the matching clips.", steps: ["Set the branch, camera, and time window.", "Enter a search description or available filters.", "Open and verify a result before saving evidence."] },
  "/playback/synced": { purpose: "Review footage from multiple cameras at the same time.", working: "Selected camera recordings align on a shared timeline for comparing an event across views.", steps: ["Select the cameras and time range.", "Start synchronized playback.", "Compare views and note the relevant timestamps."] },
  "/recordings": { purpose: "Find and review stored CCTV recordings.", working: "The vault lists available footage by camera and time for playback and investigation.", steps: ["Select a branch, camera, and time range.", "Open the matching recording.", "Check availability and use the evidence workflow if a clip must be preserved."] },
  "/evidence": { purpose: "Preserve investigation material with a traceable chain of custody.", working: "Evidence records keep footage, supporting details, and handling history together.", steps: ["Open the relevant evidence case or create a record.", "Attach the verified clip and details.", "Review custody information before export or handoff."] },
  "/analytics/alerts": { purpose: "Review security detections and triage possible incidents.", working: "Analytics events are listed with severity, camera, and supporting context for operator review.", steps: ["Filter alerts by branch, severity, or time.", "Open an alert and verify its video context.", "Acknowledge, escalate, or resolve it according to the procedure."] },
  "/incidents": { purpose: "Coordinate investigation and response to confirmed events.", working: "Incident records connect alerts, assignees, status, and response notes.", steps: ["Open or select the incident.", "Review evidence and assign the next action.", "Record updates and close only after verification."] },
  "/operations/cameras": { purpose: "Check camera availability and diagnose offline devices.", working: "The page summarizes each camera's current health and connectivity signals.", steps: ["Filter to the affected branch or camera.", "Review its status and recent health details.", "Run an approved check or escalate the fault."] },
  "/operations/edge-fleet": { purpose: "Manage branch edge agents and their deployment status.", working: "Registered agents connect branch cameras and report their health to the platform.", steps: ["Select the branch or agent.", "Review connectivity and installation status.", "Follow the branch gateway activation workflow for a new installation."] },
  "/nbfc-operations": { purpose: "Monitor bank and NBFC branch security workflows.", working: "The workspace brings together cash, vault, camera, and operational risk views for authorized staff.", steps: ["Select the branch and operational area.", "Review relevant events and supporting camera context.", "Record or escalate exceptions under your branch procedure."] },
  "/reports/mis": { purpose: "Review management information and operational trends.", working: "The report page summarizes selected periods and branches into traceable metrics and exports.", steps: ["Choose the date range and branch scope.", "Review metrics and exceptions.", "Export the report if your role permits it."] },
};

const CATEGORY_GUIDES: Record<string, FeatureGuide> = {
  WORKSPACE: { purpose: "Access the tools for this operational task.", working: "The workspace groups the relevant records and controls for your role.", steps: ["Open the workspace.", "Choose the relevant branch or record.", "Review the available information and complete the task."] },
  OPERATIONS: { purpose: "Monitor and respond to operational activity.", working: "The page presents current status and relevant events for operator review.", steps: ["Select the branch or item.", "Review status and supporting details.", "Record or escalate the outcome."] },
  "DEVICE HEALTH & MAINTENANCE": { purpose: "Keep devices and recording services healthy.", working: "The page displays health signals and exceptions for the selected equipment.", steps: ["Filter to the device or branch.", "Inspect the health details.", "Run an approved check or create a work order."] },
  "INVESTIGATE & PLAYBACK": { purpose: "Find and verify footage or evidence.", working: "The page organizes recordings and related events for investigation.", steps: ["Select cameras and a time range.", "Review the matching footage or records.", "Preserve verified findings when needed."] },
  "INTELLIGENCE & AI": { purpose: "Review detections and configure video analytics.", working: "Analytics process supported camera events and show results for operator verification.", steps: ["Choose the branch, camera, or rule.", "Review detections against source video.", "Save an approved rule or record the outcome."] },
  "FLEET MAINTENANCE": { purpose: "Plan and track equipment maintenance.", working: "The page keeps the selected assets, tasks, and status together.", steps: ["Find the asset or work order.", "Review its history and current status.", "Assign and document the next action."] },
  "COMPLIANCE & GOVERNANCE": { purpose: "Manage controls and supporting audit evidence.", working: "The page organizes requirements, findings, and evidence for review.", steps: ["Select the applicable control or assessment.", "Review evidence and gaps.", "Record remediation and ownership."] },
  "AUDIT & REPORTING": { purpose: "Review activity and produce management reports.", working: "The page summarizes selected records and time periods into reports.", steps: ["Set the date range and branch scope.", "Check the figures and exceptions.", "Export if authorized."] },
  ADMINISTRATION: { purpose: "Configure platform settings and access.", working: "Authorized administrators review and save changes for the selected scope.", steps: ["Confirm the organization and target record.", "Review the current configuration and impact.", "Save the approved change."] },
};

export function isExplicitNavigationRequest(query: string): boolean {
  const text = query.toLowerCase().trim();
  return /^(?:please\s+)?(?:open|go to|goto|navigate to|launch|take me to|bring up|open cheyy|open aak|thurakk|poku|pokam|pokanam|edukk|kaanikk|kaanikku)\b/.test(text)
    && !/\b(?:where|why|how|what|purpose|working|explain|evide|engane|enthina|enthaanu|manassila|doubt|link|path|url|cheyyan|aakan)\b/.test(text);
}

export function isFeatureQuestion(query: string): boolean {
  if (/\b(?:how many|how much|count|number of|currently|today|right now)\b|എത്ര/i.test(query)
      && !/\b(?:where|evide|how to|guide)\b|എവിടെ/.test(query)) return false;
  return /\b(?:where|how|what is|what does|why|purpose|working|works|explain|guide|steps|use|configure|setup|find|evide|engane|enthina|enthaanu|entha|evideya|evideyanu|paranju|ariyanam|doubt)\b/i.test(query)
    || /(?:എവിടെ|എങ്ങനെ|എന്താണ്|എന്താ|ഉദ്ദേശം|പ്രവർത്തി|വിശദീകരി|ഉപയോഗ)/.test(query);
}

export function featureGuideResponse(query: string, isGuest = false, previousRoute?: AppRouteItem): GuardianResponse | null {
  const specificFeature = APP_ROUTES.some((route) => route.keywords.some((keyword) => keyword.includes(" ") && keyword.length >= 6 && query.toLowerCase().includes(keyword)));
  const catalogQuestion = /\b(?:all|list|available|ella|full|kya kya|enthokke|enthellam|features?|modules?|pages?)\b.*\b(?:features?|modules?|pages?|und|ella|hai|hain)\b|\b(?:features?|modules?|pages?)\b.*\b(?:available|und|ella|kya|enthaanu)\b/i.test(query)
    || /(?:ഫീച്ചറുകൾ|സവിശേഷതകൾ|फीचर्स|सुविधा)/.test(query);

  if ((!isFeatureQuestion(query) && !(query.trim().endsWith("?") && specificFeature) && !catalogQuestion) || isExplicitNavigationRequest(query)) return null;
  if (/\b(?:who|when|which year|invented|capital of|translate|calculate)\b/i.test(query)) return null;

  if (catalogQuestion) {
    if (isGuest) {
      const lang = detectLanguage(query);
      if (lang === "hi") {
        return {
          message:
            "**KryptonVision के AI और सुरक्षा फीचर्स (AI & Security Features):**\n\nइस प्लेटफ़ॉर्म में 12 प्रमुख एंटरप्राइज़ सुरक्षा क्षमताएं शामिल हैं:",
          messageHi:
            "**KryptonVision के AI और सुरक्षा फीचर्स (AI & Security Features):**\n\nइस प्लेटफ़ॉर्म में 12 प्रमुख एंटरप्राइज़ सुरक्षा क्षमताएं शामिल हैं:",
          messageMl:
            "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**\n\nഈ platform-ൽ ഉള്ള പ്രധാന capabilities:",
          type: "feature_cards",
          cards: KRYPTON_PRODUCT_FEATURES,
          suggestions: ["KryptonVision क्या है?", "कौन से कैमरे समर्थित हैं?", "साइन इन कैसे करें?"],
          suggestionsHi: ["KryptonVision क्या है?", "कौन से कैमरे समर्थित हैं?", "साइन इन कैसे करें?"],
          suggestionsMl: ["KryptonVision എന്താണ്?", "Supported cameras ഏതൊക്കെ?", "Sign in എങ്ങനെ ചെയ്യും?"],
          timestamp: new Date().toISOString(),
        };
      }
      if (lang === "ml") {
        return {
          message:
            "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**\n\nഈ platform-ൽ ഉള്ള പ്രധാന capabilities:",
          messageMl:
            "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**\n\nഈ platform-ൽ ഉള്ള പ്രധാന capabilities:",
          messageHi:
            "**KryptonVision के AI और सुरक्षा फीचर्स:**",
          type: "feature_cards",
          cards: KRYPTON_PRODUCT_FEATURES,
          suggestions: ["What is KryptonVision?", "Which cameras are supported?", "How do I sign in?"],
          suggestionsMl: ["KryptonVision എന്താണ്?", "Supported cameras ഏതൊക്കെ?", "Sign in എങ്ങനെ ചെയ്യും?"],
          suggestionsHi: ["KryptonVision क्या है?", "कौन से कैमरे समर्थित हैं?", "साइन इन कैसे करें?"],
          timestamp: new Date().toISOString(),
        };
      }
      return {
        message:
          "**KryptonVision AI & Security Capabilities:**\n\nHere are the 12 core platform features available across all branches:",
        messageMl:
          "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**",
        messageHi:
          "**KryptonVision के AI और सुरक्षा फीचर्स:**",
        type: "feature_cards",
        cards: KRYPTON_PRODUCT_FEATURES,
        suggestions: ["What is KryptonVision?", "Which cameras are supported?", "How do I sign in?"],
        suggestionsMl: ["KryptonVision എന്താണ്?", "Supported cameras ഏതൊക്കെ?", "Sign in എങ്ങനെ ചെയ്യും?"],
        suggestionsHi: ["KryptonVision क्या है?", "कौन से कैमरे समर्थित हैं?", "साइन इन कैसे करें?"],
        timestamp: new Date().toISOString(),
      };
    }

    const groups = ["WORKSPACE", "OPERATIONS", "INVESTIGATE & PLAYBACK", "INTELLIGENCE & AI", "DEVICE HEALTH & MAINTENANCE", "AUDIT & REPORTING", "ADMINISTRATION"];
    const sections = groups.map((category) => {
      const names = APP_ROUTES.filter((route) => route.category === category).slice(0, 5).map((route) => route.label);
      return names.length ? `- **${category}:** ${names.join(", ")}` : "";
    }).filter(Boolean).join("\n");
    return { message: `KryptonVision modules include:\n${sections}\n\nSee the full [Module Directory](/modules) for every workspace and its link.${isGuest ? " Sign in to open role-restricted pages." : ""}`, type: "text", timestamp: new Date().toISOString() };
  }

  const matchedRoute = resolveAppRoute(query);
  const refersToPrevious = Boolean(previousRoute && /\b(?:this|that|it|athu|athinte|ithu|ee module)\b/i.test(query) && (!matchedRoute || !query.toLowerCase().includes(matchedRoute.label.toLowerCase())));
  const route = refersToPrevious ? previousRoute : matchedRoute;
  if (!route) return null;

  const guide = FEATURE_GUIDES[route.href] ?? CATEGORY_GUIDES[route.category] ?? CATEGORY_GUIDES.WORKSPACE!;
  const lang = detectLanguage(query);
  const path = `${route.category} → ${route.label}`;

  if (lang === "hi") {
    const message = `**${route.label}**\n\n**रास्ता (Path):** ${path}\n**खोलें:** [${route.label}](${route.href})\n**उद्देश्य (Purpose):** ${guide.purpose}\n**कार्यप्रणाली (Working):** ${guide.working}\n**उपयोग कैसे करें (How to use):**\n${guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}${isGuest ? "\n\nइस पृष्ठ को खोलने के लिए साइन इन करें; पहुंच आपकी भूमिका पर निर्भर करती है।" : ""}`;
    return { message, type: "text", timestamp: new Date().toISOString() };
  }

  if (lang === "ml") {
    const message = `**${route.label}**\n\n**Evide:** ${path}\n**Open cheyyan:** [${route.label}](${route.href})\n**Purpose:** ${guide.purpose}\n**Working:** ${guide.working}\n**Engane use cheyyam:**\n${guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}${isGuest ? "\n\nEe page access cheyyan sign in cheyyanam; role permission anusarich access labhikkum." : ""}`;
    return { message, type: "text", timestamp: new Date().toISOString() };
  }

  const message = `**${route.label}**\n\n**Path:** ${path}\n**Open:** [${route.label}](${route.href})\n**Purpose:** ${guide.purpose}\n**How it works:** ${guide.working}\n**How to use it:**\n${guide.steps.map((step, index) => `${index + 1}. ${step}`).join("\n")}${isGuest ? "\n\nSign in to open this page; access depends on your role." : ""}`;
  return { message, type: "text", timestamp: new Date().toISOString() };
}

export interface GuardianMessage {
  role: "system" | "user" | "assistant" | "function" | "tool";
  content: string | null;
  name?: string;
  tool_call_id?: string;
  tool_calls?: Array<{
    id: string;
    type: "function";
    function: {
      name: string;
      arguments: string;
    };
  }>;
  function_call?: {
    name: string;
    arguments: string;
  };
}

export interface GuardianContext {
  userId: string;
  tenantId: string;
  isGuest?: boolean;
  currentBranchId?: string;
  recentAlerts?: any[];
  recentActivity?: any[];
  permissions?: string[];
}

export interface GuardianFeatureCard {
  title: string;
  titleMl: string;
  titleHi?: string;
  icon: string;
  description: string;
  descriptionMl: string;
  descriptionHi?: string;
  tags: string[];
}

export interface GuardianResponse {
  message: string;
  messageMl?: string;
  messageHi?: string;
  type: "text" | "action" | "suggestion" | "warning" | "error" | "feature_cards";
  cards?: GuardianFeatureCard[];
  actions?: Array<{
    function: string;
    parameters: Record<string, any>;
    executed: boolean;
    result?: any;
  }>;
  suggestions?: string[];
  suggestionsMl?: string[];
  suggestionsHi?: string[];
  requiresConfirmation?: boolean;
  timestamp: string;
}

/**
 * KryptonVision / Sentinel Grid — Complete Product Features Knowledge Base
 * Bilingual: English + Malayalam
 */
export const KRYPTON_PRODUCT_FEATURES: GuardianFeatureCard[] = [
  {
    icon: "🧠",
    title: "Facial Recognition",
    titleMl: "മുഖം തിരിച്ചറിയൽ (Face Recognition)",
    titleHi: "चेहरा पहचान (Facial Recognition)",
    description:
      "Real-time identification of enrolled employees, VIP visitors, and blacklisted individuals from live camera feeds. " +
      "Supports multi-face detection, liveness check, and instant alert dispatch.",
    descriptionMl:
      "ലൈവ് ക്യാമറ ഫീഡിൽ നിന്ന് enrolled employees, VIP visitors, blacklisted ആളുകളെ real-time-ൽ തിരിച്ചറിയും. " +
      "Multi-face detection, liveness check, instant alert dispatch എന്നിവ support ചെയ്യുന്നു.",
    descriptionHi:
      "लाइव कैमरा फीड से नामांकित कर्मचारियों, वीआईपी आगंतुकों और ब्लैकलिस्ट किए गए व्यक्तियों की रीयल-टाइम पहचान। " +
      "मल्टी-फेस डिटेक्शन, लाइवनेस चेक और तुरंत अलर्ट डिस्पैच का समर्थन करता है।",
    tags: ["AI", "Biometric", "Security", "Real-time"],
  },
  {
    icon: "🚗",
    title: "ANPR — Automatic Number Plate Recognition",
    titleMl: "ANPR — വാഹന നമ്പർ തിരിച്ചറിയൽ",
    titleHi: "ANPR — स्वचालित नंबर प्लेट पहचान",
    description:
      "Automatic license plate recognition for vehicle access control. Supports allowlist/blocklist alerts, " +
      "entry/exit logging, and integration with parking and logistics systems.",
    descriptionMl:
      "വാഹനങ്ങളുടെ നമ്പർ പ്ലേറ്റ് automatic-ആയി തിരിച്ചറിഞ്ഞ് access control നടത്തും. " +
      "Allowlist/blocklist alerts, entry/exit logging, parking & logistics integration support ചെയ്യുന്നു.",
    descriptionHi:
      "वाहन प्रवेश और निकास नियंत्रण के लिए ऑटोमैटिक लाइसेंस प्लेट पहचान। अनुमति/अवरुद्ध (Allowlist/Blocklist) अलर्ट, " +
      "लॉगिंग और पार्किंग एकीकरण का समर्थन करता है।",
    tags: ["AI", "Vehicle", "ANPR", "Access Control"],
  },
  {
    icon: "🔴",
    title: "Perimeter & Intrusion Detection",
    titleMl: "കടന്നുകയറ്റ ഡിറ്റക്ഷൻ & വെർച്വൽ ട്രിപ്‌വയർ",
    titleHi: "परिधि एवं घुसपैठ पहचान (वर्चुअल ट्रिपवायर)",
    description:
      "Virtual tripwires, sterile zone breach detection, and boundary crossing alarms. " +
      "Draw custom zones on any camera canvas and set directional rules (A→B, B→A, bidirectional).",
    descriptionMl:
      "ഏതൊരു ക്യാമറയിലും virtual tripwires വരച്ച് boundary crossing alerts set ചെയ്യാം. " +
      "Sterile zone breach, directional rules (A→B, B→A, bidirectional) support ഉണ്ട്. " +
      "Analytics → Rules & Automation page-ൽ configure ചെയ്യാം.",
    descriptionHi:
      "वर्चुअल ट्रिपवायर, वर्जित क्षेत्र में घुसपैठ और बाउंड्री क्रॉसिंग अलार्म। " +
      "किसी भी कैमरे पर कस्टम ज़ोन बनाएं और दिशात्मक नियम (A→B, B→A, दोनों दिशाओं में) सेट करें।",
    tags: ["AI", "Perimeter", "Intrusion", "Virtual Tripwire"],
  },
  {
    icon: "👥",
    title: "Crowd & Loitering Analytics",
    titleMl: "ജനക്കൂട്ടം & സംശയകരമായ ലോയ്‌റ്ററിംഗ് ഡിറ്റക്ഷൻ",
    titleHi: "भीड़ और संदिग्ध भटकाव (लोइटरिंग) विश्लेषण",
    description:
      "Real-time crowd density monitoring with overcrowding alerts. Detects suspicious loitering " +
      "in sensitive areas like ATMs, bank lobbies, and vaults.",
    descriptionMl:
      "Real-time crowd density monitor ചെയ്ത് overcrowding alerts അയക്കും. ATM, bank lobby, vault-ൽ " +
      "suspicious loitering detect ചെയ്ത് ഉടൻ alert നൽകും.",
    descriptionHi:
      "रीयल-टाइम भीड़ घनत्व निगरानी और ओवरक्राउडिंग अलर्ट। एटीएम, बैंक लॉबी और वॉल्ट जैसे संवेदनशील क्षेत्रों में " +
      "संदिग्ध भटकाव का पता लगाकर तुरंत अलर्ट जारी करता है।",
    tags: ["AI", "Crowd", "Analytics", "Loitering"],
  },
  {
    icon: "🏦",
    title: "Banking & NBFC Compliance Module",
    titleMl: "ബാങ്കിംഗ് & NBFC കംപ്ലയൻസ് മൊഡ്യൂൾ",
    titleHi: "बैंकिंग एवं एनबीएफसी अनुपालन मॉड्यूल",
    description:
      "Automated vault dual-custody verification, cash counter camera monitoring, teller area security, " +
      "strong-room checks, and daily executive MIS surveillance health reports.",
    descriptionMl:
      "Vault opening/closing-ൽ dual-custody ഉറപ്പാക്കും. Cash counter coverage, teller area security, " +
      "strong-room checks, daily executive MIS reports — ഇവ automated ആയി run ആകും. " +
      "Gold loan branches, banks, NBFC-കൾക്ക് ഇത് specially designed ആണ്.",
    descriptionHi:
      "स्वचालित वॉल्ट डुअल-कस्टडी सत्यापन, कैश काउंटर कैमरा निगरानी, टेलर क्षेत्र सुरक्षा, स्ट्रॉन्ग-रूम जांच " +
      "और दैनिक स्वचालित एमआईएस निगरानी स्वास्थ्य रिपोर्ट। बैंक और एनबीएफसी के लिए विशेष अनुकूलित।",
    tags: ["Banking", "NBFC", "Vault", "Compliance", "MIS Reports"],
  },
  {
    icon: "🎙️",
    title: "Voice Authentication & Biometrics",
    titleMl: "ശബ്ദ ആധികാരീകരണം (Voice ID Login)",
    titleHi: "ध्वनि बायोमेट्रिक्स एवं वॉयस लॉगिन",
    description:
      "Enroll a voice passphrase for password-free login. Uses voice biometrics to authenticate " +
      "operators securely without typing credentials.",
    descriptionMl:
      "ഒരു voice passphrase enroll ചെയ്ത ശേഷം password ടൈപ്പ് ചെയ്യാതെ voice ID ഉപയോഗിച്ച് login ചെയ്യാം. " +
      "Login page-ൽ 'Voice Login' button click ചെയ്ത് phrase speak ചെയ്താൽ authenticate ആകും.",
    descriptionHi:
      "बिना पासवर्ड टाइप किए लॉगिन करने के लिए वॉयस पासफ़्रेज़ नामांकित करें। पासवर्ड रहित सुरक्षित ऑपरेटर " +
      "प्रमाणीकरण के लिए वॉयस बायोमेट्रिक्स का उपयोग करता है।",
    tags: ["Biometric", "Voice", "Authentication", "Security"],
  },
  {
    icon: "🌐",
    title: "Multi-Branch Command Center",
    titleMl: "മൾട്ടി-ബ്രാഞ്ച് കമാൻഡ് സെന്റർ",
    titleHi: "मल्टी-ब्रांच कमांड सेंटर एवं लाइव वीडियो वॉल",
    description:
      "Centralized live video wall, PTZ camera control, and unified alert escalation across all branches. " +
      "Real-time branch health dashboard with per-branch camera status.",
    descriptionMl:
      "എല്ലാ branches-ലെയും ലൈവ് video wall ഒരിടത്ത് നിന്ന് control ചെയ്യാം. " +
      "PTZ control, unified alert escalation, real-time branch health — centralized ആയി manage ചെയ്യാം.",
    descriptionHi:
      "केंद्रीकृत लाइव वीडियो वॉल, पीटीजेड कैमरा नियंत्रण और सभी शाखाओं में एकीकृत अलर्ट एस्केलेशन। " +
      "प्रत्येक शाखा की कैमरा स्थिति के साथ रीयल-टाइम शाखा स्वास्थ्य डैशबोर्ड।",
    tags: ["Multi-Branch", "Live Video", "PTZ", "Command Center"],
  },
  {
    icon: "💾",
    title: "Edge Agent & Offline Recording",
    titleMl: "Edge Agent & ഓഫ്‌ലൈൻ വീഡിയോ റെക്കോർഡിംഗ്",
    titleHi: "एज एजेंट एवं ऑफ़लाइन वीडियो रिकॉर्डिंग",
    description:
      "Local edge appliance (Windows PC / Jetson / Intel x86) records video continuously even when internet is down. " +
      "Encrypted sync to cloud when connectivity resumes. Each branch gets its own edge agent.",
    descriptionMl:
      "Internet ഇല്ലെങ്കിലും edge PC-ൽ locally video record ആകും. " +
      "Internet restore ആയ ശേഷം encrypted ആയി cloud-ലേക്ക് sync ആകും. " +
      "Windows PC-ൽ installer download ചെയ്ത് Run as Administrator ആയി install ചെയ്യാം.",
    descriptionHi:
      "इंटरनेट बंद होने पर भी स्थानीय एज उपकरण (Windows PC / Jetson / Intel x86) लगातार वीडियो रिकॉर्ड करता है। " +
      "इंटरनेट बहाल होने पर क्लाउड पर एन्क्रिप्टेड ऑटो-सिंक। प्रत्येक शाखा का अपना एज एजेंट होता है।",
    tags: ["Edge", "Offline", "Recording", "High Availability"],
  },
  {
    icon: "📋",
    title: "Evidence & Audit Trail",
    titleMl: "തെളിവ് & ഓഡിറ്റ് ട്രെയിൽ",
    titleHi: "साक्ष्य एवं ऑडिट ट्रेल (चेन ऑफ़ कस्टडी)",
    description:
      "Tamper-evident evidence packages with chain of custody. Export incident clips, screenshots, " +
      "and audit logs for legal or compliance purposes. HSM-signed for integrity.",
    descriptionMl:
      "Incidents-ൽ video clip, screenshots, audit logs — tamper-evident ആയി export ചെയ്യാം. " +
      "HSM signing ഉള്ളതിനാൽ evidence-ന്റെ integrity legally provable ആണ്.",
    descriptionHi:
      "चेन ऑफ़ कस्टडी के साथ छेड़छाड़-रोधी साक्ष्य पैकेज। कानूनी या अनुपालन उद्देश्यों के लिए घटना क्लिप, स्क्रीनशॉट " +
      "और ऑडिट लॉग का एचएसएम डिजिटल हस्ताक्षर के साथ सुरक्षित निर्यात।",
    tags: ["Evidence", "Audit", "Legal", "Compliance"],
  },
  {
    icon: "🤖",
    title: "AI Video Search",
    titleMl: "AI വീഡിയോ സെർച്ച്",
    titleHi: "एआई प्राकृतिक भाषा वीडियो खोज",
    description:
      "Search recorded footage using natural language: 'show me a person in red shirt at main entrance between 10am-12pm'. " +
      "Powered by vision AI for rapid forensic investigation.",
    descriptionMl:
      "'Red shirt ധരിച്ച ആൾ main entrance-ൽ 10am-12pm-ൽ' എന്ന് natural language-ൽ search ചെയ്ത് " +
      "recorded footage-ൽ നിന്ൻ instantly clips കാണാം. Forensic investigation-ന് ഉപകരിക്കും.",
    descriptionHi:
      "प्राकृतिक भाषा का उपयोग करके रिकॉर्ड किए गए फुटेज खोजें: 'कल शाम 7 बजे के बाद पीली शर्ट और बैग के साथ आए व्यक्ति को दिखाइए'। " +
      "त्वरित फोरेंसिक जांच के लिए विज़न-एलएलएम द्वारा संचालित।",
    tags: ["AI", "Video Search", "Forensic", "Analytics"],
  },
  {
    icon: "🚨",
    title: "Incident Management & SOP Workflow",
    titleMl: "ഇൻസിഡന്റ് മാനേജ്‌മെന്റ് & SOP വർക്ക്‌ഫ്ലോ",
    titleHi: "इंसिडेंट प्रबंधन एवं एसओपी वर्कफ़्लो",
    description:
      "Automated incident creation, operator assignment, escalation timers, SOP checklists, " +
      "and resolution audit trail. Integrates with physical siren, SMS, and guard dispatch.",
    descriptionMl:
      "Alert trigger ആകുമ്പോൾ automatically incident create ആകും, operator-ന് assign ആകും, " +
      "escalation timer run ആകും. SOP checklist, SMS, physical siren, guard dispatch — " +
      "ഒരൊറ്റ workflow-ൽ handle ചെയ്യും.",
    descriptionHi:
      "स्वचालित घटना निर्माण, ऑपरेटर असाइनमेंट, एस्केलेशन टाइमर, एसओपी चेकलिस्ट और सायरन, एसएमएस और गार्ड डिस्पैच के साथ " +
      "समाधान ऑडिट ट्रेल।",
    tags: ["Incident", "SOP", "Workflow", "Escalation"],
  },
  {
    icon: "🔒",
    title: "Access Control & Secure Area Authorization",
    titleMl: "ആക്‌സസ് കൺട്രോൾ & സെക്യൂർ ഏരിയ ഓതറൈസേഷൻ",
    titleHi: "एक्सेस कंट्रोल एवं सुरक्षित क्षेत्र प्राधिकरण",
    description:
      "Role-based access control (RBAC/ABAC), secure area whitelists, dual-person authorization zones, " +
      "and door lock/unlock integrations.",
    descriptionMl:
      "Role-based access control, secure area whitelists, dual-person authorization zones " +
      "(vault entry-ക്ക് 2 authorized ആളുകൾ ഒരേ സമയം ഉണ്ടായിരിക്കണം), door lock/unlock integration.",
    descriptionHi:
      "भूमिका-आधारित एक्सेस कंट्रोल (RBAC/ABAC), सुरक्षित क्षेत्र श्वेतसूची, वॉल्ट दोहरी-व्यक्ति प्राधिकरण ज़ोन " +
      "(वॉल्ट में 2 अधिकृत व्यक्ति एक साथ होने चाहिए), और डोर लॉक/अनलॉक एकीकरण।",
    tags: ["Access Control", "ABAC", "RBAC", "Security"],
  },
];

export class GuardianAIAssistant {
  private openAIApiKey: string;
  private openAIBaseUrl: string;
  private model: string;
  private conversationHistory: Map<string, GuardianMessage[]> = new Map();
  private lastFeatureRoute: Map<string, AppRouteItem> = new Map();

  constructor(
    private pool: Pool,
    private config: {
      openAIApiKey?: string;
      openAIBaseUrl?: string;
      model?: string;
    } = {}
  ) {
    const rawApiKey =
      config.openAIApiKey ||
      getEnv("GROQ_API_KEY") ||
      getEnv("OPENAI_API_KEY") ||
      "";
    this.openAIApiKey = rawApiKey;

    const envBaseUrl = getEnv("OPENAI_BASE_URL");
    const isGroq =
      Boolean(getEnv("GROQ_API_KEY")) ||
      rawApiKey.startsWith("gsk_") ||
      Boolean(envBaseUrl && envBaseUrl.includes("groq.com"));

    this.openAIBaseUrl =
      config.openAIBaseUrl ||
      envBaseUrl ||
      (isGroq ? "https://api.groq.com/openai/v1" : "https://api.openai.com/v1");

    this.model =
      config.model ||
      getEnv("KRYPTON_AI_MODEL") ||
      getEnv("GUARDIAN_AI_MODEL") ||
      (isGroq ? "qwen/qwen3.8-27b" : "gpt-4-turbo-preview");

    if (!this.openAIApiKey) {
      console.warn("[KryptonAI] AI API key (GROQ_API_KEY / OPENAI_API_KEY) not configured");
    } else {
      console.log(`[KryptonAI] Initialized with endpoint: ${this.openAIBaseUrl}, model: ${this.model}`);
    }
  }

  /**
   * Process user message and generate response
   */
  async processMessage(
    sessionId: string,
    message: string,
    context: GuardianContext
  ): Promise<GuardianResponse> {
    const matchedRoute = resolveAppRoute(message);
    const guide = featureGuideResponse(message, Boolean(context.isGuest), this.lastFeatureRoute.get(sessionId));
    if (guide) {
      const refersToPrevious = /\b(?:this|that|it|athu|athinte|ithu|ee module)\b/i.test(message);
      const route = (refersToPrevious ? this.lastFeatureRoute.get(sessionId) : matchedRoute) ?? this.lastFeatureRoute.get(sessionId);
      if (route) this.lastFeatureRoute.set(sessionId, route);
      const history = this.conversationHistory.get(sessionId) ?? [this.buildSystemPrompt(context)];
      history.push({ role: "user", content: message }, { role: "assistant", content: guide.message });
      this.conversationHistory.set(sessionId, history);
      return guide;
    }

    // In authenticated session, if user asks to open/navigate to ANY menu/page or names a menu, resolve immediately!
    if (!context.isGuest) {
      const lower = message.toLowerCase().trim();
      const navMatch = resolveAppRoute(lower);
      if (navMatch && isExplicitNavigationRequest(message)) {
        return {
          message: `Opening **${navMatch.label}** (${navMatch.href}). Navigating now...`,
          type: "action",
          actions: [
            {
              function: "navigate_to_menu",
              parameters: { target: navMatch.href, label: navMatch.label },
              executed: true,
              result: {
                href: navMatch.href,
                label: navMatch.label,
                category: navMatch.category,
                action: "navigate",
              },
            },
          ],
          suggestions: ["Executive MIS Reports", "Live Video Wall", "Incident Response", "System Settings"],
          timestamp: new Date().toISOString(),
        };
      }
    }

    if (!this.openAIApiKey) {
      return await this.processFallbackMessage(message, context);
    }

    // Get or initialize conversation history
    let history = this.conversationHistory.get(sessionId);
    if (!history) {
      history = [this.buildSystemPrompt(context)];
      this.conversationHistory.set(sessionId, history);
    }

    // Add user message
    history.push({
      role: "user",
      content: message,
    });

    try {
      const isGroq = this.openAIBaseUrl.includes("groq.com");
      const payload: any = {
        model: this.model,
        messages: history.map((m) => {
          const item: any = { role: m.role, content: m.content ?? "" };
          if (m.name) item.name = m.name;
          if (m.tool_calls) item.tool_calls = m.tool_calls;
          if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
          return item;
        }),
        temperature: 0.7,
        max_tokens: 500,
      };

      if (!context.isGuest) {
        if (isGroq) {
          payload.tools = GUARDIAN_FUNCTIONS.map((f) => ({
            type: "function",
            function: f,
          }));
          payload.tool_choice = "auto";
        } else {
          payload.functions = GUARDIAN_FUNCTIONS;
          payload.function_call = "auto";
        }
      }

      // Call AI endpoint
      const response = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify(payload),
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        throw new Error(`AI API error (${response.status}): ${errBody}`);
      }

      const data = await response.json();
      const choice = data.choices?.[0];
      if (!choice?.message) {
        throw new Error("Invalid AI response: missing choice message");
      }

      // Handle modern tool_calls (Groq / OpenAI modern)
      const toolCall = choice.message.tool_calls?.[0];
      if (toolCall?.function) {
        return await this.handleModernToolCall(
          sessionId,
          toolCall,
          context,
          history
        );
      }

      // Handle legacy function_call (OpenAI legacy)
      if (choice.message.function_call) {
        return await this.handleLegacyFunctionCall(
          sessionId,
          choice.message,
          context,
          history
        );
      }

      // Check if model returned function call as plain text (e.g. show_camera_feed { ... } or navigate_to_menu { ... })
      const rawContent = (choice.message.content || "").trim();
      const fnCallTextMatch = rawContent.match(
        /(?:```(?:json)?\s*)?(show_camera_feed|navigate_to_menu|lock_doors|dispatch_guard|trigger_alarm|get_alert_summary|get_branch_status|get_camera_locations)\s*(\{[\s\S]*?\})(?:\s*```)?/i
      );

      if (fnCallTextMatch) {
        const fnName = fnCallTextMatch[1];
        let fnArgs: any = {};
        try {
          fnArgs = JSON.parse(fnCallTextMatch[2]);
        } catch {
          fnArgs = {};
        }

        console.log(`[KryptonAI] Intercepted text-based function call: ${fnName}`, fnArgs);

        return await this.handleModernToolCall(
          sessionId,
          {
            id: `call_${Date.now()}`,
            type: "function",
            function: {
              name: fnName,
              arguments: JSON.stringify(fnArgs),
            },
          },
          context,
          history
        );
      }

      // Regular text response
      const assistantMessage = choice.message.content || "";
      history.push({
        role: "assistant",
        content: assistantMessage,
      });

      // Trim history if too long (keep last 20 messages)
      if (history.length > 21) {
        history.splice(1, history.length - 21);
      }

      return {
        message: assistantMessage,
        type: "text",
        timestamp: new Date().toISOString(),
      };
    } catch (error) {
      console.warn("[KryptonAI] AI API error, falling back to operational assistant:", error);
      return await this.processFallbackMessage(message, context);
    }
  }

  /**
   * Execute core function logic for security operations
   */
  private async executeFunctionCore(
    functionName: string,
    functionArgs: any,
    context: GuardianContext
  ): Promise<{ functionResult: any; executed: boolean }> {
    let functionResult: any;
    let executed = false;

    try {
      switch (functionName) {
        case "show_camera_feed":
          functionResult = await this.showCameraFeed(functionArgs, context);
          executed = true;
          break;

        case "control_live_wall":
          functionResult = await this.controlLiveWall(functionArgs, context);
          executed = true;
          break;

        case "lock_doors":
          functionResult = await this.lockDoors(functionArgs, context);
          executed = true;
          break;

        case "dispatch_guard":
          functionResult = await this.dispatchGuard(functionArgs, context);
          executed = true;
          break;

        case "get_alert_summary":
          functionResult = await this.getAlertSummary(functionArgs, context);
          executed = true;
          break;

        case "search_person":
          functionResult = await this.searchPerson(functionArgs, context);
          executed = true;
          break;

        case "get_branch_status":
          functionResult = await this.getBranchStatus(functionArgs, context);
          executed = true;
          break;

        case "trigger_alarm":
          functionResult = await this.triggerAlarm(functionArgs, context);
          executed = true;
          break;

        case "analyze_incident":
          functionResult = await this.analyzeIncident(functionArgs, context);
          executed = true;
          break;

        case "get_camera_locations":
          functionResult = await this.getCameraLocations(functionArgs, context);
          executed = true;
          break;

        case "navigate_to_menu":
          functionResult = this.navigateToMenu(functionArgs);
          executed = true;
          break;

        default:
          functionResult = { error: "Unknown function" };
      }
    } catch (error) {
      functionResult = {
        error: error instanceof Error ? error.message : "Function execution failed",
      };
    }

    return { functionResult, executed };
  }

  /**
   * Handle modern tool calls (Groq / OpenAI modern)
   */
  private async handleModernToolCall(
    sessionId: string,
    toolCall: any,
    context: GuardianContext,
    history: GuardianMessage[]
  ): Promise<GuardianResponse> {
    const functionName = toolCall.function.name;
    let functionArgs: any = {};
    try {
      functionArgs = JSON.parse(toolCall.function.arguments || "{}");
    } catch {
      functionArgs = {};
    }

    console.log(`[KryptonAI] Tool called: ${functionName}`, functionArgs);

    if (context.isGuest) {
      return {
        message: "🔒 **Authentication Required**\n\nTo view live camera feeds, branch status, security alerts, and operational module data, please sign in to your KryptonVision account on the login page.",
        type: "text",
        suggestions: ["How do I sign in?", "What is KryptonVision?", "Supported CCTV cameras"],
        timestamp: new Date().toISOString(),
      };
    }

    history.push({
      role: "assistant",
      content: null,
      tool_calls: [toolCall],
    });

    const { functionResult, executed } = await this.executeFunctionCore(
      functionName,
      functionArgs,
      context
    );

    history.push({
      role: "tool",
      tool_call_id: toolCall.id,
      content: JSON.stringify(functionResult),
    });

    let assistantMessage = "";
    try {
      const followupResponse = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: history.map((m) => {
            const item: any = { role: m.role, content: m.content ?? "" };
            if (m.name) item.name = m.name;
            if (m.tool_calls) item.tool_calls = m.tool_calls;
            if (m.tool_call_id) item.tool_call_id = m.tool_call_id;
            return item;
          }),
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (followupResponse.ok) {
        const followupData = await followupResponse.json();
        assistantMessage = followupData.choices?.[0]?.message?.content || "";
      }
    } catch (err) {
      console.warn("[KryptonAI] Followup tool call failed:", err);
    }

    if (functionName === "show_camera_feed") {
      const count = functionArgs.cameraIds?.length || functionResult.cameras?.length || 0;
      const layout = functionArgs.layout || functionResult.layout || "grid";
      assistantMessage = `Displaying live feed for ${count} camera(s) in ${layout} view. You can monitor the live streams directly below.`;
    } else if (functionName === "control_live_wall") {
      assistantMessage = functionResult.message || `Switched live wall to ${functionResult.gridSize || "grid"} layout.`;
    } else if (functionName === "navigate_to_menu") {
      const label = functionResult.label || functionArgs.target || "requested page";
      assistantMessage = `Opening ${label}. Click below to navigate directly:`;
    } else if (!assistantMessage || assistantMessage.includes("Command executed:") || assistantMessage.includes(functionName)) {
      assistantMessage = functionResult.message || `Action executed: ${functionName.replace(/_/g, " ")}.`;
    }

    history.push({
      role: "assistant",
      content: assistantMessage,
    });

    const isStateChangingAction = [
      "lock_doors",
      "dispatch_guard",
      "trigger_alarm",
      "show_camera_feed",
      "control_live_wall",
      "navigate_to_menu",
    ].includes(functionName);

    return {
      message: assistantMessage,
      type: isStateChangingAction ? "action" : "text",
      actions: isStateChangingAction
        ? [
            {
              function: functionName,
              parameters: Object.fromEntries(
                Object.entries(functionArgs).filter(
                  ([_, v]) => v !== null && v !== undefined
                )
              ),
              executed,
              result: functionResult,
            },
          ]
        : undefined,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Handle legacy function calls from GPT-4
   */
  private async handleLegacyFunctionCall(
    sessionId: string,
    message: any,
    context: GuardianContext,
    history: GuardianMessage[]
  ): Promise<GuardianResponse> {
    const functionName = message.function_call.name;
    let functionArgs: any = {};
    try {
      functionArgs = JSON.parse(message.function_call.arguments || "{}");
    } catch {
      functionArgs = {};
    }

    console.log(`[KryptonAI] Function called: ${functionName}`, functionArgs);

    if (context.isGuest) {
      return {
        message: "🔒 **Authentication Required**\n\nTo view live camera feeds, branch status, security alerts, and operational module data, please sign in to your KryptonVision account on the login page.",
        type: "text",
        suggestions: ["How do I sign in?", "What is KryptonVision?", "Supported CCTV cameras"],
        timestamp: new Date().toISOString(),
      };
    }

    history.push({
      role: "assistant",
      content: "",
      function_call: message.function_call,
    });

    const { functionResult, executed } = await this.executeFunctionCore(
      functionName,
      functionArgs,
      context
    );

    history.push({
      role: "function",
      name: functionName,
      content: JSON.stringify(functionResult),
    });

    let assistantMessage = "";
    try {
      const followupResponse = await fetch(`${this.openAIBaseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.openAIApiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          messages: history,
          temperature: 0.7,
          max_tokens: 500,
        }),
      });

      if (followupResponse.ok) {
        const followupData = await followupResponse.json();
        assistantMessage = followupData.choices?.[0]?.message?.content || "";
      }
    } catch (err) {
      console.warn("[KryptonAI] Followup function call failed:", err);
    }

    if (functionName === "show_camera_feed") {
      const count = functionArgs.cameraIds?.length || functionResult.cameras?.length || 0;
      const layout = functionArgs.layout || functionResult.layout || "grid";
      assistantMessage = `Displaying live feed for ${count} camera(s) in ${layout} view. You can monitor the live streams directly below.`;
    } else if (functionName === "control_live_wall") {
      assistantMessage = functionResult.message || `Switched live wall to ${functionResult.gridSize || "grid"} layout.`;
    } else if (functionName === "navigate_to_menu") {
      const label = functionResult.label || functionArgs.target || "requested page";
      assistantMessage = `Opening ${label}. Click below to navigate directly:`;
    } else if (!assistantMessage || assistantMessage.includes("Command executed:") || assistantMessage.includes(functionName)) {
      assistantMessage = functionResult.message || `Action executed: ${functionName.replace(/_/g, " ")}.`;
    }

    history.push({
      role: "assistant",
      content: assistantMessage,
    });

    const isStateChangingAction = [
      "lock_doors",
      "dispatch_guard",
      "trigger_alarm",
      "show_camera_feed",
      "control_live_wall",
      "navigate_to_menu",
    ].includes(functionName);

    return {
      message: assistantMessage,
      type: isStateChangingAction ? "action" : "text",
      actions: isStateChangingAction
        ? [
            {
              function: functionName,
              parameters: Object.fromEntries(
                Object.entries(functionArgs).filter(
                  ([_, v]) => v !== null && v !== undefined
                )
              ),
              executed,
              result: functionResult,
            },
          ]
        : undefined,
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Build system prompt with context
   */
  private buildSystemPrompt(context: GuardianContext): GuardianMessage {
    const trainerPolicy = `FEATURE TRAINER RULES:
- Answer feature doubts like a patient product trainer: explain purpose, how it works, where it is, and practical steps. Answer follow-up questions using the preceding feature context.
- Use only the route directory below for paths and links. If the feature is absent or ambiguous, say so and ask which feature the user means; never invent a path or claim an action was performed.
- A question about where a feature is, its link, purpose, or workflow is an explanation request. Only navigate when the user explicitly commands you to open a page.
- Also answer ordinary general knowledge questions directly, including simple science, history, geography, language, and arithmetic. Do not force unrelated questions into KryptonVision features or require sign-in for general knowledge.
- Keep general answers clear and brief, explain further when asked, and say when you are unsure. Do not guess about current or changing facts without a reliable source.
- Match the user's language, with full fluency in Malayalam (മലയാളം), Manglish (Malayalam in Latin script), Hindi (हिन्दी), Hinglish (Hindi in Latin script), and English. For guests, explain general features but never disclose organization data or perform operations.
ROUTE DIRECTORY (page name | path):
${APP_ROUTES.map((route) => `${route.label} | ${route.href}`).join("\n")}`;
    const generalKnowledgePolicy = `GENERAL KNOWLEDGE: Answer ordinary questions beyond KryptonVision directly. For CCTV and VMS questions, use the following training reference and explain terms, workflows, comparisons, or troubleshooting at the level requested.\n${CCTV_VMS_PRIMER}`;
    if (context.isGuest) {
      return {
        role: "system",
        content: `You are KryptonAI, the intelligent assistant for the KryptonVision (Sentinel Grid) security and video analytics platform.

${trainerPolicy}

${generalKnowledgePolicy}

IMPORTANT CONTEXT:
The user is currently a GUEST (pre-login mode) and has not authenticated yet.

LANGUAGE & LOCALIZATION (ENGLISH / മലയാളം / MANGLISH / हिन्दी / HINGLISH):
- You natively understand English, Malayalam (മലയാളം), Manglish (Malayalam in Latin script), Hindi (हिन्दी), and Hinglish (Hindi in Latin script).
- When asked in Malayalam or Manglish, reply fluently and helpfully in Malayalam/Manglish with step-by-step guidance!
- When asked in Hindi or Hinglish (e.g. "कैमरा कैसे जोड़ें", "लाइन क्रॉसिंग कैसे सेट करें", "kya features hai", "camera dikhao"), reply fluently and helpfully in Hindi/Hinglish with step-by-step guidance!
- When asked in English, reply in English. Always match the user's chosen language.

KRYPTONVISION PLATFORM ARCHITECTURE & HOW-TO KNOWLEDGE:
1. LINE CROSSING & VIRTUAL TRIPWIRES (ലൈൻ ക്രോസ്സിംഗ് സെറ്റ് ചെയ്യുന്നത്):
   - Location: "Analytics ➔ Rules & Automation" (URL: /analytics/rules).
   - How to configure LINE CROSSING (Virtual Tripwire):
     a) Select Branch and Camera.
     b) In "Visual Zone & Virtual Tripwire Designer", switch to "Virtual Tripwire" (or click "⚡ Door Ingress Tripwire" preset).
     c) Select Direction: "A ➔ B", "B ➔ A", or "A ⇄ B" (Bidirectional).
     d) Click 2 points on the camera preview canvas to draw the crossing line (Point A = start, Point B = end).
     e) Click "Save Tripwire Definition".
     f) Under Rule Configuration below, choose Condition: "Line Crossing" (line_crossing) and select action (Alert, Siren, SMS, Incident). Click "Save Rule".

   - How to configure POLYGON ZONE (Sterile / Restricted Area Zone Intrusion):
     a) Select Branch and Camera.
     b) In "Visual Zone & Virtual Tripwire Designer", switch mode to "Polygon Zone".
     c) Click 3 or more points on the camera canvas to draw a closed polygon area.
        • Each click = one corner of the zone.
        • Click the first point again (or double-click) to close the polygon.
     d) Click "Save Zone Definition".
     e) Under Rule Configuration, choose Condition: "Zone Intrusion" (zone_intrusion) and select action. Click "Save Rule".

   PATH for both: Dashboard sidebar → Analytics → Rules & Automation → /analytics/rules
   Malayalam: Line Crossing-ന് 2 points, Polygon Zone-ന് 3+ points ക്ലിക്ക് ചെയ്ത് area draw ചെയ്ത് save ചെയ്യുക. Condition-ൽ Line Crossing / Zone Intrusion select ചെയ്ത് Rule save ചെയ്യുക.

2. EDGE AGENT INSTALLATION & TROUBLESHOOTING:
   - Open Edge Agent Management (/operations/edge-fleet), select the branch, and follow its current installer and one-time gateway activation instructions.
   - Use the package and activation issued for that branch. Do not reuse credentials or activation for another branch.
   - Approve the Windows administrator prompt. Check the agent status in the dashboard and the installed logs under C:\\Program Files\\KryptonVision\\Edge Agent if the connection fails.
   - Refer to the control-plane address displayed in the deployment; do not prescribe an old hard-coded URL or installer version.

3. COMPLETE PRODUCT FEATURES KNOWLEDGE (Answer these in detail — including in Malayalam/Manglish when asked):

   🧠 FACIAL RECOGNITION: Real-time ID of enrolled employees, VIP visitors, blacklisted persons. Multi-face detection, liveness check, instant alerts.
   Malayalam: ലൈവ് ക്യാമറ ഫീഡിൽ enrolled employees, VIP visitors, blacklisted ആളുകളെ real-time-ൽ തിരിച്ചറിഞ്ഞ് alert അയക്കും.

   🚗 ANPR (Automatic Number Plate Recognition): Vehicle license plate recognition. Allowlist/blocklist alerts, entry/exit logging, parking integration.
   Malayalam: വാഹന നമ്പർ plate automatic-ആയി read ചെയ്ത് blocklist vehicles-ന് alert തരും, entry/exit log ചെയ്യും.

   🔴 INTRUSION & LINE CROSSING: Virtual tripwires on any camera. Draw a line → set direction (A→B, B→A, bidirectional) → trigger alerts/siren/SMS on crossing.
   Malayalam: ഏതൊരു ക്യാമറയിലും virtual line വരച്ച് line cross ചെയ്യുമ്പോൾ alert/siren/SMS trigger ചെയ്യാം.

   👥 CROWD & LOITERING: Overcrowding alerts, suspicious loitering detection in ATMs, bank lobbies, vaults.
   Malayalam: ATM, bank lobby, vault-ൽ loitering detect ചെയ്ത് ഉടൻ alert നൽകും, crowd density monitor ചെയ്യും.

   🏦 NBFC/BANKING MODULE: Vault dual-custody verification, cash counter monitoring, teller area security, daily automated MIS reports.
   Malayalam: Vault open/close-ൽ dual-custody enforce ചെയ്യും. Cash counter, teller area monitor ചെയ്ത് daily MIS reports auto-generate ആകും.

   🎙️ VOICE AUTHENTICATION: Voice passphrase enrollment for password-free login. Click Voice Login → speak passphrase → authenticated.
   Malayalam: Voice passphrase enroll ചെയ്ത ശേഷം password ഇല്ലാതെ login ചെയ്യാം.

   🌐 MULTI-BRANCH CONTROL CENTER: Centralized live video wall, PTZ control, unified alert escalation across all branches.
   Malayalam: എല്ലാ branches-ലെയും ലൈവ് cameras ഒരിടത്ത് നിന്ന് control ചെയ്യാം.

   💾 EDGE AGENT & OFFLINE RECORDING: Records video locally even without internet. Encrypted sync to cloud when connectivity resumes.
   Malayalam: Internet ഇല്ലെങ്കിലും locally record ആകും, internet restore ആകുമ്പോൾ cloud-ലേക്ക് sync ആകും.

   📋 EVIDENCE & AUDIT TRAIL: Tamper-evident evidence packages, video clip export, HSM-signed for legal compliance.
   Malayalam: Incidents-ൽ video clip, audit log — HSM-signed tamper-evident ആയി export ചെയ്യാം.

   🤖 AI VIDEO SEARCH: Natural language video search — 'red shirt person at main gate 10am-12pm'. Rapid forensic investigation.
   Malayalam: Natural language-ൽ recorded footage search ചെയ്ത് instantly clips കണ്ടെത്താം.

   🚨 INCIDENT MANAGEMENT & SOP: Automated incident creation, operator assignment, escalation timers, SOP checklists, guard dispatch, siren.
   Malayalam: Alert ആകുമ്പോൾ incident auto-create ആകും, operator-ന് assign ആകും, SOP checklist run ആകും.

   🔒 ACCESS CONTROL & SECURE AREAS: RBAC/ABAC roles, secure area whitelists, dual-person authorization zones, door lock/unlock.
   Malayalam: Role-based access, secure area whitelist, vault-ൽ dual-person authorization enforce ചെയ്യും.

4. GENERAL QUESTIONS (PERMITTED IN GUEST MODE):
   - You CAN freely answer questions about KryptonVision platform features, architecture, and system capabilities.
   - You CAN answer simple general knowledge questions unrelated to the platform, such as science, geography, history, words, and arithmetic. Do not ask the user to sign in for these.
   - You CAN explain AI video analytics (facial recognition, perimeter intrusion, crowd counting, loitering detection, vehicle ANPR).
   - You CAN explain CCTV camera support: ONVIF (Profile S/G/T), RTSP, and native compatibility with vendors like Hikvision, Dahua, CP Plus, Axis, Uniview, and Hanwha.
   - You CAN guide users on how to log in (Username/Password or Voice ID), how to reset passwords via OTP, and how to contact the administrator.
   - When asked in Malayalam or Manglish, ALWAYS reply in Malayalam/Manglish with full details!

5. ORGANIZATION & MODULE DATA (STRICTLY PROHIBITED FOR GUESTS):
   - You do NOT have access to live camera streams, real-time alerts, incident logs, branch status, vault/banking monitoring, employee attendance, or any organization-specific operational data.
   - If the user asks for ANY live cameras, video feeds, alerts, incidents, branch data, or module operations, politely refuse and instruct them to log in:
     "To view live camera feeds, branch status, security alerts, and operational module data, please sign in to your KryptonVision account on the login page."

Personality: Professional, welcoming, concise, and helpful. Always reply in the same language the user writes in (English, Malayalam, or Manglish).`,
      };
    }

    return {
      role: "system",
      content: `You are KryptonAI, an intelligent AI security assistant similar to JARVIS for the KryptonVision (Sentinel Grid) platform.

${trainerPolicy}

${generalKnowledgePolicy}

Your role:
- Monitor security operations across all branches
- Guide operators on platform features, rules, and hardware setup
- Execute commands when requested (e.g. navigate_to_menu, show_camera_feed, dispatch_guard, lock_doors)
- Assist operators in daily operations and emergency situations
- Be concise, professional, and action-oriented

LANGUAGE & LOCALIZATION (ENGLISH / മലയാളം / MANGLISH / हिन्दी / HINGLISH):
- You natively understand English, Malayalam (മലയാളം), Manglish (Malayalam in Latin script), Hindi (हिन्दी), and Hinglish (Hindi in Latin script).
- When asked in Malayalam or Manglish, reply fluently and helpfully in Malayalam/Manglish with step-by-step guidance!
- When asked in Hindi or Hinglish (e.g. "कैमरा कैसे जोड़ें", "लाइन क्रॉसिंग कैसे सेट करें", "kya features hai", "camera dikhao"), reply fluently and helpfully in Hindi/Hinglish with step-by-step guidance!
- When asked in English, reply in English. Always match the user's chosen language.

KRYPTONVISION PLATFORM HOW-TO KNOWLEDGE:
1. LINE CROSSING & VIRTUAL TRIPWIRES (ലൈൻ ക്രോസ്സിംഗ് സെറ്റ് ചെയ്യുന്നത്):
   - Location: "Analytics ➔ Rules & Automation" (URL: /analytics/rules).
   - How to configure LINE CROSSING (Virtual Tripwire):
     a) Select Branch and Camera from dropdown.
     b) In "Visual Zone & Virtual Tripwire Designer", switch mode to "Virtual Tripwire" (or click quick preset "⚡ Door Ingress Tripwire").
     c) Choose Direction: "A ➔ B", "B ➔ A", or "A ⇄ B" (Bidirectional).
     d) Click 2 points on the live camera canvas (Point A green = start, Point B blue = end).
     e) Click "Save Tripwire Definition".
     f) Below in Rule Configuration, set Condition Type to "Line Crossing" (line_crossing) and choose Action (Alert, Siren, SMS, Incident). Click "Save Rule".
   - When users ask where or how to configure Line Crossing, explain these exact steps and call navigate_to_menu with "/analytics/rules".

   - How to configure POLYGON ZONE (Sterile / Restricted Area Zone Intrusion):
     a) Select Branch and Camera.
     b) In "Visual Zone & Virtual Tripwire Designer", switch mode to "Polygon Zone".
     c) Click 3 or more points on the live camera canvas to draw a closed polygon (each click = one corner).
     d) Close the polygon by clicking the first point or double-clicking.
     e) Click "Save Zone Definition".
     f) In Rule Configuration, set Condition Type to "Zone Intrusion" (zone_intrusion) and choose Action. Click "Save Rule".
   - When users ask about polygon zone / sterile zone / restricted area, explain these steps and call navigate_to_menu with "/analytics/rules".

   KEY DIFFERENCE:
   • Line Crossing = 2 points, draws a straight line. Alert when someone crosses that line.
   • Polygon Zone = 3+ points, draws a closed area. Alert when someone enters/exits that zone.

   PATH for both: Dashboard sidebar → Analytics → Rules & Automation → /analytics/rules
   Malayalam: /analytics/rules page-ൽ branch & camera select ചെയ്ത് Designer-ൽ mode choose ചെയ്ത് points click ചെയ്ത് save ചെയ്യുക. Rule Configuration-ൽ condition set ചെയ്ത് Rule save ചെയ്യുക.

2. EDGE AGENT INSTALLATION & TROUBLESHOOTING:
   - Open Edge Agent Management (/operations/edge-fleet), select the branch, and follow its current installer and one-time gateway activation instructions.
   - Use the package and activation issued for that branch. Do not reuse credentials or activation for another branch.
   - Approve the Windows administrator prompt. Check the agent status in the dashboard and the installed logs under C:\\Program Files\\KryptonVision\\Edge Agent if the connection fails.
   - Refer to the control-plane address displayed in the deployment; do not prescribe an old hard-coded URL or installer version.

3. COMPLETE PRODUCT FEATURES (Explain in detail when asked — reply in Malayalam when user asks in Malayalam/Manglish):

   🧠 FACIAL RECOGNITION: Real-time ID of enrolled employees, VIP visitors, blacklisted persons from live feeds. Multi-face detection, liveness check.
   🚗 ANPR: Automatic vehicle license plate recognition. Allowlist/blocklist alerts, entry/exit logging.
   🔴 INTRUSION & LINE CROSSING: Virtual tripwires on any camera. Draw line → set direction → trigger alerts/siren/SMS on crossing. Configure at /analytics/rules.
   👥 CROWD & LOITERING: Overcrowding alerts and suspicious loitering detection in sensitive areas.
   🏦 NBFC/BANKING MODULE: Vault dual-custody verification, cash counter monitoring, teller security, automated daily MIS reports.
   🎙️ VOICE AUTHENTICATION: Voice passphrase enrollment for password-free login.
   🌐 MULTI-BRANCH CONTROL CENTER: Centralized live video wall, PTZ control, unified alerts across all branches.
   💾 EDGE AGENT & OFFLINE RECORDING: Local recording even without internet, encrypted sync to cloud on reconnect.
   📋 EVIDENCE & AUDIT TRAIL: Tamper-evident evidence packages, video clip export, HSM-signed for legal use.
   🤖 AI VIDEO SEARCH: Natural language search through recorded footage for rapid forensic investigation.
   🚨 INCIDENT MANAGEMENT & SOP: Automated incident creation, operator assignment, escalation timers, SOP checklists, guard dispatch.
   🔒 ACCESS CONTROL & SECURE AREAS: RBAC/ABAC, secure area whitelists, dual-person authorization zones, door lock/unlock.

Current context:
- User ID: ${context.userId}
- Tenant: ${context.tenantId}
- Current Branch: ${context.currentBranchId || "All branches"}
- Recent Alerts: ${context.recentAlerts?.length || 0}

Personality:
- Professional but friendly
- Proactive in suggesting actions
- Clear and concise communication
- LANGUAGE: Always reply in the same language the user writes in (English, Malayalam, or Manglish)
- When users ask to navigate or open any page, use navigate_to_menu tool call!`,
    };
  }

  private navigateToMenu(args: any) {
    const target = args?.target || "";
    const resolved = resolveAppRoute(target);
    if (!resolved) {
      return {
        action: "navigate",
        success: false,
        message: `Could not find menu matching "${target}". Opening Command Center.`,
        href: "/",
        label: "Command Center",
        category: "OPERATIONS",
      };
    }
    return {
      action: "navigate",
      success: true,
      href: resolved.href,
      label: resolved.label,
      category: resolved.category,
      message: `Opening ${resolved.label} (${resolved.href})`,
    };
  }

  private async showCameraFeed(args: any, context: GuardianContext) {
    const { cameraIds = [], layout = "grid" } = args;

    // Get camera details from DB if available
    let cameras: any[] = [];
    try {
      const { rows } = await this.pool.query(
        `SELECT c.id, c.name, c.status FROM cameras c
         WHERE c.id = ANY($1) AND c.tenant_id = $2 AND ${activeCamera('c')}`,
        [cameraIds, context.tenantId]
      );
      cameras = rows;
    } catch {
      cameras = [];
    }

    const cameraList = (cameraIds || []).flatMap((id: string) => {
      const found = cameras.find((c: any) => c.id === id);
      if (!found) return [];
      return [{
        id,
        name: found.name,
        status: found.status,
      }];
    });

    return {
      action: "show_cameras",
      cameras: cameraList,
      layout,
      message: `Displaying ${cameraList.length} camera feed(s) in ${layout} layout`,
    };
  }

  /**
   * Control, filter, layout, and switch the Sentinel Live Camera Wall based on natural language criteria.
   * Supports prompt queries:
   * - "Show all entrance cameras with active movement"
   * - "Switch to Warehouse Zone B"
   * - "Show cameras that triggered unauthorized access in the last 15 minutes"
   * - Direct layout switches ("1+5", "1+7", "2x2", "3x3", "4x4")
   */
  private async controlLiveWall(args: any, context: GuardianContext) {
    const { query = "", cameraIds: explicitIds, gridSize, filterType, timeWindowMinutes = 15 } = args;
    const qLower = (query || "").toLowerCase();
    let matchedCameraIds: string[] = Array.isArray(explicitIds) && explicitIds.length > 0 ? [...explicitIds] : [];
    let detectedGridSize: string | null = gridSize || null;
    let filterCategory = filterType || "general";
    let summary = "";

    // 1. Detect explicit layout requested in query
    if (!detectedGridSize) {
      if (qLower.includes("1+5") || qLower.includes("1 + 5")) detectedGridSize = "1+5";
      else if (qLower.includes("1+7") || qLower.includes("1 + 7")) detectedGridSize = "1+7";
      else if (qLower.includes("2+8") || qLower.includes("2 + 8")) detectedGridSize = "2+8";
      else if (qLower.includes("1x1") || qLower.includes("single")) detectedGridSize = "1x1";
      else if (qLower.includes("2x2") || qLower.includes("4 cameras") || qLower.includes("four cameras")) detectedGridSize = "2x2";
      else if (qLower.includes("3x3") || qLower.includes("9 cameras") || qLower.includes("nine cameras")) detectedGridSize = "3x3";
      else if (qLower.includes("4x4") || qLower.includes("16 cameras")) detectedGridSize = "4x4";
    }

    try {
      // 2. Classify intent
      const isSecurityOrAlertQuery =
        qLower.includes("unauthorized") ||
        qLower.includes("unauthorised") ||
        qLower.includes("intrusion") ||
        qLower.includes("breach") ||
        qLower.includes("access") ||
        qLower.includes("alert") ||
        qLower.includes("alarm") ||
        qLower.includes("violation") ||
        qLower.includes("weapon") ||
        qLower.includes("fire");

      const isMotionQuery =
        qLower.includes("movement") ||
        qLower.includes("motion") ||
        qLower.includes("active movement") ||
        qLower.includes("activity") ||
        qLower.includes("moving");

      const locationKeywords: string[] = [];
      if (qLower.includes("entrance") || qLower.includes("entry") || qLower.includes("gate") || qLower.includes("door")) {
        locationKeywords.push("entrance", "gate", "door", "entry", "ingress");
      }
      if (qLower.includes("warehouse")) {
        locationKeywords.push("warehouse");
      }
      if (qLower.includes("zone b") || qLower.includes("zone-b") || qLower.includes("zone_b")) {
        locationKeywords.push("zone b", "zone-b", "zone_b");
      }
      if (qLower.includes("zone a") || qLower.includes("zone-a") || qLower.includes("zone_a")) {
        locationKeywords.push("zone a", "zone-a", "zone_a");
      }
      if (qLower.includes("vault") || qLower.includes("strong room") || qLower.includes("strongroom")) {
        locationKeywords.push("vault", "strongroom");
      }
      if (qLower.includes("lobby") || qLower.includes("reception")) {
        locationKeywords.push("lobby", "reception");
      }
      if (qLower.includes("cash") || qLower.includes("counter") || qLower.includes("teller")) {
        locationKeywords.push("cash", "counter", "teller");
      }
      if (qLower.includes("parking") || qLower.includes("garage")) {
        locationKeywords.push("parking", "garage");
      }
      if (qLower.includes("perimeter") || qLower.includes("boundary") || qLower.includes("fence")) {
        locationKeywords.push("perimeter", "boundary", "fence");
      }

      if (matchedCameraIds.length === 0) {
        // Query A: Security Alerts & Unauthorized Access in time window
        if (isSecurityOrAlertQuery) {
          filterCategory = "alert";
          const intervalMinutes = Math.max(1, Math.min(1440, Number(timeWindowMinutes) || 15));
          const alertRes = await this.pool.query(
            `SELECT DISTINCT c.id, c.name, c.status
             FROM operational_alerts a
             JOIN cameras c ON (c.id = a.camera_id OR c.id::text = a.camera_id)
             WHERE a.occurred_at >= NOW() - ($1 || ' minutes')::interval
               AND (
                 a.detection_type ILIKE '%unauthorized%' OR
                 a.detection_type ILIKE '%intrusion%' OR
                 a.detection_type ILIKE '%access%' OR
                 a.detection_type ILIKE '%breach%' OR
                 a.detection_title ILIKE '%unauthorized%' OR
                 a.detection_title ILIKE '%intrusion%' OR
                 a.severity IN ('critical', 'high', 'P1', 'P2')
               )
             ORDER BY c.name
             LIMIT 16`,
            [String(intervalMinutes)]
          ).catch(() => ({ rows: [] }));

          matchedCameraIds = alertRes.rows.map((r: any) => r.id);
          summary = `Cameras with unauthorized access/intrusion alerts in the last ${intervalMinutes}m`;
        }

        // Query B: Active Motion / Movement
        if (matchedCameraIds.length === 0 && isMotionQuery) {
          filterCategory = "motion";
          const intervalMinutes = Math.max(1, Math.min(1440, Number(timeWindowMinutes) || 15));
          const motionRes = await this.pool.query(
            `SELECT DISTINCT c.id, c.name
             FROM operational_alerts a
             JOIN cameras c ON (c.id = a.camera_id OR c.id::text = a.camera_id)
             WHERE a.occurred_at >= NOW() - ($1 || ' minutes')::interval
               AND (
                 a.detection_type ILIKE '%motion%' OR
                 a.detection_type ILIKE '%movement%' OR
                 a.detection_type ILIKE '%line_crossing%' OR
                 a.detection_type ILIKE '%zone_intrusion%'
               )
             ORDER BY c.name
             LIMIT 16`,
            [String(intervalMinutes)]
          ).catch(() => ({ rows: [] }));

          matchedCameraIds = motionRes.rows.map((r: any) => r.id);
          if (matchedCameraIds.length > 0) {
            summary = `Cameras with active motion/movement in the last ${intervalMinutes}m`;
          }
        }

        // Query C: Location / Zone matching
        if (locationKeywords.length > 0) {
          filterCategory = "location";
          const likeConditions = locationKeywords.map((_, i) => `(c.name ILIKE $${i + 1} OR rn.name ILIKE $${i + 1} OR rn.path::text ILIKE $${i + 1} OR b.name ILIKE $${i + 1})`).join(" OR ");
          const likeParams = locationKeywords.map((k) => `%${k}%`);

          const locationRes = await this.pool.query(
            `SELECT DISTINCT c.id, c.name, c.status
             FROM cameras c
             LEFT JOIN resource_nodes rn ON c.resource_node_id = rn.id
             LEFT JOIN branches b ON (b.id = c.branch_id OR b.id = rn.parent_id)
             WHERE (${likeConditions}) AND c.tenant_id = $${likeParams.length + 1}
               AND ${activeCamera('c')}
             ORDER BY c.name
             LIMIT 16`,
            [...likeParams, context.tenantId]
          ).catch(() => ({ rows: [] }));

          const locationCamIds = locationRes.rows.map((r: any) => r.id);

          if (isMotionQuery && matchedCameraIds.length > 0) {
            const intersected = matchedCameraIds.filter((id) => locationCamIds.includes(id));
            matchedCameraIds = intersected.length > 0 ? intersected : locationCamIds;
            summary = `Entrance cameras with active movement`;
          } else if (locationCamIds.length > 0) {
            matchedCameraIds = locationCamIds;
            summary = `Cameras located in ${locationKeywords.slice(0, 2).join(" / ")}`;
          }
        }

        // Fallback: If no cameras matched specific criteria, fetch online/registered cameras
        if (matchedCameraIds.length === 0) {
          const fallbackRes = await this.pool.query(
            `SELECT c.id, c.name FROM cameras c
             WHERE c.tenant_id = $1 AND ${activeCamera('c')}
             ORDER BY (c.status = 'online') DESC, c.name ASC LIMIT 9`,
            [context.tenantId]
          ).catch(() => ({ rows: [] }));
          matchedCameraIds = fallbackRes.rows.map((r: any) => r.id);
          summary = `Active system cameras`;
        }
      }
    } catch (dbErr) {
      console.warn("[KryptonAI] controlLiveWall DB query error:", dbErr);
    }

    // 3. Determine optimal grid size based on matched camera count
    if (!detectedGridSize) {
      const count = matchedCameraIds.length;
      if (count <= 1) detectedGridSize = "1x1";
      else if (count <= 4) detectedGridSize = "2x2";
      else if (count <= 6) detectedGridSize = "1+5";
      else if (count <= 8) detectedGridSize = "1+7";
      else detectedGridSize = "3x3";
    }

    const count = matchedCameraIds.length;
    const msg = `Switched live wall to **${detectedGridSize}** layout displaying **${count} camera(s)** (${summary || query}).`;
    const msgMl = `ലൈവ് വാൾ **${detectedGridSize}** ലേഔട്ടിലേക്ക് മാറ്റി, **${count} ക്യാമറകൾ** ക്രമീകരിച്ചു (${summary || query}).`;

    return {
      action: "control_live_wall",
      cameraIds: matchedCameraIds,
      gridSize: detectedGridSize,
      filterCategory,
      filterSummary: summary || query,
      totalMatched: count,
      message: msg,
      messageMl: msgMl,
    };
  }

  private async lockDoors(args: any, context: GuardianContext) {
    const { locations, reason } = args;

    // In production, integrate with access control system
    // For now, log the action
    await this.pool.query(
      `INSERT INTO audit_log (tenant_id, user_id, action, details, timestamp)
       VALUES ($1, $2, 'door_lock_requested', $3, NOW())`,
      [context.tenantId, context.userId, JSON.stringify({ locations, reason })]
    );

    return {
      action: "lock_doors",
      locations,
      reason,
      status: "success",
      message: `Door lock command sent to: ${locations.join(", ")}`,
    };
  }

  private async dispatchGuard(args: any, context: GuardianContext) {
    const { location, priority, reason } = args;

    // Create dispatch task
    await this.pool.query(
      `INSERT INTO guard_dispatches (tenant_id, location, priority, reason, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', NOW())`,
      [context.tenantId, location, priority, reason || "KryptonAI recommendation"]
    );

    return {
      action: "dispatch_guard",
      location,
      priority,
      status: "dispatched",
      message: `${priority.toUpperCase()} priority guard dispatched to ${location}`,
    };
  }

  private async getAlertSummary(args: any, context: GuardianContext) {
    const { timeRange = "24h", severity } = args;

    const timeMap: Record<string, string> = {
      "1h": "1 hour",
      "4h": "4 hours",
      "24h": "24 hours",
      "7d": "7 days",
    };

    let query = `
      SELECT 
        severity, 
        COUNT(*) as count,
        string_agg(DISTINCT detection_type, ', ') as types
      FROM operational_alerts
      WHERE tenant_id = $1 
        AND occurred_at >= NOW() - INTERVAL '${timeMap[timeRange] || "24 hours"}'
    `;

    const params: any[] = [context.tenantId];

    if (severity) {
      query += ` AND severity = $2`;
      params.push(severity);
    }

    query += ` GROUP BY severity ORDER BY count DESC`;

    const { rows } = await this.pool.query(query, params);

    return {
      timeRange,
      severity: severity || "all",
      summary: rows,
      total: rows.reduce((sum: number, r: any) => sum + parseInt(r.count), 0),
    };
  }

  private async searchPerson(args: any, context: GuardianContext) {
    const { description, timeRange } = args;

    // Use AI Video Search service
    // For now, return placeholder
    return {
      action: "search_person",
      description,
      timeRange,
      status: "searching",
      message: "Initiating cross-camera person search...",
    };
  }

  private async getBranchStatus(args: any, context: GuardianContext) {
    const { branchIds } = args;

    let query = `
      SELECT 
        b.id,
        b.name,
        COUNT(DISTINCT c.id) as camera_count,
        COUNT(DISTINCT a.id) FILTER (WHERE a.status IN ('NEW', 'ACKNOWLEDGED')) as open_alerts
      FROM branches b
      LEFT JOIN resource_nodes rn ON rn.parent_id = b.id AND rn.node_type = 'camera'
      LEFT JOIN cameras c ON c.resource_node_id = rn.id
      LEFT JOIN operational_alerts a ON a.branch_id = b.id::text AND a.occurred_at >= NOW() - INTERVAL '24 hours'
      WHERE b.tenant_id = $1
    `;

    const params: any[] = [context.tenantId];

    if (branchIds && branchIds.length > 0) {
      query += ` AND b.id = ANY($2)`;
      params.push(branchIds);
    }

    query += ` GROUP BY b.id, b.name ORDER BY open_alerts DESC`;

    const { rows } = await this.pool.query(query, params);

    return {
      branches: rows.map((r: any) => ({
        id: r.id,
        name: r.name,
        cameras: parseInt(r.camera_count),
        edgeAgents: parseInt(r.edge_agent_count),
        openAlerts: parseInt(r.open_alerts),
        status: parseInt(r.open_alerts) > 0 ? "attention" : "normal",
      })),
    };
  }

  private async triggerAlarm(args: any, context: GuardianContext) {
    const { type, location, message } = args;

    // Log alarm trigger
    await this.pool.query(
      `INSERT INTO alarm_triggers (tenant_id, type, location, message, triggered_by, triggered_at)
       VALUES ($1, $2, $3, $4, $5, NOW())`,
      [context.tenantId, type, location, message, context.userId]
    );

    return {
      action: "trigger_alarm",
      type,
      location,
      status: "triggered",
      message: `${type.toUpperCase()} alarm triggered at ${location}`,
    };
  }

  private async analyzeIncident(args: any, context: GuardianContext) {
    const { incidentId, includeContext } = args;

    // Get incident details
    const { rows: incidents } = await this.pool.query(
      `SELECT * FROM incidents WHERE id = $1 AND tenant_id = $2`,
      [incidentId, context.tenantId]
    );

    if (incidents.length === 0) {
      return { error: "Incident not found" };
    }

    return {
      incident: incidents[0],
      analysis: "AI analysis in progress...",
      recommendations: [
        "Review surrounding camera footage",
        "Check for similar patterns in last 7 days",
        "Verify security protocol compliance",
      ],
    };
  }

  private async getCameraLocations(args: any, context: GuardianContext) {
    const { nearLocation, type = "all" } = args;

    let query = `
      SELECT c.id, rn.name, c.status
      FROM cameras c
      JOIN resource_nodes rn ON c.resource_node_id = rn.id
      WHERE rn.tenant_id = $1 AND ${activeCamera('c')}
    `;

    const params: any[] = [context.tenantId];

    if (type && type !== "all") {
      query += ` AND c.status = $${params.length + 1}`;
      params.push(type);
    }

    if (nearLocation) {
      query += ` AND (rn.name ILIKE $${params.length + 1} OR rn.path::text ILIKE $${params.length + 1})`;
      params.push(`%${nearLocation}%`);
    }

    query += ` ORDER BY rn.name LIMIT 50`;

    const { rows } = await this.pool.query(query, params).catch(() => ({ rows: [] }));

    return {
      cameras: rows,
      count: rows.length,
      filter: { nearLocation, type },
    };
  }

  /**
   * Fallback rule-based handler when OpenAI API key is not configured
   */
  private async processFallbackMessage(
    message: string,
    context: GuardianContext
  ): Promise<GuardianResponse> {
    const lower = message.toLowerCase().trim();
    const timestamp = new Date().toISOString();

    const guide = featureGuideResponse(message, Boolean(context.isGuest));
    if (guide) return guide;

    const cctvAnswer = cctvKnowledgeAnswer(message);
    if (cctvAnswer) return { message: cctvAnswer, type: "text", timestamp };

    // In pre-login guest mode, handle general questions and prompt login for module/operational data
    if (context.isGuest) {
      return this.processGuestFallbackMessage(message, timestamp);
    }

    // 0a. Live Wall Natural Language / AI Copilot Command (Prompt-Based Grid Switching)
    const isLiveWallQuery =
      (lower.includes("entrance") && (lower.includes("movement") || lower.includes("motion") || lower.includes("camera") || lower.includes("active"))) ||
      (lower.includes("warehouse") && (lower.includes("zone") || lower.includes("camera") || lower.includes("switch"))) ||
      (lower.includes("unauthorized") || lower.includes("unauthorised") || (lower.includes("breach") && lower.includes("access"))) ||
      lower.includes("zone b") ||
      lower.includes("zone a") ||
      (lower.includes("switch to") && (lower.includes("zone") || lower.includes("warehouse") || lower.includes("camera") || lower.includes("1+") || lower.includes("x") || lower.includes("grid"))) ||
      (lower.includes("show") && (lower.includes("entrance") || lower.includes("cameras with") || lower.includes("triggered") || lower.includes("offline camera"))) ||
      lower.includes("active movement") ||
      lower.includes("grid switching") ||
      lower.includes("live wall") ||
      lower.includes("camera kaanikku") ||
      lower.includes("switch cheyyu") ||
      lower.includes("grid maatu");

    if (isLiveWallQuery) {
      const wallResult = await this.controlLiveWall({ query: message }, context);
      return {
        message: wallResult.message,
        messageMl: wallResult.messageMl,
        type: "action",
        actions: [
          {
            function: "control_live_wall",
            parameters: { query: message },
            executed: true,
            result: wallResult,
          },
        ],
        suggestions: [
          "Show all entrance cameras with active movement",
          "Switch to Warehouse Zone B",
          "Show cameras that triggered unauthorized access in the last 15 minutes",
          "Switch to 1+5 layout",
        ],
        suggestionsMl: [
          "പ്രവേശന കവാടങ്ങളിലെ ചലനമുള്ള ക്യാമറകൾ കാണിക്കുക",
          "വെയർഹൗസ് സോൺ ബി-ലേക്ക് മാറുക",
          "കഴിഞ്ഞ 15 മിനിറ്റിൽ അനധികൃത പ്രവേശനം ഉണ്ടായ ക്യാമറകൾ കാണിക്കുക",
          "1+5 ലേഔട്ടിലേക്ക് മാറുക",
        ],
        timestamp,
      };
    }

    // 0. Navigation / Open Menu Command
    const navMatch = resolveAppRoute(lower);
    if (navMatch && isExplicitNavigationRequest(message)) {
      return {
        message: `Opening **${navMatch.label}** (${navMatch.href}). Navigating now...`,
        type: "action",
        actions: [
          {
            function: "navigate_to_menu",
            parameters: { target: navMatch.href, label: navMatch.label },
            executed: true,
            result: {
              href: navMatch.href,
              label: navMatch.label,
              category: navMatch.category,
              action: "navigate",
            },
          },
        ],
        suggestions: ["Executive MIS Reports", "Live Video Wall", "Incident Response", "System Settings"],
        timestamp,
      };
    }

    // List all menus command
    if (lower.includes("all menu") || lower.includes("list menu") || lower.includes("all pages") || lower.includes("navigation") || lower.includes("ella menu")) {
      return {
        message: "You can navigate to any of the following system modules using KryptonAI:",
        type: "action",
        actions: [
          {
            function: "navigate_to_menu",
            parameters: { target: "/reports/mis", label: "Executive MIS Reports" },
            executed: true,
            result: {
              href: "/reports/mis",
              label: "Executive MIS Reports & Graphs",
              category: "AUDIT & REPORTING",
              action: "navigate",
            },
          },
        ],
        suggestions: ["Open Live Video Wall", "Open Executive MIS Reports", "Open Face Recognition", "Open Camera Health"],
        timestamp,
      };
    }

    // Line Crossing / Virtual Tripwire query
    if (lower.includes("line cross") || lower.includes("tripwire") || lower.includes("line crossing") || lower.includes("boundary")) {
      return {
        message:
          "**Line Crossing (Virtual Tripwire) സെറ്റ് ചെയ്യുന്നത് എങ്ങനെ:**\n\n" +
          "1. **Navigation**: ഇടത് സൈഡ് മെനുവിൽ **Analytics ➔ Rules & Automation** (`/analytics/rules`) തിരഞ്ഞെടുക്കുക.\n" +
          "2. **Camera**: മുകളിൽ നിങ്ങളുടെ Branch & Camera സെലക്ട് ചെയ്യുക.\n" +
          "3. **Visual Zone Designer**: **Virtual Tripwire** ബട്ടൺ ക്ലിക്ക് ചെയ്യുക (അല്ലെങ്കിൽ ⚡ Door Ingress Tripwire പ്രീസെറ്റ്).\n" +
          "4. **Direction**: ലൈൻ ക്രോസ്സിംഗ് ദിശ തിരഞ്ഞെടുക്കുക (`A ➔ B`, `B ➔ A`, അല്ലെങ്കിൽ `A ⇄ B`).\n" +
          "5. **Draw Line**: ക്യാമറയുടെ ലൈവ് കാൻവാസിൽ 2 പോയിന്റുകൾ ക്ലിക്ക് ചെയ്ത് ലൈൻ വരയ്ക്കുക.\n" +
          "6. **Save**: താഴെ **Save Tripwire Definition** ക്ലിക്ക് ചെയ്യുക.\n" +
          "7. **Automation Rule**: താഴെയുള്ള റൂൾ ക്രിയേറ്ററിൽ Condition: **Line Crossing** കൊടുത്ത് Action (Alert, Siren, SMS) സേവ് ചെയ്യുക.\n\n" +
          "ഞാൻ ആ പേജ് ഇപ്പോൾ ഓപ്പൺ ചെയ്യണോ?",
        type: "action",
        actions: [
          {
            function: "navigate_to_menu",
            parameters: { target: "/analytics/rules", label: "AI Rules & Automation" },
            executed: true,
            result: { href: "/analytics/rules", label: "AI Rules & Automation", category: "INTELLIGENCE & AI", action: "navigate" },
          },
        ],
        suggestions: ["Open AI Rules & Automation", "Show camera status", "How to install Edge Agent"],
        timestamp,
      };
    }

    // Edge Agent installation and troubleshooting guidance comes from the current fleet workflow.
    if (
      (lower.includes("edge") || lower.includes("agent") || lower.includes("installer")) &&
      (lower.includes("install") || lower.includes("another") || lower.includes("work") || lower.includes("system") || lower.includes("setup"))
    ) {
      return {
        message: "**Edge Agent setup and troubleshooting**\n\n**Path:** Operations → Edge Agent Management\n**Open:** [Edge Agent Management](/operations/edge-fleet)\n\n1. Select the correct branch and start its current gateway activation or installer workflow.\n2. Use the installer package and one-time activation issued for that branch. Follow the instructions shown in the dashboard; do not reuse another branch installation.\n3. On the branch PC, approve the installer administrator prompt and confirm it can reach the configured control plane.\n4. If it remains offline, check the agent status in Edge Agent Management and inspect the installed agent logs under `C:\\Program Files\\KryptonVision\\Edge Agent`. Share the displayed error with the administrator.",
        type: "text",
        suggestions: ["Open Edge Fleet", "Open Branch Overview"],
        timestamp,
      };
    }

    // 1. Alerts query
    if (lower.includes("alert")) {
      try {
        const { rows } = await this.pool.query(
          `SELECT severity, COUNT(*) as count 
           FROM operational_alerts 
           WHERE tenant_id = $1 AND status IN ('NEW', 'ACKNOWLEDGED')
           GROUP BY severity`,
          [context.tenantId]
        ).catch(() => ({ rows: [] }));

        const total = rows.reduce((sum: number, r: any) => sum + parseInt(r.count || "0", 10), 0);
        if (total === 0) {
          return {
            message: "All clear! There are currently no open high-severity security alerts across your branches.",
            type: "text",
            timestamp,
          };
        }
        const breakdown = rows.map((r: any) => `${r.count} ${r.severity}`).join(", ");
        return {
          message: `There are currently ${total} open alerts requiring attention (${breakdown}).`,
          type: "action",
          actions: [
            {
              function: "get_alert_summary",
              parameters: { timeRange: "24h" },
              executed: true,
              result: { total, breakdown },
            },
          ],
          suggestions: ["Open Alert Command Center", "Show camera status"],
          timestamp,
        };
      } catch {
        return {
          message: "Alert monitoring is active. You can inspect all events in the Alert Command Center.",
          type: "text",
          timestamp,
        };
      }
    }

    // 2. Camera status query
    if (lower.includes("camera") || lower.includes("feed") || lower.includes("video")) {
      try {
        const { rows } = await this.pool.query(
          `SELECT c.status, COUNT(*) as count 
           FROM cameras c
           JOIN resource_nodes rn ON c.resource_node_id = rn.id
           WHERE rn.tenant_id = $1 AND ${activeCamera('c')}
           GROUP BY c.status`,
          [context.tenantId]
        ).catch(() => ({ rows: [] }));

        const total = rows.reduce((sum: number, r: any) => sum + parseInt(r.count || "0", 10), 0);
        const onlineRow = rows.find((r: any) => r.status === "online");
        const onlineCount = onlineRow ? parseInt(onlineRow.count || "0", 10) : 0;
        const offlineCount = total - onlineCount;

        return {
          message: `Camera Health: ${total} registered cameras (${onlineCount} online, ${offlineCount} offline/degraded).`,
          type: "action",
          actions: [
            {
              function: "get_camera_locations",
              parameters: {},
              executed: true,
              result: { total, online: onlineCount, offline: offlineCount },
            },
          ],
          suggestions: ["View All Cameras", "Live Video Wall"],
          timestamp,
        };
      } catch {
        return {
          message: "Camera streams are monitored continuously. You can view live video feeds in the Operations menu.",
          type: "text",
          timestamp,
        };
      }
    }

    // 3. System status / overview / branches
    if (lower.includes("status") || lower.includes("system") || lower.includes("health") || lower.includes("branch")) {
      return {
        message: "KryptonAI Security Status: Core control plane, media streaming pipelines, and perimeter monitoring are operational.",
        type: "action",
        actions: [
          {
            function: "get_branch_status",
            parameters: {},
            executed: true,
            result: { status: "NOMINAL" },
          },
        ],
        suggestions: ["Operational Health Dashboard", "Branch Operations"],
        timestamp,
      };
    }

    // 4. Help / default response
    const tip = this.openAIApiKey
      ? ""
      : "\n\n(Tip: Configure the GROQ_API_KEY or OPENAI_API_KEY environment variable to enable full generative conversational dialogue.)";
    if (/\?|\b(?:what|who|when|where|why|how|explain|define|calculate|translate)\b|(?:എന്താണ്|എങ്ങനെ|ആരാണ്)/i.test(message)) {
      return {
        message: this.openAIApiKey
          ? "I couldn't reach the AI knowledge service just now. Please try your question again shortly."
          : "General knowledge answers need the AI knowledge service. Ask an administrator to configure the KryptonAI provider, then try again.",
        type: "text",
        timestamp,
      };
    }
    return {
      message: `KryptonAI operational assistant is online.\n\nQuick commands:\n• "How many alerts are open?"\n• "Show me camera status"\n• "What is the system health?"${tip}`,
      type: "text",
      timestamp,
    };
  }

  /**
   * Dedicated fallback handler for pre-login / guest interactions
   */
  private processGuestFallbackMessage(
    message: string,
    timestamp: string
  ): GuardianResponse {
    const lower = message.toLowerCase().trim();
    const lang = detectLanguage(message);

    // 1. General greetings
    if (
      lower === "hi" ||
      lower === "hello" ||
      lower === "hey" ||
      lower.startsWith("hi ") ||
      lower.startsWith("hello ") ||
      lower.startsWith("hey ") ||
      lower.includes("namaskaram") ||
      lower.includes("namaste") ||
      lower.includes("namaskar") ||
      lower.includes("pranam") ||
      lower.includes("good morning") ||
      lower.includes("good evening") ||
      lower.includes("good afternoon") ||
      lower === "who are you" ||
      lower === "kryptonai"
    ) {
      if (lang === "hi") {
        return {
          message:
            "नमस्ते! मैं KryptonAI हूँ, आपका इंटेलिजेंट सुरक्षा और वीडियो एनालिटिक्स सहायक। आप मुझसे KryptonVision के फीचर्स, सीसीटीवी/वीएमएस अवधारणाओं या सामान्य ज्ञान के बारे में हिंदी में पूछ सकते हैं।\n\nलाइव कैमरे, अलर्ट या शाखा रिकॉर्ड देखने के लिए कृपया लॉगिन करें।",
          messageHi:
            "नमस्ते! मैं KryptonAI हूँ, आपका इंटेलिजेंट सुरक्षा और वीडियो एनालिटिक्स सहायक। आप मुझसे KryptonVision के फीचर्स, सीसीटीवी/वीएमएस अवधारणाओं या सामान्य ज्ञान के बारे में हिंदी में पूछ सकते हैं।\n\nलाइव कैमरे, अलर्ट या शाखा रिकॉर्ड देखने के लिए कृपया लॉगिन करें।",
          messageMl:
            "നമസ്കാരം! ഞാൻ KryptonAI ആണ്. KryptonVision ഫീച്ചറുകൾ, CCTV & VMS സംശയങ്ങൾ എന്നിവയെക്കുറിച്ച് എന്നോട് ചോദിക്കാം!\n\nലൈവ് ഫീഡുകൾ, അലർട്ടുകൾ എന്നിവ കാണാൻ ദയവായി ലോഗിൻ ചെയ്യുക.",
          type: "text",
          suggestions: [
            "KryptonVision क्या है?",
            "कौन-कौन से AI फीचर्स हैं?",
            "कौन से कैमरे समर्थित हैं?",
            "साइन इन कैसे करें?",
          ],
          suggestionsHi: [
            "KryptonVision क्या है?",
            "कौन-कौन से AI फीचर्स हैं?",
            "कौन से कैमरे समर्थित हैं?",
            "साइन इन कैसे करें?",
          ],
          suggestionsMl: [
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Supported cameras ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          timestamp,
        };
      }
      if (lang === "ml") {
        return {
          message:
            "നമസ്കാരം! ഞാൻ KryptonAI ആണ്. KryptonVision ഫീച്ചറുകൾ, CCTV & VMS സാങ്കേതിക സംശയങ്ങൾ എന്നിവയെക്കുറിച്ച് എന്നോട് ചോദിക്കാം!\n\nലൈവ് ക്യാമറകൾ, അലർട്ടുകൾ എന്നിവ കാണാൻ ദയവായി അക്കൗണ്ടിലേക്ക് ലോഗിൻ ചെയ്യുക.",
          messageMl:
            "നമസ്കാരം! ഞാൻ KryptonAI ആണ്. KryptonVision ഫീച്ചറുകൾ, CCTV & VMS സാങ്കേതിക സംശയങ്ങൾ എന്നിവയെക്കുറിച്ച് എന്നോട് ചോദിക്കാം!\n\nലൈവ് ക്യാമറകൾ, അലർട്ടുകൾ എന്നിവ കാണാൻ ദയവായി അക്കൗണ്ടിലേക്ക് ലോഗിൻ ചെയ്യുക.",
          messageHi:
            "नमस्ते! मैं KryptonAI हूँ, आपका इंटेलिजेंट सुरक्षा और वीडियो एनालिटिक्स सहायक।",
          type: "text",
          suggestions: [
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Supported cameras ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          suggestionsMl: [
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Supported cameras ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          suggestionsHi: [
            "KryptonVision क्या है?",
            "कौन-कौन से AI फीचर्स हैं?",
            "कौन से कैमरे समर्थित हैं?",
            "साइन इन कैसे करें?",
          ],
          timestamp,
        };
      }
      return {
        message:
          "Hello! I am KryptonAI. Ask me about KryptonVision, CCTV and VMS concepts, or simple general knowledge in English, Malayalam, Hindi, or Manglish.\n\nTo view live feeds, alerts, or your organization's records, please sign in with your account.",
        messageMl:
          "നമസ്കാരം! ഞാൻ KryptonAI ആണ്. KryptonVision ഫീച്ചറുകൾ, CCTV & VMS സാങ്കേതിക സംശയങ്ങൾ എന്നിവയെക്കുറിച്ച് ചോദിക്കാം!",
        messageHi:
          "नमस्ते! मैं KryptonAI हूँ। KryptonVision फीचर्स और सीसीटीवी के बारे में बेझिझक पूछें।",
        type: "text",
        suggestions: [
          "What is KryptonVision?",
          "What AI features are available?",
          "Which cameras are supported?",
          "How do I sign in?",
        ],
        suggestionsMl: [
          "KryptonVision എന്താണ്?",
          "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
          "Supported cameras ഏതൊക്കെ?",
          "Sign in എങ്ങനെ ചെയ്യും?",
        ],
        suggestionsHi: [
          "KryptonVision क्या है?",
          "कौन-कौन से AI फीचर्स हैं?",
          "कौन से कैमरे समर्थित हैं?",
          "साइन इन कैसे करें?",
        ],
        timestamp,
      };
    }

    // 2. Questions about how to sign in / login / reset password / voice login
    if (
      lower.includes("how to login") ||
      lower.includes("how to sign in") ||
      lower.includes("sign in") ||
      lower.includes("login") ||
      lower.includes("log in") ||
      lower.includes("password") ||
      lower.includes("otp") ||
      lower.includes("voice login") ||
      lower.includes("voice id") ||
      lower.includes("voice auth") ||
      lower.includes("credentials") ||
      lower.includes("forgot") ||
      lower.includes("login kaise") ||
      lower.includes("sign in kaise") ||
      lower.includes("login engane") ||
      lower.includes("sign in engane")
    ) {
      if (lang === "hi") {
        return {
          message:
            "**KryptonVision में साइन इन कैसे करें:**\n\n• **मानक लॉगिन:** लॉगिन स्क्रीन पर अपना यूज़रनेम और पासवर्ड दर्ज करें और **Sign In** दबाएं।\n• **वॉयस आईडी लॉगिन:** यदि आपने वॉयस पासफ़्रेज़ एनरोल किया है, तो **Voice Login** बटन दबाकर अपना पासफ़्रेज़ बोलें।\n• **पासवर्ड भूल गए:** पासवर्ड रीसेट के लिए सुरक्षित ओटीपी प्राप्त करने हेतु **Forgot Password** पर क्लिक करें।\n• **नया खाता:** नया खाता बनवाने के लिए अपने सुरक्षा व्यवस्थापक से संपर्क करें।",
          messageHi:
            "**KryptonVision में साइन इन कैसे करें:**\n\n• **मानक लॉगिन:** लॉगिन स्क्रीन पर अपना यूज़रनेम और पासवर्ड दर्ज करें और **Sign In** दबाएं।\n• **वॉयस आईडी लॉगिन:** यदि आपने वॉयस पासफ़्रेज़ एनरोल किया है, तो **Voice Login** बटन दबाकर अपना पासफ़्रेज़ बोलें।\n• **पासवर्ड भूल गए:** पासवर्ड रीसेट के लिए सुरक्षित ओटीपी प्राप्त करने हेतु **Forgot Password** पर क्लिक करें।",
          type: "text",
          suggestions: [
            "KryptonVision क्या है?",
            "कौन से AI फीचर्स हैं?",
            "कौन से कैमरे समर्थित हैं?",
          ],
          suggestionsHi: [
            "KryptonVision क्या है?",
            "कौन से AI फीचर्स हैं?",
            "कौन से कैमरे समर्थित हैं?",
          ],
          timestamp,
        };
      }
      if (lang === "ml") {
        return {
          message:
            "**KryptonVision-ൽ Sign In ചെയ്യുന്ന വിധം:**\n\n• **Standard Login:** Username-ഉം Password-ഉം നൽകി **Sign In** click ചെയ്യുക.\n• **Voice ID Login:** വോയ്സ് എൻറോൾ ചെയ്തിട്ടുണ്ടെങ്കിൽ **Voice Login** ക്ലിക്ക് ചെയ്ത് പാസ്ഫ്രേസ് പറയുക.\n• **Forgot Password:** OTP വഴി പാസ്‌വേഡ് റീസെറ്റ് ചെയ്യാൻ **Forgot Password** ഉപയോഗിക്കാം.\n• **New Account:** പുതിയ അക്കൗണ്ടിനായി സിസ്റ്റം അഡ്മിനിസ്ട്രേറ്ററെ സമീപിക്കുക.",
          messageMl:
            "**KryptonVision-ൽ Sign In ചെയ്യുന്ന വിധം:**\n\n• **Standard Login:** Username-ഉം Password-ഉം നൽകി **Sign In** click ചെയ്യുക.\n• **Voice ID Login:** വോയ്സ് എൻറോൾ ചെയ്തിട്ടുണ്ടെങ്കിൽ **Voice Login** ക്ലിക്ക് ചെയ്ത് പാസ്ഫ്രേസ് പറയുക.",
          type: "text",
          suggestions: [
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Supported cameras ഏതൊക്കെ?",
          ],
          suggestionsMl: [
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Supported cameras ഏതൊക്കെ?",
          ],
          timestamp,
        };
      }
      return {
        message:
          "**How to Sign In to KryptonVision:**\n\n• **Standard Login:** Enter your Username and Password on the login screen and click **Sign In**.\n• **Voice ID Login:** If your profile has an enrolled voice passphrase, click the **Voice Login** button to authenticate by speaking your phrase.\n• **Forgot Password:** Click **Forgot Password** on the login form to receive a secure OTP for password reset.\n• **New Account:** Contact your organization's security administrator to get your account provisioned.",
        type: "text",
        suggestions: [
          "What is KryptonVision?",
          "What AI features are available?",
          "Which cameras are supported?",
        ],
        timestamp,
      };
    }

    // 3. Supported camera brands / hardware / protocols
    if (
      lower.includes("supported camera") ||
      lower.includes("camera support") ||
      lower.includes("which camera") ||
      lower.includes("camera brand") ||
      lower.includes("vendor") ||
      lower.includes("hardware") ||
      lower.includes("rtsp") ||
      lower.includes("onvif") ||
      lower.includes("hikvision") ||
      lower.includes("dahua") ||
      lower.includes("cp plus") ||
      lower.includes("axis") ||
      lower.includes("uniview") ||
      lower.includes("hanwha") ||
      lower.includes("camera kaun") ||
      lower.includes("camera ethokke")
    ) {
      if (lang === "hi") {
        return {
          message:
            "**समर्थित सीसीटीवी कैमरे एवं प्रोटोकॉल (Supported Cameras & Protocols):**\n\n• **मानक प्रोटोकॉल:** मानक RTSP स्ट्रीमिंग और ONVIF (Profiles S, G, एवं T) का पूर्ण समर्थन।\n• **समर्थित ब्रांड्स:** Hikvision, Dahua, CP Plus, Uniview, Axis Communications, Hanwha Vision, और कोई भी ONVIF-अनुरूप IP कैमरा/NVR/DVR।\n• **एज गेटवे:** स्थानीय हार्डवेयर (Jetson, Intel x86, Raspberry Pi 4/5) पर 24/7 ऑफ़लाइन रिकॉर्डिंग और नेटवर्क आने पर सुरक्षित सिंक।",
          messageHi:
            "**समर्थित सीसीटीवी कैमरे एवं प्रोटोकॉल:**\n\n• **मानक प्रोटोकॉल:** RTSP एवं ONVIF (Profile S/G/T)।\n• **ब्रांड्स:** Hikvision, Dahua, CP Plus, Axis, Uniview, Hanwha।",
          type: "text",
          suggestions: [
            "KryptonVision क्या है?",
            "AI फीचर्स कौन-कौन से हैं?",
            "साइन इन कैसे करें?",
          ],
          suggestionsHi: [
            "KryptonVision क्या है?",
            "AI फीचर्स कौन-कौन से हैं?",
            "साइन इन कैसे करें?",
          ],
          timestamp,
        };
      }
      if (lang === "ml") {
        return {
          message:
            "**Supported CCTV Cameras & Protocols:**\n\n• **Standard Protocols:** RTSP streaming, ONVIF (Profiles S, G, T) പൂർണ്ണ പിന്തുണ.\n• **Supported Hardware Brands:** Hikvision, Dahua, CP Plus, Uniview, Axis Communications, Hanwha Vision എന്നിവയും എല്ലാ ONVIF IP ക്യാമറകളും/NVRകളും.\n• **Edge Gateways:** Jetson, Intel x86, Raspberry Pi ഡിവൈസുകളിൽ offline video buffering പിന്തുണയുണ്ട്.",
          messageMl:
            "**Supported CCTV Cameras & Protocols:**\n\n• **Protocols:** RTSP, ONVIF (Profile S/G/T).\n• **Brands:** Hikvision, Dahua, CP Plus, Axis, Uniview, Hanwha.",
          type: "text",
          suggestions: [
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          suggestionsMl: [
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          timestamp,
        };
      }
      return {
        message:
          "**Supported CCTV Cameras & Protocols:**\n\n• **Standard Protocols:** Full support for standard RTSP streaming and ONVIF (Profiles S, G, and T).\n• **Supported Hardware Brands:** Hikvision, Dahua, CP Plus, Uniview, Axis Communications, Hanwha Vision, and any ONVIF-compliant IP cameras / NVRs / DVRs.\n• **Edge Gateways:** Works with local edge appliances (Jetson, Intel x86, Raspberry Pi 4/5) with automated offline video buffering and encrypted sync.",
        type: "text",
        suggestions: [
          "What is KryptonVision?",
          "What AI features are available?",
          "How do I sign in?",
        ],
        timestamp,
      };
    }

    // 4. Platform overview / What is KryptonVision / Sentinel Grid
    if (
      lower.includes("what is kryptonvision") ||
      lower.includes("what is sentinel grid") ||
      lower.includes("about platform") ||
      lower.includes("about kryptonvision") ||
      lower.includes("tell me about") ||
      lower.includes("kryptonvision kya hai") ||
      lower.includes("kryptonvision enthanu")
    ) {
      if (lang === "hi") {
        return {
          message:
            "**KryptonVision** (Sentinel Grid द्वारा संचालित) एक एंटरप्राइज़ AI भौतिक सुरक्षा और वीडियो निगरानी प्रबंधन प्लेटफ़ॉर्म है।\n\n**प्रमुख क्षमताएं:**\n1. **एज AI वीडियो एनालिटिक्स:** लाइव चेहरा पहचान (Face Recognition), घुसपैठ पहचान, भीड़ घनत्व (Crowd) और ANPR।\n2. **मल्टी-ब्रांच कंट्रोल सेंटर:** सभी शाखाओं के लिए केंद्रीकृत लाइव वीडियो वॉल, पीटीजेड नियंत्रण और एकीकृत अलर्ट।\n3. **बैंकिंग एवं एनबीएफसी अनुपालन:** वॉल्ट दोहरी निगरानी (Dual-Custody) टाइमर, कैश काउंटर सुरक्षा और दैनिक एमआईएस रिपोर्ट।\n4. **उच्च उपलब्धता एज आर्किटेक्चर:** इंटरनेट बंद होने पर भी स्थानीय रिकॉर्डिंग और नेटवर्क आने पर सुरक्षित क्लाउड सिंक।",
          messageHi:
            "**KryptonVision** एक एंटरप्राइज़ AI सुरक्षा एवं वीडियो प्रबंधन प्लेटफ़ॉर्म है।",
          type: "text",
          suggestions: [
            "AI फीचर्स कौन-कौन से हैं?",
            "कौन से कैमरे समर्थित हैं?",
            "साइन इन कैसे करें?",
          ],
          suggestionsHi: [
            "AI फीचर्स कौन-कौन से हैं?",
            "कौन से कैमरे समर्थित हैं?",
            "साइन इन कैसे करें?",
          ],
          timestamp,
        };
      }
      if (lang === "ml") {
        return {
          message:
            "**KryptonVision** (Sentinel Grid) ഒരു എന്റർപ്രൈസ് AI ഫിസിക്കൽ സെക്യൂരിറ്റി & വീഡിയോ സർവൈലൻസ് പ്ലാറ്റ്‌ഫോമാണ്.\n\n**പ്രധാന പ്രത്യേകതകൾ:**\n1. **Edge AI Analytics:** ഫേസ് റെക്കഗ്നിഷൻ, ഇൻട്രൂഷൻ ഡിറ്റക്ഷൻ, ക്രൗഡ്, ANPR.\n2. **Multi-Branch Control:** എല്ലാ ശാഖകളിലെയും ക്യാമറകൾ ഒരുമിച്ച് കാണാനുള്ള ലൈവ് വീഡിയോ വാൾ.\n3. **Banking/NBFC Compliance:** വോൾട്ട് ഡ്യുവൽ-കസ്റ്റഡി, ക്യാഷ് കൗണ്ടർ സുരക്ഷ, ഓട്ടോമേറ്റഡ് MIS റിപ്പോർട്ടുകൾ.\n4. **Edge Architecture:** ഇന്റർനെറ്റ് ഇല്ലെങ്കിലും ലോക്കൽ റെക്കോർഡിംഗ്, കണക്റ്റിവിറ്റി വരുമ്പോൾ ക്ലൗഡ് സിങ്ക്.",
          messageMl:
            "**KryptonVision** ഒരു എന്റർപ്രൈസ് AI ഫിസിക്കൽ സെക്യൂരിറ്റി പ്ലാറ്റ്‌ഫോമാണ്.",
          type: "text",
          suggestions: [
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Supported cameras ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          suggestionsMl: [
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
            "Supported cameras ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          timestamp,
        };
      }
      return {
        message:
          "**KryptonVision** (powered by Sentinel Grid) is an enterprise AI physical security and video surveillance management platform.\n\nKey capabilities include:\n1. **Edge AI Video Analytics:** Real-time facial recognition, intrusion detection, crowd density, and ANPR.\n2. **Multi-Branch Control Center:** Centralized live video walls, PTZ control, and unified alert escalation across all branches.\n3. **Banking & NBFC Compliance:** Vault dual-custody timers, cash counter security monitoring, and automated daily surveillance reports.\n4. **High Availability Edge Architecture:** Offline video recording and automatic synchronization when network resumes.",
        type: "text",
        suggestions: [
          "What AI features are available?",
          "Which cameras are supported?",
          "How do I sign in?",
        ],
        timestamp,
      };
    }

    // 5. Features / AI analytics capabilities query
    const isFeatureQuery =
      lower.includes("feature") ||
      lower.includes("analytic") ||
      lower.includes("capability") ||
      lower.includes("capabilities") ||
      lower.includes("what can") ||
      lower.includes("what does") ||
      lower.includes("what features") ||
      lower.includes("ai features") ||
      lower.includes("enthellam") ||
      lower.includes("enthokke") ||
      lower.includes("features enthaanu") ||
      lower.includes("features unduo") ||
      lower.includes("features undo") ||
      lower.includes("features ullathu") ||
      lower.includes("फीचर्स") ||
      lower.includes("फीचर") ||
      lower.includes("खूबियां") ||
      lower.includes("सुविधा") ||
      lower.includes("സവിശേഷത") ||
      lower.includes("ഫീച്ചർ") ||
      lower.includes("ഫീച്ചറുകൾ") ||
      (lower.includes("kya") && lower.includes("hai")) ||
      (lower.includes("kya") && lower.includes("features")) ||
      (lower.includes("features") && lower.includes("batao"));

    if (isFeatureQuery) {
      if (lang === "hi") {
        return {
          message:
            "**KryptonVision के AI और सुरक्षा फीचर्स (AI & Security Features):**\n\nइस प्लेटफ़ॉर्म में 12 प्रमुख एंटरप्राइज़ सुरक्षा क्षमताएं शामिल हैं:",
          messageHi:
            "**KryptonVision के AI और सुरक्षा फीचर्स (AI & Security Features):**\n\nइस प्लेटफ़ॉर्म में 12 प्रमुख एंटरप्राइज़ सुरक्षा क्षमताएं शामिल हैं:",
          messageMl:
            "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**\n\nഈ platform-ൽ ഉള്ള പ്രധാന capabilities:",
          type: "feature_cards",
          cards: KRYPTON_PRODUCT_FEATURES,
          suggestions: [
            "KryptonVision क्या है?",
            "कौन से कैमरे समर्थित हैं?",
            "साइन इन कैसे करें?",
          ],
          suggestionsHi: [
            "KryptonVision क्या है?",
            "कौन से कैमरे समर्थित हैं?",
            "साइन इन कैसे करें?",
          ],
          suggestionsMl: [
            "KryptonVision എന്താണ്?",
            "Supported cameras ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          timestamp,
        };
      }
      if (lang === "ml") {
        return {
          message:
            "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**\n\nഈ platform-ൽ ഉള്ള പ്രധാന capabilities:",
          messageMl:
            "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**\n\nഈ platform-ൽ ഉള്ള പ്രധാന capabilities:",
          messageHi:
            "**KryptonVision के AI और सुरक्षा फीचर्स:**",
          type: "feature_cards",
          cards: KRYPTON_PRODUCT_FEATURES,
          suggestions: [
            "What is KryptonVision?",
            "Which cameras are supported?",
            "How do I sign in?",
          ],
          suggestionsMl: [
            "KryptonVision എന്താണ്?",
            "Supported cameras ഏതൊക്കെ?",
            "Sign in എങ്ങനെ ചെയ്യും?",
          ],
          suggestionsHi: [
            "KryptonVision क्या है?",
            "कौन से कैमरे समर्थित हैं?",
            "साइन इन कैसे करें?",
          ],
          timestamp,
        };
      }
      return {
        message:
          "**KryptonVision AI & Security Capabilities:**\n\nHere are the 12 core platform features available across all branches:",
        messageMl:
          "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**",
        messageHi:
          "**KryptonVision के AI और सुरक्षा फीचर्स:**",
        type: "feature_cards",
        cards: KRYPTON_PRODUCT_FEATURES,
        suggestions: [
          "What is KryptonVision?",
          "Which cameras are supported?",
          "How do I sign in?",
        ],
        suggestionsMl: [
          "KryptonVision എന്താണ്?",
          "Supported cameras ഏതൊക്കെ?",
          "Sign in എങ്ങനെ ചെയ്യും?",
        ],
        suggestionsHi: [
          "KryptonVision क्या है?",
          "कौन से कैमरे समर्थित हैं?",
          "साइन इन कैसे करें?",
        ],
        timestamp,
      };
    }

    // ── SPECIFIC FEATURE GUIDES (MULTILINGUAL) ──────────────────────────

    // 1. Line Crossing / Virtual Tripwire / Polygon Zone
    if (
      lower.includes("line cross") ||
      lower.includes("tripwire") ||
      lower.includes("polygon") ||
      lower.includes("sterile zone") ||
      lower.includes("restricted zone") ||
      lower.includes("लाइन क्रॉस") ||
      lower.includes("ट्रिपवायर") ||
      lower.includes("പോളിഗോൺ") ||
      lower.includes("ലൈൻ ക്രോസിംഗ്")
    ) {
      const isPolygon =
        lower.includes("polygon") ||
        lower.includes("sterile") ||
        lower.includes("restricted") ||
        lower.includes("പോളിഗോൺ") ||
        lower.includes("पॉलीगॉन");
      const guideKey = isPolygon ? "polygon_zone" : "line_crossing";
      const guide = getLocalizedGuide(guideKey, lang, timestamp);
      if (guide) return guide;
    }

    // 2. Edge Agent setup & installation
    if (
      (lower.includes("edge") || lower.includes("agent") || lower.includes("installer") || lower.includes("एजेंट")) &&
      (lower.includes("install") || lower.includes("setup") || lower.includes("work") || lower.includes("ഇൻസ്റ്റാൾ") || lower.includes("इंस्टॉल"))
    ) {
      const guide = getLocalizedGuide("edge_agent", lang, timestamp);
      if (guide) return guide;
    }

    // 3. Facial Recognition
    if (
      lower.includes("face recognition") ||
      lower.includes("facial") ||
      lower.includes("face id") ||
      lower.includes("watchlist") ||
      lower.includes("blacklist") ||
      lower.includes("mukham") ||
      lower.includes("चेहरा पहचान") ||
      lower.includes("ഫേസ് റെക്കഗ്നിഷൻ")
    ) {
      const guide = getLocalizedGuide("facial_recognition", lang, timestamp);
      if (guide) return guide;
    }

    // 4. ANPR (Vehicle License Plate Recognition)
    if (
      lower.includes("anpr") ||
      lower.includes("number plate") ||
      lower.includes("license plate") ||
      lower.includes("vehicle") ||
      lower.includes("vahana") ||
      lower.includes("गाड़ी नंबर") ||
      lower.includes("वाहन") ||
      lower.includes("നമ്പർ പ്ലേറ്റ്")
    ) {
      const guide = getLocalizedGuide("anpr", lang, timestamp);
      if (guide) return guide;
    }

    // 5. Crowd & Loitering Analytics
    if (
      lower.includes("crowd") ||
      lower.includes("loitering") ||
      lower.includes("overcrowding") ||
      lower.includes("footfall") ||
      lower.includes("भीड़") ||
      lower.includes("ठहराव") ||
      lower.includes("ക്രൗഡ്") ||
      lower.includes("ലോയ്‌റ്ററിംഗ്")
    ) {
      const guide = getLocalizedGuide("crowd_loitering", lang, timestamp);
      if (guide) return guide;
    }

    // 6. Banking & NBFC Vault Operations
    if (
      lower.includes("vault") ||
      lower.includes("cash counter") ||
      lower.includes("banking") ||
      lower.includes("nbfc") ||
      lower.includes("dual custody") ||
      lower.includes("teller") ||
      lower.includes("strong room") ||
      lower.includes("strongroom") ||
      lower.includes("वॉल्ट") ||
      lower.includes("कैश काउंटर") ||
      lower.includes("വോൾട്ട്") ||
      lower.includes("ക്യാഷ് കൗണ്ടർ")
    ) {
      const guide = getLocalizedGuide("nbfc_banking", lang, timestamp);
      if (guide) return guide;
    }

    // 7. Natural Language AI Video Search (VLM / Video RAG)
    if (
      lower.includes("video search") ||
      lower.includes("search footage") ||
      lower.includes("find person") ||
      lower.includes("ai search") ||
      lower.includes("smart search") ||
      lower.includes("forensic search") ||
      lower.includes("वीडियो सर्च") ||
      lower.includes("खोज") ||
      lower.includes("വീഡിയോ സെർച്ച്")
    ) {
      const guide = getLocalizedGuide("ai_video_search", lang, timestamp);
      if (guide) return guide;
    }

    // 8. Incident Management & SOPs
    if (
      lower.includes("incident") ||
      lower.includes("create incident") ||
      lower.includes("guard dispatch") ||
      lower.includes("sop") ||
      lower.includes("घटना") ||
      lower.includes("इंसिडेंट") ||
      lower.includes("ഇൻസിഡന്റ്")
    ) {
      const guide = getLocalizedGuide("incident_management", lang, timestamp);
      if (guide) return guide;
    }

    // 9. Voice Biometric Authentication (Voice ID)
    if (
      lower.includes("voice auth") ||
      lower.includes("voice login") ||
      lower.includes("voice id") ||
      lower.includes("voice passphrase") ||
      lower.includes("voice biometric") ||
      lower.includes("shabdam") ||
      lower.includes("वॉयस लॉगिन") ||
      lower.includes("വോയ്സ് ലോഗിൻ")
    ) {
      const guide = getLocalizedGuide("voice_id", lang, timestamp);
      if (guide) return guide;
    }

    // 10. Evidence Export & Chain of Custody
    if (
      lower.includes("evidence") ||
      lower.includes("export clip") ||
      lower.includes("chain of custody") ||
      lower.includes("साक्ष्य") ||
      lower.includes("एविडेंस") ||
      lower.includes("തെളിവ്") ||
      lower.includes("എവിഡൻസ്")
    ) {
      const guide = getLocalizedGuide("evidence_export", lang, timestamp);
      if (guide) return guide;
    }

    // 11. Executive MIS Reports & Graphs
    if (
      lower.includes("mis report") ||
      lower.includes("executive report") ||
      lower.includes("daily report") ||
      lower.includes("surveillance report") ||
      lower.includes("एमआईएस रिपोर्ट") ||
      lower.includes("റിപ്പോർട്ട്")
    ) {
      const guide = getLocalizedGuide("mis_reports", lang, timestamp);
      if (guide) return guide;
    }

    // 12. Fall Detection
    if (
      lower.includes("fall detection") ||
      lower.includes("fall alert") ||
      lower.includes("veezhcha") ||
      lower.includes("गिरने") ||
      lower.includes("വീഴ്ച")
    ) {
      const guide = getLocalizedGuide("fall_detection", lang, timestamp);
      if (guide) return guide;
    }

    // 13. Camera Tamper & Defocus
    if (
      lower.includes("tamper") ||
      lower.includes("defocus") ||
      lower.includes("camera covered") ||
      lower.includes("camera blocked") ||
      lower.includes("छेड़छाड़") ||
      lower.includes("തടസ്സം")
    ) {
      const guide = getLocalizedGuide("camera_tamper", lang, timestamp);
      if (guide) return guide;
    }

    // Protected operational data warning
    const isModuleOrOperationalRequest =
      lower.includes("camera") ||
      lower.includes("feed") ||
      lower.includes("stream") ||
      lower.includes("video wall") ||
      lower.includes("live video") ||
      lower.includes("alert") ||
      lower.includes("incident") ||
      lower.includes("branch") ||
      lower.includes("vault") ||
      lower.includes("teller") ||
      lower.includes("cash") ||
      lower.includes("guard") ||
      lower.includes("door") ||
      lower.includes("lock") ||
      lower.includes("show me") ||
      lower.includes("dikhao") ||
      lower.includes("kaanik") ||
      lower.includes("दिखाओ");

    if (isModuleOrOperationalRequest) {
      if (lang === "hi") {
        return {
          message:
            "🔒 **लॉगिन आवश्यक है (Authentication Required)**\n\nलाइव कैमरा फीड, सुरक्षा अलर्ट, वॉल्ट स्थिति या परिचालन डेटा देखने के लिए कृपया अपने KryptonVision खाते में लॉगिन करें।\n\nलॉगिन करने के बाद आपको अपनी संस्था के सभी लाइव कैमरों और एनालिटिक्स रिपोर्ट तक पूरी पहुँच प्राप्त होगी।",
          messageHi:
            "🔒 **लॉगिन आवश्यक है**\n\nलाइव कैमरा फीड और सुरक्षा अलर्ट देखने के लिए कृपया साइन इन करें।",
          type: "text",
          suggestions: [
            "साइन इन कैसे करें?",
            "KryptonVision क्या है?",
            "कौन से AI फीचर्स हैं?",
          ],
          suggestionsHi: [
            "साइन इन कैसे करें?",
            "KryptonVision क्या है?",
            "कौन से AI फीचर्स हैं?",
          ],
          timestamp,
        };
      }
      if (lang === "ml") {
        return {
          message:
            "🔒 **Authentication Required**\n\nലൈവ് ക്യാമറ ഫീഡുകൾ, സെക്യൂരിറ്റി അലർട്ടുകൾ, വോൾട്ട് വിവരങ്ങൾ എന്നിവ കാണാൻ ദയവായി നിങ്ങളുടെ KryptonVision അക്കൗണ്ടിലേക്ക് സൈൻ ഇൻ ചെയ്യുക.\n\nലോഗിൻ ചെയ്ത ശേഷം നിങ്ങളുടെ സ്ഥാപനത്തിലെ എല്ലാ ലൈവ് ക്യാമറകളും അനലിറ്റിക്സ് റിപ്പോർട്ടുകളും ലഭ്യമാകും.",
          messageMl:
            "🔒 **ലോഗിൻ ചെയ്യുക**\n\nലൈവ് ക്യാമറ ഫീഡുകൾ കാണാൻ ദയവായി ലോഗിൻ ചെയ്യുക.",
          type: "text",
          suggestions: [
            "Sign in എങ്ങനെ ചെയ്യും?",
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
          ],
          suggestionsMl: [
            "Sign in എങ്ങനെ ചെയ്യും?",
            "KryptonVision എന്താണ്?",
            "AI ഫീച്ചറുകൾ ഏതൊക്കെ?",
          ],
          timestamp,
        };
      }
      return {
        message:
          "🔒 **Authentication Required**\n\nTo view live camera feeds, branch status, security alerts, and operational module data, please sign in to your KryptonVision account on the login page.\n\nOnce logged in, you will have secure access to your organization's monitoring modules, active surveillance streams, and analytics reports.",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "What is KryptonVision?",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // General fallback for unauthenticated guest
    if (/\?|\b(?:what|who|when|where|why|how|explain|define|calculate|translate)\b|(?:എന്താണ്|എങ്ങനെ|ആരാണ്)|(?:क्या|कैसे|कहाँ|क्यों)/i.test(message)) {
      return {
        message:
          "I couldn't reach the AI knowledge service just now. Please try your question again shortly or ask about KryptonVision platform features.",
        type: "text",
        timestamp,
      };
    }

    return {
      message:
        "I am KryptonAI, your security operations assistant. In pre-login mode, I can answer general questions about KryptonVision platform features, supported camera hardware, and signing in.\n\nTo view organization-specific module data, live camera streams, or incident queues, please sign in with your account credentials or Voice ID.",
      type: "text",
      suggestions: [
        "What is KryptonVision?",
        "What AI features are available?",
        "Which cameras are supported?",
        "How do I sign in?",
      ],
      timestamp,
    };
  }

  /**
   * Generate proactive suggestions based on current state
   */
  async generateProactiveSuggestions(context: GuardianContext): Promise<string[]> {
    const suggestions: string[] = [];

    try {
      if (this.pool && typeof this.pool.query === "function") {
        // Check for open operational alerts
        const openAlertsRes = await this.pool.query(
          `SELECT COUNT(*) as count FROM operational_alerts 
           WHERE tenant_id = $1 AND status IN ('NEW', 'ACKNOWLEDGED') AND severity IN ('high', 'critical')`,
          [context.tenantId]
        ).catch(() => ({ rows: [] }));

        const openCount = parseInt(openAlertsRes?.rows?.[0]?.count || "0", 10);
        if (openCount > 0) {
          suggestions.push(`You have ${openCount} high-priority alert${openCount > 1 ? "s" : ""} requiring attention`);
        }

        // Check for offline cameras
        const offlineCamerasRes = await this.pool.query(
          `SELECT COUNT(*) as count FROM cameras c
           JOIN resource_nodes rn ON c.resource_node_id = rn.id
           WHERE rn.tenant_id = $1 AND c.status = 'offline'
             AND ${activeCamera('c')}`,
          [context.tenantId]
        ).catch(() => ({ rows: [] }));

        const offlineCount = parseInt(offlineCamerasRes?.rows?.[0]?.count || "0", 10);
        if (offlineCount > 0) {
          suggestions.push(`${offlineCount} camera${offlineCount > 1 ? "s are" : " is"} currently offline`);
        }
      }
    } catch {
      // Ignore database errors and use safe defaults
    }

    if (suggestions.length === 0) {
      suggestions.push("Check all cameras across active branches");
      suggestions.push("Review open operational security alerts");
      suggestions.push("Show system operational health overview");
    }

    return suggestions;
  }

  /**
   * Clear conversation history for a session
   */
  clearSession(sessionId: string): void {
    this.conversationHistory.delete(sessionId);
    this.lastFeatureRoute.delete(sessionId);
  }
}
