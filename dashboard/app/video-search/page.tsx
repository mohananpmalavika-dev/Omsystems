import { Suspense } from 'react';
import { AppLayout } from '@/components/app-layout';
import { VideoSearch } from '@/components/video-search';

export default function Page() {
  return <AppLayout><Suspense fallback={<div className="route-loading" aria-busy="true">Loading video search...</div>}><VideoSearch /></Suspense></AppLayout>;
}
