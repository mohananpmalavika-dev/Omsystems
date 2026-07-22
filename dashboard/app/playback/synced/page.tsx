"use client";

import React from "react";
import { SyncedPlaybackView } from "@/components/synced-playback-view";
import { NotificationsProvider } from "@/components/notifications/NotificationsProvider";

export default function Page() {
  // Example camera IDs — replace with real IDs when testing
  const cameraIds = ["camera-1", "camera-2", "camera-3"];
  const to = new Date();
  const from = new Date(to.getTime() - 2 * 60 * 1000); // last 2 minutes

  return (
    <NotificationsProvider>
      <div style={{ padding: 20, height: "100vh" }}>
        <SyncedPlaybackView
          streams={[]}
          cameraIds={cameraIds}
          fromTime={from.toISOString()}
          toTime={to.toISOString()}
          autoLoad={true}
        />
      </div>
    </NotificationsProvider>
  );
}
