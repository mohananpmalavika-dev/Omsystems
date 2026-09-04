import Link from "next/link";
import { Activity, BookOpen, HelpCircle, LockKeyhole, Server, ShieldCheck } from "lucide-react";
import { PageHero } from "@/components/page-hero";

const supportOptions = [
  { title: "Platform health", description: "Check device, storage, recording, and connectivity status before escalating an issue.", href: "/maintenance/health", action: "Open health checks", icon: Activity },
  { title: "System management", description: "Review enrolled gateways, cameras, branches, and service connectivity.", href: "/admin/system", action: "Inspect the system", icon: Server },
  { title: "Account security", description: "Review your session, password controls, and protected account settings.", href: "/account/security", action: "Open account security", icon: LockKeyhole },
  { title: "Module directory", description: "Find every operational workspace and quick-create workflow in one catalog.", href: "/modules", action: "Browse all modules", icon: BookOpen },
];

export default function SupportPage() {
  return (
    <main className="support-page">
      <PageHero
        eyebrow="Help center"
        title="KryptonVision support"
        description="Troubleshoot common operational issues, find the right workspace, and collect useful context for your administrator."
        icon={HelpCircle}
        actions={<div className="page-hero-status"><ShieldCheck size={17} /><div><span>Recommended first step</span><strong>Check platform health</strong></div></div>}
      />
      <section className="support-panel">
        <header><span>Self-service</span><h2>Resolve or diagnose an issue</h2><p>These checks cover the most common camera, gateway, session, and navigation problems.</p></header>
        <div className="support-option-grid">
          {supportOptions.map(({ title, description, href, action, icon: Icon }) => (
            <Link href={href} key={href}><span><Icon size={20} /></span><div><strong>{title}</strong><p>{description}</p><em>{action}</em></div></Link>
          ))}
        </div>
      </section>
      <section className="support-escalation">
        <div><span>Need administrator help?</span><h2>Include the page, time, and affected branch</h2><p>Share the exact workflow, the branch or device involved, the visible error message, and when the issue occurred. Never include passwords, camera credentials, or session tokens.</p></div>
        <Link href="/activity-report" className="btn-secondary">Review recent activity</Link>
      </section>
    </main>
  );
}
