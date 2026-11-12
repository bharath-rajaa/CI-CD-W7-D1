// Zero-dependency static server + tiny login API for the sample app.
// Fails fast with a SETUP_ERROR if its credentials are not configured.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', 'sample-app');
const PORT = Number(process.env.PORT ?? 4173);
const APP_USERNAME = process.env.APP_USERNAME;
const APP_PASSWORD = process.env.APP_PASSWORD;
const VARIANT = process.env.APP_VARIANT ?? 'stable';

const missing = ['APP_USERNAME', 'APP_PASSWORD'].filter((k) => !process.env[k]?.trim());
if (missing.length > 0) {
  console.error(`SETUP_ERROR: missing environment variable(s): ${missing.join(', ')}`);
  process.exit(1);
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
};

function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'Content-Type': type });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://localhost:${PORT}`);

  if (req.method === 'POST' && url.pathname === '/api/login') {
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = JSON.parse(raw || '{}'); } catch { /* treat as empty */ }
    const ok = body.username === APP_USERNAME && body.password === APP_PASSWORD;
    return ok
      ? send(res, 200, JSON.stringify({ user: body.username }), 'application/json')
      : send(res, 401, JSON.stringify({ error: 'invalid' }), 'application/json');
  }

  if (url.pathname === '/api/health') return send(res, 200, 'ok');

  const rel = url.pathname === '/' ? 'login.html' : url.pathname.slice(1);
  const file = path.normalize(path.join(root, rel));
  if (!file.startsWith(root)) return send(res, 403, 'forbidden');

  try {
    let data = await readFile(file);
    const ext = path.extname(file);
    if (ext === '.html') {
      const html = data.toString('utf8').replace(
        '<!--APP_VARIANT-->',
        `<meta name="app-variant" content="${VARIANT}">`,
      );
      data = Buffer.from(html);
    }
    send(res, 200, data, TYPES[ext] ?? 'application/octet-stream');
  } catch {
    send(res, 404, 'not found');
  }
});

server.listen(PORT, () => console.log(`sample app listening on http://localhost:${PORT} (variant: ${VARIANT})`));
