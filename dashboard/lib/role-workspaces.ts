export const roleWorkspacePaths: Record<string, string[]> = {
  operator: ["/nbfc-operations", "/role-dashboard", "/", "/control-room", "/operations/alerts", "/analytics/alerts", "/incidents", "/video-search", "/playback/synced", "/recordings"],
  security_officer: ["/nbfc-operations", "/role-dashboard", "/", "/control-room", "/operations/alerts", "/analytics/alerts", "/incidents", "/video-search", "/playback/synced", "/evidence", "/analytics/anpr-logistics", "/analytics/nbfc-watchlist", "/security/device-health", "/analytics/banking"],
  viewer: ["/nbfc-operations", "/role-dashboard", "/", "/control-room", "/video-search", "/playback/synced", "/recordings"],
  branch_manager: ["/nbfc-operations", "/role-dashboard", "/", "/operations/branches", "/operations/cameras", "/analytics/alerts", "/operations/recording", "/operations/workorders", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/security/device-health", "/analytics/branch-comparison", "/analytics/banking"],
  zone_manager: ["/nbfc-operations", "/role-dashboard", "/", "/operations/branches", "/operations/cameras", "/analytics/alerts", "/operations/recording", "/operations/workorders", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/reports", "/analytics/branch-comparison", "/security/device-health"],
  region_manager: ["/nbfc-operations", "/role-dashboard", "/", "/operations/branches", "/operations/cameras", "/analytics/alerts", "/operations/recording", "/operations/workorders", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/reports", "/analytics/branch-comparison", "/security/device-health"],
  area_manager: ["/nbfc-operations", "/role-dashboard", "/", "/operations/branches", "/operations/cameras", "/analytics/alerts", "/operations/recording", "/operations/workorders", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/analytics/branch-comparison", "/security/device-health"],
  auditor: ["/nbfc-operations", "/role-dashboard", "/", "/evidence", "/analytics/alerts", "/compliance", "/compliance/assessments", "/compliance/controls", "/compliance/risks", "/activity-report", "/audit/branch-compliance", "/audit/health", "/audit/maintenance", "/reports", "/analytics/branch-comparison"],
  compliance_officer: ["/nbfc-operations", "/role-dashboard", "/", "/compliance/overview", "/compliance", "/analytics/alerts", "/compliance/assessments", "/compliance/controls", "/compliance/risks", "/compliance/evidence", "/compliance/findings", "/maintenance/privacy", "/audit/branch-compliance", "/activity-report", "/reports", "/analytics/branch-comparison"],
  admin: ["/nbfc-operations", "/role-dashboard", "/", "/analytics/alerts", "/admin/organization", "/admin/organization?tab=hierarchy", "/admin/organization?tab=employees", "/admin/organization?tab=roles", "/admin/branch-onboarding", "/admin/zero-touch", "/maintenance/device-configuration", "/maintenance/device-management", "/integrations", "/admin/system", "/account/security", "/analytics/anpr-logistics", "/analytics/nbfc-watchlist", "/security/device-health", "/analytics/branch-comparison", "/analytics/banking"],
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
