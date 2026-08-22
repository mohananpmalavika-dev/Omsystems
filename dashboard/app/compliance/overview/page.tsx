'use client';

import Link from 'next/link';
import {
  Activity,
  ArrowRight,
  BarChart3,
  CheckCircle2,
  ClipboardCheck,
  FileSearch,
  FileText,
  Gauge,
  LayoutDashboard,
  Shield,
  ShieldCheck,
  TrendingUp,
} from 'lucide-react';
import { PageHero } from '@/components/page-hero';

const workspaces = [
  {
    href: '/compliance/dashboard',
    label: 'Compliance dashboard',
    description: 'Monitor framework coverage, performance indicators, and assurance trends.',
    action: 'View dashboard',
    icon: LayoutDashboard,
  },
  {
    href: '/compliance/requirements',
    label: 'Requirements',
    description: 'Maintain regulatory obligations and map them across approved frameworks.',
    action: 'Manage requirements',
    icon: FileText,
  },
  {
    href: '/compliance/controls',
    label: 'Controls',
    description: 'Track control implementation, ownership, testing, and effectiveness.',
    action: 'Review controls',
    icon: ShieldCheck,
  },
  {
    href: '/compliance/findings',
    label: 'Findings',
    description: 'Coordinate gaps, non-conformities, remediation, and closure evidence.',
    action: 'Track findings',
    icon: FileSearch,
  },
  {
    href: '/compliance/evidence',
    label: 'Evidence repository',
    description: 'Keep assurance evidence organized, verified, and ready for review.',
    action: 'Open repository',
    icon: ClipboardCheck,
  },
  {
    href: '/compliance/risks',
    label: 'Risk register',
    description: 'Assess compliance exposure and connect mitigation work to owners.',
    action: 'Assess risks',
    icon: TrendingUp,
  },
];

const capabilities = [
  { label: 'Live posture', description: 'Track assurance metrics as operational evidence changes.', icon: Activity },
  { label: 'Audit readiness', description: 'Keep controls, findings, and supporting evidence connected.', icon: CheckCircle2 },
  { label: 'Multi-framework', description: 'Support ISO, SOC 2, HIPAA, GDPR, and internal standards.', icon: Shield },
  { label: 'Risk alignment', description: 'Prioritize remediation using impact and control coverage.', icon: Gauge },
];

export default function ComplianceOverviewPage() {
  return (
    <main className="compliance-hub-page">
      <PageHero
        eyebrow="Assurance workspace"
        title="Compliance management"
        description="A coordinated workspace for regulatory requirements, controls, evidence, findings, and audit readiness."
        icon={Shield}
        actions={(
          <Link href="/compliance/dashboard" className="btn-primary">
            <BarChart3 size={16} /> Open dashboard
          </Link>
        )}
      />

      <section className="compliance-hub-summary" aria-label="Compliance summary">
        <SummaryCard label="Frameworks" value="—" detail="Approved assurance standards" />
        <SummaryCard label="Requirements" value="—" detail="Mapped obligations" />
        <SummaryCard label="Controls" value="—" detail="Implemented safeguards" />
        <SummaryCard label="Open findings" value="—" detail="Items requiring remediation" attention />
      </section>

      <section className="compliance-hub-panel">
        <header className="compliance-hub-heading">
          <div>
            <span>Workspace directory</span>
            <h2>Compliance operations</h2>
            <p>Move from requirements to verified evidence without losing ownership or context.</p>
          </div>
          <Link href="/compliance" className="btn-secondary">Framework catalog <ArrowRight size={15} /></Link>
        </header>
        <div className="compliance-hub-grid">
          {workspaces.map(({ href, label, description, action, icon: Icon }) => (
            <Link key={href} href={href} className="compliance-hub-module">
              <span className="compliance-hub-module-icon"><Icon size={21} /></span>
              <div>
                <h3>{label}</h3>
                <p>{description}</p>
                <span className="compliance-hub-module-action">{action} <ArrowRight size={13} /></span>
              </div>
            </Link>
          ))}
        </div>
      </section>

      <section className="compliance-capability-panel">
        <header>
          <span>Assurance foundation</span>
          <h2>Built for continuous compliance</h2>
        </header>
        <div className="compliance-capability-grid">
          {capabilities.map(({ label, description, icon: Icon }) => (
            <article key={label}>
              <span><Icon size={19} /></span>
              <h3>{label}</h3>
              <p>{description}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}

function SummaryCard({ label, value, detail, attention = false }: { label: string; value: string; detail: string; attention?: boolean }) {
  return (
    <article className={`compliance-hub-summary-card${attention ? ' attention' : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <p>{detail}</p>
    </article>
  );
}
