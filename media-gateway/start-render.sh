#!/bin/sh
set -eu

/usr/local/bin/mediamtx /app/media-gateway/mediamtx.render.yml &
exec node /app/media-gateway/dist/index.js
