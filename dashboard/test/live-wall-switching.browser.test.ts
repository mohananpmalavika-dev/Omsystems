import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";
import { chromium, type Browser, type Page } from "playwright";
import { build } from "esbuild";
import { resolve } from "node:path";

let browser: Browser, page: Page, bundle: string;
beforeAll(async () => {
  const result = await build({
    stdin: { contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
      import {EnhancedCameraGrid} from './dashboard/components/enhanced-camera-grid';
      const root = createRoot(document.getElementById('root'));
      window.showWall = cameras => root.render(<EnhancedCameraGrid cameras={cameras} compactStage tileCount={cameras.length}
        initialLayout={{name:'Wall',gridSize:'2x2',positions:[]}} enableVirtualScrolling={false}/>);`, resolveDir: resolve('.'), loader: 'tsx' },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', alias: { '@': resolve('dashboard') },
    plugins: [{ name: 'wall-boundaries', setup(builder) {
      builder.onLoad({ filter: /\.module\.css$/ }, () => ({ loader: 'js', contents: 'export default {};' }));
      builder.onResolve({ filter: /(camera-tile|decoderBudgetManager|use-media-orchestrator|use-video-wall-scheduler|camera-operator-flags|live-client|interactive-e-map-radar|camera-preset-manager-modal)$/ }, args => ({ path: args.path.split('/').at(-1)!, namespace: 'fixture' }));
      builder.onLoad({ filter: /.*/, namespace: 'fixture' }, args => {
        const modules: Record<string, string> = {
          'camera-tile': `import React,{useState} from 'react';
            export function CameraTile({camera,session}) {const [origin]=useState(camera.id);
              return <article data-camera-id={camera.id}><video data-origin={origin} data-session={session?.cameraId||''}/></article>;}`,
          'decoderBudgetManager': `const noop=()=>{}; export const useDecoderBudgetManager=()=>({decoderLimit:16,setUserPreference:noop,setActiveCount:noop});`,
          'use-media-orchestrator': `const noop=()=>{}, empty=new Map();
            export const useMediaOrchestrator=()=>({tileStates:empty,closeSession:noop,updateStreamState:noop,setTileVisibility:noop});`,
          'use-video-wall-scheduler': `import {useMemo} from 'react';const noop=()=>{},empty=new Map();
            export function useVideoWallScheduler({gridPositions}) {const schedule=useMemo(()=>new Map([...gridPositions.values()].map(p=>[p.cameraId,{cameraId:p.cameraId,mode:'SUB_STREAM'}])),[gridPositions]);
              return {schedule,playbackStates:empty,snapshotUrls:empty,capacity:null,budget:null,isInitialized:true,activeDecoderCount:0,snapshotCount:0,
              attachVideoElement:noop,markPlaybackActive:noop,markPlaybackDeferred:noop,reportPlaybackFailure:noop};}`,
          'camera-operator-flags': `const presets=[],allFlags={}; export const useCameraPresets=()=>({presets});
            export const useCameraOperatorFlags=()=>({allFlags});export const PREDEFINED_OPERATOR_FLAGS=[];`,
          'live-client': `export const startLiveFromBrowser=(cameraId,stream,signal)=>{window.starts.push(cameraId);
            return new Promise(resolve=>window.pending.set(cameraId,{resolve,signal}));};
            export const releaseLiveSession=async session=>{if(session)window.released.push(session.cameraId);};`,
          'interactive-e-map-radar': 'export const InteractiveEMapRadar=()=>null;',
          'camera-preset-manager-modal': 'export const CameraPresetManagerModal=()=>null;',
        };
        return { loader: 'tsx', contents: modules[args.path]!, resolveDir: resolve('.') };
      });
    }}],
  });
  bundle = result.outputFiles[0]!.text;
  browser = await chromium.launch({ headless: true });
});
afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

function camera(id: string) { return { id, name: id, status: 'online', branchId: 'branch-1' }; }
async function mount(ids: string[]) {
  page = await browser.newPage();
  page.setDefaultTimeout(5000);
  await page.route('http://wall.test/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://wall.test');
  await page.evaluate(() => { const w = window as any; w.starts = []; w.pending = new Map(); w.released = []; });
  await page.addScriptTag({ content: bundle });
  await show(ids);
}
async function show(ids: string[]) {
  await page.evaluate(cameras => (window as any).showWall(cameras), ids.map(camera));
  await page.waitForFunction(ids => [...document.querySelectorAll('article')].map(el => el.getAttribute('data-camera-id')).join('|') === ids.join('|'), [...new Set(ids)]);
}
async function finish(id: string) {
  await page.evaluate(id => (window as any).pending.get(id).resolve({cameraId:id,sessionId:id,hls:{url:'https://media.test/'+id+'/index.m3u8',bearerToken:'fixture'}}), id);
}

describe('live wall switching with slow cameras', () => {
  it('discards a late response after switching to a different camera', async () => {
    await mount(['a']);
    await page.waitForFunction(() => (window as any).pending.has('a'));
    await show(['b']);
    await page.waitForFunction(() => (window as any).pending.has('b'));
    expect(await page.evaluate(() => (window as any).pending.get('a').signal.aborted)).toBe(true);
    await finish('a');
    await page.waitForFunction(() => (window as any).released.includes('a'));
    expect(await page.locator('article video').getAttribute('data-session')).toBe('');
    expect(await page.locator('article video').getAttribute('data-origin')).toBe('b');
    await finish('b');
    await page.waitForFunction(() => document.querySelector('article video')?.getAttribute('data-session') === 'b');
  });

  it('retains each camera player on reorder and does not restart it on metadata polling', async () => {
    await mount(['a', 'b']);
    await page.waitForFunction(() => (window as any).pending.size === 2);
    await finish('a'); await finish('b');
    await page.waitForFunction(() => [...document.querySelectorAll('article video')].every(el => el.getAttribute('data-session')));
    await page.evaluate(() => { (window as any).videoA = document.querySelector('article[data-camera-id="a"] video'); });
    await show(['b', 'a']);
    expect(await page.locator('article video').evaluateAll(els => els.map(el => el.getAttribute('data-origin')))).toEqual(['b', 'a']);
    expect(await page.evaluate(() => document.querySelector('article[data-camera-id="a"] video') === (window as any).videoA)).toBe(true);
    await show(['b', 'a']);
    expect(await page.evaluate(() => (window as any).starts)).toEqual(['a', 'b']);
    expect(await page.evaluate(() => (window as any).released)).toEqual([]);
  });

  it('renders duplicate inventory IDs only once', async () => {
    await mount(['a', 'a', 'b']);
    expect(await page.locator('article').count()).toBe(2);
    expect(await page.locator('article video').evaluateAll(els => els.map(el => el.getAttribute('data-origin')))).toEqual(['a', 'b']);
  });
});
