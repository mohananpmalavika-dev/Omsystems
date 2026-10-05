const { createDecipheriv } = require('crypto');
const key = Buffer.from(process.env.STREAM_VAULT_KEY, 'base64');
const ref = 'edge://9f108498-4dd5-4a21-b810-eec9e538953c/DVR-ch8';
const encryptedUri = 'o+qOuTy1aT/hWud4rR3tJCaE4KBJpc9M+mrGlvRPg5Iavt+XWAEeVPaZjoG321mq8udh0+Ml44qnwPGaqST32NNCWrjfKBbd5e0K9SUv/PxiuBp/nlc6UroKZE0ID6dE458CyQ==';
try {
  const payload = Buffer.from(encryptedUri, 'base64');
  const decipher = createDecipheriv('aes-256-gcm', key, payload.subarray(0, 12));
  decipher.setAAD(Buffer.from(ref));
  decipher.setAuthTag(payload.subarray(12, 28));
  const decrypted = Buffer.concat([decipher.update(payload.subarray(28)), decipher.final()]).toString('utf8');
  console.log('Decrypted URI:', decrypted);
} catch (e) {
  console.error('Error:', e);
}
