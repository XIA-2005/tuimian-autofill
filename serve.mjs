// 本地静态文件服务器：供 Edge headless 端到端测试使用。
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';

const root = process.cwd();
const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
};

const server = createServer(async (req, res) => {
  try {
    const pathname = decodeURIComponent(new URL(req.url || '/', 'http://x').pathname);
    let fp = normalize(join(root, pathname === '/' ? 'test/fixture-form.html' : pathname));
    if (!fp.startsWith(root)) throw new Error('forbidden');
    const data = await readFile(fp);
    res.writeHead(200, { 'Content-Type': types[extname(fp)] || 'application/octet-stream' });
    res.end(data);
  } catch {
    res.writeHead(404);
    res.end('not found');
  }
});

server.listen(8099, () => console.log('serving on http://127.0.0.1:8099'));
