const base = process.argv[2] || "http://127.0.0.1:3000";
const cameraId = process.argv[3] || "0eeceeb6-b24b-429a-b1c8-3081ca44b48a";
const response = await fetch(`${base}/api/live`, {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ cameraId, profile: "sub" }),
});
console.log(response.status, await response.text());
