# RightClick relay proxy

RightClick's firewall only allows requests from one specific IP — the
DigitalOcean droplet (`ubuntu-s-1vcpu-1gb-nyc1`, currently `147.182.215.142`).
The JewelFlow backend runs on App Platform, which doesn't use that IP, so it
can't call RightClick directly in production. This tiny proxy runs on that
droplet instead: the backend sends it a request, the proxy makes the actual
call to RightClick (so RightClick sees the droplet's IP), and relays the
response back.

No dependencies — just `server.js`, using Node's built-ins only.

## Current live deployment

Port 8787 (this guide's example) was already taken by the website on this
droplet, so the actual running instance uses **port 8799** instead:

```
RIGHTCLICK_PROXY_URL=http://147.182.215.142:8799
```

The secret is in the backend's `.env` / DigitalOcean App Platform config as
`RIGHTCLICK_PROXY_SECRET` — not duplicated here. Verified working 2026-10-16
(RightClick returned `Success: true` through the proxy).

## This droplet already runs the jewelry website — read this first

This proxy is a second, completely independent process. It does not touch
the website's files, Nginx/Apache config, systemd units, or process manager —
it just needs its own port. Still, on a box already serving production
traffic:

- **Check the port is actually free before starting anything**:
  `sudo ss -tlnp | grep 8787` (or `sudo lsof -i :8787`). If something's
  already listening there, pick a different `PORT` in both `.env` below and
  the `RIGHTCLICK_PROXY_URL` you give the backend.
- **Check Node before installing a new one**: run `node -v` first. If the
  website already runs on Node 18+, skip the NodeSource install step entirely
  and just use the existing `node` binary — installing a second Node via
  `apt` can shadow a version the website relies on (e.g. one managed by
  `nvm`), which is the one thing here that actually could break the site.
  Only install a new Node if none exists or it's below 18.
- The systemd unit, working directory (`/opt/rightclick-proxy`), and ufw rule
  below are all new and separate from whatever the website already uses —
  nothing existing is modified.

## Deploy on the droplet

SSH into the droplet, then:

```bash
# 1. Confirm the port is free and check for an existing Node before installing
sudo ss -tlnp | grep 8787        # expect no output — port is free
node -v                          # if this prints v18 or higher, skip the next two lines
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# 2. Copy server.js onto the droplet, into its own directory
sudo mkdir -p /opt/rightclick-proxy
sudo nano /opt/rightclick-proxy/server.js
# paste the contents of this folder's server.js, save and exit

# 3. Create the env file with a secret only this droplet and the backend know
sudo nano /opt/rightclick-proxy/.env
```

In `.env`, set:

```
PORT=8787
PROXY_SECRET=<generate a long random string, e.g. `openssl rand -hex 32`>
ALLOWED_HOST=state.rightclick.software
```

```bash
# 4. Install the systemd service so it stays up and survives reboots — this
#    is a new, separate unit; it does not replace or restart anything the
#    website already has running
sudo nano /etc/systemd/system/jewelflow-rightclick-proxy.service
# paste the contents of jewelflow-rightclick-proxy.service from this folder

sudo systemctl daemon-reload
sudo systemctl enable --now jewelflow-rightclick-proxy
sudo systemctl status jewelflow-rightclick-proxy   # should show "active (running)"

# 5. Open the port in the droplet's firewall (ufw) — this only adds a new
#    allow rule, it doesn't touch existing rules for the website (80/443/22
#    etc. stay exactly as they are). Restrict to App Platform's outbound IP
#    range if you know it; otherwise this port only accepts requests
#    carrying the correct PROXY_SECRET anyway
sudo ufw allow 8787/tcp
sudo ufw status                  # confirm existing rules (80, 443, 22, ...) are still there
```

## Point the backend at it

In the backend's environment (both local `.env` and DigitalOcean App
Platform's app-level env vars), set:

```
RIGHTCLICK_PROXY_URL=http://147.182.215.142:8787
RIGHTCLICK_PROXY_SECRET=<same value as PROXY_SECRET above>
```

Leave both unset to call RightClick directly (useful for local dev against
`test.rightclick.software`, which isn't IP-restricted).

## Verify

```bash
curl -s -H "x-proxy-secret: <your secret>" \
  "http://147.182.215.142:8787/relay?url=https%3A%2F%2Fstate.rightclick.software%2F%3Fserial%3D5d9eb8b%26apikey%3D...%26apipassword%3D..."
```

Should return RightClick's JSON response (`{"Success":true,"SessionId":"..."}`
on a valid login). A wrong secret returns 401; a URL pointing anywhere other
than `state.rightclick.software` returns 403.
