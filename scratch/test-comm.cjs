const jwt = require('jsonwebtoken');

const secret = '356c732f9f08e79b8e56315a4f65734f469dd2d350e5c072ca6634de0d0e2b57';
const token = jwt.sign(
  {
    sub: '043561dc-a162-48ca-b7e4-290a9c4ad1ff',
    tid: '00000000-0000-4000-8000-000000000001',
    role: 'super_admin'
  },
  secret,
  { expiresIn: '1h' }
);

console.log('Generated token length:', token.length);

async function testEndpoint(path) {
  try {
    const res = await fetch('http://127.0.0.1:8080' + path, {
      headers: {
        'Authorization': `Bearer ${token}`
      }
    });
    console.log(path, 'status:', res.status);
    const body = await res.text();
    console.log(path, 'body:', body.slice(0, 500));
  } catch (err) {
    console.error(path, 'error:', err);
  }
}

async function run() {
  await testEndpoint('/v1/communications/directory/branches');
  await testEndpoint('/v1/communications/directory/employees');
}

run();
