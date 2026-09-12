"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  BellRing,
  Boxes,
  Building2,
  CalendarClock,
  Camera,
  CarFront,
  ChevronDown,
  ChevronRight,
  ChevronsUpDown,
  CircleUserRound,
  ClipboardCheck,
  Command,
  Cpu,
  Database,
  DoorClosed,
  Factory,
  FileCheck2,
  FileClock,
  FileSearch,
  FileSpreadsheet,
  FileText,
  FileVideo2,

  Gauge,
  Globe2,
  Grid2X2,
  Handshake,
  HeartPulse,
  HelpCircle,
  Landmark,
  Layers,
  LayoutDashboard,
  LayoutGrid,
  Library,
  LockKeyhole,
  LogOut,
  Menu,
  MonitorPlay,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Radar,
  Radio,
  Route,
  ScanFace,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  Sparkles,
  TrendingUp,
  Truck,
  UserRoundCog,
  Users,
  Video,
  Wifi,

  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { createContext, Suspense, useContext, useEffect, useMemo, useRef, useState } from "react";
import { logout } from "@/lib/auth-manager";
import { authApi } from "@/lib/api-client";
import { AlertAudioIndicator } from "@/components/alerts/alert-audio-indicator";
import { AlertNotificationTray } from "@/components/alerts/alert-notification-tray";
import { defaultRoleWorkspace } from "@/lib/role-workspaces";
import { hasUnrestrictedMenuAccess } from "@/lib/navigation-access";

interface AppLayoutProps {
  children: React.ReactNode;
  incidentCount?: number;
  cameraCount?: number;
}

export type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: "cameras" | "incidents";
};

export type MenuAccessUser = {
  username?: string;
  role?: string;
  customRoleId?: string;
  customRoleName?: string;
  menuAccess?: unknown;
  menu_access?: unknown;
  preferences?: { menuAccess?: unknown; menu_access?: unknown };
};

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const navigation: NavGroup[] = [
  {
    label: "WORKSPACE",
    icon: LayoutGrid,
    items: [
      { label: "Module Directory", href: "/modules", icon: LayoutGrid },
      { label: "Support Center", href: "/support", icon: HelpCircle },
    ],
  },
  {
    label: "OPERATIONS",
    icon: LayoutDashboard,
    items: [
      { label: "Command Center", href: "/", icon: LayoutDashboard },
      { label: "Executive Dashboard", href: "/dashboards", icon: BarChart3 },
      { label: "Fleet Branches", href: "/operations/branches", icon: Building2 },
      { label: "Live Video Wall", href: "/control-room", icon: MonitorPlay },
      { label: "AI Alerts & Incidents", href: "/analytics/alerts", icon: BellRing },
      { label: "Alert Operations", href: "/operations/alerts", icon: Radio },
      { label: "Alert Command Center", href: "/operations/alert-command-center", icon: Bell },
      { label: "Incident Response", href: "/incidents", icon: Siren, badge: "incidents" },
      { label: "Security Operations", href: "/security-operations", icon: Shield },
      { label: "Media Pipeline & Scheduler", href: "/operations/media-pipeline", icon: Layers },
      { label: "HA Failover Cluster", href: "/operations/ha-failover", icon: Server },
      { label: "Edge Fleet Lifecycle", href: "/operations/edge-fleet", icon: Server },
      { label: "Infrastructure Operations", href: "/operations/infrastructure", icon: Network },
      { label: "Fleet Maintenance Command", href: "/operations/maintenance", icon: Wrench },
      { label: "Fleet Observability & SLO", href: "/operations/observability", icon: BarChart3 },
      { label: "Performance Observability", href: "/performance", icon: Gauge },
    ],
  },
  {
    label: "HEALTH & HARDWARE LAB",
    icon: HeartPulse,
    items: [
      { label: "Camera 7-Layer Health", href: "/operations/cameras", icon: Camera, badge: "cameras" },
      { label: "Recorders & NVR Health", href: "/maintenance/dvr-nvr-monitor", icon: Server },
      { label: "Hardware Compatibility Lab", href: "/maintenance/compatibility", icon: SlidersHorizontal },
      { label: "Storage & SATA HDDs", href: "/operations/storage", icon: Database },
      { label: "Recording Continuity", href: "/operations/recording", icon: FileVideo2 },
      { label: "Retention Compliance (90d)", href: "/compliance/recording", icon: FileCheck2 },
      { label: "Network & WAN Links", href: "/operations/network", icon: Wifi },
      { label: "Power & UPS Telemetry", href: "/operations/ups", icon: Activity },
      { label: "Edge Gateways", href: "/operations/edge-agents", icon: Cpu },
      { label: "Device Connectivity", href: "/operations/device-connectivity", icon: Network },
      { label: "Diagnostic Scans & Health", href: "/maintenance/health", icon: Gauge },
      { label: "Diagnostics & Connectivity", href: "/diagnostics", icon: Gauge },
      { label: "Security Device Inventory", href: "/security-devices", icon: Server },
      { label: "Network Device Discovery", href: "/security-devices/discovery", icon: Radar },
      { label: "Branch Security Posture", href: "/security-devices/branch-posture", icon: ShieldCheck },
      { label: "Security Device Integrations", href: "/security-devices/integrations", icon: Workflow },
      { label: "Portable Camera Enrollment", href: "/portable-camera/enroll", icon: Camera },
    ],
  },
  {
    label: "INVESTIGATE & PLAYBACK",
    icon: FileSearch,
    items: [
      { label: "AI Smart Video Search", href: "/video-search", icon: Search },
      { label: "Multi-Camera Synced Playback", href: "/playback/synced", icon: Play },
      { label: "Video Recordings Vault", href: "/recordings", icon: FileVideo2 },
      { label: "Evidence & Chain of Custody", href: "/evidence", icon: FileCheck2 },
      { label: "Root-Cause Analysis (RCA)", href: "/operations/rca-analysis", icon: FileSearch },
    ],
  },
  {
    label: "INTELLIGENCE & AI",
    icon: Sparkles,
    items: [
      { label: "AI Command Center", href: "/operations/ai-command-center", icon: Command },
      { label: "Predictive Health & Forecasts", href: "/maintenance/predictive", icon: TrendingUp },
      { label: "Video Analytics Hub", href: "/analytics", icon: Activity },
      { label: "AI Rules & Automation", href: "/analytics/rules", icon: SlidersHorizontal },
      { label: "Face Recognition & Watchlists", href: "/analytics/face-recognition", icon: ScanFace },
      { label: "ANPR & Vehicle Telemetry", href: "/analytics/anpr", icon: CarFront },
      { label: "People Counting & Heatmaps", href: "/analytics/people", icon: Users },
      { label: "Crowd & Counter Queue", href: "/analytics/crowd", icon: Users },
      { label: "Multi-Camera Person Re-ID", href: "/analytics/reid", icon: Route },
      { label: "Access Tailgating & Airlocks", href: "/analytics/tailgating", icon: DoorClosed },
      { label: "Banking & Cash Counters", href: "/analytics/banking", icon: Landmark },
      { label: "Industrial Safety & PPE", href: "/analytics/industrial", icon: Factory },
      { label: "Digital Twin (Spatial 3D)", href: "/digital-twin", icon: Boxes },
      { label: "Infrastructure Twin", href: "/infrastructure-twin", icon: Network },
      { label: "Multi-Site Federation", href: "/federation", icon: Globe2 },
    ],
  },
  {
    label: "FLEET MAINTENANCE",
    icon: Wrench,
    items: [
      { label: "Device Configuration Center", href: "/maintenance/device-configuration", icon: SlidersHorizontal },
      { label: "Hardware Asset Registry", href: "/maintenance/assets", icon: Library },
      { label: "Asset Replacement & Lineage", href: "/operations/assets", icon: Boxes },
      { label: "Maintenance Work Orders", href: "/maintenance/workorders", icon: ClipboardCheck },
      { label: "Vendor & Service Directory", href: "/maintenance/vendors", icon: Handshake },
      { label: "AMC & Warranty Contracts", href: "/maintenance/amc", icon: FileClock },
      { label: "Maintenance Reports & SLA", href: "/maintenance/reports", icon: FileText },
    ],
  },
  {
    label: "ASSURANCE & GOVERNANCE",
    icon: ShieldCheck,
    items: [
      { label: "Assurance Hub", href: "/compliance/overview", icon: ShieldCheck },
      { label: "Compliance Frameworks", href: "/compliance", icon: ShieldCheck },
      { label: "Compliance Dashboard", href: "/compliance/dashboard", icon: LayoutDashboard },
      { label: "Assessments & Audits", href: "/compliance/assessments", icon: ClipboardCheck },
      { label: "Controls & Remediation", href: "/compliance/controls", icon: SlidersHorizontal },
      { label: "Compliance Risk Register", href: "/compliance/risks", icon: ShieldAlert },
      { label: "Compliance Policies", href: "/compliance/policies", icon: FileText },
      { label: "Compliance Evidence", href: "/compliance/evidence", icon: FileCheck2 },
      { label: "Compliance Findings", href: "/compliance/findings", icon: AlertTriangle },
      { label: "Compliance Certificates", href: "/compliance/certificates", icon: FileCheck2 },
      { label: "Privacy Governance (DPIA)", href: "/maintenance/privacy", icon: LockKeyhole },
      { label: "Privacy Breach Incident Log", href: "/maintenance/privacy/breaches", icon: ShieldAlert },
      { label: "Camera Privacy Controls", href: "/maintenance/privacy/cameras", icon: Camera },
    ],
  },
  {
    label: "AUDIT & REPORTING",
    icon: FileText,
    items: [
      { label: "Daily Surveillance Digest", href: "/reports", icon: FileSearch },
      { label: "Branch Compliance Audit", href: "/audit/branch-compliance", icon: Building2 },
      { label: "Camera Health Audit", href: "/audit/health", icon: Gauge },
      { label: "Maintenance & SLA Audit", href: "/audit/maintenance", icon: CalendarClock },
      { label: "Activity & Access Logs", href: "/activity-report", icon: UserRoundCog },
    ],
  },
  {
    label: "ADMINISTRATION",
    icon: Settings,
    items: [
      { label: "Organization & Location Hierarchy", href: "/admin/organization?tab=hierarchy", icon: Building2 },
      { label: "Employees & Location Grants", href: "/admin/organization?tab=employees", icon: Users },
      { label: "Role vs Menu Permissions", href: "/admin/organization?tab=roles", icon: Shield },
      { label: "Platform Capability Matrix", href: "/admin/platform/capabilities", icon: ShieldCheck },
      { label: "Branch Onboarding Wizard", href: "/admin/branch-onboarding", icon: Building2, badge: "cameras" },
      { label: "Zero-Touch Provisioning (ZTP)", href: "/admin/zero-touch", icon: Cpu },
      { label: "ZTP Fleet Diagnostics", href: "/admin/zero-touch/diagnostics", icon: Gauge },
      { label: "AI Quality & Model Registry", href: "/admin/ai-quality", icon: Sparkles },
      { label: "HA Topology & Chaos Lab", href: "/admin/ha-topology", icon: Server },
      { label: "Automated UI Audit", href: "/admin/qa/ui-audit", icon: Sparkles },
      { label: "Database Tables & Data", href: "/admin/database", icon: Database },
      { label: "Device Configuration Center", href: "/maintenance/device-configuration", icon: SlidersHorizontal },
      { label: "Device Registry & ONVIF", href: "/maintenance/device-management", icon: Server },
      { label: "Third-Party Integrations", href: "/integrations", icon: Workflow },
      { label: "Notification Policies", href: "/operations/alert-notification-policy", icon: Bell },
      { label: "Camera Import / Export (Excel)", href: "/admin/camera-import-export", icon: FileSpreadsheet },
      { label: "Stream Quality (Main/Sub Stream)", href: "/admin/stream-settings", icon: Video },
      { label: "System Management & OTA", href: "/admin/system", icon: Settings },


      { label: "Mobile Operations View", href: "/mobile", icon: Truck },
      { label: "Account & Security Settings", href: "/account/security", icon: LockKeyhole },
    ],
  },
];

const legacyRoleWorkspacePaths: Record<string, string[]> = {
  operator: [
    "/",
    "/control-room",
    "/operations/alerts",
    "/analytics/alerts",
    "/incidents",
    "/video-search",
    "/playback/synced",
    "/recordings",
  ],
  security_officer: [
    "/",
    "/control-room",
    "/operations/alerts",
    "/analytics/alerts",
    "/incidents",
    "/video-search",
    "/playback/synced",
    "/evidence",
  ],
  viewer: ["/", "/control-room", "/video-search", "/playback/synced", "/recordings"],
  branch_manager: [
    "/",
    "/operations/branches",
    "/operations/cameras",
    "/operations/recording",
    "/operations/workorders",
    "/operations/storage",
    "/operations/network",
    "/operations/edge-agents",
    "/maintenance/workorders",
    "/maintenance/health",
  ],
  zone_manager: [
    "/",
    "/operations/branches",
    "/operations/cameras",
    "/operations/recording",
    "/operations/workorders",
    "/operations/storage",
    "/operations/network",
    "/operations/edge-agents",
    "/maintenance/workorders",
    "/maintenance/health",
    "/reports",
  ],
  region_manager: [
    "/",
    "/operations/branches",
    "/operations/cameras",
    "/operations/recording",
    "/operations/workorders",
    "/operations/storage",
    "/operations/network",
    "/operations/edge-agents",
    "/maintenance/workorders",
    "/maintenance/health",
    "/reports",
  ],
  area_manager: [
    "/",
    "/operations/branches",
    "/operations/cameras",
    "/operations/recording",
    "/operations/workorders",
    "/operations/storage",
    "/operations/network",
    "/operations/edge-agents",
    "/maintenance/workorders",
    "/maintenance/health",
  ],
  auditor: [
    "/",
    "/evidence",
    "/compliance",
    "/compliance/assessments",
    "/compliance/controls",
    "/compliance/risks",
    "/activity-report",
    "/audit/branch-compliance",
    "/audit/health",
    "/audit/maintenance",
    "/reports",
  ],
  admin: [
    "/",
    "/admin/organization?tab=hierarchy",
    "/admin/organization?tab=employees",
    "/admin/organization?tab=roles",
    "/admin/branch-onboarding",
    "/admin/zero-touch",
    "/maintenance/device-configuration",
    "/maintenance/device-management",
    "/integrations",
    "/admin/system",
    "/account/security",
  ],
};

const roleAliases: Record<string, string> = {
  super_admin: "admin",
  company_admin: "admin",
  hq_admin: "admin",
  superadmin: "admin",
};

export function menuKey(item: NavItem) {
  return item.href;
}

export function defaultMenuAccessForRole(role?: string) {
  return defaultRoleWorkspace(role);
}

function filterNavigationByAllowed(navigationItems: NavGroup[], allowed: Set<string>) {
  return navigationItems
    .map((group) => ({
      ...group,
      items: group.items.filter((item) => {
        const key = menuKey(item);
        const path = routePath(item.href);
        return allowed.has(key) || allowed.has(path);
      }),
    }))
    .filter((group) => group.items.length > 0);
}

export function getAuthorizedNavigation(user: MenuAccessUser | null | undefined) {
  return filterNavigationByAllowed(navigation, effectiveMenuAccess(user));
}

export function getVisibleNavigation(user: MenuAccessUser | null | undefined) {
  if (!user) return filterNavigationByAllowed(navigation, new Set(defaultMenuAccessForRole("operator")));
  // A custom role is an explicit restriction, including when its base role is
  // administrative. Never let the broad base role silently override menus
  // selected by a tenant administrator.
  if (hasCustomMenuConfiguration(user)) return getAuthorizedNavigation(user);
  if (hasUnrestrictedMenuAccess(user)) {
    return navigation;
  }
  return getAuthorizedNavigation(user);
}

export function hasCustomMenuConfiguration(user: MenuAccessUser | null | undefined) {
  // A custom role is a restriction. If its menu list is absent or malformed,
  // fail closed rather than accidentally falling back to the broad base role.
  return Boolean(user?.customRoleId);
}

function menuAccessValue(user: MenuAccessUser | null | undefined): unknown {
  return user?.menuAccess
    ?? (user as any)?.menu_access
    ?? user?.preferences?.menuAccess
    ?? user?.preferences?.menu_access;
}

function effectiveMenuAccess(user: MenuAccessUser | null | undefined): Set<string> {
  const allMenuKeys = new Set(navigation.flatMap((group) => group.items.flatMap((item) => [menuKey(item), routePath(item.href)])));
  if (!user) return new Set(defaultMenuAccessForRole("operator"));
  const configured = menuAccessValue(user);
  if (hasCustomMenuConfiguration(user)) {
    const selected = new Set((Array.isArray(configured) ? configured : [])
      .filter((value): value is string => typeof value === "string" && allMenuKeys.has(value)));
    // For users with custom roles, honor all explicitly assigned menus that exist in the system navigation.
    return selected;
  }
  return hasUnrestrictedMenuAccess(user)
    ? allMenuKeys
    : new Set(defaultMenuAccessForRole(user.role));
}


export const quickActions: NavItem[] = [
  { label: "Device Configuration Center", href: "/maintenance/device-configuration", icon: SlidersHorizontal },
  { label: "Role vs Menu Permissions", href: "/admin/organization?tab=roles", icon: Shield },
  { label: "Report an incident", href: "/incidents/create", icon: Siren },
  { label: "Create work order", href: "/maintenance/workorders/new", icon: ClipboardCheck },
  { label: "Onboard a branch", href: "/admin/branch-onboarding", icon: Building2 },
  { label: "Register hardware asset", href: "/maintenance/assets/new", icon: Library },
  { label: "Add an AMC contract", href: "/maintenance/amc/new", icon: FileClock },
  { label: "Add a vendor / OEM", href: "/maintenance/vendors/new", icon: Handshake },
  { label: "Hardware Compatibility Lab", href: "/maintenance/compatibility", icon: SlidersHorizontal },
  { label: "Smart Video Search", href: "/video-search", icon: Search },
  { label: "Multi-camera playback", href: "/playback/synced", icon: Play },
  { label: "Create a face watchlist", href: "/analytics/face-recognition?create=watchlist", icon: ScanFace },
  { label: "Create an ANPR watchlist", href: "/analytics/anpr?create=watchlist", icon: CarFront },
  { label: "Add compliance requirement", href: "/compliance/requirements/new", icon: FileCheck2 },
  { label: "Add compliance risk", href: "/compliance/risks/new", icon: ShieldAlert },
  { label: "Add privacy purpose", href: "/maintenance/privacy/purposes/new", icon: LockKeyhole },
  { label: "Report a privacy breach", href: "/maintenance/privacy/breaches/new", icon: ShieldAlert },
];

const pageMeta = [
  ...navigation.flatMap((group) => group.items.map((item) => ({
    path: item.href,
    section: group.label,
    title: item.label,
  }))),
  { path: "/operations/branches", section: "Operations", title: "Branch health" },
  { path: "/camera-detail", section: "Infrastructure health", title: "Camera details" },
  { path: "/maintenance/assets/new", section: "Fleet maintenance", title: "Register asset" },
  { path: "/maintenance/vendors/new", section: "Fleet maintenance", title: "Add vendor" },
  { path: "/maintenance/amc/new", section: "Fleet maintenance", title: "Add AMC contract" },
  { path: "/maintenance/privacy/purposes/new", section: "Privacy", title: "Add processing purpose" },
  { path: "/maintenance/privacy/breaches/new", section: "Privacy", title: "Report privacy breach" },
  { path: "/compliance/requirements/new", section: "Assurance", title: "Add requirement" },
  { path: "/compliance/risks/new", section: "Assurance", title: "Add risk" },
  { path: "/support", section: "Help", title: "Support center" },
  { path: "/privacy", section: "Legal", title: "Privacy policy" },
  { path: "/terms", section: "Legal", title: "Terms of service" },
];

import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { OrgBrandingProvider, useOrgBranding } from "@/components/ui/org-branding-provider";

const AppLayoutContext = createContext(false);
const OPEN_GROUPS_STORAGE_KEY = "sentinel-grid-open-navigation-groups";
const RECENT_MODULES_STORAGE_KEY = "sentinel-grid-recent-modules";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "sentinel-grid-sidebar-collapsed";

function routePath(href: string) {
  return href.split(/[?#]/)[0] || "/";
}

function routeMatches(
  href: string,
  pathname: string,
  searchParams: Pick<URLSearchParams, "get"> | null,
) {
  const path = routePath(href);
  const pathMatches = path === "/"
    ? pathname === "/"
    : pathname === path || pathname.startsWith(`${path}/`);
  if (!pathMatches) return false;

  const query = href.split("?")[1]?.split("#")[0];
  if (!query) return true;
  let matches = true;
  new URLSearchParams(query).forEach((value, key) => {
    const currentVal = searchParams?.get(key);
    if (key === "tab" && value === "hierarchy" && (!currentVal || currentVal === "hierarchy")) {
      return;
    }
    if (currentVal !== value) matches = false;
  });
  return matches;
}

function routeSpecificity(href: string) {
  const query = href.split("?")[1]?.split("#")[0];
  return routePath(href).length + (query ? 10_000 + query.length : 0);
}

export function AppLayout({ children, incidentCount = 0, cameraCount = 0 }: AppLayoutProps) {
  const alreadyInsideAppLayout = useContext(AppLayoutContext);
  if (alreadyInsideAppLayout) return <>{children}</>;

  return (
    <AppLayoutContext.Provider value>
      <Suspense fallback={children}>
        <AppLayoutFrame incidentCount={incidentCount} cameraCount={cameraCount}>{children}</AppLayoutFrame>
      </Suspense>
    </AppLayoutContext.Provider>
  );
}

function AppLayoutFrame({ children, incidentCount = 0, cameraCount = 0 }: AppLayoutProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { branding } = useOrgBranding();
  const mainNavRef = useRef<HTMLElement>(null);
  const NAV_SCROLL_KEY = "sentinel-grid-nav-scroll-top";

  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  const [operator, setOperator] = useState<(MenuAccessUser & {
    displayName?: string;
    username?: string;
    email?: string;
  }) | null>(null);
  const [operatorResolved, setOperatorResolved] = useState(false);

  useEffect(() => {
    try {
      const storedUser = sessionStorage.getItem("user") || localStorage.getItem("user");
      if (storedUser) setOperator(JSON.parse(storedUser));
    } catch {}
    authApi
      .getCurrentUser()
      .then((fresh) => {
        if (fresh) {
          setOperator(fresh);
          try {
            sessionStorage.setItem("user", JSON.stringify(fresh));
          } catch {}
        }
      })
      .catch(() => {})
      .finally(() => setOperatorResolved(true));

    // Restore previously open navigation groups from localStorage
    try {
      const savedGroups = window.localStorage.getItem(OPEN_GROUPS_STORAGE_KEY);
      if (savedGroups) {
        const parsed = JSON.parse(savedGroups);
        if (Array.isArray(parsed) && parsed.length > 0) {
          setOpenGroups(new Set(parsed));
        }
      }
    } catch {}
  }, []);

  const handleNavScroll = () => {
    if (mainNavRef.current) {
      try {
        sessionStorage.setItem(NAV_SCROLL_KEY, String(mainNavRef.current.scrollTop));
      } catch {}
    }
  };

  const pathname = usePathname() || "/";
  const visibleNavigation = useMemo(() => getVisibleNavigation(operator), [operator]);
  const visibleHrefs = useMemo(
    () => new Set(visibleNavigation.flatMap((group) => group.items.map(menuKey))),
    [visibleNavigation],
  );
  const visibleQuickActions = quickActions.filter((action) => visibleHrefs.has(menuKey(action)));

  const isExemptRoute =
    pathname === "/" ||
    pathname === "/login" ||
    pathname === "/account/security" ||
    pathname === "/modules" ||
    pathname.startsWith("/auth/");

  const isKnownNavRoute = useMemo(() => {
    return navigation.some((group) =>
      group.items.some((item) => routeMatches(item.href, pathname, searchParams))
    );
  }, [pathname, searchParams]);

  const isRouteAuthorized = useMemo(() => {
    if (isExemptRoute) return true;
    if (!operatorResolved) return true;
    if (hasUnrestrictedMenuAccess(operator)) return true;
    if (!isKnownNavRoute) return true;
    return visibleNavigation.some((group) =>
      group.items.some((item) => routeMatches(item.href, pathname, searchParams))
    );
  }, [isExemptRoute, operatorResolved, operator, isKnownNavRoute, visibleNavigation, pathname, searchParams]);
  const currentPage = pageMeta
    .filter((item) => routeMatches(item.path, pathname, searchParams))
    .sort((left, right) => routeSpecificity(right.path) - routeSpecificity(left.path))[0]
    ?? { path: pathname, section: "Workspace", title: "KryptonVision" };

  const activeRoute = visibleNavigation
    .flatMap((group) => group.items)
    .map((item) => item.href)
    .filter((href) => routeMatches(href, pathname, searchParams))
    .sort((left, right) => routeSpecificity(right) - routeSpecificity(left))[0];
  const isActive = (href: string) => href === activeRoute;
  const activeGroup = visibleNavigation.find((group) => group.items.some((item) => isActive(item.href)));
  const moduleCount = visibleNavigation.reduce((total, group) => total + group.items.length, 0);
  const allGroupsOpen = openGroups.size === visibleNavigation.length;

  const searchableModules = useMemo(() => visibleNavigation.flatMap((group) =>
    group.items.map((item) => ({ ...item, section: group.label }))), [visibleNavigation]);

  const commandResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    const searchAliases: Record<string, string[]> = {
      "/maintenance/device-configuration": ["golden", "templates", "hardware", "onvif", "ptz", "ntp", "imaging", "profiles", "standard"],
      "/video-wall": ["wall", "tour", "grid", "presentation", "matrix", "cctv", "auto-rotation"],
      "/evidence": ["redaction", "blur", "custody", "forensic", "court", "export", "hash", "tamper"],
      "/operations/incidents": ["sop", "checklist", "false alarm", "intrusion", "alerts", "workflow", "review"],
      "/admin/organization?tab=hierarchy": ["branches", "kochi", "mumbai", "delhi", "bkc", "zones", "facility"],
    };

    if (!query) {
      const recentItems = recentHrefs
        .map((href) => searchableModules.find((item) => item.href === href))
        .filter((item): item is (typeof searchableModules)[number] => Boolean(item))
        .map((item) => ({ ...item, recent: true }));
      const recentSet = new Set(recentHrefs);
      return [
        ...recentItems,
        ...searchableModules
          .filter((item) => !recentSet.has(item.href))
          .map((item) => ({ ...item, recent: false })),
      ].slice(0, 12);
    }
    return searchableModules.filter((item) => {
      const extra = (searchAliases[item.href] || []).join(" ");
      return `${item.label} ${item.section} ${item.href} ${extra}`.toLowerCase().includes(query);
    }).slice(0, 12).map((item) => ({ ...item, recent: false }));
  }, [commandQuery, recentHrefs, searchableModules]);

  // Hiding a link is not access control. Keep custom-role users out of a
  // managed page when they paste or restore a URL that is not on their menu.
  useEffect(() => {
    if (!operatorResolved || !operator || !hasCustomMenuConfiguration(operator)) return;
    const requested = navigation
      .flatMap((group) => group.items)
      .find((item) => routeMatches(item.href, pathname, searchParams));
    if (!requested || visibleHrefs.has(requested.href)) return;
    const fallback = visibleNavigation.flatMap((group) => group.items)[0]?.href;
    if (fallback) router.replace(fallback);
  }, [operator, operatorResolved, pathname, router, searchParams, visibleHrefs, visibleNavigation]);

  useEffect(() => {
    if (activeGroup?.label) {
      setOpenGroups((prev) => {
        if (prev.has(activeGroup.label)) return prev;
        const next = new Set(prev);
        next.add(activeGroup.label);
        try {
          window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify([...next]));
        } catch {}
        return next;
      });
    }
  }, [pathname, activeGroup?.label]);

  // Restore sidebar navigation scroll position so the menu stays in position
  useEffect(() => {
    const nav = mainNavRef.current;
    if (!nav) return;
    try {
      const saved = sessionStorage.getItem(NAV_SCROLL_KEY);
      if (saved !== null) {
        const top = parseInt(saved, 10);
        if (!isNaN(top)) {
          nav.scrollTop = top;
          requestAnimationFrame(() => {
            if (nav) nav.scrollTop = top;
          });
        }
      }
    } catch {}
  }, [pathname]);

  useEffect(() => {
    try {
      const storedRecents = JSON.parse(window.localStorage.getItem(RECENT_MODULES_STORAGE_KEY) || "[]");
      const validRecents = Array.isArray(storedRecents)
        ? storedRecents.filter((href): href is string => searchableModules.some((item) => item.href === href))
        : [];
      const currentHref = searchableModules.find((item) => item.href === activeRoute)?.href;
      const next = currentHref
        ? [currentHref, ...validRecents.filter((href) => href !== currentHref)].slice(0, 5)
        : validRecents.slice(0, 5);
      setRecentHrefs(next);
      window.localStorage.setItem(RECENT_MODULES_STORAGE_KEY, JSON.stringify(next));
    } catch {
      setRecentHrefs([]);
    }
  }, [activeRoute, searchableModules]);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(SIDEBAR_COLLAPSED_STORAGE_KEY);
      if (stored !== null) {
        setSidebarCollapsed(stored === "true");
      }
    } catch {}
  }, []);

  const toggleSidebarCollapse = () => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_STORAGE_KEY, String(next));
      } catch {}
      return next;
    });
  };

  const operatorName = operator?.displayName?.trim()
    || operator?.username?.trim()
    || operator?.email?.trim()
    || "Signed-in user";
  const operatorRole = operator?.role
    ? operator.role.replace(/[_-]+/g, " ").replace(/\b\w/g, (letter) => letter.toUpperCase())
    : "Protected enterprise session";
  const operatorInitials = operatorName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("") || "U";

  useEffect(() => {
    setActiveCommandIndex(0);
  }, [commandOpen, commandQuery]);

  useEffect(() => {
    setCreateMenuOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!createMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      const createMenu = document.querySelector(".create-menu");
      if (createMenu && !createMenu.contains(target)) {
        setCreateMenuOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, [createMenuOpen]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if ((event.ctrlKey || event.metaKey) && (event.key.toLowerCase() === "b" || event.key === "\\")) {
        event.preventDefault();
        toggleSidebarCollapse();
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeSidebar = () => setSidebarOpen(false);
  const handleNavClick = (href: string) => (e: React.MouseEvent<HTMLAnchorElement>) => {
    if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) {
      return; // Allow opening in new tab
    }
    e.preventDefault();
    closeSidebar();

    // Preserve the menu's scroll position before navigating
    if (mainNavRef.current) {
      try {
        sessionStorage.setItem(NAV_SCROLL_KEY, String(mainNavRef.current.scrollTop));
      } catch {}
    }

    const targetPath = routePath(href);
    const currentPath = routePath(pathname);
    if (targetPath === currentPath && href === activeRoute) {
      return; // Already on this exact page
    }

    try {
      router.push(href);
    } catch {
      window.location.assign(href);
      return;
    }

    // High-reliability watchdog: only force full reload if client router genuinely stalls (> 4000ms)
    setTimeout(() => {
      if (typeof window !== "undefined" && routePath(window.location.pathname) !== targetPath) {
        window.location.assign(href);
      }
    }, 4000);
  };

  const createMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (createMenuRef.current && !createMenuRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false);
      }
    }
    if (createMenuOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [createMenuOpen]);

  useEffect(() => {
    const handleGlobalLinkClick = (event: MouseEvent) => {
      if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.button !== 0) {
        return;
      }
      const target = event.target as HTMLElement | null;
      const anchor = target?.closest<HTMLAnchorElement>("a[href]");
      if (!anchor) return;

      const rawHref = anchor.getAttribute("href");
      if (
        !rawHref ||
        rawHref.startsWith("#") ||
        rawHref.startsWith("javascript:") ||
        rawHref.startsWith("mailto:") ||
        rawHref.startsWith("tel:") ||
        rawHref.startsWith("blob:") ||
        rawHref.startsWith("data:")
      ) {
        return;
      }

      try {
        const targetUrl = new URL(anchor.href, window.location.origin);
        if (targetUrl.origin !== window.location.origin) return;

        const targetPath = targetUrl.pathname;
        const currentPath = window.location.pathname;
        if (targetPath === currentPath && targetUrl.search === window.location.search) {
          return;
        }

        const timer = window.setTimeout(() => {
          if (window.location.pathname !== targetPath) {
            window.location.assign(anchor.href);
          }
        }, 4000);

        const clearTimer = () => window.clearTimeout(timer);
        window.addEventListener("beforeunload", clearTimer, { once: true });
      } catch {}
    };

    document.addEventListener("click", handleGlobalLinkClick, true);
    return () => document.removeEventListener("click", handleGlobalLinkClick, true);
  }, []);

  const persistOpenGroups = (next: Set<string>) => {
    setOpenGroups(next);
    try {
      window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify([...next]));
    } catch {}
  };

  const toggleGroup = (groupLabel: string) => {
    setOpenGroups((prev) => {
      const next = new Set(prev);
      if (next.has(groupLabel)) {
        next.delete(groupLabel);
      } else {
        next.add(groupLabel);
      }
      persistOpenGroups(next);
      return next;
    });
  };

  const toggleAllGroups = () => {
    setOpenGroups((prev) => {
      const allLabels = visibleNavigation.map((group) => group.label);
      const next = prev.size > 0 ? new Set<string>() : new Set<string>(allLabels);
      persistOpenGroups(next);
      return next;
    });
  };

  const openCommandResult = (href: string) => {
    setCommandOpen(false);
    setCommandQuery("");
    closeSidebar();

    if (mainNavRef.current) {
      try {
        sessionStorage.setItem(NAV_SCROLL_KEY, String(mainNavRef.current.scrollTop));
      } catch {}
    }

    const targetPath = routePath(href);
    try {
      router.push(href);
    } catch {
      window.location.assign(href);
      return;
    }
    setTimeout(() => {
      if (typeof window !== "undefined" && routePath(window.location.pathname) !== targetPath) {
        window.location.assign(href);
      }
    }, 4000);
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
      <a href="#workspace-content" className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-[100] focus:rounded-lg focus:bg-blue-600 focus:px-4 focus:py-3 focus:text-white">Skip to main content</a>
      <button
        className={`sidebar-scrim ${sidebarOpen ? "visible" : ""}`}
        aria-label="Close navigation"
        onClick={closeSidebar}
      />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          {branding.logoUrl ? (
            <div className="brand-mark custom-logo">
              <img src={branding.logoUrl} alt={branding.orgName || "Organization Logo"} className="org-logo-img" />
            </div>
          ) : (
            <div className="brand-mark"><ShieldCheck size={22} /></div>
          )}
          <div className="brand-copy">
            <strong>{branding.orgName || "KryptonVision"}</strong>
            <span>{branding.tagline || "Enterprise operations"}</span>
          </div>
          <button
            type="button"
            className="sidebar-collapse-btn desktop-only"
            onClick={toggleSidebarCollapse}
            aria-label="Hide sidebar (Ctrl+B)"
            title="Hide sidebar (Ctrl+B)"
          >
            <PanelLeftClose size={17} />
          </button>
          <button className="mobile-close" onClick={closeSidebar} aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>

        <button type="button" className="command-search" onClick={() => setCommandOpen(true)}>
          <Search size={15} />
          <span>Find any module or workflow</span>
          <kbd><Command size={11} /> K</kbd>
        </button>

        <div className="nav-shortcuts" aria-label="Quick access">
          {visibleHrefs.has("/") && <Link href="/" prefetch={false} className={isActive("/") ? "active" : ""} onClick={handleNavClick("/")}>
            <LayoutDashboard size={15} /><span>Overview</span>
          </Link>}
          {visibleHrefs.has("/control-room") && <Link href="/control-room" prefetch={false} className={isActive("/control-room") ? "active" : ""} onClick={handleNavClick("/control-room")}>
            <MonitorPlay size={15} /><span>Live</span>
          </Link>}
          {visibleHrefs.has("/operations/alerts") && <Link href="/operations/alerts" prefetch={false} className={isActive("/operations/alerts") ? "active" : ""} onClick={handleNavClick("/operations/alerts")}>
            <Radar size={15} /><span>Alerts</span>
          </Link>}
        </div>

        <div className="nav-utility">
          <Link href="/modules" prefetch={false} className={isActive("/modules") ? "active" : ""} onClick={handleNavClick("/modules")}>
            <LayoutGrid size={14} />
            <span>All modules</span>
            <small>{moduleCount}</small>
          </Link>
          <button
            type="button"
            onClick={toggleAllGroups}
            aria-label={allGroupsOpen ? "Collapse navigation sections" : "Expand navigation sections"}
            title={allGroupsOpen ? "Collapse sections" : "Expand sections"}
          >
            <ChevronsUpDown size={15} />
          </button>
        </div>

        <nav ref={mainNavRef} onScroll={handleNavScroll} className="main-nav" aria-label="Main navigation">
          {(Array.isArray(visibleNavigation) ? visibleNavigation : navigation).map((group) => {
            if (!group) return null;
            const items = Array.isArray(group.items) ? group.items : [];
            const groupIsActive = items.some((item) => item && isActive(item.href));
            const GroupIcon = group.icon;
            return (
            <details
              className="nav-group"
              key={group.label}
              open={openGroups.has(group.label)}
              suppressHydrationWarning
            >
              <summary
                onClick={(e) => {
                  e.preventDefault();
                  toggleGroup(group.label);
                }}
              >
                <span className="nav-group-label">{GroupIcon ? <GroupIcon size={14} /> : null}<span>{group.label}</span></span>
                <span className="nav-group-meta"><small>{items.length}</small><ChevronRight size={13} /></span>
              </summary>
              <div className="nav-items">
              {items.map((item) => {
                if (!item) return null;
                const Icon = item.icon;
                const count = item.badge === "cameras" ? cameraCount : incidentCount;
                return (
                  <Link
                    key={`${group.label}-${item.label}`}
                    href={item.href}
                    prefetch={false}
                    className={isActive(item.href) ? "active" : ""}
                    onClick={handleNavClick(item.href)}
                    aria-current={isActive(item.href) ? "page" : undefined}
                  >
                    <Icon size={17} />
                    <span>{item.label}</span>
                    {item.badge && count > 0 && (
                      <em className={item.badge === "incidents" ? "alert-count" : "nav-count"}>
                        {count}
                      </em>
                    )}
                  </Link>
                );
              })}
              </div>
            </details>
            );
          })}
        </nav>


        <div className="sidebar-footer">
          <Link href="/support" className="sidebar-help" onClick={handleNavClick("/support")}>
            <HelpCircle size={16} />
            <span>Help &amp; support</span>
            <ChevronRight size={15} />
          </Link>
          <div className="sidebar-legal" aria-label="Legal links">
            <Link href="/privacy" onClick={handleNavClick("/privacy")}>Privacy</Link>
            <span aria-hidden="true">•</span>
            <Link href="/terms" onClick={handleNavClick("/terms")}>Terms</Link>
          </div>
          <Link href="/maintenance/health" className="sidebar-status" onClick={handleNavClick("/maintenance/health")}>
            <div className="pulse-icon"><Wifi size={16} /></div>
            <div><strong>Platform status</strong><span>Open infrastructure health</span></div>
            <ChevronRight size={15} />
          </Link>
          <div className="sidebar-user-menu">
            <Link href="/account/security" className="sidebar-user" onClick={handleNavClick("/account/security")}>
              <div className="avatar" aria-hidden="true">{operatorInitials}</div>
              <div><strong>{operatorName}</strong><span>{operatorRole}</span></div>
              <Settings size={16} />
            </Link>
            <button 
              className="logout-button" 
              onClick={() => {
                closeSidebar();
                logout();
              }}
              aria-label="Sign out"
              title="Sign out"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>

      <main id="workspace-content" tabIndex={-1} className="workspace">
        <header className="topbar">
          <button
            type="button"
            className="menu-button"
            onClick={() => {
              if (typeof window !== "undefined" && window.innerWidth >= 992) {
                toggleSidebarCollapse();
              } else {
                setSidebarOpen(true);
              }
            }}
            aria-label={sidebarCollapsed ? "Show sidebar menu (Ctrl+B)" : "Hide sidebar menu (Ctrl+B)"}
            title={sidebarCollapsed ? "Show sidebar menu (Ctrl+B)" : "Hide sidebar menu (Ctrl+B)"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={19} /> : <PanelLeftClose size={19} />}
          </button>
          <div className="topbar-context">
            <div className="breadcrumbs">
              <Link href="/" className="inline-flex items-center gap-1.5">
                {branding.logoUrl ? <img src={branding.logoUrl} alt="" className="h-5 w-5 rounded object-contain" /> : null}
                <span>{branding.orgName || "KryptonVision"}</span>
              </Link><ChevronRight size={12} />
              {activeGroup ? <Link href={activeGroup.items[0].href}>{currentPage.section}</Link> : <span>{currentPage.section}</span>}
            </div>
            <p className="topbar-title">{currentPage.title}</p>
          </div>
          <div className="topbar-actions">
            <div className="live-state"><i /> Live operations <span>IST</span></div>
            <ThemeSwitcher />
            <AlertAudioIndicator />
            <div className={`create-menu relative ${createMenuOpen ? "open" : ""}`} ref={createMenuRef}>
              <button
                type="button"
                className="create-menu-trigger"
                onClick={() => setCreateMenuOpen((open) => !open)}
                aria-expanded={createMenuOpen}
                aria-haspopup="true"
                aria-label="Create quick action"
              >
                <Plus size={15} /><span>Create</span><ChevronDown size={13} />
              </button>
              {createMenuOpen && (
                <div className="create-menu-panel">
                  <p>Quick actions</p>
                  {visibleQuickActions.length > 0 ? (
                    visibleQuickActions.map((action) => {
                      const Icon = action.icon;
                      return (
                        <Link
                          href={action.href}
                          key={action.href}
                          onClick={(e) => {
                            setCreateMenuOpen(false);
                            handleNavClick(action.href)(e);
                          }}
                        >
                          <span><Icon size={15} /></span>
                          <strong>{action.label}</strong>
                          <ChevronRight size={13} />
                        </Link>
                      );
                    })
                  ) : (
                    <div className="px-3 py-2 text-[11px] text-slate-400">
                      No quick actions available for your role.
                    </div>
                  )}
                </div>
              )}
            </div>
            <button type="button" className="topbar-icon" aria-label="Search modules" onClick={() => setCommandOpen(true)}><Search size={18} /></button>
            <Link
              href="/operations/alerts"
              aria-label="Notifications"
              className="notification topbar-icon"
              onClick={handleNavClick("/operations/alerts")}
            >
              <Bell size={18} />
              {incidentCount > 0 && <i />}
            </Link>
            <Link
              href="/account/security"
              className="top-avatar"
              aria-label="Operator profile and session security"
              onClick={handleNavClick("/account/security")}
            >
              <CircleUserRound size={20} />
            </Link>
          </div>
        </header>
        <div className="route-surface" data-section={currentPage.section.toLowerCase().replaceAll(" ", "-")}>
          {isRouteAuthorized ? (
            children
          ) : (
            <div className="flex flex-col items-center justify-center min-h-[60vh] text-center p-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-rose-500/10 border border-rose-500/20 flex items-center justify-center text-rose-400 mb-2">
                <ShieldAlert size={32} />
              </div>
              <h2 className="text-xl font-bold text-slate-100">Access Restricted</h2>
              <p className="text-sm text-slate-400 max-w-md">
                Your assigned role (<span className="text-indigo-400 font-medium font-mono">{operator?.customRoleName || operator?.role || "user"}</span>) does not have permission to access <span className="text-slate-200 font-mono text-xs bg-slate-900 px-2 py-0.5 rounded border border-slate-800">{pathname}</span>.
              </p>
              <div className="pt-2">
                <Link
                  href="/"
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-slate-950 rounded-lg text-xs font-bold transition inline-flex items-center gap-2"
                >
                  <LayoutDashboard size={14} /> Return to Dashboard
                </Link>
              </div>
            </div>
          )}
        </div>
      </main>
      <AlertNotificationTray />

      {commandOpen && (
        <div className="command-overlay" role="presentation" onMouseDown={() => setCommandOpen(false)}>
          <section className="command-dialog" role="dialog" aria-modal="true" aria-label="Module search" onMouseDown={(event) => event.stopPropagation()}>
            <div className="command-input-row">
              <Search size={19} />
              <input
                autoFocus
                value={commandQuery}
                onChange={(event) => setCommandQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setActiveCommandIndex((index) => (index + 1) % Math.max(commandResults.length, 1));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setActiveCommandIndex((index) => (index - 1 + Math.max(commandResults.length, 1)) % Math.max(commandResults.length, 1));
                  } else if (event.key === "Enter" && commandResults[activeCommandIndex]) {
                    event.preventDefault();
                    openCommandResult(commandResults[activeCommandIndex].href);
                  }
                }}
                placeholder="Search cameras, incidents, reports, maintenance..."
                aria-label="Search all modules"
                aria-controls="command-results-list"
                aria-activedescendant={commandResults[activeCommandIndex] ? `command-result-${activeCommandIndex}` : undefined}
              />
              <button type="button" onClick={() => setCommandOpen(false)} aria-label="Close module search"><X size={17} /></button>
            </div>
            <div className="command-results" id="command-results-list" role="listbox" aria-label="Module destinations">
              <div className="command-results-heading">
                <span>{commandQuery ? "Search results" : recentHrefs.length ? "Recent & suggested" : "Popular destinations"}</span>
                <Link href="/modules" onClick={() => setCommandOpen(false)}>View all modules <LayoutGrid size={13} /></Link>
              </div>
              {commandResults.length > 0 ? commandResults.map((item, index) => {
                const Icon = item.icon;
                return (
                  <Link
                    href={item.href}
                    key={`${item.section}-${item.href}`}
                    id={`command-result-${index}`}
                    role="option"
                    aria-selected={activeCommandIndex === index}
                    className={activeCommandIndex === index ? "active" : ""}
                    onMouseEnter={() => setActiveCommandIndex(index)}
                    onClick={(event) => {
                      event.preventDefault();
                      openCommandResult(item.href);
                    }}
                  >
                    <span className="command-result-icon"><Icon size={17} /></span>
                    <span><strong>{item.label}</strong><small>{item.section}{item.recent ? " · Recently opened" : ""}</small></span>
                    <ChevronRight size={15} />
                  </Link>
                );
              }) : (
                <div className="command-empty"><Search size={22} /><strong>No matching module</strong><span>Try a feature name such as camera, report, audit or branch.</span></div>
              )}
            </div>
            <footer><span><kbd>↑↓</kbd> navigate</span><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><strong>{searchableModules.length} modules available</strong></footer>
          </section>
        </div>
      )}
    </div>
  );
}
