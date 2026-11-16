#!/usr/bin/env node
// Build, then serve _site/ locally:  npm run dev   (PORT=8080 by default)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
execFileSync(process.execPath, [path.join(root, 'scripts/build.mjs')], { stdio: 'inherit' });

const site = path.join(root, '_site');
const port = Number(process.env.PORT || 8080);
const types = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.mjs': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.gif': 'image/gif', '.webp': 'image/webp', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.woff2': 'font/woff2',
};
http
  .createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    let f = path.join(site, p);
    if (!f.startsWith(site)) return res.writeHead(403).end();
    if (fs.existsSync(f) && fs.statSync(f).isDirectory()) {
      if (!p.endsWith('/')) return res.writeHead(301, { Location: p + '/' }).end();
      f = path.join(f, 'index.html');
    }
    if (!fs.existsSync(f)) return res.writeHead(404).end('not found');
    res.writeHead(200, { 'Content-Type': types[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    fs.createReadStream(f).pipe(res);
  })
  .listen(port, () => console.log(`\n→ http://localhost:${port}/`));
