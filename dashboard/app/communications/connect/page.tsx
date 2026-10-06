"use client";

import { useState, useEffect, useCallback, useRef } from 'react';
import { 
  Phone, PhoneOff, Video,
  ScreenShare, AlertCircle, User, Building2,
  Radio, Clock, CheckCircle2, RefreshCw, Laptop, 
  Smartphone, ShieldCheck, Camera, Disc, MessageSquare, 
  Send, Paperclip, Minimize2, Megaphone, X
} from 'lucide-react';
import { CallWorkspace } from '@/components/communications/call-workspace';
import { MediaDeviceCheck } from '@/components/communications/media-device-check';
import { IncomingCall, callerName } from '@/components/communications/incoming-call';
import { MessageInbox } from '@/components/communications/message-inbox';
import { useCallRingtone } from '@/hooks/use-call-ringtone';
import { communicationAPI } from '@/services/communication-api';
import { useCommunicationSignaling } from '@/hooks/use-communication-signaling';
import { useDirectMessages } from '@/hooks/use-direct-messages';
import { useWebRTCCall, type CallModality } from '@/hooks/use-webrtc-call';
import type { BranchContact, CallSession, CommunicationEmployee, WebRTCCredentials } from '@/services/communication-api';
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
  peerLabel: string;
}

type DeviceCallTarget =
  | { type: 'VMS'; label: string }
  | { type: 'VMS_USER'; id: string; label: string }
  | { type: 'BRANCH'; id: string; label: string }
  | { type: 'EMPLOYEE'; id: string; label: string };

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
  const [linkedEmployees, setLinkedEmployees] = useState<CommunicationEmployee[]>([]);
  const [deviceDirectory, setDeviceDirectory] = useState<BranchContact[]>([]);
  const [vmsUsers, setVmsUsers] = useState<CommunicationEmployee[]>([]);
  const [directMessageText, setDirectMessageText] = useState('');
  const [loadingCallDirectory, setLoadingCallDirectory] = useState(false);
  const [callTarget, setCallTarget] = useState<DeviceCallTarget>({ type: 'VMS', label: 'VMS Command Center' });
  
  // Registration setup state (when not enrolled)
  const [branches, setBranches] = useState<BranchOption[]>([]);
  const [selectedBranchId, setSelectedBranchId] = useState('');
  const [regMode, setRegMode] = useState<'BRANCH_COMMON' | 'EMPLOYEE_SPECIFIC'>('BRANCH_COMMON');
  const [selectedEmployeeId, setSelectedEmployeeId] = useState('');
  const [selectedEmployeeName, setSelectedEmployeeName] = useState('');
  const [customDeviceName, setCustomDeviceName] = useState('');
  const [enrollmentCode, setEnrollmentCode] = useState('');
  const [registering, setRegistering] = useState(false);
  const [loadingDirectory, setLoadingDirectory] = useState(false);

  // Calling state
  const [activeCall, setActiveCall] = useState<ActiveCall | null>(null);
  const activeCallRef = useRef<ActiveCall | null>(null);
  const offeredCallRef = useRef<string | null>(null);
  const [incomingCall, setIncomingCall] = useState<CallInviteEvent | null>(null);
  const [callDuration, setCallDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [callStarting, setCallStarting] = useState(false);
  const ringtone = useCallRingtone(!activeCall && !callStarting ? incomingCall?.callId : undefined);
  const [messageSending, setMessageSending] = useState(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const startingCallRef = useRef(false);

  // In-Call Tools Drawer (Chat, Evidence, CCTV inject)
  const [activeDrawer, setActiveDrawer] = useState<'none' | 'chat' | 'cctv'>('none');
  const [chatInputText, setChatInputText] = useState('');
  const [cctvCameras, setCctvCameras] = useState<{ id: string; name: string; branchName?: string }[]>([]);
  const [selectedCctvCameraId, setSelectedCctvCameraId] = useState('');
  const [paBroadcastActive, setPaBroadcastActive] = useState(false);

  // Media & WebRTC
  const signaling = useCommunicationSignaling('device');
  const webrtc = useWebRTCCall();
  const messageContactType = callTarget.type === 'VMS' ? undefined
    : callTarget.type === 'VMS_USER' ? 'OPERATOR' : callTarget.type === 'BRANCH' ? 'BRANCH' : 'DEVICE';
  const messageContactId = callTarget.type === 'VMS' ? undefined : callTarget.id;
  const { directMessages, messagesError, messageRouteMissing, messagesLoading, loadDirectMessages } =
    useDirectMessages(messageContactType, messageContactId, signaling.onMessageCreated, true,
      deviceEnrolled && deviceStatus === 'ACTIVE');
  const lastMessageId = directMessages.at(-1)?.id;
  useEffect(() => {
    const container = messageEndRef.current?.parentElement;
    if (container) container.scrollTop = container.scrollHeight;
  }, [lastMessageId]);

  const remoteVideoRef = useRef<HTMLVideoElement | null>(null);
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
      void communicationAPI.deviceHeartbeat().catch((heartbeatError) => {
        console.warn('[Connect Device] Heartbeat failed:', heartbeatError);
      });
    };
    sendHeartbeat();
    const timer = window.setInterval(sendHeartbeat, 20_000);
    return () => window.clearInterval(timer);
  }, [deviceEnrolled, deviceStatus]);

  useEffect(() => {
    if (!deviceEnrolled || deviceStatus !== 'PENDING') return;
    let cancelled = false;
    const checkApproval = async () => {
      const refreshToken = localStorage.getItem('commDeviceRefreshToken');
      if (!refreshToken) return;
      try {
        const response = await fetch('/v1/communications/devices/refresh', {
          method: 'POST', headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ refreshToken }),
        });
        if (!response.ok) return;
        const result = await response.json();
        if (cancelled) return;
        localStorage.setItem('commDeviceToken', result.accessToken);
        localStorage.setItem('commDeviceRefreshToken', result.refreshToken);
        if (result.status === 'ACTIVE' || result.status === 'OFFLINE') {
          localStorage.setItem('commDeviceStatus', 'ACTIVE');
          setDeviceStatus('ACTIVE');
          window.dispatchEvent(new Event('comm-device-enrolled'));
        }
      } catch {
        // Keep the setup screen visible until connectivity returns.
      }
    };
    void checkApproval();
    const timer = window.setInterval(() => void checkApproval(), 30_000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [deviceEnrolled, deviceStatus]);

  // An enrolled terminal receives a tenant-scoped directory using only its
  // signed device credential. No user session or password is involved.
  useEffect(() => {
    if (!deviceEnrolled || deviceStatus !== 'ACTIVE') {
      if (!deviceEnrolled) {
        setDeviceDirectory([]);
        setLinkedEmployees([]);
      }
      return;
    }
    setLoadingCallDirectory(true);
    void communicationAPI.getDeviceDirectory()
      .then(({ branches: callBranches, linkedEmployees: deviceEmployees, vmsUsers: users }) => {
        setDeviceDirectory(callBranches);
        setVmsUsers(users || []);
        setLinkedEmployees(deviceEmployees);
        if (deviceEmployees.length && !deviceEmployees.some((employee) => employee.employeeId === linkedEmployee?.id)) {
          const employee = deviceEmployees[0];
          const next = { id: employee.employeeId, name: employee.employeeName, role: employee.employeeRole };
          setLinkedEmployee(next);
          localStorage.setItem('commLinkedEmployee', JSON.stringify(next));
        }
      })
      .catch((directoryError) => {
        console.warn('[Connect Device] Failed to load callable directory', directoryError);
        setError('Unable to load the call directory. Check the device connection and try again.');
      })
      .finally(() => setLoadingCallDirectory(false));
  }, [deviceEnrolled, deviceStatus, linkedEmployee?.id]);

  // The single-use admin code supplies the branch. Setup needs no VMS session.
  const resolveEnrollmentCode = async () => {
    if (!enrollmentCode.trim()) throw new Error('Enter an enrollment code');
    setLoadingDirectory(true);
    try {
      const response = await fetch('/api/communications/devices/register', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ action: 'resolve', enrollmentCode }),
      });
      const data = await response.json();
      if (!response.ok || !data.success) throw new Error(data.error || 'Invalid enrollment code');
      setBranches([{ id: data.branchId, name: data.branchName, employees: [] }]);
      setSelectedBranchId(data.branchId);
      if (data.allowedDeviceType?.startsWith('EMPLOYEE_')) setRegMode('EMPLOYEE_SPECIFIC');
      else if (data.allowedDeviceType?.startsWith('BRANCH_')) setRegMode('BRANCH_COMMON');
      setError(null);
      return data;
    } finally {
      setLoadingDirectory(false);
    }
  };

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
      if (selectedEmployeeName.trim()) {
        setCustomDeviceName(`${selectedEmployeeName.trim()}'s Device`);
      }
    }
  }, [selectedBranchId, regMode, selectedEmployeeName, branches]);

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
      const resolved = await resolveEnrollmentCode();
      const curBranch = branches.find((b) => b.id === resolved.branchId) || { id: resolved.branchId, name: resolved.branchName };
      if (!curBranch) throw new Error('Please select a valid branch');

      let curEmployee = null;
      if (regMode === 'EMPLOYEE_SPECIFIC') {
        if (!selectedEmployeeId.trim() || !selectedEmployeeName.trim()) throw new Error('Enter the employee ID and name');
        curEmployee = { id: selectedEmployeeId.trim(), name: selectedEmployeeName.trim() };
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
      window.dispatchEvent(new Event('comm-device-enrolled'));

      checkEnrollment();
    } catch (err: any) {
      console.error('Registration error:', err);
      setError(err.message || 'Failed to activate device.');
    } finally {
      setRegistering(false);
    }
  };

  const handleResetDevice = async () => {
    if (confirm('Log out this device? An administrator must issue a new enrollment code to install it again.')) {
      try {
        await communicationAPI.logoutDevice();
      } catch (cause) {
        setError(cause instanceof Error ? cause.message : 'Unable to log out device while offline');
        return;
      }
      localStorage.removeItem('commDeviceToken');
      localStorage.removeItem('commDeviceRefreshToken');
      localStorage.removeItem('commDeviceUuid');
      localStorage.removeItem('commDeviceId');
      localStorage.removeItem('commDeviceName');
      localStorage.removeItem('commBranchId');
      localStorage.removeItem('commBranchName');
      localStorage.removeItem('commTenantId');
      localStorage.removeItem('commDeviceStatus');
      localStorage.removeItem('commDeviceMode');
      localStorage.removeItem('commLinkedEmployee');
      window.dispatchEvent(new Event('comm-device-enrolled'));
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
      setActiveCall(prev => prev ? { ...prev, session: { ...prev.session, status: 'CONNECTED' } } : null);
    });

    const unsubMediaReady = signaling.onCallMediaReady((event) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || event.callId !== currentCall.session.id || offeredCallRef.current === event.callId) return;
      offeredCallRef.current = event.callId;
      void (async () => {
        const offer = await webrtc.createOffer(currentCall.credentials, currentCall.modality, (candidate) => signaling.sendWebRtcIceCandidate(event.callId, candidate));
        if (offer) signaling.sendWebRtcOffer(event.callId, offer);
      })().catch((signalError) => setError(signalError instanceof Error ? signalError.message : 'Unable to start call media'));
    });

    const unsubOffer = signaling.onWebRtcOffer((event) => {
      const currentCall = activeCallRef.current;
      if (!currentCall || event.callId !== currentCall.session.id || !event.description) return;
      void (async () => {
        const answer = await webrtc.createAnswer(currentCall.credentials, event.description!, currentCall.modality, (candidate) => signaling.sendWebRtcIceCandidate(event.callId, candidate));
        if (answer) signaling.sendWebRtcAnswer(event.callId, answer);
      })().catch((signalError) => setError(signalError instanceof Error ? signalError.message : 'Unable to answer call media'));
    });
    const unsubAnswer = signaling.onWebRtcAnswer((event) => {
      if (activeCallRef.current?.session.id === event.callId && event.description) {
        void webrtc.applyAnswer(event.description).catch(() => setError('Unable to complete call media negotiation'));
      }
    });
    const unsubIce = signaling.onWebRtcIceCandidate((event) => {
      if (activeCallRef.current?.session.id === event.callId && event.candidate) {
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
      if (incomingCall?.callId === event.callId) setIncomingCall(null);
    });

    const unsubCancelled = signaling.onCallCancelled((event) => {
      if (incomingCall && event.callId === incomingCall.callId) {
        setIncomingCall(null);
      }
    });
    const unsubFailed = signaling.onCallFailed((event) => {
      if (incomingCall?.callId === event.callId) setIncomingCall(null);
      if (activeCall?.session.id === event.callId) { handleCallEnd(); setError(event.endReason || 'Call failed'); }
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
      unsubFailed();
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

  // 7. Make a password-less call as the registered device or current shift user.
  const handleStartCall = async (modality: CallModality, target: DeviceCallTarget = callTarget) => {
    if (startingCallRef.current || activeCallRef.current) return;
    startingCallRef.current = true; setCallStarting(true);
    let startedCallId: string | null = null;
    try {
      setError(null);
      if (deviceStatus !== 'ACTIVE') throw new Error('Device is awaiting administrator approval');
      if (modality === 'screenshare' && !(await webrtc.startScreenShare())) return;
      const stream = await webrtc.initializeMedia({
        audio: true,
        video: modality === 'video',
      });
      if (!stream) { webrtc.disconnect(); return; }

      const actorEmployeeId = linkedEmployees.some((employee) => employee.employeeId === linkedEmployee?.id)
        ? linkedEmployee?.id : undefined;

      const started = target.type === 'VMS'
        ? await communicationAPI.callVMS(actorEmployeeId)
        : target.type === 'VMS_USER'
          ? await communicationAPI.callDeviceEmployee(target.id, actorEmployeeId)
        : target.type === 'BRANCH'
          ? await communicationAPI.callDeviceBranch(target.id, actorEmployeeId)
          : await communicationAPI.callDeviceToDevice(target.id, actorEmployeeId);
      startedCallId = started.call.id;
      const nextCall = { session: started.call, credentials: started.credentials, startTime: new Date(), modality, peerLabel: target.label };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);
      await signaling.joinCall(started.call.id);

    } catch (err: any) {
      webrtc.disconnect();
      activeCallRef.current = null; setActiveCall(null);
      if (startedCallId) void communicationAPI.cancelCall(startedCallId, true).catch(() => {});
      console.error('[Connect Device] Call initiation failed:', err);
      setError(err.message || `Failed to call ${target.label}`);
    } finally { startingCallRef.current = false; setCallStarting(false); }
  };

  const handleSendDirectMessage = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!directMessageText.trim() || deviceStatus !== 'ACTIVE' || messageSending) return;
    if (callTarget.type === 'VMS') {
      setError('Select a named VMS user, employee device, or branch to message.');
      return;
    }
    try {
      setMessageSending(true);
      const recipientType = callTarget.type === 'VMS_USER' ? 'OPERATOR' : callTarget.type === 'BRANCH' ? 'BRANCH' : 'DEVICE';
      await communicationAPI.sendDirectMessage(recipientType, callTarget.id, directMessageText.trim(), true);
      setDirectMessageText('');
      await loadDirectMessages();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Message could not be sent');
    } finally { setMessageSending(false); }
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
    if (!incomingCall || startingCallRef.current || activeCallRef.current) return;
    startingCallRef.current = true; setCallStarting(true);
    let acceptedCallId: string | null = null;
    try {
      setError(null);
      const stream = await webrtc.initializeMedia({ audio: true, video: modality === 'video' });
      if (!stream) return;
      const { call, credentials } = await communicationAPI.acceptCall(incomingCall.callId, true);
      acceptedCallId = call.id;

      const nextCall = {
        session: call,
        credentials,
        startTime: new Date(),
        modality,
        peerLabel: incomingCall.caller?.name || incomingCall.sourceEmployeeName || incomingCall.sourceBranchName || 'Incoming caller',
      };
      activeCallRef.current = nextCall;
      setActiveCall(nextCall);

      setIncomingCall(null);
      await signaling.joinCall(call.id);
      signaling.sendCallMediaReady(call.id);
    } catch (err: any) {
      webrtc.disconnect();
      activeCallRef.current = null; setActiveCall(null);
      if (acceptedCallId) void communicationAPI.endCall(acceptedCallId, true).catch(() => {});
      console.error('[Connect Device] Failed to accept call:', err);
      setError(err.message || 'Failed to accept call');
      setIncomingCall(null);
    } finally { startingCallRef.current = false; setCallStarting(false); }
  };

  const handleRejectCall = async () => {
    if (!incomingCall) return;
    try {
      await communicationAPI.rejectCall(incomingCall.callId, undefined, true);
      setIncomingCall(null);
    } catch {
      setIncomingCall(null);
    }
  };

  const handleEndCall = async () => {
    if (!activeCall) return;
    try {
      if (activeCall.session.status === 'CONNECTED' || webrtc.state === 'CONNECTED') await communicationAPI.endCall(activeCall.session.id, true);
      else await communicationAPI.cancelCall(activeCall.session.id, true);
      handleCallEnd();
    } catch {
      handleCallEnd();
    }
  };

  const handleCallEnd = () => {
    webrtc.disconnect();
    activeCallRef.current = null;
    offeredCallRef.current = null;
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
            {/* The enrollment code fixes the branch identity. */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-blue-400" />
                Assigned Branch
              </label>
              <div className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-sm">
                {loadingDirectory ? 'Checking code...' : selectedBranch?.name || 'Verify the enrollment code to load its VMS branch'}
              </div>
              <p className="text-[11px] leading-snug text-slate-500">
                The administrator selects a branch from the VMS branch list when creating your enrollment code. Verify that code below to assign this device to the same branch.
              </p>
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
            {regMode === 'EMPLOYEE_SPECIFIC' && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <User className="w-4 h-4 text-blue-400" />
                  Employee ID and name
                </label>
                <input
                  value={selectedEmployeeId}
                  onChange={(e) => setSelectedEmployeeId(e.target.value)}
                  placeholder="Employee ID"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500"
                  required
                />
                <input value={selectedEmployeeName} onChange={(e) => setSelectedEmployeeName(e.target.value)}
                  placeholder="Employee name" className="w-full px-3.5 py-2.5 rounded-xl bg-slate-800 border border-slate-700 text-white text-sm focus:outline-none focus:border-blue-500" required />
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
              <button type="button" onClick={() => void resolveEnrollmentCode().catch((cause) => setError(cause instanceof Error ? cause.message : 'Unable to verify code'))}
                disabled={loadingDirectory || !enrollmentCode.trim()} className="mt-2 text-xs text-blue-300 disabled:opacity-50">Verify code and branch</button>
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
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col p-4 sm:p-6">
      {/* Top Status Bar */}
      <header className="w-full max-w-6xl mx-auto flex flex-wrap gap-4 items-center justify-between py-3 px-4 rounded-2xl bg-slate-900/80 border border-slate-800/80 backdrop-blur-md">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl border border-slate-700 bg-slate-800 flex items-center justify-center text-blue-300"><Phone className="w-5 h-5" /></div>
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
                <span className="flex items-center gap-1 text-blue-400 font-medium">
                  • <User className="w-3 h-3" /> {linkedEmployee.name}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button type="button" data-comm-ringtone-control onClick={ringtone.toggleSound} aria-pressed={ringtone.enabled && ringtone.ready}
            className="text-xs px-3 py-2 rounded-xl border border-slate-700 text-slate-200">
            {ringtone.enabled && ringtone.ready ? 'Ringtone on' : 'Enable ringtone'}
          </button>
          <MediaDeviceCheck disabled={callStarting || !!activeCall} />
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
            Log out device
          </button>
        </div>
      </header>
      <div className="w-full max-w-6xl mx-auto">
        <MessageInbox subscribe={signaling.onMessageCreated} identityId={deviceId} isDevice
          enabled={deviceEnrolled && deviceStatus === 'ACTIVE'} onOpen={message => {
            setCallTarget({ type: message.senderType === 'OPERATOR' ? 'VMS_USER' : 'EMPLOYEE',
              id: message.senderId, label: message.senderName || 'Team member' });
          }} />
      </div>

      {deviceStatus !== 'ACTIVE' && (
        <div className="w-full max-w-6xl mx-auto mt-3 rounded-xl border border-amber-500/30 bg-amber-500/10 px-4 py-3 text-sm text-amber-200">
          This device is registered and awaiting administrator approval. Calling becomes available after approval.
        </div>
      )}

      {/* Main Calling Stage */}
      <main className="w-full max-w-6xl mx-auto my-auto py-4">
        {webrtc.error && !activeCall && <div role="alert" className="mb-5 rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-300 flex items-center gap-2">
          <AlertCircle className="w-4 h-4 shrink-0" />{webrtc.error}
        </div>}
        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex items-center gap-2 max-w-lg mx-auto">
            <AlertCircle className="w-5 h-5 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {/* ACTIVE CALL STAGE */}
        {activeCall ? (
          <div className="w-full space-y-4">
            {/* Video Canvas Container & Side Drawer */}
            <div className="grid grid-cols-1 lg:grid-cols-4 gap-4">
              <div className={activeDrawer !== 'none' ? 'lg:col-span-3' : 'lg:col-span-4'}>
                <CallWorkspace media={webrtc} peerName={activeCall.peerLabel}
                  status={activeCall.session.status} duration={formatCallDuration(callDuration)}
                  onEnd={() => void handleEndCall()} remoteVideoRef={remoteVideoRef} />
              </div>

              {/* In-Call Side Drawer (Chat / CCTV Inject) */}
              {activeDrawer !== 'none' && (
                <div className="lg:col-span-1 bg-slate-950 border border-slate-800 rounded-2xl flex flex-col h-full max-h-[380px] p-3 space-y-3">
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <span className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
                      {activeDrawer === 'chat' ? <MessageSquare className="w-3.5 h-3.5 text-blue-400" /> : <Camera className="w-3.5 h-3.5 text-blue-400" />}
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
                              ? 'border-blue-500 bg-blue-500/10 text-white font-medium'
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
                      ? 'bg-blue-500 text-slate-950 scale-105 shadow-xl shadow-blue-500/30 ring-4 ring-blue-500/30'
                      : 'bg-blue-600/20 text-blue-400 border border-blue-500/40 hover:bg-blue-600/30'
                  }`}
                  title="Hold to talk (Spacebar also supported)"
                >
                  <Radio className={`w-4 h-4 ${webrtc.isPttActive ? 'animate-spin' : ''}`} />
                  {webrtc.isPttActive ? 'Transmitting...' : 'Hold PTT to Talk'}
                </button>
              ) : null}

              {/* PTT Mode Switch */}
              <button
                onClick={() => webrtc.setIsPttMode(!webrtc.isPttMode)}
                className={`p-3 px-3 rounded-2xl text-xs font-medium border transition-all ${
                  webrtc.isPttMode
                    ? 'border-blue-500/40 bg-blue-500/10 text-blue-300'
                    : 'border-slate-800 bg-slate-800/80 text-slate-400 hover:text-white'
                }`}
                title="Toggle Walkie-Talkie Push-to-Talk Mode"
              >
                PTT Mode: {webrtc.isPttMode ? 'ON' : 'OFF'}
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
                    ? 'bg-blue-600 text-white border-blue-500'
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

            </div>
          </div>
        ) : (
          /* IDLE / READY FOR CALL STAGE */
          <div className="space-y-6 text-center">
            <div className="space-y-2">
              <h2 className="text-2xl font-semibold tracking-tight text-white">Call {callTarget.label}</h2>
              <p className="text-sm text-slate-400 max-w-md mx-auto">
                Choose a VMS user, employee, or branch—then select your calling mode.
              </p>
            </div>

            <div className="max-w-3xl mx-auto rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-left">
              <label htmlFor="device-call-target" className="mb-2 block text-xs font-semibold uppercase tracking-wider text-slate-400">
                Call destination
              </label>
              <select
                id="device-call-target"
                value={callTarget.type === 'VMS' ? 'VMS' : `${callTarget.type}:${callTarget.id}`}
                onChange={(event) => {
                  const value = event.target.value;
                  if (value === 'VMS') return setCallTarget({ type: 'VMS', label: 'VMS Command Center' });
                  const [type, id] = value.split(':') as ['BRANCH' | 'EMPLOYEE' | 'VMS_USER', string];
                  if (type === 'BRANCH') {
                    const branch = deviceDirectory.find((entry) => entry.branchId === id);
                    if (branch) setCallTarget({ type, id, label: branch.branchName });
                  } else if (type === 'VMS_USER') {
                    const user = vmsUsers.find((entry) => entry.employeeId === id);
                    if (user) setCallTarget({ type, id, label: user.employeeName });
                  } else {
                    const employee = deviceDirectory.flatMap((branch) => branch.employees).find((entry) => entry.deviceId === id);
                    if (employee) setCallTarget({ type, id, label: employee.employeeName });
                  }
                }}
                disabled={loadingCallDirectory}
                className="w-full rounded-xl border border-slate-600 bg-slate-950 px-3 py-3 text-sm text-white outline-none focus:border-blue-500 disabled:opacity-60"
              >
                <option value="VMS">VMS Command Center</option>
                {vmsUsers.length > 0 && <optgroup label="VMS users">
                  {vmsUsers.map((user) => (
                    <option key={`vms-${user.employeeId}`} value={`VMS_USER:${user.employeeId}`}>
                      {user.employeeName}{user.presence === 'OFFLINE' ? ' — offline for calls' : ''}
                    </option>
                  ))}
                </optgroup>}
                {deviceDirectory.length > 0 && <optgroup label="Branches">
                  {deviceDirectory.map((branch) => (
                    <option key={`branch-${branch.branchId}`} value={`BRANCH:${branch.branchId}`}>
                      {branch.branchName}{branch.onlineDeviceCount === 0 ? ' — offline' : ` — ${branch.onlineDeviceCount} device${branch.onlineDeviceCount === 1 ? '' : 's'} online`}
                    </option>
                  ))}
                </optgroup>}
                {deviceDirectory.length > 0 && <optgroup label="Employees">
                  {deviceDirectory.flatMap((branch) => branch.employees).map((employee) => (
                    <option key={`employee-${employee.deviceId}`} value={`EMPLOYEE:${employee.deviceId}`} disabled={!employee.deviceId}>
                      {employee.employeeName} · {employee.branchName}{employee.onlineDeviceCount === 0 ? ' — offline' : ''}
                    </option>
                  ))}
                </optgroup>}
              </select>
              {linkedEmployees.length > 1 && (
                <div className="mt-3 flex items-center gap-3">
                  <label htmlFor="shift-user" className="shrink-0 text-xs text-slate-400">Currently using</label>
                  <select
                    id="shift-user"
                    value={linkedEmployee?.id || ''}
                    onChange={(event) => {
                      const employee = linkedEmployees.find((entry) => entry.employeeId === event.target.value);
                      if (!employee) return;
                      const next = { id: employee.employeeId, name: employee.employeeName, role: employee.employeeRole };
                      setLinkedEmployee(next);
                      localStorage.setItem('commLinkedEmployee', JSON.stringify(next));
                    }}
                    className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
                  >
                    {linkedEmployees.map((employee) => <option key={employee.employeeId} value={employee.employeeId}>{employee.employeeName}</option>)}
                  </select>
                </div>
              )}
            </div>

            {/* 3 Main Calling Options Grid */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl mx-auto">
              {/* Option 1: Video Call */}
              <button
                onClick={() => void handleStartCall('video', callTarget)}
                disabled={deviceStatus !== 'ACTIVE' || !signaling.connected || callStarting}
                className="group p-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/60 transition-colors text-left space-y-3 flex flex-col items-start disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-300 flex items-center justify-center border border-blue-500/20">
                  <Video className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Video Call</h3>
                  <p className="text-xs text-slate-400 mt-1">Meet face to face with your selected contact</p>
                </div>
                <span className="text-[11px] font-semibold text-blue-400 group-hover:text-blue-300 flex items-center gap-1 pt-1">
                  Start Video Call &rarr;
                </span>
              </button>

              {/* Option 2: Audio Voice Call */}
              <button
                onClick={() => void handleStartCall('audio', callTarget)}
                disabled={deviceStatus !== 'ACTIVE' || !signaling.connected || callStarting}
                className="group p-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/60 transition-colors text-left space-y-3 flex flex-col items-start disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-300 flex items-center justify-center border border-blue-500/20">
                  <Phone className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Audio Call</h3>
                  <p className="text-xs text-slate-400 mt-1">Connect by voice, with camera off</p>
                </div>
                <span className="text-[11px] font-semibold text-blue-400 group-hover:text-blue-300 flex items-center gap-1 pt-1">
                  Start Voice Call &rarr;
                </span>
              </button>

              {/* Option 3: Screen Sharing */}
              <button
                onClick={() => void handleStartCall('screenshare', callTarget)}
                disabled={deviceStatus !== 'ACTIVE' || !signaling.connected || callStarting}
                className="group p-5 rounded-2xl bg-slate-900 hover:bg-slate-800 border border-slate-700 hover:border-blue-500/60 transition-colors text-left space-y-3 flex flex-col items-start disabled:opacity-40 disabled:cursor-not-allowed"
              >
                <div className="w-11 h-11 rounded-xl bg-blue-500/10 text-blue-300 flex items-center justify-center border border-blue-500/20">
                  <ScreenShare className="w-8 h-8" />
                </div>
                <div>
                  <h3 className="text-base font-bold text-white">Screen Share</h3>
                  <p className="text-xs text-slate-400 mt-1">Present a screen, window, or browser tab</p>
                </div>
                <span className="text-[11px] font-semibold text-purple-400 group-hover:text-purple-300 flex items-center gap-1 pt-1">
                  Start Screen Share &rarr;
                </span>
              </button>
            </div>

            <section className="max-w-3xl mx-auto rounded-2xl border border-slate-700 bg-slate-900/70 p-4 text-left space-y-3">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-white"><MessageSquare className="h-4 w-4 text-blue-400" /> Messages</h3>
              <div className="max-h-48 overflow-y-auto space-y-2" aria-live="polite">
                {callTarget.type === 'VMS' ? <p className="text-xs text-slate-400">Select a named user, employee, or branch to view messages.</p> :
                  messagesError ? <p role="status" className="text-xs text-red-300">{messagesError}</p> :
                  messagesLoading ? <p className="text-xs text-slate-400">Loading messages...</p> :
                  directMessages.length === 0 ? <p className="text-xs text-slate-400">No messages yet.</p> :
                  directMessages.map((message) => (
                    <div key={message.id} className={`w-fit max-w-[85%] rounded-xl px-3 py-2 text-xs ${message.isOwn || message.senderId === deviceId ? 'ml-auto bg-blue-900/50' : 'bg-slate-800'}`}>
                      <div className="text-slate-400">{message.senderId === deviceId ? 'You' : message.senderName || message.senderType} · {new Date(message.createdAt).toLocaleString()}</div>
                      <p className="mt-1 text-slate-100 whitespace-pre-wrap break-words">{message.body}</p>
                    </div>
                  ))}
                <div ref={messageEndRef} />
              </div>
              <form onSubmit={handleSendDirectMessage} className="flex gap-2">
                <input value={directMessageText} onChange={(event) => setDirectMessageText(event.target.value)}
                  maxLength={4000} placeholder={callTarget.type === 'VMS' ? 'Select a named user, employee, or branch to message' : `Message ${callTarget.label}`}
                  className="min-w-0 flex-1 rounded-lg border border-slate-700 bg-slate-950 px-3 py-2 text-sm text-white" />
                <button type="submit" aria-label={messageSending ? 'Sending message' : 'Send message'} disabled={messageSending || messageRouteMissing || deviceStatus !== 'ACTIVE' || !directMessageText.trim() || callTarget.type === 'VMS'}
                  className="rounded-lg bg-blue-600 px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"><Send className="h-4 w-4" /></button>
              </form>
            </section>

            {/* Inbound Call Alert Notice */}
            <div className="p-4 rounded-2xl bg-slate-900/60 border border-slate-800 max-w-md mx-auto flex items-center justify-center gap-2 text-xs text-slate-400">
              <ShieldCheck className="w-4 h-4 text-blue-400" />
              <span>
                {deviceMode === 'EMPLOYEE_SPECIFIC'
                  ? `Direct calls to ${linkedEmployee?.name || 'this employee'} will ring here.`
                  : `All calls to ${branchName} will ring this device.`}
              </span>
            </div>
          </div>
        )}
      </main>

      {incomingCall && !activeCall && <IncomingCall call={incomingCall} name={callerName(incomingCall)}
        destination={deviceMode === 'EMPLOYEE_SPECIFIC' ? linkedEmployee?.name : branchName}
        busy={callStarting} soundReady={ringtone.enabled && ringtone.ready} onEnableSound={ringtone.enableSound}
        onAccept={mode => void handleAcceptCall(mode)} onDecline={() => void handleRejectCall()} />}

      {/* Footer info */}
      <footer className="text-[11px] text-slate-500 font-mono text-center">
        KryptoVision Connect • Isolated Calling Kiosk • Zero-Login Security
      </footer>
    </div>
  );
}
