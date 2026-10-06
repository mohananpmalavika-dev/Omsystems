import { useCallback, useEffect, useRef, useState } from 'react';
import { communicationAPI, type DirectMessage } from '@/services/communication-api';
import type { CommunicationSignalingHook } from '@/hooks/use-communication-signaling';

interface MessageThread {
  key: string;
  messages: DirectMessage[];
  error: string | null;
  routeMissing: boolean;
}

export function useDirectMessages(
  contactType: DirectMessage['recipientType'] | undefined,
  contactId: string | undefined,
  onMessageCreated: CommunicationSignalingHook['onMessageCreated'],
  isDevice = false,
  enabled = true,
) {
  const key = `${isDevice}:${contactType || ''}:${contactId || ''}`;
  const [thread, setThread] = useState<MessageThread | null>(null);
  const refreshRef = useRef<(() => Promise<void>) | null>(null);
  const loadDirectMessages = useCallback(async () => { await refreshRef.current?.(); }, []);

  useEffect(() => {
    if (!enabled || !contactType || !contactId) return;
    let cancelled = false;
    let requestNumber = 0;
    let routeMissing = false;
    const load = async () => {
      const currentRequest = ++requestNumber;
      try {
        const messages = await communicationAPI.getDirectMessages(isDevice, { type: contactType, id: contactId });
        if (cancelled || currentRequest !== requestNumber) return;
        routeMissing = false;
        setThread({ key, messages, error: null, routeMissing: false });
      } catch (cause) {
        if (cancelled || currentRequest !== requestNumber) return;
        routeMissing = cause instanceof Error && 'status' in cause && cause.status === 404;
        setThread({ key, messages: [], routeMissing, error: routeMissing
          ? 'Messaging is unavailable on this server.'
          : 'Unable to load messages. Please refresh to retry.' });
      }
    };
    refreshRef.current = load;
    void load();
    const refresh = () => { if (!routeMissing && !document.hidden) void load(); };
    const timer = window.setInterval(refresh, 5000);
    window.addEventListener('focus', refresh);
    document.addEventListener('visibilitychange', refresh);
    const unsubscribe = onMessageCreated(() => { if (!routeMissing) void load(); });
    return () => {
      cancelled = true;
      window.clearInterval(timer);
      window.removeEventListener('focus', refresh);
      document.removeEventListener('visibilitychange', refresh);
      unsubscribe();
      if (refreshRef.current === load) refreshRef.current = null;
    };
  }, [key, contactType, contactId, isDevice, enabled, onMessageCreated]);

  // Hide the previous contact immediately, even before effect cleanup runs.
  const current = enabled && contactType && contactId && thread?.key === key ? thread : null;
  return {
    directMessages: current?.messages || [],
    messagesError: current?.error || null,
    messageRouteMissing: current?.routeMissing || false,
    messagesLoading: Boolean(enabled && contactType && contactId && !current),
    loadDirectMessages,
  };
}
