import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { chromium, type Browser, type Page } from 'playwright';
import { build } from 'esbuild';
import { resolve } from 'node:path';
import { mkdir } from 'node:fs/promises';

let browser: Browser;
let page: Page;
let bundle: string;
let css: string;

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import React from 'react'; import {createRoot} from 'react-dom/client';
        import {useWebRTCCall} from './dashboard/hooks/use-webrtc-call';
        import {CallWorkspace} from './dashboard/components/communications/call-workspace';
        import {MediaDeviceCheck} from './dashboard/components/communications/media-device-check';
        const credentials = {iceServers:[{urls:'stun:127.0.0.1:9'}]};
        function App() {
          const a = useWebRTCCall(), b = useWebRTCCall();
          window.a = a; window.b = b;
          const start = async modality => { try {
            if(modality==='screenshare' && !(await a.startScreenShare())) return;
            await a.initializeMedia({audio:true,video:modality==='video'});
            await b.initializeMedia({audio:true,video:modality==='video'});
            const offer = await a.createOffer(credentials, modality, candidate => void b.addIceCandidate(candidate));
            const answer = await b.createAnswer(credentials, offer, modality, candidate => void a.addIceCandidate(candidate));
            await a.applyAnswer(answer);
          } catch(error) { window.callError = error.message; } };
          return <><div className="setup"><button onClick={()=>void start('audio')}>Start audio call</button><button onClick={()=>void start('video')}>Start video call</button><button onClick={()=>void start('screenshare')}>Start screenshare call</button><MediaDeviceCheck/></div>
            <div id="caller"><CallWorkspace media={a} peerName="Ananya Menon" status={a.state==='CONNECTED'?'CONNECTED':'RINGING'} duration="01:24" onEnd={()=>{a.disconnect();b.disconnect();}}/></div>
            <div id="receiver"><video autoPlay muted ref={element=>{if(element)element.srcObject=b.remoteStream;}}/><span>{b.state}</span></div></>;
        }
        window.root = createRoot(document.getElementById('root')); window.root.render(<App/>);`,
      resolveDir: resolve('.'), loader: 'tsx',
    },
    bundle: true, write: false, format: 'iife', jsx: 'automatic', outdir: 'tmp/communication-media-fixture',
    alias: { '@': resolve('dashboard') },
  });
  bundle = result.outputFiles.find(file => file.path.endsWith('.js'))!.text;
  css = result.outputFiles.find(file => file.path.endsWith('.css'))!.text;
  browser = await chromium.launch({ headless: true, args: ['--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream', '--autoplay-policy=no-user-gesture-required', '--disable-features=WebRtcHideLocalIpsWithMdns', '--allow-loopback-in-peer-connection'] });
  await mkdir('tmp/communications-qa', { recursive: true });
});

afterEach(async () => { await page?.close(); });
afterAll(async () => { await browser?.close(); });

async function mount() {
  page = await browser.newPage({ viewport: { width: 1280, height: 930 } });
  page.setDefaultTimeout(7000);
  await page.route('http://localhost:3197/**', route => route.fulfill({ contentType: 'text/html', body: '<div id="root"></div>' }));
  await page.goto('http://localhost:3197');
  await page.addStyleTag({ content: `${css}\nbody{margin:0;background:#e9edf4;font-family:Arial,sans-serif;padding:24px}#caller{max-width:1060px;margin:16px auto}#receiver{display:none}.setup{display:flex;flex-wrap:wrap;gap:10px;justify-content:center}*{box-sizing:border-box}button{font-family:inherit}` });
  await page.evaluate(() => {
    const w = window as any;
    w.captured = [];
    w.connections = [];
    const PeerConnection = window.RTCPeerConnection;
    window.RTCPeerConnection = class extends PeerConnection {
      constructor(config?: RTCConfiguration) { super(config); w.connections.push(this); }
    };
    const capture = navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);
    navigator.mediaDevices.getUserMedia = async constraints => {
      const stream = await capture(constraints);
      w.captured.push(stream);
      return stream;
    };
    navigator.mediaDevices.getDisplayMedia = async () => {
      w.screenActivation = navigator.userActivation.isActive;
      if (w.cancelShare) throw new DOMException('Cancelled', 'NotAllowedError');
      const canvas = document.createElement('canvas');
      canvas.width = 1280; canvas.height = 720;
      const context = canvas.getContext('2d')!;
      const paint = () => {
        context.fillStyle = '#ecf5f3'; context.fillRect(0, 0, 1280, 720);
        context.fillStyle = '#163a34'; context.font = '40px Arial';
        context.fillText('Branch operations · shared screen', 70, 100);
        context.fillStyle = '#4aac8d'; context.fillRect(70, 180, 1140, 240);
        context.fillStyle = '#163a34'; context.font = '20px Arial'; context.fillText(new Date().toISOString(), 70, 520);
      };
      paint();
      const stream = canvas.captureStream(15);
      const timer = setInterval(paint, 50);
      const track = stream.getVideoTracks()[0];
      track.addEventListener('ended', () => clearInterval(timer));
      w.screenTrack = track;
      w.captured.push(stream);
      return stream;
    };
  });
  await page.addScriptTag({ content: bundle });
  await page.getByRole('button', { name: 'Start audio call', exact: true }).waitFor();
}

async function connect(modality: 'audio' | 'video' | 'screenshare') {
  await page.getByRole('button', { name: `Start ${modality} call`, exact: true }).click();
  try {
    await page.waitForFunction(() => (window as any).a.state === 'CONNECTED' && (window as any).b.state === 'CONNECTED', undefined, { timeout: 12000 });
  } catch (cause) {
    const details = await page.evaluate(() => {
      const w = window as any;
      return { error: w.callError, caller: w.a.error, receiver: w.b.error, connections: w.connections.map((pc: RTCPeerConnection) => ({
        state: pc.connectionState, ice: pc.iceConnectionState, signaling: pc.signalingState, local: pc.localDescription?.type, remote: pc.remoteDescription?.type,
      })) };
    });
    throw new Error(`${cause}\n${JSON.stringify(details)}`);
  }
}

async function receiverFrames() {
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('#receiver video')!;
    return video.videoWidth > 0 && video.currentTime > .1;
  });
}

async function receiverPresentation() {
  // Check a decoded pixel, rather than just the presence of a video track.
  await page.waitForFunction(() => {
    const video = document.querySelector<HTMLVideoElement>('#receiver video')!;
    if (!video.videoWidth) return false;
    const canvas = document.createElement('canvas'); canvas.width = 1; canvas.height = 1;
    const context = canvas.getContext('2d')!;
    context.drawImage(video, video.videoWidth / 2, video.videoHeight / 2, 1, 1, 0, 0, 1, 1);
    const [r, g, b] = context.getImageData(0, 0, 1, 1).data;
    return Math.abs(r - 74) < 15 && Math.abs(g - 172) < 15 && Math.abs(b - 141) < 15;
  });
}

describe('camera and screen sharing over real browser WebRTC', () => {
  it('sends camera frames in both directions, restores camera after sharing, and releases hardware on hangup', async () => {
    await mount(); await connect('video'); await receiverFrames();
    await page.waitForFunction(() => document.querySelector<HTMLVideoElement>('[aria-label="Remote participant video"]')!.videoWidth > 0);
    expect(await page.evaluate(() => (window as any).a.remoteStream.getAudioTracks().length)).toBe(1);
    expect(await page.evaluate(() => (window as any).a.remoteStream.getVideoTracks().length)).toBe(1);
    await page.screenshot({ path: 'tmp/communications-qa/video-call-desktop.png', fullPage: true });
    await page.getByRole('button', { name: 'Share screen', exact: true }).click();
    await page.waitForFunction(() => (window as any).a.isScreenSharing);
    expect(await page.evaluate(() => (window as any).screenActivation)).toBe(true);
    await receiverPresentation();
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks().length)).toBe(1);
    await page.screenshot({ path: 'tmp/communications-qa/screen-share-desktop.png', fullPage: true });
    // Simulate the browser's native stop-sharing event.
    await page.evaluate(() => (window as any).screenTrack.dispatchEvent(new Event('ended')));
    await page.waitForFunction(() => !(window as any).a.isScreenSharing && (window as any).a.cameraEnabled);
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks().every((track: MediaStreamTrack) => track.readyState === 'live'))).toBe(true);
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks().length)).toBe(1);
    await page.getByRole('button', { name: 'End call', exact: true }).click();
    await page.waitForFunction(() => (window as any).captured.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === 'ended')));
  });

  it('enables camera, disables and re-enables it, then shares a screen during an initial audio call', async () => {
    await mount(); await connect('audio');
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks().length)).toBe(0);
    await page.getByRole('button', { name: 'Turn camera on', exact: true }).click();
    await receiverFrames();
    await page.getByRole('button', { name: 'Turn camera off', exact: true }).click();
    await page.waitForFunction(() => !(window as any).a.cameraEnabled);
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks().length)).toBe(0);
    await page.getByRole('button', { name: 'Turn camera on', exact: true }).click();
    await page.waitForFunction(() => (window as any).a.cameraEnabled);
    await page.getByRole('button', { name: 'Share screen', exact: true }).click();
    await page.waitForFunction(() => (window as any).a.isScreenSharing);
    await receiverPresentation();
    await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
    await page.waitForFunction(() => !(window as any).a.isScreenSharing);
    await page.setViewportSize({ width: 390, height: 844 });
    await page.screenshot({ path: 'tmp/communications-qa/video-call-mobile.png', fullPage: true });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  it('shares from a voice call without a camera and keeps microphone audio when sharing stops', async () => {
    await mount(); await connect('audio');
    await page.getByRole('button', { name: 'Share screen', exact: true }).click();
    await page.waitForFunction(() => (window as any).a.isScreenSharing); await receiverPresentation();
    await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
    await page.waitForFunction(() => !(window as any).a.isScreenSharing);
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks().length)).toBe(0);
    expect(await page.evaluate(() => (window as any).a.localStream.getAudioTracks()[0].readyState)).toBe('live');
    await page.getByRole('button', { name: 'Share screen', exact: true }).click();
    await page.waitForFunction(() => (window as any).a.isScreenSharing); await receiverPresentation();
  });

  it('includes a screen selected before call setup in the initial offer', async () => {
    await mount(); await connect('screenshare'); await receiverPresentation();
    expect(await page.evaluate(() => (window as any).screenActivation)).toBe(true);
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks().length)).toBe(1);
    await page.getByRole('button', { name: 'Stop sharing', exact: true }).click();
    await page.waitForFunction(() => !(window as any).a.isScreenSharing);
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks().length)).toBe(0);
  });

  it('reports share cancellation while preserving the camera call', async () => {
    await mount(); await connect('video');
    await page.evaluate(() => { (window as any).cancelShare = true; });
    await page.getByRole('button', { name: 'Share screen', exact: true }).click();
    await page.getByRole('alert').waitFor();
    expect(await page.getByRole('alert').innerText()).toContain('cancelled or blocked');
    expect(await page.evaluate(() => (window as any).a.cameraEnabled && !(window as any).a.isScreenSharing)).toBe(true);
    expect(await page.evaluate(() => (window as any).a.localStream.getVideoTracks()[0].readyState)).toBe('live');
  });

  it('checks actual video frames and microphone samples, then stops the test devices on close', async () => {
    await mount();
    await page.getByRole('button', { name: 'Device check', exact: true }).click();
    await page.getByRole('button', { name: 'Test camera', exact: true }).click();
    await page.getByText('Video frames received', { exact: true }).waitFor();
    await page.getByRole('button', { name: 'Test microphone', exact: true }).click();
    await page.getByText('Audio detected', { exact: true }).waitFor();
    await page.screenshot({ path: 'tmp/communications-qa/device-check.png', fullPage: true });
    await page.getByRole('button', { name: 'Close device check', exact: true }).click();
    expect(await page.evaluate(() => (window as any).captured.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
  });

  it('stops all camera and microphone tracks when the call view is unmounted', async () => {
    await mount(); await connect('video');
    await page.evaluate(() => (window as any).root.unmount());
    expect(await page.evaluate(() => (window as any).captured.every((stream: MediaStream) => stream.getTracks().every(track => track.readyState === 'ended')))).toBe(true);
  });
});
