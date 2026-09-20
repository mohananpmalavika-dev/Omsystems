import { Suspense } from 'react';
import { AppLayout } from '@/components/app-layout';
import { AIChatWithVideo } from '@/components/ai-chat-with-video';
import { InvestigationFlowNav } from '@/components/investigation-flow-nav';

export default function Page() {
  return (
    <AppLayout>
      <div className="product-section-shell investigation-section">
        <InvestigationFlowNav />
        <Suspense fallback={<div className="route-loading" aria-busy="true">Loading video search...</div>}>
          <AIChatWithVideo />
        </Suspense>
      </div>
    </AppLayout>
  );
}
