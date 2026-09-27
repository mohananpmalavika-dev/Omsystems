import { chromium } from '../node_modules/playwright/index.mjs';
import assert from 'node:assert/strict';
const browser=await chromium.launch({headless:true});
try {
 const context=await browser.newContext({viewport:{width:1440,height:1000},serviceWorkers:'block'});
 await context.addCookies([{name:'sentinel_access',value:'qa',domain:'localhost',path:'/'}]);
 await context.addInitScript(()=>{localStorage.setItem('accessToken','qa');sessionStorage.setItem('user',JSON.stringify({id:'qa',role:'superadmin'}));});
 await context.route(/\/(api|v1)\//,route=>route.fulfill({json:route.request().url().includes('/auth/me')?{id:'qa',role:'superadmin'}:{data:[]}}));
 const page=await context.newPage();await page.goto('http://localhost:3000/maintenance/assets/new',{waitUntil:'domcontentloaded',timeout:120000});await page.locator('.record-composer[aria-busy="false"]').waitFor();
 for(const theme of ['light','dark'])for(const width of [1440,390]){
  await page.evaluate(t=>{document.documentElement.dataset.theme=t;document.documentElement.classList.toggle('dark',t==='dark');},theme);await page.setViewportSize({width,height:1000});await page.waitForTimeout(600);await page.evaluate(()=>window.scrollTo(0,0));
  const colours=await page.locator('[data-chapter="0"] label').first().evaluate(label=>{const text=label.querySelector('span'),input=label.querySelector('input');let parent=text,bg='';while(parent){bg=getComputedStyle(parent).backgroundColor;if(bg!=='rgba(0, 0, 0, 0)'&&bg!=='transparent')break;parent=parent.parentElement;}return {label:getComputedStyle(text).color,background:bg,input:getComputedStyle(input).color,inputBackground:getComputedStyle(input).backgroundColor};});
  const luminance=colour=>colour.match(/[\d.]+/g).slice(0,3).map(Number).map(c=>{const s=c/255;return s<=.04045?s/12.92:((s+.055)/1.055)**2.4;}).reduce((sum,c,i)=>sum+c*[.2126,.7152,.0722][i],0);
  const contrast=(a,b)=>{const values=[luminance(a),luminance(b)].sort((x,y)=>y-x);return (values[0]+.05)/(values[1]+.05);};
  const labelRatio=contrast(colours.label,colours.background),inputRatio=contrast(colours.input,colours.inputBackground);assert.ok(labelRatio>=4.5,`${theme} label contrast ${labelRatio} ${JSON.stringify(colours)}`);assert.ok(inputRatio>=4.5,`${theme} input contrast ${inputRatio}`);
  await page.screenshot({path:`tmp/experience-qa/remaining-composer-contrast-${theme}-${width}.png`});console.log(theme,width,'label contrast',labelRatio.toFixed(1),'input contrast',inputRatio.toFixed(1));
 }
}finally{await browser.close();}
