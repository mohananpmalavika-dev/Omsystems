/**
 * Live Activity Status Component
 * Shows currently active employees and what they're doing in real-time
 */

'use client';

import { useEffect, useState, useCallback } from 'react';
import { 
  Activity, 
  AlertCircle, 
  Camera, 
  Clock, 
  MonitorPlay, 
  RefreshCw, 
  User, 
  Users 
} from 'lucide-react';

interface ActiveUser {
  user_id: string;
  user_name: string;
  user_display_name: string;
  tenant_id: string;
  session_id: string;
  is_online: boolean;
  current_page_path: string;
  current_module: string;
  current_activity: string;
  is_in_control_room: boolean;
  current_branch_id: string | null;
  current_branch_name: string | null;
  current_branch_group: string | null;
  monitoring_camera_count: number;
  last_activity_time: string;
  page_entered_time: string;
}

interface LiveActivityStatusProps {
  apiBaseUrl?: string;
  refreshInterval?: number; // milliseconds
  maxUsers?: number;
}

export function LiveActivityStatus({
  apiBaseUrl = '/api/control',
  refreshInterval = 30000, // 30 seconds
  maxUsers = 20,
}: LiveActivityStatusProps) {
  const [activeUsers, setActiveUsers] = useState<ActiveUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchActiveUsers = useCallback(async () => {
    try {
      const token = sessionStorage.getItem('activityAccessToken') || 
                    localStorage.getItem('accessToken');
      
      if (!token) {
        setError('Not authenticated');
        setLoading(false);
        return;
      }

      const response = await fetch(`${apiBaseUrl}/v1/activity/current`, {
        method: 'GET',
        headers: {
          'x-sentinel-session': token,
        },
        credentials: 'include',
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch active users: ${response.status}`);
      }

      const data = await response.json();
      setActiveUsers(data.data || []);
      setLastUpdate(new Date());
      setError(null);
    } catch (err) {
      console.error('[LiveActivityStatus] Error fetching active users:', err);
      setError(err instanceof Error ? err.message : 'Failed to load active users');
    } finally {
      setLoading(false);
    }
  }, [apiBaseUrl]);

  useEffect(() => {
    // Initial fetch
    fetchActiveUsers();

    // Set up polling
    const interval = setInterval(fetchActiveUsers, refreshInterval);

    return () => clearInterval(interval);
  }, [fetchActiveUsers, refreshInterval]);

  const getTimeAgo = (timestamp: string): string => {
    const now = new Date();
    const then = new Date(timestamp);
    const seconds = Math.floor((now.getTime() - then.getTime()) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getModuleIcon = (module: string) => {
    if (module === 'control_room') return MonitorPlay;
    if (module === 'incidents') return AlertCircle;
    if (module === 'camera_management') return Camera;
    return Activity;
  };

  const formatModuleName = (module: string): string => {
    return module.replace(/_/g, ' ').replace(/\b\w/g, (l) => l.toUpperCase());
  };

  if (loading && activeUsers.length === 0) {
    return (
      <div className="live-activity-loading">
        <RefreshCw className="spin" size={24} />
        <p>Loading active users...</p>
      </div>
    );
  }

  if (error && activeUsers.length === 0) {
    return (
      <div className="live-activity-error">
        <AlertCircle size={24} />
        <p>{error}</p>
        <button onClick={fetchActiveUsers}>Try Again</button>
      </div>
    );
  }

  const onlineUsers = activeUsers.filter(u => u.is_online);
  const displayUsers = onlineUsers.slice(0, maxUsers);

  return (
    <div className="live-activity-status">
      <div className="live-activity-header">
        <div className="live-activity-title">
          <Users size={20} />
          <h3>Active Operators</h3>
          <span className="live-activity-count">{onlineUsers.length}</span>
        </div>
        <div className="live-activity-meta">
          {lastUpdate && (
            <span className="last-update">
              <Clock size={14} />
              Updated {getTimeAgo(lastUpdate.toISOString())}
            </span>
          )}
          <button
            className="refresh-button"
            onClick={fetchActiveUsers}
            aria-label="Refresh active users"
            disabled={loading}
          >
            <RefreshCw size={16} className={loading ? 'spin' : ''} />
          </button>
        </div>
      </div>

      {onlineUsers.length === 0 ? (
        <div className="live-activity-empty">
          <User size={32} />
          <p>No active operators right now</p>
          <small>Activity tracking updates every 30 seconds</small>
        </div>
      ) : (
        <div className="live-activity-list">
          {displayUsers.map((user) => {
            const ModuleIcon = getModuleIcon(user.current_module);
            
            return (
              <div key={user.user_id} className="active-user-card">
                <div className="user-card-header">
                  <div className="user-avatar">
                    {user.user_display_name.substring(0, 2).toUpperCase()}
                  </div>
                  <div className="user-info">
                    <strong>{user.user_display_name}</strong>
                    <span className="user-username">@{user.user_name}</span>
                  </div>
                  <div className="online-indicator" title="Online">
                    <span className="pulse" />
                  </div>
                </div>

                <div className="user-card-activity">
                  {user.is_in_control_room ? (
                    <>
                      <div className="activity-icon control-room">
                        <MonitorPlay size={16} />
                      </div>
                      <div className="activity-details">
                        <p className="activity-primary">
                          {user.current_activity || 'In Control Room'}
                        </p>
                        {user.current_branch_name && (
                          <span className="activity-secondary">
                            {user.current_branch_name}
                          </span>
                        )}
                        {user.monitoring_camera_count > 0 && (
                          <span className="activity-meta">
                            <Camera size={12} />
                            {user.monitoring_camera_count} cameras
                          </span>
                        )}
                      </div>
                    </>
                  ) : (
                    <>
                      <div className="activity-icon">
                        <ModuleIcon size={16} />
                      </div>
                      <div className="activity-details">
                        <p className="activity-primary">
                          {formatModuleName(user.current_module)}
                        </p>
                        <span className="activity-secondary">
                          {user.current_page_path}
                        </span>
                      </div>
                    </>
                  )}
                </div>

                <div className="user-card-footer">
                  <span className="activity-time">
                    <Clock size={12} />
                    {getTimeAgo(user.last_activity_time)}
                  </span>
                  {user.page_entered_time && (
                    <span className="page-duration">
                      On page for {getTimeAgo(user.page_entered_time)}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
          
          {onlineUsers.length > maxUsers && (
            <div className="more-users-notice">
              <Users size={16} />
              <span>+{onlineUsers.length - maxUsers} more operators active</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
