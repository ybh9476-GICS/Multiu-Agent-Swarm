import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

const port = Number(process.env.PORT || 18745);
const resources = new Map([
  ['/', ['index.html', 'text/html; charset=utf-8']],
  ['/index.html', ['index.html', 'text/html; charset=utf-8']],
  ['/styles.css', ['styles.css', 'text/css; charset=utf-8']],
  ['/graph.js', ['graph.js', 'text/javascript; charset=utf-8']],
  ['/assets/section-2.png', ['assets/section-2.png', 'image/png']],
]);

for (const agent of ['quality', 'supervisor', 'production', 'equipment', 'safety', 'energy', 'logistics']) {
  resources.set(`/assets/${agent}.svg`, [`assets/${agent}.svg`, 'image/svg+xml; charset=utf-8']);
  resources.set(`/assets/${agent}-inactive.svg`, [`assets/${agent}-inactive.svg`, 'image/svg+xml; charset=utf-8']);
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    response.writeHead(405, { Allow: 'GET, HEAD' });
    response.end('Method not allowed');
    return;
  }

  const pathname = new URL(request.url, 'http://localhost').pathname;
  const resource = resources.get(pathname);
  if (!resource) {
    response.writeHead(404);
    response.end('Not found');
    return;
  }

  try {
    const content = await readFile(new URL(resource[0], import.meta.url));
    response.writeHead(200, {
      'Content-Type': resource[1],
      'Content-Length': content.byteLength,
      'Cache-Control': 'no-cache',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(request.method === 'HEAD' ? undefined : content);
  } catch {
    response.writeHead(500);
    response.end('Unable to load resource');
  }
});

server.on('error', (error) => {
  console.error(`미리보기 서버 시작 실패: ${error.message}`);
  process.exitCode = 1;
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Local: http://127.0.0.1:${port}`);
});
