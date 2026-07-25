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
  FileCheck2,
  FileClock,
  FileSearch,
  FileText,
  FileVideo2,
  Gauge,
  Grid2X2,
  Handshake,
  LayoutDashboard,
  Menu,
  MonitorPlay,
  Play,
  Search,
  Settings,
  Shield,
  ShieldAlert,
  ShieldCheck,
  Siren,
  SlidersHorizontal,
  TrendingUp,
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

const navigation: Array<{ label: string; items: NavItem[] }> = [
  {
    label: "Command",
    items: [
      { label: "Operations overview", href: "/", icon: LayoutDashboard },
      { label: "Operational health", href: "/operations", icon: Gauge },
      { label: "Executive dashboard", href: "/dashboards", icon: BarChart3 },
      { label: "Control room", href: "/control-room", icon: MonitorPlay },
      { label: "Incident response", href: "/incidents", icon: Siren, badge: "incidents" },
      { label: "Video analytics", href: "/analytics", icon: Activity },
      { label: "Analytics dashboard", href: "/analytics/dashboard", icon: TrendingUp },
    ],
  },
  {
    label: "Investigate",
    items: [
      { label: "Recordings", href: "/recordings", icon: FileVideo2 },
      { label: "Synced playback", href: "/playback/synced", icon: Play },
      { label: "Video search", href: "/video-search", icon: Search },
      { label: "Evidence vault", href: "/evidence", icon: FileCheck2 },
      { label: "Reports", href: "/reports", icon: FileSearch },
    ],
  },
  {
    label: "Fleet",
    items: [
      { label: "Maintenance overview", href: "/maintenance", icon: Wrench },
      { label: "Device health", href: "/maintenance/health", icon: Gauge },
      { label: "Maintenance alerts", href: "/maintenance/alerts", icon: AlertTriangle },
      { label: "Predictive maintenance", href: "/maintenance/predictive", icon: TrendingUp },
      { label: "Device management", href: "/maintenance/device-management", icon: SlidersHorizontal },
      { label: "Asset registry", href: "/maintenance/assets", icon: Boxes },
      { label: "Work orders", href: "/maintenance/workorders", icon: ClipboardCheck },
      { label: "Vendors", href: "/maintenance/vendors", icon: Handshake },
      { label: "AMC contracts", href: "/maintenance/amc", icon: FileClock },
      { label: "Maintenance reports", href: "/maintenance/reports", icon: FileSearch },
    ],
  },
  {
    label: "Privacy",
    items: [
      { label: "Privacy overview", href: "/maintenance/privacy", icon: Shield },
      { label: "Camera purposes", href: "/maintenance/privacy/cameras", icon: Camera },
      { label: "Processing purposes", href: "/maintenance/privacy/purposes", icon: FileText },
      { label: "Privacy controls", href: "/maintenance/privacy/controls", icon: ShieldCheck },
      { label: "Breach register", href: "/maintenance/privacy/breaches", icon: ShieldAlert },
    ],
  },
  {
    label: "Assurance",
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
    items: [
      { label: "Organization & devices", href: "/admin", icon: Building2, badge: "cameras" },
      { label: "Integrations", href: "/integrations", icon: SlidersHorizontal },
    ],
  },
];

const pageMeta = [
  { path: "/operations/alerts", section: "Command", title: "Operational alerts" },
  { path: "/operations/branches", section: "Command", title: "Branch health" },
  { path: "/operations", section: "Command", title: "Operational health" },
  { path: "/analytics/dashboard", section: "Intelligence", title: "Analytics dashboard" },
  { path: "/control-room", section: "Command", title: "Control room" },
  { path: "/incidents", section: "Command", title: "Incident response" },
  { path: "/dashboards", section: "Command", title: "Executive dashboard" },
  { path: "/analytics", section: "Intelligence", title: "Video analytics" },
  { path: "/recordings", section: "Investigate", title: "Recording archive" },
  { path: "/playback", section: "Investigate", title: "Synchronized playback" },
  { path: "/video-search", section: "Investigate", title: "Video search" },
  { path: "/evidence", section: "Investigate", title: "Evidence vault" },
  { path: "/reports", section: "Governance", title: "Operational reports" },
  { path: "/admin", section: "Administration", title: "Organization & access" },
  { path: "/maintenance/privacy/breaches", section: "Privacy", title: "Breach register" },
  { path: "/maintenance/privacy/cameras", section: "Privacy", title: "Camera purposes" },
  { path: "/maintenance/privacy/purposes", section: "Privacy", title: "Processing purposes" },
  { path: "/maintenance/privacy/controls", section: "Privacy", title: "Privacy controls" },
  { path: "/maintenance/privacy", section: "Privacy", title: "Privacy governance" },
  { path: "/maintenance/device-management", section: "Fleet operations", title: "Device management" },
  { path: "/maintenance/predictive", section: "Fleet operations", title: "Predictive maintenance" },
  { path: "/maintenance/workorders", section: "Fleet operations", title: "Work orders" },
  { path: "/maintenance/vendors", section: "Fleet operations", title: "Vendors & partners" },
  { path: "/maintenance/assets", section: "Fleet operations", title: "Asset registry" },
  { path: "/maintenance/alerts", section: "Fleet operations", title: "Maintenance alerts" },
  { path: "/maintenance/health", section: "Fleet operations", title: "Device health" },
  { path: "/maintenance/reports", section: "Fleet operations", title: "Maintenance reports" },
  { path: "/maintenance/amc", section: "Fleet operations", title: "AMC contracts" },
  { path: "/maintenance", section: "Fleet operations", title: "Maintenance" },
  { path: "/compliance/assessments", section: "Assurance", title: "Compliance assessments" },
  { path: "/compliance/certificates", section: "Assurance", title: "Certificates" },
  { path: "/compliance/requirements", section: "Assurance", title: "Requirements" },
  { path: "/compliance/dashboard", section: "Assurance", title: "Compliance dashboard" },
  { path: "/compliance/overview", section: "Assurance", title: "Compliance overview" },
  { path: "/compliance/policies", section: "Assurance", title: "Compliance policies" },
  { path: "/compliance/controls", section: "Assurance", title: "Compliance controls" },
  { path: "/compliance/findings", section: "Assurance", title: "Compliance findings" },
  { path: "/compliance/evidence", section: "Assurance", title: "Compliance evidence" },
  { path: "/compliance/risks", section: "Assurance", title: "Risk register" },
  { path: "/compliance", section: "Governance", title: "Compliance" },
  { path: "/audit/branch-compliance", section: "Assurance", title: "Branch compliance audit" },
  { path: "/audit/maintenance", section: "Assurance", title: "Maintenance audit" },
  { path: "/audit/health", section: "Assurance", title: "Camera health audit" },
  { path: "/audit", section: "Governance", title: "Audit assurance" },
  { path: "/integrations", section: "Administration", title: "Integrations" },
  { path: "/", section: "Command", title: "Security operations" },
];

export function AppLayout({ children, incidentCount = 0, cameraCount = 0 }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname() || "/";
  const currentPage = pageMeta.find((item) =>
    item.path === "/" ? pathname === "/" : pathname.startsWith(item.path),
  ) ?? pageMeta.at(-1)!;

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
            <span>Enterprise VMS</span>
          </div>
          <button className="mobile-close" onClick={closeSidebar} aria-label="Close navigation">
            <X size={19} />
          </button>
        </div>

        <Link href="/video-search" className="command-search" onClick={closeSidebar}>
          <Search size={15} />
          <span>Search cameras, incidents…</span>
          <kbd><Command size={11} /> K</kbd>
        </Link>

        <nav className="main-nav" aria-label="Primary navigation">
          {navigation.map((group) => {
            const groupIsActive = group.items.some((item) => isActive(item.href));
            return (
            <details className="nav-group" key={group.label} open={groupIsActive}>
              <summary>
                <span>{group.label}</span>
                <ChevronRight size={13} />
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
            <div><strong>Platform healthy</strong><span>Cloud and edge connected</span></div>
            <ChevronRight size={15} />
          </Link>
          <div className="sidebar-user">
            <div className="avatar">SO</div>
            <div><strong>Security operator</strong><span>Regional operations</span></div>
            <Settings size={16} />
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
              Sentinel Grid <ChevronRight size={12} /> {currentPage.section}
            </div>
            <h1>{currentPage.title}</h1>
          </div>
          <div className="topbar-actions">
            <div className="live-state"><i /> Live operations <span>IST</span></div>
            <Link href="/video-search" className="topbar-icon" aria-label="Search"><Search size={18} /></Link>
            <button aria-label="Notifications" className="notification">
              <Bell size={18} />
              {incidentCount > 0 && <i />}
            </button>
            <div className="top-avatar" aria-label="Operator profile"><CircleUserRound size={20} /></div>
          </div>
        </header>
        {children}
      </main>
    </div>
  );
}
