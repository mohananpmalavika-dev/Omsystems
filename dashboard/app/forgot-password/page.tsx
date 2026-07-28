"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ShieldCheck } from "lucide-react";
import { authApi } from "@/lib/api-client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [tenantSlug, setTenantSlug] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage("");
    try { setMessage((await authApi.requestPasswordReset(email, tenantSlug)).message); }
    catch { setMessage("Unable to submit the request. Please try again."); }
    finally { setBusy(false); }
  }

  return <main className="login-container"><section className="login-card" aria-labelledby="reset-heading">
    <div className="login-brand"><ShieldCheck size={32}/><h1 id="reset-heading">Reset password</h1></div>
    <p className="login-subtitle">Enter your account email. If it matches an account, we will send a one-time reset link.</p>
    {message && <div className="form-info-banner" role="status">{message}</div>}
    <form className="login-form" onSubmit={submit}>
      <div className="form-group"><label htmlFor="email">Email</label><input id="email" type="email" autoComplete="email" required value={email} onChange={(e)=>setEmail(e.target.value)}/></div>
      <div className="form-group"><label htmlFor="tenantSlug">Organization code <span className="optional-label">(optional)</span></label><input id="tenantSlug" value={tenantSlug} onChange={(e)=>setTenantSlug(e.target.value)}/></div>
      <button className="login-button" disabled={busy}>{busy ? "Sending…" : "Send reset link"}</button>
    </form>
    <p className="login-help"><Link href="/login">← Back to sign in</Link></p>
  </section></main>;
}
