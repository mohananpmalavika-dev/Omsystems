export const roleWorkspacePaths: Record<string, string[]> = {
  operator: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/control-room", "/operations/alerts", "/analytics/alerts", "/incidents", "/video-search", "/playback/synced", "/recordings", "/operations/storage", "/operations/cameras", "/operations/recording"],
  security_officer: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/control-room", "/operations/alerts", "/analytics/alerts", "/incidents", "/video-search", "/playback/synced", "/evidence", "/digital-twin", "/security-devices", "/operations/branches", "/analytics/anpr-logistics", "/analytics/nbfc-watchlist", "/security/device-health", "/analytics/banking", "/operations/storage", "/operations/cameras", "/operations/recording", "/recordings"],
  viewer: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/control-room", "/video-search", "/playback/synced", "/recordings"],
  branch_manager: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/operations/branches", "/operations/cameras", "/security-devices", "/analytics/alerts", "/operations/recording", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/maintenance/camera-map", "/security/device-health", "/analytics/branch-comparison", "/analytics/banking"],
  zone_manager: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/operations/branches", "/operations/cameras", "/security-devices", "/analytics/alerts", "/operations/recording", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/reports", "/analytics/branch-comparison", "/security/device-health"],
  region_manager: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/operations/branches", "/operations/cameras", "/security-devices", "/analytics/alerts", "/operations/recording", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/reports", "/analytics/branch-comparison", "/security/device-health"],
  area_manager: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/operations/branches", "/operations/cameras", "/security-devices", "/analytics/alerts", "/operations/recording", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/analytics/branch-comparison", "/security/device-health"],
  auditor: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/evidence", "/analytics/alerts", "/compliance", "/compliance/assessments", "/compliance/controls", "/compliance/risks", "/activity-report", "/audit/branch-compliance", "/audit/health", "/audit/maintenance", "/reports", "/analytics/branch-comparison"],
  compliance_officer: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/compliance/overview", "/compliance", "/analytics/alerts", "/compliance/assessments", "/compliance/controls", "/compliance/risks", "/compliance/evidence", "/compliance/findings", "/maintenance/privacy", "/audit/branch-compliance", "/activity-report", "/reports", "/analytics/branch-comparison"],
  admin: ["/nbfc-operations", "/role-dashboard", "/", "/modules", "/analytics/alerts", "/digital-twin", "/security-devices", "/operations/branches", "/operations/storage", "/operations/cameras", "/operations/recording", "/recordings", "/admin/organization", "/admin/organization?tab=hierarchy", "/admin/organization?tab=employees", "/admin/organization?tab=roles", "/admin/branch-onboarding", "/admin/zero-touch", "/admin/camera-import-export", "/maintenance/device-configuration", "/maintenance/device-management", "/integrations", "/admin/system", "/account/security", "/analytics/anpr-logistics", "/analytics/nbfc-watchlist", "/security/device-health", "/analytics/branch-comparison", "/analytics/banking"],
};

const roleAliases: Record<string, string> = {
  super_admin: "admin",
  company_admin: "admin",
  hq_admin: "admin",
  superadmin: "admin",
};

export function defaultRoleWorkspace(role?: string): string[] {
  const normalizedRole = roleAliases[role ?? ""] ?? role ?? "operator";
  return roleWorkspacePaths[normalizedRole] ?? roleWorkspacePaths.operator;
}
