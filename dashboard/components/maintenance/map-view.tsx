'use client';

import { useEffect, useState } from 'react';
import { MapContainer, TileLayer, Marker, Popup, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Fix for default marker icons in React-Leaflet
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.7.1/images/marker-shadow.png',
});

// ============================================================================
// Camera Location Interface
// ============================================================================

interface CameraLocation {
  id: string;
  name: string;
  branchName: string;
  latitude: number;
  longitude: number;
  status: 'healthy' | 'warning' | 'critical' | 'offline';
  lastSeen?: string;
  uptime?: number;
}

// ============================================================================
// Custom Marker Icons by Status
// ============================================================================

const createCustomIcon = (status: string) => {
  const colors: Record<string, string> = {
    healthy: '#10b981',
    warning: '#f59e0b',
    critical: '#ef4444',
    offline: '#6b7280',
  };

  return L.divIcon({
    className: 'custom-marker',
    html: `
      <div style="
        background-color: ${colors[status] || colors.offline};
        width: 24px;
        height: 24px;
        border-radius: 50%;
        border: 3px solid white;
        box-shadow: 0 2px 4px rgba(0,0,0,0.3);
      "></div>
    `,
    iconSize: [24, 24],
    iconAnchor: [12, 12],
    popupAnchor: [0, -12],
  });
};

// ============================================================================
// Map Controls Component
// ============================================================================

interface MapControlsProps {
  cameras: CameraLocation[];
  selectedStatus: string | null;
  onStatusFilter: (status: string | null) => void;
}

function MapControls({ cameras, selectedStatus, onStatusFilter }: MapControlsProps) {
  const statusCounts = cameras.reduce((acc, camera) => {
    acc[camera.status] = (acc[camera.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  return (
    <div className="absolute top-4 right-4 z-[1000] bg-white rounded-lg shadow-lg p-4">
      <h4 className="text-sm font-semibold mb-3">Filter by Status</h4>
      <div className="space-y-2">
        <button
          onClick={() => onStatusFilter(null)}
          className={`w-full text-left px-3 py-2 rounded text-sm ${
            selectedStatus === null ? 'bg-blue-100 text-blue-700' : 'hover:bg-gray-100'
          }`}
        >
          All ({cameras.length})
        </button>
        <button
          onClick={() => onStatusFilter('healthy')}
          className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${
            selectedStatus === 'healthy' ? 'bg-green-100 text-green-700' : 'hover:bg-gray-100'
          }`}
        >
          <span className="flex items-center">
            <span className="w-3 h-3 bg-green-500 rounded-full mr-2"></span>
            Healthy
          </span>
          <span>{statusCounts.healthy || 0}</span>
        </button>
        <button
          onClick={() => onStatusFilter('warning')}
          className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${
            selectedStatus === 'warning' ? 'bg-yellow-100 text-yellow-700' : 'hover:bg-gray-100'
          }`}
        >
          <span className="flex items-center">
            <span className="w-3 h-3 bg-yellow-500 rounded-full mr-2"></span>
            Warning
          </span>
          <span>{statusCounts.warning || 0}</span>
        </button>
        <button
          onClick={() => onStatusFilter('critical')}
          className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${
            selectedStatus === 'critical' ? 'bg-red-100 text-red-700' : 'hover:bg-gray-100'
          }`}
        >
          <span className="flex items-center">
            <span className="w-3 h-3 bg-red-500 rounded-full mr-2"></span>
            Critical
          </span>
          <span>{statusCounts.critical || 0}</span>
        </button>
        <button
          onClick={() => onStatusFilter('offline')}
          className={`w-full text-left px-3 py-2 rounded text-sm flex items-center justify-between ${
            selectedStatus === 'offline' ? 'bg-gray-100 text-gray-700' : 'hover:bg-gray-100'
          }`}
        >
          <span className="flex items-center">
            <span className="w-3 h-3 bg-gray-500 rounded-full mr-2"></span>
            Offline
          </span>
          <span>{statusCounts.offline || 0}</span>
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Main Camera Map View Component
// ============================================================================

interface CameraMapViewProps {
  cameras: CameraLocation[];
  center?: [number, number];
  zoom?: number;
  height?: string;
}

export function CameraMapView({ 
  cameras, 
  center = [28.6139, 77.2090], // Default: Delhi, India
  zoom = 12,
  height = '600px'
}: CameraMapViewProps) {
  const [mounted, setMounted] = useState(false);
  const [selectedStatus, setSelectedStatus] = useState<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="bg-white rounded-lg shadow p-6" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading map...</p>
        </div>
      </div>
    );
  }

  const filteredCameras = selectedStatus
    ? cameras.filter(camera => camera.status === selectedStatus)
    : cameras;

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden relative">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Camera Locations</h3>
        <p className="text-sm text-gray-600 mt-1">
          Showing {filteredCameras.length} of {cameras.length} cameras
        </p>
      </div>

      <div className="relative" style={{ height }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {filteredCameras.map((camera) => (
            <Marker
              key={camera.id}
              position={[camera.latitude, camera.longitude]}
              icon={createCustomIcon(camera.status)}
            >
              <Popup>
                <div className="p-2">
                  <h4 className="font-semibold text-sm">{camera.name}</h4>
                  <p className="text-xs text-gray-600 mt-1">{camera.branchName}</p>
                  
                  <div className="mt-2 space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="text-gray-600">Status:</span>
                      <span className={`font-medium ${
                        camera.status === 'healthy' ? 'text-green-600' :
                        camera.status === 'warning' ? 'text-yellow-600' :
                        camera.status === 'critical' ? 'text-red-600' :
                        'text-gray-600'
                      }`}>
                        {camera.status.charAt(0).toUpperCase() + camera.status.slice(1)}
                      </span>
                    </div>
                    
                    {camera.lastSeen && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">Last Seen:</span>
                        <span className="font-medium">{new Date(camera.lastSeen).toLocaleString()}</span>
                      </div>
                    )}
                    
                    {camera.uptime !== undefined && (
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-gray-600">Uptime:</span>
                        <span className="font-medium">{camera.uptime.toFixed(1)}%</span>
                      </div>
                    )}
                  </div>

                  <button className="mt-3 w-full px-2 py-1 bg-blue-600 text-white text-xs rounded hover:bg-blue-700">
                    View Details
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>

        <MapControls
          cameras={cameras}
          selectedStatus={selectedStatus}
          onStatusFilter={setSelectedStatus}
        />
      </div>
    </div>
  );
}

// ============================================================================
// Branch Cluster Map - Shows branches with camera counts
// ============================================================================

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

interface BranchClusterMapProps {
  branches: BranchLocation[];
  center?: [number, number];
  zoom?: number;
  height?: string;
}

export function BranchClusterMap({ 
  branches, 
  center = [28.6139, 77.2090],
  zoom = 10,
  height = '600px'
}: BranchClusterMapProps) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  if (!mounted) {
    return (
      <div className="bg-white rounded-lg shadow p-6" style={{ height }}>
        <div className="flex items-center justify-center h-full">
          <p className="text-gray-500">Loading map...</p>
        </div>
      </div>
    );
  }

  const createBranchIcon = (branch: BranchLocation) => {
    const healthPercentage = (branch.healthyCameras / branch.totalCameras) * 100;
    const color = healthPercentage >= 90 ? '#10b981' :
                  healthPercentage >= 70 ? '#f59e0b' : '#ef4444';

    return L.divIcon({
      className: 'custom-branch-marker',
      html: `
        <div style="
          background-color: ${color};
          width: 40px;
          height: 40px;
          border-radius: 50%;
          border: 3px solid white;
          box-shadow: 0 2px 6px rgba(0,0,0,0.3);
          display: flex;
          align-items: center;
          justify-content: center;
          font-weight: bold;
          color: white;
          font-size: 14px;
        ">${branch.totalCameras}</div>
      `,
      iconSize: [40, 40],
      iconAnchor: [20, 20],
      popupAnchor: [0, -20],
    });
  };

  return (
    <div className="bg-white rounded-lg shadow overflow-hidden">
      <div className="p-4 border-b border-gray-200">
        <h3 className="text-lg font-semibold">Branch Locations</h3>
        <p className="text-sm text-gray-600 mt-1">
          {branches.length} branches with {branches.reduce((sum, b) => sum + b.totalCameras, 0)} cameras
        </p>
      </div>

      <div style={{ height }}>
        <MapContainer
          center={center}
          zoom={zoom}
          style={{ height: '100%', width: '100%' }}
          scrollWheelZoom={true}
        >
          <TileLayer
            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
          />

          {branches.map((branch) => (
            <Marker
              key={branch.id}
              position={[branch.latitude, branch.longitude]}
              icon={createBranchIcon(branch)}
            >
              <Popup>
                <div className="p-3">
                  <h4 className="font-semibold">{branch.name}</h4>
                  
                  <div className="mt-3 space-y-2">
                    <div className="text-sm">
                      <span className="text-gray-600">Total Cameras:</span>
                      <span className="ml-2 font-semibold">{branch.totalCameras}</span>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                      <div className="flex items-center">
                        <span className="w-3 h-3 bg-green-500 rounded-full mr-1"></span>
                        <span>{branch.healthyCameras} Healthy</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-3 h-3 bg-yellow-500 rounded-full mr-1"></span>
                        <span>{branch.warningCameras} Warning</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-3 h-3 bg-red-500 rounded-full mr-1"></span>
                        <span>{branch.criticalCameras} Critical</span>
                      </div>
                      <div className="flex items-center">
                        <span className="w-3 h-3 bg-gray-500 rounded-full mr-1"></span>
                        <span>{branch.offlineCameras} Offline</span>
                      </div>
                    </div>
                  </div>

                  <button className="mt-3 w-full px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700">
                    View Branch Details
                  </button>
                </div>
              </Popup>
            </Marker>
          ))}
        </MapContainer>
      </div>
    </div>
  );
}
