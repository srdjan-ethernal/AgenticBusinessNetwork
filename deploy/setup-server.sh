#!/usr/bin/env bash
# One-time setup of a fresh Hetzner Cloud server (Ubuntu 24.04) for Agentic Business Network.
# Run as root:  curl -fsSL https://raw.githubusercontent.com/srdjan-ethernal/AgenticBusinessNetwork/main/deploy/setup-server.sh | bash
# or copy it to the server and run: bash setup-server.sh
set -euo pipefail

REPO="${REPO:-https://github.com/srdjan-ethernal/AgenticBusinessNetwork.git}"
APP_DIR="${APP_DIR:-/opt/agentic}"

echo "==> System updates"
export DEBIAN_FRONTEND=noninteractive
apt-get update -y
apt-get upgrade -y
apt-get install -y ca-certificates curl git ufw unattended-upgrades

echo "==> Docker Engine + Compose plugin (official repository)"
if ! command -v docker >/dev/null 2>&1; then
  install -m 0755 -d /etc/apt/keyrings
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
  chmod a+r /etc/apt/keyrings/docker.asc
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.asc] https://download.docker.com/linux/ubuntu $(. /etc/os-release && echo "$VERSION_CODENAME") stable" > /etc/apt/sources.list.d/docker.list
  apt-get update -y
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi
systemctl enable --now docker

echo "==> Firewall: SSH, HTTP, HTTPS (and HTTP/3)"
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw --force enable

echo "==> Automatic security updates"
dpkg-reconfigure -f noninteractive unattended-upgrades

echo "==> Application code in $APP_DIR"
if [ ! -d "$APP_DIR/.git" ]; then
  git clone "$REPO" "$APP_DIR"
else
  git -C "$APP_DIR" pull --ff-only
fi
if [ ! -f "$APP_DIR/.env" ]; then
  cp "$APP_DIR/.env.example" "$APP_DIR/.env"
  # Generate a random access code for development sign-in
  CODE="$(tr -dc 'a-z0-9' </dev/urandom | head -c 20)"
  sed -i "s/^ACCESS_CODE=.*/ACCESS_CODE=$CODE/" "$APP_DIR/.env"
  echo "    Created $APP_DIR/.env with ACCESS_CODE=$CODE"
fi

echo
echo "Next:"
echo "  1. Set DOMAIN in $APP_DIR/.env and point the domain's A/AAAA record at this server."
echo "  2. cd $APP_DIR && docker compose up -d --build"
echo "  3. Open https://<your domain> and sign in with the access code from .env."
