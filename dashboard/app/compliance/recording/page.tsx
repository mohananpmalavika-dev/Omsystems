/**
 * Recording Compliance Dashboard
 * 
 * Displays evidence-based recording compliance status for all cameras
 * with proper three-state health handling (healthy/unhealthy/unknown)
 */

'use client';

import React from 'react';
import { 
  RecordingComplianceStatus,
  RecordingComplianceBadge,
  RecordingComplianceDot,
  type RecordingComplianceResult 
} from '../../../components/recording-compliance/RecordingComplianceStatus';
import { AlertTriangle, CheckCircle, HelpCircle, RefreshCw } from 'lucide-react';

export default function RecordingCompliancePage() {
  const [cameras, setCameras] = React.useState<Array<{
    id: string;
    name: string;
    branchName: string;
    compliance?: RecordingComplianceResult;
    loading: boolean;
    error?: string;
  }>>([]);
  const [filter, setFilter] = React.useState<'all' | 'healthy' | 'unhealthy' | 'unknown'>('all');
  const [loading, setLoading] = React.useState(true);
  
  // Fetch cameras and their compliance status
  React.useEffect(() => {
    fetchCameras();
  }, []);
  
  async function fetchCameras() {
    try {
      setLoading(true);
      
      // Get all cameras with recorders
      const camerasResponse = await fetch('/api/cameras?hasRecorder=true');
      const camerasData = await camerasResponse.json();
      
      setCameras(
        camerasData.map((camera: any) => ({
          id: camera.id,
          name: camera.name,
          branchName: camera.branchName,
          loading: true
        }))
      );
      
      // Fetch compliance for each camera
      for (const camera of camerasData) {
        fetchCameraCompliance(camera.id);
      }
      
    } catch (error) {
      console.error('Failed to fetch cameras:', error);
    } finally {
      setLoading(false);
    }
  }
  
  async function fetchCameraCompliance(cameraId: string) {
    try {
      const response = await fetch(`/api/recording-compliance/${cameraId}`);
      
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      
      const compliance = await response.json();
      
      setCameras(prev =>
        prev.map(cam =>
          cam.id === cameraId
            ? { ...cam, compliance, loading: false }
            : cam
        )
      );
      
    } catch (error) {
      console.error(`Failed to fetch compliance for camera ${cameraId}:`, error);
      
      setCameras(prev =>
        prev.map(cam =>
          cam.id === cameraId
            ? { ...cam, loading: false, error: String(error) }
            : cam
        )
      );
    }
  }
  
  async function refreshCompliance() {
    // Trigger new checks for all cameras
    setCameras(prev => prev.map(cam => ({ ...cam, loading: true })));
    
    for (const camera of cameras) {
      await fetchCameraCompliance(camera.id);
    }
  }
  
  // Filter cameras
  const filteredCameras = cameras.filter(camera => {
    if (filter === 'all') return true;
    return camera.compliance?.overallStatus === filter;
  });
  
  // Statistics
  const stats = {
    total: cameras.length,
    healthy: cameras.filter(c => c.compliance?.overallStatus === 'healthy').length,
    unhealthy: cameras.filter(c => c.compliance?.overallStatus === 'unhealthy').length,
    unknown: cameras.filter(c => c.compliance?.overallStatus === 'unknown').length,
    loading: cameras.filter(c => c.loading).length
  };
  
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Recording Compliance
          </h1>
          <p className="text-gray-600">
            Evidence-based recording verification with three-state health model
          </p>
        </div>
        
        {/* Statistics */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <StatCard
            label="Total Cameras"
            value={stats.total}
            icon={<div className="w-3 h-3 rounded-full bg-gray-400" />}
          />
          <StatCard
            label="Healthy"
            value={stats.healthy}
            icon={<CheckCircle className="w-5 h-5 text-green-600" />}
            onClick={() => setFilter('healthy')}
            active={filter === 'healthy'}
          />
          <StatCard
            label="Failed"
            value={stats.unhealthy}
            icon={<AlertTriangle className="w-5 h-5 text-red-600" />}
            onClick={() => setFilter('unhealthy')}
            active={filter === 'unhealthy'}
          />
          <StatCard
            label="Cannot Verify"
            value={stats.unknown}
            icon={<HelpCircle className="w-5 h-5 text-amber-600" />}
            onClick={() => setFilter('unknown')}
            active={filter === 'unknown'}
          />
        </div>
        
        {/* Controls */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-2">
            <button
              onClick={() => setFilter('all')}
              className={`px-4 py-2 rounded-lg font-medium transition-colors ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-50'
              }`}
            >
              All Cameras
            </button>
          </div>
          
          <button
            onClick={refreshCompliance}
            disabled={stats.loading > 0}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-4 h-4 ${stats.loading > 0 ? 'animate-spin' : ''}`} />
            <span>Refresh {stats.loading > 0 && `(${stats.loading})`}</span>
          </button>
        </div>
        
        {/* Important Notice */}
        <div className="mb-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="flex items-start gap-3">
            <div className="text-blue-600 mt-0.5">ℹ️</div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-1">
                Evidence-Based Verification
              </h3>
              <p className="text-sm text-blue-800">
                This system verifies recording compliance using actual device communication.
                <strong className="ml-1">UNKNOWN</strong> status means the system cannot verify the recorder
                (e.g., device offline, authentication failed, API unavailable) – this is <strong>NOT</strong> treated
                as healthy. Only cameras with positive evidence are marked <strong>HEALTHY</strong>.
              </p>
            </div>
          </div>
        </div>
        
        {/* Loading state */}
        {loading && cameras.length === 0 && (
          <div className="text-center py-12">
            <RefreshCw className="w-8 h-8 text-gray-400 animate-spin mx-auto mb-3" />
            <p className="text-gray-600">Loading cameras...</p>
          </div>
        )}
        
        {/* Empty state */}
        {!loading && cameras.length === 0 && (
          <div className="text-center py-12 bg-white rounded-lg border">
            <p className="text-gray-600">No cameras with recorders found</p>
          </div>
        )}
        
        {/* Camera list */}
        <div className="space-y-4">
          {filteredCameras.map(camera => (
            <div key={camera.id}>
              {camera.loading ? (
                <div className="bg-white rounded-lg border p-6">
                  <div className="flex items-center gap-3">
                    <RefreshCw className="w-5 h-5 text-gray-400 animate-spin" />
                    <div>
                      <h3 className="font-semibold text-gray-900">{camera.name}</h3>
                      <p className="text-sm text-gray-600">{camera.branchName}</p>
                    </div>
                  </div>
                </div>
              ) : camera.error ? (
                <div className="bg-red-50 rounded-lg border border-red-200 p-6">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                    <div>
                      <h3 className="font-semibold text-gray-900">{camera.name}</h3>
                      <p className="text-sm text-gray-600 mb-2">{camera.branchName}</p>
                      <p className="text-sm text-red-600">Failed to check: {camera.error}</p>
                    </div>
                  </div>
                </div>
              ) : camera.compliance ? (
                <RecordingComplianceStatus
                  result={camera.compliance}
                  cameraName={`${camera.name} – ${camera.branchName}`}
                  showDetails={false}
                />
              ) : null}
            </div>
          ))}
        </div>
        
        {/* Filtered empty state */}
        {!loading && filteredCameras.length === 0 && cameras.length > 0 && (
          <div className="text-center py-12 bg-white rounded-lg border">
            <p className="text-gray-600">
              No cameras with <strong>{filter}</strong> status
            </p>
            <button
              onClick={() => setFilter('all')}
              className="mt-3 text-blue-600 hover:text-blue-700 font-medium"
            >
              Show all cameras
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Stat card component
 */
function StatCard({
  label,
  value,
  icon,
  onClick,
  active
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  onClick?: () => void;
  active?: boolean;
}) {
  const isClickable = !!onClick;
  
  return (
    <div
      onClick={onClick}
      className={`
        bg-white rounded-lg border-2 p-4 transition-all
        ${active ? 'border-blue-600 shadow-lg' : 'border-gray-200'}
        ${isClickable ? 'cursor-pointer hover:border-gray-300 hover:shadow-md' : ''}
      `}
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-600">{label}</span>
        {icon}
      </div>
      <div className="text-3xl font-bold text-gray-900">{value}</div>
    </div>
  );
}
