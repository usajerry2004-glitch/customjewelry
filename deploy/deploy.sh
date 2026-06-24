#!/bin/bash
set -e
cd /opt/jewelflow

echo "=== JewelFlow Deploy ==="

# Check .env.production exists
if [ ! -f backend/.env.production ]; then
  echo "ERROR: backend/.env.production not found. Copy it from your local machine."
  exit 1
fi

# Build and start
docker compose -f docker-compose.prod.yml build --no-cache
docker compose -f docker-compose.prod.yml up -d

# Wait for DB
echo "Waiting for database..."
sleep 10
docker compose -f docker-compose.prod.yml exec -T db pg_isready -U jewelflow

echo "=== Status ==="
docker compose -f docker-compose.prod.yml ps
echo ""
echo "Frontend: http://dashboard.kirajewels.one"
echo "Backend:  http://api.kirajewels.one"
echo "Swagger:  http://api.kirajewels.one/api/docs"
