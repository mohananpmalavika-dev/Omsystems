/**
 * Disk Health Card Component
 * Displays disk SMART status and metrics
 */

import { HardDrive, AlertTriangle, ThermometerSun } from "lucide-react";
import { DiskHealth, getTimeAgo } from "@/lib/types/operational-health";

interface DiskHealthCardProps {
  disk: DiskHealth;
}

export function DiskHealthCard({ disk }: DiskHealthCardProps) {
  const getStatusColor = () => {
    switch (disk.smartStatus) {
      case 'healthy': return 'bg-green-100 text-green-700 border-green-200';
      case 'warning': return 'bg-amber-100 text-amber-700 border-amber-200';
      case 'degraded': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'failure_predicted': return 'bg-red-100 text-red-700 border-red-200';
      case 'failed': return 'bg-red-200 text-red-900 border-red-300';
      default: return 'bg-gray-100 text-gray-700 border-gray-200';
    }
  };

  const showWarning = disk.smartStatus === 'failure_predicted' || 
                      disk.failureProbability > 50 ||
                      disk.temperature > 55;

  return (
    <div className="card hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-start gap-3">
          <div className={`p-2 rounded-lg ${
            disk.smartStatus === 'healthy' ? 'bg-green-100' : 'bg-red-100'
          }`}>
            <HardDrive size={20} className={
              disk.smartStatus === 'healthy' ? 'text-green-600' : 'text-red-600'
            } />
          </div>
          <div>
            <h4 className="font-semibold text-gray-900">{disk.model}</h4>
            <p className="text-xs text-gray-500">
              {disk.branchName} • {disk.devicePath}
            </p>
          </div>
        </div>
        <span className={`text-xs px-2 py-1 rounded border font-medium ${getStatusColor()}`}>
          {disk.smartStatus.replace('_', ' ')}
        </span>
      </div>

      {showWarning && (
        <div className="mb-3 p-2 bg-red-50 border border-red-200 rounded">
          <div className="flex items-start gap-2">
            <AlertTriangle size={16} className="text-red-600 mt-0.5 flex-shrink-0" />
            <div className="text-xs text-red-700">
              {disk.smartStatus === 'failure_predicted' && (
                <p className="font-medium mb-1">Failure predicted within 7-14 days</p>
              )}
              {disk.failureProbability > 50 && (
                <p>Failure probability: {disk.failureProbability.toFixed(1)}%</p>
              )}
              {disk.temperature > 55 && (
                <p>High temperature: {disk.temperature}°C</p>
              )}
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-gray-500 mb-1">Temperature</p>
          <p className="font-medium flex items-center gap-1">
            <ThermometerSun size={12} className={disk.temperature > 55 ? 'text-red-600' : 'text-gray-400'} />
            {disk.temperature}°C
          </p>
        </div>
        <div>
          <p className="text-gray-500 mb-1">Power On Hours</p>
          <p className="font-medium">{disk.powerOnHours.toLocaleString()}h</p>
        </div>
        <div>
          <p className="text-gray-500 mb-1">Reallocated Sectors</p>
          <p className={`font-medium ${disk.reallocatedSectors > 0 ? 'text-amber-600' : ''}`}>
            {disk.reallocatedSectors}
          </p>
        </div>
        <div>
          <p className="text-gray-500 mb-1">Pending Sectors</p>
          <p className={`font-medium ${disk.pendingSectors > 0 ? 'text-amber-600' : ''}`}>
            {disk.pendingSectors}
          </p>
        </div>
        {disk.uncorrectableSectors > 0 && (
          <div className="col-span-2">
            <p className="text-gray-500 mb-1">Uncorrectable Sectors</p>
            <p className="font-medium text-red-600">{disk.uncorrectableSectors}</p>
          </div>
        )}
      </div>

      <div className="flex items-center justify-between pt-3 mt-3 border-t text-xs text-gray-500">
        <span>Serial: {disk.serialNumber}</span>
        <span>{getTimeAgo(disk.lastCheck)}</span>
      </div>
    </div>
  );
}
