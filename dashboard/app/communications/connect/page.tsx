"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Phone, PhoneOff, Mic, MicOff, Volume2, 
  AlertCircle, User, Building2, MessageSquare,
  Radio, Clock, CheckCircle2
} from 'lucide-react';
import { communicationAPI } from '@/services/communication-api';
import { useCommunicationSignaling } from '@/hooks/use-communication-signaling';
import { useWebRTCAudio } from '@/hooks/use-webrtc-audio';
import type { CallSession } from '@/services/communication-api';
import type { CallInviteEvent } from '@/hooks/use-communication-signaling';

// ============================================================================
// TYPES
// ============================================================================

interface LinkedEmployee {
  employeeId: string;
  employeeName: string;
  role?: string;
}

interface ActiveCall {
  session: CallSession;
  startTime: Date;
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ============================================================================
// MAIN COMPONENT
// ============================================================================

export default function KryptoVisionConnectPage() {
  // State
  const [deviceEnrolled, setDeviceEnrolled] = useState(false);
  const [branchName, setBranchName] = useState('');
  const [linkedEmployees, setLinkedEmployees] = useState<LinkedEmployee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState<LinkedEmployee | null>(null);
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallInviteEvent | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // Hooks
  const signaling = useCommunicationSignaling();
  const webrtc = useWebRTCAudio();
  
  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  
  // ============================================================================
  // CHECK ENROLLMENT STATUS
  // ============================================================================
  
  useEffect(() => {
    // Check if device is enrolled (token in localStorage)
    const deviceToken = localStorage.getItem('commDeviceToken');
    if (deviceToken) {
      setDeviceEnrolled(true);
      
      // Load device info from localStorage
      const storedBranch = localStorage.getItem('commBranchName');
      const storedEmployees = localStorage.getItem('commLinkedEmployees');
      
      if (storedBranch) setBranchName(storedBranch);
      if (storedEmployees) {
        try {
          setLinkedEmployees(JSON.parse(storedEmployees));
        } catch (err) {
          console.error('Failed to parse stored employees:', err);
        }
      }
    }
  }, []);
  
  // ============================================================================
  // WEBSOCKET EVENT HANDLERS
  // ============================================================================
  
  useEffect(() => {
    if (!deviceEnrolled) return;
    
    // Incoming call
    const unsubInvite = signaling.onCallInvite((event) => {
      console.log('[Connect] Incoming call:', event);
      if (event.direction === 'INBOUND') {
        setIncomingCall(event);
      }
    });
    
    // Call connected
    const unsubConnected = signaling.onCallConnected((event) => {
      console.log('[Connect] Call connected:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        setActiveCall(prev => prev ? {
          ...prev,
          session: { ...prev.session, status: 'CONNECTED' }
        } : null);
      }
    });
    
    // Call ended
    const unsubEnded = signaling.onCallEnded((event) => {
      console.log('[Connect] Call ended:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        handleCallEnd();
      }
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });
    
    // Call accepted elsewhere
    const unsubElsewhere = signaling.onCallAcceptedElsewhere((event) => {
      console.log('[Connect] Call accepted elsewhere:', event);
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });
    
    // Call rejected
    const unsubRejected = signaling.onCallRejected((event) => {
      console.log('[Connect] Call rejected:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        handleCallEnd();
      }
    });
    
    // Call cancelled
    const unsubCancelled = signaling.onCallCancelled((event) => {
      console.log('[Connect] Call cancelled:', event);
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });
    
    // Call failed
    const unsubFailed = signaling.onCallFailed((event) => {
      console.log('[Connect] Call failed:', event);
      if (activeCall && event.callId === activeCall.session.id) {
        handleCallEnd();
        setError(event.endReason || 'Call failed');
      }
    });
    
    return () => {
      unsubInvite();
      unsubConnected();
      unsubEnded();
      unsubElsewhere();
      unsubRejected();
      unsubCancelled();
      unsubFailed();
    };
  }, [signaling, activeCall, incomingCall, deviceEnrolled]);
  
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
  
  const handleCallVMS = useCallback(async (employeeId?: string) => {
    try {
      setError(null);
      
      // Request microphone permission
      const permissionGranted = await webrtc.requestMicrophonePermission();
      if (!permissionGranted) {
        setError('Microphone permission required to make calls');
        return;
      }
      
      // Call VMS SOC
      const session = await communicationAPI.callVMS(employeeId);
      setActiveCall({ session, startTime: new Date() });
      
    } catch (err: any) {
      console.error('[Connect] Failed to call VMS:', err);
      setError(err.message || 'Failed to call VMS');
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
      console.error('[Connect] Failed to accept call:', err);
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
      console.error('[Connect] Failed to reject call:', err);
      setIncomingCall(null);
    }
  }, [incomingCall]);
  
  const handleEndCall = useCallback(async () => {
    if (!activeCall) return;
    
    try {
      await communicationAPI.endCall(activeCall.session.id);
      handleCallEnd();
    } catch (err: any) {
      console.error('[Connect] Failed to end call:', err);
      handleCallEnd();
    }
  }, [activeCall]);
  
  const handleCallEnd = useCallback(() => {
    webrtc.disconnect();
    setActiveCall(null);
    setCallDuration(0);
  }, [webrtc]);
  
  // ============================================================================
  // PLAY REMOTE AUDIO
  // ============================================================================
  
  useEffect(() => {
    if (webrtc.remoteStream && audioRef.current) {
      audioRef.current.srcObject = webrtc.remoteStream;
      void audioRef.current.play().catch(err => {
        console.error('[Connect] Failed to play remote audio:', err);
      });
    }
  }, [webrtc.remoteStream]);
  
  // ============================================================================
  // RENDER: NOT ENROLLED
  // ============================================================================
  
  if (!deviceEnrolled) {
    return (
      <div className="connect-page">
        <div className="connect-setup">
          <div className="setup-card">
            <Phone size={48} className="setup-icon" />
            <h1>KryptoVision Connect</h1>
            <p>This device is not enrolled yet.</p>
            <p className="setup-note">
              Please contact your VMS administrator to generate an enrollment code,
              then use the enrollment app to register this device.
            </p>
          </div>
        </div>
        
        <style jsx>{`
          .connect-page {
            display: flex;
            align-items: center;
            justify-content: center;
            min-height: 100vh;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            padding: 24px;
          }
          
          .connect-setup {
            width: min(100%, 480px);
          }
          
          .setup-card {
            padding: 48px 32px;
            background: white;
            border-radius: 16px;
            text-align: center;
            box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
          }
          
          .setup-icon {
            color: #667eea;
            margin-bottom: 24px;
          }
          
          .setup-card h1 {
            margin: 0 0 16px;
            font-size: 28px;
            font-weight: 700;
            color: #1f2937;
          }
          
          .setup-card p {
            margin: 0 0 12px;
            font-size: 16px;
            color: #6b7280;
            line-height: 1.6;
          }
          
          .setup-note {
            margin-top: 24px;
            padding: 16px;
            background: #f3f4f6;
            border-radius: 8px;
            font-size: 14px;
            color: #4b5563;
          }
        `}</style>
      </div>
    );
  }
  
  // ============================================================================
  // RENDER: ENROLLED
  // ============================================================================
  
  return (
    <div className="connect-page enrolled">
      {/* Header */}
      <header className="connect-header">
        <div className="connect-brand">
          <Phone size={20} />
          <h1>KryptoVision Connect</h1>
        </div>
        
        <div className={`service-status ${signaling.connected ? 'online' : 'offline'}`}>
          <Radio size={12} className={signaling.connected ? 'pulse' : ''} />
          <span>{signaling.connected ? 'Connected' : 'Connecting...'}</span>
        </div>
      </header>
      
      {/* Branch Info */}
      <div className="branch-info">
        <Building2 size={24} />
        <div>
          <h2>{branchName || 'Branch'}</h2>
          <p className={`status ${signaling.connected ? 'online' : 'offline'}`}>
            {signaling.connected ? '● Connected' : '○ Offline'}
          </p>
        </div>
      </div>
      
      {error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{error}</span>
        </div>
      )}
      
      {webrtc.error && (
        <div className="error-banner">
          <AlertCircle size={16} />
          <span>{webrtc.error}</span>
        </div>
      )}
      
      {/* Main Actions */}
      {!activeCall && !incomingCall && (
        <div className="main-actions">
          {linkedEmployees.length > 1 ? (
            <>
              <h3>Who is calling VMS?</h3>
              
              <button
                type="button"
                className="employee-option branch"
                onClick={() => handleCallVMS()}
              >
                <Building2 size={20} />
                <span>Call as Branch</span>
              </button>
              
              <div className="employee-options">
                {linkedEmployees.map(employee => (
                  <button
                    key={employee.employeeId}
                    type="button"
                    className="employee-option"
                    onClick={() => handleCallVMS(employee.employeeId)}
                  >
                    <User size={18} />
                    <div>
                      <strong>{employee.employeeName}</strong>
                      {employee.role && <span>{employee.role}</span>}
                    </div>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <button
              type="button"
              className="call-vms-btn"
              onClick={() => handleCallVMS(linkedEmployees[0]?.employeeId)}
              disabled={!signaling.connected}
            >
              <Phone size={24} />
              <span>Call VMS Team</span>
            </button>
          )}
          
          <button
            type="button"
            className="message-btn"
            disabled={!signaling.connected}
          >
            <MessageSquare size={20} />
            <span>Message VMS</span>
          </button>
        </div>
      )}
      
      {/* Active Call */}
      {activeCall && (
        <div className="active-call">
          <div className="call-header">
            <h2>KryptoVision VMS Team</h2>
            <p className={`call-status ${activeCall.session.status}`}>
              {activeCall.session.status === 'CONNECTED' ? '● Connected' : 'Connecting...'}
            </p>
          </div>
          
          <div className="call-duration">
            {activeCall.session.status === 'CONNECTED' ? (
              <span className="duration-text">{formatCallDuration(callDuration)}</span>
            ) : (
              <span className="connecting-text">Connecting...</span>
            )}
          </div>
          
          {activeCall.session.status === 'CONNECTED' && (
            <div className="call-controls">
              <button
                type="button"
                className={`control-btn ${webrtc.microphoneEnabled ? 'active' : 'muted'}`}
                onClick={() => webrtc.toggleMute()}
              >
                {webrtc.microphoneEnabled ? <Mic size={24} /> : <MicOff size={24} />}
                <span>{webrtc.microphoneEnabled ? 'Mute' : 'Unmute'}</span>
              </button>
              
              <button
                type="button"
                className="control-btn active"
              >
                <Volume2 size={24} />
                <span>Speaker</span>
              </button>
            </div>
          )}
          
          <button
            type="button"
            className="end-call-btn"
            onClick={handleEndCall}
          >
            <PhoneOff size={24} />
            End Call
          </button>
        </div>
      )}
      
      {/* Incoming Call */}
      {incomingCall && !activeCall && (
        <div className="incoming-call">
          <h2>Incoming Call</h2>
          
          <div className="caller-info">
            <Phone size={64} className="ringing-icon" />
            <h3>VMS Team</h3>
            {incomingCall.sourceOperatorId && (
              <p>Operator calling</p>
            )}
          </div>
          
          <div className="incoming-actions">
            <button
              type="button"
              className="reject-btn"
              onClick={handleRejectCall}
            >
              <PhoneOff size={24} />
              Decline
            </button>
            
            <button
              type="button"
              className="accept-btn"
              onClick={handleAcceptCall}
            >
              <Phone size={24} />
              Accept
            </button>
          </div>
        </div>
      )}
      
      {/* Hidden audio element */}
      <audio ref={audioRef} autoPlay playsInline />
      
      <style jsx>{`
        .connect-page.enrolled {
          display: flex;
          flex-direction: column;
          min-height: 100vh;
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
        }
        
        .connect-header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 16px 20px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
        }
        
        .connect-brand {
          display: flex;
          align-items: center;
          gap: 8px;
        }
        
        .connect-brand h1 {
          margin: 0;
          font-size: 16px;
          font-weight: 700;
        }
        
        .service-status {
          display: flex;
          align-items: center;
          gap: 6px;
          padding: 6px 12px;
          border-radius: 6px;
          font-size: 12px;
          font-weight: 600;
        }
        
        .service-status.online {
          background: rgba(34, 197, 94, 0.2);
        }
        
        .service-status.offline {
          background: rgba(239, 68, 68, 0.2);
        }
        
        .service-status .pulse {
          animation: pulse 2s ease-in-out infinite;
        }
        
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
        
        .branch-info {
          display: flex;
          align-items: center;
          gap: 16px;
          padding: 24px 20px;
          background: rgba(255, 255, 255, 0.1);
          backdrop-filter: blur(10px);
          margin: 16px 20px;
          border-radius: 12px;
        }
        
        .branch-info h2 {
          margin: 0;
          font-size: 20px;
          font-weight: 700;
        }
        
        .branch-info .status {
          margin: 4px 0 0;
          font-size: 14px;
        }
        
        .branch-info .status.online {
          color: #86efac;
        }
        
        .branch-info .status.offline {
          color: #fca5a5;
        }
        
        .error-banner {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 12px 20px;
          margin: 0 20px 16px;
          background: rgba(239, 68, 68, 0.2);
          border: 1px solid rgba(239, 68, 68, 0.4);
          border-radius: 8px;
          font-size: 14px;
        }
        
        .main-actions {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          gap: 16px;
        }
        
        .main-actions h3 {
          margin: 0 0 16px;
          font-size: 18px;
          font-weight: 600;
          text-align: center;
        }
        
        .call-vms-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: min(100%, 280px);
          padding: 32px;
          background: white;
          border: none;
          border-radius: 16px;
          color: #667eea;
          font-size: 20px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
        }
        
        .call-vms-btn:hover:not(:disabled) {
          transform: translateY(-4px);
          box-shadow: 0 15px 40px rgba(0, 0, 0, 0.4);
        }
        
        .call-vms-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .message-btn {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 14px 28px;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 12px;
          color: white;
          font-size: 16px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .message-btn:hover:not(:disabled) {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
        }
        
        .message-btn:disabled {
          opacity: 0.5;
          cursor: not-allowed;
        }
        
        .employee-options {
          width: min(100%, 360px);
          display: flex;
          flex-direction: column;
          gap: 12px;
        }
        
        .employee-option {
          display: flex;
          align-items: center;
          gap: 12px;
          padding: 16px 20px;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 12px;
          color: white;
          font-size: 16px;
          text-align: left;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .employee-option.branch {
          background: white;
          color: #667eea;
          border-color: white;
        }
        
        .employee-option:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
          transform: translateX(4px);
        }
        
        .employee-option.branch:hover {
          background: #f9fafb;
        }
        
        .employee-option strong {
          display: block;
          font-weight: 700;
        }
        
        .employee-option span {
          display: block;
          font-size: 14px;
          opacity: 0.8;
        }
        
        .active-call, .incoming-call {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 32px 20px;
          gap: 24px;
        }
        
        .call-header {
          text-align: center;
        }
        
        .call-header h2 {
          margin: 0 0 8px;
          font-size: 24px;
          font-weight: 700;
        }
        
        .call-status {
          margin: 0;
          font-size: 16px;
          font-weight: 600;
        }
        
        .call-status.CONNECTED {
          color: #86efac;
        }
        
        .call-duration {
          text-align: center;
        }
        
        .duration-text {
          font-size: 64px;
          font-weight: 700;
          font-family: monospace;
        }
        
        .connecting-text {
          font-size: 24px;
          opacity: 0.8;
        }
        
        .call-controls {
          display: flex;
          gap: 16px;
        }
        
        .control-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          gap: 8px;
          padding: 20px 32px;
          background: rgba(255, 255, 255, 0.15);
          border: 2px solid rgba(255, 255, 255, 0.3);
          border-radius: 16px;
          color: white;
          font-size: 14px;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.2s;
        }
        
        .control-btn:hover {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
        }
        
        .control-btn.active {
          background: rgba(255, 255, 255, 0.25);
          border-color: rgba(255, 255, 255, 0.5);
        }
        
        .control-btn.muted {
          background: rgba(239, 68, 68, 0.2);
          border-color: rgba(239, 68, 68, 0.4);
        }
        
        .end-call-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          gap: 12px;
          width: min(100%, 280px);
          padding: 16px 32px;
          background: #ef4444;
          border: none;
          border-radius: 16px;
          color: white;
          font-size: 18px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(239, 68, 68, 0.4);
          transition: all 0.2s;
        }
        
        .end-call-btn:hover {
          background: #dc2626;
          transform: translateY(-2px);
          box-shadow: 0 15px 40px rgba(239, 68, 68, 0.5);
        }
        
        .incoming-call h2 {
          margin: 0 0 32px;
          font-size: 20px;
          font-weight: 600;
        }
        
        .caller-info {
          text-align: center;
          margin-bottom: 32px;
        }
        
        .ringing-icon {
          animation: ring 1s ease-in-out infinite;
          margin-bottom: 24px;
        }
        
        @keyframes ring {
          0%, 100% { transform: rotate(-15deg); }
          50% { transform: rotate(15deg); }
        }
        
        .caller-info h3 {
          margin: 0 0 8px;
          font-size: 28px;
          font-weight: 700;
        }
        
        .caller-info p {
          margin: 0;
          font-size: 16px;
          opacity: 0.8;
        }
        
        .incoming-actions {
          display: flex;
          gap: 16px;
        }
        
        .reject-btn, .accept-btn {
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          gap: 8px;
          width: 120px;
          height: 120px;
          border: none;
          border-radius: 50%;
          font-size: 14px;
          font-weight: 700;
          cursor: pointer;
          box-shadow: 0 10px 30px rgba(0, 0, 0, 0.3);
          transition: all 0.2s;
        }
        
        .reject-btn {
          background: rgba(239, 68, 68, 0.2);
          border: 3px solid rgba(239, 68, 68, 0.4);
          color: white;
        }
        
        .reject-btn:hover {
          background: rgba(239, 68, 68, 0.3);
          border-color: #ef4444;
          transform: scale(1.05);
        }
        
        .accept-btn {
          background: #22c55e;
          color: white;
        }
        
        .accept-btn:hover {
          background: #16a34a;
          transform: scale(1.05);
          box-shadow: 0 15px 40px rgba(34, 197, 94, 0.4);
        }
        
        @media (max-width: 768px) {
          .connect-header {
            padding: 12px 16px;
          }
          
          .branch-info {
            margin: 12px 16px;
            padding: 16px;
          }
          
          .main-actions {
            padding: 24px 16px;
          }
          
          .call-vms-btn {
            width: 100%;
          }
          
          .duration-text {
            font-size: 48px;
          }
          
          .reject-btn, .accept-btn {
            width: 100px;
            height: 100px;
          }
        }
      `}</style>
    </div>
  );
}
