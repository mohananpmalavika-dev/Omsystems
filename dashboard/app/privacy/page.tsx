import Link from "next/link";
import { LockKeyhole } from "lucide-react";
import { PageHero } from "@/components/page-hero";

export default function PrivacyPolicyPage() {
  return (
    <main className="legal-page">
      <PageHero eyebrow="Legal" title="Privacy policy" description="How Sentinel Grid handles account, operational, device, and video-security information." icon={LockKeyhole} />
      <article className="legal-panel">
        <p className="legal-updated">Last updated: August 10, 2026</p>
        <LegalSection title="Information handled">Sentinel Grid may process account identifiers, organization and branch configuration, device telemetry, audit activity, incidents, evidence metadata, and video-security records configured by your organization.</LegalSection>
        <LegalSection title="How information is used">Information is used to authenticate operators, operate monitoring and response workflows, maintain platform reliability, preserve audit history, enforce retention controls, and meet your organization&apos;s security and compliance requirements.</LegalSection>
        <LegalSection title="Access and sharing">Access is controlled by your organization&apos;s roles and permissions. Information is shared only with configured service providers, integrations, or authorized recipients needed to provide the service and fulfill administrator-approved workflows.</LegalSection>
        <LegalSection title="Retention and security">Retention follows organization policy and applicable configuration. Sentinel Grid uses access controls, audit logging, encryption capabilities, and session safeguards, while your organization remains responsible for its deployment, lawful basis, notices, and camera placement.</LegalSection>
        <LegalSection title="Questions and requests">Contact your organization administrator for access, correction, retention, or privacy requests. Administrators can review privacy controls and processing purposes in the <Link href="/maintenance/privacy">privacy governance workspace</Link>.</LegalSection>
      </article>
    </main>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2>{title}</h2><p>{children}</p></section>;
}
