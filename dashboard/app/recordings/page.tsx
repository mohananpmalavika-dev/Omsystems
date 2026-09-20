import { AppLayout } from "@/components/app-layout";
import { RecordingWorkspace } from "@/components/recording-workspace";
import { InvestigationFlowNav } from "@/components/investigation-flow-nav";
import { Suspense } from "react";

export default function RecordingsPage() {
  return (
    <AppLayout>
      <div className="product-section-shell investigation-section">
        <InvestigationFlowNav />
        <Suspense fallback={<div className="page-container py-12 text-center text-gray-500">Loading playback workspace…</div>}>
          <RecordingWorkspace />
        </Suspense>
      </div>
    </AppLayout>
  );
}
