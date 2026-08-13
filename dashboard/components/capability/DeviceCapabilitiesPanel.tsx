/**
 * Device Capabilities Panel Component
 * 
 * Displays all capabilities for a device with their current states.
 */

import React, { useEffect, useState } from "react";
import { CapabilityBadge } from "./CapabilityBadge";
import type { CapabilityState } from "../../types/capabilities";

interface DeviceCapability {
  path: string;
  label: string;
  state: CapabilityState;
  available: boolean;
  confidence: number;
  verificationLevel: "DECLARED" | "DISCOVERED" | "VERIFIED";
  limitations?: string[];
  discoveredAt?: string;
  verifiedAt?: string;
}

interface CapabilityCategory {
  name: string;
  capabilities: DeviceCapability[];
}

export interface DeviceCapabilitiesPanelProps {
  deviceId: string;
  tenantId: string;
  showVerification?: boolean;
  showConfidence?: boolean;
  onRefresh?: () => void;
}

export function DeviceCapabilitiesPanel({
  deviceId,
  tenantId,
  showVerification = true,
  showConfidence = false,
  onRefresh,
}: DeviceCapabilitiesPanelProps) {
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [categories, setCategories] = useState<CapabilityCategory[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    fetchCapabilities();
  }, [deviceId, tenantId]);

  async function fetchCapabilities() {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch(
        `/api/v1/devices/${deviceId}/capabilities?tenantId=${tenantId}`
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch capabilities: ${response.statusText}`);
      }

      const data = await response.json();
      const categorized = categorizeCapabilities(data);
      setCategories(categorized);
      setLastUpdated(new Date(data.lastUpdatedAt));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  async function handleRefresh() {
    try {
      setRefreshing(true);
      setError(null);

      const response = await fetch(
        `/api/v1/devices/${deviceId}/capabilities/refresh?tenantId=${tenantId}`,
        { method: "POST" }
      );

      if (!response.ok) {
        throw new Error(`Failed to refresh capabilities: ${response.statusText}`);
      }

      const data = await response.json();
      const categorized = categorizeCapabilities(data);
      setCategories(categorized);
      setLastUpdated(new Date(data.lastUpdatedAt));
      onRefresh?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRefreshing(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin text-2xl">⟳</div>
        <span className="ml-2 text-gray-600">Loading capabilities...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4">
        <h3 className="text-red-800 font-medium mb-2">Failed to load capabilities</h3>
        <p className="text-red-600 text-sm">{error}</p>
        <button
          onClick={fetchCapabilities}
          className="mt-3 text-sm text-red-700 underline hover:no-underline"
        >
          Try again
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Device Capabilities</h2>
          {lastUpdated && (
            <p className="text-sm text-gray-500">
              Last updated: {lastUpdated.toLocaleString()}
            </p>
          )}
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed flex items-center gap-2"
        >
          <span className={refreshing ? "animate-spin" : ""}>⟳</span>
          {refreshing ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* Capability Categories */}
      <div className="space-y-4">
        {categories.map((category) => (
          <div
            key={category.name}
            className="bg-white border border-gray-200 rounded-lg p-4"
          >
            <h3 className="font-medium text-gray-900 mb-3">{category.name}</h3>
            <div className="space-y-2">
              {category.capabilities.map((cap) => (
                <div
                  key={cap.path}
                  className="flex items-center justify-between py-2 border-b border-gray-100 last:border-0"
                >
                  <div className="flex-1">
                    <CapabilityBadge
                      state={cap.state}
                      available={cap.available}
                      label={cap.label}
                      verificationLevel={cap.verificationLevel}
                      confidence={cap.confidence}
                      showVerification={showVerification}
                      showConfidence={showConfidence}
                      size="md"
                    />
                  </div>
                  {cap.limitations && cap.limitations.length > 0 && (
                    <div className="ml-4 text-sm text-gray-500">
                      {cap.limitations[0]}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* Summary */}
      <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
        <h3 className="font-medium text-gray-900 mb-2">Summary</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
          <div>
            <div className="text-gray-600">Supported</div>
            <div className="text-2xl font-bold text-green-600">
              {countByState(categories, "SUPPORTED")}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Unavailable</div>
            <div className="text-2xl font-bold text-yellow-600">
              {countByState(categories, "UNAVAILABLE")}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Unsupported</div>
            <div className="text-2xl font-bold text-gray-500">
              {countByState(categories, "UNSUPPORTED")}
            </div>
          </div>
          <div>
            <div className="text-gray-600">Unknown</div>
            <div className="text-2xl font-bold text-gray-400">
              {countByState(categories, "UNKNOWN")}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/**
 * Categorize flat capability list into logical groups.
 */
function categorizeCapabilities(data: any): CapabilityCategory[] {
  const categories: CapabilityCategory[] = [];

  // Video
  if (data.video) {
    categories.push({
      name: "Video",
      capabilities: extractCapabilities("video", data.video),
    });
  }

  // Recording
  if (data.recording) {
    categories.push({
      name: "Recording",
      capabilities: extractCapabilities("recording", data.recording),
    });
  }

  // PTZ
  if (data.ptz) {
    categories.push({
      name: "PTZ Controls",
      capabilities: extractCapabilities("ptz", data.ptz),
    });
  }

  // Audio
  if (data.audio) {
    categories.push({
      name: "Audio",
      capabilities: extractCapabilities("audio", data.audio),
    });
  }

  // Events & Analytics
  if (data.events || data.analytics) {
    const eventCaps = data.events ? extractCapabilities("events", data.events) : [];
    const analyticsCaps = data.analytics ? extractCapabilities("analytics", data.analytics) : [];
    categories.push({
      name: "Events & Analytics",
      capabilities: [...eventCaps, ...analyticsCaps],
    });
  }

  // Storage
  if (data.storage) {
    categories.push({
      name: "Storage",
      capabilities: extractCapabilities("storage", data.storage),
    });
  }

  // Network
  if (data.network) {
    categories.push({
      name: "Network",
      capabilities: extractCapabilities("network", data.network),
    });
  }

  // Security
  if (data.security) {
    categories.push({
      name: "Security",
      capabilities: extractCapabilities("security", data.security),
    });
  }

  // Management
  if (data.management) {
    categories.push({
      name: "Management",
      capabilities: extractCapabilities("management", data.management),
    });
  }

  return categories;
}

/**
 * Extract capabilities from nested object.
 */
function extractCapabilities(prefix: string, obj: any, path: string[] = []): DeviceCapability[] {
  const capabilities: DeviceCapability[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (value && typeof value === "object") {
      if ("state" in value && "available" in value) {
        // This is a capability
        const fullPath = [...path, key].join(".");
        capabilities.push({
          path: `${prefix}.${fullPath}`,
          label: formatLabel(key),
          state: value.state as CapabilityState,
          available: value.available as boolean,
          confidence: (value.confidence ?? 0) as number,
          verificationLevel: (value.verificationLevel ?? "DECLARED") as "DECLARED" | "DISCOVERED" | "VERIFIED",
          limitations: value.limitations as string[] | undefined,
          discoveredAt: value.discoveredAt as string | undefined,
          verifiedAt: value.verifiedAt as string | undefined,
        });
      } else {
        // Recurse into nested object
        capabilities.push(...extractCapabilities(prefix, value, [...path, key]));
      }
    }
  }

  return capabilities;
}

/**
 * Format capability key as human-readable label.
 */
function formatLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/^./, (str) => str.toUpperCase())
    .trim();
}

/**
 * Count capabilities by state across all categories.
 */
function countByState(categories: CapabilityCategory[], state: CapabilityState): number {
  return categories.reduce(
    (total, category) =>
      total + category.capabilities.filter((cap) => cap.state === state).length,
    0
  );
}
