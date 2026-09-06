import { AppLayout } from "@/components/app-layout";
import { CommandCenterView } from "@/components/operations/command-center-view";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export default function Page() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <div className="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-blue-400/80">
              Security operations
            </p>
            <h2 className="mt-1 text-xl font-bold text-slate-100 sm:text-2xl">
              Mission Control
            </h2>
          </div>
          <div className="inline-flex items-center gap-2 rounded-full border border-slate-700 bg-slate-900/80 px-3 py-1.5 text-[11px] font-medium text-slate-300 shadow-sm shadow-slate-950/30">
            <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
            Live operations status · stable
          </div>
        </div>

        <ErrorBoundary fallback={<div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-rose-300">Surveillance Command Center is temporarily unavailable.</div>}>
          <CommandCenterView />
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
}
