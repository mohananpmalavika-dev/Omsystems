import { FeatureList } from "@/components/feature-status-badge";

export const metadata = {
  title: "My Features | KryptonVision",
  description: "View your enabled features and capabilities",
};

export default function MyFeaturesPage() {
  return (
    <div className="min-h-screen bg-slate-950 p-6">
      <div className="max-w-5xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-slate-100 mb-2">
            My Features
          </h1>
          <p className="text-slate-400">
            View all features enabled for your account. Contact support to enable additional features.
          </p>
        </div>

        <FeatureList />
      </div>
    </div>
  );
}
