export const roleWorkspacePaths: Record<string, string[]> = {
  operator: ["/", "/control-room", "/operations/alerts", "/analytics/alerts", "/incidents", "/video-search", "/playback/synced", "/recordings"],
  security_officer: ["/", "/control-room", "/operations/alerts", "/analytics/alerts", "/incidents", "/video-search", "/playback/synced", "/evidence"],
  viewer: ["/", "/control-room", "/video-search", "/playback/synced", "/recordings"],
  branch_manager: ["/", "/operations/branches", "/operations/cameras", "/operations/recording", "/operations/workorders", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health"],
  zone_manager: ["/", "/operations/branches", "/operations/cameras", "/operations/recording", "/operations/workorders", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/reports"],
  region_manager: ["/", "/operations/branches", "/operations/cameras", "/operations/recording", "/operations/workorders", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health", "/reports"],
  area_manager: ["/", "/operations/branches", "/operations/cameras", "/operations/recording", "/operations/workorders", "/operations/storage", "/operations/network", "/operations/edge-agents", "/maintenance/workorders", "/maintenance/health"],
  auditor: ["/", "/evidence", "/compliance", "/compliance/assessments", "/compliance/controls", "/compliance/risks", "/activity-report", "/audit/branch-compliance", "/audit/health", "/audit/maintenance", "/reports"],
  admin: ["/", "/admin/organization?tab=hierarchy", "/admin/organization?tab=employees", "/admin/organization?tab=roles", "/admin/branch-onboarding", "/admin/zero-touch", "/maintenance/device-configuration", "/maintenance/device-management", "/integrations", "/admin/system", "/account/security"],
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
