import { AppLayout } from "@/components/app-layout";

export default function ControlRoomLayout({ children }: { children: React.ReactNode }) {
  return (
    <AppLayout>
      <div className="product-section-shell control-room-section">{children}</div>
    </AppLayout>
  );
}
