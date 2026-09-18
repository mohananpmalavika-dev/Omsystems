'use client';

import { useEffect, useState } from 'react';
import { CameraMapView, BranchClusterMap } from '@/components/maintenance/map-view';

interface CameraLocation {
  id: string;
  name: string;
  branchName: string;
  latitude: number;
  longitude: number;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  lastSeen?: string;
  uptime?: number;
  locationType?: string;
  physicalType?: string;
  vendor?: string;
  model?: string;
}

interface BranchLocation {
  id: string;
  name: string;
  latitude: number;
  longitude: number;
  totalCameras: number;
  healthyCameras: number;
  warningCameras: number;
  criticalCameras: number;
  offlineCameras: number;
}

type ViewMode = 'cameras' | 'branches';

export default function CameraMapPage() {
  const [cameras, setCameras] = useState<CameraLocation[]>([]);
  const [branches, setBranches] = useState<BranchLocation[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('cameras');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [includeOffline, setIncludeOffline] = useState(true);
  const [useIpGeolocation, setUseIpGeolocation] = useState(true);

  // Calculate map center from data
  const getMapCenter = (): [number, number] => {
    const locations = viewMode === 'cameras' ? cameras : branches;
    if (locations.length === 0) {
      return [20.5937, 78.9629]; // Default: India center
    }

    const avgLat = locations.reduce((sum, loc) => sum + loc.latitude, 0) / locations.length;
    const avgLng = locations.reduce((sum, loc) => sum + loc.longitude, 0) / locations.length;
    
    return [avgLat, avgLng];
  };

  const fetchCameraLocations = async () => {
    try {
      setLoading(true);
      setError(null);

      const params = new URLSearchParams();
      if (!includeOffline) {
        params.append('includeOffline', 'false');
      }
      if (useIpGeolocation) {
        params.append('useIpGeolocation', 'true');
      }

      const response = await fetch(`/api/control/v1/camera-locations?${params}`, {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch camera locations: ${response.statusText}`);
      }

      const result = await response.json();
      
      // Map statuses to match component expectations
      const mappedCameras: CameraLocation[] = result.data.map((cam: any) => ({
        ...cam,
        status: cam.status === 'online' ? 'healthy' :
                cam.status === 'degraded' ? 'warning' :
                cam.status === 'offline' ? 'offline' : 'warning',
      }));

      setCameras(mappedCameras);
    } catch (err: any) {
      console.error('Error fetching camera locations:', err);
      setError(err.message || 'Failed to load camera locations');
    } finally {
      setLoading(false);
    }
  };

  const fetchBranchClusters = async () => {
    try {
      setLoading(true);
      setError(null);

      const response = await fetch('/api/control/v1/camera-locations/branches', {
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch branch clusters: ${response.statusText}`);
      }

      const result = await response.json();
      setBranches(result.data);
    } catch (err: any) {
      console.error('Error fetching branch clusters:', err);
      setError(err.message || 'Failed to load branch data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (viewMode === 'cameras') {
      fetchCameraLocations();
    } else {
      fetchBranchClusters();
    }
  }, [viewMode, includeOffline, useIpGeolocation]);

  if (loading) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-white rounded-lg shadow p-8">
          <div className="flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
            <span className="ml-4 text-gray-600">Loading camera locations...</span>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-800 mb-2">Error Loading Map</h3>
          <p className="text-red-600">{error}</p>
          <button
            onClick={() => viewMode === 'cameras' ? fetchCameraLocations() : fetchBranchClusters()}
            className="mt-4 px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Camera Location Map</h1>
            <p className="text-sm text-gray-600 mt-1">
              Real-time GPS-based camera monitoring and visualization
            </p>
          </div>

          <div className="flex gap-4 items-center">
            {/* View Mode Toggle */}
            <div className="flex bg-gray-100 rounded-lg p-1">
              <button
                onClick={() => setViewMode('cameras')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'cameras'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                📹 Individual Cameras
              </button>
              <button
                onClick={() => setViewMode('branches')}
                className={`px-4 py-2 rounded-md text-sm font-medium transition-colors ${
                  viewMode === 'branches'
                    ? 'bg-white text-blue-600 shadow-sm'
                    : 'text-gray-600 hover:text-gray-900'
                }`}
              >
                🏢 Branch Clusters
              </button>
            </div>

            {/* Offline Filter (only for camera view) */}
            {viewMode === 'cameras' && (
              <>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={includeOffline}
                    onChange={(e) => setIncludeOffline(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Show Offline</span>
                </label>
                
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={useIpGeolocation}
                    onChange={(e) => setUseIpGeolocation(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700">Use IP Location</span>
                </label>
              </>
            )}

            {/* Refresh Button */}
            <button
              onClick={() => viewMode === 'cameras' ? fetchCameraLocations() : fetchBranchClusters()}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors text-sm font-medium"
            >
              🔄 Refresh
            </button>
          </div>
        </div>

        {/* Statistics */}
        <div className="grid grid-cols-4 gap-4 mt-6">
          {viewMode === 'cameras' ? (
            <>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-700">
                  {cameras.filter(c => c.status === 'healthy').length}
                </div>
                <div className="text-sm text-green-600 mt-1">Healthy Cameras</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-700">
                  {cameras.filter(c => c.status === 'warning').length}
                </div>
                <div className="text-sm text-yellow-600 mt-1">Warning</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-700">
                  {cameras.filter(c => c.status === 'critical').length}
                </div>
                <div className="text-sm text-red-600 mt-1">Critical</div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-gray-700">
                  {cameras.filter(c => c.status === 'offline').length}
                </div>
                <div className="text-sm text-gray-600 mt-1">Offline</div>
              </div>
            </>
          ) : (
            <>
              <div className="bg-blue-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-blue-700">
                  {branches.length}
                </div>
                <div className="text-sm text-blue-600 mt-1">Total Branches</div>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-green-700">
                  {branches.reduce((sum, b) => sum + b.totalCameras, 0)}
                </div>
                <div className="text-sm text-green-600 mt-1">Total Cameras</div>
              </div>
              <div className="bg-yellow-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-yellow-700">
                  {branches.reduce((sum, b) => sum + b.healthyCameras, 0)}
                </div>
                <div className="text-sm text-yellow-600 mt-1">Online Cameras</div>
              </div>
              <div className="bg-red-50 rounded-lg p-4">
                <div className="text-2xl font-bold text-red-700">
                  {branches.reduce((sum, b) => sum + b.offlineCameras, 0)}
                </div>
                <div className="text-sm text-red-600 mt-1">Offline Cameras</div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Map Display */}
      {viewMode === 'cameras' ? (
        cameras.length > 0 ? (
          <CameraMapView
            cameras={cameras}
            center={getMapCenter()}
            zoom={12}
            height="700px"
          />
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
            <p className="text-yellow-800 text-lg font-medium">No cameras with GPS locations found</p>
            <p className="text-yellow-600 mt-2">
              Please configure GPS coordinates for branches to see cameras on the map
            </p>
          </div>
        )
      ) : (
        branches.length > 0 ? (
          <BranchClusterMap
            branches={branches}
            center={getMapCenter()}
            zoom={10}
            height="700px"
          />
        ) : (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-8 text-center">
            <p className="text-yellow-800 text-lg font-medium">No branches with GPS locations found</p>
            <p className="text-yellow-600 mt-2">
              Please configure GPS coordinates for branches to see them on the map
            </p>
          </div>
        )
      )}

      {/* Help Section */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-blue-900 mb-3">📍 Location Detection Methods</h3>
        <div className="space-y-4 text-sm text-blue-800">
          <div>
            <p className="font-semibold mb-2">Three ways cameras get GPS coordinates:</p>
            <ol className="list-decimal list-inside space-y-2 ml-4">
              <li>
                <strong>Camera Metadata</strong> (Highest Priority) - GPS set directly on camera
                <code className="bg-blue-100 px-2 py-1 rounded ml-2 text-xs">camera.metadata.location</code>
              </li>
              <li>
                <strong>IP Geolocation</strong> (Automatic) - Detect location from camera's public IP address
                <span className="text-xs ml-2">(Enable "Use IP Location" checkbox)</span>
              </li>
              <li>
                <strong>Branch Location</strong> (Fallback) - All cameras at branch share same GPS
                <code className="bg-blue-100 px-2 py-1 rounded ml-2 text-xs">branch.metadata.location</code>
              </li>
            </ol>
          </div>

          <div className="border-t border-blue-300 pt-3">
            <p className="font-semibold mb-2">🌐 IP Geolocation Features:</p>
            <ul className="list-disc list-inside space-y-1 ml-4">
              <li>Automatically detects camera location from its IP address</li>
              <li>Works for cameras with public IPs (not 192.168.x.x or 10.x.x.x)</li>
              <li>Shows actual city/country where camera is located</li>
              <li>No configuration needed - just enable the checkbox!</li>
              <li>Useful when cameras are spread across different locations</li>
            </ul>
          </div>

          <div className="border-t border-blue-300 pt-3">
            <p className="font-semibold mb-2">⚙️ Manual Configuration (Branch Location):</p>
            <ol className="list-decimal list-inside space-y-1 ml-4">
              <li>Go to Organization Management → Branches</li>
              <li>Edit a branch and add metadata: <code className="bg-blue-100 px-2 py-1 rounded">location</code></li>
              <li>Set coordinates: <code className="bg-blue-100 px-2 py-1 rounded">{`{"latitude": 12.9716, "longitude": 77.5946}`}</code></li>
              <li>Save and refresh this page</li>
            </ol>
          </div>
        </div>
      </div>
    </div>
  );
}
