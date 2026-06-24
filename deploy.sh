#!/bin/bash
# ─────────────────────────────────────────────────────────────────────────────
# JewelFlow OS — DigitalOcean Deployment Script
# Run on your Droplet as root (or sudo) after cloning the repo.
# ─────────────────────────────────────────────────────────────────────────────
set -e

DOMAIN_PORTAL="dashboard.kirajewels.one"
DOMAIN_API="api.kirajewels.one"
EMAIL="dashboard@kirajewels.one"

echo "==> [1/6] Installing Docker & Docker Compose..."
if ! command -v docker &>/dev/null; then
  apt-get update -qq
  apt-get install -y -qq ca-certificates curl gnupg lsb-release
  curl -fsSL https://download.docker.com/linux/ubuntu/gpg | gpg --dearmor -o /usr/share/keyrings/docker-archive-keyring.gpg
  echo "deb [arch=$(dpkg --print-architecture) signed-by=/usr/share/keyrings/docker-archive-keyring.gpg] \
    https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" \
    > /etc/apt/sources.list.d/docker.list
  apt-get update -qq
  apt-get install -y -qq docker-ce docker-ce-cli containerd.io docker-compose-plugin
fi
echo "    Docker $(docker --version)"

echo ""
echo "==> [2/6] Starting initial HTTP-only nginx (for Let's Encrypt challenge)..."
# Use HTTP-only config first so certbot can reach /.well-known/acme-challenge/
cp nginx/nginx.conf nginx/nginx.active.conf
docker compose -f docker-compose.prod.yml up -d nginx db

echo ""
echo "==> [3/6] Obtaining SSL certificates via Certbot..."
docker compose -f docker-compose.prod.yml run --rm certbot certonly \
  --webroot --webroot-path=/var/www/certbot \
  --email "$EMAIL" --agree-tos --no-eff-email \
  -d "$DOMAIN_PORTAL" -d "$DOMAIN_API"

echo ""
echo "==> [4/6] Switching nginx to HTTPS config..."
cp nginx/nginx.ssl.conf nginx/nginx.conf

echo ""
echo "==> [5/6] Building and starting all services..."
docker compose -f docker-compose.prod.yml up -d --build

echo ""
echo "==> [6/6] Checking service health..."
sleep 10
docker compose -f docker-compose.prod.yml ps

echo ""
echo "✓ Deployment complete!"
echo "  Portal : https://$DOMAIN_PORTAL"
echo "  API    : https://$DOMAIN_API/api/v1"
echo "  Docs   : https://$DOMAIN_API/api/docs"
echo ""
echo "SSL auto-renews via the certbot container (checks every 12h)."
