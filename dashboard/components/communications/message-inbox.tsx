"use client";

import { useEffect, useState } from 'react';
import { ChevronRight, MessageSquare } from 'lucide-react';
import { communicationAPI, type DirectMessage } from '@/services/communication-api';
import type { CommunicationSignalingHook } from '@/hooks/use-communication-signaling';
import styles from './communications.module.css';

// Keep received messages visible even when another contact is selected. Polling
// also catches persisted messages after a dropped socket or a background tab.
export function MessageInbox({ subscribe, identityId, isDevice = false, enabled = true, onOpen }: {
  subscribe: CommunicationSignalingHook['onMessageCreated'];
  identityId: string | null;
  isDevice?: boolean;
  enabled?: boolean;
  onOpen: (message: DirectMessage) => void;
}) {
  const [messages, setMessages] = useState<DirectMessage[]>([]);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!enabled) { setMessages([]); return; }
    let cancelled = false;
    let loading = false;
    let refreshPending = false;
    const load = async () => {
      if (loading) { refreshPending = true; return; }
      loading = true;
      try {
        const result = await communicationAPI.getDirectMessages(isDevice);
        if (!cancelled) { setMessages(result); setError(null); }
      } catch {
        if (!cancelled) setError('Unable to load your inbox. Retrying…');
      } finally {
        loading = false;
        if (refreshPending && !cancelled) { refreshPending = false; void load(); }
      }
    };
    void load();
    const unsubscribe = subscribe(() => { void load(); });
    const refresh = () => { if (!document.hidden) void load(); };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      cancelled = true;
      unsubscribe();
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, [subscribe, isDevice, enabled]);

  if (!enabled) return null;
  const latest = new Map<string, DirectMessage>();
  for (const message of messages) {
    if (message.isOwn || message.senderId === identityId) continue;
    latest.set(`${message.senderType}:${message.senderId}`, message);
  }
  const received = [...latest.values()].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt));
  return <section className={styles.messageInbox} aria-label="Received messages">
    <div className={styles.inboxHeading}><MessageSquare size={17} /><h2>Received messages</h2><span>{received.length}</span></div>
    {error && <p role="status" className={styles.inboxEmpty}>{error}</p>}
    {!error && received.length === 0 && <p className={styles.inboxEmpty}>Incoming messages will appear here. Select a contact below to start a conversation.</p>}
    <div className={styles.inboxList} aria-live="polite">
      {received.map(message => <button type="button" key={`${message.senderType}:${message.senderId}`} onClick={() => onOpen(message)} className={styles.inboxMessage}>
        <span className={styles.inboxAvatar}>{(message.senderName || 'Team member').slice(0, 1).toUpperCase()}</span>
        <span className={styles.inboxPreview}><strong>{message.senderName || 'Team member'}</strong><span>{message.body}</span></span>
        <time dateTime={message.createdAt}>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</time><ChevronRight size={16} />
      </button>)}
    </div>
  </section>;
}
