import { AppLayout } from "@/components/app-layout";
import { EmployeeActivityReport } from "@/components/EmployeeActivityReport";

export default function ActivityReportPage() {
  return (
    <AppLayout>
      <EmployeeActivityReport apiBaseUrl="/api/control" showAllUsers />
    </AppLayout>
  );
}
