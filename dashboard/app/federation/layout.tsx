import { AppLayout } from "@/components/app-layout";

export default function FederationLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell federation-section">{children}</div>
    </AppLayout>
  );
}
