import fs from 'fs';

const text = fs.readFileSync('C:/Users/Dhanya/.gemini/antigravity-ide/brain/174ed5d2-9963-4e83-bcde-ea0dd0145dee/.system_generated/tasks/task-113.log', 'utf8');
const idx = text.indexOf('Request error');
if (idx !== -1) {
  const lineEnd = text.indexOf('\n', idx);
  const line = text.slice(idx, lineEnd !== -1 ? lineEnd : undefined);
  // Find where base64 ends or error details appear
  const parts = line.split('"imageBase64"');
  if (parts.length > 1) {
    const afterB64 = parts[1].slice(parts[1].indexOf('"}') - 50);
    console.log('After imageBase64:', afterB64.slice(0, 1000));
  } else {
    console.log('Line snippet:', line.slice(0, 500));
  }
} else {
  console.log('Not found');
}
