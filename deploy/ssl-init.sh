#!/bin/bash
set -e
# Run this ONCE after deploy.sh, once DNS is pointed to this server.

DOMAIN_FRONTEND="portal.kirajewels.one"
DOMAIN_API="api.kirajewels.one"
EMAIL="dashboard@kirajewels.one"

echo "Getting SSL certificates for $DOMAIN_FRONTEND and $DOMAIN_API..."

certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN_FRONTEND" \
  --email "$EMAIL" --agree-tos --non-interactive

certbot certonly \
  --webroot \
  -w /var/www/certbot \
  -d "$DOMAIN_API" \
  --email "$EMAIL" --agree-tos --non-interactive

echo "Switching nginx to SSL config..."
cp /opt/jewelflow/nginx/nginx.ssl.conf /opt/jewelflow/nginx/nginx.conf
docker compose -f /opt/jewelflow/docker-compose.prod.yml restart nginx

echo "SSL setup complete. Your portal is now live on HTTPS."
echo "Cert auto-renew is handled by certbot's systemd timer."
