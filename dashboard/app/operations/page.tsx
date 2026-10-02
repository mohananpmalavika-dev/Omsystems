import OperationalHealthDashboard from "@/components/operational-health-dashboard";
import Link from "next/link";

const workflows = [
  ["Branch health", "/operations/device-connectivity", "Inspect device connectivity and available health evidence."],
  ["Recording assurance", "/operations/recording/recovery", "Scan recording gaps and track footage recovery."],
  ["Incident response", "/incidents", "Investigate alerts, assign ownership and follow response steps."],
  ["Recovery operations", "/operations/ha-failover", "Review failover and recovery activity."],
  ["Banking operations", "/nbfc-operations", "Review branch security rules and banking workflows."],
  ["AI quality", "/admin/ai-quality", "Review detector evaluations and certification evidence."],
  ["Edge continuity", "/operations/edge-fleet", "Inspect branch agents and connectivity during WAN disruptions."],
  ["Evidence", "/evidence", "Preserve and export incident evidence."],
] as const;

export default function OperationsPage() {
  return <>
    <section aria-label="Security operations workflows" className="mx-auto max-w-7xl px-4 pt-6">
      <h1 className="text-xl font-semibold">Security operations</h1>
      <p className="mt-1 text-sm text-muted-foreground">Follow branch health, recording, response and evidence from one workspace.</p>
      <div className="my-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {workflows.map(([title, href, description]) => <Link key={href} href={href} className="rounded-xl border border-border bg-card p-4 transition hover:bg-accent focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2">
          <span className="font-medium">{title}</span>
          <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        </Link>)}
      </div>
    </section>
    <OperationalHealthDashboard />
  </>;
}
