import type { NextApiRequest, NextApiResponse } from 'next';
import http from 'http';
import https from 'https';

export const config = {
  api: { bodyParser: false, externalResolver: true },
};

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'proxy-authorization', 'proxy-authenticate', 'te', 'trailer',
]);

export default function handler(req: NextApiRequest, res: NextApiResponse) {
  const backendBase = process.env.BACKEND_URL || 'http://localhost:4000';
  const segments = (req.query.path as string[]) ?? [];
  const qs = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetPath = `/api/v1/${segments.join('/')}${qs}`;

  let parsedUrl: URL;
  try { parsedUrl = new URL(backendBase); } catch {
    return res.status(500).json({ message: 'Invalid BACKEND_URL', backendBase });
  }

  const isHttps = parsedUrl.protocol === 'https:';
  const hostname = parsedUrl.hostname;
  const port = parsedUrl.port ? parseInt(parsedUrl.port, 10) : (isHttps ? 443 : 80);

  // Forward headers, dropping hop-by-hop and rewriting host
  const fwdHeaders: http.OutgoingHttpHeaders = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase())) fwdHeaders[k] = v;
  }
  fwdHeaders['host'] = port === 80 || port === 443 ? hostname : `${hostname}:${port}`;

  const options: http.RequestOptions = {
    hostname, port,
    path: targetPath,
    method: req.method,
    headers: fwdHeaders,
  };

  const transport: typeof http | typeof https = isHttps ? https : http;

  const proxyReq = transport.request(options, (proxyRes) => {
    const respHeaders: http.IncomingHttpHeaders = {};
    for (const [k, v] of Object.entries(proxyRes.headers)) {
      if (!HOP_BY_HOP.has(k.toLowerCase()) && v !== undefined) respHeaders[k] = v;
    }
    res.writeHead(proxyRes.statusCode ?? 500, respHeaders);
    proxyRes.pipe(res, { end: true });
  });

  proxyReq.on('error', (err) => {
    console.error('[api/proxy] backend unreachable:', err.message, `→ ${backendBase}${targetPath}`);
    if (!res.headersSent) {
      res.status(503).json({ message: 'Backend unreachable', detail: err.message });
    }
  });

  req.pipe(proxyReq, { end: true });
}
