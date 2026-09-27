import { Suspense } from 'react';
import { AppLayout } from '@/components/app-layout';
import { AIChatWithVideo } from '@/components/ai-chat-with-video';
import { InvestigationFlowNav } from '@/components/investigation-flow-nav';
import { PageHero } from '@/components/page-hero';
import { Search } from 'lucide-react';

export default function Page() {
  return (
    <AppLayout>
      <div className="product-section-shell investigation-section">
        <InvestigationFlowNav />
        <div className="investigation-page-body">
          <PageHero eyebrow="Video intelligence" title="Find the moment that matters" description="Search footage in natural language, inspect matching cameras, and move from discovery to evidence." icon={Search} />
        <Suspense fallback={<div className="route-loading" aria-busy="true">Loading video search...</div>}>
          <AIChatWithVideo />
        </Suspense>
        </div>
      </div>
    </AppLayout>
  );
}
