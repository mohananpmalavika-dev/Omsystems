import { AppLayout } from "@/components/app-layout";
import { NaturalLanguageSearch } from "@/components/ai-video-search/natural-language-search";

export const dynamic = "force-dynamic";

export default function AIVideoSearchPage() {
  return (
    <AppLayout>
      <div className="ai-video-search-page max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <NaturalLanguageSearch />
      </div>
    </AppLayout>
  );
}
