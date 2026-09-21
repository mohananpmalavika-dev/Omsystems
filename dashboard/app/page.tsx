import { AppLayout } from "@/components/app-layout";
import { CommandCenterView } from "@/components/operations/command-center-view";
import { ErrorBoundary } from "@/components/ui/error-boundary";

export const dynamic = "force-dynamic";

export default function Page() {
  return (
    <AppLayout>
      <div className="overview-page max-w-[1480px] mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-7">
        <ErrorBoundary>
          <CommandCenterView />
        </ErrorBoundary>
      </div>
    </AppLayout>
  );
}

