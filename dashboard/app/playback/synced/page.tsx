"use client";

import React from "react";
import { AppLayout } from "@/components/app-layout";
import { SyncedPlaybackView } from "@/components/synced-playback-view";
import { NotificationsProvider } from "@/components/notifications/NotificationsProvider";
import { MonitorPlay } from "lucide-react";
import { PageHero } from "@/components/page-hero";

export default function Page() {
  // Example camera IDs — replace with real IDs when testing
  const cameraIds = ["camera-1", "camera-2", "camera-3"];
  const to = new Date();
  const from = new Date(to.getTime() - 2 * 60 * 1000); // last 2 minutes

  return (
    <AppLayout>
      <NotificationsProvider>
        <div className="content synced-playback-page">
          <PageHero eyebrow="Forensic playback" title="Synchronized playback" description="Review multiple camera timelines together with a shared clock, master stream, and evidence-ready controls." icon={MonitorPlay} />
          <SyncedPlaybackView
            streams={[]}
            cameraIds={cameraIds}
            fromTime={from.toISOString()}
            toTime={to.toISOString()}
            autoLoad={true}
          />
        </div>
      </NotificationsProvider>
    </AppLayout>
  );
}
