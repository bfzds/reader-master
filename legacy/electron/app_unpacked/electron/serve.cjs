const fs = require('fs');
const http = require('http');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 2333;
const ROOT = path.resolve(__dirname, '..', 'src');
const CONTENT_TYPES = {
  '.css': 'text/css; charset=UTF-8',
  '.html': 'text/html; charset=UTF-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=UTF-8',
  '.json': 'application/json; charset=UTF-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webmanifest': 'application/manifest+json; charset=UTF-8',
  '.woff': 'font/woff',
};

const server = http.createServer((request, response) => {
  let requestPath;
  try {
    requestPath = decodeURIComponent((request.url || '/').split('?')[0]);
  } catch (_error) {
    response.writeHead(400);
    response.end('Bad Request');
    return;
  }
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  const filePath = path.resolve(ROOT, relativePath);
  if (filePath !== ROOT && !filePath.startsWith(ROOT + path.sep)) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.stat(filePath, (statError, stat) => {
    const target = !statError && stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
    fs.readFile(target, (error, data) => {
      if (error) {
        response.writeHead(error.code === 'ENOENT' ? 404 : 500);
        response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
        return;
      }
      response.writeHead(200, {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Content-Type': CONTENT_TYPES[path.extname(target).toLowerCase()] || 'application/octet-stream',
      });
      response.end(data);
    });
  });
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Serving ${ROOT} at http://${HOST}:${PORT}\n`);
});
