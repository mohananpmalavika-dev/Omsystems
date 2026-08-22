import { AppLayout } from "@/components/app-layout";

export default function ComplianceLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell governance-section">{children}</div>
    </AppLayout>
  );
}
