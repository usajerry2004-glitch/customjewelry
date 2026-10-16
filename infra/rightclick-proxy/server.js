// Minimal relay proxy for RightClick API calls — runs on the one DigitalOcean
// droplet whose static IP RightClick's firewall allows. The JewelFlow backend
// (on App Platform, a different/dynamic outbound IP) sends requests here
// instead of calling RightClick directly; this process makes the actual
// outbound call to RightClick, so RightClick sees the droplet's IP.
//
// No npm dependencies — only Node's built-in http/https and global fetch
// (Node 18+), so there's nothing to `npm install` on the droplet.
//
// Usage: GET /relay?url=<url-encoded full RightClick API URL>
// Header: x-proxy-secret: <PROXY_SECRET>
//
// Config via environment variables:
//   PORT               — default 8787
//   PROXY_SECRET       — required; must match RIGHTCLICK_PROXY_SECRET in the backend's env
//   ALLOWED_HOST       — default "state.rightclick.software"; the only host this will relay to

const http = require('http');

const PORT = parseInt(process.env.PORT || '8787', 10);
const PROXY_SECRET = process.env.PROXY_SECRET || '';
const ALLOWED_HOST = process.env.ALLOWED_HOST || 'state.rightclick.software';
const UPSTREAM_TIMEOUT_MS = 20_000;

if (!PROXY_SECRET) {
  console.error('PROXY_SECRET is not set — refusing to start (every request would be unauthenticated).');
  process.exit(1);
}

const server = http.createServer(async (req, res) => {
  const send = (status, body) => {
    res.writeHead(status, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify(body));
  };

  try {
    if (req.method !== 'GET') return send(405, { error: 'Only GET is supported' });

    const reqUrl = new URL(req.url, `http://${req.headers.host}`);
    if (reqUrl.pathname !== '/relay') return send(404, { error: 'Not found' });

    // Timing-unsafe but fine here — not a password check against a stored
    // hash, just a shared bearer secret between two processes we control.
    if (req.headers['x-proxy-secret'] !== PROXY_SECRET) {
      console.warn(`Rejected relay request from ${req.socket.remoteAddress} — bad or missing x-proxy-secret`);
      return send(401, { error: 'Unauthorized' });
    }

    const target = reqUrl.searchParams.get('url');
    if (!target) return send(400, { error: 'Missing url query param' });

    let targetUrl;
    try {
      targetUrl = new URL(target);
    } catch {
      return send(400, { error: 'url query param is not a valid URL' });
    }

    // Never become an open relay — only ever forward to RightClick itself,
    // regardless of what a caller (or a compromised caller) asks for.
    if (targetUrl.hostname !== ALLOWED_HOST) {
      console.warn(`Rejected relay request for disallowed host "${targetUrl.hostname}"`);
      return send(403, { error: `Host "${targetUrl.hostname}" is not allowed — only ${ALLOWED_HOST}` });
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), UPSTREAM_TIMEOUT_MS);
    try {
      const upstream = await fetch(targetUrl, {
        signal: controller.signal,
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      });
      const text = await upstream.text();
      res.writeHead(upstream.status, { 'Content-Type': upstream.headers.get('content-type') || 'application/json' });
      res.end(text);
    } finally {
      clearTimeout(timeout);
    }
  } catch (err) {
    console.error('Relay error:', err?.message || err);
    send(502, { error: 'Relay failed', detail: err?.message || String(err) });
  }
});

server.listen(PORT, () => {
  console.log(`RightClick relay proxy listening on :${PORT}, forwarding only to ${ALLOWED_HOST}`);
});
