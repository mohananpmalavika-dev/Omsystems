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
  { label: "Edge Agent Management", href: "/operations/edge-fleet", category: "OPERATIONS", keywords: ["edge agent", "fleet", "gateways", "edge fleet"] },
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
  { label: "AI Rules & Automation", href: "/analytics/rules", category: "INTELLIGENCE & AI", keywords: ["ai rules", "rules", "automation", "alert rules"] },
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
  { label: "Third-Party Integrations", href: "/integrations", category: "ADMINISTRATION", keywords: ["integrations", "third party", "webhooks", "hikvision ax pro", "third party integrations"] },
  { label: "Notification Policies", href: "/operations/alert-notification-policy", category: "ADMINISTRATION", keywords: ["notification policies", "notifications", "alert policies"] },
  { label: "Camera Import / Export (Excel)", href: "/admin/camera-import-export", category: "ADMINISTRATION", keywords: ["camera import", "camera export", "excel import"] },
  { label: "Stream Quality Settings", href: "/admin/stream-settings", category: "ADMINISTRATION", keywords: ["stream quality", "main stream", "sub stream"] },
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

export interface GuardianResponse {
  message: string;
  type: "text" | "action" | "suggestion" | "warning" | "error";
  actions?: Array<{
    function: string;
    parameters: Record<string, any>;
    executed: boolean;
    result?: any;
  }>;
  suggestions?: string[];
  requiresConfirmation?: boolean;
  timestamp: string;
}

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

YOUR RULES FOR GUEST MODE:
1. GENERAL QUESTIONS (PERMITTED):
   - You CAN freely answer questions about KryptonVision platform features, architecture, and system capabilities.
   - You CAN explain AI video analytics (facial recognition, perimeter intrusion, crowd counting, loitering detection, vehicle ANPR).
   - You CAN explain CCTV camera support: ONVIF (Profile S/G/T), RTSP, and native compatibility with vendors like Hikvision, Dahua, CP Plus, Axis, Uniview, and Hanwha.
   - You CAN guide users on how to log in (Username/Password or Voice ID), how to reset passwords via OTP, and how to contact the administrator.

2. ORGANIZATION & MODULE DATA (STRICTLY PROHIBITED FOR GUESTS):
   - You do NOT have access to live camera streams, real-time alerts, incident logs, branch status, vault/banking monitoring, employee attendance, or any organization-specific operational data.
   - If the user asks for ANY live cameras, video feeds, alerts, incidents, branch data, or module operations, you MUST politely refuse and instruct them to log in:
     "To view live camera feeds, branch status, security alerts, and operational module data, please sign in to your KryptonVision account on the login page."

Personality: Professional, welcoming, concise, and helpful.`,
      };
    }

    return {
      role: "system",
      content: `You are KryptonAI, an intelligent AI security assistant similar to JARVIS.

Your role:
- Monitor security operations across all branches
- Provide proactive suggestions for security improvements
- Execute commands when requested
- Explain incidents and anomalies
- Assist operators in emergency situations
- Be concise, professional, and action-oriented

Current context:
- User ID: ${context.userId}
- Tenant: ${context.tenantId}
- Current Branch: ${context.currentBranchId || "All branches"}
- Recent Alerts: ${context.recentAlerts?.length || 0}

Personality:
- Professional but friendly
- Proactive in suggesting actions
- Clear and concise communication
- Emergency-aware (prioritize critical situations)
- Use "I" (e.g., "I recommend dispatching a guard")

When users give commands:
- Use function calls to execute actions
- Confirm actions before execution if critical
- Provide status updates
- Suggest follow-up actions`,
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
    if (
      lower.includes("feature") ||
      lower.includes("analytic") ||
      lower.includes("capability") ||
      lower.includes("face recognition") ||
      lower.includes("facial") ||
      lower.includes("anpr") ||
      lower.includes("license plate") ||
      lower.includes("intrusion") ||
      lower.includes("crowd") ||
      lower.includes("loitering") ||
      lower.includes("ai") ||
      lower.includes("enthellam")
    ) {
      return {
        message:
          "**KryptonVision AI & Security Capabilities:**\n\n• **Facial Recognition:** Instant identification of enrolled employees, VIP visitors, and blacklisted individuals.\n• **Perimeter & Intrusion Detection:** Virtual tripwires, sterile zone breach alarms, and boundary protection.\n• **Vehicle ANPR:** Automatic license plate recognition with allowlist/blocklist alerts.\n• **Crowd & Loitering Analytics:** Overcrowding alerts and suspicious loitering detection.\n• **NBFC/Banking Security:** Automated vault dual-custody monitoring, cash counter supervision, and guard presence audit.\n• **Incident Workflow:** Automated operator dispatches, audit trails, and daily executive MIS graphic reports.",
        type: "text",
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
