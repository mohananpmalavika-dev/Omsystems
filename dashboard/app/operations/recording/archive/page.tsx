import { AppLayout } from "@/components/app-layout";
import { ColdCloudArchiveWorkspace } from "@/components/cold-cloud-archive-workspace";
import { Suspense } from "react";

export const metadata = {
  title: "Cold Cloud Archive Export | SentinelGrid VMS",
  description: "Long-term automated archival of marked incident video to S3/Glacier object storage with cryptographic SHA-256 verification.",
};

export default function ColdCloudArchivePage() {
  return (
    <AppLayout>
      <div className="page-container py-6">
        <Suspense
          fallback={
            <div className="py-20 text-center text-slate-500">
              Loading cold cloud archive export workspace…
            </div>
          }
        >
          <ColdCloudArchiveWorkspace />
        </Suspense>
      </div>
    </AppLayout>
  );
}
