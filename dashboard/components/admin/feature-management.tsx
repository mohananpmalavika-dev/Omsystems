"use client";

/**
 * Feature Management Dashboard
 * 
 * Admin interface for managing platform features at tenant and global level.
 * 
 * Features:
 * - View all features grouped by category
 * - Enable/disable features globally (admins & super admins)
 * - Enable/disable features per tenant (admins & super admins)
 * - Reset tenant overrides to global defaults
 * - Set usage limits and expiration dates
 * - View usage statistics and audit logs
 * - Search and filter features
 */

import { useState, useEffect, useCallback } from "react";
import {
  Settings,
  ToggleLeft,
  ToggleRight,
  Search,
  Users,
  TrendingUp,
  Calendar,
  AlertCircle,
  CheckCircle2,
  XCircle,
  Clock,
  Shield,
  Sparkles,
  Activity,
  Globe,
  Building2,
  BarChart3,
  RefreshCw,
  Lock,
} from "lucide-react";
import { getCurrentUser } from "@/lib/auth-manager";

interface Feature {
  featureKey: string;
  featureName: string;
  featureCategory: string;
  description: string;
  globalEnabled: boolean;
  tenantEnabled: boolean | null;
  effectiveEnabled: boolean;
  usageCount: number;
  usageLimit: number | null;
  expiresAt: string | null;
  isExpired: boolean;
  config: Record<string, any>;
}

interface FeatureStats {
  featureKey: string;
  totalUsage: number;
  uniqueTenants: number;
  uniqueUsers: number;
  firstUsed: string;
  lastUsed: string;
}

type ViewMode = "tenant" | "global" | "usage";
type CategoryFilter = "all" | string;

export function FeatureManagementDashboard() {
  const [viewMode, setViewMode] = useState<ViewMode>("tenant");
  const [features, setFeatures] = useState<Feature[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<CategoryFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [isAdmin, setIsAdmin] = useState(false);
  const [usageStats, setUsageStats] = useState<FeatureStats[]>([]);
  const [togglingKey, setTogglingKey] = useState<string | null>(null);
  const [actionMessage, setActionMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);

  // Check admin role from local state first, then confirm via backend API
  const checkAdminRole = useCallback(async () => {
    try {
      const user = getCurrentUser();
      const role = String(user?.role || "").toLowerCase();
      const isSuper = role === "super_admin" || role === "superadmin" || user?.isSuperAdmin === true;
      const isAdm =
        role === "admin" ||
        role === "company_admin" ||
        role === "hq_admin" ||
        role === "platform_admin" ||
        role === "global-admin" ||
        role === "global_admin" ||
        (Array.isArray(user?.roles) &&
          user.roles.some((r: string) =>
            ["super_admin", "superadmin", "admin", "company_admin", "hq_admin", "platform_admin"].includes(
              String(r).toLowerCase()
            )
          )) ||
        (Array.isArray(user?.permissions) &&
          (user.permissions.includes("features:manage") ||
            user.permissions.includes("admin") ||
            user.permissions.includes("*")));

      if (isSuper || isAdm) {
        setIsAdmin(true);
      }
    } catch {
      // ignore
    }

    try {
      const response = await fetch("/api/v1/admin/features/global", {
        credentials: "include",
      });
      if (response.ok) {
        setIsAdmin(true);
      }
    } catch {
      // ignore
    }
  }, []);

  const loadTenantFeatures = useCallback(async () => {
    const response = await fetch("/api/v1/features", {
      credentials: "include",
    });
    const data = await response.json();

    if (data.success) {
      setFeatures(data.features);
      const cats = Array.from(new Set(data.features.map((f: Feature) => f.featureCategory))) as string[];
      setCategories(cats);
    }
  }, []);

  const loadGlobalFeatures = useCallback(async () => {
    const response = await fetch("/api/v1/admin/features/global", {
      credentials: "include",
    });
    const data = await response.json();

    if (data.success) {
      const transformedFeatures: Feature[] = data.features.map((f: any) => ({
        featureKey: f.featureKey,
        featureName: f.featureName,
        featureCategory: f.featureCategory,
        description: f.description,
        globalEnabled: f.enabled,
        tenantEnabled: null,
        effectiveEnabled: f.enabled,
        usageCount: 0,
        usageLimit: null,
        expiresAt: null,
        isExpired: false,
        config: f.config,
      }));
      setFeatures(transformedFeatures);
      const cats = Array.from(new Set(transformedFeatures.map((f: Feature) => f.featureCategory))) as string[];
      setCategories(cats);
    }
  }, []);

  const loadUsageStats = useCallback(async () => {
    const response = await fetch("/api/v1/admin/features/usage", {
      credentials: "include",
    });
    const data = await response.json();

    if (data.success) {
      setUsageStats(data.stats);
    }
  }, []);

  const loadFeatures = useCallback(async () => {
    setLoading(true);
    try {
      if (viewMode === "global") {
        await loadGlobalFeatures();
      } else if (viewMode === "usage") {
        await loadUsageStats();
      } else {
        await loadTenantFeatures();
      }
    } catch (error) {
      console.error("Failed to load features:", error);
    } finally {
      setLoading(false);
    }
  }, [viewMode, loadGlobalFeatures, loadUsageStats, loadTenantFeatures]);

  useEffect(() => {
    checkAdminRole();
  }, [checkAdminRole]);

  useEffect(() => {
    loadFeatures();
  }, [loadFeatures]);

  const toggleGlobalFeature = async (featureKey: string, enabled: boolean) => {
    setTogglingKey(featureKey);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/v1/admin/features/global/${featureKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        setFeatures((prev) =>
          prev.map((f) =>
            f.featureKey === featureKey
              ? { ...f, globalEnabled: enabled, effectiveEnabled: enabled }
              : f
          )
        );
        setActionMessage({
          text: `Feature "${featureKey}" is now globally ${enabled ? "enabled" : "disabled"}.`,
          type: "success",
        });
      } else {
        const errData = await response.json().catch(() => ({}));
        setActionMessage({
          text: errData.message || `Failed to update global feature "${featureKey}".`,
          type: "error",
        });
      }
    } catch (error) {
      console.error("Failed to toggle global feature:", error);
      setActionMessage({
        text: `Error toggling global feature "${featureKey}".`,
        type: "error",
      });
    } finally {
      setTogglingKey(null);
    }
  };

  const toggleTenantFeature = async (featureKey: string, enabled: boolean) => {
    setTogglingKey(featureKey);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/v1/features/${featureKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        setFeatures((prev) =>
          prev.map((f) =>
            f.featureKey === featureKey
              ? { ...f, tenantEnabled: enabled, effectiveEnabled: enabled }
              : f
          )
        );
        setActionMessage({
          text: `Feature "${featureKey}" is now ${enabled ? "enabled" : "disabled"} for your organization.`,
          type: "success",
        });
      } else {
        const errData = await response.json().catch(() => ({}));
        setActionMessage({
          text: errData.message || `Failed to toggle feature "${featureKey}".`,
          type: "error",
        });
      }
    } catch (error) {
      console.error("Failed to toggle tenant feature:", error);
      setActionMessage({
        text: `Error toggling feature "${featureKey}".`,
        type: "error",
      });
    } finally {
      setTogglingKey(null);
    }
  };

  const resetTenantOverride = async (featureKey: string) => {
    setTogglingKey(featureKey);
    setActionMessage(null);
    try {
      const response = await fetch(`/api/v1/features/${featureKey}/override`, {
        method: "DELETE",
        credentials: "include",
      });

      if (response.ok) {
        setFeatures((prev) =>
          prev.map((f) =>
            f.featureKey === featureKey
              ? { ...f, tenantEnabled: null, effectiveEnabled: f.globalEnabled }
              : f
          )
        );
        setActionMessage({
          text: `Custom override for "${featureKey}" removed. Reverted to global default.`,
          type: "success",
        });
      } else {
        const errData = await response.json().catch(() => ({}));
        setActionMessage({
          text: errData.message || `Failed to reset override for "${featureKey}".`,
          type: "error",
        });
      }
    } catch (error) {
      console.error("Failed to reset override:", error);
      setActionMessage({
        text: `Error resetting override for "${featureKey}".`,
        type: "error",
      });
    } finally {
      setTogglingKey(null);
    }
  };

  const filteredFeatures = features.filter((feature) => {
    const matchesCategory =
      selectedCategory === "all" || feature.featureCategory === selectedCategory;
    const matchesSearch =
      searchQuery === "" ||
      feature.featureName.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feature.featureKey.toLowerCase().includes(searchQuery.toLowerCase()) ||
      feature.description?.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesCategory && matchesSearch;
  });

  const getCategoryIcon = (category: string) => {
    const icons: Record<string, any> = {
      ai: Sparkles,
      analytics: Activity,
      biometric: Shield,
      vehicle: Activity,
      safety: AlertCircle,
      security: Shield,
      banking: Building2,
      industrial: Activity,
      "smart-city": Globe,
      system: Settings,
      enterprise: Building2,
      edge: Globe,
      experimental: Sparkles,
    };
    return icons[category] || Settings;
  };

  const getCategoryColor = (category: string) => {
    const colors: Record<string, string> = {
      ai: "indigo",
      analytics: "blue",
      biometric: "purple",
      vehicle: "green",
      safety: "red",
      security: "orange",
      banking: "emerald",
      industrial: "yellow",
      "smart-city": "cyan",
      system: "slate",
      enterprise: "violet",
      edge: "teal",
      experimental: "pink",
    };
    return colors[category] || "gray";
  };

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <div className="border-b border-slate-800 bg-slate-900/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-7xl mx-auto px-6 py-4">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <Settings className="w-8 h-8 text-indigo-400" />
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-slate-100">Feature Management</h1>
                  {isAdmin && (
                    <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20">
                      <Shield className="w-3 h-3" />
                      Admin Control
                    </span>
                  )}
                </div>
                <p className="text-sm text-slate-400">
                  Enable, disable, and configure platform capabilities across the system
                </p>
              </div>
            </div>

            {isAdmin && (
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("tenant")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === "tenant"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="Manage features for your tenant organization"
                >
                  <Users className="w-4 h-4 inline mr-2" />
                  My Features
                </button>
                <button
                  onClick={() => setViewMode("global")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === "global"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="Manage platform-wide global feature settings"
                >
                  <Globe className="w-4 h-4 inline mr-2" />
                  Global
                </button>
                <button
                  onClick={() => setViewMode("usage")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === "usage"
                      ? "bg-indigo-600 text-white shadow-sm"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                  title="View platform feature usage statistics"
                >
                  <BarChart3 className="w-4 h-4 inline mr-2" />
                  Usage
                </button>
              </div>
            )}
          </div>

          {/* Alert / Notification Banner */}
          {actionMessage && (
            <div className="mb-4">
              <div
                className={`p-3 rounded-lg text-sm flex items-center justify-between border ${
                  actionMessage.type === "success"
                    ? "bg-emerald-950/70 border-emerald-700/60 text-emerald-200"
                    : "bg-red-950/70 border-red-700/60 text-red-200"
                }`}
              >
                <div className="flex items-center gap-2">
                  {actionMessage.type === "success" ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-red-400 shrink-0" />
                  )}
                  <span>{actionMessage.text}</span>
                </div>
                <button
                  onClick={() => setActionMessage(null)}
                  className="text-xs text-slate-400 hover:text-slate-200 font-bold ml-4"
                >
                  ✕
                </button>
              </div>
            </div>
          )}

          {/* Search and Filters */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search features by name, key, or description..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-10 pr-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>

            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="all">All Categories</option>
              {categories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat.charAt(0).toUpperCase() + cat.slice(1).replace("-", " ")}
                </option>
              ))}
            </select>

            <button
              onClick={loadFeatures}
              className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              title="Refresh features list"
            >
              <RefreshCw className={`w-5 h-5 ${loading ? "animate-spin text-indigo-400" : ""}`} />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading && features.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <span className="ml-3 text-slate-400">Loading features...</span>
          </div>
        ) : viewMode === "usage" ? (
          <UsageStatsView stats={usageStats} />
        ) : (
          <FeatureGrid
            features={filteredFeatures}
            viewMode={viewMode}
            isAdmin={isAdmin}
            togglingKey={togglingKey}
            onToggleGlobal={toggleGlobalFeature}
            onToggleTenant={toggleTenantFeature}
            onResetOverride={resetTenantOverride}
            getCategoryIcon={getCategoryIcon}
            getCategoryColor={getCategoryColor}
          />
        )}
      </div>
    </div>
  );
}

interface FeatureGridProps {
  features: Feature[];
  viewMode: ViewMode;
  isAdmin: boolean;
  togglingKey: string | null;
  onToggleGlobal: (key: string, enabled: boolean) => void;
  onToggleTenant: (key: string, enabled: boolean) => void;
  onResetOverride: (key: string) => void;
  getCategoryIcon: (cat: string) => any;
  getCategoryColor: (cat: string) => string;
}

function FeatureGrid({
  features,
  viewMode,
  isAdmin,
  togglingKey,
  onToggleGlobal,
  onToggleTenant,
  onResetOverride,
  getCategoryIcon,
  getCategoryColor,
}: FeatureGridProps) {
  if (features.length === 0) {
    return (
      <div className="bg-slate-900 border border-slate-800 rounded-xl p-12 text-center">
        <AlertCircle className="w-10 h-10 text-slate-500 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-slate-300">No features found</h3>
        <p className="text-sm text-slate-500 mt-1">
          Try clearing your search query or selecting a different category filter.
        </p>
      </div>
    );
  }

  // Group by category
  const byCategory: Record<string, Feature[]> = {};
  features.forEach((feature) => {
    if (!byCategory[feature.featureCategory]) {
      byCategory[feature.featureCategory] = [];
    }
    byCategory[feature.featureCategory].push(feature);
  });

  return (
    <div className="space-y-6">
      {Object.entries(byCategory).map(([category, categoryFeatures]) => {
        const Icon = getCategoryIcon(category);
        const color = getCategoryColor(category);

        return (
          <div key={category} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
            {/* Category Header */}
            <div className={`px-6 py-4 bg-slate-800/40 border-b border-slate-800 flex items-center justify-between`}>
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg bg-indigo-500/10 text-indigo-400`}>
                  <Icon className="w-5 h-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-slate-100 capitalize">
                    {category.replace("-", " ")}
                  </h2>
                  <p className="text-xs text-slate-400">
                    {categoryFeatures.length} feature{categoryFeatures.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>

              <span className="text-xs text-slate-400 font-mono">
                {viewMode === "global" ? "Platform defaults" : "Organization settings"}
              </span>
            </div>

            {/* Features List */}
            <div className="divide-y divide-slate-800/80">
              {categoryFeatures.map((feature) => (
                <FeatureCard
                  key={feature.featureKey}
                  feature={feature}
                  viewMode={viewMode}
                  isAdmin={isAdmin}
                  isToggling={togglingKey === feature.featureKey}
                  onToggleGlobal={onToggleGlobal}
                  onToggleTenant={onToggleTenant}
                  onResetOverride={onResetOverride}
                  color={color}
                />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

interface FeatureCardProps {
  feature: Feature;
  viewMode: ViewMode;
  isAdmin: boolean;
  isToggling: boolean;
  onToggleGlobal: (key: string, enabled: boolean) => void;
  onToggleTenant: (key: string, enabled: boolean) => void;
  onResetOverride: (key: string) => void;
  color: string;
}

function FeatureCard({
  feature,
  viewMode,
  isAdmin,
  isToggling,
  onToggleGlobal,
  onToggleTenant,
  onResetOverride,
}: FeatureCardProps) {
  const isEnabled = viewMode === "global" ? feature.globalEnabled : feature.effectiveEnabled;
  const hasOverride = feature.tenantEnabled !== null;

  return (
    <div className="px-6 py-4 hover:bg-slate-800/40 transition-colors">
      <div className="flex items-start justify-between gap-6">
        {/* Feature Information */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
            <h3 className="text-base font-semibold text-slate-100">{feature.featureName}</h3>
            
            {isEnabled ? (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-md text-xs font-medium">
                <CheckCircle2 className="w-3.5 h-3.5" />
                Enabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2.5 py-0.5 bg-slate-800 text-slate-400 border border-slate-700 rounded-md text-xs font-medium">
                <XCircle className="w-3.5 h-3.5" />
                Disabled
              </span>
            )}

            {viewMode === "tenant" && hasOverride && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 rounded-md text-xs font-medium" title="Tenant has a custom override applied">
                <Settings className="w-3 h-3" />
                Tenant Custom
              </span>
            )}

            {feature.isExpired && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-red-500/10 text-red-400 border border-red-500/20 rounded-md text-xs font-medium">
                <Clock className="w-3 h-3" />
                Expired
              </span>
            )}
          </div>

          <p className="text-sm text-slate-400 mb-3">{feature.description}</p>

          <div className="flex items-center gap-3 text-xs text-slate-500 flex-wrap">
            <code className="px-2 py-0.5 bg-slate-800/80 border border-slate-700/60 rounded text-slate-300 font-mono">
              {feature.featureKey}
            </code>

            {viewMode === "tenant" && (
              <span className="text-slate-400">
                Global Default:{" "}
                <span className={feature.globalEnabled ? "text-emerald-400 font-medium" : "text-slate-500 font-medium"}>
                  {feature.globalEnabled ? "Enabled" : "Disabled"}
                </span>
              </span>
            )}

            {feature.usageCount > 0 && (
              <span className="flex items-center gap-1 text-slate-400">
                <Activity className="w-3.5 h-3.5" />
                {feature.usageCount} uses
              </span>
            )}

            {feature.usageLimit && (
              <span className="flex items-center gap-1 text-slate-400">
                <TrendingUp className="w-3.5 h-3.5" />
                Limit: {feature.usageLimit}
              </span>
            )}

            {feature.expiresAt && !feature.isExpired && (
              <span className="flex items-center gap-1 text-slate-400">
                <Calendar className="w-3.5 h-3.5" />
                Expires: {new Date(feature.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Enable / Disable Toggle Controls */}
        <div className="flex flex-col items-end gap-2 flex-shrink-0">
          {isAdmin ? (
            <div className="flex items-center gap-3">
              <span
                className={`text-xs font-semibold uppercase tracking-wider ${
                  isEnabled ? "text-emerald-400" : "text-slate-500"
                }`}
              >
                {isEnabled ? "Enabled" : "Disabled"}
              </span>

              <button
                type="button"
                role="switch"
                aria-checked={isEnabled}
                disabled={isToggling}
                onClick={() => {
                  if (viewMode === "global") {
                    onToggleGlobal(feature.featureKey, !feature.globalEnabled);
                  } else {
                    onToggleTenant(feature.featureKey, !feature.effectiveEnabled);
                  }
                }}
                className="relative inline-flex items-center transition-transform hover:scale-105 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none rounded-full"
                title={
                  viewMode === "global"
                    ? `Click to ${feature.globalEnabled ? "disable" : "enable"} feature globally`
                    : `Click to ${feature.effectiveEnabled ? "disable" : "enable"} feature for this tenant`
                }
              >
                {isToggling ? (
                  <RefreshCw className="w-10 h-10 text-indigo-400 animate-spin p-2" />
                ) : isEnabled ? (
                  <ToggleRight className="w-12 h-12 text-emerald-400 hover:text-emerald-300 transition-colors cursor-pointer" />
                ) : (
                  <ToggleLeft className="w-12 h-12 text-slate-600 hover:text-slate-500 transition-colors cursor-pointer" />
                )}
              </button>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-3 py-1 bg-slate-800/80 border border-slate-700/60 rounded-lg text-xs text-slate-400">
              <Lock className="w-3.5 h-3.5 text-slate-500" />
              <span>Admin permission required</span>
            </div>
          )}

          {/* Reset override button if in tenant mode and override exists */}
          {viewMode === "tenant" && isAdmin && hasOverride && (
            <button
              type="button"
              disabled={isToggling}
              onClick={() => onResetOverride(feature.featureKey)}
              className="text-[11px] text-indigo-400 hover:text-indigo-300 underline underline-offset-2 transition-colors disabled:opacity-50"
              title="Remove tenant override and revert to global default"
            >
              Reset to global default
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

interface UsageStatsViewProps {
  stats: FeatureStats[];
}

function UsageStatsView({ stats }: UsageStatsViewProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden shadow-sm">
      <div className="px-6 py-4 border-b border-slate-800">
        <h2 className="text-lg font-semibold text-slate-100">Feature Usage Statistics</h2>
        <p className="text-sm text-slate-400">Platform-wide usage metrics across all features</p>
      </div>

      <div className="divide-y divide-slate-800/80">
        {stats.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            No usage data recorded yet
          </div>
        ) : (
          stats.map((stat) => (
            <div key={stat.featureKey} className="px-6 py-4 hover:bg-slate-800/40 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-100 mb-1">
                    {stat.featureKey}
                  </h3>
                  <div className="flex items-center gap-6 text-sm text-slate-400">
                    <span className="flex items-center gap-2">
                      <Activity className="w-4 h-4 text-indigo-400" />
                      {stat.totalUsage.toLocaleString()} total uses
                    </span>
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-emerald-400" />
                      {stat.uniqueTenants} tenants
                    </span>
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4 text-blue-400" />
                      {stat.uniqueUsers} users
                    </span>
                  </div>
                </div>

                <div className="text-right text-xs text-slate-500">
                  <div>First: {new Date(stat.firstUsed).toLocaleDateString()}</div>
                  <div>Last: {new Date(stat.lastUsed).toLocaleDateString()}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
