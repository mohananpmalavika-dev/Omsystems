"use client";

import {
  Activity,
  AlertTriangle,
  Camera,
  CheckCircle2,
  Copy,
  Network,
  Plus,
  Router,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { cameraInventoryApi } from "@/lib/api-client";
import type {
  Branch,
  Camera as CameraRecord,
  EdgeAgent,
} from "@/lib/types";

type CameraForm = {
  name: string;
  vendor: "hikvision" | "cp-plus" | "other";
  model: string;
  ipAddress: string;
  onvifPort: string;
  rtspPort: string;
  channel: string;
  protocol: "onvif-t" | "onvif-s" | "rtsp" | "vendor-adapter";
  edgeAgentId: string;
  connectionSecretRef: string;
  codec: "H264" | "H265" | "MJPEG" | "unknown";
  width: string;
  height: string;
  ptz: boolean;
  audio: boolean;
  events: boolean;
};

const emptyCameraForm: CameraForm = {
  name: "",
  vendor: "other",
  model: "",
  ipAddress: "",
  onvifPort: "80",
  rtspPort: "554",
  channel: "1",
  protocol: "onvif-t",
  edgeAgentId: "",
  connectionSecretRef: "",
  codec: "H264",
  width: "1920",
  height: "1080",
  ptz: false,
  audio: false,
  events: true,
};

export function DeviceManager() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [selectedBranch, setSelectedBranch] = useState("");
  const [gateways, setGateways] = useState<EdgeAgent[]>([]);
  const [cameras, setCameras] = useState<CameraRecord[]>([]);
  const [discoveredCameras, setDiscoveredCameras] = useState<any[]>([]);
  const [cameraForm, setCameraForm] = useState<CameraForm>(emptyCameraForm);
  const [gatewayName, setGatewayName] = useState("");
  const [showCameraForm, setShowCameraForm] = useState(false);
  const [showGatewayForm, setShowGatewayForm] = useState(false);
  const [showDiscoveredList, setShowDiscoveredList] = useState(false);
  const [provisionedGateway, setProvisionedGateway] = useState<EdgeAgent>();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState<string>();
  const [notice, setNotice] = useState<string>();

  const activeBranch = branches.find((branch) => branch.id === selectedBranch);
  const setupText = useMemo(() => provisionedGateway
    ? [
        "CONTROL_PLANE_URL=<provided-by-platform-admin>",
        `BRANCH_ID=${provisionedGateway.branchId}`,
        `EDGE_AGENT_ID=${provisionedGateway.id}`,
        `EDGE_AGENT_NAME=${provisionedGateway.name}`,
        "EDGE_BRIDGE_SHARED_KEY=<enrollment-secret>",
        "CAMERA_USERNAME=<camera-user>",
        "CAMERA_PASSWORD=<camera-password>",
        "ONVIF_ENDPOINTS=http://<camera-ip>/onvif/device_service",
      ].join("\n")
    : "", [provisionedGateway]);

  useEffect(() => {
    void cameraInventoryApi.listBranches("device:configure")
      .then(({ data }) => {
        setBranches(data);
        setSelectedBranch(data[0]?.id ?? "");
      })
      .catch((reason) => setError(messageOf(reason, "Unable to load configurable branches.")))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedBranch) {
      setGateways([]);
      setCameras([]);
      return;
    }
    void refreshBranch(selectedBranch);
  }, [selectedBranch]);

  async function refreshBranch(branchId: string) {
    setLoading(true);
    setError(undefined);
    try {
      const [gatewayResponse, cameraResponse, discoveredResponse] = await Promise.all([
        cameraInventoryApi.listGateways(branchId),
        cameraInventoryApi.listByBranch(branchId),
        cameraInventoryApi.listDiscovered(branchId),
      ]);
      setGateways(gatewayResponse.data);
      setCameras(cameraResponse.data);
      setDiscoveredCameras(discoveredResponse.data);
    } catch (reason) {
      setError(messageOf(reason, "Unable to load devices for this branch."));
    } finally {
      setLoading(false);
    }
  }

  function openCameraForm() {
    const preferred = gateways.find((gateway) => gateway.status === "online") ?? gateways[0];
    setCameraForm({
      ...emptyCameraForm,
      edgeAgentId: preferred?.id ?? "",
      connectionSecretRef: `vault://branches/${selectedBranch}/cameras/new-device`,
    });
    setError(undefined);
    setShowDiscoveredList(true);
  }

  async function scanNetwork() {
    if (!selectedBranch) return;
    setScanning(true);
    setError(undefined);
    try {
      await refreshBranch(selectedBranch);
      setNotice(`Network scan completed. Found ${discoveredCameras.length} cameras.`);
    } catch (reason) {
      setError(messageOf(reason, "Network scan failed."));
    } finally {
      setScanning(false);
    }
  }

  async function addDiscoveredCamera(discovered: any) {
    setSaving(true);
    setError(undefined);
    try {
      // Pre-fill the form with discovered camera details
      setCameraForm({
        ...emptyCameraForm,
        edgeAgentId: discovered.edgeAgentId,
        vendor: discovered.vendor,
        model: discovered.model,
        ipAddress: discovered.ipAddress,
        onvifPort: String(discovered.onvifPort),
        rtspPort: String(discovered.rtspPort),
        name: `${discovered.model}@${discovered.ipAddress}`,
        codec: discovered.profiles[0]?.codec ?? "H264",
        width: String(discovered.profiles[0]?.width ?? "1920"),
        height: String(discovered.profiles[0]?.height ?? "1080"),
        ptz: discovered.capabilities.ptz,
        audio: discovered.capabilities.audio,
        events: discovered.capabilities.events,
        connectionSecretRef: `vault://branches/${selectedBranch}/cameras/new-device`,
      });

      // Submit the discovery
      const discovery = await cameraInventoryApi.submitDiscovery(selectedBranch, {
        edgeAgentId: discovered.edgeAgentId,
        vendor: discovered.vendor,
        model: discovered.model,
        ipAddress: discovered.ipAddress,
        onvifPort: discovered.onvifPort,
        rtspPort: discovered.rtspPort,
        profiles: discovered.profiles,
        capabilities: discovered.capabilities,
      });

      // Approve the camera
      await cameraInventoryApi.approveCamera(selectedBranch, {
        discoveryId: discovery.id,
        name: `${discovered.model}@${discovered.ipAddress}`,
        channel: 1,
        protocol: "onvif-t",
        connectionSecretRef: `vault://branches/${selectedBranch}/cameras/new-device`,
      });

      setShowDiscoveredList(false);
      setNotice(`Camera ${discovered.model} was added successfully.`);
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Failed to add discovered camera."));
    } finally {
      setSaving(false);
    }
  }

  async function registerGateway(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBranch) return;
    setSaving(true);
    setError(undefined);
    try {
      const gateway = await cameraInventoryApi.registerGateway(selectedBranch, {
        name: gatewayName,
        version: "0.1.0",
      }) as EdgeAgent;
      setProvisionedGateway(gateway);
      setGatewayName("");
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Gateway registration failed."));
    } finally {
      setSaving(false);
    }
  }

  async function addCamera(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedBranch) return;
    setSaving(true);
    setError(undefined);
    try {
      const discovery = await cameraInventoryApi.submitDiscovery(selectedBranch, {
        edgeAgentId: cameraForm.edgeAgentId,
        vendor: cameraForm.vendor,
        model: cameraForm.model,
        ipAddress: cameraForm.ipAddress,
        onvifPort: Number(cameraForm.onvifPort),
        rtspPort: Number(cameraForm.rtspPort),
        profiles: [{
          name: "main",
          codec: cameraForm.codec,
          width: Number(cameraForm.width),
          height: Number(cameraForm.height),
        }],
        capabilities: {
          ptz: cameraForm.ptz,
          audio: cameraForm.audio,
          events: cameraForm.events,
        },
      });
      await cameraInventoryApi.approveCamera(selectedBranch, {
        discoveryId: discovery.id,
        name: cameraForm.name,
        channel: Number(cameraForm.channel),
        protocol: cameraForm.protocol,
        connectionSecretRef: cameraForm.connectionSecretRef,
      });
      setShowCameraForm(false);
      setNotice(`${cameraForm.name} was added to ${activeBranch?.name ?? "the branch"}.`);
      await refreshBranch(selectedBranch);
    } catch (reason) {
      setError(messageOf(reason, "Camera onboarding failed."));
    } finally {
      setSaving(false);
    }
  }

  async function copySetup() {
    await navigator.clipboard.writeText(setupText);
    setNotice("Gateway configuration copied.");
  }

  return (
    <div className="device-manager">
      <div className="device-toolbar">
        <div>
          <h2>Branches & devices</h2>
          <p>Add ONVIF or RTSP cameras through an on-site branch gateway.</p>
        </div>
        <div className="device-toolbar-actions">
          <button className="secondary-button" onClick={() => {
            setProvisionedGateway(undefined);
            setShowGatewayForm(true);
          }} disabled={!selectedBranch}>
            <Router size={15} /> Register gateway
          </button>
          <button className="secondary-button" onClick={() => void scanNetwork()} disabled={!selectedBranch || gateways.length === 0 || scanning}>
            <Network size={15} /> {scanning ? "Scanning…" : "Scan network"}
          </button>
          <button className="primary-button" onClick={openCameraForm} disabled={!selectedBranch || gateways.length === 0}>
            <Plus size={15} /> Add camera
          </button>
        </div>
      </div>

      {error && <div className="device-message error"><AlertTriangle size={16} />{error}</div>}
      {notice && <div className="device-message success"><CheckCircle2 size={16} />{notice}<button onClick={() => setNotice(undefined)}><X size={14} /></button></div>}

      <div className="remote-camera-note">
        <Network size={19} />
        <div>
          <strong>Camera at another location?</strong>
          <span>Install one Sentinel Edge Agent inside that branch network. The camera IP remains private and its credentials stay at the branch.</span>
        </div>
      </div>

      <div className="device-scope">
        <label htmlFor="device-branch">Branch location</label>
        <select id="device-branch" value={selectedBranch} onChange={(event) => setSelectedBranch(event.target.value)}>
          {branches.map((branch) => <option key={branch.id} value={branch.id}>{branch.name}</option>)}
        </select>
        {branches.length === 0 && !loading && <span>You do not have device configuration permission for any branch.</span>}
      </div>

      {loading ? <div className="loading-state"><Activity className="spin" />Loading branch devices…</div> : (
        <div className="device-columns">
          <section className="device-card">
            <div className="device-card-heading"><Router size={18} /><div><h3>Branch gateways</h3><p>{gateways.length} registered</p></div></div>
            {gateways.length === 0 ? (
              <div className="device-empty"><Router size={25} /><strong>No gateway registered</strong><span>Register and install a gateway before adding cameras at this location.</span></div>
            ) : gateways.map((gateway) => (
              <article className="gateway-row" key={gateway.id}>
                <span className={`gateway-state ${gateway.status}`}><i /></span>
                <div><strong>{gateway.name}</strong><small>{gateway.status} · v{gateway.version}</small></div>
                <code title={gateway.id}>{gateway.id.slice(0, 8)}</code>
              </article>
            ))}
          </section>

          <section className="device-card">
            <div className="device-card-heading"><Camera size={18} /><div><h3>Camera inventory</h3><p>{cameras.length} devices</p></div></div>
            {cameras.length === 0 ? (
              <div className="device-empty"><Camera size={25} /><strong>No cameras added</strong><span>Add the first camera after its branch gateway is registered.</span></div>
            ) : cameras.map((camera) => (
              <article className="camera-inventory-row" key={camera.id}>
                <span className="camera-device-icon"><Camera size={15} /></span>
                <div><strong>{camera.name}</strong><small>{camera.vendor} · {camera.model} · channel {camera.channel}</small></div>
                <span className={`inventory-status ${camera.status}`}>{camera.status}</span>
              </article>
            ))}
          </section>
        </div>
      )}

      {showGatewayForm && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header"><h2>Register branch gateway</h2><button className="icon-button" onClick={() => setShowGatewayForm(false)}><X size={20} /></button></div>
            {!provisionedGateway ? (
              <form className="modal-form" onSubmit={registerGateway}>
                <div className="form-info-banner"><Network size={16} />Use a Windows or Linux computer that stays on inside {activeBranch?.name}.</div>
                <div className="form-group"><label htmlFor="gatewayName">Gateway name <span className="required">*</span></label><input id="gatewayName" value={gatewayName} onChange={(event) => setGatewayName(event.target.value)} minLength={2} maxLength={120} required placeholder={`${activeBranch?.name ?? "Branch"} Gateway`} /></div>
                <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowGatewayForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Registering…" : "Register gateway"}</button></div>
              </form>
            ) : (
              <div className="modal-body">
                <div className="device-message success"><CheckCircle2 size={16} />Gateway registration created.</div>
                <p className="setup-description">Set these environment variables on the branch computer, then run the Sentinel Edge Agent. Obtain the enrollment secret from the platform administrator.</p>
                <pre className="gateway-config">{setupText}</pre>
                <div className="modal-actions"><button className="secondary-button" onClick={() => void copySetup()}><Copy size={14} />Copy configuration</button><button className="primary-button" onClick={() => setShowGatewayForm(false)}>Done</button></div>
              </div>
            )}
          </div>
        </div>
      )}
      {showDiscoveredList && (
        <div className="modal-overlay">
          <div className="modal-container">
            <div className="modal-header"><h2>Add camera to {activeBranch?.name}</h2><button className="icon-button" onClick={() => setShowDiscoveredList(false)}><X size={20} /></button></div>
            <div className="modal-body">
              {discoveredCameras.length === 0 ? (
                <div className="device-empty"><Camera size={30} /><strong>No cameras discovered</strong><span>Run a network scan or configure the gateway's ONVIF endpoints to find cameras.</span></div>
              ) : (
                <>
                  <p className="form-info-banner"><Network size={16} />Select a discovered camera to add it to this branch. Pre-populated details can be edited if needed.</p>
                  <div className="discovered-cameras-list">
                    {discoveredCameras.map((camera) => (
                      <div key={camera.id} className="discovered-camera-item">
                        <div className="camera-details">
                          <strong>{camera.model} @ {camera.ipAddress}</strong>
                          <small>{camera.vendor} · ONVIF port {camera.onvifPort}</small>
                          <small className="profiles">{camera.profiles.map((p: any) => `${p.codec} ${p.width}x${p.height}`).join(", ")}</small>
                        </div>
                        <button className="primary-button" onClick={() => void addDiscoveredCamera(camera)} disabled={saving}>
                          {saving ? "Adding…" : "Add camera"}
                        </button>
                      </div>
                    ))}
                  </div>
                </>
              )}
              <div className="modal-actions">
                <button className="secondary-button" onClick={() => setShowDiscoveredList(false)}>Close</button>
                <button className="secondary-button" onClick={() => { setShowDiscoveredList(false); setShowCameraForm(true); }}>Manual entry</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showCameraForm && (
        <div className="modal-overlay">
          <div className="modal-container modal-large">
            <div className="modal-header"><h2>Add camera to {activeBranch?.name}</h2><button className="icon-button" onClick={() => setShowCameraForm(false)}><X size={20} /></button></div>
            <form className="modal-form" onSubmit={addCamera}>
              <div className="form-info-banner"><Router size={16} />Use the camera’s private branch-network address. Do not enter its password in this form.</div>
              <div className="form-section"><h3>Location and gateway</h3><div className="form-row">
                <div className="form-group"><label>Branch</label><input value={activeBranch?.name ?? ""} disabled /></div>
                <div className="form-group"><label htmlFor="cameraGateway">Edge gateway <span className="required">*</span></label><select id="cameraGateway" value={cameraForm.edgeAgentId} onChange={(event) => setCameraForm((form) => ({ ...form, edgeAgentId: event.target.value }))} required><option value="">Select gateway…</option>{gateways.map((gateway) => <option key={gateway.id} value={gateway.id}>{gateway.name} ({gateway.status})</option>)}</select></div>
              </div></div>

              <div className="form-section"><h3>Camera identity</h3><div className="form-row">
                <div className="form-group"><label htmlFor="cameraName">Camera name <span className="required">*</span></label><input id="cameraName" value={cameraForm.name} onChange={(event) => setCameraForm((form) => ({ ...form, name: event.target.value }))} minLength={2} required placeholder="Main entrance" /></div>
                <div className="form-group"><label htmlFor="cameraModel">Model <span className="required">*</span></label><input id="cameraModel" value={cameraForm.model} onChange={(event) => setCameraForm((form) => ({ ...form, model: event.target.value }))} required placeholder="DS-2CD2143G2" /></div>
                <div className="form-group"><label htmlFor="cameraVendor">Brand</label><select id="cameraVendor" value={cameraForm.vendor} onChange={(event) => setCameraForm((form) => ({ ...form, vendor: event.target.value as CameraForm["vendor"] }))}><option value="hikvision">Hikvision</option><option value="cp-plus">CP Plus</option><option value="other">Other / ONVIF</option></select></div>
                <div className="form-group"><label htmlFor="cameraChannel">Channel</label><input id="cameraChannel" type="number" min="1" value={cameraForm.channel} onChange={(event) => setCameraForm((form) => ({ ...form, channel: event.target.value }))} required /></div>
              </div></div>

              <div className="form-section"><h3>Network connection</h3><div className="form-row">
                <div className="form-group"><label htmlFor="cameraIp">Private IP address <span className="required">*</span></label><input id="cameraIp" value={cameraForm.ipAddress} onChange={(event) => setCameraForm((form) => ({ ...form, ipAddress: event.target.value }))} required placeholder="192.168.1.20" /></div>
                <div className="form-group"><label htmlFor="cameraProtocol">Protocol</label><select id="cameraProtocol" value={cameraForm.protocol} onChange={(event) => setCameraForm((form) => ({ ...form, protocol: event.target.value as CameraForm["protocol"] }))}><option value="onvif-t">ONVIF Profile T</option><option value="onvif-s">ONVIF Profile S</option><option value="rtsp">RTSP</option><option value="vendor-adapter">Vendor adapter</option></select></div>
                <div className="form-group"><label htmlFor="onvifPort">ONVIF port</label><input id="onvifPort" type="number" min="1" max="65535" value={cameraForm.onvifPort} onChange={(event) => setCameraForm((form) => ({ ...form, onvifPort: event.target.value }))} required /></div>
                <div className="form-group"><label htmlFor="rtspPort">RTSP port</label><input id="rtspPort" type="number" min="1" max="65535" value={cameraForm.rtspPort} onChange={(event) => setCameraForm((form) => ({ ...form, rtspPort: event.target.value }))} required /></div>
              </div><div className="form-group"><label htmlFor="secretRef">Stream secret reference <span className="required">*</span></label><input id="secretRef" value={cameraForm.connectionSecretRef} onChange={(event) => setCameraForm((form) => ({ ...form, connectionSecretRef: event.target.value }))} minLength={8} required /><small className="field-help">This reference must map to the RTSP URL in the gateway secret store. Camera credentials are never saved in the inventory database.</small></div></div>

              <div className="form-section"><h3>Main stream and capabilities</h3><div className="form-row form-row-three">
                <div className="form-group"><label htmlFor="codec">Codec</label><select id="codec" value={cameraForm.codec} onChange={(event) => setCameraForm((form) => ({ ...form, codec: event.target.value as CameraForm["codec"] }))}><option value="H264">H.264</option><option value="H265">H.265</option><option value="MJPEG">MJPEG</option><option value="unknown">Auto-detect</option></select></div>
                <div className="form-group"><label htmlFor="streamWidth">Width</label><input id="streamWidth" type="number" min="1" value={cameraForm.width} onChange={(event) => setCameraForm((form) => ({ ...form, width: event.target.value }))} required /></div>
                <div className="form-group"><label htmlFor="streamHeight">Height</label><input id="streamHeight" type="number" min="1" value={cameraForm.height} onChange={(event) => setCameraForm((form) => ({ ...form, height: event.target.value }))} required /></div>
              </div><div className="capability-checks">{([['ptz', 'PTZ control'], ['audio', 'Audio'], ['events', 'Motion/events']] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={cameraForm[key]} onChange={(event) => setCameraForm((form) => ({ ...form, [key]: event.target.checked }))} />{label}</label>)}</div></div>

              <div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setShowCameraForm(false)}>Cancel</button><button className="primary-button" disabled={saving}>{saving ? "Adding camera…" : "Add camera"}</button></div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function messageOf(reason: unknown, fallback: string) {
  return reason instanceof Error && reason.message !== "Request failed"
    ? reason.message
    : fallback;
}
