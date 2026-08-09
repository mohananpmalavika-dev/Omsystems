"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  AlertTriangle,
  BarChart3,
  Bell,
  Boxes,
  Building2,
  CalendarClock,
  Camera,
  ChevronDown,
  ChevronRight,
  CircleUserRound,
  ClipboardCheck,
  Command,
  Cpu,
  Database,
  FileCheck2,
  FileClock,
  FileSearch,
  FileText,
  FileVideo2,
  Gauge,
  Globe2,
  Grid2X2,
  Handshake,
  HeartPulse,
  LayoutDashboard,
  LayoutGrid,
  Library,
  ListFilter,
  LockKeyhole,
  LogOut,
  Menu,
  MonitorPlay,
  Network,
  Play,
  Plus,
  Radar,
  Search,
  Server,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  TrendingUp,
  UserRoundCog,
  Wifi,
  Wrench,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { logout } from "@/lib/auth-manager";

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
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      { label: "Operations overview", href: "/", icon: LayoutDashboard },
      { label: "Executive dashboard", href: "/dashboards", icon: BarChart3 },
      { label: "Module directory", href: "/modules", icon: LayoutGrid },
    ],
  },
  {
    label: "Respond",
    icon: Siren,
    items: [
      { label: "Security operations", href: "/security-operations", icon: Shield },
      { label: "Control room", href: "/control-room", icon: MonitorPlay },
      { label: "Alert command center", href: "/operations/alert-command-center", icon: Bell },
      { label: "Incident response", href: "/incidents", icon: Siren, badge: "incidents" },
      { label: "Report an incident", href: "/incidents/create", icon: Plus },
      { label: "Notification policy", href: "/operations/alert-notification-policy", icon: SlidersHorizontal },
    ],
  },
  {
    label: "Intelligence",
    icon: Command,
    items: [
      { label: "AI command center", href: "/operations/ai-command-center", icon: Command },
      { label: "Video analytics", href: "/analytics", icon: Activity },
      { label: "Analytics dashboard", href: "/analytics/dashboard", icon: TrendingUp },
      { label: "Digital twin", href: "/digital-twin", icon: Boxes },
      { label: "Twin branch directory", href: "/digital-twin/branches", icon: Building2 },
      { label: "Global command center", href: "/federation", icon: Globe2 },
    ],
  },
  {
    label: "Investigate & report",
    icon: FileSearch,
    items: [
      { label: "Recordings", href: "/recordings", icon: FileVideo2 },
      { label: "Synced playback", href: "/playback/synced", icon: Play },
      { label: "Video search", href: "/video-search", icon: Search },
      { label: "Evidence vault", href: "/evidence", icon: FileCheck2 },
      { label: "Operational reports", href: "/reports", icon: FileSearch },
    ],
  },
  {
    label: "Infrastructure health",
    icon: HeartPulse,
    items: [
      { label: "Operational health", href: "/operations", icon: HeartPulse },
      { label: "Enterprise infrastructure", href: "/operations/infrastructure", icon: Server },
      { label: "Operational alerts", href: "/operations/alerts", icon: AlertTriangle },
      { label: "Camera health", href: "/operations/cameras", icon: Camera },
      { label: "Camera monitoring", href: "/camera-monitoring", icon: MonitorPlay },
      { label: "Recording health", href: "/operations/recording", icon: FileVideo2 },
      { label: "Storage health", href: "/operations/storage", icon: Database },
      { label: "Network health", href: "/operations/network", icon: Network },
      { label: "Power & UPS health", href: "/operations/ups", icon: Activity },
      { label: "Branch gateways", href: "/operations/edge-agents", icon: Cpu },
    ],
  },
  {
    label: "Fleet maintenance",
    icon: Wrench,
    items: [
      { label: "Maintenance center", href: "/maintenance", icon: Wrench },
      { label: "Device health", href: "/maintenance/health", icon: Gauge },
      { label: "Maintenance alerts", href: "/maintenance/alerts", icon: AlertTriangle },
      { label: "Predictive maintenance", href: "/maintenance/predictive", icon: TrendingUp },
      { label: "Device management", href: "/maintenance/device-management", icon: SlidersHorizontal },
      { label: "Asset registry", href: "/maintenance/assets", icon: Library },
      { label: "DVR/NVR monitoring", href: "/maintenance/dvr-nvr-monitor", icon: Server },
      { label: "Work orders", href: "/maintenance/workorders", icon: ClipboardCheck },
      { label: "Create work order", href: "/maintenance/workorders/new", icon: Plus },
      { label: "Vendors", href: "/maintenance/vendors", icon: Handshake },
      { label: "AMC contracts", href: "/maintenance/amc", icon: FileClock },
      { label: "Maintenance reports", href: "/maintenance/reports", icon: FileSearch },
    ],
  },
  {
    label: "Privacy",
    icon: LockKeyhole,
    items: [
      { label: "Privacy governance", href: "/maintenance/privacy", icon: Shield },
      { label: "Camera purposes", href: "/maintenance/privacy/cameras", icon: Camera },
      { label: "Processing purposes", href: "/maintenance/privacy/purposes", icon: FileText },
      { label: "Privacy controls", href: "/maintenance/privacy/controls", icon: ShieldCheck },
      { label: "Breach register", href: "/maintenance/privacy/breaches", icon: ShieldAlert },
      { label: "Report a breach", href: "/maintenance/privacy/breaches/new", icon: Plus },
    ],
  },
  {
    label: "Assurance",
    icon: ShieldCheck,
    items: [
      { label: "Compliance frameworks", href: "/compliance", icon: ShieldCheck },
      { label: "Compliance overview", href: "/compliance/overview", icon: Grid2X2 },
      { label: "Compliance dashboard", href: "/compliance/dashboard", icon: BarChart3 },
      { label: "Policies", href: "/compliance/policies", icon: FileText },
      { label: "Requirements", href: "/compliance/requirements", icon: FileCheck2 },
      { label: "Controls", href: "/compliance/controls", icon: SlidersHorizontal },
      { label: "Assessments", href: "/compliance/assessments", icon: ClipboardCheck },
      { label: "Findings", href: "/compliance/findings", icon: AlertTriangle },
      { label: "Risk register", href: "/compliance/risks", icon: ShieldAlert },
      { label: "Certificates", href: "/compliance/certificates", icon: FileCheck2 },
      { label: "Compliance evidence", href: "/compliance/evidence", icon: FileSearch },
    ],
  },
  {
    label: "Audit & activity",
    icon: FileSearch,
    items: [
      { label: "Employee activity", href: "/activity-report", icon: UserRoundCog },
      { label: "Camera health audit", href: "/audit/health", icon: Gauge },
      { label: "Branch compliance", href: "/audit/branch-compliance", icon: Building2 },
      { label: "Maintenance audit", href: "/audit/maintenance", icon: CalendarClock },
    ],
  },
  {
    label: "Administration",
    icon: UserRoundCog,
    items: [
      { label: "Organization & devices", href: "/admin", icon: Building2, badge: "cameras" },
      { label: "Branch onboarding", href: "/admin/branch-onboarding", icon: Network },
      { label: "Integrations", href: "/integrations", icon: SlidersHorizontal },
      { label: "System management", href: "/admin/system", icon: Settings },
      { label: "Account & session", href: "/account/security", icon: LockKeyhole },
    ],
  },
];

export const quickActions: NavItem[] = [
  { label: "Report an incident", href: "/incidents/create", icon: Siren },
  { label: "Create work order", href: "/maintenance/workorders/new", icon: ClipboardCheck },
  { label: "Onboard a branch", href: "/admin/branch-onboarding", icon: Building2 },
  { label: "Register an asset", href: "/maintenance/assets/new", icon: Library },
  { label: "Add a vendor", href: "/maintenance/vendors/new", icon: Handshake },
  { label: "Add an AMC contract", href: "/maintenance/amc/new", icon: FileClock },
];

const pageMeta = [
  ...navigation.flatMap((group) => group.items.map((item) => ({
    path: item.href,
    section: group.label,
    title: item.label,
  }))),
  { path: "/operations/branches", section: "Infrastructure health", title: "Branch health" },
  { path: "/camera-detail", section: "Infrastructure health", title: "Camera details" },
  { path: "/maintenance/assets/new", section: "Fleet maintenance", title: "Register asset" },
  { path: "/maintenance/vendors/new", section: "Fleet maintenance", title: "Add vendor" },
  { path: "/maintenance/amc/new", section: "Fleet maintenance", title: "Add AMC contract" },
  { path: "/maintenance/privacy/purposes/new", section: "Privacy", title: "Add processing purpose" },
];

export function AppLayout({ children, incidentCount = 0, cameraCount = 0 }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState("");
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

  const searchableModules = useMemo(() => navigation.flatMap((group) =>
    group.items.map((item) => ({ ...item, section: group.label }))), []);
  const commandResults = useMemo(() => {
    const query = commandQuery.trim().toLowerCase();
    if (!query) return searchableModules.slice(0, 10);
    return searchableModules.filter((item) =>
      `${item.label} ${item.section} ${item.href}`.toLowerCase().includes(query)
    ).slice(0, 12);
  }, [commandQuery, searchableModules]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setCommandOpen((open) => !open);
      }
      if (event.key === "Escape") setCommandOpen(false);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const closeSidebar = () => setSidebarOpen(false);

  return (
    <div className="app-shell">
      <button
        className={`sidebar-scrim ${sidebarOpen ? "visible" : ""}`}
        aria-label="Close navigation"
        onClick={closeSidebar}
      />
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={22} /></div>
          <div className="brand-copy">
            <strong>Sentinel Grid</strong>
            <span>Enterprise operations</span>
          </div>
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
          <Link href="/" className={isActive("/") ? "active" : ""} onClick={closeSidebar}>
            <LayoutDashboard size={15} /><span>Overview</span>
          </Link>
          <Link href="/control-room" className={isActive("/control-room") ? "active" : ""} onClick={closeSidebar}>
            <MonitorPlay size={15} /><span>Live</span>
          </Link>
          <Link href="/operations/alerts" className={isActive("/operations/alerts") ? "active" : ""} onClick={closeSidebar}>
            <Radar size={15} /><span>Alerts</span>
          </Link>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          {navigation.map((group) => {
            const groupIsActive = group.items.some((item) => isActive(item.href));
            const GroupIcon = group.icon;
            return (
            <details className="nav-group" key={group.label} open={groupIsActive}>
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
                    className={isActive(item.href) ? "active" : ""}
                    onClick={closeSidebar}
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
          <Link href="/maintenance/health" className="sidebar-status" onClick={closeSidebar}>
            <div className="pulse-icon"><Wifi size={16} /></div>
            <div><strong>Platform status</strong><span>Open infrastructure health</span></div>
            <ChevronRight size={15} />
          </Link>
          <div className="sidebar-user-menu">
            <Link href="/account/security" className="sidebar-user" onClick={closeSidebar}>
              <div className="avatar">SO</div>
              <div><strong>Security operator</strong><span>Protected enterprise session</span></div>
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
          <button className="menu-button" onClick={() => setSidebarOpen(true)} aria-label="Open navigation">
            <Menu size={20} />
          </button>
          <div className="topbar-context">
            <div className="breadcrumbs">
              <span>Sentinel Grid</span><ChevronRight size={12} /><span>{currentPage.section}</span>
            </div>
            <p className="topbar-title">{currentPage.title}</p>
          </div>
          <div className="topbar-actions">
            <div className="live-state"><i /> Live operations <span>IST</span></div>
            <details className="create-menu">
              <summary><Plus size={15} /><span>Create</span><ChevronDown size={13} /></summary>
              <div className="create-menu-panel">
                <p>Quick actions</p>
                {quickActions.map((action) => {
                  const Icon = action.icon;
                  return (
                    <Link href={action.href} key={action.href}>
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
                placeholder="Search cameras, incidents, reports, maintenance..."
                aria-label="Search all modules"
              />
              <button type="button" onClick={() => setCommandOpen(false)} aria-label="Close module search"><X size={17} /></button>
            </div>
            <div className="command-results">
              <div className="command-results-heading">
                <span>{commandQuery ? "Search results" : "Popular destinations"}</span>
                <Link href="/modules" onClick={() => setCommandOpen(false)}>View all modules <LayoutGrid size={13} /></Link>
              </div>
              {commandResults.length > 0 ? commandResults.map((item) => {
                const Icon = item.icon;
                return (
                  <Link href={item.href} key={`${item.section}-${item.href}`} onClick={() => setCommandOpen(false)}>
                    <span className="command-result-icon"><Icon size={17} /></span>
                    <span><strong>{item.label}</strong><small>{item.section}</small></span>
                    <ChevronRight size={15} />
                  </Link>
                );
              }) : (
                <div className="command-empty"><Search size={22} /><strong>No matching module</strong><span>Try a feature name such as camera, report, audit or branch.</span></div>
              )}
            </div>
            <footer><span><kbd>Enter</kbd> open</span><span><kbd>Esc</kbd> close</span><strong>{searchableModules.length} modules available</strong></footer>
          </section>
        </div>
      )}
    </div>
  );
}
