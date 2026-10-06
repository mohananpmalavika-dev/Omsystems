"use client";

import { useEffect, useRef } from 'react';
import { Phone, PhoneOff, ShieldCheck, Video, Volume2 } from 'lucide-react';
import type { CallInviteEvent } from '@/hooks/use-communication-signaling';
import styles from './communications.module.css';

export function callerName(call: CallInviteEvent, fallback?: string) {
  return call.caller?.name?.trim() || call.sourceEmployeeName || call.sourceBranchName || fallback || 'Unknown caller';
}

export function IncomingCall({ call, name, destination, busy, soundReady, onEnableSound, onAccept, onDecline }: {
  call: CallInviteEvent;
  name: string;
  destination?: string;
  busy: boolean;
  soundReady: boolean;
  onEnableSound: () => void;
  onAccept: (mode: 'audio' | 'video') => void;
  onDecline: () => void;
}) {
  const dialog = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const previousFocus = document.activeElement as HTMLElement | null;
    dialog.current?.focus();
    return () => previousFocus?.focus();
  }, []);
  const initials = name.split(/\s+/).slice(0, 2).map(word => word[0]).join('').toUpperCase();
  const source = call.caller?.type === 'OPERATOR' || call.sourceOperatorId ? 'Command center operator'
    : call.caller?.type === 'EMPLOYEE' ? 'Team member' : 'Branch intercom';
  return <div className={styles.incomingOverlay}>
    <div ref={dialog} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="incoming-caller-name"
      aria-describedby="incoming-call-description" className={styles.incomingDialog} onKeyDown={event => {
        if (event.key !== 'Tab') return;
        const buttons = Array.from(dialog.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
        const first = buttons[0], last = buttons[buttons.length - 1];
        if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog.current)) { event.preventDefault(); last?.focus(); }
        else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialog.current)) { event.preventDefault(); first?.focus(); }
      }}>
      <div className={styles.incomingTop}><span><span className={styles.ringingDot} /> Incoming call</span><ShieldCheck size={18} /></div>
      <div className={styles.callerAvatar}>{initials}<span><Phone size={17} /></span></div>
      <h2 id="incoming-caller-name">{name}</h2>
      <p className={styles.callerSource}>{source}</p>
      <p id="incoming-call-description" className={styles.incomingDescription}>
        {destination ? `Calling ${destination}` : 'Choose how you would like to answer'}
      </p>
      {!soundReady && <button type="button" data-comm-ringtone-control className={styles.enableRingtone} onClick={onEnableSound}><Volume2 size={16} /> Enable ringtone</button>}
      <div className={styles.incomingActions}>
        <button type="button" className={styles.declineCall} disabled={busy} onClick={onDecline}><PhoneOff size={22} /><span>Decline</span></button>
        <button type="button" className={styles.answerVideo} disabled={busy} onClick={() => onAccept('video')}><Video size={22} /><span>Answer video</span></button>
        <button type="button" className={styles.answerVoice} disabled={busy} onClick={() => onAccept('audio')}><Phone size={22} /><span>Answer voice</span></button>
      </div>
      <div className={styles.incomingFooter}>{busy ? 'Connecting your call…' : 'Secure workspace calling'}</div>
    </div>
  </div>;
}
