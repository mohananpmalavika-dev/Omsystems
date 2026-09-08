import { Suspense } from 'react';
import { AppLayout } from '@/components/app-layout';
import { AIChatWithVideo } from '@/components/ai-chat-with-video';

export default function Page() {
  return <AppLayout><Suspense fallback={<div className="route-loading" aria-busy="true">Loading AI video search...</div>}><AIChatWithVideo /></Suspense></AppLayout>;
}
