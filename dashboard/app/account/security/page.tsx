"use client";

import { useCallback, useEffect, useState } from "react";
import { LogOut, MonitorSmartphone, RefreshCw, ShieldCheck, Trash2 } from "lucide-react";
import { AppLayout } from "@/components/app-layout";
import { PageHero } from "@/components/page-hero";
import { authApi } from "@/lib/api-client";

type Session = Awaited<ReturnType<typeof authApi.listSessions>>["data"][number];
export default function AccountSecurityPage() {
  const [sessions, setSessions] = useState<Session[]>([]); const [error, setError] = useState("");
  const load = useCallback(async()=>{try{setSessions((await authApi.listSessions()).data);setError("");}catch(e){setError(e instanceof Error?e.message:"Unable to load sessions.");}},[]);
  useEffect(()=>{void load();},[load]);
  async function revoke(id:string){await authApi.revokeSession(id);await load();}
  async function logoutAll(){await authApi.logoutAll();window.location.assign("/login");}
  return <AppLayout><main className="account-security-page space-y-6 p-6">
    <PageHero eyebrow="Account security" title="Active sessions" description="Review devices signed into your account and revoke anything unfamiliar." icon={ShieldCheck} actions={<button className="btn-secondary flex items-center gap-2" onClick={()=>void load()}><RefreshCw size={16}/>Refresh</button>} />
    {error && <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700" role="alert">{error}</div>}
    <section className="card" aria-label="Active account sessions"><div className="divide-y">
      {sessions.map((session)=><article key={session.id} className="flex flex-wrap items-center justify-between gap-3 py-4"><div className="flex gap-3"><span className="rounded-lg bg-blue-50 p-2 text-blue-700"><MonitorSmartphone size={20}/></span><div><strong className="block text-sm">{session.userAgent || "Unknown device"}</strong><span className="text-xs text-gray-500">{session.ipAddress || "Unknown IP"} · Last active {new Date(session.lastActivityAt).toLocaleString()}</span></div></div><button className="btn-secondary flex items-center gap-2" onClick={()=>void revoke(session.id)} aria-label="Revoke this session"><Trash2 size={15}/>Revoke</button></article>)}
      {!sessions.length&&!error&&<p className="py-8 text-center text-sm text-gray-500">No active sessions found.</p>}
    </div></section>
    <section className="card flex flex-wrap items-center justify-between gap-3"><div className="flex gap-3"><ShieldCheck className="text-amber-600"/><div><strong>Sign out everywhere</strong><p className="text-xs text-gray-500">Immediately revoke every session, including this device.</p></div></div><button className="btn-secondary flex items-center gap-2" onClick={()=>void logoutAll()}><LogOut size={16}/>Sign out all sessions</button></section>
  </main></AppLayout>;
}
