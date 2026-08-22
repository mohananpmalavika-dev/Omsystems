import { AppLayout } from "@/components/app-layout";

export default function AnalyticsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell intelligence-section">{children}</div>
    </AppLayout>
  );
}
