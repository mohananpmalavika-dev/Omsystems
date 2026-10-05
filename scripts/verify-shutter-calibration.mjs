import assert from "node:assert/strict";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";
import { chromium } from "@playwright/test";
import sharp from "sharp";

// Local-only browser smoke test. Generated reference images never leave this process.
const repository = resolve(fileURLToPath(new URL("..", import.meta.url)));
const result = await build({
  stdin: {
    contents: `import {useState} from "react";
      import {createRoot} from "react-dom/client";
      import {ShutterCalibration} from "./components/shutter-calibration";
      function App(){const [config,setConfig]=useState();return <>
        <ShutterCalibration onChange={setConfig}/><button disabled={!config}>Save rule</button>
        <output>{config?JSON.stringify(config):""}</output></>;}
      createRoot(document.getElementById("root")).render(<App/>);`,
    resolveDir: resolve(repository, "dashboard"), loader: "tsx", sourcefile: "shutter-smoke.tsx",
  },
  bundle: true, write: false, platform: "browser", jsx: "automatic",
});
async function image(state) {
  const pixels=Buffer.alloc(64*64*3);
  for(let y=0;y<64;y++)for(let x=0;x<64;x++) {
    const value=40+Math.round(120*((state==="open"?y:x)%16)/15);
    pixels.fill(value,(y*64+x)*3,(y*64+x)*3+3);
  }
  return {name:`${state}.png`,mimeType:"image/png",buffer:await sharp(pixels,{raw:{width:64,height:64,channels:3}}).png().toBuffer()};
}
const browser=await chromium.launch({headless:true});
try {
  const page=await browser.newPage({viewport:{width:1000,height:900}});
  const errors=[];page.on("pageerror",error=>errors.push(error.message));
  await page.setContent(`<style>body{font:16px sans-serif}.analytics-form-grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;max-width:600px}.wide{grid-column:1/-1}output{display:none}</style><div id="root"></div>`);
  await page.addScriptTag({content:result.outputFiles[0].text});
  const save=page.getByRole("button",{name:"Save rule"});
  await save.waitFor();assert.equal(await save.isDisabled(),true);
  const closed=await image("closed"),open=await image("open");
  await page.locator('input[type="file"]').nth(0).setInputFiles(closed);
  await page.locator('input[type="file"]').nth(1).setInputFiles(open);
  await page.getByRole("img").waitFor();
  assert.equal(await save.isDisabled(),true,"Both snapshots alone must not bypass area selection");
  async function selectRegion() {
    const box=await page.getByRole("img").boundingBox();assert.ok(box);
    await page.mouse.move(box.x+box.width*.1,box.y+box.height*.1);await page.mouse.down();
    await page.mouse.move(box.x+box.width*.9,box.y+box.height*.9);await page.mouse.up();
  }
  await selectRegion();await page.waitForFunction(()=>!document.querySelector("button").disabled);
  const config=JSON.parse(await page.locator("output").textContent());
  assert.equal(config.openReference.length,1024);assert.equal(config.closedReference.length,1024);
  assert.ok(Math.abs(config.region.width-.8)<.02);
  await page.locator('input[type="file"]').nth(1).setInputFiles(closed);
  await page.getByRole("alert").waitFor();assert.equal(await save.isDisabled(),true);
  assert.match(await page.getByRole("alert").textContent(),/too similar/);
  await page.locator('input[type="file"]').nth(1).setInputFiles(open);
  await page.waitForFunction(()=>!document.querySelector("button").disabled);
  await page.locator('input[type="file"]').nth(0).setInputFiles(closed);
  await page.waitForFunction(()=>document.querySelector("button").disabled);
  await selectRegion();await page.waitForFunction(()=>!document.querySelector("button").disabled);
  assert.deepEqual(errors,[]);
  console.log("PASS: shutter snapshot selection, explicit area selection, calibration, invalid references and recalibration");
} finally {await browser.close();}
