/**
 * Incident Card Component
 * Display security incident with expandable details
 */

import React from 'react';
import type { IncidentCardProps } from '../types/ui-types';
import {
  formatTimestamp,
  getSeverityColor,
  getSeverityLabel,
  getConfidenceColor,
  formatConfidence,
  formatAssetId,
  formatEventType,
} from '../utils/formatters';

export function IncidentCard({
  incident,
  expanded = false,
  onToggle,
  onInvestigate,
  className,
}: IncidentCardProps) {
  const severityColor = getSeverityColor(incident.severity);
  const severityLabel = getSeverityLabel(incident.severity);
  const confidenceColor = getConfidenceColor(incident.confidence);

  return (
    <div
      className={`border rounded-lg overflow-hidden hover:shadow-md transition-shadow ${className || ''}`}
      style={{ borderLeftWidth: '4px', borderLeftColor: severityColor }}
    >
      {/* Header */}
      <div
        className="p-4 bg-white cursor-pointer hover:bg-gray-50"
        onClick={onToggle}
      >
        <div className="flex items-start justify-between">
          <div className="flex-1">
            {/* Title and type */}
            <div className="flex items-center gap-2 mb-2">
              <h3 className="font-semibold text-gray-900">{incident.title}</h3>
              <span className="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded">
                {formatEventType(incident.incidentType)}
              </span>
            </div>

            {/* Description */}
            <p className="text-sm text-gray-600 mb-3">{incident.description}</p>

            {/* Metadata row */}
            <div className="flex flex-wrap items-center gap-4 text-xs">
              {/* Severity */}
              <div className="flex items-center gap-1">
                <span
                  className="w-2 h-2 rounded-full"
                  style={{ backgroundColor: severityColor }}
                ></span>
                <span className="font-medium" style={{ color: severityColor }}>
                  {severityLabel.toUpperCase()}
                </span>
              </div>

              {/* Confidence */}
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Confidence:</span>
                <span className="font-medium" style={{ color: confidenceColor }}>
                  {formatConfidence(incident.confidence)}
                </span>
              </div>

              {/* Timestamp */}
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Time:</span>
                <span className="text-gray-700">{formatTimestamp(incident.timestamp)}</span>
              </div>

              {/* Event count */}
              <div className="flex items-center gap-1">
                <span className="text-gray-500">Events:</span>
                <span className="text-gray-700">{incident.events.length}</span>
              </div>
            </div>
          </div>

          {/* Expand/collapse icon */}
          <button
            className="ml-4 text-gray-400 hover:text-gray-600 transition-colors"
            onClick={(e) => {
              e.stopPropagation();
              onToggle?.();
            }}
          >
            <svg
              className={`w-5 h-5 transition-transform ${expanded ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
        </div>
      </div>

      {/* Expanded details */}
      {expanded && (
        <div className="border-t border-gray-200 bg-gray-50 p-4 space-y-4">
          {/* Affected assets */}
          {incident.affectedAssets.length > 0 && (
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Affected Assets</div>
              <div className="flex flex-wrap gap-2">
                {incident.affectedAssets.map((assetId) => (
                  <span
                    key={assetId}
                    className="text-xs px-2 py-1 bg-white border border-gray-200 rounded text-gray-700"
                  >
                    {formatAssetId(assetId)}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Root cause */}
          {incident.rootCause && (
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Root Cause Analysis</div>
              <div className="text-sm text-gray-600 bg-white p-3 rounded border border-gray-200">
                <div className="mb-2">
                  <span className="font-medium">Type:</span> {formatEventType(incident.rootCause.primaryEventType)}
                </div>
                <div className="mb-2">
                  <span className="font-medium">Confidence:</span> {formatConfidence(incident.rootCause.confidence)}
                </div>
                <div>
                  <span className="font-medium">Explanation:</span>
                  <p className="mt-1">{incident.rootCause.explanation}</p>
                </div>
                {incident.rootCause.contributingFactors.length > 0 && (
                  <div className="mt-2">
                    <span className="font-medium">Contributing Factors:</span>
                    <ul className="mt-1 ml-4 list-disc">
                      {incident.rootCause.contributingFactors.map((factor, idx) => (
                        <li key={idx}>{factor}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Correlation fingerprint */}
          {incident.correlationFingerprint && (
            <div>
              <div className="text-sm font-semibold text-gray-700 mb-2">Correlation Details</div>
              <div className="text-xs text-gray-500 bg-white p-2 rounded border border-gray-200 font-mono">
                {incident.correlationFingerprint}
              </div>
            </div>
          )}

          {/* Events summary */}
          <div>
            <div className="text-sm font-semibold text-gray-700 mb-2">
              Events ({incident.events.length})
            </div>
            <div className="space-y-2">
              {incident.events.slice(0, 5).map((eventId) => (
                <div
                  key={eventId}
                  className="text-xs px-3 py-2 bg-white border border-gray-200 rounded text-gray-700 font-mono"
                >
                  {eventId}
                </div>
              ))}
              {incident.events.length > 5 && (
                <div className="text-xs text-gray-500 text-center py-1">
                  +{incident.events.length - 5} more events
                </div>
              )}
            </div>
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-2">
            <button
              onClick={(e) => {
                e.stopPropagation();
                onInvestigate?.();
              }}
              className="px-4 py-2 bg-blue-600 text-white text-sm rounded hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 transition-colors"
            >
              Investigate Further
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                // Could trigger playbook execution
              }}
              className="px-4 py-2 bg-white border border-gray-300 text-gray-700 text-sm rounded hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-gray-500 transition-colors"
            >
              Execute Playbook
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
