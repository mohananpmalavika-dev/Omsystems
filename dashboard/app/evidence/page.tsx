import { Suspense } from 'react';
import { AppLayout } from '@/components/app-layout';
import { EvidenceManager } from '@/components/evidence-manager';

export default function Page() {
  return (
    <AppLayout>
      <Suspense fallback={<div className="route-loading" aria-busy="true">Loading evidence workspace...</div>}>
        <EvidenceManager />
      </Suspense>
    </AppLayout>
  );
}
