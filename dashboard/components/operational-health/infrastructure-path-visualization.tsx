"use client";

/**
 * Infrastructure Path Visualization
 * Visual topology showing camera dependencies (Camera → Switch → Firewall → UPS)
 */

import { useState, useEffect } from "react";
import { Camera, Network, Shield, Battery, Server, ArrowRight } from "lucide-react";
import { Card, CardHeader, CardTitle, CardContent } from "../ui/card";
import { fetchCamerasHealth } from "@/lib/api/operational-health";

interface InfrastructureDevice {
  deviceType: 'camera' | 'recorder' | 'switch' | 'firewall' | 'router' | 'sdwan' | 'network' | 'ups' | 'generator' | 'edge-agent' | 'disk' | 'environment' | 'sensor';
  deviceId: string;
  deviceName: string;
  healthScore: number | null;
  status: string;
}

interface InfrastructurePathVisualizationProps {
  branchId?: string;
  refreshKey?: number;
  className?: string;
}

export function InfrastructurePathVisualization({ branchId, refreshKey, className = "" }: InfrastructurePathVisualizationProps) {
  const [cameras, setCameras] = useState<any[]>([]);
  const [selectedCamera, setSelectedCamera] = useState<string | null>(null);
  const [path, setPath] = useState<InfrastructureDevice[]>([]);
  const [graphCoverage, setGraphCoverage] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (branchId) {
      loadCameras();
    }
  }, [branchId, refreshKey]);

  useEffect(() => {
    if (selectedCamera) {
      loadInfrastructurePath();
    }
  }, [selectedCamera]);

  const loadCameras = async () => {
    try {
      setLoading(true);
      const data = await fetchCamerasHealth({ branchId: branchId || undefined, limit: 500 });
      const cameraList = data?.cameras ?? [];
      setCameras(cameraList);
      
      if (cameraList.length > 0) {
        setSelectedCamera(cameraList[0].id);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load cameras");
    } finally {
      setLoading(false);
    }
  };

  const loadInfrastructurePath = async () => {
    try {
      const response = await fetch(`/api/control/v1/infrastructure/rca/camera/${selectedCamera}/infrastructure-path`, { cache: "no-store" });
      if (!response.ok) throw new Error("Failed to load infrastructure path");
      
      const { data, graphCoverage: coverage } = await response.json();
      setPath(data);
      setGraphCoverage(typeof coverage === "number" ? coverage : null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load infrastructure path");
    }
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'camera': return <Camera size={24} className="text-blue-600" />;
      case 'recorder': return <Server size={24} className="text-blue-600" />;
      case 'switch': return <Network size={24} className="text-green-600" />;
      case 'router':
      case 'sdwan':
      case 'network': return <Network size={24} className="text-green-600" />;
      case 'firewall': return <Shield size={24} className="text-red-600" />;
      case 'ups':
      case 'generator': return <Battery size={24} className="text-amber-600" />;
      default: return <Server size={24} className="text-gray-600" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status.toLowerCase()) {
      case 'online':
      case 'healthy': return 'bg-green-100 text-green-800 border-green-300';
      case 'warning': return 'bg-amber-100 text-amber-800 border-amber-300';
      case 'offline':
      case 'critical': return 'bg-red-100 text-red-800 border-red-300';
      default: return 'bg-gray-100 text-gray-800 border-gray-300';
    }
  };

  const getHealthScoreColor = (score: number | null) => {
    if (score === null) return '#6b7280'; // gray
    if (score >= 90) return '#10b981'; // green
    if (score >= 70) return '#f59e0b'; // amber
    return '#ef4444'; // red
  };

  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure Path Visualization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (error) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Infrastructure Path Visualization</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
            <p className="text-red-800">{error}</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!branchId) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Network size={20} className="text-blue-600" />
            Infrastructure Path Visualization
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center h-64 text-gray-400">
            <p>Select a branch to view infrastructure topology</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <Network size={20} className="text-blue-600" />
            Infrastructure Path Visualization
          </CardTitle>
          
          <div className="flex items-center gap-2">
            {graphCoverage !== null && (
              <span className="rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-600">
                {Math.round(graphCoverage)}% mapped
              </span>
            )}
            {cameras.length > 0 && (
              <select
                value={selectedCamera ?? ""}
                onChange={(e) => setSelectedCamera(e.target.value)}
                className="px-3 py-1 border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {cameras.map(camera => (
                  <option key={camera.id} value={camera.id}>{camera.name}</option>
                ))}
              </select>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {path.length === 0 ? (
          <div className="flex items-center justify-center h-64 text-gray-400">
            <p>No infrastructure path data available</p>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Visual Path */}
            <div className="flex items-center justify-around py-8 bg-gradient-to-r from-blue-50 to-purple-50 rounded-lg">
              {path.map((device, index) => (
                <div key={device.deviceId} className="flex items-center">
                  {/* Device Card */}
                  <div className="flex flex-col items-center">
                    <div className={`p-4 border-2 rounded-lg bg-white shadow-md ${
                      device.status === 'offline' || device.status === 'critical'
                        ? 'border-red-300'
                        : 'border-gray-200'
                    }`}>
                      <div className="mb-2">
                        {getDeviceIcon(device.deviceType)}
                      </div>
                      <h4 className="text-sm font-semibold text-gray-900 text-center mb-1">
                        {device.deviceName}
                      </h4>
                      <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                        getStatusColor(device.status)
                      }`}>
                        {device.status.toUpperCase()}
                      </span>
                      {device.healthScore !== null && (
                        <div className="mt-2 text-center">
                          <span 
                            className="text-lg font-bold"
                            style={{ color: getHealthScoreColor(device.healthScore) }}
                          >
                            {device.healthScore}
                          </span>
                          <span className="text-xs text-gray-500 ml-1">/ 100</span>
                        </div>
                      )}
                    </div>
                    <div className="mt-2 text-xs text-gray-500 capitalize">
                      {device.deviceType}
                    </div>
                  </div>

                  {/* Arrow */}
                  {index < path.length - 1 && (
                    <div className="mx-4">
                      <ArrowRight size={32} className="text-gray-400" />
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Detailed List */}
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-700">Dependency Chain</h3>
              {path.map((device, index) => (
                <div key={device.deviceId} className="flex items-center gap-3 p-3 bg-gray-50 rounded-lg">
                  <span className="text-sm font-medium text-gray-500 w-8">
                    {index + 1}.
                  </span>
                  <div className="flex-shrink-0">
                    {getDeviceIcon(device.deviceType)}
                  </div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-gray-900">{device.deviceName}</span>
                      <span className="text-xs text-gray-500">({device.deviceType})</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    {device.healthScore !== null && (
                      <span className="text-sm text-gray-600">
                        Health: <span style={{ color: getHealthScoreColor(device.healthScore) }} className="font-medium">
                          {device.healthScore}
                        </span>
                      </span>
                    )}
                    <span className={`px-2 py-0.5 rounded text-xs font-medium border ${
                      getStatusColor(device.status)
                    }`}>
                      {device.status}
                    </span>
                  </div>
                </div>
              ))}
            </div>

            {/* Legend */}
            <div className="pt-4 border-t">
              <div className="flex items-center justify-center gap-6 text-xs text-gray-600">
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-green-500" />
                  <span>Healthy (90-100)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span>Warning (70-89)</span>
                </div>
                <div className="flex items-center gap-1">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span>Critical (0-69)</span>
                </div>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
