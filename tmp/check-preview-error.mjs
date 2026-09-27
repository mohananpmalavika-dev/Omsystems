const response = await fetch('http://localhost:3000/control-room');
const body = await response.text();
console.log('Preview HTTP', response.status);
const match = body.match(/<script id="__NEXT_DATA__"[^>]*>(.*?)<\/script>/s);
if (match) {
  const data = JSON.parse(match[1]);
  console.log(JSON.stringify(data.err ?? data.page, null, 2));
} else console.log(body.slice(0, 1800));
