import fs from 'fs';

const text = fs.readFileSync('C:/Users/Dhanya/.gemini/antigravity-ide/brain/174ed5d2-9963-4e83-bcde-ea0dd0145dee/.system_generated/tasks/task-113.log', 'utf8');
const lines = text.split('\n');
for (const line of lines) {
  if (line.includes('Request error')) {
    try {
      const idx = line.indexOf('"stack":"');
      if (idx !== -1) {
        console.log('STACK:', line.slice(idx, idx + 1000).replace(/\\n/g, '\n').replace(/\\"/g, '"'));
      }
      const errIdx = line.indexOf('"error":');
      if (errIdx !== -1) {
        console.log('ERROR:', line.slice(errIdx, errIdx + 500));
      }
      const msgIdx = line.indexOf('"msg":"');
      if (msgIdx !== -1) {
        console.log('MSG:', line.slice(msgIdx, msgIdx + 200));
      }
    } catch (e) {
      console.error(e);
    }
  }
}
