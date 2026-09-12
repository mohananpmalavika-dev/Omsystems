import { AppLayout } from "@/components/app-layout";
import { VideoBookmarksWorkspace } from "@/components/video-bookmarks-workspace";
import { Suspense } from "react";

export const metadata = {
  title: "Video Timeline Bookmarks | Sentinel Grid VMS",
  description: "Operator tagged timestamps with notes, priority levels, and incident associations.",
};

export default function VideoBookmarksPage() {
  return (
    <AppLayout>
      <div className="p-6 max-w-[1600px] mx-auto">
        <Suspense
          fallback={
            <div className="py-24 text-center text-slate-500 font-mono text-sm">
              Loading Video Timeline Bookmarks workspace...
            </div>
          }
        >
          <VideoBookmarksWorkspace />
        </Suspense>
      </div>
    </AppLayout>
  );
}
