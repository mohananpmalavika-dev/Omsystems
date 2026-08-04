export class GatewayClient {
    baseUrl;
    developmentUserId;
    edgeBridgeSharedKey;
    timeoutMs;
    outbox;
    edgeCredential;
    constructor(baseUrl, developmentUserId, edgeBridgeSharedKey, timeoutMs = 15_000, outbox) {
        this.baseUrl = baseUrl;
        this.developmentUserId = developmentUserId;
        this.edgeBridgeSharedKey = edgeBridgeSharedKey;
        this.timeoutMs = timeoutMs;
        this.outbox = outbox;
    }
    useEdgeCredential(credential) { this.edgeCredential = credential; }
    async activate(activationCode, deviceUuid, version, commandPublicKey) {
        return this.request("/v1/edge-enrollment/activate", {
            method: "POST", body: JSON.stringify({ activationCode, deviceUuid, version, commandPublicKey }),
        }, true);
    }
    async getBootstrap(agentId) {
        return this.request(`/v1/edge-agents/${encodeURIComponent(agentId)}/bootstrap`, { method: "GET" });
    }
    async register(branchId, name, version) {
        return this.request(`/v1/branches/${encodeURIComponent(branchId)}/edge-agents/register`, { method: "POST", body: JSON.stringify({ name, version }) });
    }
    async heartbeat(id, version, publicMediaUrl) {
        return this.request(`/v1/edge-agents/${encodeURIComponent(id)}/heartbeat`, {
            method: "POST",
            body: JSON.stringify({
                version,
                ...(publicMediaUrl ? { publicMediaUrl } : {}),
            }),
        });
    }
    async listMonitoringCameras(agentId, version) {
        const response = await this.request(`/v1/edge-agents/${encodeURIComponent(agentId)}/cameras/monitoring`, { method: "GET", headers: { "x-edge-agent-version": version } });
        return response.data;
    }
    async submitTelemetry(agentId, payload) {
        return this.requestOrQueue(`/v1/edge-agents/${encodeURIComponent(agentId)}/telemetry`, { method: "POST", body: JSON.stringify(payload) });
    }
    async submitRecorderHdd(agentId, payload) {
        return this.requestOrQueue(`/v1/edge-agents/${encodeURIComponent(agentId)}/recorder-hdd`, { method: "POST", body: JSON.stringify(payload) });
    }
    async submitRecorderArchive(agentId, payload) {
        return this.requestOrQueue(`/v1/edge-agents/${encodeURIComponent(agentId)}/recorder-archive`, { method: "POST", body: JSON.stringify(payload) });
    }
    async submitDiscovery(branchId, payload) {
        return this.request(`/v1/branches/${encodeURIComponent(branchId)}/cameras/discovered`, { method: "POST", body: JSON.stringify(payload) });
    }
    async claimScanJob(agentId, version) {
        return this.request(`/v1/edge-agents/${encodeURIComponent(agentId)}/scan-jobs/next`, { method: "GET", headers: { "x-edge-agent-version": version } });
    }
    async completeScanJob(agentId, jobId, result) {
        return this.request(`/v1/edge-agents/${encodeURIComponent(agentId)}/scan-jobs/${encodeURIComponent(jobId)}/complete`, { method: "POST", body: JSON.stringify(result) });
    }
    async consumeLiveSession(agentId, token) {
        return this.request(`/v1/edge-agents/${encodeURIComponent(agentId)}/live-sessions/consume`, { method: "POST", body: JSON.stringify({ token }) });
    }
    async claimCommand(agentId) {
        return this.request(`/v1/edge-agents/${encodeURIComponent(agentId)}/commands/next`, { method: "GET" });
    }
    async completeCommand(agentId, commandId, result) {
        return this.requestOrQueue(`/v1/edge-agents/${encodeURIComponent(agentId)}/commands/${encodeURIComponent(commandId)}/complete`, { method: "POST", body: JSON.stringify(result) });
    }
    async getUpdate(agentId, version) {
        return this.request(`/v1/edge-agents/${encodeURIComponent(agentId)}/updates/next?version=${encodeURIComponent(version)}`, { method: "GET" });
    }
    async flushOutbox() {
        if (!this.outbox)
            return { delivered: 0, pending: 0 };
        return this.outbox.flush(async (queued) => {
            await this.request(queued.path, {
                method: queued.method, body: queued.body,
                ...(queued.headers ? { headers: queued.headers } : {}),
            });
        });
    }
    async requestOrQueue(path, init) {
        try {
            return await this.request(path, init);
        }
        catch (error) {
            if (!this.outbox || (error instanceof GatewayRequestError && error.status < 500))
                throw error;
            const pending = await this.outbox.enqueue({
                path, method: "POST", body: String(init.body ?? ""),
                ...(init.headers ? { headers: init.headers } : {}),
            });
            return { accepted: true, duplicate: false, queued: true, pending };
        }
    }
    async request(path, init, skipAuth = false) {
        const url = new URL(path, this.baseUrl);
        let response;
        try {
            response = await fetch(url, {
                ...init,
                signal: AbortSignal.timeout(this.timeoutMs),
                headers: {
                    "content-type": "application/json",
                    ...(this.developmentUserId ? { "x-user-id": this.developmentUserId } : {}),
                    ...(!skipAuth && this.edgeCredential ? { "x-edge-agent-token": this.edgeCredential } : {}),
                    ...(!skipAuth && !this.edgeCredential && this.edgeBridgeSharedKey ? { "x-edge-bridge-key": this.edgeBridgeSharedKey } : {}),
                    ...init.headers,
                },
            });
        }
        catch (error) {
            throw new Error(`Cannot reach control plane ${url.origin}: ${error instanceof Error ? error.message : String(error)}`);
        }
        const text = await response.text();
        let body;
        try {
            body = text ? JSON.parse(text) : undefined;
        }
        catch {
            body = text.slice(0, 1_000);
        }
        if (!response.ok) {
            throw new GatewayRequestError(response.status, `Control plane ${response.status}: ${JSON.stringify(body)}`);
        }
        return body;
    }
}
export class GatewayRequestError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
