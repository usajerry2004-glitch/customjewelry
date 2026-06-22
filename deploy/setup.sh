#!/bin/bash
set -e
echo "=== JewelFlow — DigitalOcean Server Setup ==="

# 1. System update
apt-get update -y && apt-get upgrade -y

# 2. Install Docker
if ! command -v docker &>/dev/null; then
  apt-get install -y docker.io
  systemctl enable docker
  systemctl start docker
  echo "Docker installed."
else
  echo "Docker already installed."
fi

# 3. Install Docker Compose plugin
if ! docker compose version &>/dev/null; then
  apt-get install -y docker-compose-plugin
  echo "Docker Compose installed."
else
  echo "Docker Compose already installed."
fi

# 4. Install Certbot
if ! command -v certbot &>/dev/null; then
  apt-get install -y certbot python3-certbot-nginx
  echo "Certbot installed."
else
  echo "Certbot already installed."
fi

# 5. Add current user to docker group (no sudo needed for docker commands)
usermod -aG docker ${SUDO_USER:-$USER} || true

# 6. Create app directory
mkdir -p /opt/jewelflow
echo "Server setup complete. Upload your project to /opt/jewelflow and run deploy/deploy.sh"
