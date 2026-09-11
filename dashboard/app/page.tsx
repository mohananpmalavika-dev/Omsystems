import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { AppLayout } from "@/components/app-layout";
import { CommandCenterView } from "@/components/operations/command-center-view";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const dynamic = "force-dynamic";

export default async function Page() {
  const cookieStore = await cookies();
  if (!cookieStore.has("sentinel_access")) {
    redirect("/login");
  }
  return (
    <AppLayout>
      <div className="overview-page max-w-[1480px] mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <div className="overview-heading mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow-label">
              Operations workspace
            </p>
            <h2 className="overview-title mt-1 text-2xl font-bold text-slate-100 sm:text-3xl">
              Command Center
            </h2>
            <p className="overview-subtitle mt-1 max-w-2xl text-sm text-slate-400">
              See what needs attention, move from signal to evidence, and keep every branch operational.
            </p>
          </div>
          <div className="overview-status" aria-label="Live operations status">
            <span className="overview-status-dot" />
            <span>Operational telemetry</span>
            <span className="overview-status-divider" />
            <span className="overview-status-muted">Truth state shown below</span>
          </div>
        </div>

        <ErrorBoundary fallback={<div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-rose-300">Surveillance Command Center is temporarily unavailable.</div>}>
          <CommandCenterView />
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
}
