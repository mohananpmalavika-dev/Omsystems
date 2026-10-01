sudo docker exec sentinel-gcp-control-plane node -e '
fetch("http://127.0.0.1:8080/v1/cameras/5b36b23f-9c41-4103-9ad5-94f73c78ebcd/live-sessions", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({ profile: "sub" })
}).then(r => r.text()).then(console.log);
'
