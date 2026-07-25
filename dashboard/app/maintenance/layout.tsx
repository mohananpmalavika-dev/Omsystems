import { AppLayout } from "@/components/app-layout";

export default function MaintenanceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell maintenance-section">{children}</div>
    </AppLayout>
  );
}
