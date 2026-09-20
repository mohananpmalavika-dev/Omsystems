import { AppLayout } from "@/components/app-layout";
import { CommandCenterView } from "@/components/operations/command-center-view";
import { ErrorBoundary } from "@/components/ui/error-boundary";
import { ShieldCheck } from "lucide-react";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppLayout>
      <div className="overview-page max-w-[1480px] mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <header className="overview-heading mb-5 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="eyebrow-label">
              Bank &amp; NBFC security operations
            </p>
            <h1 className="overview-title mt-1 text-2xl font-bold text-slate-100 sm:text-3xl">
              Keep every branch protected, 24×7.
            </h1>
            <p className="overview-subtitle mt-1 max-w-2xl text-sm text-slate-400">
              Surface cash-area, sensitive-zone, and perimeter risk early; investigate quickly; preserve video with verifiable integrity and custody.
            </p>
          </div>
          <div className="overview-identity" aria-label="Operational workflow">
            <span className="overview-identity-icon"><ShieldCheck size={19} /></span>
            <span>
              <small>24×7 evidence-led protection</small>
              <strong>Protect · Investigate fast · Preserve proof</strong>
            </span>
          </div>
        </header>

        <ErrorBoundary>
          <CommandCenterView />
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
}

