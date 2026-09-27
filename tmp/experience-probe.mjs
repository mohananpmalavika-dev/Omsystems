import { chromium } from '../node_modules/playwright/index.mjs';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
await page.context().addCookies([{ name: 'sentinel_access', value: 'qa', domain: '127.0.0.1', path: '/' }]);
await page.route(/\/(api|v1)\//, route => route.request().url().includes('/auth/me') ? route.fulfill({ status: 200, json: { id: 'qa', role: 'superadmin' } }) : route.fulfill({ status: 503, json: { message: 'Unavailable' } }));
for (const route of ['/compliance/risks', '/maintenance', '/communications/calls', '/analytics/face']) {
  await page.goto('http://127.0.0.1:3000'+route, { waitUntil:'domcontentloaded', timeout:120000 });
  await page.waitForTimeout(1500);
  console.log(route, await page.evaluate(() => ({ surface:document.querySelector('.route-surface')?.outerHTML.slice(0,250), heading:document.querySelector('.workspace-heading')?.outerHTML.slice(0,200), sheets:[...document.styleSheets].map(s=>s.href), css: [...document.styleSheets].some(s=>{try{return [...s.cssRules].some(r=>r.cssText.includes('experience-surface'))}catch{return false}}), headingStyle:document.querySelector('.workspace-heading') ? { background:getComputedStyle(document.querySelector('.workspace-heading')).background, padding:getComputedStyle(document.querySelector('.workspace-heading')).padding }:null })));
  await page.setViewportSize({width:390,height:844});
  await page.waitForTimeout(700);
  console.log('overflow', await page.evaluate(() => [...document.querySelectorAll('body *')].filter(el=>{const r=el.getBoundingClientRect();return r.right>innerWidth+5 && getComputedStyle(el).position!=='fixed'}).slice(0,12).map(el=>({tag:el.tagName,cls:el.className,right:el.getBoundingClientRect().right,width:getComputedStyle(el).width,margin:getComputedStyle(el).margin}))));
  await page.screenshot({path:'tmp/probe-'+route.replaceAll('/','-')+'.png'});
  await page.setViewportSize({width:1440,height:1000});
}
await browser.close();
