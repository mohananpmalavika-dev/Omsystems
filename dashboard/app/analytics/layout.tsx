import { AppLayout } from "@/components/app-layout";
import { AnalyticsModuleNav } from "@/components/analytics-module-nav";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell intelligence-section">
        <AnalyticsModuleNav />
        {children}
      </div>
    </AppLayout>
  );
}
