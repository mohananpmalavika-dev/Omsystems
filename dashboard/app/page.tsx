import { AppLayout } from "@/components/app-layout";
import OperationalHealthDashboard from "@/components/operational-health-dashboard";

export default function Page() {
  return (
    <AppLayout>
      <div className="product-section-shell operations-section">
        <OperationalHealthDashboard />
      </div>
    </AppLayout>
  );
}
