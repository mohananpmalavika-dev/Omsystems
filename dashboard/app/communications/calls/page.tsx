"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Phone, PhoneOff, Mic, MicOff, Volume2, Search, 
  Building2, User, Clock, CheckCircle2, XCircle, 
  PhoneMissed, AlertCircle, MessageSquare, RefreshCw,
  Radio, ChevronRight, Filter
} from 'lucide-react';
import { communicationAPI } from '@/services/communication-api';
import { useCommunicationSignaling } from '@/hooks/use-communication-signaling';
import { useWebRTCAudio } from '@/hooks/use-webrtc-audio';
import type { 
  BranchContact, 
  EmployeeContact, 
  CallSession,
  CommunicationPresence,
  CommunicationCallStatus 
} from '@/services/communication-api';
import type { CallInviteEvent, CallStatusEvent } from '@/hooks/use-communication-signaling';

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = 'directory' | 'history';
type SelectedContact = { type: 'BRANCH'; branch: BranchContact } | { type: 'EMPLOYEE'; employee: EmployeeContact } | null;

interface ActiveCall {
  session: CallSession;
  startTime: Date;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function getPresenceColor(presence: CommunicationPresence): string {
  switch (presence) {
    case 'ONLINE': return 'bg-green-500';
    case 'BUSY': return 'bg-yellow-500';
    case 'IN_CALL': return 'bg-blue-500';
    case 'OFFLINE': return 'bg-gray-400';
    default: return 'bg-gray-400';
  }
}

function getPresenceText(presence: CommunicationPresence): string {
  switch (presence) {
    case 'ONLINE': return 'Online';
    case 'BUSY': return 'Busy';
    case 'IN_CALL': return 'In Call';
    case 'OFFLINE': return 'Offline';
    default: return 'Unavailable';
  }
}

function getCallStatusColor(status: CommunicationCallStatus): string {
  switch (status) {
    case 'CONNECTED': return 'text-green-600';
    case 'RINGING': return 'text-blue-600';
    case 'MISSED': return 'text-red-600';
    case 'REJECTED': return 'text-orange-600';
    case 'FAILED': return 'text-red-600';
    default: return 'text-gray-600';
  }
}

function formatCallDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = seconds % 60;
  
  if (h > 0) {
    return `${h}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

function getCallStatusText(status: CommunicationCallStatus): string {
  switch (status) {
    case 'INITIATING': return 'Initiating...';
    case 'RINGING': return 'Ringing...';
    case 'CONNECTING': return 'Connecting...';
    case 'CONNECTED': return 'Connected';
    case 'RECONNECTING': return 'Reconnecting...';
    case 'REJECTED': return 'Call Rejected';
    case 'MISSED': return 'Missed Call';
    case 'CANCELLED': return 'Call Cancelled';
    case 'FAILED': return 'Call Failed';
    case 'ENDED': return 'Call Ended';
    default: return status;
  }
}

function getQualityText(quality?: 'GOOD' | 'DEGRADED' | 'POOR'): string {
  switch (quality) {
    case 'GOOD': return 'Good';
    case 'DEGRADED': return 'Degraded';
    case 'POOR': return 'Poor';
    default: return 'Unknown';
  }
}

function getQualityColor(quality?: 'GOOD' | 'DEGRADED' | 'POOR'): string {
  switch (quality) {
    case 'GOOD': return 'text-green-600';
    case 'DEGRADED': return 'text-yellow-600';
    case 'POOR': return 'text-red-600';
    default: return 'text-gray-600';
  }
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function CommunicationsCallsPage() {
  // State
  const [viewMode, setViewMode] = useState<ViewMode>('directory');
  const [branches, setBranches] = useState<BranchContact[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<SelectedContact>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  // Call state
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallInviteEvent | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  
  // Hooks
  const signaling = useCommunicationSignaling();
  const webrtc = useWebRTCAudio();
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  
  // ============================================================================
  // LOAD DIRECTORY
  // ============================================================================
  
  const loadDirectory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const data = await communicationAPI.getBranchDirectory();
      setBranches(data);
    } catch (err: any) {
      console.error('[Communications] Failed to load directory:', err);
      setError(err.message || 'Failed to load branch directory');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);
  
  // ============================================================================
  // LOAD CALL HISTORY
  // ============================================================================
  
  const loadCallHistory = useCallback(async () => {
    try {
      setHistoryLoading(true);
      const data = await communicationAPI.getCallHistory({ limit: 50 });
      setCallHistory(data.calls);
    } catch (err: any) {
      console.error('[Communications] Failed to load call history:', err);
    } finally {
      setHistoryLoading(false);
    }
  }, []);
  
  useEffect(() => {
    if (viewMode === 'history') {
      void loadCallHistory();
    }
  }, [viewMode, loadCallHistory]);
  
  // ============================================================================
  // WEBSOCKET EVENT HANDLERS
  // ============================================================================
  
  useEffect(() => {
    // Incoming call
    const unsubInvite = signaling.onCallInvite((event) => {
      console.log('[Communications] Incoming call:', event);
      if (event.direction === 'INBOUND') {
        setIncomingCall(event);
      }
    });
    
    // Call accepted
    const unsubAccepted = signaling.onCallAccepted((event) => {
      console.log('[Communications] Call accepted:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        setActiveCall(prev => prev ? {
          ...prev,
          session: { ...prev.session, status: 'CONNECTED' as CommunicationCallStatus }
        } : null);
      }
    });
    
    // Call accepted elsewhere (first-answer-wins)
    const unsubElsewhere = signaling.onCallAcceptedElsewhere((event) => {
      console.log('[Communications] Call accepted elsewhere:', event);
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
        // Show notification: "Call was answered on another device"
      }
    });
    
    // Call connected
    const unsubConnected = signaling.onCallConnected((event) => {
      console.log('[Communications] Call connected:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        setActiveCall(prev => prev ? {
          ...prev,
          session: { ...prev.session, status: 'CONNECTED' as CommunicationCallStatus }
        } : null);
      }
    });
    
    // Call ended
    const unsubEnded = signaling.onCallEnded((event) => {
      console.log('[Communications] Call ended:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        handleCallEnd();
      }
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });
    
    // Call rejected
    const unsubRejected = signaling.onCallRejected((event) => {
      console.log('[Communications] Call rejected:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        handleCallEnd();
      }
    });
    
    // Call cancelled
    const unsubCancelled = signaling.onCallCancelled((event) => {
      console.log('[Communications] Call cancelled:', event);
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });
    
    // Call failed
    const unsubFailed = signaling.onCallFailed((event) => {
      console.log('[Communications] Call failed:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        handleCallEnd();
        setError(event.endReason || 'Call failed');
      }
    });
    
    // Presence changed
    const unsubPresence = signaling.onPresenceChanged((event) => {
      console.log('[Communications] Presence changed:', event);
      // Update branch/employee presence in directory
      setBranches(prev => prev.map(branch => {
        if (event.entityType === 'BRANCH' && branch.branchId === event.entityId) {
          return { ...branch, presence: event.presence };
        }
        return {
          ...branch,
          employees: branch.employees.map(emp => {
            if (event.entityType === 'EMPLOYEE' && emp.employeeId === event.entityId) {
              return { ...emp, presence: event.presence };
            }
            return emp;
          })
        };
      }));
    });
    
    return () => {
      unsubInvite();
      unsubAccepted();
      unsubElsewhere();
      unsubConnected();
      unsubEnded();
      unsubRejected();
      unsubCancelled();
      unsubFailed();
      unsubPresence();
    };
  }, [signaling, activeCall, incomingCall]);
  
  // ============================================================================
  // CALL DURATION TIMER
  // ============================================================================
  
  useEffect(() => {
    if (activeCall && activeCall.session.status === 'CONNECTED') {
      durationIntervalRef.current = window.setInterval(() => {
        setCallDuration(prev => prev + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      setCallDuration(0);
    }
    
    return () => {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
      }
    };
  }, [activeCall]);
  
  // ============================================================================
  // CALL ACTIONS
  // ============================================================================
  
  const handleCallBranch = useCallback(async (branch: BranchContact) => {
    try {
      setError(null);
      
      // Request microphone permission first
      const permissionGranted = await webrtc.requestMicrophonePermission();
      if (!permissionGranted) {
        setError('Microphone permission required to make calls');
        return;
      }
      
      // Initiate call
      const session = await communicationAPI.callBranch(branch.branchId, 'VMS operator calling');
      setActiveCall({ session, startTime: new Date() });
      
    } catch (err: any) {
      console.error('[Communications] Failed to call branch:', err);
      setError(err.message || 'Failed to initiate call');
    }
  }, [webrtc]);
  
  const handleCallEmployee = useCallback(async (employee: EmployeeContact) => {
    try {
      setError(null);
      
      const permissionGranted = await webrtc.requestMicrophonePermission();
      if (!permissionGranted) {
        setError('Microphone permission required to make calls');
        return;
      }
      
      const session = await communicationAPI.callEmployee(employee.employeeId, 'VMS operator calling');
      setActiveCall({ session, startTime: new Date() });
      
    } catch (err: any) {
      console.error('[Communications] Failed to call employee:', err);
      setError(err.message || 'Failed to initiate call');
    }
  }, [webrtc]);
  
  const handleAcceptCall = useCallback(async () => {
    if (!incomingCall) return;
    
    try {
      setError(null);
      
      // Request microphone permission
      const permissionGranted = await webrtc.requestMicrophonePermission();
      if (!permissionGranted) {
        setError('Microphone permission required to accept calls');
        return;
      }
      
      // Accept call and get WebRTC credentials
      const { call, credentials } = await communicationAPI.acceptCall(incomingCall.callId);
      
      // Connect WebRTC
      await webrtc.connect(credentials, call.id);
      
      setActiveCall({ session: call, startTime: new Date() });
      setIncomingCall(null);
      
    } catch (err: any) {
      console.error('[Communications] Failed to accept call:', err);
      setError(err.message || 'Failed to accept call');
      setIncomingCall(null);
    }
  }, [incomingCall, webrtc]);
  
  const handleRejectCall = useCallback(async () => {
    if (!incomingCall) return;
    
    try {
      await communicationAPI.rejectCall(incomingCall.callId);
      setIncomingCall(null);
    } catch (err: any) {
      console.error('[Communications] Failed to reject call:', err);
      setIncomingCall(null);
    }
  }, [incomingCall]);
  
  const handleCancelCall = useCallback(async () => {
    if (!activeCall) return;
    
    try {
      await communicationAPI.cancelCall(activeCall.session.id);
      handleCallEnd();
    } catch (err: any) {
      console.error('[Communications] Failed to cancel call:', err);
      handleCallEnd();
    }
  }, [activeCall]);
  
  const handleEndCall = useCallback(async () => {
    if (!activeCall) return;
    
    try {
      await communicationAPI.endCall(activeCall.session.id);
      handleCallEnd();
    } catch (err: any) {
      console.error('[Communications] Failed to end call:', err);
      handleCallEnd();
    }
  }, [activeCall]);
  
  const handleCallEnd = useCallback(() => {
    webrtc.disconnect();
    setActiveCall(null);
    setCallDuration(0);
    
    // Reload call history
    if (viewMode === 'history') {
      void loadCallHistory();
    }
  }, [webrtc, viewMode, loadCallHistory]);
  
  // ============================================================================
  // PLAY REMOTE AUDIO
  // ============================================================================
  
  useEffect(() => {
    if (webrtc.remoteStream && audioRef.current) {
      audioRef.current.srcObject = webrtc.remoteStream;
      void audioRef.current.play().catch(err => {
        console.error('[Communications] Failed to play remote audio:', err);
      });
    }
  }, [webrtc.remoteStream]);
  
  // ============================================================================
  // FILTERED CONTACTS
  // ============================================================================
  
  const filteredBranches = branches.filter(branch => {
    if (!searchQuery.trim()) return true;
    const query = searchQuery.toLowerCase();
    return (
      branch.branchName.toLowerCase().includes(query) ||
      branch.branchCode?.toLowerCase().includes(query) ||
      branch.employees.some(emp => emp.employeeName.toLowerCase().includes(query))
    );
  });
  
  // ============================================================================
  // RENDER
  // ============================================================================
  
  return (
    <div className="communications-page">
      {/* Header */}
      <header className="comm-header">
        <div className="comm-brand">
          <Phone size={24} className="comm-icon" />
          <div>
            <h1>KryptoVision Communications</h1>
            <p>Branch and employee calling</p>
          </div>
        </div>
        
        <div className="comm-header-right">
          <div className={`service-status ${signaling.connected ? 'online' : 'offline'}`}>
            <Radio size={14} className={signaling.connected ? 'pulse' : ''} />
            <span>{signaling.connected ? 'Service Online' : 'Connecting...'}</span>
          </div>
          
          <button
            type="button"
            className="refresh-btn"
            onClick={() => void loadDirectory()}
            disabled={loading}
          >
            <RefreshCw size={14} className={loading ? 'spin' : ''} />
            Refresh
          </button>
        </div>
      </header>
      
      {/* View Mode Tabs */}
      <div className="view-tabs">
        <button
          type="button"
          className={`view-tab ${viewMode === 'directory' ? 'active' : ''}`}
          onClick={() => setViewMode('directory')}
        >
          <Building2 size={16} />
          Directory
        </button>
        <button
          type="button"
          className={`view-tab ${viewMode === 'history' ? 'active' : ''}`}
          onClick={() => setViewMode('history')}
        >
          <Clock size={16} />
          Call History
        </button>
      </div>
      
      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
          <button type="button" onClick={() => setError(null)}>
            <XCircle size={16} />
          </button>
        </div>
      )}
      
      {webrtc.error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{webrtc.error}</span>
        </div>
      )}
      
      <div className="comm-content">
        {viewMode === 'directory' ? (
          <>
            {/* Directory Sidebar */}
            <aside className="directory-sidebar">
              <div className="search-box">
                <Search size={16} />
                <input
                  type="text"
                  placeholder="Search branch, employee, code..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
              
              <div className="directory-list">
                {loading ? (
                  <div className="loading-state">
                    <RefreshCw size={24} className="spin" />
                    <p>Loading directory...</p>
                  </div>
                ) : filteredBranches.length === 0 ? (
                  <div className="empty-state">
                    <Building2 size={32} />
                    <p>No branches found</p>
                  </div>
                ) : (
                  filteredBranches.map(branch => (
                    <div key={branch.branchId} className="directory-group">
                      <button
                        type="button"
                        className={`branch-item ${selectedContact?.type === 'BRANCH' && selectedContact.branch.branchId === branch.branchId ? 'selected' : ''}`}
                        onClick={() => setSelectedContact({ type: 'BRANCH', branch })}
                      >
                        <div className="branch-info">
                          <div className="branch-header">
                            <Building2 size={16} />
                            <span className="branch-name">{branch.branchName}</span>
                          </div>
                          {branch.branchCode && (
                            <span className="branch-code">{branch.branchCode}</span>
                          )}
                        </div>
                        
                        <div className="presence-indicator">
                          <span className={`presence-dot ${getPresenceColor(branch.presence)}`} />
                          <span className="device-count">
                            {branch.onlineDeviceCount}/{branch.totalDeviceCount}
                          </span>
                        </div>
                      </button>
                      
                      {branch.employees.length > 0 && (
                        <div className="employee-list">
                          {branch.employees.map(employee => (
                            <button
                              key={employee.employeeId}
                              type="button"
                              className={`employee-item ${selectedContact?.type === 'EMPLOYEE' && selectedContact.employee.employeeId === employee.employeeId ? 'selected' : ''}`}
                              onClick={() => setSelectedContact({ type: 'EMPLOYEE', employee })}
                            >
                              <div className="employee-info">
                                <User size={14} />
                                <div>
                                  <span className="employee-name">{employee.employeeName}</span>
                                  {employee.role && (
                                    <span className="employee-role">{employee.role}</span>
                                  )}
                                </div>
                              </div>
                              
                              <span className={`presence-dot ${getPresenceColor(employee.presence)}`} />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  ))
                )}
              </div>
            </aside>
            
            {/* Contact Details Panel */}
            <main className="contact-panel">
              {selectedContact ? (
                selectedContact.type === 'BRANCH' ? (
                  <div className="contact-details">
                    <div className="contact-header">
                      <Building2 size={32} className="contact-icon" />
                      <div>
                        <h2>{selectedContact.branch.branchName}</h2>
                        {selectedContact.branch.branchCode && (
                          <p className="contact-subtitle">Code: {selectedContact.branch.branchCode}</p>
                        )}
                      </div>
                    </div>
                    
                    <div className="presence-status">
                      <span className={`presence-dot ${getPresenceColor(selectedContact.branch.presence)}`} />
                      <span>{getPresenceText(selectedContact.branch.presence)}</span>
                      <span className="device-info">
                        {selectedContact.branch.onlineDeviceCount} of {selectedContact.branch.totalDeviceCount} devices online
                      </span>
                    </div>
                    
                    <div className="contact-actions">
                      <button
                        type="button"
                        className="call-btn primary"
                        onClick={() => handleCallBranch(selectedContact.branch)}
                        disabled={selectedContact.branch.presence === 'OFFLINE' || !!activeCall}
                      >
                        <Phone size={20} />
                        Call Branch
                      </button>
                      
                      <button
                        type="button"
                        className="message-btn"
                        disabled={!!activeCall}
                      >
                        <MessageSquare size={20} />
                        Message
                      </button>
                    </div>
                    
                    {selectedContact.branch.employees.length > 0 && (
                      <div className="employees-section">
                        <h3>Employees</h3>
                        <div className="employee-cards">
                          {selectedContact.branch.employees.map(employee => (
                            <div key={employee.employeeId} className="employee-card">
                              <div className="employee-card-header">
                                <User size={16} />
                                <div>
                                  <strong>{employee.employeeName}</strong>
                                  {employee.role && <span>{employee.role}</span>}
                                </div>
                                <span className={`presence-dot ${getPresenceColor(employee.presence)}`} />
                              </div>
                              
                              <div className="employee-card-actions">
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => handleCallEmployee(employee)}
                                  disabled={employee.presence === 'OFFLINE' || !!activeCall}
                                >
                                  <Phone size={14} />
                                  Call
                                </button>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  disabled={!!activeCall}
                                >
                                  <MessageSquare size={14} />
                                  Message
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : (
                  <div className="contact-details">
                    <div className="contact-header">
                      <User size={32} className="contact-icon" />
                      <div>
                        <h2>{selectedContact.employee.employeeName}</h2>
                        {selectedContact.employee.role && (
                          <p className="contact-subtitle">{selectedContact.employee.role}</p>
                        )}
                        <p className="contact-subtitle">{selectedContact.employee.branchName}</p>
                      </div>
                    </div>
                    
                    <div className="presence-status">
                      <span className={`presence-dot ${getPresenceColor(selectedContact.employee.presence)}`} />
                      <span>{getPresenceText(selectedContact.employee.presence)}</span>
                    </div>
                    
                    <div className="contact-actions">
                      <button
                        type="button"
                        className="call-btn primary"
                        onClick={() => handleCallEmployee(selectedContact.employee)}
                        disabled={selectedContact.employee.presence === 'OFFLINE' || !!activeCall}
                      >
                        <Phone size={20} />
                        Call Employee
                      </button>
                      
                      <button
                        type="button"
                        className="message-btn"
                        disabled={!!activeCall}
                      >
                        <MessageSquare size={20} />
                        Message
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="empty-selection">
                  <Building2 size={48} />
                  <h3>Select a branch or employee</h3>
                  <p>Choose from the directory to view details and make calls</p>
                </div>
              )}
            </main>
          </>
        ) : (
          /* Call History */
          <main className="history-panel">
            <div className="history-header">
              <h2>Call History</h2>
              <button
                type="button"
                className="refresh-btn"
                onClick={() => void loadCallHistory()}
                disabled={historyLoading}
              >
                <RefreshCw size={14} className={historyLoading ? 'spin' : ''} />
                Refresh
              </button>
            </div>
            
            {historyLoading ? (
              <div className="loading-state">
                <RefreshCw size={24} className="spin" />
                <p>Loading call history...</p>
              </div>
            ) : callHistory.length === 0 ? (
              <div className="empty-state">
                <Clock size={32} />
                <p>No call history</p>
              </div>
            ) : (
              <div className="history-table">
                <table>
                  <thead>
                    <tr>
                      <th>Time</th>
                      <th>Branch/Employee</th>
                      <th>Direction</th>
                      <th>Status</th>
                      <th>Duration</th>
                      <th>Quality</th>
                    </tr>
                  </thead>
                  <tbody>
                    {callHistory.map(call => (
                      <tr key={call.id}>
                        <td>
                          <Clock size={14} />
                          {new Date(call.createdAt).toLocaleString()}
                        </td>
                        <td>
                          {call.direction === 'OUTBOUND' ? (
                            <>
                              {call.targetBranchId && (
                                <div className="call-participant">
                                  <Building2 size={14} />
                                  <span>{call.targetBranchName || call.targetBranchId}</span>
                                </div>
                              )}
                              {call.targetEmployeeId && (
                                <div className="call-participant">
                                  <User size={14} />
                                  <span>{call.targetEmployeeName || call.targetEmployeeId}</span>
                                </div>
                              )}
                            </>
                          ) : (
                            <>
                              {call.sourceBranchId && (
                                <div className="call-participant">
                                  <Building2 size={14} />
                                  <span>{call.sourceBranchName || call.sourceBranchId}</span>
                                </div>
                              )}
                              {call.sourceEmployeeId && (
                                <div className="call-participant">
                                  <User size={14} />
                                  <span>{call.sourceEmployeeName || call.sourceEmployeeId}</span>
                                </div>
                              )}
                            </>
                          )}
                        </td>
                        <td>
                          <span className={`direction-badge ${call.direction.toLowerCase()}`}>
                            {call.direction === 'INBOUND' ? '← Incoming' : '→ Outgoing'}
                          </span>
                        </td>
                        <td>
                          <span className={`status-badge ${getCallStatusColor(call.status)}`}>
                            {call.status === 'CONNECTED' && <CheckCircle2 size={14} />}
                            {call.status === 'MISSED' && <PhoneMissed size={14} />}
                            {call.status === 'REJECTED' && <XCircle size={14} />}
                            {call.status === 'FAILED' && <AlertCircle size={14} />}
                            {getCallStatusText(call.status)}
                          </span>
                        </td>
                        <td>
                          {call.duration ? formatCallDuration(call.duration) : '-'}
                        </td>
                        <td>
                          {call.quality && (
                            <span className={getQualityColor(call.quality)}>
                              {getQualityText(call.quality)}
                            </span>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </main>
        )}
      </div>
      
      {/* Active Call Overlay */}
      {activeCall && (
        <div className="call-overlay">
          <div className="call-card">
            <div className="call-card-header">
              <div className="call-info">
                {activeCall.session.targetBranchId && (
                  <>
                    <Building2 size={24} />
                    <div>
                      <h3>{activeCall.session.targetBranchName || 'Branch'}</h3>
                      <p className="call-subtitle">Branch call</p>
                    </div>
                  </>
                )}
                {activeCall.session.targetEmployeeId && (
                  <>
                    <User size={24} />
                    <div>
                      <h3>{activeCall.session.targetEmployeeName || 'Employee'}</h3>
                      <p className="call-subtitle">{activeCall.session.targetBranchName}</p>
                    </div>
                  </>
                )}
              </div>
              
              <div className="call-status-indicator">
                <span className={`status-dot ${activeCall.session.status === 'CONNECTED' ? 'connected' : 'ringing'}`} />
                <span>{getCallStatusText(activeCall.session.status)}</span>
              </div>
            </div>
            
            <div className="call-duration">
              {activeCall.session.status === 'CONNECTED' ? (
                <span className="duration-text">{formatCallDuration(callDuration)}</span>
              ) : activeCall.session.status === 'RINGING' ? (
                <span className="ringing-text">Ringing...</span>
              ) : (
                <span className="connecting-text">{getCallStatusText(activeCall.session.status)}</span>
              )}
            </div>
            
            {activeCall.session.status === 'CONNECTED' && (
              <>
                <div className="call-controls">
                  <button
                    type="button"
                    className={`control-btn ${webrtc.microphoneEnabled ? 'active' : 'muted'}`}
                    onClick={() => webrtc.toggleMute()}
                  >
                    {webrtc.microphoneEnabled ? <Mic size={20} /> : <MicOff size={20} />}
                    <span>{webrtc.microphoneEnabled ? 'Mute' : 'Unmute'}</span>
                  </button>
                  
                  <button
                    type="button"
                    className="control-btn active"
                  >
                    <Volume2 size={20} />
                    <span>Speaker</span>
                  </button>
                </div>
                
                {webrtc.quality && (
                  <div className="call-quality">
                    <span>Connection Quality:</span>
                    <span className={getQualityColor(
                      webrtc.quality.rtt && webrtc.quality.rtt < 150 ? 'GOOD' :
                      webrtc.quality.rtt && webrtc.quality.rtt < 300 ? 'DEGRADED' : 'POOR'
                    )}>
                      {webrtc.quality.rtt && webrtc.quality.rtt < 150 ? 'GOOD' :
                       webrtc.quality.rtt && webrtc.quality.rtt < 300 ? 'DEGRADED' : 'POOR'}
                    </span>
                    {webrtc.quality.rtt && (
                      <span className="quality-detail">RTT: {webrtc.quality.rtt.toFixed(0)}ms</span>
                    )}
                  </div>
                )}
              </>
            )}
            
            <button
              type="button"
              className="end-call-btn"
              onClick={activeCall.session.status === 'CONNECTED' ? handleEndCall : handleCancelCall}
            >
              <PhoneOff size={20} />
              {activeCall.session.status === 'CONNECTED' ? 'End Call' : 'Cancel'}
            </button>
          </div>
        </div>
      )}
      
      {/* Incoming Call Modal */}
      {incomingCall && !activeCall && (
        <div className="incoming-call-modal">
          <div className="incoming-call-card">
            <h2>Incoming Call</h2>
            
            <div className="caller-info">
              {incomingCall.sourceBranchId && (
                <>
                  <Building2 size={48} />
                  <h3>{incomingCall.sourceBranchName || 'Branch'}</h3>
                  {incomingCall.sourceEmployeeId && (
                    <p>{incomingCall.sourceEmployeeName}</p>
                  )}
                </>
              )}
            </div>
            
            <div className="incoming-call-actions">
              <button
                type="button"
                className="reject-btn"
                onClick={handleRejectCall}
              >
                <PhoneOff size={20} />
                Decline
              </button>
              
              <button
                type="button"
                className="accept-btn"
                onClick={handleAcceptCall}
              >
                <Phone size={20} />
                Accept
              </button>
            </div>
          </div>
        </div>
      )}
      
      {/* Hidden audio element for remote stream */}
      <audio ref={audioRef} autoPlay playsInline />
      
      <style jsx>{`
        .communications-page {
          display: flex;
          flex-direction: column;
          height: calc(100vh - 80px);
          background: var(--canvas);
          color: var(--ink);
        }
        
        .comm-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 24px;
          border-bottom: 1px solid var(--line);
          background: var(--surface);
        }
        
        .comm-brand {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .comm-icon {
          color: var(--blue-dark);
        }
        
        .comm-brand h1 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
          color: var(--ink);
        }
        
        .comm-brand p {
          margin: 2px 0 0;
          font-size: 13px;
          color: var(--muted);
        }
        
        .comm-header-right {
          display: flex;
          align-items: center;
          gap: 12px;
        }
        
        .service-status {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 13px;
          font-weight: 600;
        }
        
        .service-status.online {
          background: rgba(34, 197, 94, 0.1);
          color: #22c55e;
        }
        
        .service-status.offline {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
        }
        
        .service-status .pulse {
          animation: pulse 2s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .refresh-btn {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 14px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: var(--surface);
          color: var(--blue-dark);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .refresh-btn:hover:not(:disabled) {
          background: var(--blue-soft);
          border-color: var(--blue);
        }
        
        .refresh-btn:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        
        .refresh-btn .spin {
          animation: spin 1s linear infinite;
        }
        
        @keyframes spin {
          to { transform: rotate(360deg); }
        }
        
        .view-tabs {
          display: flex;
          gap: 4px;
          padding: 12px 24px;
          border-bottom: 1px solid var(--line);
          background: var(--surface);
        }
        
        .view-tab {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 16px;
          border: 1px solid transparent;
          border-radius: 6px;
          background: transparent;
          color: var(--muted);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .view-tab:hover {
          background: var(--surface-soft);
          color: var(--ink);
        }
        
        .view-tab.active {
          background: var(--blue-soft);
          color: var(--blue-dark);
          border-color: var(--blue);
        }
        
        .error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 24px;
          background: rgba(239, 68, 68, 0.1);
          border-bottom: 1px solid rgba(239, 68, 68, 0.3);
          color: #ef4444;
          font-size: 13px;
        }
        
        .error-banner button {
          margin-left: auto;
          background: transparent;
          border: none;
          color: #ef4444;
          cursor: pointer;
          padding: 4px;
        }
        
        .comm-content {
          display: flex;
          flex: 1;
          min-height: 0;
          overflow: hidden;
        }
        
        .directory-sidebar {
          width: 320px;
          border-right: 1px solid var(--line);
          background: var(--surface);
          display: flex;
          flex-direction: column;
          overflow: hidden;
        }
        
        .search-box {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          border-bottom: 1px solid var(--line);
        }
        
        .search-box input {
          flex: 1;
          padding: 8px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: var(--canvas);
          color: var(--ink);
          font-size: 13px;
        }
        
        .directory-list {
          flex: 1;
          overflow-y: auto;
          padding: 8px;
        }
        
        .directory-group {
          margin-bottom: 4px;
        }
        
        .branch-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 10px 12px;
          border: 1px solid var(--line);
          border-radius: 6px;
          background: var(--surface);
          color: var(--ink);
          font-size: 13px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .branch-item:hover {
          background: var(--surface-soft);
          border-color: var(--blue);
        }
        
        .branch-item.selected {
          background: var(--blue-soft);
          border-color: var(--blue);
        }
        
        .branch-info {
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        
        .branch-header {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .branch-name {
          font-weight: 600;
        }
        
        .branch-code {
          font-size: 11px;
          color: var(--muted);
        }
        
        .presence-indicator {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .presence-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .device-count {
          font-size: 11px;
          color: var(--muted);
          font-family: monospace;
        }
        
        .employee-list {
          padding-left: 24px;
          margin-top: 4px;
          display: flex;
          flex-direction: column;
          gap: 2px;
        }
        
        .employee-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 8px 10px;
          border: 1px solid transparent;
          border-radius: 4px;
          background: transparent;
          color: var(--ink);
          font-size: 12px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .employee-item:hover {
          background: var(--surface-soft);
          border-color: var(--line);
        }
        
        .employee-item.selected {
          background: var(--blue-soft);
          border-color: var(--blue);
        }
        
        .employee-info {
          display: flex;
          align-items: flex-start;
          gap: 6px;
        }
        
        .employee-name {
          display: block;
          font-weight: 600;
        }
        
        .employee-role {
          display: block;
          font-size: 11px;
          color: var(--muted);
        }
        
        .contact-panel, .history-panel {
          flex: 1;
          padding: 24px;
          overflow-y: auto;
        }
        
        .contact-details {
          max-width: 600px;
        }
        
        .contact-header {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        
        .contact-icon {
          color: var(--blue-dark);
        }
        
        .contact-header h2 {
          margin: 0;
          font-size: 24px;
          font-weight: 700;
          color: var(--ink);
        }
        
        .contact-subtitle {
          margin: 4px 0 0;
          font-size: 14px;
          color: var(--muted);
        }
        
        .presence-status {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 16px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
          margin-bottom: 16px;
          font-size: 14px;
        }
        
        .device-info {
          margin-left: auto;
          font-size: 12px;
          color: var(--muted);
        }
        
        .contact-actions {
          display: flex;
          gap: 12px;
          margin-bottom: 24px;
        }
        
        .call-btn, .message-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 12px 24px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--surface);
          color: var(--ink);
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .call-btn.primary {
          background: var(--blue);
          color: white;
          border-color: var(--blue);
        }
        
        .call-btn.primary:hover:not(:disabled) {
          background: var(--blue-dark);
        }
        
        .call-btn:disabled, .message-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .employees-section {
          margin-top: 24px;
        }
        
        .employees-section h3 {
          margin: 0 0 12px;
          font-size: 16px;
          font-weight: 600;
          color: var(--ink);
        }
        
        .employee-cards {
          display: flex;
          flex-direction: column;
          gap: 8px;
        }
        
        .employee-card {
          padding: 12px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 8px;
        }
        
        .employee-card-header {
          display: flex;
          align-items: center;
          gap: 8px;
          margin-bottom: 8px;
        }
        
        .employee-card-header strong {
          flex: 1;
          font-size: 14px;
        }
        
        .employee-card-header span {
          font-size: 12px;
          color: var(--muted);
        }
        
        .employee-card-actions {
          display: flex;
          gap: 8px;
        }
        
        .mini-btn {
          display: flex;
          align-items: center;
          gap: 4px;
          padding: 6px 12px;
          border: 1px solid var(--line);
          border-radius: 4px;
          background: var(--surface-soft);
          color: var(--ink);
          font-size: 12px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .mini-btn:hover:not(:disabled) {
          background: var(--blue-soft);
          border-color: var(--blue);
          color: var(--blue-dark);
        }
        
        .mini-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .empty-selection {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          height: 100%;
          color: var(--muted);
          text-align: center;
        }
        
        .empty-selection h3 {
          margin: 16px 0 8px;
          font-size: 18px;
          color: var(--ink);
        }
        
        .loading-state, .empty-state {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 48px 24px;
          color: var(--muted);
        }
        
        .loading-state p, .empty-state p {
          margin-top: 12px;
          font-size: 14px;
        }
        
        .history-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          margin-bottom: 24px;
        }
        
        .history-header h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
        }
        
        .history-table {
          overflow-x: auto;
        }
        
        .history-table table {
          width: 100%;
          border-collapse: collapse;
        }
        
        .history-table th {
          padding: 12px;
          text-align: left;
          font-size: 12px;
          font-weight: 600;
          color: var(--muted);
          border-bottom: 2px solid var(--line);
        }
        
        .history-table td {
          padding: 12px;
          font-size: 13px;
          border-bottom: 1px solid var(--line);
        }
        
        .call-participant {
          display: flex;
          align-items: center;
          gap: 6px;
        }
        
        .direction-badge {
          display: inline-flex;
          align-items: center;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
        }
        
        .direction-badge.inbound {
          background: rgba(59, 130, 246, 0.1);
          color: #3b82f6;
        }
        
        .direction-badge.outbound {
          background: rgba(139, 92, 246, 0.1);
          color: #8b5cf6;
        }
        
        .status-badge {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          font-weight: 600;
        }
        
        .call-overlay {
          position: fixed;
          inset: 0;
          z-index: 1000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.8);
          backdrop-filter: blur(4px);
        }
        
        .call-card {
          width: min(100%, 400px);
          padding: 32px 24px;
          background: var(--surface);
          border: 1px solid var(--line);
          border-radius: 16px;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.4);
        }
        
        .call-card-header {
          margin-bottom: 24px;
        }
        
        .call-info {
          display: flex;
          align-items: center;
          gap: 16px;
          margin-bottom: 12px;
        }
        
        .call-info h3 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
        }
        
        .call-subtitle {
          margin: 4px 0 0;
          font-size: 14px;
          color: var(--muted);
        }
        
        .call-status-indicator {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 8px 12px;
          background: var(--surface-soft);
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
        }
        
        .status-dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;
        }
        
        .status-dot.connected {
          background: #22c55e;
          box-shadow: 0 0 8px #22c55e;
        }
        
        .status-dot.ringing {
          background: #3b82f6;
          animation: pulse 2s ease-in-out infinite;
        }
        
        .call-duration {
          text-align: center;
          margin-bottom: 24px;
        }
        
        .duration-text {
          font-size: 48px;
          font-weight: 700;
          font-family: monospace;
          color: var(--ink);
        }
        
        .ringing-text, .connecting-text {
          font-size: 18px;
          color: var(--muted);
        }
        
        .call-controls {
          display: flex;
          justify-content: center;
          gap: 16px;
          margin-bottom: 16px;
        }
        
        .control-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 6px;
          padding: 16px 24px;
          border: 1px solid var(--line);
          border-radius: 12px;
          background: var(--surface-soft);
          color: var(--muted);
          font-size: 13px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .control-btn:hover {
          background: var(--blue-soft);
          border-color: var(--blue);
          color: var(--blue-dark);
        }
        
        .control-btn.active {
          background: var(--blue-soft);
          border-color: var(--blue);
          color: var(--blue-dark);
        }
        
        .control-btn.muted {
          background: rgba(239, 68, 68, 0.1);
          border-color: rgba(239, 68, 68, 0.3);
          color: #ef4444;
        }
        
        .call-quality {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          margin-bottom: 16px;
          font-size: 13px;
        }
        
        .quality-detail {
          color: var(--muted);
          font-size: 12px;
        }
        
        .end-call-btn {
          width: 100%;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px;
          border: none;
          border-radius: 12px;
          background: #ef4444;
          color: white;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .end-call-btn:hover {
          background: #dc2626;
        }
        
        .incoming-call-modal {
          position: fixed;
          inset: 0;
          z-index: 2000;
          display: flex;
          align-items: center;
          justify-content: center;
          background: rgba(0, 0, 0, 0.9);
          backdrop-filter: blur(8px);
        }
        
        .incoming-call-card {
          width: min(100%, 360px);
          padding: 32px 24px;
          background: var(--surface);
          border: 2px solid var(--blue);
          border-radius: 16px;
          text-align: center;
          box-shadow: 0 20px 60px rgba(0, 0, 0, 0.5);
        }
        
        .incoming-call-card h2 {
          margin: 0 0 24px;
          font-size: 18px;
          font-weight: 700;
          color: var(--ink);
        }
        
        .caller-info {
          margin-bottom: 32px;
        }
        
        .caller-info h3 {
          margin: 16px 0 4px;
          font-size: 24px;
          font-weight: 700;
          color: var(--ink);
        }
        
        .caller-info p {
          margin: 0;
          font-size: 14px;
          color: var(--muted);
        }
        
        .incoming-call-actions {
          display: flex;
          gap: 12px;
        }
        
        .reject-btn, .accept-btn {
          flex: 1;
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 8px;
          padding: 14px;
          border: none;
          border-radius: 12px;
          font-size: 16px;
          font-weight: 700;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .reject-btn {
          background: rgba(239, 68, 68, 0.1);
          color: #ef4444;
          border: 2px solid rgba(239, 68, 68, 0.3);
        }
        
        .reject-btn:hover {
          background: rgba(239, 68, 68, 0.2);
          border-color: #ef4444;
        }
        
        .accept-btn {
          background: #22c55e;
          color: white;
        }
        
        .accept-btn:hover {
          background: #16a34a;
        }
        
        @media (max-width: 768px) {
          .comm-content {
            flex-direction: column;
          }
          
          .directory-sidebar {
            width: 100%;
            max-height: 40vh;
            border-right: none;
            border-bottom: 1px solid var(--line);
          }
          
          .contact-panel {
            max-height: 60vh;
          }
          
          .history-table {
            font-size: 12px;
          }
          
          .history-table th,
          .history-table td {
            padding: 8px;
          }
        }
      `}</style>
    </div>
  );
}
