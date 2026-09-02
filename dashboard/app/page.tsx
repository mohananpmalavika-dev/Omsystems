import { AppLayout } from "@/components/app-layout";
import { CommandCenterView } from "@/components/operations/command-center-view";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export default function Page() {
  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
        <ErrorBoundary fallback={<div className="p-6 bg-slate-900 border border-slate-800 rounded-xl text-rose-300">Surveillance Command Center is temporarily unavailable.</div>}>
          <CommandCenterView />
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
}
