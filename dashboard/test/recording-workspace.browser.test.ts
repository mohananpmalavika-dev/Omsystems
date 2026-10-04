import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { build } from "esbuild";
import { resolve } from "node:path";

let browser: Browser;
let page: Page;
let bundle: string;
const clip = { startTime: "2026-10-04T10:00:00Z", endTime: "2026-10-04T10:10:00Z", apiFamily: "dahua-cgi" };

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {RecordingWorkspace} from './dashboard/components/recording-workspace';
        window.root = createRoot(document.getElementById('root')); window.root.render(<RecordingWorkspace />);`,
      resolveDir: resolve("."), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    alias: { "@": resolve("dashboard") },
    plugins: [{ name: "workspace-adapters", setup(builder) {
      builder.onResolve({ filter: /^(next\/navigation|hls\.js)$/ }, args => ({ path: args.path, namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, args => ({ loader: "js", contents: args.path === "next/navigation"
        ? `export const useSearchParams = () => new URLSearchParams(window.location.search);`
        : `export default class Hls {
            static Events = {ERROR:'error'}; static isSupported() {return true;}
            constructor(config) {this.config=config; window.hls=this; this.handlers={};}
            on(event, cb) {this.handlers[event]=cb;} loadSource(url) {window.hlsSource=url;}
            attachMedia(video) {this.video=video; this.config.xhrSetup({setRequestHeader:(k,v)=>window.hlsAuth=[k,v]});}
            destroy() {window.hlsDestroyed=true;}
          }` }));
    }}],
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

async function mount({ indexedError = false, offline = false, deferred = false } = {}) {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  page.on("pageerror", error => { throw error; });
  await page.route("http://recording.test/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.goto("http://recording.test/?branchId=b1&cameraId=c7&from=2026-10-04T09:00:00Z&to=2026-10-04T11:00:00Z");
  await page.evaluate(({ clip, indexedError, offline, deferred }) => {
    const w = window as any;
    w.calls = []; w.hlsDestroyed = false;
    w.fetch = async (url: string, options: any = {}) => {
      w.calls.push({ url, method: options.method ?? "GET", body: options.body, headers: options.headers });
      const json = (data: any, status = 200) => new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
      if (url === "/api/branches") return json({ data: [{ id: "b1", name: "Pilot" }, { id: "b2", name: "Other branch" }] });
      if (url === "/api/branches/b1/cameras") return json({ data: [{ id: "c7", name: "Channel 7" }, { id: "c8", name: "Channel 8" }] });
      if (url === "/api/branches/b2/cameras") return json({ data: [{ id: "c2", name: "Other camera" }] });
      if (url.endsWith("/storage-sessions")) return json({ token: "one-shot", mediaGatewayUrl: "https://gateway.test/relay" }, 201);
      if (url.endsWith("/v1/storage/search")) {
        if (deferred) return new Promise(resolve => { w.finishSearch = () => resolve(json({ clips: [clip] })); });
        return offline ? json({ error: "edge_media_offline" }, 503) : json({ clips: [clip] });
      }
      if (url.endsWith("/v1/storage/play")) return json({ sessionId: "archive-1", hls: { url: "https://gateway.test/hls/index.m3u8", bearerToken: "playback-token" } }, 201);
      if (options.method === "DELETE") return new Response(null, { status: 204 });
      if (url.startsWith("/api/recording/")) return indexedError ? json({ error: "unavailable" }, 503) : json({ mode: "continuous", primaryRecordingStorage: "recorder-local" });
      if (url.includes("/playback?")) return json({ segments: [] });
      if (url.includes("/recording/health")) return json({ data: [] });
      throw new Error(`Unexpected request: ${url}`);
    };
  }, { clip, indexedError, offline, deferred });
  await page.addScriptTag({ content: bundle });
  await page.getByLabel("Camera", { exact: true }).selectOption("c7");
  await page.getByRole("button", { name: "Search recordings", exact: true }).waitFor();
}

describe("recording playback workflow in Chromium", () => {
  it("searches HDD clips from the main action even when the recording index fails, authenticates playback and closes the old session", async () => {
    await mount({ indexedError: true });
    await page.getByRole("button", { name: "Search recordings", exact: true }).click();
    const row = page.locator('[aria-label="Camera and recorder storage"] .segment-row');
    await row.waitFor();
    expect(await page.getByText("Recording policy could not be loaded.").count()).toBe(1);
    await row.click();
    await page.waitForFunction(() => (window as any).hlsAuth);
    expect(await page.evaluate(() => (window as any).hlsAuth)).toEqual(["Authorization", "Bearer playback-token"]);
    const call = await page.evaluate(() => (window as any).calls.find((c: any) => c.url.endsWith("/v1/storage/play")));
    expect(JSON.parse(call.body)).toMatchObject({ from: clip.startTime, to: clip.endTime, apiFamily: "dahua-cgi" });
    await page.getByLabel("Camera", { exact: true }).selectOption("c8");
    await page.waitForFunction(() => (window as any).calls.some((c: any) => c.method === "DELETE"));
    expect(await page.locator("video").count()).toBe(0);
    expect(await row.count()).toBe(0);
    expect(await page.evaluate(() => (window as any).hlsDestroyed)).toBe(true);
    expect(await page.evaluate(() => (window as any).calls.find((c: any) => c.method === "DELETE"))).toMatchObject({
      url: "https://gateway.test/relay/v1/live/archive-1", headers: { Authorization: "Bearer playback-token" },
    });
  });

  it("ignores an old camera search that finishes after the selection changes", async () => {
    await mount({ deferred: true });
    await page.getByRole("button", { name: "Search recordings", exact: true }).click();
    await page.waitForFunction(() => (window as any).finishSearch);
    await page.getByLabel("Camera", { exact: true }).selectOption("c8");
    await page.evaluate(() => (window as any).finishSearch());
    await page.getByRole("button", { name: "Search recordings", exact: true }).isEnabled();
    expect(await page.locator('[aria-label="Camera and recorder storage"] .segment-row').count()).toBe(0);
    expect(await page.getByText("Search recordings to find footage on the camera SD card or recorder HDD.").count()).toBe(1);
  });

  it("validates the time range before requesting storage access", async () => {
    await mount();
    await page.getByLabel("To", { exact: true }).fill("2026-10-03T11:00");
    await page.getByRole("button", { name: "Search recordings", exact: true }).click();
    await page.getByText("End time must be after start time.").first().waitFor();
    expect(await page.evaluate(() => (window as any).calls.some((c: any) => c.url.endsWith("/storage-sessions")))).toBe(false);
  });

  it("reports an offline gateway independently of the recording index", async () => {
    await mount({ offline: true });
    await page.getByRole("button", { name: "Search recordings", exact: true }).click();
    await page.getByText("The branch gateway is offline. Reconnect it to access device storage.").waitFor();
    expect(await page.getByText("Primary recorder", { exact: true }).count()).toBe(1);
  });
});
