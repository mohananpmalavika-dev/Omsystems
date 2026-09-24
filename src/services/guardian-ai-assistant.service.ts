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
  { label: "Users & RBAC", href: "/admin/users", category: "ADMINISTRATION", keywords: ["users", "rbac", "user management", "accounts", "permissions", "user list"] },
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
      r.keywords.some((k) => cleaned.includes(k) || k.includes(cleaned))
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
  icon: string;
  description: string;
  descriptionMl: string;
  tags: string[];
}

export interface GuardianResponse {
  message: string;
  messageMl?: string;
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
    description:
      "Real-time identification of enrolled employees, VIP visitors, and blacklisted individuals from live camera feeds. " +
      "Supports multi-face detection, liveness check, and instant alert dispatch.",
    descriptionMl:
      "ലൈവ് ക്യാമറ ഫീഡിൽ നിന്ന് enrolled employees, VIP visitors, blacklisted ആളുകളെ real-time-ൽ തിരിച്ചറിയും. " +
      "Multi-face detection, liveness check, instant alert dispatch എന്നിവ support ചെയ്യുന്നു.",
    tags: ["AI", "Biometric", "Security", "Real-time"],
  },
  {
    icon: "🚗",
    title: "ANPR — Automatic Number Plate Recognition",
    titleMl: "ANPR — വാഹന നമ്പർ തിരിച്ചറിയൽ",
    description:
      "Automatic license plate recognition for vehicle access control. Supports allowlist/blocklist alerts, " +
      "entry/exit logging, and integration with parking and logistics systems.",
    descriptionMl:
      "വാഹനങ്ങളുടെ നമ്പർ പ്ലേറ്റ് automatic-ആയി തിരിച്ചറിഞ്ഞ് access control നടത്തും. " +
      "Allowlist/blocklist alerts, entry/exit logging, parking & logistics integration support ചെയ്യുന്നു.",
    tags: ["AI", "Vehicle", "ANPR", "Access Control"],
  },
  {
    icon: "🔴",
    title: "Perimeter & Intrusion Detection",
    titleMl: "കടന്നുകയറ്റ ഡിറ്റക്ഷൻ & വെർച്വൽ ട്രിപ്‌വയർ",
    description:
      "Virtual tripwires, sterile zone breach detection, and boundary crossing alarms. " +
      "Draw custom zones on any camera canvas and set directional rules (A→B, B→A, bidirectional).",
    descriptionMl:
      "ഏതൊരു ക്യാമറയിലും virtual tripwires വരച്ച് boundary crossing alerts set ചെയ്യാം. " +
      "Sterile zone breach, directional rules (A→B, B→A, bidirectional) support ഉണ്ട്. " +
      "Analytics → Rules & Automation page-ൽ configure ചെയ്യാം.",
    tags: ["AI", "Perimeter", "Intrusion", "Virtual Tripwire"],
  },
  {
    icon: "👥",
    title: "Crowd & Loitering Analytics",
    titleMl: "ജനക്കൂട്ടം & സംശയകരമായ ലോയ്‌റ്ററിംഗ് ഡിറ്റക്ഷൻ",
    description:
      "Real-time crowd density monitoring with overcrowding alerts. Detects suspicious loitering " +
      "in sensitive areas like ATMs, bank lobbies, and vaults.",
    descriptionMl:
      "Real-time crowd density monitor ചെയ്ത് overcrowding alerts അയക്കും. ATM, bank lobby, vault-ൽ " +
      "suspicious loitering detect ചെയ്ത് ഉടൻ alert നൽകും.",
    tags: ["AI", "Crowd", "Analytics", "Loitering"],
  },
  {
    icon: "🏦",
    title: "Banking & NBFC Compliance Module",
    titleMl: "ബാങ്കിംഗ് & NBFC കംപ്ലയൻസ് മൊഡ്യൂൾ",
    description:
      "Automated vault dual-custody verification, cash counter camera monitoring, teller area security, " +
      "strong-room checks, and daily executive MIS surveillance health reports.",
    descriptionMl:
      "Vault opening/closing-ൽ dual-custody ഉറപ്പാക്കും. Cash counter coverage, teller area security, " +
      "strong-room checks, daily executive MIS reports — ഇവ automated ആയി run ആകും. " +
      "Gold loan branches, banks, NBFC-കൾക്ക് ഇത് specially designed ആണ്.",
    tags: ["Banking", "NBFC", "Vault", "Compliance", "MIS Reports"],
  },
  {
    icon: "🎙️",
    title: "Voice Authentication & Biometrics",
    titleMl: "ശബ്ദ ആധികാരീകരണം (Voice ID Login)",
    description:
      "Enroll a voice passphrase for password-free login. Uses voice biometrics to authenticate " +
      "operators securely without typing credentials.",
    descriptionMl:
      "ഒരു voice passphrase enroll ചെയ്ത ശേഷം password ടൈപ്പ് ചെയ്യാതെ voice ID ഉപയോഗിച്ച് login ചെയ്യാം. " +
      "Login page-ൽ 'Voice Login' button click ചെയ്ത് phrase speak ചെയ്താൽ authenticate ആകും.",
    tags: ["Biometric", "Voice", "Authentication", "Security"],
  },
  {
    icon: "🌐",
    title: "Multi-Branch Command Center",
    titleMl: "മൾട്ടി-ബ്രാഞ്ച് കമാൻഡ് സെന്റർ",
    description:
      "Centralized live video wall, PTZ camera control, and unified alert escalation across all branches. " +
      "Real-time branch health dashboard with per-branch camera status.",
    descriptionMl:
      "എല്ലാ branches-ലെയും ലൈവ് video wall ഒരിടത്ത് നിന്ന് control ചെയ്യാം. " +
      "PTZ control, unified alert escalation, real-time branch health — centralized ആയി manage ചെയ്യാം.",
    tags: ["Multi-Branch", "Live Video", "PTZ", "Command Center"],
  },
  {
    icon: "💾",
    title: "Edge Agent & Offline Recording",
    titleMl: "Edge Agent & ഓഫ്‌ലൈൻ വീഡിയോ റെക്കോർഡിംഗ്",
    description:
      "Local edge appliance (Windows PC / Jetson / Intel x86) records video continuously even when internet is down. " +
      "Encrypted sync to cloud when connectivity resumes. Each branch gets its own edge agent.",
    descriptionMl:
      "Internet ഇല്ലെങ്കിലും edge PC-ൽ locally video record ആകും. " +
      "Internet restore ആയ ശേഷം encrypted ആയി cloud-ലേക്ക് sync ആകും. " +
      "Windows PC-ൽ installer download ചെയ്ത് Run as Administrator ആയി install ചെയ്യാം.",
    tags: ["Edge", "Offline", "Recording", "High Availability"],
  },
  {
    icon: "📋",
    title: "Evidence & Audit Trail",
    titleMl: "തെളിവ് & ഓഡിറ്റ് ട്രെയിൽ",
    description:
      "Tamper-evident evidence packages with chain of custody. Export incident clips, screenshots, " +
      "and audit logs for legal or compliance purposes. HSM-signed for integrity.",
    descriptionMl:
      "Incidents-ൽ video clip, screenshots, audit logs — tamper-evident ആയി export ചെയ്യാം. " +
      "HSM signing ഉള്ളതിനാൽ evidence-ന്റെ integrity legally provable ആണ്.",
    tags: ["Evidence", "Audit", "Legal", "Compliance"],
  },
  {
    icon: "🤖",
    title: "AI Video Search",
    titleMl: "AI വീഡിയോ സെർച്ച്",
    description:
      "Search recorded footage using natural language: 'show me a person in red shirt at main entrance between 10am-12pm'. " +
      "Powered by vision AI for rapid forensic investigation.",
    descriptionMl:
      "'Red shirt ധരിച്ച ആൾ main entrance-ൽ 10am-12pm-ൽ' എന്ന് natural language-ൽ search ചെയ്ത് " +
      "recorded footage-ൽ നിന്ن instantly clips കാണാം. Forensic investigation-ന് ഉപകരിക്കും.",
    tags: ["AI", "Video Search", "Forensic", "Analytics"],
  },
  {
    icon: "🚨",
    title: "Incident Management & SOP Workflow",
    titleMl: "ഇൻസിഡന്റ് മാനേജ്‌മെന്റ് & SOP വർക്ക്‌ഫ്ലോ",
    description:
      "Automated incident creation, operator assignment, escalation timers, SOP checklists, " +
      "and resolution audit trail. Integrates with physical siren, SMS, and guard dispatch.",
    descriptionMl:
      "Alert trigger ആകുമ്പോൾ automatically incident create ആകും, operator-ന് assign ആകും, " +
      "escalation timer run ആകും. SOP checklist, SMS, physical siren, guard dispatch — " +
      "ഒരൊറ്റ workflow-ൽ handle ചെയ്യും.",
    tags: ["Incident", "SOP", "Workflow", "Escalation"],
  },
  {
    icon: "🔒",
    title: "Access Control & Secure Area Authorization",
    titleMl: "ആക്‌സസ് കൺട്രോൾ & സെക്യൂർ ഏരിയ ഓതറൈസേഷൻ",
    description:
      "Role-based access control (RBAC/ABAC), secure area whitelists, dual-person authorization zones, " +
      "and door lock/unlock integrations.",
    descriptionMl:
      "Role-based access control, secure area whitelists, dual-person authorization zones " +
      "(vault entry-ക്ക് 2 authorized ആളുകൾ ഒരേ സമയം ഉണ്ടായിരിക്കണം), door lock/unlock integration.",
    tags: ["Access Control", "ABAC", "RBAC", "Security"],
  },
];

export class GuardianAIAssistant {
  private openAIApiKey: string;
  private openAIBaseUrl: string;
  private model: string;
  private conversationHistory: Map<string, GuardianMessage[]> = new Map();

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
    // In authenticated session, if user asks to open/navigate to ANY menu/page or names a menu, resolve immediately!
    if (!context.isGuest) {
      const lower = message.toLowerCase().trim();
      const navMatch = resolveAppRoute(lower);
      const cleaned = cleanNavQuery(lower);
      const isNavIntent =
        lower.includes("open") ||
        lower.includes("go") ||
        lower.includes("show") ||
        lower.includes("view") ||
        lower.includes("menu") ||
        lower.includes("navigate") ||
        lower.includes("poku") ||
        lower.includes("pokanam") ||
        lower.includes("pokaam") ||
        lower.includes("pokaan") ||
        lower.includes("kaanik") ||
        lower.includes("kaanikkanam") ||
        lower.includes("kaanich") ||
        lower.includes("edukk") ||
        lower.includes("edukkanam") ||
        lower.includes("eduth") ||
        lower.includes("aak") ||
        lower.includes("aakanam") ||
        lower.includes("aakk") ||
        lower.includes("aakkanam") ||
        lower.includes("cheyy") ||
        lower.includes("cheyyanam") ||
        lower.includes("thurak") ||
        lower.includes("thurann") ||
        lower.includes("launch") ||
        lower.includes("load") ||
        lower.includes("display") ||
        lower.includes("start");

      const isDirectMatch = Boolean(
        navMatch &&
        (cleaned === navMatch.label.toLowerCase() ||
         navMatch.keywords.some((k) => cleaned === k) ||
         cleaned.length >= 3)
      );

      if (navMatch && (isNavIntent || isDirectMatch)) {
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
    if (context.isGuest) {
      return {
        role: "system",
        content: `You are KryptonAI, the intelligent assistant for the KryptonVision (Sentinel Grid) security and video analytics platform.

IMPORTANT CONTEXT:
The user is currently a GUEST (pre-login mode) and has not authenticated yet.

LANGUAGE & LOCALIZATION (മലയാളം / MANGLISH):
- You understand English, Malayalam, and Manglish (Malayalam written in Latin script, e.g. "line cross evide set cheyyunnath", "cctv stream kaanikku", "agent work aakunnilla", "engane install cheyyum").
- When asked in Malayalam or Manglish, reply warmly and helpfully in Malayalam/Manglish or bilingual English+Malayalam with step-by-step guidance!

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

2. EDGE AGENT INSTALLATION & MULTI-SYSTEM TROUBLESHOOTING (എഡ്ജ് ഏജന്റ് ഇൻസ്റ്റാളേഷൻ):
   - How to install: In Dashboard Branch Management, download the branch package ("<Branch>-edge-agent-setup.zip").
     * CRITICAL: Extract ALL files first (Right-click ➔ Extract All; never run from inside compressed zip preview).
     * Verify "edge-agent.env" is next to "KryptonVisionInstaller-v0.1.27-windows.exe".
     * Right-click and "Run as administrator".
   - Why it fails on another system:
     a) Missing edge-agent.env: User copied only the .exe file alone, or ran it without extracting the ZIP.
     b) Duplicate Agent ID: Using the same downloaded setup zip on two different machines conflicts. Each PC needs its own branch/gateway package from the dashboard.
     c) Network: The PC must reach the cloud control plane at https://34-14-220-41.sslip.io.
     d) Diagnosis: Check logs at "C:\\Program Files\\Sentinel Grid\\Edge Agent\\logs\\edge-agent.log" and Windows Scheduled Task "Sentinel Grid Edge Agent" in taskschd.msc.

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

Your role:
- Monitor security operations across all branches
- Guide operators on platform features, rules, and hardware setup
- Execute commands when requested (e.g. navigate_to_menu, show_camera_feed, dispatch_guard, lock_doors)
- Assist operators in daily operations and emergency situations
- Be concise, professional, and action-oriented

LANGUAGE & LOCALIZATION (മലയാളം / MANGLISH):
- You natively understand English, Malayalam, and Manglish (Malayalam written in Latin script, e.g. "line cross evide set cheyyunnath", "cctv stream kaanikku", "agent work aakunnilla", "engane install cheyyum").
- When asked in Malayalam or Manglish, reply warmly and helpfully in Malayalam/Manglish or bilingual English+Malayalam with step-by-step guidance!

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

2. EDGE AGENT INSTALLATION & MULTI-SYSTEM TROUBLESHOOTING (എഡ്ജ് ഏജന്റ് ഇൻസ്റ്റാളേഷൻ):
   - How to install: In Dashboard Branch Management, download the branch package ("<Branch>-edge-agent-setup.zip").
     * CRITICAL: Extract ALL files first (Right-click ➔ Extract All; never run from inside compressed zip preview).
     * Verify "edge-agent.env" is next to "KryptonVisionInstaller-v0.1.27-windows.exe".
     * Right-click and "Run as administrator".
   - Why it fails on another system:
     a) Missing edge-agent.env: User copied only the .exe file alone, or ran it without extracting the ZIP.
     b) Duplicate Agent ID: Using the same downloaded setup zip on two different machines conflicts. Each PC needs its own branch/gateway package from the dashboard.
     c) Network: The PC must reach the cloud control plane at https://34-14-220-41.sslip.io.
     d) Diagnosis: Check logs at "C:\\Program Files\\Sentinel Grid\\Edge Agent\\logs\\edge-agent.log" and Windows Scheduled Task "Sentinel Grid Edge Agent" in taskschd.msc.

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
        `SELECT id, name, status FROM cameras 
         WHERE id = ANY($1) AND tenant_id = $2`,
        [cameraIds, context.tenantId]
      );
      cameras = rows;
    } catch {
      cameras = [];
    }

    const cameraList = (cameraIds || []).map((id: string, idx: number) => {
      const found = cameras.find((c: any) => c.id === id);
      return {
        id,
        name: found?.name || `Camera ${idx + 1} (${id.slice(0, 8)})`,
        status: found?.status || "online",
      };
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
             WHERE ${likeConditions}
             ORDER BY c.name
             LIMIT 16`,
            likeParams
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
            `SELECT id, name FROM cameras ORDER BY (status = 'online') DESC, name ASC LIMIT 9`
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
      WHERE rn.tenant_id = $1
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
    const cleaned = cleanNavQuery(lower);
    const isNavIntent =
      lower.includes("open") ||
      lower.includes("go") ||
      lower.includes("show") ||
      lower.includes("view") ||
      lower.includes("menu") ||
      lower.includes("navigate") ||
      lower.includes("poku") ||
      lower.includes("pokanam") ||
      lower.includes("kaanik") ||
      lower.includes("kaanikkanam") ||
      lower.includes("edukk") ||
      lower.includes("edukkanam") ||
      lower.includes("aak") ||
      lower.includes("aakanam") ||
      lower.includes("cheyy") ||
      lower.includes("cheyyanam") ||
      lower.includes("thurak") ||
      lower.includes("launch") ||
      lower.includes("load") ||
      lower.includes("display") ||
      lower.includes("start");

    const isDirectMatch = Boolean(
      navMatch &&
      (cleaned === navMatch.label.toLowerCase() ||
       navMatch.keywords.some((k) => cleaned === k) ||
       cleaned.length >= 3)
    );

    if (navMatch && (isNavIntent || isDirectMatch)) {
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

    // Edge Agent Installation & Multi-System Troubleshooting query
    if (
      (lower.includes("edge") || lower.includes("agent") || lower.includes("installer") || lower.includes("kryptonvision")) &&
      (lower.includes("install") || lower.includes("another") || lower.includes("work") || lower.includes("other system") || lower.includes("system") || lower.includes("setup"))
    ) {
      return {
        message:
          "**Edge Agent മറ്റൊരു സിസ്റ്റത്തിൽ ഇൻസ്റ്റാൾ ചെയ്യുമ്പോൾ ശ്രദ്ധിക്കേണ്ട കാര്യങ്ങൾ:**\n\n" +
          "1. **Extract ZIP First**: ഡാഷ്‌ബോർഡിൽ നിന്ന് ഡൗൺലോഡ് ചെയ്ത `<Branch>-edge-agent-setup.zip` ഫയൽ **Right-click ➔ Extract All** നൽകി ഒരു സാധാരണ ഫോൾഡറിലേക്ക് എക്‌സ്‌ട്രാക്റ്റ് ചെയ്യുക. ZIP-നുള്ളിൽ നിന്ന് നേരിട്ട് `.exe` റൺ ചെയ്യരുത്.\n" +
          "2. **edge-agent.env**: എക്‌സ്‌ട്രാക്റ്റ് ചെയ്ത ഫോൾഡറിൽ `KryptonVisionInstaller-v0.1.27-windows.exe`-ന്റെ കൂടെത്തന്നെ `edge-agent.env` ഉണ്ടെന്ന് ഉറപ്പുവരുത്തുക. `.exe` മാത്രം മറ്റൊരു പിസിയിലേക്ക് കോപ്പി ചെയ്താൽ വർക്ക് ആവില്ല.\n" +
          "3. **Unique Branch Package**: രണ്ട് കമ്പ്യൂട്ടറുകളിൽ ഒരേ ഏജന്റ് ക്രെഡൻഷ്യലുകൾ ഉപയോഗിക്കാൻ പാടില്ല. ഓരോ സിസ്റ്റത്തിനും ഡാഷ്‌ബോർഡിൽ പ്രത്യേക ബ്രാഞ്ച്/ഏജന്റ് സെറ്റപ്പ് ഡൗൺലോഡ് ചെയ്യുക.\n" +
          "4. **Run as Administrator**: ഇൻസ്റ്റാളറിൽ Right-click ചെയ്ത് **Run as administrator** നൽകുക.\n" +
          "5. **Network Connection**: ആ സിസ്റ്റത്തിൽ നിന്ന് `https://34-14-220-41.sslip.io` റീച്ച് ചെയ്യാൻ സാധിക്കുന്നുണ്ടെന്ന് ഉറപ്പുവരുത്തുക.\n" +
          "6. **Logs**: എന്തെങ്കിലും പ്രശ്നമുണ്ടെങ്കിൽ `C:\\Program Files\\Sentinel Grid\\Edge Agent\\logs\\edge-agent.log` ഫയൽ പരിശോധിക്കുക.",
        type: "text",
        suggestions: ["Open Edge Fleet", "Open Branch Overview", "Open Command Center"],
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
           WHERE rn.tenant_id = $1
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

    // 1. General greetings
    if (
      lower === "hi" ||
      lower === "hello" ||
      lower === "hey" ||
      lower.startsWith("hi ") ||
      lower.startsWith("hello ") ||
      lower.startsWith("hey ") ||
      lower.includes("namaskaram") ||
      lower.includes("good morning") ||
      lower.includes("good evening") ||
      lower.includes("good afternoon") ||
      lower === "who are you" ||
      lower === "kryptonai"
    ) {
      return {
        message:
          "Hello! I am KryptonAI, the intelligent security assistant for KryptonVision (Sentinel Grid).\n\nIn pre-login mode, I can help answer general questions about our surveillance platform, supported CCTV hardware, and AI video analytics.\n\nTo monitor live camera feeds, manage operational alerts, or access system modules, please sign in with your credentials or Voice ID.",
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
      lower.includes("forgot")
    ) {
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
      lower.includes("hanwha")
    ) {
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
      lower.includes("what is sentinel") ||
      lower.includes("what is this") ||
      lower.includes("about kryptonvision") ||
      lower.includes("about") ||
      lower.includes("entha ith") ||
      lower.includes("enthanu") ||
      lower.includes("overview")
    ) {
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

    // 5. Features / AI analytics capabilities
    const isFeatureQuery =
      lower.includes("feature") ||
      lower.includes("analytic") ||
      lower.includes("capability") ||
      lower.includes("capabilities") ||
      lower.includes("face recognition") ||
      lower.includes("facial") ||
      lower.includes("anpr") ||
      lower.includes("license plate") ||
      lower.includes("intrusion") ||
      lower.includes("crowd") ||
      lower.includes("loitering") ||
      lower.includes("what can") ||
      lower.includes("what does") ||
      lower.includes("what features") ||
      lower.includes("ai features") ||
      lower.includes("enthellam") ||
      lower.includes("enthu okke") ||
      lower.includes("enthu features") ||
      lower.includes("features enthaanu") ||
      lower.includes("features enthokke") ||
      lower.includes("features unduo") ||
      lower.includes("features undoo") ||
      lower.includes("features undo") ||
      lower.includes("features ullathu") ||
      lower.includes("features undayo") ||
      lower.includes("enthanu features") ||
      lower.includes("ethu features") ||
      lower.includes("njan enthellam cheyyan") ||
      lower.includes("enthu cheyyan") ||
      lower.includes("enthu okke ayyo") ||
      lower.includes("platform enthu") ||
      lower.includes("product enthu") ||
      lower.includes("system enthu") ||
      lower.includes("ai unduo") ||
      lower.includes("ai undoo") ||
      lower.includes("ai undo") ||
      (lower.includes("ai") && lower.includes("enthu")) ||
      (lower.includes("ai") && lower.includes("entha"));

    const isMalayalamQuery =
      lower.includes("enthu") ||
      lower.includes("entha") ||
      lower.includes("enthellam") ||
      lower.includes("enthu okke") ||
      lower.includes("unduo") ||
      lower.includes("undoo") ||
      lower.includes("undo") ||
      lower.includes("ullathu") ||
      lower.includes("paranjal") ||
      lower.includes("cheyyanam") ||
      lower.includes("cheyyam") ||
      lower.includes("ayyo") ||
      lower.includes("aaano") ||
      lower.includes("aano") ||
      lower.includes("anuu") ||
      lower.includes("engane") ||
      lower.includes("evide") ||
      lower.includes("enikku") ||
      lower.includes("njan");

    if (isFeatureQuery) {
      if (isMalayalamQuery) {
        return {
          message:
            "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**",
          messageMl:
            "**KryptonVision-ന്റെ AI & Security ഫീച്ചറുകൾ:**\n\n" +
            "ഈ platform-ൽ ഉള്ള പ്രധാന capabilities:",
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
          timestamp,
        };
      }
      return {
        message:
          "**KryptonVision AI & Security Capabilities:**",
        type: "feature_cards",
        cards: KRYPTON_PRODUCT_FEATURES,
        suggestions: [
          "What is KryptonVision?",
          "Which cameras are supported?",
          "How do I sign in?",
        ],
        timestamp,
      };
    }

    // 6. NBFC / Banking explanation (informational)
    if (
      lower.includes("what is nbfc") ||
      lower.includes("banking module") ||
      lower.includes("vault monitoring")
    ) {
      return {
        message:
          "The **NBFC & Banking Operations Module** is designed for gold loan branches, banks, and secure commercial facilities. It enforces security compliance:\n• Automated vault opening/closing dual-custody verification\n• Real-time cash counter camera coverage\n• Strong-room security checks and teller area monitoring\n• Automated daily surveillance health MIS reports\n\n*Note: To view live vault cameras, branch audit logs, or branch operational reports, please log in to your account.*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "What is KryptonVision?",
          "Supported CCTV cameras",
        ],
        timestamp,
      };
    }

    // 6b. Polygon Zone / Line Crossing / Virtual Tripwire — comprehensive bilingual guide
    const isLineCrossQuery =
      lower.includes("line cross") ||
      lower.includes("line crossing") ||
      lower.includes("tripwire") ||
      lower.includes("boundary") ||
      lower.includes("polygon") ||
      lower.includes("zone") ||
      lower.includes("virtual zone") ||
      lower.includes("draw zone") ||
      lower.includes("draw line") ||
      lower.includes("sterile zone") ||
      lower.includes("restricted zone") ||
      lower.includes("restricted area") ||
      lower.includes("intrusion zone") ||
      lower.includes("analytics rule") ||
      lower.includes("rules automation") ||
      lower.includes("lain cross") ||
      lower.includes("laim cross") ||
      lower.includes("line kroos") ||
      lower.includes("polygon set") ||
      lower.includes("polygon varak") ||
      lower.includes("polygon varakk") ||
      lower.includes("zone set") ||
      lower.includes("zone varakk") ||
      lower.includes("zone varak") ||
      lower.includes("zone undaak") ||
      lower.includes("zone undak") ||
      lower.includes("zone create") ||
      lower.includes("line varakk") ||
      lower.includes("line varak") ||
      lower.includes("virtual line") ||
      lower.includes("cross cheyyumbol") ||
      lower.includes("cross cheyyumpoL") ||
      lower.includes("cross alert") ||
      lower.includes("kadannu poyal") ||
      lower.includes("kadannal") ||
      lower.includes("kadan poyal") ||
      lower.includes("boundary alert");

    if (isLineCrossQuery) {
      const isPolygon =
        lower.includes("polygon") ||
        lower.includes("zone") ||
        lower.includes("sterile") ||
        lower.includes("restricted") ||
        lower.includes("intrusion zone") ||
        lower.includes("zone set") ||
        lower.includes("zone varak") ||
        lower.includes("zone undaak") ||
        lower.includes("zone undak") ||
        lower.includes("zone create");

      if (isPolygon) {
        return {
          message:
            "**Polygon Zone (Sterile / Restricted Area) — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
            "📍 **Path:** Dashboard → **Analytics ➔ Rules & Automation** (`/analytics/rules`)\n\n" +
            "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
            "1️⃣ Login ചെയ്ത ശേഷം ഇടത് sidebar-ൽ **Analytics** → **Rules & Automation** click ചെയ്യുക.\n" +
            "   🔗 Direct URL: `/analytics/rules`\n\n" +
            "2️⃣ **Branch** (ഏത് branch?) & **Camera** (ഏത് camera?) dropdown-ൽ നിന്ന് select ചെയ്യുക.\n\n" +
            "3️⃣ **\"Visual Zone & Virtual Tripwire Designer\"** tool-ൽ mode **\"Polygon Zone\"** select ചെയ്യുക.\n" +
            "   *(Default \"Virtual Tripwire\" ആണ്, അത് polygon zone-ലേക്ക് switch ചെയ്യുക)*\n\n" +
            "4️⃣ Camera-യുടെ live canvas-ൽ **3 or more points click** ചെയ്ത് ഒരു closed polygon വരയ്ക്കുക.\n" +
            "   • ഓരോ click-ഉം ഓരോ corner point ആണ്.\n" +
            "   • Last point first point-ൽ click ചെയ്ത് polygon close ചെയ്യുക.\n\n" +
            "5️⃣ **\"Save Zone Definition\"** button click ചെയ്യുക.\n\n" +
            "6️⃣ **Rule Configuration** section-ൽ (Page-ന്റെ bottom-ൽ):\n" +
            "   • **Condition Type:** `Zone Intrusion` (zone_intrusion) select ചെയ്യുക.\n" +
            "   • **Action:** Alert / Siren / SMS / Incident — ഏത് action വേണം?\n" +
            "   • **\"Save Rule\"** click ചെയ്യുക.\n\n" +
            "✅ ഇനി ആ polygon zone-ലേക്ക് ആരെങ്കിലും കടന്നു കഴിഞ്ഞാൽ automatic alert trigger ആകും!\n\n" +
            "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
          type: "text",
          suggestions: [
            "Line Crossing (Virtual Tripwire) set cheyyaan",
            "What AI features are available?",
            "How do I sign in?",
            "Edge Agent installation guide",
          ],
          timestamp,
        };
      }

      // Line Crossing / Virtual Tripwire
      return {
        message:
          "**Line Crossing (Virtual Tripwire) — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Analytics ➔ Rules & Automation** (`/analytics/rules`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം ഇടത് sidebar-ൽ **Analytics** → **Rules & Automation** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/analytics/rules`\n\n" +
          "2️⃣ **Branch** & **Camera** dropdown-ൽ നിന്ന് select ചെയ്യുക.\n\n" +
          "3️⃣ **\"Visual Zone & Virtual Tripwire Designer\"** tool-ൽ mode **\"Virtual Tripwire\"** select ചെയ്യുക.\n" +
          "   *(Quick preset: **⚡ Door Ingress Tripwire** click ചെയ്ത് automatically set ആക്കാം)*\n\n" +
          "4️⃣ **Direction** select ചെയ്യുക:\n" +
          "   • `A ➔ B` — ഒരു direction-ൽ cross ചെയ്താൽ alert\n" +
          "   • `B ➔ A` — opposite direction-ൽ cross ചെയ്താൽ alert\n" +
          "   • `A ⇄ B` — ഏത് direction-ലും cross ചെയ്താൽ alert (bidirectional)\n\n" +
          "5️⃣ Camera-യുടെ live canvas-ൽ **2 points click** ചെയ്ത് line വരയ്ക്കുക.\n" +
          "   • Point A (🟢 Green) — line-ന്റെ start\n" +
          "   • Point B (🔵 Blue) — line-ന്റെ end\n\n" +
          "6️⃣ **\"Save Tripwire Definition\"** button click ചെയ്യുക.\n\n" +
          "7️⃣ **Rule Configuration** section-ൽ:\n" +
          "   • **Condition Type:** `Line Crossing` (line_crossing) select ചെയ്യുക.\n" +
          "   • **Action:** Alert / Siren / SMS / Incident — ഏത് action വേണം?\n" +
          "   • **\"Save Rule\"** click ചെയ്യുക.\n\n" +
          "✅ ഇനി ആ line cross ചെയ്ത് ആരെങ്കിലും കടന്നാൽ automatic alert trigger ആകും!\n\n" +
          "💡 **Polygon Zone vs Line Crossing:**\n" +
          "   • **Line Crossing** = ഒരു straight line cross ചെയ്യുമ്പോൾ alert (2 points)\n" +
          "   • **Polygon Zone** = ഒരു area/region-ലേക്ക് കടക്കുമ്പോൾ alert (3+ points, closed shape)\n\n" +
          "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "Polygon Zone set cheyyaan",
          "What AI features are available?",
          "How do I sign in?",
          "Edge Agent installation guide",
        ],
        timestamp,
      };
    }

    if (
      (lower.includes("edge") || lower.includes("agent") || lower.includes("installer") || lower.includes("kryptonvision")) &&
      (lower.includes("install") || lower.includes("another") || lower.includes("work") || lower.includes("other system") || lower.includes("system") || lower.includes("setup"))
    ) {
      return {
        message:
          "**KryptonVision Edge Agent മറ്റൊരു കമ്പ്യൂട്ടറിൽ ഇൻസ്റ്റാൾ ചെയ്യുമ്പോൾ:**\n\n" +
          "1. **Extract ZIP First**: ഡാഷ്‌ബോർഡിൽ നിന്ന് ലഭിച്ച `<Branch>-edge-agent-setup.zip` പൂർണ്ണമായി **Extract All** ചെയ്യുക. ZIP-നുള്ളിൽ നിന്ന് നേരിട്ട് `.exe` പ്രവർത്തിപ്പിക്കരുത്.\n" +
          "2. **edge-agent.env ഫയൽ നിർബന്ധമാണ്**: `.exe` ഫയലിന്റെ കൂടെത്തന്നെ `edge-agent.env` ഫയലും ഉണ്ടായിരിക്കണം. `.exe` മാത്രം കോപ്പി ചെയ്താൽ സെർവറുമായി കണക്റ്റാവില്ല.\n" +
          "3. **ഒരു സിസ്റ്റത്തിന് ഒരു ഏജന്റ്**: ഒരേ ഏജന്റ് പാക്കേജ് രണ്ട് പിസിയിൽ ഒരേസമയം ഉപയോഗിച്ചാൽ കണക്ഷൻ ഡ്രോപ്പ് ആകും. പുതിയ പിസിക്ക് പുതിയ ബ്രാഞ്ച് ഏജന്റ് സെറ്റപ്പ് ഡൗൺലോഡ് ചെയ്യുക.\n" +
          "4. **Run as Administrator**: ഇൻസ്റ്റാളറിൽ റൈറ്റ് ക്ലിക്ക് ചെയ്ത് **Run as administrator** കൊടുക്കുക.\n" +
          "5. **Network Connectivity**: ആ കമ്പ്യൂട്ടറിൽ നിന്ന് ക്ലൗഡ് സെർവർ (`https://34-14-220-41.sslip.io`) ആക്സസ് ചെയ്യാൻ സാധിക്കണം.",
        type: "text",
        suggestions: ["How do I sign in?", "What is KryptonVision?", "Supported CCTV cameras"],
        timestamp,
      };
    }

    // ── 7. FACE RECOGNITION / WATCHLIST ─────────────────────────────────
    const isFaceQuery =
      lower.includes("face recognition") ||
      lower.includes("facial") ||
      lower.includes("face id") ||
      lower.includes("watchlist") ||
      lower.includes("blacklist") ||
      lower.includes("whitelist") ||
      lower.includes("enroll face") ||
      lower.includes("enroll person") ||
      lower.includes("face enroll") ||
      lower.includes("add face") ||
      lower.includes("vip face") ||
      lower.includes("mukham") ||
      lower.includes("mukha") ||
      lower.includes("face set") ||
      lower.includes("face add") ||
      lower.includes("face register") ||
      lower.includes("face configure") ||
      lower.includes("face evide") ||
      lower.includes("face engane") ||
      lower.includes("face recognition evide") ||
      lower.includes("face recognition engane");

    if (isFaceQuery) {
      return {
        message:
          "**Face Recognition & Watchlist — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Analytics → Face Recognition & Watchlists** (`/analytics/face-recognition`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Analytics → Face Recognition & Watchlists** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/analytics/face-recognition`\n\n" +
          "2️⃣ **\"+ Enroll Person\"** button click ചെയ്യുക.\n\n" +
          "3️⃣ Details fill ചെയ്യുക:\n" +
          "   • **Name** — ആളിന്റെ പേര്\n" +
          "   • **Category** — `VIP` / `Employee` / `Blacklisted` / `Watchlist`\n" +
          "   • **Photo** — clear face photo upload ചെയ്യുക (minimum 1, recommended 3-5 angles)\n\n" +
          "4️⃣ **\"Save\"** click ചെയ്യുക — enrollment complete!\n\n" +
          "5️⃣ **Alert Rule Set ചെയ്യാൻ:**\n" +
          "   • Analytics → Rules & Automation (`/analytics/rules`) → Condition: `Face Match` select ചെയ്യുക.\n" +
          "   • Blacklisted person detected ആകുമ്പോൾ auto-alert set ആകും.\n\n" +
          "✅ ഇനി enroll ചെയ്ത face camera-ൽ appear ആകുമ്പോൾ automatic recognition!\n\n" +
          "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "ANPR vehicle tracking set cheyyaan",
          "What AI features are available?",
          "Line Crossing set cheyyaan",
        ],
        timestamp,
      };
    }

    // ── 8. ANPR / VEHICLE TRACKING ───────────────────────────────────────
    const isAnprQuery =
      lower.includes("anpr") ||
      lower.includes("number plate") ||
      lower.includes("license plate") ||
      lower.includes("vehicle") ||
      lower.includes("vahana") ||
      lower.includes("car plate") ||
      lower.includes("plate recognition") ||
      lower.includes("vehicle tracking") ||
      lower.includes("vehicle alert") ||
      lower.includes("vehicle access") ||
      lower.includes("blocklist vehicle") ||
      lower.includes("allowlist vehicle") ||
      lower.includes("anpr evide") ||
      lower.includes("anpr engane") ||
      lower.includes("anpr set") ||
      lower.includes("vehicle set");

    if (isAnprQuery) {
      return {
        message:
          "**ANPR (Vehicle Number Plate Recognition) — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Analytics → ANPR & Vehicle Telemetry** (`/analytics/anpr`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Analytics → ANPR & Vehicle Telemetry** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/analytics/anpr`\n\n" +
          "2️⃣ ANPR module-ൽ **Camera Assignment** — ഏത് camera-ൽ number plates capture ചെയ്യണം എന്ന് select ചെയ്യുക.\n\n" +
          "3️⃣ **Allowlist / Blocklist** configure ചെയ്യാൻ:\n" +
          "   • **Allowlist** — permitted vehicles (employees, authorized visitors)\n" +
          "   • **Blocklist** — blocked vehicles (alert trigger ആകും)\n" +
          "   • Number plate format: `KL01AB1234`\n\n" +
          "4️⃣ **Alert Rule Set ചെയ്യാൻ:**\n" +
          "   • Analytics → Rules & Automation (`/analytics/rules`) → Condition: `ANPR Match` select ചെയ്യുക.\n" +
          "   • Blocklist vehicle detected ആകുമ്പോൾ auto-alert set ആകും.\n\n" +
          "5️⃣ **Entry / Exit Logs** — `/analytics/anpr` page-ൽ timestamp, plate, camera location സഹിതം entry/exit log automatically record ആകും.\n\n" +
          "✅ ഇനി blocklist vehicle enter ചെയ്യുമ്പോൾ immediate alert!\n\n" +
          "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Face Recognition set cheyyaan",
          "Line Crossing set cheyyaan",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 9. CROWD & LOITERING ANALYTICS ───────────────────────────────────
    const isCrowdQuery =
      lower.includes("crowd") ||
      lower.includes("loitering") ||
      lower.includes("overcrowding") ||
      lower.includes("people count") ||
      lower.includes("footfall") ||
      lower.includes("janakkoottam") ||
      lower.includes("loitering detection") ||
      lower.includes("loitering alert") ||
      lower.includes("crowd alert") ||
      lower.includes("crowd detection") ||
      lower.includes("crowd density") ||
      lower.includes("crowd set") ||
      lower.includes("crowd evide") ||
      lower.includes("crowd engane") ||
      lower.includes("queue") ||
      lower.includes("waiting line");

    if (isCrowdQuery) {
      return {
        message:
          "**Crowd & Loitering Analytics — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Analytics → Crowd & Counter Queue** (`/analytics/crowd`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Analytics → Crowd & Counter Queue** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/analytics/crowd`\n\n" +
          "2️⃣ Camera select ചെയ്ത് **Crowd Density Threshold** set ചെയ്യുക.\n" +
          "   • Example: 10+ people detected → alert trigger\n\n" +
          "3️⃣ **Loitering Alert** set ചെയ്യാൻ:\n" +
          "   • Analytics → Rules & Automation (`/analytics/rules`) → Condition: `Loitering` select ചെയ്യുക.\n" +
          "   • **Loitering Duration Threshold** set ചെയ്യുക (e.g., 5 minutes in same area).\n\n" +
          "4️⃣ **Alert Action** configure ചെയ്യുക:\n" +
          "   • Alert / SMS / Siren / Guard Dispatch — ഏത് action വേണം?\n\n" +
          "✅ ഇനി ATM, bank lobby, vault area-ൽ suspicious loitering automatically detect ആകും!\n\n" +
          "💡 **People Counting / Heatmaps:** `/analytics/people` page-ൽ footfall count & heatmap കാണാം.\n\n" +
          "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Face Recognition set cheyyaan",
          "ANPR set cheyyaan",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 10. BANKING / NBFC / VAULT ────────────────────────────────────────
    const isBankingQuery =
      lower.includes("vault") ||
      lower.includes("cash counter") ||
      lower.includes("banking") ||
      lower.includes("nbfc") ||
      lower.includes("dual custody") ||
      lower.includes("teller") ||
      lower.includes("strong room") ||
      lower.includes("strongroom") ||
      lower.includes("gold loan") ||
      lower.includes("bank module") ||
      lower.includes("vault monitoring") ||
      lower.includes("vault evide") ||
      lower.includes("vault engane") ||
      lower.includes("vault set") ||
      lower.includes("vault camera") ||
      lower.includes("vault dual") ||
      lower.includes("nbfc set") ||
      lower.includes("nbfc evide") ||
      lower.includes("banking set") ||
      lower.includes("banking evide") ||
      lower.includes("cash counter set") ||
      lower.includes("teller set");

    if (isBankingQuery) {
      return {
        message:
          "**Banking & NBFC / Vault Module — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Analytics → Banking & Cash Counters** (`/analytics/banking`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Analytics → Banking & Cash Counters** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/analytics/banking`\n\n" +
          "2️⃣ **Vault Setup:**\n" +
          "   • Vault camera assign ചെയ്യുക (strong-room camera select)\n" +
          "   • **Dual Custody Rule** enable ചെയ്യുക — vault open ചെയ്യാൻ 2 authorized persons present ആയിരിക്കണം.\n" +
          "   • Dual custody timer configure ചെയ്യുക.\n\n" +
          "3️⃣ **Cash Counter Setup:**\n" +
          "   • Cash counter camera assign ചെയ്യുക.\n" +
          "   • **Unauthorized Access Alert** enable ചെയ്യുക.\n\n" +
          "4️⃣ **Teller Area Coverage:**\n" +
          "   • Teller cameras configure ചെയ്ത് coverage verify ചെയ്യുക.\n\n" +
          "5️⃣ **Daily MIS Reports:**\n" +
          "   • Reports → Executive MIS Reports (`/reports/mis`) → Daily surveillance health report auto-generate ആകും.\n\n" +
          "6️⃣ **NBFC Watchlist** (`/analytics/nbfc-watchlist`) — defaulters, suspicious persons watchlist manage ചെയ്യാം.\n\n" +
          "✅ Vault dual-custody violation, unauthorized cash counter access — all automatically monitored!\n\n" +
          "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "MIS Reports evide kaanam",
          "Face Recognition set cheyyaan",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 11. AI VIDEO SEARCH ───────────────────────────────────────────────
    const isVideoSearchQuery =
      lower.includes("video search") ||
      lower.includes("search footage") ||
      lower.includes("find person") ||
      lower.includes("ai search") ||
      lower.includes("smart search") ||
      lower.includes("search video") ||
      lower.includes("forensic search") ||
      lower.includes("video saarch") ||
      lower.includes("video thadukal") ||
      lower.includes("search cheyyaan") ||
      lower.includes("search evide") ||
      lower.includes("search engane") ||
      lower.includes("footage search") ||
      lower.includes("clip search") ||
      lower.includes("find in recording");

    if (isVideoSearchQuery) {
      return {
        message:
          "**AI Smart Video Search — എവിടെ, എങ്ങനെ Use ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **AI Smart Video Search** (`/video-search`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Investigate → AI Smart Video Search** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/video-search`\n\n" +
          "2️⃣ Search query type ചെയ്യുക — **natural language** ഉപയോഗിക്കാം:\n" +
          "   • \"Red shirt person at main entrance between 10am-12pm\"\n" +
          "   • \"Person carrying bag near ATM yesterday\"\n" +
          "   • \"Blue car at parking at 3pm\"\n\n" +
          "3️⃣ **Filters** set ചെയ്യുക:\n" +
          "   • **Camera** — ഏത് camera-ൽ search ചെയ്യണം\n" +
          "   • **Date & Time Range** — ഏത് time range-ൽ\n" +
          "   • **Branch** — ഏത് branch\n\n" +
          "4️⃣ **Search** click ചെയ്യുക — AI matching clips automatically list ആകും.\n\n" +
          "5️⃣ Result clips **preview** ചെയ്ത് **Download / Export to Evidence** ചെയ്യാം.\n\n" +
          "✅ Minutes-ൽ hours of footage-ൽ നിന്ന് specific person/object/vehicle കണ്ടെത്താം!\n\n" +
          "*(Search ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Evidence export cheyyaan",
          "Face Recognition set cheyyaan",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 12. INCIDENT MANAGEMENT ───────────────────────────────────────────
    const isIncidentQuery =
      lower.includes("incident") ||
      lower.includes("create incident") ||
      lower.includes("guard dispatch") ||
      lower.includes("escalation") ||
      lower.includes("sop") ||
      lower.includes("incident management") ||
      lower.includes("incident evide") ||
      lower.includes("incident engane") ||
      lower.includes("incident set") ||
      lower.includes("incident create") ||
      lower.includes("incident workflow") ||
      lower.includes("dispatch guard") ||
      lower.includes("operator assign") ||
      lower.includes("sop checklist");

    if (isIncidentQuery) {
      return {
        message:
          "**Incident Management & SOP Workflow — എവിടെ, എങ്ങനെ Use ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Incident Response** (`/incidents`)\n\n" +
          "**Auto-Incident Creation (Recommended):**\n\n" +
          "1️⃣ Analytics → Rules & Automation (`/analytics/rules`) → Alert Rule create ചെയ്യുമ്പോൾ Action-ൽ **\"Create Incident\"** select ചെയ്യുക.\n" +
          "   → Rule trigger ആകുമ്പോൾ automatically incident create ആകും, operator-ന് assign ആകും.\n\n" +
          "**Manual Incident Create:**\n\n" +
          "2️⃣ Sidebar-ൽ **Incident Response** click ചെയ്ത് **\"+ New Incident\"** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/incidents`\n\n" +
          "3️⃣ Fill ചെയ്യുക:\n" +
          "   • **Title** — incident description\n" +
          "   • **Severity** — Low / Medium / High / Critical\n" +
          "   • **Branch & Camera** — incident location\n" +
          "   • **Assign to Operator** — ആർക്ക് assign ചെയ്യണം\n\n" +
          "4️⃣ **SOP Checklist** — configured SOPs automatically appear ആകും. Operator items ✅ tick ചെയ്ത് proceed ചെയ്യും.\n\n" +
          "5️⃣ **Guard Dispatch:** Incident-ൽ **\"Dispatch Guard\"** button click ചെയ്ത് location specify ചെയ്യുക.\n\n" +
          "6️⃣ **Escalation Timer** — configurable time-ൽ unresolved incidents automatically escalate ആകും.\n\n" +
          "✅ Complete audit trail with timestamps, operator actions, evidence clips!\n\n" +
          "*(Incidents manage ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Line Crossing alert set cheyyaan",
          "Evidence export cheyyaan",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 13. VOICE AUTHENTICATION ──────────────────────────────────────────
    const isVoiceAuthQuery =
      lower.includes("voice auth") ||
      lower.includes("voice login") ||
      lower.includes("voice id") ||
      lower.includes("enroll voice") ||
      lower.includes("voice enroll") ||
      lower.includes("voice passphrase") ||
      lower.includes("voice biometric") ||
      lower.includes("shabdam") ||
      lower.includes("voice set") ||
      lower.includes("voice evide") ||
      lower.includes("voice engane") ||
      lower.includes("voice register") ||
      lower.includes("voice setup") ||
      lower.includes("voice authentication");

    if (isVoiceAuthQuery) {
      return {
        message:
          "**Voice Authentication (Voice ID Login) — എവിടെ, എങ്ങനെ Enroll ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Account & Security Settings** (`/account/security`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം top-right profile icon click ചെയ്ത് **Account Settings → Security** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/account/security`\n\n" +
          "2️⃣ **\"Voice Biometric Enrollment\"** section-ൽ **\"Enroll Voice ID\"** click ചെയ്യുക.\n\n" +
          "3️⃣ **Passphrase** record ചെയ്യുക:\n" +
          "   • Screen-ൽ shown passphrase clearly speak ചെയ്യുക.\n" +
          "   • 3 recordings (multiple angles/moods) — better accuracy-ക്ക്.\n\n" +
          "4️⃣ **\"Save Voice Profile\"** click ചെയ്യുക.\n\n" +
          "5️⃣ **Login ചെയ്യുന്ന വിധം (Voice ID):**\n" +
          "   • Login page-ൽ **\"Voice Login\"** button click ചെയ്യുക.\n" +
          "   • Enrolled passphrase speak ചെയ്യുക → authenticated!\n\n" +
          "💡 **Admin-level Voice Enrollment** (users-ന് വേണ്ടി enroll ചെയ്യാൻ):\n" +
          "   → Admin → Users & RBAC (`/admin/users`) → User select → Voice Enrollment tab.\n\n" +
          "✅ Password type ചെയ്യേണ്ട, voice alone use ചെയ്ത് secure login!\n\n" +
          "*(Enrollment ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Face Recognition set cheyyaan",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 14. EVIDENCE EXPORT ───────────────────────────────────────────────
    const isEvidenceQuery =
      lower.includes("evidence") ||
      lower.includes("export clip") ||
      lower.includes("export video") ||
      lower.includes("chain of custody") ||
      lower.includes("video export") ||
      lower.includes("clip export") ||
      lower.includes("evidence export") ||
      lower.includes("download clip") ||
      lower.includes("save clip") ||
      lower.includes("evidence evide") ||
      lower.includes("evidence engane") ||
      lower.includes("evidence set") ||
      lower.includes("evidence package");

    if (isEvidenceQuery) {
      return {
        message:
          "**Evidence & Chain of Custody Export — എവിടെ, എങ്ങനെ Use ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Evidence & Chain of Custody** (`/evidence`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Investigate → Evidence & Chain of Custody** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/evidence`\n\n" +
          "2️⃣ **\"Create Evidence Package\"** click ചെയ്യുക.\n\n" +
          "3️⃣ Details fill ചെയ്യുക:\n" +
          "   • **Title** — case/incident name\n" +
          "   • **Camera & Time Range** — ഏത് camera, ഏത് time\n" +
          "   • **Video Clips** — specific time slots select ചെയ്ത് clip attach ചെയ്യുക\n" +
          "   • **Screenshots** — key frames add ചെയ്യാം\n\n" +
          "4️⃣ **HSM Digital Signature** — evidence package automatically HSM-signed ആകും (tamper-evident).\n\n" +
          "5️⃣ **Export:**\n" +
          "   • **Download** — local system-ലേക്ക് download ചെയ്യാം\n" +
          "   • **Share Link** — secure link generate ചെയ്ത് share ചെയ്യാം\n" +
          "   • **Email** — directly email ചെയ്യാം\n\n" +
          "6️⃣ **Audit Log** — evidence package access history automatically track ആകും.\n\n" +
          "✅ Legally admissible, tamper-evident evidence export — court/legal use-ന് ready!\n\n" +
          "*(Evidence export ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "AI Video Search set cheyyaan",
          "Incident management evide",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 15. MIS REPORTS ───────────────────────────────────────────────────
    const isMisQuery =
      lower.includes("mis report") ||
      lower.includes("executive report") ||
      lower.includes("daily report") ||
      lower.includes("graphic report") ||
      lower.includes("surveillance report") ||
      lower.includes("mis evide") ||
      lower.includes("mis engane") ||
      lower.includes("report evide") ||
      lower.includes("report engane") ||
      lower.includes("report kaanam") ||
      lower.includes("mis kaanam") ||
      lower.includes("mis dashboard") ||
      lower.includes("report download") ||
      lower.includes("mis download") ||
      lower.includes("surveillance digest");

    if (isMisQuery) {
      return {
        message:
          "**Executive MIS Reports & Daily Surveillance Digest — എവിടെ, എങ്ങനെ കാണാം:**\n\n" +
          "📍 **Path:** Dashboard → **Reports → Executive MIS Reports & Graphs** (`/reports/mis`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Reports → Executive MIS Reports & Graphs** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/reports/mis`\n\n" +
          "2️⃣ **Date Range** select ചെയ്യുക — Daily / Weekly / Monthly.\n\n" +
          "3️⃣ **Branch** filter ചെയ്യുക — ഏത് branch-ന്റെ report?\n\n" +
          "4️⃣ Report includes:\n" +
          "   • 📊 Camera uptime & health stats\n" +
          "   • 🚨 Alert summary (by category, severity)\n" +
          "   • 🎥 Recording coverage percentage\n" +
          "   • 👥 Footfall & crowd analytics\n" +
          "   • 🏦 Vault compliance (banking branches)\n" +
          "   • 📈 Charts & graphs\n\n" +
          "5️⃣ **Download / Export:**\n" +
          "   • **PDF** — printable format\n" +
          "   • **Excel** — data export\n" +
          "   • **Email** — schedule daily auto-email to executives\n\n" +
          "💡 **Daily Surveillance Digest:** `/reports` → automated daily summary.\n\n" +
          "✅ Management-ന് daily surveillance health at-a-glance!\n\n" +
          "*(Reports കാണാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Banking NBFC vault module set cheyyaan",
          "Evidence export cheyyaan",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 16. FALL DETECTION ────────────────────────────────────────────────
    const isFallQuery =
      lower.includes("fall detection") ||
      lower.includes("worker fall") ||
      lower.includes("elderly fall") ||
      lower.includes("fall alert") ||
      lower.includes("fall detect") ||
      lower.includes("fall evide") ||
      lower.includes("fall engane") ||
      lower.includes("fall set") ||
      lower.includes("veezhcha") ||
      lower.includes("veezhu") ||
      lower.includes("fall down") ||
      lower.includes("person fell");

    if (isFallQuery) {
      return {
        message:
          "**Fall Detection (Worker / Elderly) — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Analytics → Worker & Elderly Fall Detection** (`/analytics/fall`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Analytics → Worker & Elderly Fall** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/analytics/fall`\n\n" +
          "2️⃣ **Camera Assignment** — fall detection enable ചെയ്യേണ്ട cameras select ചെയ്യുക.\n" +
          "   • Factory floor, elderly care areas, staircases, etc.\n\n" +
          "3️⃣ **Detection Sensitivity** configure ചെയ്യുക:\n" +
          "   • High / Medium / Low (False alarm trade-off)\n\n" +
          "4️⃣ **Alert Rule Set ചെയ്യാൻ:**\n" +
          "   • Analytics → Rules & Automation (`/analytics/rules`) → Condition: `Fall Detection` select ചെയ്യുക.\n" +
          "   • Action: Alert / SMS / Guard Dispatch\n\n" +
          "✅ Fall detect ആകുമ്പോൾ immediate alert — medical emergency response ആകാം!\n\n" +
          "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Incident management evide",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 17. CAMERA TAMPER DETECTION ───────────────────────────────────────
    const isTamperQuery =
      lower.includes("tamper") ||
      lower.includes("camera tamper") ||
      lower.includes("defocus") ||
      lower.includes("blind camera") ||
      lower.includes("camera covered") ||
      lower.includes("camera blocked") ||
      lower.includes("camera obstruction") ||
      lower.includes("tamper evide") ||
      lower.includes("tamper engane") ||
      lower.includes("tamper set") ||
      lower.includes("tamper alert") ||
      lower.includes("camera vandal");

    if (isTamperQuery) {
      return {
        message:
          "**Camera Tamper & Defocus Detection — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Analytics → Camera Tamper & Defocus** (`/analytics/camera-tamper`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Analytics → Camera Tamper & Defocus** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/analytics/camera-tamper`\n\n" +
          "2️⃣ Tamper detection enable ചെയ്യേണ്ട **cameras select** ചെയ്യുക.\n\n" +
          "3️⃣ **Detection Types** enable ചെയ്യുക:\n" +
          "   • **Defocus** — camera lens blur ആകുമ്പോൾ alert\n" +
          "   • **Covered/Blocked** — camera physically block ചെയ്യുമ്പോൾ alert\n" +
          "   • **Moved/Redirected** — camera angle change ആകുമ്പോൾ alert\n" +
          "   • **Dark Frame** — camera feed black ആകുമ്പോൾ alert\n\n" +
          "4️⃣ **Alert Rule:**\n" +
          "   • Analytics → Rules & Automation → Condition: `Camera Tamper` select ചെയ്യുക.\n\n" +
          "✅ Camera vandalism immediately detect ആകും — security blind-spot ഉണ്ടാകില്ല!\n\n" +
          "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Camera obstruction set cheyyaan",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // ── 18. EMPLOYEE / PEOPLE TRACKING & ATTENDANCE ───────────────────────
    const isAttendanceQuery =
      lower.includes("attendance") ||
      lower.includes("employee tracking") ||
      lower.includes("people tracking") ||
      lower.includes("footfall") ||
      lower.includes("visitor tracking") ||
      lower.includes("heatmap") ||
      lower.includes("people count") ||
      lower.includes("headcount") ||
      lower.includes("attendance evide") ||
      lower.includes("attendance engane") ||
      lower.includes("attendance set") ||
      lower.includes("employee evide") ||
      lower.includes("employee engane") ||
      lower.includes("people evide") ||
      lower.includes("haajari");

    if (isAttendanceQuery) {
      return {
        message:
          "**People Counting, Heatmaps & Employee Tracking — എവിടെ, എങ്ങനെ Set ചെയ്യാം:**\n\n" +
          "📍 **Path:** Dashboard → **Analytics → People Counting & Heatmaps** (`/analytics/people`)\n\n" +
          "**Step-by-Step ഇൻസ്ട്രക്ഷൻ:**\n\n" +
          "1️⃣ Login ചെയ്ത ശേഷം sidebar-ൽ **Analytics → People Counting & Heatmaps** click ചെയ്യുക.\n" +
          "   🔗 Direct URL: `/analytics/people`\n\n" +
          "2️⃣ **Camera Assignment** — people count ചെയ്യേണ്ട cameras select ചെയ്യുക.\n" +
          "   • Entrance cameras, lobby cameras, floor cameras\n\n" +
          "3️⃣ **Counting Zones** define ചെയ്യുക — entrance line draw ചെയ്ത് IN / OUT count ചെയ്യാം.\n\n" +
          "4️⃣ **Heatmap View** — ഏത് area-ൽ ആളുകൾ കൂടുതൽ time spend ചെയ്യുന്നു എന്ന് visualize ആകും.\n\n" +
          "5️⃣ **Employee Activity Tracking:**\n" +
          "   • Face Recognition + People Counting combine ചെയ്ത് employee presence track ആകും.\n" +
          "   • Reports → Daily Digest-ൽ headcount summary കിട്ടും.\n\n" +
          "✅ Real-time footfall count, peak hours, zone utilization — all automatically!\n\n" +
          "*(Configuration ചെയ്യാൻ KryptonVision-ലേക്ക് ആദ്യം sign in ചെയ്യുക)*",
        type: "text",
        suggestions: [
          "How do I sign in?",
          "Face Recognition set cheyyaan",
          "MIS Reports evide kaanam",
          "What AI features are available?",
        ],
        timestamp,
      };
    }

    // 7. Request for module data, operational records, cameras, alerts, reports (Requires Login)

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
      lower.includes("nbfc") ||
      lower.includes("attendance") ||
      lower.includes("employee") ||
      lower.includes("visitor") ||
      lower.includes("report") ||
      lower.includes("mis") ||
      lower.includes("guard") ||
      lower.includes("door") ||
      lower.includes("lock") ||
      lower.includes("dispatch") ||
      lower.includes("show me") ||
      lower.includes("open ") ||
      lower.includes("poku") ||
      lower.includes("kaanik") ||
      lower.includes("edukk") ||
      lower.includes("navigate") ||
      lower.includes("dashboard") ||
      lower.includes("module");

    if (isModuleOrOperationalRequest) {
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

    // 8. General fallback for unauthenticated guest
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
           WHERE rn.tenant_id = $1 AND c.status = 'offline'`,
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
  }
}
