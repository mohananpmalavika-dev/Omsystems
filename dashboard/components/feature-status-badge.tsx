"use client";

/**
 * Feature Status Badge
 * 
 * Simple component to show feature availability status in the UI.
 * Use this to conditionally show/hide features based on tenant access.
 * 
 * Usage:
 * ```tsx
 * <FeatureStatusBadge featureKey="ai-video-search">
 *   <AIVideoSearchButton />
 * </FeatureStatusBadge>
 * ```
 */

import { useState, useEffect } from "react";
import { Lock, CheckCircle2, AlertCircle, Sparkles } from "lucide-react";

interface FeatureStatusBadgeProps {
  featureKey: string;
  children: React.ReactNode;
  fallback?: React.ReactNode;
  showBadge?: boolean;
}

export function FeatureStatusBadge({
  featureKey,
  children,
  fallback,
  showBadge = false,
}: FeatureStatusBadgeProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    checkFeature();
  }, [featureKey]);

  const checkFeature = async () => {
    try {
      const response = await fetch(`/api/v1/features/${featureKey}/check`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();
      setEnabled(data.enabled);
    } catch (error) {
      console.error("Failed to check feature:", error);
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return null; // or loading skeleton
  }

  if (!enabled) {
    return fallback ? <>{fallback}</> : null;
  }

  if (showBadge) {
    return (
      <div className="relative inline-block">
        {children}
        <span className="absolute -top-2 -right-2 inline-flex items-center justify-center w-5 h-5 bg-green-500 rounded-full">
          <CheckCircle2 className="w-3 h-3 text-white" />
        </span>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Feature Gate Component
 * 
 * Blocks content with a nice upgrade message if feature is not available
 */

interface FeatureGateProps {
  featureKey: string;
  featureName: string;
  children: React.ReactNode;
}

export function FeatureGate({ featureKey, featureName, children }: FeatureGateProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);
  const [reason, setReason] = useState<string | undefined>();

  useEffect(() => {
    checkFeature();
  }, [featureKey]);

  const checkFeature = async () => {
    try {
      const response = await fetch(`/api/v1/features/${featureKey}/check`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();
      setEnabled(data.enabled);
      setReason(data.reason);
    } catch (error) {
      console.error("Failed to check feature:", error);
      setEnabled(false);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  if (!enabled) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="max-w-md text-center">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-slate-800 rounded-full mb-4">
            <Lock className="w-8 h-8 text-slate-400" />
          </div>
          <h3 className="text-xl font-semibold text-slate-100 mb-2">
            {featureName} Not Available
          </h3>
          <p className="text-slate-400 mb-6">
            {reason || "This feature is not available for your account."}
          </p>
          <button
            onClick={() => window.location.href = "/dashboard/settings/features"}
            className="px-6 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors"
          >
            View Available Features
          </button>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

/**
 * Feature Indicator - Shows feature status in navigation/menus
 */

interface FeatureIndicatorProps {
  featureKey: string;
  label: string;
  icon?: React.ReactNode;
  href?: string;
}

export function FeatureIndicator({ featureKey, label, icon, href }: FeatureIndicatorProps) {
  const [enabled, setEnabled] = useState<boolean | null>(null);

  useEffect(() => {
    checkFeature();
  }, [featureKey]);

  const checkFeature = async () => {
    try {
      const response = await fetch(`/api/v1/features/${featureKey}/check`, {
        method: "POST",
        credentials: "include",
      });

      const data = await response.json();
      setEnabled(data.enabled);
    } catch (error) {
      setEnabled(false);
    }
  };

  if (enabled === null) {
    return null;
  }

  if (!enabled) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 text-slate-500 cursor-not-allowed">
        {icon}
        <span className="text-sm">{label}</span>
        <Lock className="w-4 h-4 ml-auto" />
      </div>
    );
  }

  const content = (
    <>
      {icon}
      <span className="text-sm">{label}</span>
      <Sparkles className="w-4 h-4 ml-auto text-indigo-400" />
    </>
  );

  if (href) {
    return (
      <a
        href={href}
        className="flex items-center gap-2 px-3 py-2 text-slate-300 hover:text-slate-100 hover:bg-slate-800 rounded-lg transition-colors"
      >
        {content}
      </a>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-2 text-slate-300">
      {content}
    </div>
  );
}

/**
 * Feature List - Shows all available features for tenant
 */

interface Feature {
  featureKey: string;
  featureName: string;
  featureCategory: string;
  effectiveEnabled: boolean;
  usageCount: number;
  usageLimit: number | null;
  expiresAt: string | null;
}

export function FeatureList() {
  const [features, setFeatures] = useState<Feature[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadFeatures();
  }, []);

  const loadFeatures = async () => {
    try {
      const response = await fetch("/api/v1/features", {
        credentials: "include",
      });
      const data = await response.json();

      if (data.success) {
        setFeatures(data.features);
      }
    } catch (error) {
      console.error("Failed to load features:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500"></div>
      </div>
    );
  }

  const enabledFeatures = features.filter((f) => f.effectiveEnabled);
  const disabledFeatures = features.filter((f) => !f.effectiveEnabled);

  return (
    <div className="space-y-6">
      {/* Enabled Features */}
      <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-800 bg-green-500/10">
          <h3 className="text-lg font-semibold text-slate-100">
            Enabled Features ({enabledFeatures.length})
          </h3>
        </div>
        <div className="divide-y divide-slate-800">
          {enabledFeatures.map((feature) => (
            <div key={feature.featureKey} className="px-6 py-4 hover:bg-slate-800/50 transition-colors">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <CheckCircle2 className="w-5 h-5 text-green-400" />
                    <h4 className="text-base font-semibold text-slate-100">
                      {feature.featureName}
                    </h4>
                  </div>
                  <p className="text-sm text-slate-400 ml-7">
                    <code className="px-2 py-1 bg-slate-800 rounded text-xs">
                      {feature.featureKey}
                    </code>
                  </p>
                  {feature.usageLimit && (
                    <div className="ml-7 mt-2 text-sm text-slate-500">
                      Usage: {feature.usageCount} / {feature.usageLimit}
                    </div>
                  )}
                  {feature.expiresAt && (
                    <div className="ml-7 mt-1 text-sm text-slate-500">
                      Expires: {new Date(feature.expiresAt).toLocaleDateString()}
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Disabled Features */}
      {disabledFeatures.length > 0 && (
        <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
          <div className="px-6 py-4 border-b border-slate-800">
            <h3 className="text-lg font-semibold text-slate-100">
              Available for Upgrade ({disabledFeatures.length})
            </h3>
          </div>
          <div className="divide-y divide-slate-800">
            {disabledFeatures.slice(0, 5).map((feature) => (
              <div key={feature.featureKey} className="px-6 py-4 hover:bg-slate-800/50 transition-colors">
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <Lock className="w-5 h-5 text-slate-500" />
                      <h4 className="text-base font-semibold text-slate-300">
                        {feature.featureName}
                      </h4>
                    </div>
                  </div>
                  <button
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm rounded-lg transition-colors"
                    onClick={() => alert("Contact sales to enable this feature")}
                  >
                    Request Access
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
