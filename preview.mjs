import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';

createServer(async (request, response) => {
  if (request.method !== 'GET' || request.url !== '/') {
    response.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(new URL('数谱-简谱工作台-1.0.html', import.meta.url));
    response.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }).end(body);
  } catch {
    response.writeHead(500).end();
  }
}).listen(4783, '127.0.0.1', () => {
  process.stdout.write('http://127.0.0.1:4783\n');
});
