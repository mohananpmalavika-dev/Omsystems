import sharp from "sharp";
import fs from "fs";
import path from "path";

const publicDir = path.resolve("dashboard/public");

if (!fs.existsSync(publicDir)) {
  fs.mkdirSync(publicDir, { recursive: true });
}

// Crisp SVG for KryptonVision Security
const svgIcon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs>
    <linearGradient id="bgGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#0b1329" />
      <stop offset="50%" stop-color="#0f172a" />
      <stop offset="100%" stop-color="#030712" />
    </linearGradient>
    <linearGradient id="shieldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#38bdf8" />
      <stop offset="40%" stop-color="#2563eb" />
      <stop offset="100%" stop-color="#1d4ed8" />
    </linearGradient>
    <linearGradient id="cyanGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#67e8f9" />
      <stop offset="100%" stop-color="#06b6d4" />
    </linearGradient>
    <linearGradient id="emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#34d399" />
      <stop offset="100%" stop-color="#059669" />
    </linearGradient>
    <filter id="glow" x="-20%" y="-20%" width="140%" height="140%">
      <feGaussianBlur stdDeviation="12" result="blur" />
      <feComposite in="SourceGraphic" in2="blur" operator="over" />
    </filter>
  </defs>

  <!-- Background Rounded Base -->
  <rect x="16" y="16" width="480" height="480" rx="108" fill="url(#bgGrad)" stroke="#1e293b" stroke-width="6" />

  <!-- Subtle Outer Accent Ring -->
  <circle cx="256" cy="256" r="216" fill="none" stroke="#38bdf8" stroke-width="2" stroke-opacity="0.2" stroke-dasharray="12 8" />

  <!-- Central Shield -->
  <path d="M256 68 L384 124 C384 260 328 368 256 424 C184 368 128 260 128 124 Z" 
        fill="none" 
        stroke="url(#shieldGrad)" 
        stroke-width="18" 
        stroke-linejoin="round"
        filter="url(#glow)" />

  <path d="M256 92 L360 138 C360 250 314 340 256 392 C198 340 152 250 152 138 Z" 
        fill="#0f172a" 
        fill-opacity="0.85" 
        stroke="#1e3a8a" 
        stroke-width="4" />

  <!-- Surveillance Camera Lens / Ocular Center -->
  <circle cx="256" cy="240" r="68" fill="#030712" stroke="url(#cyanGrad)" stroke-width="8" />
  <circle cx="256" cy="240" r="44" fill="#0f172a" stroke="#2563eb" stroke-width="4" />
  <circle cx="256" cy="240" r="24" fill="url(#cyanGrad)" filter="url(#glow)" />
  <circle cx="266" cy="230" r="8" fill="#ffffff" fill-opacity="0.8" />

  <!-- Crosshair / Reticle Marks -->
  <line x1="256" y1="148" x2="256" y2="162" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" />
  <line x1="256" y1="318" x2="256" y2="332" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" />
  <line x1="164" y1="240" x2="178" y2="240" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" />
  <line x1="334" y1="240" x2="348" y2="240" stroke="#38bdf8" stroke-width="6" stroke-linecap="round" />

  <!-- Status Ping Dot (Green Active Sentinel) -->
  <circle cx="360" cy="140" r="14" fill="url(#emeraldGrad)" stroke="#0b1329" stroke-width="4" />
</svg>`;

async function run() {
  console.log("Writing icon.svg...");
  fs.writeFileSync(path.join(publicDir, "icon.svg"), svgIcon, "utf8");

  const svgBuffer = Buffer.from(svgIcon);

  console.log("Generating icon-192.png...");
  await sharp(svgBuffer).resize(192, 192).png().toFile(path.join(publicDir, "icon-192.png"));

  console.log("Generating icon-512.png...");
  await sharp(svgBuffer).resize(512, 512).png().toFile(path.join(publicDir, "icon-512.png"));

  console.log("Generating apple-touch-icon.png (180x180)...");
  await sharp(svgBuffer).resize(180, 180).png().toFile(path.join(publicDir, "apple-touch-icon.png"));

  console.log("Generating maskable icons (with 15% safe padding)...");
  // Maskable icons require safe zone margin
  const maskableSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
    <rect width="512" height="512" fill="#090d16" />
    <g transform="translate(51.2, 51.2) scale(0.8)">
      ${svgIcon.replace(/<\/?svg[^>]*>/g, "")}
    </g>
  </svg>`;
  const maskableBuffer = Buffer.from(maskableSvg);

  await sharp(maskableBuffer).resize(192, 192).png().toFile(path.join(publicDir, "icon-maskable-192.png"));
  await sharp(maskableBuffer).resize(512, 512).png().toFile(path.join(publicDir, "icon-maskable-512.png"));

  console.log("Generating favicon.ico...");
  await sharp(svgBuffer).resize(48, 48).png().toFile(path.join(publicDir, "favicon.ico"));

  console.log("All PWA icons successfully generated in dashboard/public!");
}

run().catch((err) => {
  console.error("Error generating icons:", err);
  process.exit(1);
});
