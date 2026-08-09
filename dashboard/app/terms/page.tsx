import { FileText } from "lucide-react";
import { PageHero } from "@/components/page-hero";

export default function TermsPage() {
  return (
    <main className="legal-page">
      <PageHero eyebrow="Legal" title="Terms of service" description="The operating terms for authorized use of Sentinel Grid." icon={FileText} />
      <article className="legal-panel">
        <p className="legal-updated">Last updated: August 10, 2026</p>
        <LegalSection title="Authorized use">Use Sentinel Grid only through an account and organization you are authorized to access. Operators must follow applicable law, organizational policy, retention requirements, and camera-surveillance rules.</LegalSection>
        <LegalSection title="Account responsibility">Keep credentials secure, use the permissions assigned to you, and report suspected unauthorized access promptly. Activity may be logged for security, compliance, and operational accountability.</LegalSection>
        <LegalSection title="Operational decisions">Alerts, analytics, predictions, and automated summaries support human decision-making. Operators remain responsible for validating material findings and following approved response procedures.</LegalSection>
        <LegalSection title="Acceptable use">Do not bypass access controls, interfere with service availability, introduce malicious content, access unrelated tenant data, or use video and identity information for an unauthorized purpose.</LegalSection>
        <LegalSection title="Availability and changes">Features may change as the platform evolves or as administrators modify organization configuration. Planned maintenance, external integrations, and network conditions may affect availability.</LegalSection>
      </article>
    </main>
  );
}

function LegalSection({ title, children }: { title: string; children: React.ReactNode }) {
  return <section><h2>{title}</h2><p>{children}</p></section>;
}
