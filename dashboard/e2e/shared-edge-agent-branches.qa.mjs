// Local component browser QA with the real API client and mocked control-plane responses.
// Run from the repository root: node dashboard/e2e/shared-edge-agent-branches.qa.mjs
// Set SHARED_EDGE_QA_URL to a local Next.js URL to verify the complete application shell.
import assert from "node:assert/strict";
import http from "node:http";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium, expect } from "@playwright/test";

const dashboard = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const applicationUrl = process.env.SHARED_EDGE_QA_URL;
if (applicationUrl && !["localhost", "127.0.0.1"].includes(new URL(applicationUrl).hostname)) throw new Error("Application QA requires a local preview URL");
const bundle = await build({
  stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client'; import {EdgeAgentBranchConnections} from './components/edge-agent-branch-connections'; createRoot(document.getElementById('root')).render(<EdgeAgentBranchConnections/>);`, resolveDir: dashboard, loader: "tsx" },
  bundle: true, write: false, outfile: "app.js", jsx: "automatic", loader: { ".module.css": "local-css" },
  alias: { "@": dashboard }, define: { "process.env.NEXT_PUBLIC_API_BASE": '"/api/control"', "process.env.NODE_ENV": '"development"' },
  plugins: [{ name: "link-for-isolated-preview", setup(builder) {
    builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "preview" }));
    builder.onLoad({ filter: /.*/, namespace: "preview" }, () => ({ contents: "import React from 'react'; export default function Link(props) { return React.createElement('a', props); }", resolveDir: dashboard }));
  } }],
});
const javascript = bundle.outputFiles.find(f => f.path.endsWith(".js")).text;
const css = bundle.outputFiles.find(f => f.path.endsWith(".css")).text;
const rootCss = await readFile(join(dashboard, "app/globals.css"), "utf8");
const catalog = {
  minimumAgentVersion: "0.1.47",
  scopes: [{ id: "zone", name: "South Zone", type: "zone", path: ["company", "zone"] }, { id: "region", name: "Kerala Region", type: "region", path: ["company", "zone", "region"] }],
  branches: [
    { id: "home", name: "Head Office", type: "branch", path: ["company", "home"], vpnNetworks: [] },
    { id: "a", name: "Kochi Branch", type: "branch", path: ["company", "zone", "region", "a"], vpnNetworks: ["10.20.1.0/24"] },
    { id: "b", name: "Thrissur Branch", type: "branch", path: ["company", "zone", "region", "b"], vpnNetworks: [] },
    { id: "outside", name: "Another Region Branch", type: "branch", path: ["company", "outside"], vpnNetworks: [] },
  ],
  agents: [{ id: "shared", name: "HO VPN Agent", branchId: "home", branchName: "Head Office", version: "0.1.47", status: "online", lastSeenAt: new Date().toISOString(), supportsSharedBranches: true, branchAssignments: [] }],
};
const writes = [];
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, "http://localhost");
  if (url.pathname.startsWith("/api/control/")) {
    let text = ""; for await (const chunk of req) text += chunk;
    const body = text ? JSON.parse(text) : undefined;
    const path = url.pathname.replace("/api/control", "");
    if (req.method === "POST") {
      writes.push({ path, body });
      if (path.endsWith("/branches")) catalog.agents[0].branchAssignments = body.branches.map(b => ({ ...b, scopeNodeId: body.scopeNodeId }));
    }
    if (req.method === "DELETE") {
      catalog.agents[0].branchAssignments = catalog.agents[0].branchAssignments.filter(a => !path.endsWith(`/${a.branchId}`));
      res.writeHead(204).end(); return;
    }
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(path === "/v1/edge-agent-branches" ? { data: catalog } : { data: { success: true } }));
    return;
  }
  if (url.pathname === "/app.js") { res.setHeader("Content-Type", "text/javascript"); res.end(javascript); return; }
  if (url.pathname === "/app.css") { res.setHeader("Content-Type", "text/css"); res.end(rootCss + "\n" + css); return; }
  res.setHeader("Content-Type", "text/html");
  res.end('<!doctype html><html data-theme="light"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/app.css"></head><body style="margin:0;background:var(--canvas,#f4f7fb);font-family:Arial"><div id="root"></div><script src="/app.js"></script></body></html>');
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ headless: true });
const screenshots = await mkdtemp(join(tmpdir(), "shared-edge-agent-qa-"));
try {
  const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  if (applicationUrl) {
    const user = { id: "qa-user", name: "Reviewer", email: "reviewer@example.test", role: "super_admin" };
    await page.context().addCookies([{ name: "sentinel_access", value: "local-qa-session", url: new URL(applicationUrl).origin }]);
    await page.addInitScript(user => {
      sessionStorage.setItem("sentinel_browser_session", "active");
      localStorage.setItem("user", JSON.stringify(user));
    }, user);
    await page.route("**/*", async route => {
      const url = new URL(route.request().url());
      if (!["localhost", "127.0.0.1"].includes(url.hostname)) return route.abort();
      if (!url.pathname.startsWith("/api/") && !url.pathname.startsWith("/v1/")) return route.continue();
      const path = url.pathname.replace(/^\/api\/control/, "");
      if (path === "/v1/edge-agent-branches" || path.startsWith("/v1/edge-agents/shared/") || path.endsWith("/device-scans")) {
        const response = await fetch(`http://127.0.0.1:${server.address().port}/api/control${path}`, {
          method: route.request().method(), headers: { "Content-Type": "application/json" }, body: route.request().postData() || undefined,
        });
        return route.fulfill({ status: response.status, contentType: "application/json", body: await response.text() });
      }
      let data = { data: [] };
      if (path.endsWith("/auth/me")) data = user;
      else if (path.endsWith("/live-wall")) data = { data: { rules: [], alerts: [], summary: { total: 0, open: 0, new: 0, critical: 0, highPriority: 0 } } };
      else if (path.endsWith("/capabilities")) data = { domains: [], summary: { capabilities: 0 } };
      await route.fulfill({ json: data });
    });
  }
  await page.goto(applicationUrl || `http://127.0.0.1:${server.address().port}/`, { timeout: 180_000 });
  await page.locator("#shared-agent").selectOption("shared");
  await page.getByRole("button", { name: "region", exact: true }).click();
  await page.locator("#shared-scope").selectOption("region");
  await page.getByRole("checkbox", { name: "Select visible branches" }).check();
  await page.getByLabel("VPN addresses for Thrissur Branch").fill("10.20.2.10; 10.20.2.11");
  await page.screenshot({ path: join(screenshots, "desktop.png"), fullPage: true, animations: "disabled" });
  if (applicationUrl) {
    const hero = await page.getByRole("heading", { name: "Connect branches to an existing agent" }).locator("..").locator("..").boundingBox();
    const command = await page.locator(".admin-command-rail").boundingBox();
    const assignment = await page.getByRole("heading", { name: "Assign VPN branches", exact: true }).boundingBox();
    const surface = await page.locator(".route-surface").boundingBox();
    assert.ok(hero.x >= surface.x + 16, "Page requires a gutter beside the sidebar");
    assert.ok(hero.y >= command.y + command.height + 16, "Hero requires space below the command bar");
    assert.ok(hero.height < 180, "Hero should remain compact");
    assert.ok(assignment.y < 850, "Branch assignment should be visible on a desktop screen");
    await page.setViewportSize({ width: 1024, height: 900 });
    const cards = page.locator('section').filter({ has: page.getByRole("heading", { name: /Choose the installed agent|Choose branch, region or zone/ }) });
    const first = await cards.nth(0).boundingBox();
    const second = await cards.nth(1).boundingBox();
    assert.ok(second.y > first.y + first.height, "Setup cards should stack when the sidebar limits available width");
    await page.screenshot({ path: join(screenshots, "tablet.png"), fullPage: true, animations: "disabled" });
  }
  await page.getByRole("button", { name: "Assign 2 branches", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "2 branches assigned" }).waitFor();
  assert.deepEqual(writes[0], { path: "/v1/edge-agents/shared/branches", body: { scopeNodeId: "region", branches: [{ branchId: "a", vpnNetworks: ["10.20.1.0/24"] }, { branchId: "b", vpnNetworks: ["10.20.2.10", "10.20.2.11"] }] } });
  assert.equal(await page.locator("#shared-scope").inputValue(), "region");
  await page.getByRole("button", { name: "Discover cameras" }).first().click();
  await page.getByRole("status").filter({ hasText: "Discovery queued" }).waitFor();
  assert.equal(writes[1].path, "/v1/branches/a/device-scans");
  assert.equal(writes[1].body.edgeAgentId, "shared");
  await page.setViewportSize({ width: 390, height: 844 });
  if (applicationUrl) await expect(page.locator(".workspace")).toHaveCSS("margin-left", "0px");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.screenshot({ path: join(screenshots, "mobile.png"), fullPage: true, animations: "disabled" });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true, "Mobile layout overflows");
  await page.evaluate(() => { document.documentElement.dataset.theme = "dark"; document.documentElement.style.colorScheme = "dark"; document.documentElement.classList.remove("light"); document.documentElement.classList.add("dark"); });
  await page.screenshot({ path: join(screenshots, "mobile-dark.png"), fullPage: true, animations: "disabled" });
  await page.getByRole("button", { name: "Remove Kochi Branch assignment" }).click();
  await page.getByRole("status").filter({ hasText: "Branch assignment removed" }).waitFor();
  assert.equal(catalog.agents[0].branchAssignments.length, 1);
  catalog.agents[0].supportsSharedBranches = false; catalog.agents[0].version = "0.1.46";
  await page.getByRole("button", { name: "Refresh agents" }).click();
  await page.getByText("Update this existing agent to v0.1.47", { exact: false }).waitFor();
  assert.equal(await page.getByRole("button", { name: "Assign selected branches" }).isDisabled(), true);
  await page.setViewportSize({ width: 1920, height: 1080 });
  if (applicationUrl) await expect(page.locator(".workspace")).toHaveCSS("margin-left", "272px");
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: "instant" }));
  await page.evaluate(() => { document.documentElement.dataset.theme = "light"; document.documentElement.style.colorScheme = "light"; document.documentElement.classList.remove("dark"); document.documentElement.classList.add("light"); });
  catalog.agents[0].status = "offline";
  await page.getByRole("button", { name: "Refresh agents" }).click();
  await page.getByText("Assignments can be saved while the agent is offline.", { exact: false }).waitFor();
  await page.screenshot({ path: join(screenshots, "desktop-offline-old-agent.png"), fullPage: true, animations: "disabled" });
  assert.deepEqual(errors, []);
  console.log(JSON.stringify({ passed: true, screenshots, checked: [...(applicationUrl ? ["full application shell", "desktop gutters", "compact hero", "tablet stacking"] : []), "region bulk assignment", "VPN IP entry", "discovery routing", "mobile overflow", "dark theme", "unassignment", "old agent update gate"] }));
} finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
