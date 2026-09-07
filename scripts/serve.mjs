/**
 * 로컬 확인용 정적 파일 서버
 *
 *   npm run serve   →  http://localhost:4173
 *
 * ES 모듈을 쓰기 때문에 index.html을 파일로 직접 열면 동작하지 않습니다.
 * 반드시 이 서버(또는 다른 웹 서버)를 통해 확인하세요.
 */

import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const port = Number(process.env.PORT) || 4173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
};

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === '/') pathname = '/index.html';

  // 상위 디렉터리로 빠져나가는 경로 차단
  const filePath = join(root, normalize(pathname).replace(/^(\.\.[/\\])+/, ''));
  if (!filePath.startsWith(root)) {
    res.writeHead(403).end('Forbidden');
    return;
  }

  try {
    const body = await readFile(filePath);
    res.writeHead(200, {
      'Content-Type': MIME[extname(filePath).toLowerCase()] || 'application/octet-stream',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('찾을 수 없습니다: ' + pathname);
  }
});

server.listen(port, () => {
  console.log(`상속세 계산기 → http://localhost:${port}`);
});
