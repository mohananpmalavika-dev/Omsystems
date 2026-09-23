#!/usr/bin/env bash
set -euo pipefail

if [ "$(id -u)" -ne 0 ]; then
  echo "Run this script with sudo on the GCP VM." >&2
  exit 1
fi
if ! command -v wg >/dev/null 2>&1; then
  echo "Install wireguard-tools before running this script." >&2
  exit 1
fi

key_dir=/etc/wireguard
private_key="$key_dir/sentinel-media.key"
public_key="$key_dir/sentinel-media.pub"
install -d -m 0700 "$key_dir"
umask 077

if [ -e "$private_key" ] && [ ! -s "$private_key" ]; then
  echo "An empty private key exists at $private_key; inspect it manually." >&2
  exit 1
fi
if [ ! -e "$private_key" ]; then
  wg genkey > "$private_key"
fi
wg pubkey < "$private_key" > "$public_key"
chmod 0600 "$private_key"
chmod 0644 "$public_key"

echo "GCP WireGuard public key (safe to share with the Edge Agent):"
sed -n '1p' "$public_key"
echo "Private key remains in $private_key; no tunnel has been activated."
