/**
 * Branch Operational Timeline
 * 
 * Shows recent operational events:
 * - Camera status changes
 * - Recording failures
 * - HDD warnings
 * - Network failover
 * - Alerts created/acknowledged
 */

'use client';

import React, { useState, useEffect } from 'react';
import { BranchOperationalEvent } from '@/types/branch-operational-snapshot';
import {
  VideoCameraIcon,
  CircleStackIcon,
  SignalIcon,
  ExclamationTriangleIcon,
  CheckCircleIcon,
  ClockIcon,
} from '@heroicons/react/24/outline';

interface BranchOperationalTimelineProps {
  branchId: string;
}

export function BranchOperationalTimeline({ branchId }: BranchOperationalTimelineProps) {
  const [events, setEvents] = useState<BranchOperationalEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    fetchEvents();
  }, [branchId]);

  const fetchEvents = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/api/v1/branches/${branchId}/events?limit=20`,
        { credentials: 'include' }
      );

      if (!response.ok) {
        throw new Error('Failed to fetch events');
      }

      const result = await response.json();
      if (result.success) {
        setEvents(result.data.events || []);
      }
    } catch (err) {
      console.error('Error fetching events:', err);
    } finally {
      setLoading(false);
    }
  };

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'CAMERA_STATUS_CHANGED':
        return <VideoCameraIcon className="h-5 w-5" />;
      case 'RECORDING_STATUS_CHANGED':
        return <VideoCameraIcon className="h-5 w-5" />;
      case 'STORAGE_STATUS_CHANGED':
        return <CircleStackIcon className="h-5 w-5" />;
      case 'NETWORK_STATUS_CHANGED':
        return <SignalIcon className="h-5 w-5" />;
      case 'ALERT_CREATED':
        return <ExclamationTriangleIcon className="h-5 w-5" />;
      case 'ALERT_ACKNOWLEDGED':
      case 'ALERT_RESOLVED':
        return <CheckCircleIcon className="h-5 w-5" />;
      default:
        return <ClockIcon className="h-5 w-5" />;
    }
  };

  const getSeverityColor = (severity: string) => {
    switch (severity) {
      case 'CRITICAL':
        return 'text-red-600 bg-red-50 dark:bg-red-900/20';
      case 'HIGH':
        return 'text-orange-600 bg-orange-50 dark:bg-orange-900/20';
      case 'WARNING':
        return 'text-yellow-600 bg-yellow-50 dark:bg-yellow-900/20';
      default:
        return 'text-blue-600 bg-blue-50 dark:bg-blue-900/20';
    }
  };

  const formatTimeAgo = (date: string) => {
    const now = new Date();
    const eventDate = new Date(date);
    const diffMs = now.getTime() - eventDate.getTime();
    const diffMinutes = Math.floor(diffMs / 60000);

    if (diffMinutes < 1) return 'Just now';
    if (diffMinutes < 60) return `${diffMinutes} min ago`;
    
    const diffHours = Math.floor(diffMinutes / 60);
    if (diffHours < 24) return `${diffHours} hr ago`;
    
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} days ago`;
  };

  const displayEvents = showAll ? events : events.slice(0, 10);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Branch Events
        </h2>
        <div className="text-center py-8">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      </div>
    );
  }

  if (events.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
          Recent Branch Events
        </h2>
        <div className="text-center py-8 text-gray-500 dark:text-gray-400">
          No recent events
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm border border-gray-200 dark:border-gray-700">
      <div className="border-b border-gray-200 dark:border-gray-700 px-6 py-4">
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          Recent Branch Events
        </h2>
      </div>

      <div className="p-6">
        <div className="space-y-3">
          {displayEvents.map((event) => (
            <div
              key={event.id}
              className="flex items-start gap-3 p-3 bg-gray-50 dark:bg-gray-700/50 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {/* Icon */}
              <div className={`flex-shrink-0 p-2 rounded-lg ${getSeverityColor(event.severity)}`}>
                {getEventIcon(event.type)}
              </div>

              {/* Content */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between gap-2 mb-1">
                  <p className="text-sm font-medium text-gray-900 dark:text-white">
                    {event.title}
                  </p>
                  <span
                    className={`flex-shrink-0 inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold ${getSeverityColor(
                      event.severity
                    )}`}
                  >
                    {event.severity}
                  </span>
                </div>

                {event.description && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {event.description}
                  </p>
                )}

                <div className="flex items-center gap-3 text-xs text-gray-500 dark:text-gray-400">
                  <span>{formatTimeAgo(event.occurredAt)}</span>
                  {event.cameraName && (
                    <>
                      <span>•</span>
                      <span>{event.cameraName}</span>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Show More Button */}
        {events.length > 10 && (
          <div className="mt-4 text-center">
            <button
              onClick={() => setShowAll(!showAll)}
              className="text-sm text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {showAll ? 'Show Less' : `Show All (${events.length} events)`}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
