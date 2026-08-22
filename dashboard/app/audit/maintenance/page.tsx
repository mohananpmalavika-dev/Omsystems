import React, { Suspense } from "react";
import MaintenanceAuditClient from "./maintenance-client";

export default function Page() {
  return (
    <Suspense fallback={<div /> }>
      <MaintenanceAuditClient />
    </Suspense>
  );
}
