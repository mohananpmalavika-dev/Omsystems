/**
 * Session Timeline View
 * 
 * Visual timeline showing the progression of a cash van session
 * with state transitions, events, and violations
 */

import React, { useState, useEffect } from 'react';
import {
  CheckCircle,
  Circle,
  AlertTriangle,
  Clock,
  Users,
  Truck,
  Package,
  DoorOpen,
} from 'lucide-react';

interface TimelineFrame {
  timestamp: Date;
  frameNumber: number;
  sessionState: string;
  vehicle?: {
    trackId: string;
    plate?: string;
    zone?: string;
  };
  personnel: Array<{
    trackId: string;
    identityId?: string;
    name?: string;
    zone?: string;
  }>;
  transferObjects: Array<{
    trackId: string;
    type: string;
    zone?: string;
    carriedBy?: string;
  }>;
  events: Array<{
    type: string;
    description: string;
  }>;
  violations: string[];
}

interface SessionTimelineViewProps {
  sessionId: string;
}

export const SessionTimelineView: React.FC<SessionTimelineViewProps> = ({
  sessionId,
}) => {
  const [frames, setFrames] = useState<TimelineFrame[]>([]);
  const [loading, setLoading] = useState(false);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    loadTimeline();
  }, [sessionId]);

  useEffect(() => {
    if (!playing || frames.length === 0) return;

    const interval = setInterval(() => {
      setCurrentFrame((prev) => {
        if (prev >= frames.length - 1) {
          setPlaying(false);
          return prev;
        }
        return prev + 1;
      });
    }, 1000); // 1 frame per second

    return () => clearInterval(interval);
  }, [playing, frames.length]);

  const loadTimeline = async () => {
    try {
      setLoading(true);
      const response = await fetch(
        `/v1/banking/sessions/${sessionId}/replay?fps=1`
      );
      const data = await response.json();
      setFrames(data.data.frames || []);
    } catch (error) {
      console.error('Failed to load timeline:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
        <p className="text-gray-600 mt-4">Loading timeline...</p>
      </div>
    );
  }

  if (frames.length === 0) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <p className="text-gray-600">No timeline data available</p>
      </div>
    );
  }

  const frame = frames[currentFrame] ?? frames[0];
  const firstFrame = frames[0];
  const lastFrame = frames[frames.length - 1];
  const firstTimestamp = firstFrame?.timestamp;
  const lastTimestamp = lastFrame?.timestamp;

  if (!frame || !firstFrame || !lastFrame) {
    return (
      <div className="bg-white rounded-lg shadow-sm p-6 text-center">
        <p className="text-gray-600">No timeline data available</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm">
      {/* Timeline Header */}
      <div className="p-6 border-b border-gray-200">
        <h3 className="text-lg font-bold text-gray-900 mb-2">Session Timeline</h3>
        <p className="text-sm text-gray-600">
          Frame {currentFrame + 1} of {frames.length}
        </p>
      </div>

      {/* Playback Controls */}
      <div className="p-6 border-b border-gray-200">
        <div className="flex items-center gap-4">
          <button
            onClick={() => setPlaying(!playing)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            {playing ? 'Pause' : 'Play'}
          </button>
          <button
            onClick={() => setCurrentFrame(Math.max(0, currentFrame - 1))}
            disabled={currentFrame === 0}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Previous
          </button>
          <button
            onClick={() =>
              setCurrentFrame(Math.min(frames.length - 1, currentFrame + 1))
            }
            disabled={currentFrame === frames.length - 1}
            className="px-4 py-2 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 disabled:opacity-50"
          >
            Next
          </button>
        </div>

        {/* Timeline Scrubber */}
        <div className="mt-4">
          <input
            type="range"
            min="0"
            max={frames.length - 1}
            value={currentFrame}
            onChange={(e) => setCurrentFrame(parseInt(e.target.value))}
            className="w-full"
          />
          <div className="flex justify-between text-xs text-gray-600 mt-2">
            <span>{firstTimestamp ? new Date(firstTimestamp).toLocaleTimeString() : ''}</span>
            <span>
              {lastTimestamp ? new Date(lastTimestamp).toLocaleTimeString() : ''}
            </span>
          </div>
        </div>
      </div>

      {/* Current Frame Details */}
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* State */}
          <div>
            <h4 className="text-sm font-semibold text-gray-700 mb-3">State</h4>
            <div className="p-4 bg-blue-50 rounded-lg">
              <p className="text-lg font-medium text-blue-900">
                {frame.sessionState.replace('_', ' ').toUpperCase()}
              </p>
              <p className="text-sm text-gray-600 mt-1">
                {new Date(frame.timestamp).toLocaleString()}
              </p>
            </div>
          </div>

          {/* Vehicle */}
          {frame.vehicle && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Truck className="w-4 h-4" />
                Vehicle
              </h4>
              <div className="p-4 bg-gray-50 rounded-lg">
                <p className="font-medium text-gray-900">
                  {frame.vehicle.plate || 'Unknown'}
                </p>
                {frame.vehicle.zone && (
                  <p className="text-sm text-gray-600 mt-1">
                    Zone: {frame.vehicle.zone}
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Personnel */}
          {frame.personnel.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Users className="w-4 h-4" />
                Personnel ({frame.personnel.length})
              </h4>
              <div className="space-y-2">
                {frame.personnel.slice(0, 3).map((person, index) => (
                  <div key={index} className="p-3 bg-gray-50 rounded-lg">
                    <p className="text-sm font-medium text-gray-900">
                      {person.name || `Person ${index + 1}`}
                    </p>
                    {person.zone && (
                      <p className="text-xs text-gray-600">Zone: {person.zone}</p>
                    )}
                  </div>
                ))}
                {frame.personnel.length > 3 && (
                  <p className="text-xs text-gray-500 text-center">
                    +{frame.personnel.length - 3} more
                  </p>
                )}
              </div>
            </div>
          )}

          {/* Transfer Objects */}
          {frame.transferObjects.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
                <Package className="w-4 h-4" />
                Transfer Objects ({frame.transferObjects.length})
              </h4>
              <div className="space-y-2">
                {frame.transferObjects.map((obj, index) => (
                  <div key={index} className="p-3 bg-purple-50 rounded-lg">
                    <p className="text-sm font-medium text-purple-900">
                      {obj.type}
                    </p>
                    {obj.zone && (
                      <p className="text-xs text-gray-600">Zone: {obj.zone}</p>
                    )}
                    {obj.carriedBy && (
                      <p className="text-xs text-gray-600">
                        Carried by: {obj.carriedBy}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Events at this frame */}
        {frame.events.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3">
              Events at this moment
            </h4>
            <ul className="space-y-2">
              {frame.events.map((event, index) => (
                <li
                  key={index}
                  className="p-3 bg-green-50 border border-green-200 rounded-lg"
                >
                  <p className="text-sm text-green-900">{event.description}</p>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Violations at this frame */}
        {frame.violations.length > 0 && (
          <div className="mt-6">
            <h4 className="text-sm font-semibold text-gray-700 mb-3 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-red-600" />
              Active Violations
            </h4>
            <ul className="space-y-2">
              {frame.violations.map((violation, index) => (
                <li
                  key={index}
                  className="p-3 bg-red-50 border border-red-200 rounded-lg"
                >
                  <p className="text-sm text-red-900 font-medium">{violation}</p>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
};

export default SessionTimelineView;
