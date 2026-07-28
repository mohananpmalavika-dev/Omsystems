import type { Metadata } from "next";
import { GlobalAlertCenter } from "@/components/global-alert-center";
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
      <body>{children}<GlobalAlertCenter/></body>
    </html>
  );
}
