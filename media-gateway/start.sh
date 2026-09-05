#!/bin/sh
set -eu

/usr/local/bin/mediamtx /app/media-gateway/mediamtx.yml &
exec node /app/media-gateway/dist/index.js
