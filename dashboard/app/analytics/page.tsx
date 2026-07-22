import { AppLayout } from "@/components/app-layout";
import { AnalyticsConsole } from "@/components/analytics-console";

export default function AnalyticsPage() {
  return (
    <AppLayout>
      <div className="content" style={{ background: "var(--canvas)", paddingBottom: "42px" }}>
        <AnalyticsConsole />
      </div>
    </AppLayout>
  );
}
