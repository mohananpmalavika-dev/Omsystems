import fs from 'node:fs';
const source=fs.readFileSync('tmp/live-operations-stage-qa.mjs','utf8');
const start=source.indexOf(" await open();assert.equal");
const final=source.indexOf('}finally{');
const checks=`
 await open();
 await page.screenshot({path:'tmp/experience-qa/live-stage-final-watch.png',fullPage:true});
 await page.locator('.los-event-track button').filter({hasText:'After-hours entrance activity'}).click();
 await page.getByLabel('Recorded segment').waitFor();
 assert.equal(await page.locator('.los-replay .controls-overlay').evaluate(el=>getComputedStyle(el).position),'static');
 await page.screenshot({path:'tmp/experience-qa/live-stage-final-investigate.png',fullPage:true});
 await responsive('final-replay-layout');
 assert.deepEqual(errors,[]);
 console.log('Final replay layout passed at all five widths in both themes.');
`;
fs.writeFileSync('tmp/live-stage-final-layout-run.mjs',source.slice(0,start)+checks+source.slice(final));
