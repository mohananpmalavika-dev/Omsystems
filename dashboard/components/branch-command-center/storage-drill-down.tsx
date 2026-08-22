/**
 * Storage Drill-Down Modal
 * 
 * Detailed view of storage health:
 * - Individual disk status with SMART metrics
 * - RAID status
 * - Capacity usage
 * - Critical warnings
 */

'use client';

import React from 'react';
import { StorageHealthSummary } from '@/types/branch-operational-snapshot';
import { XMarkIcon, ExclamationTriangleIcon } from '@heroicons/react/24/outline';

interface StorageDrillDownProps {
  branchId: string;
  storage: StorageHealthSummary;
  onClose: () => void;
}

export function StorageDrillDown({ branchId, storage, onClose }: StorageDrillDownProps) {
  const getSmartStatusColor = (status: string) => {
    switch (status) {
      case 'healthy':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20';
      case 'warning':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      case 'failure_predicted':
      case 'failed':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-800';
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Storage Health Details
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-6 w-6 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(90vh-80px)]">
          {/* Overall Status */}
          <div className="mb-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Disks</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {storage.disks.total}
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Healthy</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {storage.disks.healthy}
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Warning</div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {storage.disks.warning}
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Failed</div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {storage.disks.failed}
                </div>
              </div>
            </div>
          </div>

          {/* Capacity */}
          {storage.capacity && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                Storage Capacity
              </h3>
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {storage.capacity.usedGB.toFixed(1)} GB / {storage.capacity.totalGB.toFixed(1)} GB used
                  </span>
                  <span className={`text-sm font-semibold ${
                    storage.capacity.usagePercent > 90 ? 'text-red-600' :
                    storage.capacity.usagePercent > 75 ? 'text-yellow-600' :
                    'text-green-600'
                  }`}>
                    {storage.capacity.usagePercent.toFixed(1)}%
                  </span>
                </div>
                <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-3">
                  <div
                    className={`h-3 rounded-full transition-all ${
                      storage.capacity.usagePercent > 90 ? 'bg-red-600' :
                      storage.capacity.usagePercent > 75 ? 'bg-yellow-600' :
                      'bg-green-600'
                    }`}
                    style={{ width: `${Math.min(100, storage.capacity.usagePercent)}%` }}
                  />
                </div>
                <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                  Available: {storage.capacity.availableGB.toFixed(1)} GB
                </div>
              </div>
            </div>
          )}

          {/* RAID Status */}
          {storage.raidStatus && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
                RAID Status
              </h3>
              <div
                className={`inline-flex items-center px-3 py-2 rounded-lg text-sm font-semibold ${
                  storage.raidStatus === 'healthy'
                    ? 'text-green-600 bg-green-50 dark:bg-green-900/20'
                    : storage.raidStatus === 'degraded'
                    ? 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20'
                    : 'text-red-600 bg-red-50 dark:bg-red-900/20'
                }`}
              >
                {storage.raidStatus.toUpperCase()}
              </div>
            </div>
          )}

          {/* Critical Disks */}
          {storage.criticalDisks.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                Critical Disks Requiring Attention
              </h3>
              <div className="space-y-3">
                {storage.criticalDisks.map((disk) => (
                  <div
                    key={disk.id}
                    className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4"
                  >
                    <div className="flex items-start justify-between mb-2">
                      <div>
                        <div className="font-medium text-gray-900 dark:text-white">
                          {disk.devicePath}
                        </div>
                        {disk.model && (
                          <div className="text-sm text-gray-600 dark:text-gray-400">
                            {disk.model}
                          </div>
                        )}
                      </div>
                      <span
                        className={`inline-flex items-center px-2 py-1 rounded text-xs font-semibold ${getSmartStatusColor(
                          disk.smartStatus
                        )}`}
                      >
                        {disk.smartStatus.replace('_', ' ').toUpperCase()}
                      </span>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
                      {disk.temperature !== undefined && (
                        <div>
                          <div className="text-gray-600 dark:text-gray-400">Temperature</div>
                          <div className={`font-medium ${
                            disk.temperature > 50 ? 'text-red-600' :
                            disk.temperature > 40 ? 'text-yellow-600' :
                            'text-gray-900 dark:text-white'
                          }`}>
                            {disk.temperature}°C
                          </div>
                        </div>
                      )}

                      <div>
                        <div className="text-gray-600 dark:text-gray-400">Reallocated Sectors</div>
                        <div className={`font-medium ${
                          disk.reallocatedSectors > 0 ? 'text-red-600' : 'text-gray-900 dark:text-white'
                        }`}>
                          {disk.reallocatedSectors}
                        </div>
                      </div>

                      <div>
                        <div className="text-gray-600 dark:text-gray-400">Pending Sectors</div>
                        <div className={`font-medium ${
                          disk.pendingSectors > 0 ? 'text-yellow-600' : 'text-gray-900 dark:text-white'
                        }`}>
                          {disk.pendingSectors}
                        </div>
                      </div>

                      {disk.failureProbability !== undefined && (
                        <div>
                          <div className="text-gray-600 dark:text-gray-400">Failure Risk</div>
                          <div className={`font-medium ${
                            disk.failureProbability > 50 ? 'text-red-600' :
                            disk.failureProbability > 20 ? 'text-yellow-600' :
                            'text-gray-900 dark:text-white'
                          }`}>
                            {disk.failureProbability.toFixed(0)}%
                          </div>
                        </div>
                      )}
                    </div>

                    {disk.serialNumber && (
                      <div className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                        Serial: {disk.serialNumber}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Recommendations */}
          {(storage.disks.failed > 0 || storage.disks.warning > 0 || (storage.capacity && storage.capacity.usagePercent > 85)) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Recommendations
              </h3>
              <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
                {storage.disks.failed > 0 && (
                  <li>• Replace failed disk(s) immediately to prevent data loss</li>
                )}
                {storage.disks.warning > 0 && (
                  <li>• Monitor disks with warnings and plan for replacement</li>
                )}
                {storage.capacity && storage.capacity.usagePercent > 90 && (
                  <li>• Storage critically full - add capacity or reduce retention policy</li>
                )}
                {storage.capacity && storage.capacity.usagePercent > 85 && storage.capacity.usagePercent <= 90 && (
                  <li>• Storage approaching capacity - plan for expansion</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
