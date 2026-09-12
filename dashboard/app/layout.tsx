import type { Metadata } from "next";
import { GlobalAlertCenter } from "@/components/global-alert-center";
import { SessionProvider } from "@/components/session-provider";
import { ActivityMonitor } from "@/components/activity-monitor";
import { ApplicationShell } from "@/components/application-shell";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { OrgBrandingProvider } from "@/components/ui/org-branding-provider";
import { PerformanceMonitorProvider } from "@/components/performance-monitor-provider";
import "./globals.css";

export const metadata: Metadata = {
  title: "KryptonVision | Security Operations",
  description: "Multi-branch CCTV monitoring and security operations",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "KryptonVision",
  },
  icons: {
    icon: "/icon-192.png",
    apple: "/apple-touch-icon.png",
  },
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

  // Register PWA Service Worker
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function() {
      navigator.serviceWorker.register('/sw.js').catch(function(err) {
        console.debug('ServiceWorker registration:', err);
      });
    });
  }
})();
`;

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="theme-color" content="#0f172a" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <meta name="apple-mobile-web-app-title" content="KryptonVision" />
        <link rel="apple-touch-icon" href="/apple-touch-icon.png" />
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body suppressHydrationWarning>
        <ThemeProvider>
          <OrgBrandingProvider>
            <SessionProvider>
              <ActivityMonitor>
                 <PerformanceMonitorProvider>
                <ApplicationShell>{children}</ApplicationShell>
                <GlobalAlertCenter />
                 </PerformanceMonitorProvider>
              </ActivityMonitor>
            </SessionProvider>
          </OrgBrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
