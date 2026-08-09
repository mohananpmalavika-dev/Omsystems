"use client";

import { Cable, CheckCircle2, Cloud, ShieldCheck } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { cameraInventoryApi } from "@/lib/api-client";

type Transport = "vpn" | "cloudflare-tunnel";
type VpnProtocol = "ipsec" | "wireguard" | "openvpn" | "ssl-vpn";

type ConnectivityProfile = {
  branchId: string;
  primaryTransport: Transport;
  fallbackTransport?: Transport;
  vpnProtocol?: VpnProtocol;
  vpnRemoteNetworks?: string[];
  status: "configured" | "healthy" | "degraded" | "offline";
};

type FormState = {
  primaryTransport: Transport;
  fallbackTransport: "none" | Transport;
  vpnProtocol: VpnProtocol;
  vpnNetworks: string;
};

const emptyForm: FormState = {
  primaryTransport: "vpn",
  fallbackTransport: "none",
  vpnProtocol: "ipsec",
  vpnNetworks: "",
};

function formFromProfile(profile: ConnectivityProfile | null): FormState {
  if (!profile) return emptyForm;
  return {
    primaryTransport: profile.primaryTransport,
    fallbackTransport: profile.fallbackTransport ?? "none",
    vpnProtocol: profile.vpnProtocol ?? "ipsec",
    vpnNetworks: (profile.vpnRemoteNetworks ?? []).join(", "),
  };
}

export function BranchConnectivityPanel({
  branchId,
  onConfigured,
}: {
  branchId: string;
  onConfigured?: () => void;
}) {
  const [profile, setProfile] = useState<ConnectivityProfile | null>(null);
  const [managedTunnel, setManagedTunnel] = useState<{ hostname: string; status: string } | null>(null);
  const [managedInternetAvailable, setManagedInternetAvailable] = useState<boolean>();
  const [form, setForm] = useState<FormState>(emptyForm);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string>();
  const [error, setError] = useState<string>();

  useEffect(() => {
    if (!branchId) {
      setProfile(null);
      setManagedTunnel(null);
      setManagedInternetAvailable(undefined);
      setForm(emptyForm);
      return;
    }
    let active = true;
    setLoading(true);
    setError(undefined);
    void cameraInventoryApi.getConnectivity(branchId)
      .then((response) => {
        if (!active) return;
        setProfile(response.profile);
        setManagedTunnel(response.managedTunnel);
        setManagedInternetAvailable(response.supported.tunnel.managedAvailable);
        setForm(formFromProfile(response.profile));
      })
      .catch((reason: unknown) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load branch connectivity.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [branchId]);

  const usesVpn = form.primaryTransport === "vpn" || form.fallbackTransport === "vpn";
  const activeTransport = profile?.primaryTransport;
  const statusLabel = profile?.status === "healthy" ? "Healthy" :
    profile?.status === "degraded" ? "Needs attention" :
    profile?.status === "offline" ? "Offline" : "Not verified";
  const networks = useMemo(
    () => form.vpnNetworks.split(",").map((item) => item.trim()).filter(Boolean),
    [form.vpnNetworks],
  );

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!branchId) return;
    setSaving(true);
    setMessage(undefined);
    setError(undefined);
    try {
      const response = await cameraInventoryApi.configureConnectivity(branchId, {
        primaryTransport: form.primaryTransport,
        ...(form.fallbackTransport !== "none" ? { fallbackTransport: form.fallbackTransport } : {}),
        ...(usesVpn ? { vpnProtocol: form.vpnProtocol, vpnRemoteNetworks: networks } : {}),
      });
      setProfile(response.profile as ConnectivityProfile);
      setForm(formFromProfile(response.profile as ConnectivityProfile));
      setManagedTunnel(response.managedTunnel);
      setMessage(response.message ?? "Branch connectivity saved.");
      onConfigured?.();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not save branch connectivity.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section className="branch-connectivity-panel" aria-label="Branch camera connectivity">
      <div className="branch-connectivity-heading">
        <Cable size={18} />
        <div>
          <h3>Camera connection method</h3>
          <p>Choose how Sentinel reaches this branch. The same method supports IP cameras and analog cameras through a DVR/NVR channel.</p>
        </div>
        {profile ? <span className={`connectivity-status ${profile.status}`}>{statusLabel}</span> : null}
      </div>

      {!branchId ? <p className="connectivity-empty">Select a branch to configure its camera connection method.</p> : (
        <form className="connectivity-form" onSubmit={(event) => void save(event)}>
          <div className="connectivity-option-grid">
            <label className={`connectivity-option ${form.primaryTransport === "vpn" ? "selected" : ""}`}>
              <input type="radio" name="connection-method" value="vpn" checked={form.primaryTransport === "vpn"} onChange={() => setForm((current) => ({ ...current, primaryTransport: "vpn", fallbackTransport: current.fallbackTransport === "vpn" ? "none" : current.fallbackTransport }))} />
              <ShieldCheck size={18} />
              <span><strong>Existing branch VPN</strong><small>Direct private-network access through your router VPN. No Sentinel edge box is needed.</small></span>
            </label>
            <label className={`connectivity-option ${form.primaryTransport === "cloudflare-tunnel" ? "selected" : ""}`}>
              <input type="radio" name="connection-method" value="cloudflare-tunnel" checked={form.primaryTransport === "cloudflare-tunnel"} onChange={() => setForm((current) => ({ ...current, primaryTransport: "cloudflare-tunnel", fallbackTransport: current.fallbackTransport === "cloudflare-tunnel" ? "none" : current.fallbackTransport }))} />
              <Cloud size={18} />
              <span><strong>Secure internet access</strong><small>{managedInternetAvailable === false ? "Automatic temporary tunnel for testing; no camera/DVR port forwarding is needed." : "Stable outbound managed tunnel; no camera/DVR port forwarding or public IP is needed."}</small></span>
            </label>
          </div>

          <div className="connectivity-fields">
            <label>
              Fallback
              <select value={form.fallbackTransport} onChange={(event) => setForm((current) => ({ ...current, fallbackTransport: event.target.value as FormState["fallbackTransport"] }))}>
                <option value="none">No fallback</option>
                {form.primaryTransport !== "vpn" ? <option value="vpn">Existing branch VPN</option> : null}
                {form.primaryTransport !== "cloudflare-tunnel" ? <option value="cloudflare-tunnel">Secure internet access</option> : null}
              </select>
            </label>
            {usesVpn ? <>
              <label>
                VPN type
                <select value={form.vpnProtocol} onChange={(event) => setForm((current) => ({ ...current, vpnProtocol: event.target.value as VpnProtocol }))}>
                  <option value="ipsec">IPsec site-to-site</option>
                  <option value="wireguard">WireGuard</option>
                  <option value="openvpn">OpenVPN</option>
                  <option value="ssl-vpn">SSL VPN</option>
                </select>
              </label>
              <label className="connectivity-networks">
                Camera / DVR networks routed through VPN
                <input value={form.vpnNetworks} onChange={(event) => setForm((current) => ({ ...current, vpnNetworks: event.target.value }))} placeholder="10.42.0.0/16, 192.168.50.0/24" required />
              </label>
            </> : null}
          </div>

          <div className="connectivity-guidance">
            {activeTransport === "vpn" || form.primaryTransport === "vpn" ? <p><ShieldCheck size={14} /> Sentinel uses the router’s existing site-to-site VPN route. Configure the routers separately; never enter VPN or camera passwords here.</p> : null}
            {activeTransport === "cloudflare-tunnel" || form.primaryTransport === "cloudflare-tunnel" ? <p><Cloud size={14} /> Secure internet mode needs the Sentinel scanner running at the branch. {managedTunnel ? `Internet endpoint: ${managedTunnel.hostname} (${managedTunnel.status}).` : managedInternetAvailable === false ? "Saving asks scanner version 0.1.6 to create a temporary test endpoint." : "Saving provisions the endpoint automatically."}</p> : null}
            <p><CheckCircle2 size={14} /> IP cameras use their private IP. Analog cameras are added as a DVR/NVR private IP plus channel number; their continuous video stays on the recorder.</p>
          </div>

          {error ? <p className="connectivity-feedback error">{error}</p> : null}
          {message ? <p className="connectivity-feedback success">{message}</p> : null}
          <button className="secondary-button" disabled={loading || saving}>{saving ? "Saving…" : profile ? "Update connection" : "Save connection"}</button>
        </form>
      )}
    </section>
  );
}
