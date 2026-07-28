import { AppLayout } from "@/components/app-layout";

export default function OperationsLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell operations-section">{children}</div>
    </AppLayout>
  );
}
