export type SectionJourney = {
  title: string;
  description: string;
  routes: string[];
};

export type SectionHub = {
  slug: string;
  group: string;
  title: string;
  lead: string;
  context: string;
  journeys: SectionJourney[];
};

export const sectionHubs: SectionHub[] = [
  {
    slug: "workspace",
    group: "WORKSPACE",
    title: "Start with the whole picture.",
    lead: "Get oriented, then move into the work that needs you.",
    context: "Your starting point for branch security and daily operations.",
    journeys: [
      { title: "Review the estate", description: "See the operating picture before you act.", routes: ["/nbfc-operations", "/", "/role-dashboard"] },
      { title: "Find your next tool", description: "Open the full directory when a specialist task comes up.", routes: ["/modules", "/dashboards"] },
    ],
  },
  {
    slug: "surveillance",
    group: "SURVEILLANCE & INVESTIGATION",
    title: "See it. Trace it. Preserve it.",
    lead: "Move from live coverage to a verified incident record.",
    context: "A practical route from observation through investigation and response.",
    journeys: [
      { title: "Watch and triage", description: "Check live feeds, then inspect the signals requiring attention.", routes: ["/control-room", "/analytics/alerts", "/incidents"] },
      { title: "Reconstruct the event", description: "Find the moment, synchronize playback, and secure the evidence.", routes: ["/video-search", "/playback/synced", "/evidence"] },
      { title: "Confirm continuity", description: "Check that recording and device alerts support the investigation.", routes: ["/recordings", "/operations/alerts"] },
    ],
  },
  {
    slug: "communications",
    group: "COMMUNICATIONS",
    title: "Keep every response connected.",
    lead: "Reach the right people and keep branch devices ready.",
    context: "Voice coordination and device connection in one place.",
    journeys: [
      { title: "Coordinate a response", description: "Start a call or intercom session with the branch team.", routes: ["/communications/calls"] },
      { title: "Connect the estate", description: "Enroll and manage the devices that carry the conversation.", routes: ["/communications/connect", "/communications/admin/devices"] },
    ],
  },
  {
    slug: "intelligence",
    group: "INTELLIGENCE & AI",
    title: "Turn signals into decisions.",
    lead: "Understand emerging risk, investigate patterns, and tune detection.",
    context: "Analytics workflows across branches, people, vehicles, and space.",
    journeys: [
      { title: "Assess branch risk", description: "Begin with the risk picture and inspect future pressure points.", routes: ["/analytics", "/analytics/predictions", "/analytics/banking"] },
      { title: "Follow a signal", description: "Examine identities and vehicles, then take the case into investigation.", routes: ["/analytics/face-recognition", "/analytics/anpr", "/analytics/investigation"] },
      { title: "Shape detection", description: "Review rules and the spatial context behind the alert.", routes: ["/analytics/rules", "/digital-twin"] },
    ],
  },
  {
    slug: "device-health",
    group: "DEVICE HEALTH & MAINTENANCE",
    title: "Protect branch uptime.",
    lead: "Find the failing link, restore coverage, and verify recovery.",
    context: "Operational readiness from camera to recorder and storage.",
    journeys: [
      { title: "Locate the issue", description: "Start with camera and branch health to identify the affected site.", routes: ["/operations/cameras", "/operations/branches", "/security-devices"] },
      { title: "Restore recording", description: "Check the recording chain and available storage.", routes: ["/operations/recording", "/operations/storage", "/maintenance/device-configuration"] },
      { title: "Plan the field fix", description: "Use the asset record and work orders to close the loop.", routes: ["/maintenance/assets", "/maintenance/workorders", "/maintenance/camera-map"] },
    ],
  },
  {
    slug: "assurance",
    group: "AUDIT, MIS & COMPLIANCE",
    title: "Make readiness visible.",
    lead: "Bring controls, evidence, and reporting into one review path.",
    context: "From operational proof to the report you need to deliver.",
    journeys: [
      { title: "Review controls", description: "Assess requirements and see where supporting evidence is needed.", routes: ["/compliance", "/compliance/controls", "/compliance/evidence"] },
      { title: "Inspect the branch", description: "Check branch and camera health against your audit obligations.", routes: ["/audit/branch-compliance", "/audit/health", "/activity-report"] },
      { title: "Publish the picture", description: "Prepare operational, executive, and cost reports.", routes: ["/reports", "/reports/mis", "/reports/financial"] },
    ],
  },
  {
    slug: "administration",
    group: "ADMINISTRATION",
    title: "Set up and manage your estate.",
    lead: "Bring branches, people, cameras, and gateways into service.",
    context: "The controls for onboarding, access, and platform health.",
    journeys: [
      { title: "Set up a branch", description: "Onboard a site, activate its gateway, and bring in cameras.", routes: ["/admin/branch-onboarding", "/admin/zero-touch", "/admin/camera-import-export"] },
      { title: "Manage access", description: "Organize teams and review their permissions.", routes: ["/admin/organization"] },
      { title: "Check the platform", description: "Open the administration tools and review system health.", routes: ["/admin", "/admin/system"] },
    ],
  },
  {
    slug: "others",
    group: "OTHERS",
    title: "Keep the platform ready.",
    lead: "Reach the controls and account tools that support daily work.",
    context: "Platform settings and diagnostics in one short route.",
    journeys: [
      { title: "Check the fleet", description: "Inspect gateway and camera diagnostics for a branch.", routes: ["/admin/zero-touch/diagnostics"] },
      { title: "Tune your setup", description: "Review features, alert controls, and your account security.", routes: ["/admin/features", "/settings/alerts", "/account/security"] },
    ],
  },
];

export function sectionHubHref(group: string): string | undefined {
  const hub = sectionHubs.find((entry) => entry.group === group);
  return hub ? `/workspaces/${hub.slug}` : undefined;
}
