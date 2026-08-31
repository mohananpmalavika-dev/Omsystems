"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Banknote,
  Bell,
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
  Factory,
  FileCheck2,
  FileClock,
  FileSearch,
  FileText,
  FileVideo2,
  Fingerprint,
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
  ListFilter,
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
  Wifi,
  Workflow,
  Wrench,
  X,
} from "lucide-react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";
import { logout } from "@/lib/auth-manager";
import { authApi } from "@/lib/api-client";

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

export type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

export const navigation: NavGroup[] = [
  {
    label: "OPERATIONS",
    icon: LayoutDashboard,
    items: [
      { label: "Command Center", href: "/", icon: LayoutDashboard },
      { label: "Fleet Branches", href: "/operations/branches", icon: Building2 },
      { label: "Live Video Wall", href: "/control-room", icon: MonitorPlay },
      { label: "Alert Operations", href: "/operations/alerts", icon: Radio },
      { label: "Incident Response", href: "/incidents", icon: Siren, badge: "incidents" },
      { label: "Security Operations", href: "/security-operations", icon: Shield },
      { label: "Media Pipeline & Scheduler", href: "/operations/media-pipeline", icon: Layers },
      { label: "HA Failover Cluster", href: "/operations/ha-failover", icon: Server },
      { label: "Edge Fleet Management", href: "/operations/edge-fleet", icon: Cpu },
      { label: "Fleet Observability & SLO", href: "/operations/observability", icon: BarChart3 },
    ],
  },
  {
    label: "SECURITY DEVICE OPERATIONS",
    icon: Shield,
    items: [
      { label: "Security Device Overview", href: "/security-devices", icon: LayoutGrid },
      { label: "CCTV & Video Devices", href: "/security-devices?category=video", icon: Camera },
      { label: "Access Control & Doors", href: "/security-devices?category=access-control", icon: LockKeyhole },
      { label: "Intrusion & Alarm Systems", href: "/security-devices?category=intrusion", icon: ShieldAlert },
      { label: "Panic & Emergency Response", href: "/security-devices?category=emergency", icon: Siren },
      { label: "Fire & Life Safety", href: "/security-devices?category=fire-safety", icon: AlertTriangle },
      { label: "Vault, Safe & Cash Security", href: "/security-devices?category=vault-cash", icon: Landmark },
      { label: "ATM Security", href: "/security-devices?category=atm", icon: Banknote },
      { label: "Power, UPS & Environment", href: "/security-devices?category=power-environment", icon: Activity },
      { label: "Branch Security Posture", href: "/security-devices/branch-posture", icon: ShieldCheck },
      { label: "Device Discovery & Enrollment", href: "/security-devices/discovery", icon: Radar },
      { label: "Device Integrations", href: "/security-devices/integrations", icon: Workflow },
      { label: "Security Incidents", href: "/incidents?source=security-devices", icon: Siren, badge: "incidents" },
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
      { label: "Face Recognition & Watchlists", href: "/analytics/face-recognition", icon: ScanFace },
      { label: "ANPR & Vehicle Telemetry", href: "/analytics/anpr", icon: CarFront },
      { label: "People Counting & Heatmaps", href: "/analytics/people", icon: Users },
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
      { label: "Hardware Asset Registry", href: "/maintenance/assets", icon: Library },
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
      { label: "Compliance Frameworks", href: "/compliance", icon: ShieldCheck },
      { label: "Assessments & Audits", href: "/compliance/assessments", icon: ClipboardCheck },
      { label: "Controls & Remediation", href: "/compliance/controls", icon: SlidersHorizontal },
      { label: "Compliance Risk Register", href: "/compliance/risks", icon: ShieldAlert },
      { label: "Compliance Policies", href: "/compliance/policies", icon: FileText },
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
      { label: "Organization & Location Hierarchy", href: "/admin/organization", icon: Building2 },
      { label: "Employees & Location Grants", href: "/admin/organization", icon: Users },
      { label: "Branch Onboarding Wizard", href: "/admin/branch-onboarding", icon: Building2, badge: "cameras" },
      { label: "Zero-Touch Provisioning (ZTP)", href: "/admin/zero-touch", icon: Cpu },
      { label: "AI Quality & Model Registry", href: "/admin/ai-quality", icon: Sparkles },
      { label: "HA Cluster Topology", href: "/admin/ha-topology", icon: Server },
      { label: "Database Tables & Data", href: "/admin/database", icon: Database },
      { label: "Device Registry & ONVIF", href: "/maintenance/device-management", icon: SlidersHorizontal },
      { label: "Third-Party Integrations", href: "/integrations", icon: Workflow },
      { label: "Notification Policies", href: "/operations/alert-notification-policy", icon: Bell },
      { label: "System Management & OTA", href: "/admin/system", icon: Settings },
      { label: "Mobile Operations View", href: "/mobile", icon: Truck },
      { label: "Account & Security Settings", href: "/account/security", icon: LockKeyhole },
    ],
  },
];

export const quickActions: NavItem[] = [
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

import { ThemeProvider } from "@/components/ui/theme-provider";
import { ThemeSwitcher } from "@/components/ui/theme-switcher";
import { OrgBrandingProvider, useOrgBranding } from "@/components/ui/org-branding-provider";

const AppLayoutContext = createContext(false);
const OPEN_GROUPS_STORAGE_KEY = "sentinel-grid-open-navigation-groups";
const RECENT_MODULES_STORAGE_KEY = "sentinel-grid-recent-modules";
const SIDEBAR_COLLAPSED_STORAGE_KEY = "sentinel-grid-sidebar-collapsed";

export function AppLayout({ children, incidentCount = 0, cameraCount = 0 }: AppLayoutProps) {
  const alreadyInsideAppLayout = useContext(AppLayoutContext);
  if (alreadyInsideAppLayout) return <>{children}</>;

  return (
    <AppLayoutContext.Provider value>
      <AppLayoutFrame incidentCount={incidentCount} cameraCount={cameraCount}>{children}</AppLayoutFrame>
    </AppLayoutContext.Provider>
  );
}

function AppLayoutFrame({ children, incidentCount = 0, cameraCount = 0 }: AppLayoutProps) {
  const router = useRouter();
  const { branding } = useOrgBranding();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
  const [activeCommandIndex, setActiveCommandIndex] = useState(0);
  const [openGroups, setOpenGroups] = useState<Set<string>>(() => new Set());
  const [recentHrefs, setRecentHrefs] = useState<string[]>([]);
  const [operator, setOperator] = useState<{
    displayName?: string;
    username?: string;
    email?: string;
    role?: string;
  } | null>(null);
  const pathname = usePathname() || "/";
  const currentPage = pageMeta
    .filter((item) => item.path === "/" ? pathname === "/" : pathname === item.path || pathname.startsWith(`${item.path}/`))
    .sort((left, right) => right.path.length - left.path.length)[0]
    ?? { path: pathname, section: "Workspace", title: "Sentinel Grid" };

  const normalizedRoute = (href: string) => href.split(/[?#]/)[0] || "/";
  const activeRoute = navigation
    .flatMap((group) => group.items)
    .map((item) => normalizedRoute(item.href))
    .filter((route) => route === "/" ? pathname === "/" : pathname === route || pathname.startsWith(`${route}/`))
    .sort((left, right) => right.length - left.length)[0];
  const isActive = (href: string) => normalizedRoute(href) === activeRoute;
  const activeGroup = navigation.find((group) => group.items.some((item) => isActive(item.href)));
  const moduleCount = navigation.reduce((total, group) => total + group.items.length, 0);
  const allGroupsOpen = openGroups.size === navigation.length;

  const searchableModules = useMemo(() => navigation.flatMap((group) =>
    group.items.map((item) => ({ ...item, section: group.label }))), []);
  const commandResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
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
    return searchableModules.filter((item) =>
      `${item.label} ${item.section} ${item.href}`.toLowerCase().includes(query)
    ).slice(0, 12).map((item) => ({ ...item, recent: false }));
  }, [commandQuery, recentHrefs, searchableModules]);

  useEffect(() => {
    let active = true;
    authApi.getCurrentUser()
      .then((user) => {
        if (active && user) setOperator(user);
      })
      .catch(() => {
        // Authentication and authorization remain server-enforced. Keep the shell usable
        // if the optional identity label cannot be refreshed during a transient outage.
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    try {
      const storedGroups = JSON.parse(window.localStorage.getItem(OPEN_GROUPS_STORAGE_KEY) || "[]");
      const validGroups = Array.isArray(storedGroups)
        ? storedGroups.filter((label): label is string => navigation.some((group) => group.label === label))
        : [];
      if (activeGroup && !validGroups.includes(activeGroup.label)) validGroups.push(activeGroup.label);
      setOpenGroups(new Set(validGroups));
    } catch {
      setOpenGroups(new Set(activeGroup ? [activeGroup.label] : []));
    }
  }, []);

  useEffect(() => {
    if (!activeGroup) return;
    setOpenGroups((current) => {
      if (current.has(activeGroup.label)) return current;
      const next = new Set(current).add(activeGroup.label);
      window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify([...next]));
      return next;
    });
  }, [activeGroup?.label]);

  useEffect(() => {
    try {
      const storedRecents = JSON.parse(window.localStorage.getItem(RECENT_MODULES_STORAGE_KEY) || "[]");
      const validRecents = Array.isArray(storedRecents)
        ? storedRecents.filter((href): href is string => searchableModules.some((item) => item.href === href))
        : [];
      const currentHref = searchableModules.find((item) => normalizedRoute(item.href) === activeRoute)?.href;
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
    closeSidebar();
    if (activeRoute === "/control-room" || (typeof window !== "undefined" && window.location.pathname.startsWith("/control-room"))) {
      e.preventDefault();
      window.location.assign(href);
    }
  };
  const persistOpenGroups = (next: Set<string>) => {
    setOpenGroups(next);
    window.localStorage.setItem(OPEN_GROUPS_STORAGE_KEY, JSON.stringify([...next]));
  };
  const toggleAllGroups = () => {
    persistOpenGroups(allGroupsOpen
      ? new Set(activeGroup ? [activeGroup.label] : [])
      : new Set(navigation.map((group) => group.label)));
  };
  const openCommandResult = (href: string) => {
    setCommandOpen(false);
    setCommandQuery("");
    closeSidebar();
    if (activeRoute === "/control-room" || (typeof window !== "undefined" && window.location.pathname.startsWith("/control-room"))) {
      window.location.assign(href);
      return;
    }
    router.push(href);
  };

  return (
    <div className={`app-shell ${sidebarCollapsed ? "sidebar-collapsed" : ""}`}>
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
            <strong>{branding.orgName || "Sentinel Grid"}</strong>
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
          <Link href="/" prefetch={true} className={isActive("/") ? "active" : ""} onClick={handleNavClick("/")}>
            <LayoutDashboard size={15} /><span>Overview</span>
          </Link>
          <Link href="/control-room" prefetch={true} className={isActive("/control-room") ? "active" : ""} onClick={handleNavClick("/control-room")}>
            <MonitorPlay size={15} /><span>Live</span>
          </Link>
          <Link href="/operations/alerts" prefetch={true} className={isActive("/operations/alerts") ? "active" : ""} onClick={handleNavClick("/operations/alerts")}>
            <Radar size={15} /><span>Alerts</span>
          </Link>
        </div>

        <div className="nav-utility">
          <Link href="/modules" prefetch={true} className={isActive("/modules") ? "active" : ""} onClick={handleNavClick("/modules")}>
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

        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((group) => {
            const groupIsActive = group.items.some((item) => isActive(item.href));
            const GroupIcon = group.icon;
            return (
            <details
              className="nav-group"
              key={group.label}
              open={groupIsActive || openGroups.has(group.label)}
              onToggle={(event) => {
                const next = new Set(openGroups);
                if (event.currentTarget.open) next.add(group.label);
                else if (!groupIsActive) next.delete(group.label);
                persistOpenGroups(next);
              }}
            >
              <summary>
                <span className="nav-group-label"><GroupIcon size={14} /><span>{group.label}</span></span>
                <span className="nav-group-meta"><small>{group.items.length}</small><ChevronRight size={13} /></span>
              </summary>
              <div className="nav-items">
              {group.items.map((item) => {
                const Icon = item.icon;
                const count = item.badge === "cameras" ? cameraCount : incidentCount;
                return (
                  <Link
                    key={`${group.label}-${item.label}`}
                    href={item.href}
                    prefetch={true}
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

      <main className="workspace">
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
              <Link href="/">Sentinel Grid</Link><ChevronRight size={12} />
              {activeGroup ? <Link href={activeGroup.items[0].href}>{currentPage.section}</Link> : <span>{currentPage.section}</span>}
            </div>
            <p className="topbar-title">{currentPage.title}</p>
          </div>
          <div className="topbar-actions">
            <div className="live-state"><i /> Live operations <span>IST</span></div>
            <ThemeSwitcher />
            <details className="create-menu" open={createMenuOpen} onToggle={(event) => setCreateMenuOpen(event.currentTarget.open)}>
              <summary onClick={(event) => {
                event.preventDefault();
                setCreateMenuOpen((open) => !open);
              }}>
                <Plus size={15} /><span>Create</span><ChevronDown size={13} />
              </summary>
              <div className="create-menu-panel">
                <p>Quick actions</p>
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link href={action.href} key={action.href} onClick={() => setCreateMenuOpen(false)}>
                      <span><Icon size={15} /></span>
                      <strong>{action.label}</strong>
                      <ChevronRight size={13} />
                    </Link>
                  );
                })}
              </div>
            </details>
            <button type="button" className="topbar-icon" aria-label="Search modules" onClick={() => setCommandOpen(true)}><Search size={18} /></button>
            <Link href="/operations/alerts" aria-label="Notifications" className="notification topbar-icon">
              <Bell size={18} />
              {incidentCount > 0 && <i />}
            </Link>
            <Link href="/account/security" className="top-avatar" aria-label="Operator profile and session security"><CircleUserRound size={20} /></Link>
          </div>
        </header>
        <div className="route-surface" data-section={currentPage.section.toLowerCase().replaceAll(" ", "-")}>
          {children}
        </div>
      </main>

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
