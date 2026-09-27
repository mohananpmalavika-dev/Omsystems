import fs from 'node:fs';
const file='tmp/live-operations-stage-qa.mjs';
const source=fs.readFileSync(file,'utf8');
fs.writeFileSync(file,source.replace('document.activeElement?.blur();window.scrollTo(0,0);','document.activeElement?.blur();window.scrollTo(0,0);for(const el of document.querySelectorAll("*")){if(el.scrollHeight>el.clientHeight && /auto|scroll/.test(getComputedStyle(el).overflowY))el.scrollTop=0;}'));
