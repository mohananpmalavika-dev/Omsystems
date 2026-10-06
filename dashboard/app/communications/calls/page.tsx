"use client";

import { CallWorkspace } from '@/components/communications/call-workspace';
import { MediaDeviceCheck } from '@/components/communications/media-device-check';
import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Phone, PhoneOff, Search,
  Building2, User, Clock, CheckCircle2, XCircle, 
  PhoneMissed, AlertCircle, MessageSquare, RefreshCw,
  Radio, ChevronRight, Filter, Video, VideoOff, ScreenShare,
  Shield, Users
} from 'lucide-react';
import { communicationAPI } from '@/services/communication-api';
import { useCommunicationSignaling } from '@/hooks/use-communication-signaling';
import { useDirectMessages } from '@/hooks/use-direct-messages';
import { useWebRTCCall, type CallModality } from '@/hooks/use-webrtc-call';
import type { 
  BranchContact, 
  EmployeeContact, 
  CommunicationEmployee,
  CallSession,
  WebRTCCredentials,
  CommunicationPresence,
  CommunicationCallStatus 
} from '@/services/communication-api';
import type { CallInviteEvent } from '@/hooks/use-communication-signaling';

// ============================================================================
// TYPES
// ============================================================================

type ViewMode = 'directory' | 'history';
type DirectoryScope = 'all' | 'internal' | 'branches';
type SelectedContact = 
  | { type: 'BRANCH'; branch: BranchContact } 
  | { type: 'EMPLOYEE'; employee: EmployeeContact } 
  | { type: 'INTERNAL_USER'; user: CommunicationEmployee } 
  | null;

interface ActiveCall {
  session: CallSession;
  startTime: Date;
  modality?: CallModality;
  credentials: WebRTCCredentials;
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
  const [directoryScope, setDirectoryScope] = useState<DirectoryScope>('all');
  const [branches, setBranches] = useState<BranchContact[]>([]);
  const [internalUsers, setInternalUsers] = useState<CommunicationEmployee[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedContact, setSelectedContact] = useState<SelectedContact>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callStarting, setCallStarting] = useState(false);
  const startingCallRef = useRef(false);
  
  // Call state
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const offeredCallRef = useRef<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallInviteEvent | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [callHistory, setCallHistory] = useState<CallSession[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [directMessageText, setDirectMessageText] = useState('');
  
  // Hooks
  const signaling = useCommunicationSignaling();
  const webrtc = useWebRTCCall();
  const messageContactType = selectedContact?.type === 'BRANCH' ? 'BRANCH'
    : selectedContact?.type === 'INTERNAL_USER' ? 'OPERATOR'
    : selectedContact?.type === 'EMPLOYEE' ? 'DEVICE' : undefined;
  const messageContactId = selectedContact?.type === 'BRANCH' ? selectedContact.branch.branchId
    : selectedContact?.type === 'INTERNAL_USER' ? selectedContact.user.employeeId
    : selectedContact?.type === 'EMPLOYEE' ? selectedContact.employee.deviceId : undefined;
  const { directMessages, messagesError, messageRouteMissing, messagesLoading, loadDirectMessages } =
    useDirectMessages(messageContactType, messageContactId, signaling.onMessageCreated);
  
  // Refs
  const durationIntervalRef = useRef<number | null>(null);

  // Detect logged-in user to identify own station
  useEffect(() => {
    if (typeof window !== 'undefined') {
      try {
        const stored = localStorage.getItem('user') || sessionStorage.getItem('user');
        if (stored) {
          const parsed = JSON.parse(stored);
          if (parsed?.id) setCurrentUserId(parsed.id);
        }
      } catch {}
    }
  }, []);

  // ============================================================================
  // LOAD DIRECTORY
  // ============================================================================
  
  const loadDirectory = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [branchResult, employeeResult] = await Promise.allSettled([
        communicationAPI.getBranchDirectory(),
        communicationAPI.getEmployeeDirectory(),
      ]);
      if (branchResult.status === 'fulfilled') setBranches(branchResult.value);
      else console.error('[Communications] Failed to load branch directory:', branchResult.reason);
      if (employeeResult.status === 'fulfilled') setInternalUsers(employeeResult.value.data || []);
      else console.error('[Communications] Failed to load internal users:', employeeResult.reason);
      if (branchResult.status === 'rejected' || employeeResult.status === 'rejected') {
        setError('The calling directory is unavailable. Please refresh to retry.');
      }
    } catch (err: any) {
      console.error('[Communications] Failed to load directory:', err);
      setError(err.message || 'Failed to load directory');
    } finally {
      setLoading(false);
    }
  }, []);
  
  useEffect(() => {
    void loadDirectory();
  }, [loadDirectory]);

  const handleSendDirectMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedContact || !directMessageText.trim()) return;
    const target = selectedContact.type === 'BRANCH'
      ? { type: 'BRANCH' as const, id: selectedContact.branch.branchId }
      : selectedContact.type === 'INTERNAL_USER'
        ? { type: 'OPERATOR' as const, id: selectedContact.user.employeeId }
        : { type: 'DEVICE' as const, id: selectedContact.employee.deviceId };
    if (!target.id) { setError('Select a registered device to message'); return; }
    try {
      await communicationAPI.sendDirectMessage(target.type, target.id, directMessageText.trim());
      setDirectMessageText('');
      await loadDirectMessages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Message could not be sent');
    }
  };
  
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
        void signaling.joinCall(event.callId).catch(() => setError('Unable to join secure call signaling'));
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
    const unsubMediaReady = signaling.onCallMediaReady((event) => {
      const currentCall = activeCallRef.current;
      if (currentCall && event.callId === currentCall.session.id && offeredCallRef.current !== event.callId) {
        offeredCallRef.current = event.callId;
        void (async () => {
          const offer = await webrtc.createOffer(currentCall.credentials, currentCall.modality || 'audio', (candidate) => signaling.sendWebRtcIceCandidate(event.callId, candidate));
          if (offer) signaling.sendWebRtcOffer(event.callId, offer);
        })().catch(() => setError('Unable to start call media'));
      }
    });

    const unsubOffer = signaling.onWebRtcOffer((event) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || currentCall.session.id !== event.callId || !event.description) return;
      void (async () => {
        const answer = await webrtc.createAnswer(currentCall.credentials, event.description!, currentCall.modality || 'audio', (candidate) => signaling.sendWebRtcIceCandidate(event.callId, candidate));
        if (answer) signaling.sendWebRtcAnswer(event.callId, answer);
      })().catch(() => setError('Unable to answer call media'));
    });
    const unsubAnswer = signaling.onWebRtcAnswer((event) => {
      if (activeCallRef.current?.session.id === event.callId && event.description) void webrtc.applyAnswer(event.description).catch(() => setError('Unable to complete call media negotiation'));
    });
    const unsubIce = signaling.onWebRtcIceCandidate((event) => {
      if (activeCallRef.current?.session.id === event.callId && event.candidate) void webrtc.addIceCandidate(event.candidate).catch(() => setError('Unable to apply call network candidate'));
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
      setInternalUsers(prev => prev.map(user => {
        if (user.employeeId === event.entityId) {
          return { ...user, presence: event.presence };
        }
        return user;
      }));
    });
    
    return () => {
      unsubInvite();
      unsubMediaReady();
      unsubOffer();
      unsubAnswer();
      unsubIce();
      unsubAccepted();
      unsubElsewhere();
      unsubConnected();
      unsubEnded();
      unsubRejected();
      unsubCancelled();
      unsubFailed();
      unsubPresence();
    };
  }, [signaling, activeCall, incomingCall, currentUserId, webrtc]);
  
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
  
  const handleCallBranch = useCallback(async (branch: BranchContact, modality: CallModality = 'audio') => {
    if (startingCallRef.current || activeCallRef.current) return;
    startingCallRef.current = true; setCallStarting(true);
    let startedCallId: string | null = null;
    try {
      setError(null);
      if (modality === 'screenshare' && !(await webrtc.startScreenShare())) return;
      const stream = await webrtc.initializeMedia({
        audio: true,
        video: modality === 'video',
      });
      if (!stream) { webrtc.disconnect(); return; }
      
      const started = await communicationAPI.callBranch(branch.branchId, 'VMS operator calling');
      startedCallId = started.call.id;
      const nextCall = { session: started.call, credentials: started.credentials, startTime: new Date(), modality };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      await signaling.joinCall(started.call.id);

    } catch (err: any) {
      webrtc.disconnect();
      activeCallRef.current = null; setActiveCall(null);
      if (startedCallId) void communicationAPI.cancelCall(startedCallId).catch(() => {});
      console.error('[Communications] Failed to call branch:', err);
      setError(err.message || 'Failed to initiate call');
    } finally { startingCallRef.current = false; setCallStarting(false); }
  }, [webrtc, signaling]);
  
  const handleCallEmployee = useCallback(async (
    target: { employeeId: string; deviceId?: string; employeeName?: string; branchName?: string; role?: string; employeeRole?: string },
    modality: CallModality = 'audio'
  ) => {
    if (startingCallRef.current || activeCallRef.current) return;
    startingCallRef.current = true; setCallStarting(true);
    let startedCallId: string | null = null;
    try {
      setError(null);
      if (modality === 'screenshare' && !(await webrtc.startScreenShare())) return;
      const stream = await webrtc.initializeMedia({
        audio: true,
        video: modality === 'video',
      });
      if (!stream) { webrtc.disconnect(); return; }
      
      const started = target.deviceId
        ? await communicationAPI.callRegisteredDevice(target.deviceId)
        : await communicationAPI.callEmployee(target.employeeId, 'VMS operator calling');
      startedCallId = started.call.id;
      const session = started.call;
      const enhancedSession: CallSession = {
        ...session,
        targetEmployeeId: target.employeeId,
        targetEmployeeName: target.employeeName || session.targetEmployeeName || 'Internal VMS Operator',
        targetBranchName: target.branchName || session.targetBranchName || (target.role || target.employeeRole ? `SOC (${target.role || target.employeeRole})` : 'Central SOC'),
      };
      const nextCall = { session: enhancedSession, credentials: started.credentials, startTime: new Date(), modality };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      await signaling.joinCall(started.call.id);

    } catch (err: any) {
      webrtc.disconnect();
      activeCallRef.current = null; setActiveCall(null);
      if (startedCallId) void communicationAPI.cancelCall(startedCallId).catch(() => {});
      console.error('[Communications] Failed to call operator/employee:', err);
      setError(err.message || 'Failed to initiate call');
    } finally { startingCallRef.current = false; setCallStarting(false); }
  }, [webrtc, signaling]);
  
  const handleAcceptCall = useCallback(async (modality: CallModality = 'video') => {
    if (!incomingCall || startingCallRef.current || activeCallRef.current) return;
    startingCallRef.current = true; setCallStarting(true);
    let acceptedCallId: string | null = null;
    
    try {
      setError(null);
      const stream = await webrtc.initializeMedia({ audio: true, video: modality === 'video' });
      if (!stream) return;
      const { call, credentials } = await communicationAPI.acceptCall(incomingCall.callId);
      acceptedCallId = call.id;
      
      const nextCall = { session: call, credentials, startTime: new Date(), modality };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      await signaling.joinCall(call.id);
      signaling.sendCallMediaReady(call.id);
      setIncomingCall(null);
    } catch (err: any) {
      webrtc.disconnect();
      activeCallRef.current = null; setActiveCall(null);
      if (acceptedCallId) void communicationAPI.endCall(acceptedCallId).catch(() => {});
      console.error('[Communications] Failed to accept call:', err);
      setError(err.message || 'Failed to accept call');
      setIncomingCall(null);
    } finally { startingCallRef.current = false; setCallStarting(false); }
  }, [incomingCall, webrtc, signaling]);
  
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
    activeCallRef.current = null;
    offeredCallRef.current = null;
    setActiveCall(null);
    setCallDuration(0);
    
    // Reload call history
    if (viewMode === 'history') {
      void loadCallHistory();
    }
  }, [webrtc, viewMode, loadCallHistory]);
  
  const query = searchQuery.trim().toLowerCase();

  const filteredInternalUsers = internalUsers.filter(user => {
    if (!query) return true;
    return (
      user.employeeName.toLowerCase().includes(query) ||
      (user.employeeRole && user.employeeRole.toLowerCase().includes(query)) ||
      (user.branchName && user.branchName.toLowerCase().includes(query))
    );
  });

  const filteredBranches = branches.filter(branch => {
    if (!query) return true;
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
      <header className="comm-header workspace-heading">
        <div className="comm-brand">
          <Phone size={24} className="comm-icon" />
          <div>
            <h1>Communications</h1>
            <p>Connect with your team, wherever they work</p>
          </div>
        </div>
        
        <div className="comm-header-right">
          <MediaDeviceCheck disabled={callStarting || !!activeCall} />
          <div className={`service-status ${signaling.connected ? 'online' : 'offline'}`}>
            <Radio size={14} className={signaling.connected ? 'pulse' : ''} />
            <span>{signaling.connected ? 'Service Online' : 'Calling Offline'}</span>
          </div>
          
          <button
            type="button"
            className="refresh-btn"
            onClick={() => { void loadDirectory(); void loadDirectMessages(); }}
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
                  placeholder="Search operator, branch, role..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>

              <div className="directory-scope-tabs">
                <button
                  type="button"
                  className={`scope-pill ${directoryScope === 'all' ? 'active' : ''}`}
                  onClick={() => setDirectoryScope('all')}
                >
                  All ({filteredInternalUsers.length + filteredBranches.length})
                </button>
                <button
                  type="button"
                  className={`scope-pill ${directoryScope === 'internal' ? 'active' : ''}`}
                  onClick={() => setDirectoryScope('internal')}
                >
                  <Shield size={12} />
                  VMS Operators ({filteredInternalUsers.length})
                </button>
                <button
                  type="button"
                  className={`scope-pill ${directoryScope === 'branches' ? 'active' : ''}`}
                  onClick={() => setDirectoryScope('branches')}
                >
                  <Building2 size={12} />
                  Branches ({filteredBranches.length})
                </button>
              </div>
              
              <div className="directory-list">
                {loading ? (
                  <div className="loading-state">
                    <RefreshCw size={24} className="spin" />
                    <p>Loading directory...</p>
                  </div>
                ) : filteredBranches.length === 0 && filteredInternalUsers.length === 0 ? (
                  <div className="empty-state">
                    <Building2 size={32} />
                    <p>No contacts found</p>
                  </div>
                ) : (
                  <>
                    {/* Internal VMS Operators Section */}
                    {(directoryScope === 'all' || directoryScope === 'internal') && filteredInternalUsers.length > 0 && (
                      <div className="directory-section">
                        <div className="directory-section-header">
                          <Shield size={13} style={{ color: '#38bdf8' }} />
                          <span>Internal VMS Operators / SOC Team</span>
                          <span className="count-badge">{filteredInternalUsers.length}</span>
                        </div>

                        {filteredInternalUsers.map(user => {
                          const isSelf = currentUserId && user.employeeId === currentUserId;
                          const isSelected = selectedContact?.type === 'INTERNAL_USER' && selectedContact.user.employeeId === user.employeeId;
                          return (
                            <div
                              key={`vms-user-${user.employeeId}`}
                              className={`internal-user-item ${isSelected ? 'selected' : ''}`}
                            >
                              <button type="button" className="user-item-main" onClick={() => setSelectedContact({ type: 'INTERNAL_USER', user })} aria-pressed={isSelected}>
                                <div className="user-avatar-wrap">
                                  <Shield size={15} />
                                  <span className={`presence-dot ${getPresenceColor(user.presence)}`} />
                                </div>
                                <div className="user-details">
                                  <div className="user-name-row">
                                    <span className="user-name">{user.employeeName}</span>
                                    {isSelf && <span className="self-tag">You</span>}
                                  </div>
                                  <span className="user-role">{user.employeeRole || 'VMS Operator'}</span>
                                </div>
                              </button>

                              <div className="quick-actions" onClick={e => e.stopPropagation()}>
                                <button
                                  type="button"
                                  className="quick-icon-btn"
                                  title="Video Call"
                                  onClick={() => handleCallEmployee(user, 'video')}
                                  disabled={Boolean(isSelf) || user.presence === 'OFFLINE' || !!activeCall || callStarting}
                                >
                                  <Video size={13} />
                                </button>
                                <button
                                  type="button"
                                  className="quick-icon-btn"
                                  title="Voice Call"
                                  onClick={() => handleCallEmployee(user, 'audio')}
                                  disabled={Boolean(isSelf) || user.presence === 'OFFLINE' || !!activeCall || callStarting}
                                >
                                  <Phone size={13} />
                                </button>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}

                    {/* Branches Section */}
                    {(directoryScope === 'all' || directoryScope === 'branches') && (
                      <div className="directory-section">
                        {directoryScope === 'all' && (
                          <div className="directory-section-header" style={{ marginTop: '12px' }}>
                            <Building2 size={13} style={{ color: '#94a3b8' }} />
                            <span>Branches & Site Kiosks</span>
                            <span className="count-badge">{filteredBranches.length}</span>
                          </div>
                        )}
                        {filteredBranches.map(branch => (
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
                        ))}
                      </div>
                    )}
                  </>
                )}
              </div>
            </aside>
            
            {/* Contact Details Panel */}
            <main className="contact-panel">
              <div className="panel-kicker">TEAM WORKSPACE <span>Calls & messages</span></div>
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
                        style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff' }}
                        onClick={() => handleCallBranch(selectedContact.branch, 'video')}
                        disabled={selectedContact.branch.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start HD Video Call"
                      >
                        <Video size={18} />
                        Video Call
                      </button>

                      <button
                        type="button"
                        className="call-btn primary"
                        onClick={() => handleCallBranch(selectedContact.branch, 'audio')}
                        disabled={selectedContact.branch.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start Voice Call"
                      >
                        <Phone size={18} />
                        Voice Call
                      </button>

                      <button
                        type="button"
                        className="call-btn primary"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff' }}
                        onClick={() => handleCallBranch(selectedContact.branch, 'screenshare')}
                        disabled={selectedContact.branch.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start Call with Screen Sharing"
                      >
                        <ScreenShare size={18} />
                        Share Screen
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
                                  style={{ color: '#38bdf8' }}
                                  onClick={() => handleCallEmployee(employee, 'video')}
                                  disabled={employee.presence === 'OFFLINE' || !!activeCall || callStarting}
                                  title="Video Call"
                                >
                                  <Video size={13} />
                                  Video
                                </button>
                                <button
                                  type="button"
                                  className="mini-btn"
                                  onClick={() => handleCallEmployee(employee, 'audio')}
                                  disabled={employee.presence === 'OFFLINE' || !!activeCall || callStarting}
                                  title="Voice Call"
                                >
                                  <Phone size={13} />
                                  Voice
                                </button>
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                ) : selectedContact.type === 'INTERNAL_USER' ? (
                  <div className="contact-details">
                    <div className="contact-header">
                      <div className="operator-icon-badge">
                        <Shield size={32} />
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <h2>{selectedContact.user.employeeName}</h2>
                          {currentUserId === selectedContact.user.employeeId && (
                            <span className="self-tag-large">Your Station</span>
                          )}
                        </div>
                        <p className="contact-subtitle">
                          {selectedContact.user.employeeRole || 'Internal VMS Operator'} • Command Center SOC
                        </p>
                      </div>
                    </div>

                    <div className="presence-status">
                      <span className={`presence-dot ${getPresenceColor(selectedContact.user.presence)}`} />
                      <span>{getPresenceText(selectedContact.user.presence)}</span>
                      <span className="device-info">Internal SOC Direct Extension</span>
                    </div>

                    <div className="contact-actions">
                      <button
                        type="button"
                        className="call-btn primary"
                        style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff' }}
                        onClick={() => handleCallEmployee(selectedContact.user, 'video')}
                        disabled={currentUserId === selectedContact.user.employeeId || selectedContact.user.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start HD Video Call"
                      >
                        <Video size={18} />
                        Video Call
                      </button>

                      <button
                        type="button"
                        className="call-btn primary"
                        onClick={() => handleCallEmployee(selectedContact.user, 'audio')}
                        disabled={currentUserId === selectedContact.user.employeeId || selectedContact.user.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start Voice Call"
                      >
                        <Phone size={18} />
                        Voice Call
                      </button>

                      <button
                        type="button"
                        className="call-btn primary"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff' }}
                        onClick={() => handleCallEmployee(selectedContact.user, 'screenshare')}
                        disabled={currentUserId === selectedContact.user.employeeId || selectedContact.user.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start Call with Screen Sharing"
                      >
                        <ScreenShare size={18} />
                        Share Screen
                      </button>
                    </div>

                    <div className="operator-details-grid">
                      <div className="info-box">
                        <span className="label">Operator Role</span>
                        <span className="value">{selectedContact.user.employeeRole || 'SOC Operator'}</span>
                      </div>
                      <div className="info-box">
                        <span className="label">Location / Station</span>
                        <span className="value">Central SOC / {selectedContact.user.branchName || 'Command Center'}</span>
                      </div>
                      <div className="info-box">
                        <span className="label">Availability</span>
                        <span className="value">{getPresenceText(selectedContact.user.presence)}</span>
                      </div>
                      <div className="info-box">
                        <span className="label">Call Capabilities</span>
                        <span className="value">HD Video, Clear Voice, Screen Share</span>
                      </div>
                    </div>
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
                        style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff' }}
                        onClick={() => handleCallEmployee(selectedContact.employee, 'video')}
                        disabled={selectedContact.employee.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start HD Video Call"
                      >
                        <Video size={18} />
                        Video Call
                      </button>

                      <button
                        type="button"
                        className="call-btn primary"
                        onClick={() => handleCallEmployee(selectedContact.employee, 'audio')}
                        disabled={selectedContact.employee.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start Voice Call"
                      >
                        <Phone size={18} />
                        Voice Call
                      </button>

                      <button
                        type="button"
                        className="call-btn primary"
                        style={{ background: 'linear-gradient(135deg, #7c3aed, #6d28d9)', color: '#fff' }}
                        onClick={() => handleCallEmployee(selectedContact.employee, 'screenshare')}
                        disabled={selectedContact.employee.presence === 'OFFLINE' || !!activeCall || callStarting}
                        title="Start Call with Screen Sharing"
                      >
                        <ScreenShare size={18} />
                        Share Screen
                      </button>
                    </div>
                  </div>
                )
              ) : (
                <div className="empty-selection">
                  <Building2 size={48} />
                  <h3>Select a contact or branch</h3>
                  <p>Choose an internal VMS operator or branch to initiate calls</p>
                </div>
              )}
              <section className="message-thread" style={{ margin: '16px', padding: '16px', border: '1px solid #334155', borderRadius: '16px', background: 'var(--surface)', color: 'var(--ink)' }}>
                <h3 style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 700 }}><MessageSquare size={16} /> Messages</h3>
                <div style={{ maxHeight: '180px', overflowY: 'auto', margin: '12px 0', display: 'grid', gap: '8px' }} aria-live="polite">
                  {!selectedContact ? <p style={{ color: '#94a3b8', fontSize: '12px' }}>Select a contact or branch to view messages.</p> :
                    messagesError ? <p role="status" style={{ color: '#fca5a5', fontSize: '12px' }}>{messagesError}</p> :
                    messagesLoading ? <p style={{ color: '#94a3b8', fontSize: '12px' }}>Loading messages...</p> :
                    directMessages.length === 0 ? <p style={{ color: '#94a3b8', fontSize: '12px' }}>No messages yet.</p> :
                    directMessages.slice(-20).map((message) => (
                      <div key={message.id} style={{ background: 'var(--surface-soft)', padding: '10px 12px', borderRadius: '8px', fontSize: '12px' }}>
                        <div style={{ color: '#94a3b8' }}>{message.senderId === currentUserId ? 'You' : message.senderName || message.senderType} · {new Date(message.createdAt).toLocaleString()}</div>
                        <div style={{ whiteSpace: 'pre-wrap', overflowWrap: 'anywhere' }}>{message.body}</div>
                      </div>
                    ))}
                </div>
                <form onSubmit={handleSendDirectMessage} style={{ display: 'flex', gap: '8px' }}>
                  <input value={directMessageText} onChange={(event) => setDirectMessageText(event.target.value)} maxLength={4000}
                    placeholder={selectedContact ? 'Write a message to the selected contact' : 'Select a contact or branch to message'}
                    style={{ minWidth: 0, flex: 1, padding: '9px', borderRadius: '8px', border: '1px solid #475569', background: 'var(--canvas)', color: 'var(--ink)' }} />
                  <button type="submit" disabled={messageRouteMissing || !selectedContact || !directMessageText.trim()}
                    style={{ padding: '9px 14px', borderRadius: '8px', background: '#2563eb', color: '#fff', opacity: messageRouteMissing || !selectedContact || !directMessageText.trim() ? 0.5 : 1 }}>Send</button>
                </form>
              </section>
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
      
      {/* Active Call Workspace */}
      {activeCall && (
        <div className="call-overlay" role="dialog" aria-modal="true" aria-label="Call workspace">
          <div className="call-workspace-container">
            <CallWorkspace media={webrtc}
              peerName={activeCall.session.direction === 'INBOUND'
                ? activeCall.session.sourceEmployeeName || activeCall.session.sourceBranchName || 'Incoming caller'
                : activeCall.session.targetEmployeeName || activeCall.session.targetBranchName || 'Call participant'}
              status={activeCall.session.status} duration={formatCallDuration(callDuration)}
              onEnd={() => void (activeCall.session.status === 'CONNECTED' || webrtc.state === 'CONNECTED' ? handleEndCall() : handleCancelCall())} />
          </div>
        </div>
      )}

      {/* Incoming Call Modal */}
      {incomingCall && !activeCall && (
        <div className="incoming-call-modal">
          <div className="incoming-call-card">
            <h2>Incoming Call</h2>
            
            <div className="caller-info">
              {incomingCall.sourceBranchId ? (
                <>
                  <Building2 size={48} />
                  <h3>{incomingCall.sourceBranchName || 'Branch Intercom'}</h3>
                  {incomingCall.sourceEmployeeId && (
                    <p>{incomingCall.sourceEmployeeName}</p>
                  )}
                </>
              ) : (
                <>
                  <Shield size={48} style={{ color: '#38bdf8' }} />
                  <h3>{incomingCall.sourceEmployeeName || 'Internal VMS Operator'}</h3>
                  <p>Internal Command Center SOC Call</p>
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
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', color: '#fff' }}
                onClick={() => void handleAcceptCall('video')}
              >
                <Video size={20} />
                Video
              </button>

              <button
                type="button"
                className="accept-btn"
                onClick={() => void handleAcceptCall('audio')}
              >
                <Phone size={20} />
                Voice
              </button>
            </div>
          </div>
        </div>
      )}
      
      
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

        .directory-scope-tabs {
          display: flex;
          gap: 6px;
          padding: 8px 12px;
          border-bottom: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.02);
          overflow-x: auto;
        }

        .scope-pill {
          display: flex;
          align-items: center;
          gap: 5px;
          padding: 4px 10px;
          font-size: 11px;
          font-weight: 600;
          border-radius: 20px;
          border: 1px solid var(--line);
          background: var(--surface);
          color: var(--muted);
          cursor: pointer;
          transition: all 0.2s ease;
          white-space: nowrap;
        }

        .scope-pill:hover {
          color: var(--ink);
          border-color: rgba(59, 130, 246, 0.4);
        }

        .scope-pill.active {
          background: rgba(37, 99, 235, 0.15);
          color: #3b82f6;
          border-color: rgba(37, 99, 235, 0.4);
        }

        .directory-section {
          margin-bottom: 8px;
        }

        .directory-section-header {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 8px 10px 4px;
          font-size: 10px;
          font-weight: 700;
          letter-spacing: 0.06em;
          text-transform: uppercase;
          color: var(--muted);
        }

        .count-badge {
          margin-left: auto;
          font-size: 10px;
          background: rgba(255, 255, 255, 0.08);
          padding: 1px 6px;
          border-radius: 10px;
          color: var(--muted);
        }

        .internal-user-item {
          display: flex;
          align-items: center;
          justify-content: space-between;
          width: 100%;
          padding: 9px 10px;
          border: 1px solid var(--line);
          border-radius: 8px;
          background: var(--surface);
          color: var(--ink);
          cursor: pointer;
          transition: all 0.15s ease;
          margin-bottom: 5px;
          text-align: left;
        }

        .internal-user-item:hover {
          background: var(--surface-soft);
          border-color: rgba(59, 130, 246, 0.4);
        }

        .internal-user-item.selected {
          background: rgba(37, 99, 235, 0.12);
          border-color: #2563eb;
        }

        .user-item-main {
          display: flex;
          align-items: center;
          gap: 10px;
          min-width: 0;
          flex: 1;
        }

        .user-avatar-wrap {
          position: relative;
          width: 32px;
          height: 32px;
          border-radius: 8px;
          background: rgba(37, 99, 235, 0.15);
          color: #60a5fa;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .user-avatar-wrap .presence-dot {
          position: absolute;
          bottom: -2px;
          right: -2px;
          width: 8px;
          height: 8px;
          border-radius: 50%;
          border: 2px solid var(--surface);
        }

        .user-details {
          display: flex;
          flex-direction: column;
          min-width: 0;
          flex: 1;
        }

        .user-name-row {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .user-name {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .self-tag {
          font-size: 9px;
          font-weight: 700;
          padding: 1px 5px;
          border-radius: 4px;
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
        }

        .self-tag-large {
          font-size: 11px;
          font-weight: 700;
          padding: 2px 8px;
          border-radius: 6px;
          background: rgba(16, 185, 129, 0.15);
          color: #10b981;
          border: 1px solid rgba(16, 185, 129, 0.3);
        }

        .user-role {
          font-size: 11px;
          color: var(--muted);
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }

        .quick-actions {
          display: flex;
          align-items: center;
          gap: 4px;
          flex-shrink: 0;
          margin-left: 6px;
        }

        .quick-icon-btn {
          width: 26px;
          height: 26px;
          border-radius: 6px;
          border: 1px solid var(--line);
          background: rgba(255, 255, 255, 0.05);
          color: var(--muted);
          display: flex;
          align-items: center;
          justify-content: center;
          cursor: pointer;
          transition: all 0.15s ease;
        }

        .quick-icon-btn:hover:not(:disabled) {
          background: #2563eb;
          color: #fff;
          border-color: #2563eb;
        }

        .quick-icon-btn:disabled {
          opacity: 0.3;
          cursor: not-allowed;
        }

        .operator-icon-badge {
          width: 52px;
          height: 52px;
          border-radius: 12px;
          background: linear-gradient(135deg, rgba(37, 99, 235, 0.2), rgba(124, 58, 237, 0.2));
          border: 1px solid rgba(37, 99, 235, 0.4);
          color: #60a5fa;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }

        .operator-details-grid {
          display: grid;
          grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
          gap: 12px;
          margin-top: 24px;
          padding-top: 20px;
          border-top: 1px solid var(--line);
        }

        .operator-details-grid .info-box {
          background: var(--surface);
          border: 1px solid var(--line);
          padding: 12px 14px;
          border-radius: 10px;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }

        .operator-details-grid .info-box .label {
          font-size: 10px;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
          color: var(--muted);
        }

        .operator-details-grid .info-box .value {
          font-size: 13px;
          font-weight: 600;
          color: var(--ink);
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
        
        .communications-page { height: calc(100dvh - 80px); min-height: 580px; }
        .comm-header { padding: 22px 28px; gap: 20px; }
        .comm-brand h1 { font-size: 23px; letter-spacing: -.04em; }
        .comm-icon { padding: 10px; width: 44px; height: 44px; border-radius: 13px; background: var(--blue-soft); border: 1px solid var(--line); }
        .view-tabs { padding: 12px 28px; gap: 8px; }
        .view-tab { border-radius: 9px; font-size: 12px; padding: 9px 16px; }
        .directory-sidebar { width: 340px; }
        .search-box { padding: 18px 16px; border-bottom: none; }
        .search-box input { padding: 10px; border-radius: 9px; min-width: 0; }
        .directory-section-header { text-transform: uppercase; font-size: 9px; letter-spacing: .08em; padding: 18px 16px 10px; }
        .internal-user-item, .branch-item { border-radius: 10px; margin: 4px 10px; width: calc(100% - 20px); padding: 13px 12px; }
        button.user-item-main { flex: 1; min-width: 0; border: none; background: transparent; padding: 0; color: inherit; text-align: left; cursor: pointer; }
        .contact-panel { padding: 28px; background: var(--canvas); }
        .panel-kicker { display: flex; align-items: center; justify-content: space-between; max-width: 780px; font-size: 9px; letter-spacing: .13em; font-weight: 650; color: var(--muted); margin-bottom: 23px; }
        .panel-kicker span { letter-spacing: 0; font-size: 11px; font-weight: 400; }
        .contact-details { max-width: 780px; padding: 26px; background: var(--surface); border: 1px solid var(--line); border-radius: 18px; }
        .contact-header h2 { font-size: 25px; letter-spacing: -.035em; }
        .contact-actions { gap: 10px; }
        .operator-details-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
        .call-btn { border-radius: 10px; font-size: 12px; padding: 12px 17px; }
        .message-thread { max-width: 780px; margin: 18px 0 0 !important; padding: 22px !important; border-color: var(--line) !important; }
        .empty-selection { max-width: 780px; min-height: 300px; background: var(--surface); border: 1px dashed var(--line); border-radius: 18px; }
        .empty-selection h3 { font-size: 22px; letter-spacing: -.03em; }
        .call-overlay { padding: 24px; overflow-y: auto; background: #030917bd; backdrop-filter: blur(10px); }
        .call-workspace-container { width: min(1040px, 100%); max-height: calc(100dvh - 48px); overflow-y: auto; border-radius: 22px; }
        @media (max-width: 600px) {
          .communications-page { height: auto; min-height: calc(100dvh - 60px); }
          .comm-header { flex-wrap: wrap; padding: 16px; }
          .comm-header-right { width: 100%; flex-wrap: wrap; gap: 8px; }
          .comm-brand h1 { font-size: 20px; }
          .view-tabs { padding: 12px 16px; }
          .contact-panel { padding: 16px; max-height: none !important; }
          .contact-details { padding: 18px; }
          .contact-actions { flex-wrap: wrap; }
          .call-btn { flex: 1; justify-content: center; }
          .call-overlay { padding: 10px; }
          .call-workspace-container { max-height: calc(100dvh - 20px); }
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
