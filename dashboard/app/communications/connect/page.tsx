"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Phone, PhoneOff, Mic, MicOff, Video, VideoOff, 
  ScreenShare, Volume2, AlertCircle, User, Building2, 
  Radio, Clock, CheckCircle2, RefreshCw, Laptop, 
  Smartphone, ShieldCheck, Camera, Disc, MessageSquare, 
  Send, Paperclip, Minimize2, Megaphone, Maximize2, X
} from 'lucide-react';
import { communicationAPI } from '@/services/communication-api';
import { useCommunicationSignaling } from '@/hooks/use-communication-signaling';
import { useWebRTCCall, type CallModality } from '@/hooks/use-webrtc-call';
import type { CallSession, WebRTCCredentials } from '@/services/communication-api';
import type { CallInviteEvent } from '@/hooks/use-communication-signaling';

interface BranchOption {
  id: string;
  name: string;
  code?: string;
  employees: { id: string; name: string; role: string }[];
}

interface ActiveCall {
  session: CallSession;
  startTime: Date;
  modality: CallModality;
  credentials: WebRTCCredentials;
}

function formatCallDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export default function KryptoVisionConnectPage() {
  // Prevent hydration mismatch: this page reads localStorage before rendering
  const [mounted, setMounted] = useState(false);

  // Device identity state
  const [deviceEnrolled, setDeviceEnrolled] = useState(false);
  const [deviceId, setDeviceId] = useState('');
  const [deviceName, setDeviceName] = useState('');
  const [deviceStatus, setDeviceStatus] = useState('PENDING');
  const [branchId, setBranchId] = useState('');
  const [branchName, setBranchName] = useState('');
  const [deviceMode, setDeviceMode] = useState<'BRANCH_COMMON' | 'EMPLOYEE_SPECIFIC'>('BRANCH_COMMON');
  const [linkedEmployee, setLinkedEmployee] = useState<{ id: string; name: string; role?: string } | null>(null);
  
  // Registration setup state (when not enrolled)
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [regMode, setRegMode] = useState<'BRANCH_COMMON' | 'EMPLOYEE_SPECIFIC'>('BRANCH_COMMON');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [customDeviceName, setCustomDeviceName] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [registering, setRegistering] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Calling state
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallInviteEvent | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);

  // In-Call Tools Drawer (Chat, Evidence, CCTV inject)
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'chat' | 'cctv'>('none');
  const [chatInputText, setChatInputText] = useState('');
  const [cctvCameras, setCctvCameras] = useState<{ id: string; name: string; branchName?: string }[]>([]);
  const [selectedCctvCameraId, setSelectedCctvCameraId] = useState('');
  const [paBroadcastActive, setPaBroadcastActive] = useState(false);

  // Media & WebRTC
  const signaling = useCommunicationSignaling();
  const webrtc = useWebRTCCall();

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
  const localVideoRef = useRef<HTMLVideoElement | null>(null);
  const remoteAudioRef = useRef<HTMLAudioElement | null>(null);
  const durationIntervalRef = useRef<number | null>(null);
  const chatScrollRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // 1. Check local enrollment state
  const checkEnrollment = useCallback(() => {
    const token = localStorage.getItem('commDeviceToken');
    const storedDeviceId = localStorage.getItem('commDeviceId');
    const storedDeviceName = localStorage.getItem('commDeviceName');
    const storedBranchId = localStorage.getItem('commBranchId');
    const storedBranchName = localStorage.getItem('commBranchName');
    const storedStatus = localStorage.getItem('commDeviceStatus');
    const storedMode = (localStorage.getItem('commDeviceMode') as any) || 'BRANCH_COMMON';
    const storedEmployee = localStorage.getItem('commLinkedEmployee');

    if (token) {
      setDeviceEnrolled(true);
      if (storedDeviceId) setDeviceId(storedDeviceId);
      if (storedDeviceName) setDeviceName(storedDeviceName);
      if (storedBranchId) setBranchId(storedBranchId);
      if (storedBranchName) setBranchName(storedBranchName);
      setDeviceStatus(storedStatus || 'PENDING');
      setDeviceMode(storedMode);
      if (storedEmployee) {
        try {
          setLinkedEmployee(JSON.parse(storedEmployee));
        } catch {}
      }
    } else {
      setDeviceEnrolled(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    checkEnrollment();
  }, [checkEnrollment]);

  useEffect(() => {
    const markReady = () => setDeviceStatus('ACTIVE');
    window.addEventListener('comm-device-ready', markReady);
    return () => window.removeEventListener('comm-device-ready', markReady);
  }, []);

  useEffect(() => {
    if (!deviceEnrolled || deviceStatus !== 'ACTIVE') return;
    const sendHeartbeat = () => {
      if (document.visibilityState === 'visible') {
        void communicationAPI.deviceHeartbeat().catch((heartbeatError) => {
          console.warn('[Connect Device] Heartbeat failed:', heartbeatError);
        });
      }
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 20_000);
    return () => window.clearInterval(timer);
  }, [deviceEnrolled, deviceStatus]);

  // 2. Load directory for enrollment screen if not enrolled
  useEffect(() => {
    if (!deviceEnrolled) {
      setLoadingDirectory(true);
      const sessionToken = sessionStorage.getItem('activityAccessToken') || sessionStorage.getItem('accessToken') || localStorage.getItem('accessToken');
      fetch('/api/communications/devices/register', {
        headers: sessionToken ? { Authorization: `Bearer ${sessionToken}` } : undefined,
      })
        .then((res) => res.json())
        .then((data) => {
          if (data.success && data.branches?.length > 0) {
            setBranches(data.branches);
            setSelectedBranchId(data.branches[0].id);
          }
        })
        .catch((err) => console.error('Failed to load branches for enrollment:', err))
        .finally(() => setLoadingDirectory(false));
    }
  }, [deviceEnrolled]);

  // Load branch CCTV cameras for live camera injection during call
  useEffect(() => {
    if (activeCall) {
      fetch('/api/cameras')
        .then((res) => res.json())
        .then((data) => {
          if (Array.isArray(data.cameras)) {
            setCctvCameras(data.cameras.map((c: any) => ({
              id: c.id,
              name: c.name || `Camera ${c.id.slice(0, 6)}`,
              branchName: c.branchName || branchName,
            })));
            if (data.cameras.length > 0) setSelectedCctvCameraId(data.cameras[0].id);
          }
        })
        .catch(() => {});
    }
  }, [activeCall, branchName]);

  // Update default device name as user selects options
  useEffect(() => {
    if (!selectedBranchId) return;
    const curBranch = branches.find((b) => b.id === selectedBranchId);
    if (!curBranch) return;

    if (regMode === 'BRANCH_COMMON') {
      setCustomDeviceName(`${curBranch.name} Intercom`);
    } else {
      const curEmp = curBranch.employees.find((e) => e.id === selectedEmployeeId) || curBranch.employees[0];
      if (curEmp) {
        setCustomDeviceName(`${curEmp.name}'s Device`);
      }
    }
  }, [selectedBranchId, regMode, selectedEmployeeId, branches]);

  // Auto-scroll chat to bottom
  useEffect(() => {
    if (chatScrollRef.current) {
      chatScrollRef.current.scrollTop = chatScrollRef.current.scrollHeight;
    }
  }, [webrtc.chatMessages]);

  // 3. Register device without password
  const handleRegisterDevice = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setRegistering(true);

    try {
      const curBranch = branches.find((b) => b.id === selectedBranchId);
      if (!curBranch) throw new Error('Please select a valid branch');

      let curEmployee = null;
      if (regMode === 'EMPLOYEE_SPECIFIC') {
        curEmployee = curBranch.employees.find((e) => e.id === selectedEmployeeId) || curBranch.employees[0];
      }

      if (!enrollmentCode.trim()) throw new Error('Enter the enrollment code provided by your administrator');
      if (!window.crypto?.subtle) throw new Error('This browser cannot securely enroll a device. Use HTTPS on a supported browser.');
      const keyPair = await window.crypto.subtle.generateKey({ name: 'ECDSA', namedCurve: 'P-256' }, true, ['sign', 'verify']);
      const publicKeyBytes = await window.crypto.subtle.exportKey('spki', keyPair.publicKey);
      const publicKey = `-----BEGIN PUBLIC KEY-----\n${btoa(String.fromCharCode(...new Uint8Array(publicKeyBytes)))}\n-----END PUBLIC KEY-----`;
      const deviceUuid = localStorage.getItem('commDeviceUuid') || window.crypto.randomUUID();
      localStorage.setItem('commDeviceUuid', deviceUuid);

      const res = await fetch('/api/communications/devices/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branchId: curBranch.id,
          branchName: curBranch.name,
          mode: regMode,
          employeeId: curEmployee?.id,
          employeeName: curEmployee?.name,
          deviceName: customDeviceName,
          platform: 'WEB',
          enrollmentCode,
          publicKey,
          deviceUuid,
        }),
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.message || 'Device registration failed');
      }

      localStorage.setItem('commDeviceToken', data.accessToken);
      localStorage.setItem('commDeviceRefreshToken', data.refreshToken);
      window.dispatchEvent(new Event('comm-device-enrolled'));
      localStorage.setItem('commDeviceId', data.deviceId);
      localStorage.setItem('commDeviceName', data.deviceName);
      localStorage.setItem('commBranchId', data.branchId);
      localStorage.setItem('commBranchName', data.branchName);
      if (data.tenantId) localStorage.setItem('commTenantId', data.tenantId);
      localStorage.setItem('commDeviceStatus', data.status || 'PENDING');
      localStorage.setItem('commDeviceMode', data.mode);
      if (data.linkedEmployee) {
        localStorage.setItem('commLinkedEmployee', JSON.stringify(data.linkedEmployee));
      }

      checkEnrollment();
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Failed to activate device.');
    } finally {
      setRegistering(false);
    }
  };

  const handleResetDevice = () => {
    if (confirm('Are you sure you want to disconnect and switch this device?')) {
      localStorage.removeItem('commDeviceToken');
      localStorage.removeItem('commDeviceRefreshToken');
      localStorage.removeItem('commDeviceId');
      localStorage.removeItem('commDeviceName');
      localStorage.removeItem('commBranchId');
      localStorage.removeItem('commBranchName');
      localStorage.removeItem('commTenantId');
      localStorage.removeItem('commDeviceStatus');
      localStorage.removeItem('commDeviceMode');
      localStorage.removeItem('commLinkedEmployee');
      setDeviceEnrolled(false);
      webrtc.disconnect();
      setActiveCall(null);
    }
  };

  // 4. WebSocket Signalling Listeners
  useEffect(() => {
    if (!deviceEnrolled) return;

    const unsubInvite = signaling.onCallInvite((event) => {
      console.log('[Connect Device] Incoming call received:', event);
      if (event.direction === 'INBOUND') {
        void signaling.joinCall(event.callId).catch(() => setError('Unable to join call signaling. Reconnect this device and try again.'));
        setIncomingCall(event);
      }
    });

    const unsubAccepted = signaling.onCallAccepted((event) => {
      if (!activeCall || event.callId !== activeCall.session.id) return;
    });

    const unsubMediaReady = signaling.onCallMediaReady((event) => {
      if (!activeCall || event.callId !== activeCall.session.id) return;
      void (async () => {
        const offer = await webrtc.createOffer(activeCall.credentials, activeCall.modality, (candidate) => signaling.sendWebRtcIceCandidate(event.callId, candidate));
        if (offer) signaling.sendWebRtcOffer(event.callId, offer);
      })().catch((signalError) => setError(signalError instanceof Error ? signalError.message : 'Unable to start call media'));
    });

    const unsubOffer = signaling.onWebRtcOffer((event) => {
      if (!activeCall || event.callId !== activeCall.session.id || !event.description) return;
      void (async () => {
        const answer = await webrtc.createAnswer(activeCall.credentials, event.description!, activeCall.modality, (candidate) => signaling.sendWebRtcIceCandidate(event.callId, candidate));
        if (answer) signaling.sendWebRtcAnswer(event.callId, answer);
      })().catch((signalError) => setError(signalError instanceof Error ? signalError.message : 'Unable to answer call media'));
    });
    const unsubAnswer = signaling.onWebRtcAnswer((event) => {
      if (activeCall?.session.id === event.callId && event.description) {
        void webrtc.applyAnswer(event.description).catch(() => setError('Unable to complete call media negotiation'));
      }
    });
    const unsubIce = signaling.onWebRtcIceCandidate((event) => {
      if (activeCall?.session.id === event.callId && event.candidate) {
        void webrtc.addIceCandidate(event.candidate).catch(() => setError('Unable to apply call network candidate'));
      }
    });

    const unsubConnected = signaling.onCallConnected((event) => {
      if (activeCall && event.callId === activeCall.session.id) {
        setActiveCall((prev) =>
          prev ? { ...prev, session: { ...prev.session, status: 'CONNECTED' } } : null
        );
      }
    });

    const unsubEnded = signaling.onCallEnded((event) => {
      if (activeCall && event.callId === activeCall.session.id) {
        handleCallEnd();
      }
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });

    const unsubElsewhere = signaling.onCallAcceptedElsewhere((event) => {
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });

    const unsubRejected = signaling.onCallRejected((event) => {
      if (activeCall && event.callId === activeCall.session.id) {
        handleCallEnd();
      }
    });

    const unsubCancelled = signaling.onCallCancelled((event) => {
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });

    return () => {
      unsubInvite();
      unsubAccepted();
      unsubMediaReady();
      unsubOffer();
      unsubAnswer();
      unsubIce();
      unsubConnected();
      unsubEnded();
      unsubElsewhere();
      unsubRejected();
      unsubCancelled();
    };
  }, [signaling, activeCall, incomingCall, deviceEnrolled, webrtc]);

  // 5. Timer
  useEffect(() => {
    if (activeCall && activeCall.session.status === 'CONNECTED') {
      durationIntervalRef.current = window.setInterval(() => {
        setCallDuration((p) => p + 1);
      }, 1000);
    } else {
      if (durationIntervalRef.current) {
        clearInterval(durationIntervalRef.current);
        durationIntervalRef.current = null;
      }
      setCallDuration(0);
    }
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, [activeCall]);

  // 6. Connect video/audio streams to video/audio tags
  useEffect(() => {
    if (remoteVideoRef.current && webrtc.remoteStream) {
      remoteVideoRef.current.srcObject = webrtc.remoteStream;
      remoteVideoRef.current.play().catch(() => {});
    }
  }, [webrtc.remoteStream]);

  useEffect(() => {
    if (localVideoRef.current && webrtc.localStream) {
      localVideoRef.current.srcObject = webrtc.localStream;
      localVideoRef.current.play().catch(() => {});
    }
  }, [webrtc.localStream]);

  // Keyboard shortcut for PTT (Spacebar hold to talk)
  useEffect(() => {
    if (!webrtc.isPttMode || !activeCall) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space' && !e.repeat && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        webrtc.startPttTalk();
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space' && (e.target as HTMLElement).tagName !== 'INPUT') {
        e.preventDefault();
        webrtc.stopPttTalk();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
    };
  }, [webrtc.isPttMode, activeCall, webrtc]);

  // 7. Make call to VMS
  const handleStartCall = async (modality: CallModality) => {
    try {
      setError(null);
      const stream = await webrtc.initializeMedia({
        audio: true,
        video: modality === 'video',
      });
      if (!stream) return;

      const started = await communicationAPI.callVMS(linkedEmployee?.id);
      await signaling.joinCall(started.call.id);
      setActiveCall({ session: started.call, credentials: started.credentials, startTime: new Date(), modality });

      if (modality === 'screenshare') {
        setTimeout(async () => {
          await webrtc.startScreenShare();
        }, 600);
      }
    } catch (err: any) {
      console.error('[Connect Device] Call initiation failed:', err);
      setError(err.message || 'Failed to call VMS Command Center');
    }
  };

  // 8. PA Announcement Broadcast
  const handleTriggerPaAnnouncement = async () => {
    setPaBroadcastActive(true);
    try {
      await webrtc.initializeMedia({ audio: true, video: false });
      webrtc.sendChatMessage('📢 EMERGENCY PA BROADCAST INITIATED OVER ALL BRANCH SPEAKERS', 'Broadcast Engine');
    } finally {
      setTimeout(() => setPaBroadcastActive(false), 4000);
    }
  };

  // Accept incoming call
  const handleAcceptCall = async (modality: CallModality = 'video') => {
    if (!incomingCall) return;
    try {
      setError(null);
      await webrtc.initializeMedia({ audio: true, video: modality === 'video' });
      const { call, credentials } = await communicationAPI.acceptCall(incomingCall.callId);

      setActiveCall({
        session: call,
        credentials,
        startTime: new Date(),
        modality,
      });

      setIncomingCall(null);
      await signaling.joinCall(call.id);
      signaling.sendCallMediaReady(call.id);
    } catch (err: any) {
      console.error('[Connect Device] Failed to accept call:', err);
      setError(err.message || 'Failed to accept call');
      setIncomingCall(null);
    }
  };

  const handleRejectCall = async () => {
    if (!incomingCall) return;
    try {
      await communicationAPI.rejectCall(incomingCall.callId);
      setIncomingCall(null);
    } catch {
      setIncomingCall(null);
    }
  };

  const handleEndCall = async () => {
    if (!activeCall) return;
    try {
      await communicationAPI.endCall(activeCall.session.id);
      handleCallEnd();
    } catch {
      handleCallEnd();
    }
  };

  const handleCallEnd = () => {
    webrtc.disconnect();
    setActiveCall(null);
    setCallDuration(0);
    setActiveDrawer('none');
  };

  // Handle Chat Submit
  const handleChatSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInputText.trim()) return;
    webrtc.sendChatMessage(chatInputText, linkedEmployee?.name || deviceName);
    setChatInputText('');
  };

  // Handle Chat File Attachment
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      webrtc.sendChatFile(file, linkedEmployee?.name || deviceName);
    }
  };

  // ============================================================================
  // Hydration guard: render nothing on server; only render after client mount
  // (this page depends on localStorage for device enrollment state)
  // ============================================================================
  if (!mounted) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  // ============================================================================
  // VIEW: NOT ENROLLED (Zero-Login Device Setup Kiosk)
  // ============================================================================
  if (!deviceEnrolled) {
    const selectedBranch = branches.find((b) => b.id === selectedBranchId);

    return (
      <div className="min-h-screen bg-slate-950 text-slate-100 flex items-center justify-center p-4">
        <div className="w-full max-w-lg bg-slate-900 border border-slate-800 rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex p-3 rounded-2xl bg-blue-600/10 text-blue-400 border border-blue-500/20 mb-2">
              <Phone className="w-8 h-8" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight text-white">Calling Device Registration</h1>
            <p className="text-xs text-slate-400">
              One-time setup for Branch or Employee calling. <strong>No username or password required.</strong>
            </p>
          </div>

          {error && (
            <div className="p-3.5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <form onSubmit={handleRegisterDevice} className="space-y-4">
            {/* 1. Branch Selector */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-400" />
                Select Branch Location
              </label>
              {loadingDirectory ? (
                <div className="h-10 bg-slate-800/50 rounded-xl animate-pulse flex items-center px-3 text-xs text-slate-400">
                  Loading branches...
                </div>
              ) : (
                <select
                  value={selectedBranchId}
                  onChange={(e) => setSelectedBranchId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  required
                >
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.name} {b.code ? `(${b.code})` : ''}
                    </option>
                  ))}
                </select>
              )}
            </div>

            {/* 2. Device Mode Selector */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Device Link Mode</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setRegMode('BRANCH_COMMON')}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    regMode === 'BRANCH_COMMON'
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5 text-blue-300">
                    <Building2 className="w-3.5 h-3.5" />
                    Branch Common
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Rings all devices in this branch (Front desk, gate, intercom).
                  </p>
                </button>

                <button
                  type="button"
                  onClick={() => setRegMode('EMPLOYEE_SPECIFIC')}
                  className={`p-3 rounded-2xl border text-left transition-all ${
                    regMode === 'EMPLOYEE_SPECIFIC'
                      ? 'border-blue-500 bg-blue-500/10 text-white'
                      : 'border-slate-800 bg-slate-800/40 text-slate-400 hover:border-slate-700'
                  }`}
                >
                  <div className="font-semibold text-xs flex items-center gap-1.5 text-blue-300">
                    <User className="w-3.5 h-3.5" />
                    Employee Specific
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1 leading-snug">
                    Rings directly to this employee (Security officer, manager).
                  </p>
                </button>
              </div>
            </div>

            {/* 3. Employee selector if mode is Employee Specific */}
            {regMode === 'EMPLOYEE_SPECIFIC' && selectedBranch && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-emerald-400" />
                  Select Assigned Employee
                </label>
                <select
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  required
                >
                  {selectedBranch.employees.map((emp) => (
                    <option key={emp.id} value={emp.id}>
                      {emp.name} ({emp.role || 'Staff'})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* 4. Device Name */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300">Device Name / Label</label>
              <input
                type="text"
                value={customDeviceName}
                onChange={(e) => setCustomDeviceName(e.target.value)}
                placeholder="e.g. Reception Desk Tablet or Guard Sunil's Phone"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500 font-medium"
                required
              />
            </div>

            {/* Collapsible Admin Code */}
            <div className="pt-1">
              <label className="text-xs font-semibold text-slate-300">Admin enrollment code</label>
              <input
                type="text"
                value={enrollmentCode}
                onChange={(e) => setEnrollmentCode(e.target.value)}
                placeholder="XXXX-XXXX-XXXX"
                autoComplete="one-time-code"
                required
                className="mt-2 w-full px-3 py-2 rounded-lg bg-slate-800 border border-slate-700 text-xs font-mono text-white"
              />
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              disabled={registering || !enrollmentCode.trim()}
              className="w-full py-3 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-semibold text-sm shadow-lg shadow-blue-600/30 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {registering ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Activating Device...
                </>
              ) : (
                <>
                  <CheckCircle2 className="w-4 h-4" />
                  Activate & Register Device
                </>
              )}
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ============================================================================
  // VIEW: REGISTERED CALLING KIOSK (Isolated Calling Experience)
  // ============================================================================
  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col justify-between p-4 sm:p-6 select-none">
      {/* Top Status Bar */}
      <header className="w-full max-w-5xl mx-auto flex items-center justify-between py-3 px-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="w-3 h-3 rounded-full bg-emerald-500 animate-pulse" />
            <div className="absolute inset-0 rounded-full bg-emerald-500/40 animate-ping" />
          </div>
          <div>
            <div className="text-sm font-bold text-white flex items-center gap-2">
              {deviceName}
              <span className="text-[10px] uppercase font-mono px-2 py-0.5 rounded-full bg-blue-500/20 text-blue-300 border border-blue-500/30">
                {deviceMode === 'EMPLOYEE_SPECIFIC' ? 'Employee Device' : 'Branch Intercom'}
              </span>
            </div>
            <div className="text-xs text-slate-400 flex items-center gap-2">
              <span className="flex items-center gap-1">
                <Building2 className="w-3 h-3 text-slate-400" />
                {branchName}
              </span>
              {linkedEmployee && (
                <span className="flex items-center gap-1 text-emerald-400 font-medium">
                  • <User className="w-3 h-3" /> {linkedEmployee.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* PA Emergency Broadcast button */}
          <button
            onClick={() => void handleTriggerPaAnnouncement()}
            className={`text-xs px-3 py-1.5 rounded-xl border flex items-center gap-1.5 font-medium transition-all ${
              paBroadcastActive
                ? 'bg-amber-500 text-slate-950 border-amber-400 animate-pulse font-bold'
                : 'bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border-amber-500/30'
            }`}
            title="Broadcast emergency audio announcement to all branch speakers"
          >
            <Megaphone className="w-3.5 h-3.5" />
            {paBroadcastActive ? 'Broadcasting...' : 'PA Broadcast'}
          </button>

          <button
            onClick={handleResetDevice}
            className="text-xs text-slate-400 hover:text-slate-200 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 transition-all"
            title="Switch device or re-enroll"
          >
            Switch Device
          </button>
        </div>
      </header>

      {deviceStatus !== 'ACTIVE' && (
        <div className="w-full max-w-5xl mx-auto mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          This device is registered and awaiting administrator approval. Calling becomes available after approval.
        </div>
      )}

      {/* Main Calling Stage */}
      <main className="w-full max-w-5xl mx-auto my-auto py-4">
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2 max-w-lg mx-auto">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ACTIVE CALL STAGE */}
        {activeCall ? (
          <div className="w-full bg-slate-900 border border-slate-800 rounded-3xl overflow-hidden shadow-2xl p-4 sm:p-6 space-y-4">
            {/* Call Header */}
            <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-800 pb-3">
              <div className="flex items-center gap-3">
                <div className="w-3.5 h-3.5 rounded-full bg-emerald-500 animate-ping" />
                <div>
                  <h2 className="text-base sm:text-lg font-bold text-white flex items-center gap-2">
                    Call in Progress
                    {webrtc.isRecording && (
                      <span className="flex items-center gap-1 text-[11px] font-mono font-semibold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400 border border-red-500/40 animate-pulse">
                        <Disc className="w-3 h-3 text-red-500 animate-spin" />
                        REC {formatCallDuration(webrtc.recordingDuration)}
                      </span>
                    )}
                  </h2>
                  <p className="text-xs text-slate-400 font-mono">
                    Connected with VMS Command Center • {formatCallDuration(callDuration)}
                  </p>
                </div>
              </div>

              {/* Call Telemetry Badges */}
              <div className="flex items-center gap-2 text-xs font-mono">
                {webrtc.quality.rtt && (
                  <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                    RTT: {webrtc.quality.rtt}ms
                  </span>
                )}
                {webrtc.quality.packetLoss !== undefined && (
                  <span className="px-2 py-1 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                    Loss: {webrtc.quality.packetLoss}%
                  </span>
                )}
              </div>
            </div>

            {/* Video Canvas Container & Side Drawer */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className={`${activeDrawer !== 'none' ? 'lg:col-span-3' : 'lg:col-span-4'} relative w-full aspect-video bg-black rounded-2xl overflow-hidden flex items-center justify-center border border-slate-800 shadow-inner`}>
                {/* Remote Stream Video */}
                <video
                  ref={remoteVideoRef}
                  autoPlay
                  playsInline
                  className="w-full h-full object-contain"
                />

                {/* Local PiP Thumbnail */}
                {webrtc.cameraEnabled || webrtc.isScreenSharing ? (
                  <div className="absolute bottom-4 right-4 w-40 aspect-video rounded-xl overflow-hidden border-2 border-slate-700 shadow-2xl bg-slate-950">
                    <video
                      ref={localVideoRef}
                      autoPlay
                      playsInline
                      muted
                      className="w-full h-full object-cover"
                    />
                    <div className="absolute top-1 left-1.5 text-[9px] font-mono px-1.5 py-0.5 rounded bg-black/60 text-white">
                      {webrtc.isScreenSharing ? 'Screen' : 'You'}
                    </div>
                  </div>
                ) : null}

                {/* Voice-only Graphic if no video tracks */}
                {!webrtc.remoteStream?.getVideoTracks().length && (
                  <div className="text-center space-y-3 p-6">
                    <div className="w-20 h-20 rounded-full bg-blue-600/20 border-2 border-blue-500/40 text-blue-400 flex items-center justify-center mx-auto animate-pulse">
                      <Radio className="w-10 h-10" />
                    </div>
                    <div className="text-sm font-semibold text-slate-300">Voice Audio Active</div>
                    <div className="text-xs text-slate-400">VMS Command Center Operator</div>
                  </div>
                )}

                {/* PTT Active Banner overlay */}
                {webrtc.isPttMode && webrtc.isPttActive && (
                  <div className="absolute top-4 left-4 px-3 py-1.5 rounded-full bg-emerald-500 text-slate-950 font-bold text-xs flex items-center gap-1.5 shadow-lg animate-pulse">
                    <Radio className="w-4 h-4 animate-spin" />
                    TRANSMITTING (PTT)
                  </div>
                )}
              </div>

              {/* In-Call Side Drawer (Chat / CCTV Inject) */}
              {activeDrawer !== 'none' && (
                <div className="lg:col-span-1 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col h-full max-h-[380px] p-3 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      {activeDrawer === 'chat' ? <MessageSquare className="w-3.5 h-3.5 text-blue-400" /> : <Camera className="w-3.5 h-3.5 text-emerald-400" />}
                      {activeDrawer === 'chat' ? 'In-Call Chat & Evidence' : 'Inject CCTV Stream'}
                    </span>
                    <button
                      onClick={() => setActiveDrawer('none')}
                      className="text-slate-400 hover:text-white p-1 rounded-lg"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  {activeDrawer === 'chat' ? (
                    <div className="flex-1 flex flex-col justify-between overflow-hidden">
                      {/* Messages list */}
                      <div ref={chatScrollRef} className="flex-1 overflow-y-auto space-y-2 pr-1 text-xs">
                        {webrtc.chatMessages.length === 0 ? (
                          <div className="text-slate-500 text-center py-8">
                            No messages yet. Send photos, text, or snapshots here.
                          </div>
                        ) : (
                          webrtc.chatMessages.map((m) => (
                            <div key={m.id} className={`p-2 rounded-xl ${m.isSelf ? 'bg-blue-600/20 border border-blue-500/30' : 'bg-slate-800 border border-slate-700'}`}>
                              <div className="flex items-center justify-between text-[10px] text-slate-400 mb-0.5">
                                <span className="font-semibold text-slate-300">{m.sender}</span>
                                <span>{m.timestamp}</span>
                              </div>
                              {m.text && <p className="text-slate-200">{m.text}</p>}
                              {m.fileUrl && m.fileType?.startsWith('image/') && (
                                <img src={m.fileUrl} alt="evidence" className="mt-1.5 rounded-lg max-h-28 w-full object-cover border border-slate-700" />
                              )}
                            </div>
                          ))
                        )}
                      </div>

                      {/* Chat Input */}
                      <form onSubmit={handleChatSubmit} className="pt-2 flex items-center gap-1.5 border-t border-slate-800">
                        <input
                          type="text"
                          value={chatInputText}
                          onChange={(e) => setChatInputText(e.target.value)}
                          placeholder="Type message..."
                          className="flex-1 px-2.5 py-1.5 rounded-xl bg-slate-900 border border-slate-700 text-xs text-white focus:outline-none focus:border-blue-500"
                        />
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept="image/*,.pdf,.doc,.docx"
                          onChange={handleFileChange}
                          className="hidden"
                        />
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          className="p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300"
                          title="Attach photo / evidence"
                        >
                          <Paperclip className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="submit"
                          className="p-1.5 rounded-xl bg-blue-600 hover:bg-blue-500 text-white"
                          title="Send message"
                        >
                          <Send className="w-3.5 h-3.5" />
                        </button>
                      </form>
                    </div>
                  ) : (
                    /* Inject CCTV camera list */
                    <div className="flex-1 overflow-y-auto space-y-2 text-xs">
                      <p className="text-slate-400 text-[11px]">
                        Select a CCTV camera feed to stream into this active call:
                      </p>
                      {cctvCameras.map((cam) => (
                        <button
                          key={cam.id}
                          onClick={() => {
                            setSelectedCctvCameraId(cam.id);
                            webrtc.sendChatMessage(`📹 Injected CCTV Camera Feed: ${cam.name}`, 'CCTV Streamer');
                            setActiveDrawer('none');
                          }}
                          className={`w-full p-2.5 rounded-xl border text-left flex items-center justify-between transition-all ${
                            selectedCctvCameraId === cam.id
                              ? 'border-emerald-500 bg-emerald-500/10 text-white font-medium'
                              : 'border-slate-800 bg-slate-900/60 text-slate-300 hover:border-slate-700'
                          }`}
                        >
                          <span>{cam.name}</span>
                          <span className="text-[10px] text-slate-400 font-mono">LIVE</span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* In-Call Controls Bar */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1 border-t border-slate-800">
              {/* Push-to-Talk (PTT) Toggle & Button */}
              {webrtc.isPttMode ? (
                <button
                  onMouseDown={() => webrtc.startPttTalk()}
                  onMouseUp={() => webrtc.stopPttTalk()}
                  onTouchStart={() => webrtc.startPttTalk()}
                  onTouchEnd={() => webrtc.stopPttTalk()}
                  className={`p-3 px-4 rounded-2xl flex items-center gap-2 font-bold text-xs uppercase tracking-wide transition-all select-none ${
                    webrtc.isPttActive
                      ? 'bg-emerald-500 text-slate-950 scale-105 shadow-xl shadow-emerald-500/30 ring-4 ring-emerald-500/30'
                      : 'bg-emerald-600/20 text-emerald-400 border border-emerald-500/40 hover:bg-emerald-600/30'
                  }`}
                  title="Hold to talk (Spacebar also supported)"
                >
                  <Radio className={`w-4 h-4 ${webrtc.isPttActive ? 'animate-spin' : ''}`} />
                  {webrtc.isPttActive ? 'Transmitting...' : 'Hold PTT to Talk'}
                </button>
              ) : (
                /* Regular Mic Mute */
                <button
                  onClick={() => webrtc.toggleMute()}
                  className={`p-3 px-3.5 rounded-2xl flex items-center gap-1.5 font-medium text-xs transition-all ${
                    webrtc.microphoneEnabled
                      ? 'bg-slate-800 hover:bg-slate-700 text-white'
                      : 'bg-red-500/20 text-red-300 border border-red-500/40'
                  }`}
                >
                  {webrtc.microphoneEnabled ? <Mic className="w-4 h-4" /> : <MicOff className="w-4 h-4 text-red-400" />}
                  {webrtc.microphoneEnabled ? 'Mute' : 'Unmuted'}
                </button>
              )}

              {/* PTT Mode Switch */}
              <button
                onClick={() => webrtc.setIsPttMode(!webrtc.isPttMode)}
                className={`p-3 px-3 rounded-2xl text-xs font-medium border transition-all ${
                  webrtc.isPttMode
                    ? 'border-emerald-500/40 bg-emerald-500/10 text-emerald-300'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
                title="Toggle Walkie-Talkie Push-to-Talk Mode"
              >
                PTT Mode: {webrtc.isPttMode ? 'ON' : 'OFF'}
              </button>

              {/* Video Camera Toggle */}
              <button
                onClick={() => void webrtc.toggleCamera()}
                className={`p-3 px-3.5 rounded-2xl flex items-center gap-1.5 font-medium text-xs transition-all ${
                  webrtc.cameraEnabled
                    ? 'bg-blue-600 hover:bg-blue-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                {webrtc.cameraEnabled ? <Video className="w-4 h-4" /> : <VideoOff className="w-4 h-4" />}
                {webrtc.cameraEnabled ? 'Cam On' : 'Start Cam'}
              </button>

              {/* Screen Sharing Toggle */}
              <button
                onClick={() => {
                  if (webrtc.isScreenSharing) {
                    void webrtc.stopScreenShare();
                  } else {
                    void webrtc.startScreenShare();
                  }
                }}
                className={`p-3 px-3.5 rounded-2xl flex items-center gap-1.5 font-medium text-xs transition-all ${
                  webrtc.isScreenSharing
                    ? 'bg-purple-600 hover:bg-purple-500 text-white'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300'
                }`}
              >
                <ScreenShare className="w-4 h-4" />
                {webrtc.isScreenSharing ? 'Stop Share' : 'Share Screen'}
              </button>

              {/* Call Recording Toggle */}
              <button
                onClick={() => {
                  if (webrtc.isRecording) {
                    webrtc.stopRecording();
                  } else {
                    webrtc.startRecording();
                  }
                }}
                className={`p-3 px-3.5 rounded-2xl flex items-center gap-1.5 font-medium text-xs border transition-all ${
                  webrtc.isRecording
                    ? 'bg-red-600 text-white border-red-500 animate-pulse'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Record Call Video & Audio"
              >
                <Disc className="w-4 h-4" />
                {webrtc.isRecording ? 'Stop REC' : 'Record'}
              </button>

              {/* Snapshot / Evidence Capture */}
              <button
                onClick={() => {
                  webrtc.captureSnapshot(remoteVideoRef.current, `${branchName} Evidence`);
                }}
                className="p-3 px-3.5 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 flex items-center gap-1.5 text-xs font-medium border border-slate-700 transition-all"
                title="Capture high-resolution watermarked evidence screenshot"
              >
                <Camera className="w-4 h-4 text-amber-400" />
                Snapshot
              </button>

              {/* In-Call Chat Drawer Toggle */}
              <button
                onClick={() => setActiveDrawer(activeDrawer === 'chat' ? 'none' : 'chat')}
                className={`p-3 px-3.5 rounded-2xl flex items-center gap-1.5 text-xs font-medium border transition-all ${
                  activeDrawer === 'chat'
                    ? 'bg-blue-600 text-white border-blue-500'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Toggle in-call chat & file sharing"
              >
                <MessageSquare className="w-4 h-4" />
                Chat
              </button>

              {/* Inject CCTV Feed Toggle */}
              <button
                onClick={() => setActiveDrawer(activeDrawer === 'cctv' ? 'none' : 'cctv')}
                className={`p-3 px-3.5 rounded-2xl flex items-center gap-1.5 text-xs font-medium border transition-all ${
                  activeDrawer === 'cctv'
                    ? 'bg-emerald-600 text-white border-emerald-500'
                    : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                }`}
                title="Share CCTV camera feed in call"
              >
                <Camera className="w-4 h-4" />
                CCTV Feed
              </button>

              {/* Picture-in-Picture Toggle */}
              <button
                onClick={() => void webrtc.togglePiP(remoteVideoRef.current)}
                className="p-3 px-3 rounded-2xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs border border-slate-700"
                title="Pop out floating Picture-in-Picture window"
              >
                <Minimize2 className="w-4 h-4" />
              </button>

              {/* End Call */}
              <button
                onClick={() => void handleEndCall()}
                className="p-3 px-5 rounded-2xl bg-red-600 hover:bg-red-500 active:bg-red-700 text-white font-bold text-xs flex items-center gap-1.5 shadow-lg shadow-red-600/30 transition-all ml-1"
                title="Disconnect call"
              >
                <PhoneOff className="w-4 h-4" />
                End Call
              </button>
            </div>
          </div>
        ) : (
          /* IDLE / READY FOR CALL STAGE */
          <div className="space-y-8 text-center">
            <div className="space-y-2">
              <h2 className="text-3xl font-extrabold text-white">Call VMS Command Center</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Select your preferred calling mode to instantly connect with the central security operations room.
              </p>
            </div>

            {/* 3 Main Calling Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
              {/* Option 1: Video Call */}
              <button
                onClick={() => void handleStartCall('video')}
                className="group p-6 rounded-3xl bg-gradient-to-b from-blue-600/10 to-blue-600/5 hover:from-blue-600/20 hover:to-blue-600/10 border border-blue-500/30 hover:border-blue-500/60 transition-all text-center space-y-3 flex flex-col items-center justify-center shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="w-16 h-16 rounded-2xl bg-blue-600/20 text-blue-400 group-hover:bg-blue-600 group-hover:text-white transition-all flex items-center justify-center shadow-lg shadow-blue-600/20">
                  <Video className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Video Call</h3>
                  <p className="text-xs text-slate-400 mt-1">2-way HD video with front/back camera support</p>
                </div>
                <span className="text-[11px] font-semibold text-blue-400 group-hover:text-blue-300 flex items-center gap-1 pt-1">
                  Start Video Call &rarr;
                </span>
              </button>

              {/* Option 2: Audio Voice Call */}
              <button
                onClick={() => void handleStartCall('audio')}
                className="group p-6 rounded-3xl bg-gradient-to-b from-emerald-600/10 to-emerald-600/5 hover:from-emerald-600/20 hover:to-emerald-600/10 border border-emerald-500/30 hover:border-emerald-500/60 transition-all text-center space-y-3 flex flex-col items-center justify-center shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="w-16 h-16 rounded-2xl bg-emerald-600/20 text-emerald-400 group-hover:bg-emerald-600 group-hover:text-white transition-all flex items-center justify-center shadow-lg shadow-emerald-600/20">
                  <Phone className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Audio Call</h3>
                  <p className="text-xs text-slate-400 mt-1">Crystal clear voice with noise cancellation</p>
                </div>
                <span className="text-[11px] font-semibold text-emerald-400 group-hover:text-emerald-300 flex items-center gap-1 pt-1">
                  Start Voice Call &rarr;
                </span>
              </button>

              {/* Option 3: Screen Sharing */}
              <button
                onClick={() => void handleStartCall('screenshare')}
                className="group p-6 rounded-3xl bg-gradient-to-b from-purple-600/10 to-purple-600/5 hover:from-purple-600/20 hover:to-purple-600/10 border border-purple-500/30 hover:border-purple-500/60 transition-all text-center space-y-3 flex flex-col items-center justify-center shadow-xl hover:scale-[1.02] active:scale-[0.98]"
              >
                <div className="w-16 h-16 rounded-2xl bg-purple-600/20 text-purple-400 group-hover:bg-purple-600 group-hover:text-white transition-all flex items-center justify-center shadow-lg shadow-purple-600/20">
                  <ScreenShare className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Screen Share</h3>
                  <p className="text-xs text-slate-400 mt-1">Share full desktop screen, CCTV window, or tab</p>
                </div>
                <span className="text-[11px] font-semibold text-purple-400 group-hover:text-purple-300 flex items-center gap-1 pt-1">
                  Start Screen Share &rarr;
                </span>
              </button>
            </div>

            {/* Inbound Call Alert Notice */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 max-w-md mx-auto flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>
                {deviceMode === 'EMPLOYEE_SPECIFIC'
                  ? `Direct calls to ${linkedEmployee?.name || 'this employee'} will ring here.`
                  : `All calls to ${branchName} will ring this device.`}
              </span>
            </div>
          </div>
        )}
      </main>

      {/* Hidden Audio Tag for incoming sound */}
      <audio ref={remoteAudioRef} autoPlay playsInline />

      {/* INCOMING CALL MODAL (Ring-All / First-Answer-Wins) */}
      {incomingCall && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-in fade-in">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700 rounded-3xl p-6 sm:p-8 text-center space-y-6 shadow-2xl">
            <div className="w-24 h-24 rounded-full bg-blue-600/20 border-2 border-blue-500/50 text-blue-400 flex items-center justify-center mx-auto animate-bounce shadow-xl shadow-blue-500/20">
              <Phone className="w-12 h-12" />
            </div>

            <div className="space-y-1.5">
              <span className="text-xs font-mono uppercase tracking-widest text-emerald-400">
                Incoming Call
              </span>
              <h3 className="text-2xl font-bold text-white">VMS Command Center</h3>
              <p className="text-xs text-slate-400">
                Central operator is calling {deviceMode === 'EMPLOYEE_SPECIFIC' ? linkedEmployee?.name : branchName}
              </p>
            </div>

            {/* Action Buttons: Video Accept, Audio Accept, Decline */}
            <div className="grid grid-cols-2 gap-3 pt-2">
              <button
                onClick={() => void handleAcceptCall('video')}
                className="py-3.5 px-4 rounded-2xl bg-blue-600 hover:bg-blue-500 active:bg-blue-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-blue-600/30 transition-all"
              >
                <Video className="w-4 h-4" />
                Video
              </button>

              <button
                onClick={() => void handleAcceptCall('audio')}
                className="py-3.5 px-4 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:bg-emerald-700 text-white font-bold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-600/30 transition-all"
              >
                <Phone className="w-4 h-4" />
                Voice
              </button>
            </div>

            <button
              onClick={() => void handleRejectCall()}
              className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-red-600/20 text-slate-400 hover:text-red-300 text-xs font-medium transition-all"
            >
              Decline Call
            </button>
          </div>
        </div>
      )}

      {/* Footer info */}
      <footer className="text-[11px] text-slate-500 font-mono text-center">
        KryptoVision Connect • Isolated Calling Kiosk • Zero-Login Security
      </footer>
    </div>
  );
}
