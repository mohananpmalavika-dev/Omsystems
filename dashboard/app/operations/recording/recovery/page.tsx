import { AppLayout } from "@/components/app-layout";
import { RecordingRecoveryWorkspace } from "@/components/recording-recovery-workspace";
import { Suspense } from "react";

export const metadata = {
  title: "Recording Gap Recovery & Edge Backfill | SentinelGrid VMS",
  description: "Automated recording continuity verification, edge store-and-forward backfill, and zero-duplicate frame recovery.",
};

export default function RecordingRecoveryPage() {
  return (
    <AppLayout>
      <div className="page-container py-6">
        <Suspense
          fallback={
            <div className="py-20 text-center text-gray-500">
              Loading recording gap recovery & edge backfill workspace…
            </div>
          }
        >
          <RecordingRecoveryWorkspace />
        </Suspense>
      </div>
    </AppLayout>
  );
}
