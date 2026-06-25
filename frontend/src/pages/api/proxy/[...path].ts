import type { NextApiRequest, NextApiResponse } from 'next';

export const config = {
  api: { bodyParser: false, externalResolver: true },
};

const HOP_BY_HOP = new Set([
  'connection', 'keep-alive', 'transfer-encoding', 'upgrade',
  'proxy-authorization', 'proxy-authenticate', 'te', 'trailer',
]);

function readBody(req: NextApiRequest): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk: Buffer | string) =>
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)),
    );
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const backendBase = process.env.BACKEND_URL || 'http://localhost:4000';
  const segments = (req.query.path as string[]) ?? [];
  const qs = req.url?.includes('?') ? req.url.slice(req.url.indexOf('?')) : '';
  const targetUrl = `${backendBase}/api/v1/${segments.join('/')}${qs}`;

  const fwdHeaders: Record<string, string> = {};
  for (const [k, v] of Object.entries(req.headers)) {
    if (!HOP_BY_HOP.has(k.toLowerCase()) && typeof v === 'string') {
      fwdHeaders[k] = v;
    }
  }
  try { fwdHeaders['host'] = new URL(backendBase).host; } catch { /* invalid URL handled below */ }

  try {
    const hasBody = req.method !== 'GET' && req.method !== 'HEAD';
    const bodyBuf = hasBody ? await readBody(req) : undefined;

    const backendRes = await fetch(targetUrl, {
      method: req.method,
      headers: fwdHeaders,
      body: bodyBuf,
    });

    for (const [k, v] of backendRes.headers.entries()) {
      if (!HOP_BY_HOP.has(k.toLowerCase())) {
        try { res.setHeader(k, v); } catch { /* skip any header that causes issues */ }
      }
    }

    const responseBody = await backendRes.arrayBuffer();
    res.status(backendRes.status).send(Buffer.from(responseBody));
  } catch (err: unknown) {
    if (!res.headersSent) {
      const message = err instanceof Error ? err.message : String(err);
      res.status(503).json({ message: 'Backend unreachable', detail: message });
    }
  }
}
