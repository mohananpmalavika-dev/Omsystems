import { Suspense } from 'react';
import { AppLayout } from '@/components/app-layout';
import { EvidenceManager } from '@/components/evidence-manager';
import { InvestigationFlowNav } from '@/components/investigation-flow-nav';

export default function Page() {
  return (
    <AppLayout>
      <div className="product-section-shell investigation-section">
        <InvestigationFlowNav />
        <Suspense fallback={<div className="route-loading" aria-busy="true">Loading evidence workspace...</div>}>
          <EvidenceManager />
        </Suspense>
      </div>
    </AppLayout>
  );
}
