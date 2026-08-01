import type { Metadata } from "next";
import { GlobalAlertCenter } from "@/components/global-alert-center";
import { SessionProvider } from "@/components/session-provider";
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
      <body>
        <SessionProvider>
          {children}
          <GlobalAlertCenter/>
        </SessionProvider>
      </body>
    </html>
  );
}
