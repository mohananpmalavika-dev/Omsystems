import type { Metadata } from "next";
import { SessionProvider } from "@/components/session-provider";
import { ActivityMonitor } from "@/components/activity-monitor";
import { ApplicationShell } from "@/components/application-shell";
import { ThemeProvider } from "@/components/ui/theme-provider";
import { OrgBrandingProvider } from "@/components/ui/org-branding-provider";
import { PerformanceMonitorProvider } from "@/components/performance-monitor-provider";
import { NotificationsProvider } from "@/components/notifications/NotificationsProvider";
import "./globals.css";
import "./workspace.css";
import "./rich.css";
import "./dashboard-rich.css";
import "./experience.css";
import "./field-experience.css";
import "./command-atlas.css";
import "./workflow-experience.css";
import "./live-operations-stage.css";
import "./command-workspaces.css";
import "./brand-unity.css";
import "./section-hubs.css";

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
      if (${process.env.NODE_ENV === "development"}) {
        // A worker installed by an earlier preview can retain development CSS.
        var workerUrl = new URL('/sw.js', window.location.origin).href;
        var hadPreviewWorker = navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL === workerUrl;
        Promise.all([
          navigator.serviceWorker.getRegistrations().then(function(registrations) {
            return Promise.all(registrations.filter(function(reg) {
              var worker = reg.active || reg.waiting || reg.installing;
              return worker && worker.scriptURL === workerUrl;
            }).map(function(reg) { return reg.unregister(); }));
          }),
          window.caches ? caches.keys().then(function(names) {
            return Promise.all(names.filter(function(name) { return name.indexOf('kryptonvision-pwa-') === 0; }).map(function(name) { return caches.delete(name); }));
          }) : Promise.resolve()
        ]).then(function() {
          if (hadPreviewWorker && !sessionStorage.getItem('sentinel_preview_cache_recovered')) {
            sessionStorage.setItem('sentinel_preview_cache_recovered', '1');
            window.location.reload();
          }
        }).catch(function(err) { console.debug('Preview cache cleanup:', err); });
        return;
      }
      navigator.serviceWorker.register('/sw.js', { updateViaCache: 'none' }).then(function(reg) {
        reg.update();
      }).catch(function(err) {
        console.debug('ServiceWorker registration:', err);
      });
    });
  }

  // Auto-recover from ChunkLoadError (timeout / hash mismatch after new deployments)
  function handleChunkFailure(targetUrlOrMsg, isScriptTag) {
    var str = (targetUrlOrMsg || '') + '';
    var isChunkError = /ChunkLoadError|Loading chunk|Failed to fetch dynamically imported module/i.test(str);
    var isScriptFailure = isScriptTag === true && str.indexOf('/_next/static/chunks/') !== -1;
    if (isChunkError || isScriptFailure) {
      var guardKey = 'sentinel_chunk_reload_guard';
      var lastReload = sessionStorage.getItem(guardKey);
      var now = Date.now();
      if (!lastReload || (now - parseInt(lastReload, 10)) > 20000) {
        sessionStorage.setItem(guardKey, String(now));
        console.warn('[ChunkRecovery] Outdated or timed-out script chunk detected, refreshing application...', str);
        window.location.reload();
      }
    }
  }

  window.addEventListener('error', function(event) {
    if (!event) return;
    if (event.error && (event.error.name === 'ChunkLoadError' || /Loading chunk/i.test(event.error.message))) {
      handleChunkFailure(event.error.message, false);
      return;
    }
    if (event.message && /Loading chunk|ChunkLoadError/i.test(event.message)) {
      handleChunkFailure(event.message, false);
      return;
    }
    var target = event.target || event.srcElement;
    if (target && target.tagName === 'SCRIPT' && target.src && target.src.indexOf('/_next/static/chunks/') !== -1) {
      handleChunkFailure(target.src, true);
    }
  }, true);

  window.addEventListener('unhandledrejection', function(event) {
    if (!event || !event.reason) return;
    var reason = event.reason;
    var msg = (reason && (reason.message || reason.stack || reason)) + '';
    if (/Loading chunk|ChunkLoadError/i.test(msg)) {
      handleChunkFailure(msg, false);
    }
  });
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
            <NotificationsProvider>
              <SessionProvider>
                <ActivityMonitor>
                   <PerformanceMonitorProvider>
                  <ApplicationShell>{children}</ApplicationShell>
                   </PerformanceMonitorProvider>
                </ActivityMonitor>
              </SessionProvider>
            </NotificationsProvider>
          </OrgBrandingProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
