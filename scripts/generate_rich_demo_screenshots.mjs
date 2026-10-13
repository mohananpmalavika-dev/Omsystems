import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';

const SCREENSHOT_DIR = path.resolve('c:/Omsystems/Omsystems/docs/manuals/screenshots');
if (!fs.existsSync(SCREENSHOT_DIR)) {
  fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
}

function getBase64Image(filePath) {
  if (fs.existsSync(filePath)) {
    const ext = path.extname(filePath).replace('.', '');
    const data = fs.readFileSync(filePath).toString('base64');
    return `data:image/${ext === 'jpg' ? 'jpeg' : ext};base64,${data}`;
  }
  return '';
}

const cctv1 = getBase64Image('c:/Omsystems/Omsystems/scratch/bettaih-ch2.jpg');
const cctv2 = getBase64Image('c:/Omsystems/Omsystems/scratch/bettaih-ch6.jpg');
const cctv3 = getBase64Image('c:/Omsystems/Omsystems/scratch/rajkot-ch2.jpg');
const cctv4 = getBase64Image('c:/Omsystems/Omsystems/scratch/rajkot-ch6.jpg');
const hustlerLogo = getBase64Image('c:/Omsystems/Omsystems/docs/manuals/screenshots/hustlertech_logo.jpg');

// Shared CSS styles for KryptonVision High-End Dark UI
const sharedStyles = `
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    background-color: #070B14;
    color: #F8FAFC;
    overflow: hidden;
    width: 1440px;
    height: 900px;
    display: flex;
  }
  /* Sidebar */
  .sidebar {
    width: 250px;
    background: #0B0F19;
    border-right: 1px solid #1E293B;
    display: flex;
    flex-direction: column;
    flex-shrink: 0;
    height: 100vh;
  }
  .brand {
    padding: 16px 20px;
    display: flex;
    align-items: center;
    gap: 12px;
    border-bottom: 1px solid #1E293B;
  }
  .brand-logo {
    width: 32px;
    height: 32px;
    background: linear-gradient(135deg, #00D2FF 0%, #0070F3 100%);
    border-radius: 8px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 900;
    color: white;
    font-size: 16px;
    box-shadow: 0 0 15px rgba(0, 210, 255, 0.4);
  }
  .brand-title {
    font-size: 15px;
    font-weight: 700;
    letter-spacing: -0.3px;
    color: #FFFFFF;
  }
  .brand-subtitle {
    font-size: 10px;
    color: #64748B;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .search-box {
    margin: 14px 16px;
    background: #131B2E;
    border: 1px solid #1E293B;
    border-radius: 8px;
    padding: 8px 12px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    font-size: 12px;
    color: #64748B;
  }
  .search-badge {
    background: #1E293B;
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 10px;
    color: #94A3B8;
  }
  .nav-group-title {
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.8px;
    padding: 12px 20px 6px;
  }
  .nav-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 8px 20px;
    font-size: 12.5px;
    color: #94A3B8;
    text-decoration: none;
    font-weight: 500;
    border-left: 3px solid transparent;
  }
  .nav-item.active {
    color: #00D2FF;
    background: rgba(0, 210, 255, 0.08);
    border-left-color: #00D2FF;
    font-weight: 600;
  }
  .nav-item .icon {
    font-size: 14px;
  }
  .nav-item .badge {
    margin-left: auto;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 10px;
    background: #1E293B;
    color: #94A3B8;
  }
  .nav-item.active .badge {
    background: rgba(0, 210, 255, 0.2);
    color: #00D2FF;
  }
  .sidebar-footer {
    margin-top: auto;
    padding: 16px 20px;
    border-top: 1px solid #1E293B;
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .user-avatar {
    width: 32px;
    height: 32px;
    border-radius: 50%;
    background: #1E293B;
    display: flex;
    align-items: center;
    justify-content: center;
    font-size: 12px;
    font-weight: 700;
    color: #00D2FF;
    border: 1px solid #334155;
  }
  .user-info {
    font-size: 12px;
  }
  .user-name { font-weight: 600; color: #F1F5F9; }
  .user-role { font-size: 10px; color: #10B981; }

  /* Main Area */
  .main-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    overflow: hidden;
    background: #070B14;
  }
  .header {
    height: 56px;
    border-bottom: 1px solid #1E293B;
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0 24px;
    background: #0B0F19;
    flex-shrink: 0;
  }
  .breadcrumbs {
    display: flex;
    align-items: center;
    gap: 8px;
    font-size: 12.5px;
  }
  .bc-muted { color: #64748B; }
  .bc-curr { color: #F8FAFC; font-weight: 600; }
  .header-actions {
    display: flex;
    align-items: center;
    gap: 14px;
  }
  .btn-branch {
    background: #131B2E;
    border: 1px solid #1E293B;
    color: #CBD5E1;
    padding: 6px 14px;
    border-radius: 6px;
    font-size: 12px;
    font-weight: 500;
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .status-pill-green {
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.3);
    color: #10B981;
    padding: 4px 10px;
    border-radius: 12px;
    font-size: 11px;
    font-weight: 600;
    display: flex;
    align-items: center;
    gap: 5px;
  }
  .pulse-dot {
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #10B981;
    box-shadow: 0 0 8px #10B981;
  }
  .page-body {
    flex: 1;
    padding: 20px 24px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }
`;

function getSidebarHtml(activeId) {
  const items = [
    { id: 'live', label: 'Live Video Wall', group: 'Surveillance', badge: '32 Live' },
    { id: 'playback', label: 'Synchronized Playback', group: 'Surveillance', badge: '' },
    { id: 'alerts', label: 'Security Alert Center', group: 'Operations', badge: '5 Open' },
    { id: 'incidents', label: 'Incident Management', group: 'Operations', badge: '7 Active' },
    { id: 'rules', label: 'Visual Zone Rules', group: 'Intelligence', badge: '36 Rules' },
    { id: 'health', label: 'Device & Storage Health', group: 'Infrastructure', badge: '100% OK' },
    { id: 'admin', label: 'Branch & Multi-Tenant', group: 'Administration', badge: '24 Sites' }
  ];

  let groupsHtml = '';
  let curGroup = '';
  for (const it of items) {
    if (it.group !== curGroup) {
      curGroup = it.group;
      groupsHtml += `<div class="nav-group-title">${curGroup}</div>`;
    }
    const isActive = it.id === activeId ? 'active' : '';
    groupsHtml += `
      <a class="nav-item ${isActive}">
        <span>●</span>
        <span>${it.label}</span>
        ${it.badge ? `<span class="badge">${it.badge}</span>` : ''}
      </a>
    `;
  }

  return `
    <div class="sidebar">
      <div class="brand">
        <img src="${hustlerLogo}" style="width: 32px; height: 32px; object-fit: contain; border-radius: 6px; background: #ffffff; padding: 2px; box-shadow: 0 0 10px rgba(0, 210, 255, 0.3);" />
        <div>
          <div class="brand-title">HustlerTech</div>
          <div class="brand-subtitle">Enterprise AI VMS</div>
        </div>
      </div>
      <div class="search-box">
        <span>Search cameras, rules...</span>
        <span class="search-badge">⌘K</span>
      </div>
      <div style="flex: 1; overflow-y: auto;">
        ${groupsHtml}
      </div>
      <div class="sidebar-footer">
        <div class="user-avatar">SA</div>
        <div class="user-info">
          <div class="user-name">SuperAdmin</div>
          <div class="user-role">SOC Security Ops • Full Access</div>
        </div>
      </div>
    </div>
  `;
}

// -------------------------------------------------------------
// 1. SLIDE 4: LIVE VIDEO WALL (3x3 Matrix, Real Live Streams)
// -------------------------------------------------------------
function renderLiveVideoWall() {
  const tiles = [
    { id: 'CH 01', name: 'Main Shutter & Entrance', loc: 'Indiranagar', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv1, box: 'Person 99.4% [Track #104]' },
    { id: 'CH 02', name: 'Cash Counters & Barrier', loc: 'Indiranagar', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv2, box: 'Teller Zone • 2 Persons' },
    { id: 'CH 03', name: 'Strongroom Outer Gate', loc: 'MG Road Vault', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv3, box: 'Dual-Custody Zone: Active' },
    { id: 'CH 04', name: 'Vault Room Interior', loc: 'MG Road Vault', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv4, box: '2 Keyholders Present (OK)' },
    { id: 'CH 05', name: 'Customer Queue Hall', loc: 'Kochi Main', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv1, box: 'Queue Length: 4 Persons' },
    { id: 'CH 06', name: 'Logistics Cash Transfer Bay', loc: 'Nariman Point', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv2, box: 'Cash Van Bay: Clear' },
    { id: 'CH 07', name: 'Edge Agent Server Rack', loc: 'Kochi Main', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv3, box: 'Tamper Guard: Active' },
    { id: 'CH 08', name: '24x7 ATM Vestibule', loc: 'Chennai Hub', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv4, box: 'Single Occupancy: Normal' },
    { id: 'CH 09', name: 'Emergency Fire Exit', loc: 'Indiranagar', status: 'LIVE • 1080p', fps: '25 FPS', img: cctv1, box: 'Corridor: Unobstructed' },
  ];

  let gridHtml = '';
  for (const t of tiles) {
    gridHtml += `
      <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; position: relative; overflow: hidden; display: flex; flex-direction: column;">
        <div style="height: 26px; background: rgba(11, 15, 25, 0.85); padding: 0 10px; display: flex; align-items: center; justify-content: space-between; font-size: 11px; border-bottom: 1px solid #1E293B; z-index: 2;">
          <div style="display: flex; align-items: center; gap: 6px;">
            <span style="font-weight: 700; color: #00D2FF;">${t.id}</span>
            <span style="color: #E2E8F0; font-weight: 600;">${t.name}</span>
          </div>
          <span style="color: #64748B; font-size: 10px;">${t.loc}</span>
        </div>
        <div style="flex: 1; position: relative; background: #000; overflow: hidden;">
          <img src="${t.img}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.9;" />
          <div style="position: absolute; top: 8px; right: 8px; background: rgba(0,0,0,0.7); border: 1px solid #10B981; color: #10B981; font-size: 9px; font-weight: 700; padding: 2px 6px; border-radius: 4px; display: flex; align-items: center; gap: 4px;">
            <span style="width: 5px; height: 5px; border-radius: 50%; background: #10B981;"></span> ${t.status}
          </div>
          <div style="position: absolute; bottom: 8px; left: 8px; background: rgba(0, 210, 255, 0.2); border: 1px solid #00D2FF; color: #00D2FF; font-size: 10px; font-weight: 600; padding: 2px 8px; border-radius: 4px;">
            ${t.box}
          </div>
          <div style="position: absolute; bottom: 8px; right: 8px; color: #94A3B8; font-size: 9px; font-family: monospace;">
            ${t.fps} • 4096 kbps
          </div>
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html><html><head><style>${sharedStyles}</style></head><body>
      ${getSidebarHtml('live')}
      <div class="main-content">
        <div class="header">
          <div class="breadcrumbs">
            <span class="bc-muted">Surveillance</span> <span>/</span>
            <span class="bc-curr">Live Video Wall (3x3 Dynamic Matrix)</span>
          </div>
          <div class="header-actions">
            <div class="btn-branch">🏛️ Branch: Indiranagar Hub (BLR-01) ▾</div>
            <div class="btn-branch">🔲 Grid: 3x3 Matrix (9 Channels) ▾</div>
            <div class="status-pill-green"><span class="pulse-dot"></span> 32/32 Cameras Online</div>
          </div>
        </div>
        <div class="page-body">
          <div style="display: flex; gap: 12px; align-items: center; background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 10px 16px;">
            <div style="display: flex; gap: 6px; align-items: center; font-size: 12px; color: #00D2FF; font-weight: 600;">
              <span>⚡ Sub-Second WebRTC Latency:</span> <span style="color: #F8FAFC;">310ms</span>
            </div>
            <div style="width: 1px; height: 16px; background: #1E293B;"></div>
            <div style="font-size: 12px; color: #94A3B8;">AI Detectors Active: <strong style="color: #10B981;">YOLOv8 + Point-In-Polygon</strong></div>
            <div style="width: 1px; height: 16px; background: #1E293B;"></div>
            <div style="font-size: 12px; color: #94A3B8;">Bandwidth: <strong style="color: #F8FAFC;">36.8 Mbps</strong></div>
            <div style="margin-left: auto; display: flex; gap: 8px;">
              <button style="background: #131B2E; border: 1px solid #00D2FF; color: #00D2FF; font-size: 11px; font-weight: 600; padding: 4px 10px; border-radius: 4px;">PTZ Control</button>
              <button style="background: #131B2E; border: 1px solid #334155; color: #E2E8F0; font-size: 11px; padding: 4px 10px; border-radius: 4px;">Take Snapshot</button>
            </div>
          </div>
          <div style="flex: 1; display: grid; grid-template-columns: repeat(3, 1fr); grid-template-rows: repeat(3, 1fr); gap: 10px;">
            ${gridHtml}
          </div>
        </div>
      </div>
    </body></html>
  `;
}

// -------------------------------------------------------------
// 2. SLIDE 5: SYNCHRONIZED PLAYBACK & TIME-TRAVEL
// -------------------------------------------------------------
function renderPlayback() {
  return `
    <!DOCTYPE html><html><head><style>${sharedStyles}</style></head><body>
      ${getSidebarHtml('playback')}
      <div class="main-content">
        <div class="header">
          <div class="breadcrumbs">
            <span class="bc-muted">Forensic Investigation</span> <span>/</span>
            <span class="bc-curr">Multi-Camera Synchronized Playback</span>
          </div>
          <div class="header-actions">
            <div class="btn-branch">📅 Date: 13-10-2026 ▾</div>
            <div class="btn-branch">🕒 Time: 11:42:15 AM IST ▾</div>
            <div class="status-pill-green"><span class="pulse-dot"></span> 4 Streams Millisecond Synced</div>
          </div>
        </div>
        <div class="page-body">
          <!-- 4-Quadrant Synced Player -->
          <div style="flex: 1; display: grid; grid-template-columns: 1fr 1fr; grid-template-rows: 1fr 1fr; gap: 10px;">
            <div style="background: #000; border: 1px solid #1E293B; border-radius: 8px; position: relative; overflow: hidden;">
              <img src="${cctv1}" style="width: 100%; height: 100%; object-fit: cover;" />
              <div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #00D2FF;">CAM 01 - Main Entrance (11:42:15.820)</div>
            </div>
            <div style="background: #000; border: 1px solid #1E293B; border-radius: 8px; position: relative; overflow: hidden;">
              <img src="${cctv2}" style="width: 100%; height: 100%; object-fit: cover;" />
              <div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #00D2FF;">CAM 02 - Cash Counters (11:42:15.820)</div>
            </div>
            <div style="background: #000; border: 1px solid #1E293B; border-radius: 8px; position: relative; overflow: hidden;">
              <img src="${cctv3}" style="width: 100%; height: 100%; object-fit: cover;" />
              <div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #00D2FF;">CAM 03 - Strongroom Corridor (11:42:15.820)</div>
            </div>
            <div style="background: #000; border: 1px solid #1E293B; border-radius: 8px; position: relative; overflow: hidden;">
              <img src="${cctv4}" style="width: 100%; height: 100%; object-fit: cover;" />
              <div style="position: absolute; top: 8px; left: 8px; background: rgba(0,0,0,0.7); padding: 3px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #00D2FF;">CAM 04 - Vault Strongroom (11:42:15.820)</div>
            </div>
          </div>
          <!-- Scrubber & Heatmap Controls -->
          <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 14px 18px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
              <div style="display: flex; gap: 12px; align-items: center;">
                <button style="background: #00D2FF; border: none; color: #070B14; font-weight: 800; padding: 6px 14px; border-radius: 4px;">▶ PLAY</button>
                <div style="display: flex; gap: 4px;">
                  <button style="background: #1E293B; color: #CBD5E1; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px;">0.5x</button>
                  <button style="background: #0070F3; color: white; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 700;">1x</button>
                  <button style="background: #1E293B; color: #CBD5E1; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px;">2x</button>
                  <button style="background: #1E293B; color: #CBD5E1; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px;">4x</button>
                  <button style="background: #1E293B; color: #CBD5E1; border: none; padding: 4px 8px; border-radius: 4px; font-size: 11px;">16x</button>
                </div>
                <span style="color: #64748B;">Timestamp:</span> <strong style="color: #00D2FF; font-family: monospace; font-size: 14px;">13-10-2026 11:42:15.820 IST</strong>
              </div>
              <div style="display: flex; gap: 10px;">
                <button style="background: #10B981; color: white; border: none; padding: 6px 14px; border-radius: 4px; font-size: 11px; font-weight: 700;">🔒 Export SHA-256 Evidence Clip</button>
                <button style="background: #1E293B; color: #E2E8F0; border: 1px solid #334155; padding: 6px 12px; border-radius: 4px; font-size: 11px;">Bookmark Incident</button>
              </div>
            </div>
            <!-- Heatmap timeline bar -->
            <div style="position: relative; height: 32px; background: #131B2E; border-radius: 6px; overflow: hidden; display: flex; align-items: center;">
              <!-- Continuous blue recording -->
              <div style="position: absolute; left: 0; width: 100%; height: 8px; background: #0070F3; opacity: 0.8;"></div>
              <!-- Motion bursts -->
              <div style="position: absolute; left: 22%; width: 8%; height: 16px; background: #F59E0B; border-radius: 2px;"></div>
              <div style="position: absolute; left: 45%; width: 12%; height: 16px; background: #F59E0B; border-radius: 2px;"></div>
              <!-- AI Severity Alert trigger -->
              <div style="position: absolute; left: 48%; width: 4px; height: 32px; background: #F43F5E; box-shadow: 0 0 10px #F43F5E; z-index: 3;"></div>
              <div style="position: absolute; left: 48.5%; top: 2px; font-size: 9px; color: #F43F5E; font-weight: 700;">[NBFC-R01 BREACH]</div>
              <!-- Scrubber Head -->
              <div style="position: absolute; left: 49%; width: 2px; height: 32px; background: #FFF; box-shadow: 0 0 8px #FFF; z-index: 4;"></div>
            </div>
            <div style="display: flex; justify-content: space-between; font-size: 10px; color: #64748B; font-family: monospace;">
              <span>00:00:00</span><span>04:00:00</span><span>08:00:00</span><span>12:00:00 (NOON)</span><span>16:00:00</span><span>20:00:00</span><span>23:59:59</span>
            </div>
          </div>
        </div>
      </div>
    </body></html>
  `;
}

// -------------------------------------------------------------
// 3. SLIDE 6: VISUAL ZONE DESIGNER & AI RULES
// -------------------------------------------------------------
function renderRules() {
  return `
    <!DOCTYPE html><html><head><style>${sharedStyles}</style></head><body>
      ${getSidebarHtml('rules')}
      <div class="main-content">
        <div class="header">
          <div class="breadcrumbs">
            <span class="bc-muted">Intelligence & AI</span> <span>/</span>
            <span class="bc-curr">Visual Zone Designer & Compound Rule Automation</span>
          </div>
          <div class="header-actions">
            <div class="btn-branch">Zone: Strongroom & Teller Hall ▾</div>
            <div class="status-pill-green"><span class="pulse-dot"></span> 36 Pre-Seeded Banking Rules Active</div>
          </div>
        </div>
        <div class="page-body" style="display: grid; grid-template-columns: 1.6fr 1.1fr; gap: 16px;">
          <!-- Drawing Canvas -->
          <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 14px; display: flex; flex-direction: column; gap: 10px;">
            <div style="display: flex; justify-content: space-between; align-items: center; font-size: 12px;">
              <span style="font-weight: 700; color: #00D2FF;">Geometric Zone Canvas (CAM 02 - Cash Counters & Vault Entry)</span>
              <div style="display: flex; gap: 6px;">
                <button style="background: #1E293B; border: 1px solid #00D2FF; color: #00D2FF; font-size: 11px; padding: 3px 8px; border-radius: 4px;">Draw Polygon (PIP)</button>
                <button style="background: #1E293B; border: 1px solid #334155; color: #CBD5E1; font-size: 11px; padding: 3px 8px; border-radius: 4px;">Draw Tripwire Line</button>
              </div>
            </div>
            <div style="flex: 1; position: relative; background: #000; border-radius: 6px; overflow: hidden;">
              <img src="${cctv2}" style="width: 100%; height: 100%; object-fit: cover; opacity: 0.85;" />
              <!-- SVG Visual Zone Overlays -->
              <svg style="position: absolute; top:0; left:0; width:100%; height:100%;">
                <!-- Vault Security Polygon -->
                <polygon points="120,80 320,60 380,240 140,260" style="fill:rgba(244,63,94,0.25);stroke:#F43F5E;stroke-width:2.5;" />
                <text x="140" y="105" fill="#F43F5E" font-size="12" font-weight="700">ZONE-01: Restricted Vault Enclosure</text>
                <!-- Teller Barrier Tripwire -->
                <line x1="280" y1="280" x2="680" y2="280" style="stroke:#00D2FF;stroke-width:3;stroke-dasharray:6,4;" />
                <text x="320" y="270" fill="#00D2FF" font-size="12" font-weight="700">TRIPWIRE: Teller Acrylic Barrier [Direction: INBOUND]</text>
              </svg>
            </div>
            <div style="font-size: 11px; color: #64748B; display: flex; justify-content: space-between;">
              <span>Resolution: 1920x1080 (Normalized Coordinates 0.0 - 1.0)</span>
              <span style="color: #10B981;">✓ Real-Time Ray-Casting Active</span>
            </div>
          </div>
          <!-- Rule Configuration Editor -->
          <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
            <div style="font-size: 13px; font-weight: 700; color: #F8FAFC; border-bottom: 1px solid #1E293B; padding-bottom: 8px;">
              Active Compound Rule: NBFC-R01
            </div>
            <div style="display: flex; flex-direction: column; gap: 8px; font-size: 11.5px;">
              <div>
                <span style="color: #64748B;">Rule Title:</span>
                <div style="font-weight: 600; color: #E2E8F0; margin-top: 2px;">Dual-Control Solitary Vault Access Alarm</div>
              </div>
              <div style="background: #131B2E; padding: 10px; border-radius: 6px; border: 1px solid #1E293B; font-family: monospace; font-size: 11px; color: #00D2FF;">
                IF (zone == "ZONE-01"<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;AND person_count == 1<br/>
                &nbsp;&nbsp;&nbsp;&nbsp;AND dwell_duration >= 3000ms)<br/>
                THEN TRIGGER CRITICAL_SEVERITY
              </div>
              <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 8px; margin-top: 4px;">
                <div style="background: #131B2E; padding: 8px; border-radius: 6px;">
                  <span style="color: #64748B; font-size: 10px;">Anti-Storm Cooldown</span>
                  <div style="color: #10B981; font-weight: 700;">120 Seconds (Redis Token)</div>
                </div>
                <div style="background: #131B2E; padding: 8px; border-radius: 6px;">
                  <span style="color: #64748B; font-size: 10px;">Schedule Window</span>
                  <div style="color: #E2E8F0; font-weight: 700;">09:30 - 18:30 IST</div>
                </div>
              </div>
              <div>
                <span style="color: #64748B;">Multi-Channel Actions:</span>
                <div style="display: flex; gap: 6px; flex-wrap: wrap; margin-top: 4px;">
                  <span style="background: rgba(244,63,94,0.15); color: #F43F5E; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">🚨 Local Siren Relay</span>
                  <span style="background: rgba(0,210,255,0.15); color: #00D2FF; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">💻 SOC Instant Popup</span>
                  <span style="background: rgba(16,185,129,0.15); color: #10B981; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">📱 Telegram / WhatsApp Push</span>
                  <span style="background: rgba(245,158,11,0.15); color: #F59E0B; padding: 3px 8px; border-radius: 4px; font-size: 10px; font-weight: 600;">📞 Automated IVR Call</span>
                </div>
              </div>
              <div style="margin-top: 6px; border-top: 1px solid #1E293B; padding-top: 8px; display: flex; justify-content: space-between; align-items: center;">
                <span style="color: #64748B;">Status: <strong style="color: #10B981;">Active in Production</strong></span>
                <button style="background: #0070F3; color: white; border: none; padding: 6px 12px; border-radius: 4px; font-weight: 600; font-size: 11px;">Update Rule</button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body></html>
  `;
}

// -------------------------------------------------------------
// 4. SLIDE 7: ANTI-STORM DEDUPLICATION & ALERT OPERATIONS
// -------------------------------------------------------------
function renderAlerts() {
  const alerts = [
    { p: 'P1 CRITICAL', col: '#F43F5E', bg: 'rgba(244,63,94,0.12)', title: 'Strongroom Solitary Access Breach (Dual Custody)', loc: 'Kochi Main Branch • CAM 04 (Vault)', time: '2 mins ago', desc: '1 individual detected inside restricted strongroom without second designated officer. Anti-storm lock held.' },
    { p: 'P2 HIGH', col: '#F59E0B', bg: 'rgba(245,158,11,0.12)', title: 'Cash Counter Acrylic Barrier Crossing', loc: 'Indiranagar Flagship • CAM 02 (Counters)', time: '14 mins ago', desc: 'Customer trajectory crossed directional tripwire into teller cash area. Dwell time: 4.2s.' },
    { p: 'P2 HIGH', col: '#F59E0B', bg: 'rgba(245,158,11,0.12)', title: 'Vault Main Door Propped Open Exceeds 180s', loc: 'MG Road Vault • CAM 03 (Vault Gate)', time: '38 mins ago', desc: 'Door contact open sensor active for 210s. Automated escalation dispatched to Branch Manager.' },
    { p: 'P3 MEDIUM', col: '#3B82F6', bg: 'rgba(59,130,246,0.12)', title: 'Logistics Cash Van Unattended Dwell Time', loc: 'Nariman Point • CAM 06 (Loading Bay)', time: '1 hour ago', desc: 'Armored cash vehicle stationed in transfer bay for >35 mins without guard check-in.' },
    { p: 'P3 MEDIUM', col: '#3B82F6', bg: 'rgba(59,130,246,0.12)', title: 'Camera Rapid Occlusion / Spray Tampering Detected', loc: 'Delhi CP • CAM 01 (Entrance)', time: '2 hours ago', desc: '82% scene contrast drop in 3 seconds. Camera health diagnostics test triggered.' },
  ];

  let listHtml = '';
  for (const a of alerts) {
    listHtml += `
      <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 12px 16px; display: flex; align-items: center; justify-content: space-between; gap: 16px;">
        <div style="display: flex; gap: 14px; align-items: center;">
          <div style="background: ${a.bg}; border: 1px solid ${a.col}; color: ${a.col}; font-size: 10px; font-weight: 800; padding: 4px 8px; border-radius: 4px; min-width: 85px; text-align: center;">
            ${a.p}
          </div>
          <div>
            <div style="font-size: 13px; font-weight: 700; color: #F8FAFC;">${a.title}</div>
            <div style="font-size: 11px; color: #64748B; margin-top: 2px;">
              📍 <span style="color: #94A3B8;">${a.loc}</span> • <span style="color: #00D2FF;">${a.desc}</span>
            </div>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 12px; flex-shrink: 0;">
          <span style="font-size: 11px; color: #64748B;">${a.time}</span>
          <button style="background: #131B2E; border: 1px solid #00D2FF; color: #00D2FF; font-size: 11px; font-weight: 600; padding: 5px 12px; border-radius: 4px;">Acknowledge</button>
          <button style="background: #1E293B; border: 1px solid #334155; color: #E2E8F0; font-size: 11px; padding: 5px 12px; border-radius: 4px;">Escalate</button>
        </div>
      </div>
    `;
  }

  return `
    <!DOCTYPE html><html><head><style>${sharedStyles}</style></head><body>
      ${getSidebarHtml('alerts')}
      <div class="main-content">
        <div class="header">
          <div class="breadcrumbs">
            <span class="bc-muted">SOC Operations</span> <span>/</span>
            <span class="bc-curr">Real-Time Alert Center & Anti-Storm Triage</span>
          </div>
          <div class="header-actions">
            <div class="status-pill-green"><span class="pulse-dot"></span> Anti-Storm Filter: 1,482 Duplicates Suppressed (99.1%)</div>
          </div>
        </div>
        <div class="page-body">
          <!-- KPI Cards -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
            <div style="background: #0B0F19; border: 1px solid #F43F5E; border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 11px; color: #F43F5E; font-weight: 700;">CRITICAL (P1) ALERTS</div>
              <div style="font-size: 24px; font-weight: 800; color: #FFF; margin-top: 4px;">2 <span style="font-size: 11px; color: #64748B; font-weight: 400;">(Immediate SOC Triage)</span></div>
            </div>
            <div style="background: #0B0F19; border: 1px solid #F59E0B; border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 11px; color: #F59E0B; font-weight: 700;">HIGH (P2) ALERTS</div>
              <div style="font-size: 24px; font-weight: 800; color: #FFF; margin-top: 4px;">5 <span style="font-size: 11px; color: #64748B; font-weight: 400;">(Under Investigation)</span></div>
            </div>
            <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 11px; color: #10B981; font-weight: 700;">NOISE SUPPRESSED</div>
              <div style="font-size: 24px; font-weight: 800; color: #FFF; margin-top: 4px;">1,482 <span style="font-size: 11px; color: #10B981; font-weight: 400;">(Zero False Siren Storms)</span></div>
            </div>
            <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 12px 16px;">
              <div style="font-size: 11px; color: #00D2FF; font-weight: 700;">AVG RESOLUTION TIME</div>
              <div style="font-size: 24px; font-weight: 800; color: #FFF; margin-top: 4px;">18.4s <span style="font-size: 11px; color: #64748B; font-weight: 400;">(SLA: &lt;60s)</span></div>
            </div>
          </div>
          <!-- Alert List -->
          <div style="display: flex; flex-direction: column; gap: 8px; margin-top: 4px;">
            ${listHtml}
          </div>
        </div>
      </div>
    </body></html>
  `;
}

// -------------------------------------------------------------
// 5. SLIDE 9: INCIDENT RESPONSE & EVIDENCE VAULT
// -------------------------------------------------------------
function renderIncidents() {
  const incidents = [
    { id: 'INC-2026-0842', type: 'Dual-Custody Violation', sev: 'CRITICAL', col: '#F43F5E', branch: 'Kochi Main Branch', cam: 'CAM 04 (Vault)', time: '13-10 11:42', status: 'In Triage', hash: 'e3b0c44298fc1c14... (SHA-256)' },
    { id: 'INC-2026-0841', type: 'Teller Barrier Intrusion', sev: 'HIGH', col: '#F59E0B', branch: 'Indiranagar Flagship', cam: 'CAM 02 (Counters)', time: '13-10 11:28', status: 'Under Investigation', hash: '7f83b1657ff1fc53... (SHA-256)' },
    { id: 'INC-2026-0840', type: 'Strongroom Door Left Ajar', sev: 'HIGH', col: '#F59E0B', branch: 'MG Road Vault Hub', cam: 'CAM 03 (Vault Gate)', time: '13-10 10:55', status: 'Escalated to Police', hash: 'a591a6d40bf42040... (SHA-256)' },
    { id: 'INC-2026-0839', type: 'Unattended Cash Box in Bay', sev: 'MEDIUM', col: '#3B82F6', branch: 'Nariman Point Hub', cam: 'CAM 06 (Bay 01)', time: '13-10 09:40', status: 'Resolved & Signed', hash: '2c26b46b68ffc68e... (SHA-256)' },
    { id: 'INC-2026-0838', type: 'Camera Occlusion Tampering', sev: 'HIGH', col: '#F59E0B', branch: 'Delhi Connaught Place', cam: 'CAM 01 (Entrance)', time: '13-10 08:15', status: 'Resolved & Signed', hash: '8f434346648f6b96... (SHA-256)' },
    { id: 'INC-2026-0837', type: 'After-Hours Motion in Strongroom', sev: 'CRITICAL', col: '#F43F5E', branch: 'Chennai Central Vault', cam: 'CAM 04 (Locker)', time: '13-10 02:14', status: 'Closed (Court Bundle Exported)', hash: 'f7ff9e8b7bb2e09b... (SHA-256)' },
  ];

  let rowsHtml = '';
  for (const r of incidents) {
    rowsHtml += `
      <tr style="border-bottom: 1px solid #1E293B; font-size: 11.5px;">
        <td style="padding: 10px 12px; font-family: monospace; color: #00D2FF; font-weight: 700;">${r.id}</td>
        <td style="padding: 10px 12px; font-weight: 600; color: #F8FAFC;">${r.type}</td>
        <td style="padding: 10px 12px;">
          <span style="background: rgba(244,63,94,0.15); color: ${r.col}; font-weight: 800; font-size: 10px; padding: 2px 8px; border-radius: 4px; border: 1px solid ${r.col};">${r.sev}</span>
        </td>
        <td style="padding: 10px 12px; color: #CBD5E1;">${r.branch} • <span style="color: #64748B;">${r.cam}</span></td>
        <td style="padding: 10px 12px; color: #94A3B8; font-family: monospace;">${r.time}</td>
        <td style="padding: 10px 12px; color: #10B981; font-weight: 600;">${r.status}</td>
        <td style="padding: 10px 12px;">
          <button style="background: #131B2E; border: 1px solid #00D2FF; color: #00D2FF; font-size: 10px; font-weight: 600; padding: 3px 8px; border-radius: 4px;">🎬 Evidence MP4</button>
        </td>
        <td style="padding: 10px 12px; font-family: monospace; font-size: 10px; color: #64748B;">${r.hash}</td>
      </tr>
    `;
  }

  return `
    <!DOCTYPE html><html><head><style>${sharedStyles}</style></head><body>
      ${getSidebarHtml('incidents')}
      <div class="main-content">
        <div class="header">
          <div class="breadcrumbs">
            <span class="bc-muted">Governance & Compliance</span> <span>/</span>
            <span class="bc-curr">Incident Management & Cryptographic Evidence Vault</span>
          </div>
          <div class="header-actions">
            <button style="background: #0070F3; color: white; border: none; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 6px;">+ Create New Incident</button>
            <div class="status-pill-green"><span class="pulse-dot"></span> Court-Admissible Hash Ledger Active</div>
          </div>
        </div>
        <div class="page-body">
          <!-- Incident Table -->
          <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; overflow: hidden; flex: 1;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #131B2E; border-bottom: 1px solid #1E293B; font-size: 10.5px; color: #94A3B8; text-transform: uppercase;">
                  <th style="padding: 10px 12px;">Incident ID</th>
                  <th style="padding: 10px 12px;">Rule Title & Type</th>
                  <th style="padding: 10px 12px;">Severity</th>
                  <th style="padding: 10px 12px;">Branch & Source</th>
                  <th style="padding: 10px 12px;">Timestamp</th>
                  <th style="padding: 10px 12px;">Status</th>
                  <th style="padding: 10px 12px;">Visual Evidence</th>
                  <th style="padding: 10px 12px;">SHA-256 Audit Seal</th>
                </tr>
              </thead>
              <tbody>
                ${rowsHtml}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </body></html>
  `;
}

// -------------------------------------------------------------
// 6. SLIDE 10: CAMERA HEALTH & STORAGE LIFECYCLE
// -------------------------------------------------------------
function renderHealth() {
  const cams = [
    { name: 'Kochi Main Branch', online: '16/16 Online', fps: '25.0 FPS', kbps: '4,096 kbps', jitter: '4ms', drift: '+1ms (NTP Synced)', temp: '42°C Normal' },
    { name: 'Indiranagar Flagship', online: '24/24 Online', fps: '25.0 FPS', kbps: '4,120 kbps', jitter: '5ms', drift: '+2ms (NTP Synced)', temp: '44°C Normal' },
    { name: 'MG Road Vault Hub', online: '18/18 Online', fps: '25.0 FPS', kbps: '4,080 kbps', jitter: '6ms', drift: '+1ms (NTP Synced)', temp: '41°C Normal' },
    { name: 'Nariman Point Treasury', online: '32/32 Online', fps: '25.0 FPS', kbps: '4,200 kbps', jitter: '7ms', drift: '+3ms (NTP Synced)', temp: '45°C Normal' },
    { name: 'Chennai Central Hub', online: '20/20 Online', fps: '25.0 FPS', kbps: '4,096 kbps', jitter: '5ms', drift: '+1ms (NTP Synced)', temp: '43°C Normal' },
  ];

  let camRows = '';
  for (const c of cams) {
    camRows += `
      <tr style="border-bottom: 1px solid #1E293B; font-size: 11.5px;">
        <td style="padding: 10px 14px; font-weight: 700; color: #F8FAFC;">${c.name}</td>
        <td style="padding: 10px 14px; color: #10B981; font-weight: 700;">● ${c.online}</td>
        <td style="padding: 10px 14px; color: #CBD5E1; font-family: monospace;">${c.fps}</td>
        <td style="padding: 10px 14px; color: #CBD5E1; font-family: monospace;">${c.kbps}</td>
        <td style="padding: 10px 14px; color: #00D2FF; font-family: monospace;">${c.jitter}</td>
        <td style="padding: 10px 14px; color: #10B981;">✓ ${c.drift}</td>
        <td style="padding: 10px 14px; color: #94A3B8;">${c.temp}</td>
      </tr>
    `;
  }

  return `
    <!DOCTYPE html><html><head><style>${sharedStyles}</style></head><body>
      ${getSidebarHtml('health')}
      <div class="main-content">
        <div class="header">
          <div class="breadcrumbs">
            <span class="bc-muted">Infrastructure</span> <span>/</span>
            <span class="bc-curr">Central Device Health, Telemetry & Storage Lifecycle</span>
          </div>
          <div class="header-actions">
            <div class="status-pill-green"><span class="pulse-dot"></span> Fleet Health: 99.8% (192/192 Connected)</div>
          </div>
        </div>
        <div class="page-body">
          <!-- Top Telemetry KPIs -->
          <div style="display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px;">
            <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 14px;">
              <span style="font-size: 11px; color: #64748B;">Active Cameras</span>
              <div style="font-size: 24px; font-weight: 800; color: #10B981; margin-top: 2px;">192 / 192 <span style="font-size: 11px; color: #10B981;">(100% Online)</span></div>
            </div>
            <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 14px;">
              <span style="font-size: 11px; color: #64748B;">Local Edge NVMe Storage</span>
              <div style="font-size: 24px; font-weight: 800; color: #F8FAFC; margin-top: 2px;">3.2 TB / 5 TB <span style="font-size: 11px; color: #00D2FF;">(64% Used)</span></div>
            </div>
            <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 14px;">
              <span style="font-size: 11px; color: #64748B;">Central S3 Cold Archive</span>
              <div style="font-size: 24px; font-weight: 800; color: #F8FAFC; margin-top: 2px;">38.4 TB / 50 TB <span style="font-size: 11px; color: #10B981;">(90 Days Compliant)</span></div>
            </div>
            <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 14px;">
              <span style="font-size: 11px; color: #64748B;">Clock Drift (Legal Validity)</span>
              <div style="font-size: 24px; font-weight: 800; color: #10B981; margin-top: 2px;">&lt; 3ms <span style="font-size: 11px; color: #10B981;">(NTP Synchronized)</span></div>
            </div>
          </div>
          <!-- Camera Telemetry Table -->
          <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; overflow: hidden; flex: 1;">
            <table style="width: 100%; border-collapse: collapse; text-align: left;">
              <thead>
                <tr style="background: #131B2E; border-bottom: 1px solid #1E293B; font-size: 10.5px; color: #94A3B8; text-transform: uppercase;">
                  <th style="padding: 10px 14px;">Branch Location</th>
                  <th style="padding: 10px 14px;">Channel Status</th>
                  <th style="padding: 10px 14px;">Frame Rate</th>
                  <th style="padding: 10px 14px;">Bitrate Stream</th>
                  <th style="padding: 10px 14px;">Latency & Jitter</th>
                  <th style="padding: 10px 14px;">Hardware NTP Drift</th>
                  <th style="padding: 10px 14px;">Thermal Status</th>
                </tr>
              </thead>
              <tbody>
                ${camRows}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </body></html>
  `;
}

// -------------------------------------------------------------
// 7. SLIDE 11: MULTI-TENANT HIERARCHY & ONBOARDING
// -------------------------------------------------------------
function renderAdmin() {
  return `
    <!DOCTYPE html><html><head><style>${sharedStyles}</style></head><body>
      ${getSidebarHtml('admin')}
      <div class="main-content">
        <div class="header">
          <div class="breadcrumbs">
            <span class="bc-muted">Administration</span> <span>/</span>
            <span class="bc-curr">Multi-Tenant Organizational Hierarchy & Branch Provisioning</span>
          </div>
          <div class="header-actions">
            <button style="background: #0070F3; color: white; border: none; font-size: 12px; font-weight: 700; padding: 6px 14px; border-radius: 6px;">+ Onboard New Branch</button>
            <div class="status-pill-green"><span class="pulse-dot"></span> 24 Branches Configured</div>
          </div>
        </div>
        <div class="page-body" style="display: grid; grid-template-columns: 1fr 1.6fr; gap: 16px;">
          <!-- Hierarchy Tree -->
          <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 10px;">
            <div style="font-size: 13px; font-weight: 700; color: #F8FAFC; border-bottom: 1px solid #1E293B; padding-bottom: 8px;">
              Enterprise Organizational Tree
            </div>
            <div style="font-size: 12px; display: flex; flex-direction: column; gap: 8px; font-family: monospace;">
              <div style="color: #00D2FF; font-weight: 700;">🏢 Apex Financial Holdings (Tenant)</div>
              <div style="padding-left: 16px; color: #E2E8F0;">└─ 📁 Karnataka Region (12 Branches)</div>
              <div style="padding-left: 32px; color: #10B981;">├─ 🏛️ Indiranagar Flagship [24 Cams • Online]</div>
              <div style="padding-left: 32px; color: #10B981;">└─ 🏛️ MG Road Vault Hub [18 Cams • Online]</div>
              <div style="padding-left: 16px; color: #E2E8F0;">└─ 📁 Kerala Region (8 Branches)</div>
              <div style="padding-left: 32px; color: #10B981;">├─ 🏛️ Kochi Main Branch [16 Cams • Online]</div>
              <div style="padding-left: 32px; color: #10B981;">└─ 🏛️ Kozhikode Central [14 Cams • Online]</div>
              <div style="padding-left: 16px; color: #E2E8F0;">└─ 📁 Maharashtra Region (14 Branches)</div>
              <div style="padding-left: 32px; color: #10B981;">└─ 🏛️ Nariman Point Treasury [32 Cams • Online]</div>
            </div>
          </div>
          <!-- Branch Camera Provisioning Center -->
          <div style="background: #0B0F19; border: 1px solid #1E293B; border-radius: 8px; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
            <div style="font-size: 13px; font-weight: 700; color: #F8FAFC; border-bottom: 1px solid #1E293B; padding-bottom: 8px; display: flex; justify-content: space-between;">
              <span>Branch Gateway & Device Inventory: Indiranagar Hub</span>
              <span style="color: #10B981; font-size: 11px;">Edge Agent v0.1.48 Connected</span>
            </div>
            <div style="background: #131B2E; border: 1px solid #1E293B; border-radius: 6px; padding: 10px 14px; display: flex; justify-content: space-between; align-items: center; font-size: 11.5px;">
              <div>
                <strong style="color: #F8FAFC;">ONVIF Network Scanner:</strong>
                <span style="color: #10B981; margin-left: 6px;">16/16 IP Cameras Automatically Discovered</span>
              </div>
              <button style="background: #00D2FF; color: #070B14; border: none; font-size: 11px; font-weight: 700; padding: 4px 10px; border-radius: 4px;">Run Discovery Scan</button>
            </div>
            <div style="display: flex; flex-direction: column; gap: 6px; font-size: 11.5px;">
              <div style="display: grid; grid-template-columns: 2fr 2fr 2fr 1fr; background: #1E293B; padding: 6px 10px; border-radius: 4px; font-size: 10px; color: #94A3B8; text-transform: uppercase;">
                <span>Camera / Model</span>
                <span>IP / ONVIF Profile</span>
                <span>Zone Mapping</span>
                <span>Status</span>
              </div>
              <div style="display: grid; grid-template-columns: 2fr 2fr 2fr 1fr; background: #0F172A; padding: 8px 10px; border-radius: 4px; align-items: center;">
                <span style="color: #F8FAFC; font-weight: 600;">CAM 01 - Main Shutter</span>
                <span style="color: #64748B; font-family: monospace;">192.168.1.101 (Profile S)</span>
                <span style="color: #00D2FF;">Perimeter & Entrance</span>
                <span style="color: #10B981; font-weight: 700;">● Active</span>
              </div>
              <div style="display: grid; grid-template-columns: 2fr 2fr 2fr 1fr; background: #0F172A; padding: 8px 10px; border-radius: 4px; align-items: center;">
                <span style="color: #F8FAFC; font-weight: 600;">CAM 02 - Cash Counters</span>
                <span style="color: #64748B; font-family: monospace;">192.168.1.102 (Profile G)</span>
                <span style="color: #00D2FF;">Teller Security Zone</span>
                <span style="color: #10B981; font-weight: 700;">● Active</span>
              </div>
              <div style="display: grid; grid-template-columns: 2fr 2fr 2fr 1fr; background: #0F172A; padding: 8px 10px; border-radius: 4px; align-items: center;">
                <span style="color: #F8FAFC; font-weight: 600;">CAM 03 - Vault Gate</span>
                <span style="color: #64748B; font-family: monospace;">192.168.1.103 (Profile T)</span>
                <span style="color: #00D2FF;">Strongroom Access</span>
                <span style="color: #10B981; font-weight: 700;">● Active</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </body></html>
  `;
}

async function main() {
  console.log('Launching Playwright to capture ultra-high-end rich enterprise screenshots...');
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();

  const screens = [
    { name: 'SS-003-live-video-wall.png', html: renderLiveVideoWall() },
    { name: 'SS-004-synced-playback.png', html: renderPlayback() },
    { name: 'SS-010-ai-rules-automation.png', html: renderRules() },
    { name: 'SS-006-alert-operations.png', html: renderAlerts() },
    { name: 'SS-007-incident-response.png', html: renderIncidents() },
    { name: 'SS-011-camera-health.png', html: renderHealth() },
    { name: 'SS-013-organization-admin.png', html: renderAdmin() },
  ];

  for (const s of screens) {
    console.log('Rendering', s.name, '...');
    await page.setContent(s.html, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(600);
    const dest = path.join(SCREENSHOT_DIR, s.name);
    await page.screenshot({ path: dest });
    console.log('✓ Successfully saved', dest, `(${fs.statSync(dest).size} bytes)`);
  }

  await browser.close();
  console.log('All 7 rich demo screenshots captured!');
}

main().catch(console.error);
