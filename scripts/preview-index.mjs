#!/usr/bin/env node
// Writes <dir>/index.html listing every branch preview folder in <dir>.
import fs from 'node:fs';
import path from 'node:path';

const dir = process.argv[2];
fs.mkdirSync(dir, { recursive: true });
const items = fs
  .readdirSync(dir, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => {
    const stamp = path.join(dir, e.name, '.deployed');
    const when = fs.existsSync(stamp) ? fs.readFileSync(stamp, 'utf8').trim() : '';
    return { name: e.name, when };
  })
  .sort((a, b) => b.when.localeCompare(a.when));
const esc = (s) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
fs.writeFileSync(
  path.join(dir, 'index.html'),
  `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>previews</title>
<style>body{margin:0;padding:24px 16px;background:#111118;color:#f1f0f7;font:16px/1.4 system-ui,sans-serif}
main{max-width:640px;margin:0 auto}a{color:inherit}h1{letter-spacing:-1px}
li{background:#1c1c28;border-radius:14px;padding:12px 14px;margin:8px 0;list-style:none}
ul{padding:0}small{color:#8a89a0;display:block}</style>
<main><p><a href="../">← main site</a></p><h1>Branch previews</h1>
<ul>${items.map((i) => `<li><a href="./${esc(i.name)}/">${esc(i.name)}</a><small>${esc(i.when)}</small></li>`).join('') || '<p>none</p>'}</ul></main>`,
);
