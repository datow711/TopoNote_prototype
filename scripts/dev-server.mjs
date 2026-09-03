import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(fileURLToPath(new URL('..', import.meta.url)));
const port = Number(process.env.PORT || 5173);

const contentTypes = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=utf-8'
};

function resolveRequestPath(urlPath) {
  const pathname = new URL(urlPath, 'http://localhost').pathname;
  const requestedPath = decodeURIComponent(pathname).replace(/^\/+/, '') || 'index.html';
  const safeSegments = requestedPath
    .split('/')
    .filter(segment => segment && segment !== '.' && segment !== '..');
  let filePath = resolve(root, ...safeSegments);
  if (filePath === root) {
    filePath = resolve(root, 'index.html');
  } else if (filePath.startsWith(root + sep) && existsSync(filePath) && statSync(filePath).isDirectory()) {
    filePath = resolve(filePath, 'index.html');
  }
  return filePath.startsWith(root + sep) ? filePath : null;
}

const server = createServer((req, res) => {
  const filePath = resolveRequestPath(req.url || '/');
  if (!filePath || !existsSync(filePath) || statSync(filePath).isDirectory()) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not found');
    return;
  }

  res.writeHead(200, {
    'Content-Type': contentTypes[extname(filePath).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-store'
  });
  createReadStream(filePath).pipe(res);
});

server.listen(port, () => {
  console.log(`TopoNote local server: http://localhost:${port}`);
});
