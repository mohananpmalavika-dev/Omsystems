import { readFileSync, writeFileSync } from 'fs';

const original = JSON.parse(readFileSync('C:/Program Files/Sentinel Grid/Edge Agent/data/stream-secrets.json', 'utf8'));

const updated = { ...original };

for (const [key, value] of Object.entries(original)) {
  if (value.includes('subtype=0')) {
    const subKey = `${key}#sub`;
    const subValue = value.replace('subtype=0', 'subtype=1');
    updated[subKey] = subValue;
  }
}

writeFileSync('C:/Omsystems/Omsystems/edge-runtime/data/stream-secrets.json', JSON.stringify(updated, null, 2), 'utf8');
console.log('Secrets prepared with', Object.keys(updated).length, 'entries');
