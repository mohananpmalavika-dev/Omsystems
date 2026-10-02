import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { build } from "esbuild";
import { resolve } from "node:path";

let browser: Browser;
let page: Page;
let bundle: string;

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {HlsPlayer} from './dashboard/components/hls-player';
        window.mount = (props) => createRoot(document.getElementById('root')).render(<HlsPlayer {...props}
          cameraName="Test camera" bearerToken="test-token"
          onPlaybackError={reason => window.errors.push(reason)}
          onPlaybackStateChange={playing => window.states.push(playing)}
          onBitrateChange={mbps => window.bitrates.push(mbps)} />);`,
      resolveDir: resolve("."), loader: "tsx",
    },
    bundle: true, write: false, format: "iife", jsx: "automatic",
    alias: { "@": resolve("dashboard") },
    plugins: [{ name: "controlled-media", setup(builder) {
      builder.onResolve({ filter: /^hls\.js$/ }, () => ({ path: "mock-hls", namespace: "test" }));
      builder.onLoad({ filter: /.*/, namespace: "test" }, () => ({ contents: `
        export default class Hls {
          static Events = {MANIFEST_PARSED:'manifest', FRAG_LOADED:'fragment', ERROR:'error'};
          static ErrorDetails = {}; static ErrorTypes = {}; static DefaultConfig = {loader:class {}};
          static isSupported() { return true; }
          constructor() { this.handlers = {}; window.hlsStarts++; window.hls = this; }
          on(event, cb) {this.handlers[event] = cb;}
          loadSource(url) {window.sources.push(url);}
          attachMedia(video) {queueMicrotask(() => this.handlers.manifest?.());}
          destroy() {window.hlsDestroys++;} startLoad() {} recoverMediaError() {}
        }`, loader: "js" }));
    }}],
  });
  bundle = result.outputFiles[0].text;
  browser = await chromium.launch({ headless: true });
});

afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

async function mount(mode: string, props: Record<string, unknown>) {
  page = await browser.newPage();
  await page.route("http://player.test/**", route => route.fulfill({ contentType: "text/html", body: '<div id="root"></div>' }));
  await page.goto("http://player.test/");
  await page.clock.install();
  await page.evaluate((mode) => {
    const w = window as any;
    w.errors = []; w.states = []; w.bitrates = []; w.hlsStarts = 0; w.hlsDestroys = 0; w.sources = []; w.playCalls = 0;
    Object.defineProperty(HTMLMediaElement.prototype, "paused", { configurable: true, get() {return !(this as any)._playing;} });
    Object.defineProperty(HTMLMediaElement.prototype, "readyState", { configurable: true, get() {return (this as any)._ready ?? 0;} });
    HTMLMediaElement.prototype.load = function() {};
    HTMLMediaElement.prototype.pause = function() {(this as any)._playing = false;};
    HTMLMediaElement.prototype.play = function() {
      w.playCalls++;
      if (mode === "autoplay" && !this.muted) return Promise.reject(new DOMException("Blocked", "NotAllowedError"));
      if (mode === "autoplay" || mode === "healthy" || mode === "slow-webrtc" || mode === "streamless") {
        (this as any)._playing = true; (this as any)._ready = 2;
        queueMicrotask(() => this.dispatchEvent(new Event("playing")));
      }
      return Promise.resolve();
    };
    w.RTCPeerConnection = class {
      iceGatheringState = "complete"; iceConnectionState = "new"; localDescription: any;
      ontrack: any; oniceconnectionstatechange: any;
      addTransceiver() {} async createOffer() {return {type:"offer",sdp:"offer"};}
      async setLocalDescription(offer: any) {this.localDescription = offer;}
      async setRemoteDescription() {
        if (mode === "streamless") this.ontrack?.({streams:[],track:undefined});
        else this.ontrack?.({streams:[new MediaStream()]});
      }
      close() {};
    };
    w.fetch = () => mode === "slow-webrtc"
      ? new Promise(resolve => setTimeout(() => resolve(new Response("answer", {status:201})), 6000))
      : Promise.resolve(new Response("answer", {status: 201}));
  }, mode);
  await page.addScriptTag({ content: bundle });
  await page.evaluate((props) => (window as any).mount(props), props);
  await page.waitForFunction(() => (window as any).states.length > 0);
}

describe("live player in Chromium", () => {
  it("starts relayed HLS as video and falls back to muted autoplay", async () => {
    await mount("autoplay", {url: "https://relay.example/hls/index.m3u8", muted: false});
    await page.waitForFunction(() => (window as any).states.includes(true));
    expect(await page.locator("video").count()).toBe(1);
    expect(await page.locator("img").count()).toBe(0);
    expect(await page.locator("video").evaluate(video => (video as HTMLVideoElement).muted)).toBe(true);
    expect(await page.getByRole("button", {name: "Enable audio"}).count()).toBe(1);
  });

  it("bounds startup when metadata and network progress arrive without frames", async () => {
    await mount("silent", {url: "https://media.example/hls/index.m3u8"});
    await page.locator("video").evaluate(video => {
      video.dispatchEvent(new Event("loadedmetadata")); video.dispatchEvent(new Event("progress"));
    });
    expect(await page.evaluate(() => (window as any).states.includes(true))).toBe(false);
    await page.clock.fastForward(46_000);
    expect(await page.evaluate(() => (window as any).errors)).toContain("playback_start_timeout");
    expect(await page.getByText("Connecting to camera…").count()).toBe(0);
  });

  it("falls back when WebRTC provides a track but no playable frames", async () => {
    await mount("silent", {url: "https://media.example/hls/index.m3u8", whepUrl: "https://media.example/whep"});
    await page.waitForFunction(() => document.querySelector("video")?.srcObject !== null);
    expect(await page.evaluate(() => (window as any).states.includes(true))).toBe(false);
    await page.clock.fastForward(25_100);
    await page.waitForFunction(() => (window as any).hlsStarts === 1);
    expect(await page.evaluate(() => (window as any).hlsDestroys)).toBe(0);
  });

  it("reports an error for a WebRTC-only camera without frames", async () => {
    await mount("silent", {url: "", whepUrl: "https://media.example/whep"});
    await page.clock.fastForward(25_100);
    expect(await page.evaluate(() => (window as any).errors)).toContain("playback_start_timeout");
  });

  it("allows a slow on-demand WHEP source to connect without switching to HLS", async () => {
    await mount("slow-webrtc", {url: "https://media.example/hls/index.m3u8", whepUrl: "https://media.example/whep"});
    await page.clock.fastForward(4_100);
    expect(await page.evaluate(() => (window as any).hlsStarts)).toBe(0);
    await page.clock.fastForward(2_000);
    await page.waitForFunction(() => (window as any).states.includes(true));
    expect(await page.evaluate(() => (window as any).hlsStarts)).toBe(0);
  });

  it("plays streamless WHEP tracks", async () => {
    await mount("streamless", {url: "", whepUrl: "https://media.example/whep"});
    await page.waitForFunction(() => (window as any).states.includes(true));
    expect(await page.locator("video").evaluate(video => (video as HTMLVideoElement).srcObject instanceof MediaStream)).toBe(true);
  });

  it("recovers paused playback rather than leaving a frozen live tile", async () => {
    await mount("healthy", {url: "https://media.example/hls/index.m3u8"});
    await page.waitForFunction(() => (window as any).states.includes(true));
    await page.locator("video").evaluate(video => (video as HTMLVideoElement).pause());
    await page.clock.fastForward(21_000);
    expect(await page.getByText("Reconnecting… Retry now").count()).toBe(1);
    await page.locator("video").evaluate(video => {
      (video as any)._playing = true;
      (video as any)._ready = 2;
      video.dispatchEvent(new Event("playing"));
    });
    expect(await page.evaluate(() => (window as any).states.at(-1))).toBe(true);
    expect(await page.getByText("HLS LIVE").count()).toBe(1);
  });

  it("reports measured HLS video traffic", async () => {
    await mount("healthy", {url: "https://media.example/hls/index.m3u8"});
    await page.waitForFunction(() => (window as any).states.includes(true));
    await page.evaluate(() => (window as any).hls.handlers.fragment(null, {payload: new ArrayBuffer(250_000)}));
    await page.clock.fastForward(2_100);
    expect(await page.evaluate(() => (window as any).bitrates.some((value: number) => value > 0))).toBe(true);
  });
});
