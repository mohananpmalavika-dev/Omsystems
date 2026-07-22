"use client";

import React, { createContext, useContext, useCallback, useState } from "react";

type Toast = { id: string; message: string; type: "success" | "error" | "info" };

type Notifications = {
  showToast: (message: string, type?: Toast["type"]) => void;
  confirm: (message: string, title?: string) => Promise<boolean>;
};

const NotificationsContext = createContext<Notifications | null>(null);

export const useNotifications = () => {
  const ctx = useContext(NotificationsContext);
  if (!ctx) throw new Error("useNotifications must be used within NotificationsProvider");
  return ctx;
};

export function NotificationsProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [confirmState, setConfirmState] = useState<{
    open: boolean;
    message?: string;
    title?: string;
    resolve?: (value: boolean) => void;
  }>({ open: false });

  const showToast = useCallback((message: string, type: Toast["type"] = "info") => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
    const t: Toast = { id, message, type };
    setToasts((s) => [t, ...s]);
    // Auto-dismiss
    setTimeout(() => setToasts((s) => s.filter((x) => x.id !== id)), 4000);
  }, []);

  const confirm = useCallback((message: string, title?: string) => {
    return new Promise<boolean>((resolve) => {
      setConfirmState({ open: true, message, title, resolve });
    });
  }, []);

  const handleConfirm = (val: boolean) => {
    if (confirmState.resolve) confirmState.resolve(val);
    setConfirmState({ open: false });
  };

  return (
    <NotificationsContext.Provider value={{ showToast, confirm }}>
      {children}

      {/* Toast container */}
      <div style={{ position: "fixed", right: 20, bottom: 20, zIndex: 9999 }}>
        {toasts.map((t) => (
          <div key={t.id} style={{ marginTop: 8 }}>
            <div style={{ background: t.type === "error" ? "#7f1d1d" : t.type === "success" ? "#064e3b" : "#1f2937", color: "white", padding: "8px 12px", borderRadius: 6 }}>
              {t.message}
            </div>
          </div>
        ))}
      </div>

      {/* Confirm modal */}
      {confirmState.open && (
        <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.5)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 10000 }}>
          <div style={{ background: "#111", padding: 20, borderRadius: 8, width: 420 }}>
            {confirmState.title && <h3 style={{ margin: 0 }}>{confirmState.title}</h3>}
            <p style={{ color: "#cbd5e1" }}>{confirmState.message}</p>
            <div style={{ display: "flex", gap: 8, justifyContent: "flex-end", marginTop: 12 }}>
              <button onClick={() => handleConfirm(false)}>Cancel</button>
              <button onClick={() => handleConfirm(true)}>Confirm</button>
            </div>
          </div>
        </div>
      )}
    </NotificationsContext.Provider>
  );
}
