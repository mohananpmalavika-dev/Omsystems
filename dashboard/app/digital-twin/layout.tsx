import { AppLayout } from "@/components/app-layout";

export default function DigitalTwinLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell digital-twin-section">{children}</div>
    </AppLayout>
  );
}
