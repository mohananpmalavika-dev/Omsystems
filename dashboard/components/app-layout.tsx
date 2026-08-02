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
  Library,
  ListFilter,
  LockKeyhole,
  Menu,
  MonitorPlay,
  Network,
  Play,
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
import { useState } from "react";

interface AppLayoutProps {
  children: React.ReactNode;
  incidentCount?: number;
  cameraCount?: number;
}

type NavItem = {
  label: string;
  href: string;
  icon: LucideIcon;
  badge?: "cameras" | "incidents";
};

type NavGroup = {
  label: string;
  icon: LucideIcon;
  items: NavItem[];
};

const navigation: NavGroup[] = [
  {
    label: "Overview",
    icon: LayoutDashboard,
    items: [
      { label: "Operations overview", href: "/", icon: LayoutDashboard },
      { label: "Executive dashboard", href: "/dashboards", icon: BarChart3 },
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

const pageMeta = [
  ...navigation.flatMap((group) => group.items.map((item) => ({
    path: item.href,
    section: group.label,
    title: item.label,
  }))),
  { path: "/operations/branches", section: "Infrastructure health", title: "Branch health" },
  { path: "/camera-detail", section: "Infrastructure health", title: "Camera details" },
];

export function AppLayout({ children, incidentCount = 0, cameraCount = 0 }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
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

        <Link href="/video-search" className="command-search" onClick={closeSidebar}>
          <Search size={15} />
          <span>Search your security estate</span>
          <kbd><Command size={11} /> K</kbd>
        </Link>

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
            <div><strong>All systems connected</strong><span>Cloud, recording and edge</span></div>
            <ChevronRight size={15} />
          </Link>
          <Link href="/account/security" className="sidebar-user" onClick={closeSidebar}>
            <div className="avatar">SO</div>
            <div><strong>Security operator</strong><span>Protected enterprise session</span></div>
            <Settings size={16} />
          </Link>
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
            <Link href="/video-search" className="topbar-icon" aria-label="Search"><Search size={18} /></Link>
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
    </div>
  );
}
