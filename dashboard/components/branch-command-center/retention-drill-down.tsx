/**
 * Retention Drill-Down Modal
 * 
 * Detailed view of retention compliance:
 * - Required vs actual retention days
 * - Per-camera retention status
 * - Affected cameras with gap analysis
 * - Compliance breakdown
 */

'use client';

import React from 'react';
import { BranchRetentionSummary } from '@/types/branch-operational-snapshot';
import { XMarkIcon, ExclamationTriangleIcon, CheckCircleIcon, ClockIcon } from '@heroicons/react/24/outline';

interface RetentionDrillDownProps {
  branchId: string;
  retention: BranchRetentionSummary;
  onClose: () => void;
}

export function RetentionDrillDown({ branchId, retention, onClose }: RetentionDrillDownProps) {
  const getRetentionStateColor = (state: string) => {
    switch (state) {
      case 'COMPLIANT':
        return 'text-green-600 bg-green-50 dark:bg-green-900/20';
      case 'WARNING':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      case 'VIOLATION':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      default:
        return 'text-gray-600 bg-gray-50 dark:bg-gray-800';
    }
  };

  const getConfidenceColor = (confidence: number) => {
    if (confidence >= 0.8) return 'text-green-600';
    if (confidence >= 0.5) return 'text-yellow-600';
    return 'text-red-600';
  };

  const totalChannels = 
    retention.compliantChannels + 
    retention.warningChannels + 
    retention.violatingChannels + 
    retention.unknownChannels;

  return (
    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between border-b border-gray-200 dark:border-gray-700 px-6 py-4">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Retention Compliance Details
            </h2>
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
              Required: {retention.requiredDays} days • Minimum verified: {retention.minimumVerifiedDays || 0} days
            </p>
          </div>
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
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Overall Status
              </h3>
              <span
                className={`inline-flex items-center px-3 py-1 rounded-full text-sm font-semibold ${getRetentionStateColor(
                  retention.state
                )}`}
              >
                {retention.state}
              </span>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Total Cameras</div>
                <div className="text-2xl font-bold text-gray-900 dark:text-white">
                  {totalChannels}
                </div>
              </div>

              <div className="bg-green-50 dark:bg-green-900/20 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Compliant</div>
                <div className="text-2xl font-bold text-green-600 dark:text-green-400">
                  {retention.compliantChannels}
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-900/20 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Warning</div>
                <div className="text-2xl font-bold text-yellow-600 dark:text-yellow-400">
                  {retention.warningChannels}
                </div>
              </div>

              <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Violation</div>
                <div className="text-2xl font-bold text-red-600 dark:text-red-400">
                  {retention.violatingChannels}
                </div>
              </div>

              <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
                <div className="text-sm text-gray-600 dark:text-gray-400 mb-1">Unknown</div>
                <div className="text-2xl font-bold text-gray-600 dark:text-gray-400">
                  {retention.unknownChannels}
                </div>
              </div>
            </div>
          </div>

          {/* Retention Statistics */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Retention Statistics
            </h3>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4 grid grid-cols-2 md:grid-cols-3 gap-4">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Required Days</div>
                <div className="text-lg font-bold text-gray-900 dark:text-white">
                  {retention.requiredDays} days
                </div>
              </div>

              {retention.minimumVerifiedDays !== undefined && (
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Minimum Verified</div>
                  <div className={`text-lg font-bold ${
                    retention.minimumVerifiedDays >= retention.requiredDays ? 'text-green-600' : 'text-red-600'
                  }`}>
                    {retention.minimumVerifiedDays} days
                  </div>
                </div>
              )}

              {retention.medianVerifiedDays !== undefined && (
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Median Verified</div>
                  <div className="text-lg font-bold text-gray-900 dark:text-white">
                    {retention.medianVerifiedDays} days
                  </div>
                </div>
              )}

              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Verification Confidence</div>
                <div className={`text-lg font-bold ${getConfidenceColor(retention.confidence)}`}>
                  {(retention.confidence * 100).toFixed(0)}%
                </div>
              </div>

              {retention.minimumVerifiedDays !== undefined && retention.minimumVerifiedDays < retention.requiredDays && (
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Retention Gap</div>
                  <div className="text-lg font-bold text-red-600 dark:text-red-400">
                    -{(retention.requiredDays - retention.minimumVerifiedDays)} days
                  </div>
                </div>
              )}

              {retention.observedAt && (
                <div>
                  <div className="text-sm text-gray-600 dark:text-gray-400">Last Verified</div>
                  <div className="text-sm text-gray-900 dark:text-white">
                    {new Date(retention.observedAt).toLocaleString()}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Affected Cameras */}
          {retention.affectedCameras && retention.affectedCameras.length > 0 && (
            <div className="mb-6">
              <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 flex items-center gap-2">
                <ExclamationTriangleIcon className="h-5 w-5 text-red-500" />
                Cameras Below Retention Policy ({retention.affectedCameras.length})
              </h3>
              <div className="space-y-2">
                {retention.affectedCameras.map((camera) => (
                  <div
                    key={camera.cameraId}
                    className={`border rounded-lg p-4 ${
                      camera.severity === 'CRITICAL'
                        ? 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                        : 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-gray-900 dark:text-white">
                            {camera.cameraName}
                          </span>
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${
                              camera.severity === 'CRITICAL'
                                ? 'text-red-600 bg-red-100 dark:bg-red-900/30'
                                : 'text-yellow-600 bg-yellow-100 dark:bg-yellow-900/30'
                            }`}
                          >
                            {camera.severity}
                          </span>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-sm">
                          <div>
                            <div className="text-gray-600 dark:text-gray-400">Actual Retention</div>
                            <div className="font-semibold text-gray-900 dark:text-white">
                              {camera.actualDays} days
                            </div>
                          </div>

                          <div>
                            <div className="text-gray-600 dark:text-gray-400">Required</div>
                            <div className="font-semibold text-gray-900 dark:text-white">
                              {retention.requiredDays} days
                            </div>
                          </div>

                          <div>
                            <div className="text-gray-600 dark:text-gray-400">Gap</div>
                            <div className={`font-semibold ${
                              camera.severity === 'CRITICAL' ? 'text-red-600' : 'text-yellow-600'
                            }`}>
                              -{camera.gapDays} days
                            </div>
                          </div>
                        </div>
                      </div>

                      <button
                        onClick={() => {
                          // Navigate to camera details or recording verification
                          console.log('View camera retention details:', camera.cameraId);
                        }}
                        className="ml-4 px-3 py-1.5 text-sm bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors"
                      >
                        Details
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Compliance Breakdown */}
          <div className="mb-6">
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              Compliance Breakdown
            </h3>
            <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
              <div className="space-y-3">
                {/* Compliant */}
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2">
                      <CheckCircleIcon className="h-5 w-5 text-green-600" />
                      <span className="text-sm font-medium text-gray-900 dark:text-white">
                        Compliant Cameras
                      </span>
                    </div>
                    <span className="text-sm font-semibold text-green-600">
                      {retention.compliantChannels} / {totalChannels}
                    </span>
                  </div>
                  <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                    <div
                      className="h-2 rounded-full bg-green-600"
                      style={{ width: `${(retention.compliantChannels / Math.max(totalChannels, 1)) * 100}%` }}
                    />
                  </div>
                </div>

                {/* Warning */}
                {retention.warningChannels > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Warning Cameras
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-yellow-600">
                        {retention.warningChannels} / {totalChannels}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-yellow-600"
                        style={{ width: `${(retention.warningChannels / Math.max(totalChannels, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Violation */}
                {retention.violatingChannels > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <ExclamationTriangleIcon className="h-5 w-5 text-red-600" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Violating Cameras
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-red-600">
                        {retention.violatingChannels} / {totalChannels}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-red-600"
                        style={{ width: `${(retention.violatingChannels / Math.max(totalChannels, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Unknown */}
                {retention.unknownChannels > 0 && (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <div className="flex items-center gap-2">
                        <ClockIcon className="h-5 w-5 text-gray-600" />
                        <span className="text-sm font-medium text-gray-900 dark:text-white">
                          Unknown Status
                        </span>
                      </div>
                      <span className="text-sm font-semibold text-gray-600">
                        {retention.unknownChannels} / {totalChannels}
                      </span>
                    </div>
                    <div className="w-full bg-gray-200 dark:bg-gray-600 rounded-full h-2">
                      <div
                        className="h-2 rounded-full bg-gray-400"
                        style={{ width: `${(retention.unknownChannels / Math.max(totalChannels, 1)) * 100}%` }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Recommendations */}
          {(retention.violatingChannels > 0 || retention.unknownChannels > 0 || retention.confidence < 0.8) && (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-300 mb-2">
                Recommendations
              </h3>
              <ul className="space-y-1 text-sm text-blue-800 dark:text-blue-400">
                {retention.violatingChannels > 0 && (
                  <li>• {retention.violatingChannels} camera(s) violate retention policy - investigate recording failures or storage issues</li>
                )}
                {retention.unknownChannels > 0 && (
                  <li>• {retention.unknownChannels} camera(s) have unknown retention status - verify recording and storage health</li>
                )}
                {retention.confidence < 0.8 && (
                  <li>• Low verification confidence ({(retention.confidence * 100).toFixed(0)}%) - run manual retention verification</li>
                )}
                {retention.minimumVerifiedDays !== undefined && retention.minimumVerifiedDays < retention.requiredDays && (
                  <li>• Minimum retention ({retention.minimumVerifiedDays} days) below policy - review storage capacity and recording settings</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="border-t border-gray-200 dark:border-gray-700 px-6 py-4 flex justify-between">
          <button
            onClick={() => {
              // Run manual verification
              console.log('Run retention verification for branch:', branchId);
            }}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            Run Verification
          </button>
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
