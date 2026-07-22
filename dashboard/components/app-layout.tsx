"use client";

import {
  Activity,
  Bell,
  Building2,
  Camera,
  ChevronRight,
  CircleUserRound,
  Command,
  Download,
  FileVideo2,
  LayoutDashboard,
  Menu,
  MonitorPlay,
  MoreHorizontal,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Siren,
  Wifi,
  X,
} from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";

interface AppLayoutProps {
  children: React.ReactNode;
  incidentCount?: number;
  cameraCount?: number;
}

export function AppLayout({ children, incidentCount = 0, cameraCount = 8 }: AppLayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const pathname = usePathname();

  const isActive = (path: string) => {
    if (path === "/" && pathname === "/") return true;
    if (path !== "/" && pathname?.startsWith(path)) return true;
    return false;
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
        <div className="brand">
          <div className="brand-mark"><ShieldCheck size={23} /></div>
          <div><strong>Sentinel</strong><span>GRID</span></div>
          <button className="mobile-close" onClick={() => setSidebarOpen(false)}>
            <X size={19} />
          </button>
        </div>

        <div className="command-search">
          <Search size={15} />
          <span>Search anything</span>
          <kbd><Command size={11} /> K</kbd>
        </div>

        <nav className="main-nav" aria-label="Main navigation">
          <p>OPERATIONS</p>
          <a href="/" className={isActive("/") ? "active" : ""}>
            <LayoutDashboard size={18} />Overview
          </a>
          <a href="/#live-wall" className={isActive("/#live-wall") ? "active" : ""}>
            <MonitorPlay size={18} />Live wall<span className="nav-count">{cameraCount}</span>
          </a>
          <a href="/#incidents" className={isActive("/#incidents") ? "active" : ""}>
            <Siren size={18} />Incidents
            {incidentCount > 0 && <span className="alert-count">{incidentCount}</span>}
          </a>
          <a href="/analytics" className={isActive("/analytics") ? "active" : ""}>
            <Activity size={18} />Video analytics
          </a>
          <a href="/health" className={isActive("/health") ? "active" : ""}>
            <Activity size={18} />Health
          </a>
          <p>MANAGEMENT</p>
          <a href="/admin" className={isActive("/admin") ? "active" : ""}>
            <Building2 size={18} />Organization
          </a>
          <a href="/admin?tab=users" className={isActive("/admin?tab=users") ? "active" : ""}>
            <Camera size={18} />Access control
          </a>
          <a href="/compliance" className={isActive("/compliance") ? "active" : ""}>
            <ShieldCheck size={18} />Compliance
          </a>
          <a href="/maintenance/privacy" className={isActive("/maintenance/privacy") ? "active" : ""}>
            <ShieldCheck size={18} />Privacy
          </a>
          <a href="/reports" className={isActive("/reports") ? "active" : ""}>
            <FileVideo2 size={18} />Reports
          </a>
          <a href="/maintenance" className={isActive("/maintenance") ? "active" : ""}>
            <SlidersHorizontal size={18} />Maintenance
          </a>
          <a href="/recordings" className={isActive("/recordings") ? "active" : ""}>
            <FileVideo2 size={18} />Recordings
          </a>
          <a href="/exports" className={isActive("/exports") ? "active" : ""}>
            <Download size={18} />Exports
          </a>
        </nav>

        <div className="sidebar-status">
          <div className="pulse-icon"><Wifi size={17} /></div>
          <div><strong>Platform healthy</strong><span>All services operational</span></div>
          <ChevronRight size={16} />
        </div>
        <div className="sidebar-user">
          <div className="avatar">AR</div>
          <div><strong>Arun Rao</strong><span>Regional operator</span></div>
          <MoreHorizontal size={18} />
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <button className="menu-button" onClick={() => setSidebarOpen(true)}>
            <Menu size={20} />
          </button>
          <div>
            <div className="breadcrumbs">
              Retail Division <ChevronRight size={13} /> South Region
            </div>
            <h1>Security operations</h1>
          </div>
          <div className="topbar-actions">
            <div className="timezone">IST <span>•</span> Live</div>
            <button aria-label="Notifications" className="notification">
              <Bell size={19} />
              {incidentCount > 0 && <i />}
            </button>
            <button aria-label="Settings"><Settings size={19} /></button>
            <div className="top-avatar"><CircleUserRound size={21} /></div>
          </div>
        </header>

        {children}
      </main>
    </div>
  );
}
