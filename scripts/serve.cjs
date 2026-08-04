const fs = require('fs');
const http = require('http');
const path = require('path');

const HOST = '127.0.0.1';
const PORT = 2333;
const ROOT = path.resolve(__dirname, '..', 'app_unpacked', 'src');
const CONTENT_SECURITY_POLICY = fs.readFileSync(
  path.resolve(__dirname, '..', 'config', 'csp-dev.txt'),
  'utf8',
).trim();
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
  if (!['GET', 'HEAD'].includes(request.method || 'GET')) {
    response.writeHead(405);
    response.end('Method Not Allowed');
    return;
  }
  const relativePath = requestPath === '/' ? 'index.html' : requestPath.replace(/^\/+/, '');
  if (relativePath.split('/').some(part => !part || part === '.' || part === '..')) {
    response.writeHead(403);
    response.end('Forbidden');
    return;
  }
  fs.realpath(ROOT, (rootError, rootPath) => {
    if (rootError) {
      response.writeHead(500);
      response.end('Static root unavailable');
      return;
    }
    const filePath = path.resolve(rootPath, relativePath);
    if (!filePath.startsWith(rootPath + path.sep)) {
      response.writeHead(403);
      response.end('Forbidden');
      return;
    }
    fs.stat(filePath, (statError, stat) => {
      const target = !statError && stat.isDirectory() ? path.join(filePath, 'index.html') : filePath;
      fs.realpath(target, (targetError, canonicalTarget) => {
        if (targetError) {
          response.writeHead(targetError.code === 'ENOENT' ? 404 : 500);
          response.end(targetError.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
          return;
        }
        if (!canonicalTarget.startsWith(rootPath + path.sep)) {
          response.writeHead(403);
          response.end('Forbidden');
          return;
        }
        fs.readFile(canonicalTarget, (error, data) => {
          if (error) {
            response.writeHead(error.code === 'ENOENT' ? 404 : 500);
            response.end(error.code === 'ENOENT' ? 'Not Found' : 'Internal Server Error');
            return;
          }
          response.writeHead(200, {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Content-Type': CONTENT_TYPES[path.extname(canonicalTarget).toLowerCase()] || 'application/octet-stream',
            'Content-Security-Policy': CONTENT_SECURITY_POLICY,
            'X-Content-Type-Options': 'nosniff',
          });
          response.end(request.method === 'HEAD' ? undefined : data);
        });
      });
    });
  });
});

server.once('error', error => {
  process.stderr.write(`Unable to serve ${ROOT} at http://${HOST}:${PORT}: ${error.message}\n`);
  process.exitCode = 1;
});

server.listen(PORT, HOST, () => {
  process.stdout.write(`Serving ${ROOT} at http://${HOST}:${PORT}\n`);
});
