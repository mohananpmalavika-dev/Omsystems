import { AppLayout } from "@/components/app-layout";

export default function AuditLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell audit-section">{children}</div>
    </AppLayout>
  );
}
