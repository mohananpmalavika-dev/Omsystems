import type { Metadata } from "next";
import { GlobalAlertCenter } from "@/components/global-alert-center";
import { SessionProvider } from "@/components/session-provider";
import { ActivityMonitor } from "@/components/activity-monitor";
import { ApplicationShell } from "@/components/application-shell";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinel Grid | Security Operations",
  description: "Multi-branch CCTV monitoring and security operations",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <head>
        <script src="https://cdn.jsdelivr.net/npm/jsqr@1.4.0/dist/jsQR.min.js" async></script>
      </head>
      <body>
        <SessionProvider>
          <ActivityMonitor>
            <ApplicationShell>{children}</ApplicationShell>
            <GlobalAlertCenter/>
          </ActivityMonitor>
        </SessionProvider>
      </body>
    </html>
  );
}
