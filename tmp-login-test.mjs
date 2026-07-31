import { buildApp } from './src/app.ts';
import { MemoryStore } from './src/store.ts';

async function main() {
  const app = await buildApp({ store: new MemoryStore(), authMode: 'development' });
  try {
    const res = await app.inject({
      method: 'POST',
      url: '/v1/auth/login',
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ username: 'test', password: 'test' }),
    });
    console.log('status', res.statusCode);
    console.log('headers', res.headers);
    console.log('body', res.body);
  } catch (error) {
    console.error('inject failed', error);
  } finally {
    await app.close();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
