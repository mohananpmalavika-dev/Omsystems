import { AppLayout } from "@/components/app-layout";
import { RecordingWorkspace } from "@/components/recording-workspace";
import { Suspense } from "react";

export default function RecordingsPage() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="page-container py-12 text-center text-gray-500">Loading playback workspace…</div>}>
        <RecordingWorkspace />
      </Suspense>
    </AppLayout>
  );
}
