"use client";

/**
 * Feature Management Dashboard
 * 
 * Admin interface for managing platform features at tenant and global level.
 * 
 * Features:
 * - View all features grouped by category
 * - Enable/disable features globally (platform admin)
 * - Enable/disable features per tenant (platform admin)
 * - Set usage limits and expiration dates
 * - View usage statistics and audit logs
 * - Search and filter features
 */

import { useState, useEffect } from "react";
import {
  Settings,
  ToggleLeft,
  ToggleRight,
  Search,
  Filter,
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
  Eye,
  EyeOff,
  BarChart3,
  History,
  Plus,
  Edit,
  Trash2,
  Download,
  RefreshCw,
} from "lucide-react";

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
  const [isPlatformAdmin, setIsPlatformAdmin] = useState(false);
  const [selectedFeature, setSelectedFeature] = useState<Feature | null>(null);
  const [showEditModal, setShowEditModal] = useState(false);
  const [usageStats, setUsageStats] = useState<FeatureStats[]>([]);

  useEffect(() => {
    loadFeatures();
    checkAdminRole();
  }, [viewMode]);

  const checkAdminRole = async () => {
    // Check if user is platform admin
    try {
      const response = await fetch("/api/v1/admin/features/global", {
        credentials: "include",
      });
      setIsPlatformAdmin(response.ok);
    } catch {
      setIsPlatformAdmin(false);
    }
  };

  const loadFeatures = async () => {
    setLoading(true);
    try {
      if (viewMode === "global" && isPlatformAdmin) {
        await loadGlobalFeatures();
      } else if (viewMode === "usage" && isPlatformAdmin) {
        await loadUsageStats();
      } else {
        await loadTenantFeatures();
      }
    } catch (error) {
      console.error("Failed to load features:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadTenantFeatures = async () => {
    const response = await fetch("/api/v1/features", {
      credentials: "include",
    });
    const data = await response.json();

    if (data.success) {
      setFeatures(data.features);
      const cats = Array.from(new Set(data.features.map((f: Feature) => f.featureCategory))) as string[];
      setCategories(cats);
    }
  };

  const loadGlobalFeatures = async () => {
    const response = await fetch("/api/v1/admin/features/global", {
      credentials: "include",
    });
    const data = await response.json();

    if (data.success) {
      // Transform global features to match interface
      const transformedFeatures = data.features.map((f: any) => ({
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
  };

  const loadUsageStats = async () => {
    const response = await fetch("/api/v1/admin/features/usage", {
      credentials: "include",
    });
    const data = await response.json();

    if (data.success) {
      setUsageStats(data.stats);
    }
  };

  const toggleGlobalFeature = async (featureKey: string, enabled: boolean) => {
    try {
      const response = await fetch(`/api/v1/admin/features/global/${featureKey}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ enabled }),
      });

      if (response.ok) {
        await loadFeatures();
      }
    } catch (error) {
      console.error("Failed to toggle feature:", error);
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
                <h1 className="text-2xl font-bold text-slate-100">Feature Management</h1>
                <p className="text-sm text-slate-400">
                  Enable and configure platform features
                </p>
              </div>
            </div>

            {isPlatformAdmin && (
              <div className="flex items-center gap-2 bg-slate-800 rounded-lg p-1">
                <button
                  onClick={() => setViewMode("tenant")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === "tenant"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Users className="w-4 h-4 inline mr-2" />
                  My Features
                </button>
                <button
                  onClick={() => setViewMode("global")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === "global"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <Globe className="w-4 h-4 inline mr-2" />
                  Global
                </button>
                <button
                  onClick={() => setViewMode("usage")}
                  className={`px-4 py-2 rounded-md text-sm font-medium transition-all ${
                    viewMode === "usage"
                      ? "bg-indigo-600 text-white"
                      : "text-slate-400 hover:text-slate-200"
                  }`}
                >
                  <BarChart3 className="w-4 h-4 inline mr-2" />
                  Usage
                </button>
              </div>
            )}
          </div>

          {/* Search and Filters */}
          <div className="flex items-center gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-slate-400" />
              <input
                type="text"
                placeholder="Search features..."
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
                  {cat.charAt(0).toUpperCase() + cat.slice(1)}
                </option>
              ))}
            </select>

            <button
              onClick={loadFeatures}
              className="p-2 bg-slate-800 border border-slate-700 rounded-lg text-slate-300 hover:text-slate-100 hover:bg-slate-700 transition-colors"
              title="Refresh"
            >
              <RefreshCw className="w-5 h-5" />
            </button>
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-7xl mx-auto px-6 py-6">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <RefreshCw className="w-8 h-8 text-indigo-400 animate-spin" />
            <span className="ml-3 text-slate-400">Loading features...</span>
          </div>
        ) : viewMode === "usage" ? (
          <UsageStatsView stats={usageStats} />
        ) : (
          <FeatureGrid
            features={filteredFeatures}
            viewMode={viewMode}
            isPlatformAdmin={isPlatformAdmin}
            onToggleGlobal={toggleGlobalFeature}
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
  isPlatformAdmin: boolean;
  onToggleGlobal: (key: string, enabled: boolean) => void;
  getCategoryIcon: (cat: string) => any;
  getCategoryColor: (cat: string) => string;
}

function FeatureGrid({
  features,
  viewMode,
  isPlatformAdmin,
  onToggleGlobal,
  getCategoryIcon,
  getCategoryColor,
}: FeatureGridProps) {
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
          <div key={category} className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
            {/* Category Header */}
            <div className={`px-6 py-4 bg-${color}-500/10 border-b border-slate-800`}>
              <div className="flex items-center gap-3">
                <Icon className={`w-6 h-6 text-${color}-400`} />
                <div>
                  <h2 className="text-lg font-semibold text-slate-100 capitalize">
                    {category.replace("-", " ")}
                  </h2>
                  <p className="text-sm text-slate-400">
                    {categoryFeatures.length} feature{categoryFeatures.length !== 1 ? "s" : ""}
                  </p>
                </div>
              </div>
            </div>

            {/* Features List */}
            <div className="divide-y divide-slate-800">
              {categoryFeatures.map((feature) => (
                <FeatureCard
                  key={feature.featureKey}
                  feature={feature}
                  viewMode={viewMode}
                  isPlatformAdmin={isPlatformAdmin}
                  onToggleGlobal={onToggleGlobal}
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
  isPlatformAdmin: boolean;
  onToggleGlobal: (key: string, enabled: boolean) => void;
  color: string;
}

function FeatureCard({ feature, viewMode, isPlatformAdmin, onToggleGlobal, color }: FeatureCardProps) {
  const isEnabled = feature.effectiveEnabled;
  const hasOverride = feature.tenantEnabled !== null;

  return (
    <div className="px-6 py-4 hover:bg-slate-800/50 transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-3 mb-2">
            <h3 className="text-base font-semibold text-slate-100">{feature.featureName}</h3>
            
            {isEnabled ? (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-green-500/10 text-green-400 rounded-md text-xs font-medium">
                <CheckCircle2 className="w-3 h-3" />
                Enabled
              </span>
            ) : (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-slate-700 text-slate-400 rounded-md text-xs font-medium">
                <XCircle className="w-3 h-3" />
                Disabled
              </span>
            )}

            {hasOverride && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-indigo-500/10 text-indigo-400 rounded-md text-xs font-medium">
                <Settings className="w-3 h-3" />
                Custom
              </span>
            )}

            {feature.isExpired && (
              <span className="inline-flex items-center gap-1 px-2 py-1 bg-red-500/10 text-red-400 rounded-md text-xs font-medium">
                <Clock className="w-3 h-3" />
                Expired
              </span>
            )}
          </div>

          <p className="text-sm text-slate-400 mb-3">{feature.description}</p>

          <div className="flex items-center gap-4 text-xs text-slate-500">
            <code className="px-2 py-1 bg-slate-800 rounded text-slate-400">
              {feature.featureKey}
            </code>

            {feature.usageCount > 0 && (
              <span className="flex items-center gap-1">
                <Activity className="w-3 h-3" />
                {feature.usageCount} uses
              </span>
            )}

            {feature.usageLimit && (
              <span className="flex items-center gap-1">
                <TrendingUp className="w-3 h-3" />
                Limit: {feature.usageLimit}
              </span>
            )}

            {feature.expiresAt && !feature.isExpired && (
              <span className="flex items-center gap-1">
                <Calendar className="w-3 h-3" />
                Expires: {new Date(feature.expiresAt).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {/* Toggle Switch */}
        {viewMode === "global" && isPlatformAdmin && (
          <button
            onClick={() => onToggleGlobal(feature.featureKey, !feature.globalEnabled)}
            className="flex-shrink-0"
          >
            {feature.globalEnabled ? (
              <ToggleRight className="w-12 h-12 text-green-500 hover:text-green-400 transition-colors" />
            ) : (
              <ToggleLeft className="w-12 h-12 text-slate-600 hover:text-slate-500 transition-colors" />
            )}
          </button>
        )}
      </div>
    </div>
  );
}

interface UsageStatsViewProps {
  stats: FeatureStats[];
}

function UsageStatsView({ stats }: UsageStatsViewProps) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-800">
        <h2 className="text-lg font-semibold text-slate-100">Feature Usage Statistics</h2>
        <p className="text-sm text-slate-400">Platform-wide usage metrics</p>
      </div>

      <div className="divide-y divide-slate-800">
        {stats.length === 0 ? (
          <div className="px-6 py-12 text-center text-slate-500">
            No usage data available yet
          </div>
        ) : (
          stats.map((stat) => (
            <div key={stat.featureKey} className="px-6 py-4 hover:bg-slate-800/50 transition-colors">
              <div className="flex items-center justify-between">
                <div className="flex-1">
                  <h3 className="text-base font-semibold text-slate-100 mb-1">
                    {stat.featureKey}
                  </h3>
                  <div className="flex items-center gap-6 text-sm text-slate-400">
                    <span className="flex items-center gap-2">
                      <Activity className="w-4 h-4" />
                      {stat.totalUsage.toLocaleString()} total uses
                    </span>
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
                      {stat.uniqueTenants} tenants
                    </span>
                    <span className="flex items-center gap-2">
                      <Users className="w-4 h-4" />
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
