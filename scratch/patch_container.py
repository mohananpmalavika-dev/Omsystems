import re

# 1. Patch app.js
app_path = "/tmp/app.js"
with open(app_path, "r", encoding="utf-8") as f:
    content = f.read()

old_code = 'function isEdgeAgentIngressRoute(method, url) {\n    const path = url.split("?", 1)[0] ?? url;'
new_code = '''function isEdgeAgentIngressRoute(method, url) {
    let path = url;
    try { path = decodeURIComponent(url); } catch {}
    path = (path.split("?", 1)[0] ?? path).split("%3F", 1)[0] ?? path;'''

if old_code in content:
    content = content.replace(old_code, new_code, 1)
    with open(app_path, "w", encoding="utf-8") as f:
        f.write(content)
    print("Patched app.js successfully")
else:
    print("app.js target not found")

# 2. Patch edge-gateway-operations.routes.js
routes_path = "/tmp/edge-gateway-operations.routes.js"
with open(routes_path, "r", encoding="utf-8") as f:
    rcontent = f.read()

old_r = '''    app.get("/v1/edge-agents/:id/updates/next", async (request) => {
        const { id } = agentParams.parse(request.params);
        const { version } = z.object({ version: z.string().min(1).max(40) }).parse(request.query);
        return await updateForAgent(id, version) ?? null;
    });'''

new_r = '''    const handleGetNextUpdate = async (request) => {
        const { id } = agentParams.parse(request.params);
        let version = request.query?.version;
        if (!version) {
            const m = decodeURIComponent(request.url).match(/version=([^&]+)/);
            if (m) version = m[1];
        }
        return await updateForAgent(id, version || "0.1.0") ?? null;
    };
    app.get("/v1/edge-agents/:id/updates/next", handleGetNextUpdate);
    app.get("/v1/edge-agents/:id/updates/next*", handleGetNextUpdate);'''

if old_r in rcontent:
    rcontent = rcontent.replace(old_r, new_r, 1)
    with open(routes_path, "w", encoding="utf-8") as f:
        f.write(rcontent)
    print("Patched edge-gateway-operations.routes.js successfully")
else:
    print("routes target not found")
