/**
 * Timeline View Component
 * Visual chronological display of security events and incidents
 */

import React, { useMemo, useState } from 'react';
import type { TimelineViewProps } from '../types/ui-types';
import type { SecurityEvent, SecurityIncident } from '../../types';
import {
  formatTimestamp,
  getSeverityColor,
  formatEventType,
  formatAssetId,
} from '../utils/formatters';

interface TimelineItem {
  id: string;
  type: 'event' | 'incident';
  timestamp: Date;
  severity: number;
  title: string;
  description: string;
  assetId?: string;
  eventType: string;
  data: SecurityEvent | SecurityIncident;
}

export function TimelineView({
  events,
  incidents = [],
  onEventSelect,
  onIncidentSelect,
  filter,
  className,
}: TimelineViewProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Combine and sort events and incidents
  const timelineItems = useMemo<TimelineItem[]>(() => {
    const items: TimelineItem[] = [];

    // Add events
    events.forEach((event) => {
      items.push({
        id: event.id,
        type: 'event',
        timestamp: new Date(event.timestamp),
        severity: event.severity,
        title: formatEventType(event.eventType),
        description: event.description || '',
        assetId: event.assetId,
        eventType: event.eventType,
        data: event,
      });
    });

    // Add incidents
    incidents.forEach((incident) => {
      items.push({
        id: incident.id,
        type: 'incident',
        timestamp: new Date(incident.timestamp),
        severity: incident.severity,
        title: incident.title,
        description: incident.description,
        eventType: incident.incidentType,
        data: incident,
      });
    });

    // Apply filters
    let filtered = items;
    if (filter) {
      if (filter.eventTypes && filter.eventTypes.length > 0) {
        filtered = filtered.filter((item) => filter.eventTypes!.includes(item.eventType));
      }
      if (filter.severityMin !== undefined) {
        filtered = filtered.filter((item) => item.severity >= filter.severityMin!);
      }
      if (filter.searchText) {
        const search = filter.searchText.toLowerCase();
        filtered = filtered.filter(
          (item) =>
            item.title.toLowerCase().includes(search) ||
            item.description.toLowerCase().includes(search) ||
            (item.assetId && item.assetId.toLowerCase().includes(search))
        );
      }
      if (filter.startTime) {
        filtered = filtered.filter((item) => item.timestamp >= filter.startTime!);
      }
      if (filter.endTime) {
        filtered = filtered.filter((item) => item.timestamp <= filter.endTime!);
      }
    }

    // Sort by timestamp (newest first)
    return filtered.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime());
  }, [events, incidents, filter]);

  // Group by time periods (day)
  const groupedItems = useMemo(() => {
    const groups = new Map<string, TimelineItem[]>();

    timelineItems.forEach((item) => {
      const dateKey = item.timestamp.toLocaleDateString('en-US', {
        weekday: 'short',
        month: 'short',
        day: 'numeric',
        year: 'numeric',
      });

      if (!groups.has(dateKey)) {
        groups.set(dateKey, []);
      }
      groups.get(dateKey)!.push(item);
    });

    return Array.from(groups.entries());
  }, [timelineItems]);

  const handleItemClick = (item: TimelineItem) => {
    setSelectedId(item.id);

    if (item.type === 'event') {
      onEventSelect?.(item.data as SecurityEvent);
    } else {
      onIncidentSelect?.(item.data as SecurityIncident);
    }
  };

  if (timelineItems.length === 0) {
    return (
      <div className={`flex items-center justify-center h-full text-gray-500 ${className || ''}`}>
        <div className="text-center">
          <svg
            className="w-16 h-16 mx-auto mb-4 text-gray-300"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
            />
          </svg>
          <p className="text-lg font-medium">No events or incidents found</p>
          <p className="text-sm mt-1">Try adjusting your filters or time range</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`overflow-y-auto ${className || ''}`}>
      <div className="space-y-8 p-6">
        {groupedItems.map(([dateKey, items]) => (
          <div key={dateKey}>
            {/* Date header */}
            <div className="sticky top-0 bg-white z-10 pb-3 border-b border-gray-200">
              <h3 className="text-lg font-semibold text-gray-900">{dateKey}</h3>
              <p className="text-sm text-gray-500">{items.length} items</p>
            </div>

            {/* Timeline items */}
            <div className="relative mt-6">
              {/* Vertical line */}
              <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-200"></div>

              {/* Items */}
              <div className="space-y-4">
                {items.map((item, index) => {
                  const severityColor = getSeverityColor(item.severity);
                  const isSelected = selectedId === item.id;

                  return (
                    <div key={item.id} className="relative pl-12">
                      {/* Timeline dot */}
                      <div
                        className="absolute left-2 top-2 w-4 h-4 rounded-full border-2 border-white"
                        style={{ backgroundColor: severityColor }}
                      ></div>

                      {/* Item card */}
                      <div
                        onClick={() => handleItemClick(item)}
                        className={`
                          bg-white border rounded-lg p-4 cursor-pointer
                          transition-all hover:shadow-md
                          ${isSelected ? 'ring-2 ring-blue-500 shadow-md' : 'border-gray-200'}
                        `}
                      >
                        {/* Item header */}
                        <div className="flex items-start justify-between mb-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-1">
                              <span
                                className={`
                                  text-xs px-2 py-0.5 rounded font-medium
                                  ${item.type === 'incident' ? 'bg-red-100 text-red-700' : 'bg-blue-100 text-blue-700'}
                                `}
                              >
                                {item.type.toUpperCase()}
                              </span>
                              <span className="text-sm font-semibold text-gray-900">{item.title}</span>
                            </div>
                            <p className="text-sm text-gray-600">{item.description}</p>
                          </div>
                          <div className="ml-4 text-xs text-gray-500 whitespace-nowrap">
                            {formatTimestamp(item.timestamp)}
                          </div>
                        </div>

                        {/* Item metadata */}
                        <div className="flex flex-wrap items-center gap-3 text-xs">
                          {item.assetId && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Asset:</span>
                              <span className="text-gray-700 font-medium">
                                {formatAssetId(item.assetId)}
                              </span>
                            </div>
                          )}
                          <div className="flex items-center gap-1">
                            <span className="text-gray-500">Severity:</span>
                            <span className="font-medium" style={{ color: severityColor }}>
                              {item.severity}
                            </span>
                          </div>
                          {item.type === 'incident' && (
                            <div className="flex items-center gap-1">
                              <span className="text-gray-500">Events:</span>
                              <span className="text-gray-700">
                                {(item.data as SecurityIncident).events.length}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
