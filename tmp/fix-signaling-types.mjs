import fs from 'node:fs';
const path = 'dashboard/hooks/use-communication-signaling.ts';
const source = fs.readFileSync(path, 'utf8');
const start = source.indexOf('export interface CommunicationSignalingHook');
const end = source.indexOf('// HOOK', start);
const updated = source.slice(0, start) + source.slice(start, end).replace(/\) => void;/g, ') => () => void;') + source.slice(end);
fs.writeFileSync(path, updated);
