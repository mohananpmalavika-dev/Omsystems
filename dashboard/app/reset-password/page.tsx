"use client";

import Link from "next/link";
import { FormEvent, useState, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { authApi } from "@/lib/api-client";

function ResetPasswordForm() {
  const token = useSearchParams()?.get("token") ?? "";
  const [password, setPassword] = useState(""); const [confirm, setConfirm] = useState("");
  const [message, setMessage] = useState(token ? "" : "This reset link is invalid.");
  const [done, setDone] = useState(false); const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (password !== confirm) return setMessage("Passwords do not match.");
    setBusy(true); setMessage("");
    try { setMessage((await authApi.resetPassword(token, password)).message); setDone(true); }
    catch (error) { setMessage(error instanceof Error ? error.message : "Password reset failed."); }
    finally { setBusy(false); }
  }
  return <main className="login-container"><section className="login-card" aria-labelledby="new-password-heading">
    <div className="login-brand"><ShieldCheck size={32}/><h1 id="new-password-heading">Choose a new password</h1></div>
    {message && <div className={done ? "form-info-banner" : "login-error"} role="status">{message}</div>}
    {!done && token && <form className="login-form" onSubmit={submit}>
      <div className="form-group"><label htmlFor="password">New password</label><input id="password" type="password" autoComplete="new-password" minLength={8} maxLength={100} required value={password} onChange={(e)=>setPassword(e.target.value)}/></div>
      <div className="form-group"><label htmlFor="confirm">Confirm password</label><input id="confirm" type="password" autoComplete="new-password" required value={confirm} onChange={(e)=>setConfirm(e.target.value)}/></div>
      <button className="login-button" disabled={busy}>{busy ? "Resetting…" : "Reset password"}</button>
    </form>}
    <p className="login-help"><Link href="/login">Return to sign in</Link></p>
  </section></main>;
}

export default function ResetPasswordPage() {
  return (
    <Suspense fallback={<div className="login-container"><section className="login-card"><div className="login-brand"><ShieldCheck size={32}/><h1>Loading...</h1></div></section></div>}>
      <ResetPasswordForm />
    </Suspense>
  );
}
