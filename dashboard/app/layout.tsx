import type { Metadata } from "next";
import { GlobalAlertCenter } from "@/components/global-alert-center";
import { SessionProvider } from "@/components/session-provider";
import { ActivityMonitor } from "@/components/activity-monitor";
import { ApplicationShell } from "@/components/application-shell";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { OrgBrandingProvider } from "@/components/ui/org-branding-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "Sentinel Grid | Security Operations",
  description: "Multi-branch CCTV monitoring and security operations",
};

const THEME_SCRIPT = `
(function() {
  try {
    var stored = localStorage.getItem('sentinel-grid-active-theme');
    var theme = (stored === 'light' || stored === 'navy' || stored === 'emerald' || stored === 'dark') ? stored : 'light';
    document.documentElement.setAttribute('data-theme', theme);
    document.documentElement.style.colorScheme = theme === 'light' ? 'light' : 'dark';
    if (theme === 'light') {
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } else {
      document.documentElement.classList.remove('light');
      document.documentElement.classList.add('dark');
    }
  } catch (e) {
    document.documentElement.setAttribute('data-theme', 'light');
    document.documentElement.classList.add('light');
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <OrgBrandingProvider>
            <SessionProvider>
              <ActivityMonitor>
                <ApplicationShell>{children}</ApplicationShell>
                <GlobalAlertCenter />
              </ActivityMonitor>
            </SessionProvider>
          </OrgBrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
