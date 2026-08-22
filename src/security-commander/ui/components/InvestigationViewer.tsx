/**
 * Investigation Viewer Component
 * Comprehensive display of security investigation with all details
 */

import React, { useEffect, useState } from 'react';
import type { InvestigationViewerProps } from '../types/ui-types';
import type { Investigation } from '../../types';
import { useCommander } from '../context/CommanderContext';
import { useCommanderApi } from '../hooks/useCommanderApi';
import { IncidentCard } from './IncidentCard';
import { TimelineView } from './TimelineView';
import { EvidenceGallery } from './EvidenceGallery';
import { ActionChecklist } from './ActionChecklist';
import {
  formatTimestamp,
  formatDuration,
  getSeverityColor,
  getSeverityLabel,
} from '../utils/formatters';

export function InvestigationViewer({
  investigationId,
  onClose,
  className,
}: InvestigationViewerProps) {
  const [investigation, setInvestigation] = useState<Investigation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [expandedIncidents, setExpandedIncidents] = useState<Set<string>>(new Set());
  
  const { state, updateViewState, toggleSection } = useCommander();
  const { getInvestigation } = useCommanderApi();

  // Load investigation
  useEffect(() => {
    const loadInvestigation = async () => {
      setLoading(true);
      setError(null);

      const response = await getInvestigation(investigationId);

      if (response.error) {
        setError(response.error);
      } else if (response.data) {
        setInvestigation(response.data);
      }

      setLoading(false);
    };

    loadInvestigation();
  }, [investigationId, getInvestigation]);

  const toggleIncident = (incidentId: string) => {
    const newExpanded = new Set(expandedIncidents);
    if (newExpanded.has(incidentId)) {
      newExpanded.delete(incidentId);
    } else {
      newExpanded.add(incidentId);
    }
    setExpandedIncidents(newExpanded);
  };

  const handleInvestigateIncident = (incidentId: string) => {
    // Could trigger new investigation for specific incident
    console.log('Investigate incident:', incidentId);
  };

  if (loading) {
    return (
      <div className={`flex items-center justify-center h-full ${className || ''}`}>
        <div className="text-center">
          <div className="animate-spin h-12 w-12 border-4 border-blue-600 border-t-transparent rounded-full mx-auto mb-4"></div>
          <p className="text-gray-600">Loading investigation...</p>
        </div>
      </div>
    );
  }

  if (error || !investigation) {
    return (
      <div className={`flex items-center justify-center h-full ${className || ''}`}>
        <div className="text-center text-red-600">
          <svg className="w-16 h-16 mx-auto mb-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
          </svg>
          <p className="text-lg font-medium">Failed to load investigation</p>
          <p className="text-sm mt-1">{error || 'Unknown error'}</p>
          <button
            onClick={onClose}
            className="mt-4 px-4 py-2 bg-gray-600 text-white rounded hover:bg-gray-700"
          >
            Close
          </button>
        </div>
      </div>
    );
  }

  const maxSeverity = Math.max(...investigation.incidents.map(i => i.severity));
  const severityColor = getSeverityColor(maxSeverity);
  const severityLabel = getSeverityLabel(maxSeverity);

  return (
    <div className={`flex flex-col h-full bg-white ${className || ''}`}>
      {/* Header */}
      <div className="flex-none border-b border-gray-200 bg-white p-6">
        <div className="flex items-start justify-between">
          <div className="flex-1">
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-2xl font-bold text-gray-900">{investigation.title}</h1>
              <span
                className="px-3 py-1 rounded-full text-sm font-medium text-white"
                style={{ backgroundColor: severityColor }}
              >
                {severityLabel.toUpperCase()}
              </span>
            </div>
            
            <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 mt-3">
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
                <span>{formatTimestamp(investigation.createdAt)}</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span>{investigation.incidents.length} incidents</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{investigation.events.length} events</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 4v16M17 4v16M3 8h4m10 0h4M3 12h18M3 16h4m10 0h4M4 20h16a1 1 0 001-1V5a1 1 0 00-1-1H4a1 1 0 00-1 1v14a1 1 0 001 1z" />
                </svg>
                <span>{investigation.evidence.length} evidence items</span>
              </div>
              <div className="flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>
                  {formatTimestamp(investigation.timeRange.start)} - {formatTimestamp(investigation.timeRange.end)}
                </span>
              </div>
            </div>

            {investigation.summary && (
              <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                <div className="text-sm font-medium text-blue-900 mb-1">AI Summary</div>
                <p className="text-sm text-blue-800">{investigation.summary}</p>
              </div>
            )}
          </div>

          {onClose && (
            <button
              onClick={onClose}
              className="ml-4 p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </div>

      {/* Content tabs/sections */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full flex flex-col">
          {/* Section tabs */}
          <div className="flex-none border-b border-gray-200 bg-gray-50 px-6">
            <div className="flex gap-6">
              {[
                { id: 'incidents', label: 'Incidents', count: investigation.incidents.length },
                { id: 'timeline', label: 'Timeline', count: investigation.events.length },
                { id: 'evidence', label: 'Evidence', count: investigation.evidence.length },
                { id: 'actions', label: 'Actions', count: investigation.recommendedActions.length },
              ].map((section) => {
                const isExpanded = state.viewState.expandedSections.has(section.id);
                return (
                  <button
                    key={section.id}
                    onClick={() => toggleSection(section.id)}
                    className={`
                      py-3 px-1 border-b-2 font-medium text-sm transition-colors
                      ${isExpanded ? 'border-blue-600 text-blue-600' : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'}
                    `}
                  >
                    {section.label}
                    {section.count > 0 && (
                      <span className="ml-2 px-2 py-0.5 bg-gray-200 text-gray-700 rounded-full text-xs">
                        {section.count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Section content */}
          <div className="flex-1 overflow-y-auto">
            {/* Incidents */}
            {state.viewState.expandedSections.has('incidents') && (
              <div className="p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">
                  Security Incidents ({investigation.incidents.length})
                </h2>
                <div className="space-y-4">
                  {investigation.incidents.map((incident) => (
                    <IncidentCard
                      key={incident.id}
                      incident={incident}
                      expanded={expandedIncidents.has(incident.id)}
                      onToggle={() => toggleIncident(incident.id)}
                      onInvestigate={() => handleInvestigateIncident(incident.id)}
                    />
                  ))}
                </div>
              </div>
            )}

            {/* Timeline */}
            {state.viewState.expandedSections.has('timeline') && (
              <TimelineView
                events={investigation.events}
                incidents={investigation.incidents}
                onEventSelect={(event) => updateViewState({ selectedEvent: event })}
                onIncidentSelect={(incident) => updateViewState({ selectedIncident: incident })}
              />
            )}

            {/* Evidence */}
            {state.viewState.expandedSections.has('evidence') && (
              <div className="h-full">
                {investigation.evidence.length > 0 ? (
                  <EvidenceGallery
                    evidence={investigation.evidence}
                    onEvidenceSelect={(evidence) => updateViewState({ selectedEvidence: evidence })}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-gray-500">
                    <p>No evidence collected for this investigation</p>
                  </div>
                )}
              </div>
            )}

            {/* Actions */}
            {state.viewState.expandedSections.has('actions') && (
              <div className="p-6">
                <ActionChecklist
                  actions={investigation.recommendedActions}
                  onActionUpdate={(actionId, state) => {
                    console.log('Action updated:', actionId, state);
                  }}
                />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
