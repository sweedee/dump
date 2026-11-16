#!/usr/bin/env node
// Assembles every prototype in apps/ into one static site in _site/.
//
//   apps/<slug>/                -> _site/<slug>/
//   apps/<slug>/meta.json       -> gallery card (title, emoji, description, date, tags, hidden)
//   apps/<slug>/package.json    -> if it has a "build" script, we run it and publish
//                                  its output dir (meta.outDir, default "dist") instead
//   apps/_anything              -> ignored (templates, scratch)
//
// Env: PREVIEW_BRANCH=<name> adds a "preview" banner to the gallery.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const appsDir = path.join(root, 'apps');
const out = path.join(root, '_site');
const preview = process.env.PREVIEW_BRANCH || '';

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out, { recursive: true });

const SKIP = new Set(['node_modules']);
function copyDir(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const e of fs.readdirSync(src, { withFileTypes: true })) {
    if (e.name.startsWith('.') || SKIP.has(e.name)) continue;
    const s = path.join(src, e.name), d = path.join(dst, e.name);
    if (e.isDirectory()) copyDir(s, d);
    else fs.copyFileSync(s, d);
  }
}
const readJSON = (f, d = null) => {
  try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; }
};

const apps = [];
for (const slug of fs.readdirSync(appsDir).sort()) {
  const dir = path.join(appsDir, slug);
  if (slug.startsWith('_') || slug.startsWith('.') || !fs.statSync(dir).isDirectory()) continue;
  const meta = { title: slug, emoji: '✨', description: '', date: '', tags: [], ...readJSON(path.join(dir, 'meta.json'), {}) };
  const pkg = readJSON(path.join(dir, 'package.json'));
  let srcDir = dir;
  if (pkg?.scripts?.build) {
    console.log(`▸ ${slug}: npm run build`);
    const install = fs.existsSync(path.join(dir, 'package-lock.json')) ? 'npm ci' : 'npm install';
    execSync(`${install} --no-audit --no-fund && npm run build`, { cwd: dir, stdio: 'inherit' });
    srcDir = path.join(dir, meta.outDir || 'dist');
  }
  if (!fs.existsSync(path.join(srcDir, 'index.html'))) {
    console.warn(`⚠ ${slug}: no index.html, skipping`);
    continue;
  }
  copyDir(srcDir, path.join(out, slug));
  apps.push({ slug, ...meta });
  console.log(`✓ ${slug}`);
}

apps.sort((a, b) => String(b.date).localeCompare(String(a.date)) || a.title.localeCompare(b.title));
fs.writeFileSync(path.join(out, 'apps.json'), JSON.stringify(apps, null, 2));
fs.writeFileSync(path.join(out, '.nojekyll'), '');
fs.writeFileSync(path.join(out, 'index.html'), gallery(apps));
console.log(`\nBuilt ${apps.length} app(s) into _site/${preview ? ` (preview: ${preview})` : ''}`);

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
}

function gallery(apps) {
  const cards = apps
    .filter((a) => !a.hidden)
    .map(
      (a) => `
    <a class="card" href="./${esc(a.slug)}/">
      <span class="emoji">${esc(a.emoji)}</span>
      <span class="body">
        <span class="t">${esc(a.title)}</span>
        ${a.description ? `<span class="d">${esc(a.description)}</span>` : ''}
        <span class="m">${esc(a.date)}${(a.tags || []).map((t) => ` <i>#${esc(t)}</i>`).join('')}</span>
      </span>
    </a>`,
    )
    .join('');
  const banner = preview
    ? `<div class="banner">🧪 Preview of <b>${esc(preview)}</b> · <a href="../../">main site</a> · <a href="../">all previews</a></div>`
    : '';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="#111118">
<title>dump${preview ? ' · ' + esc(preview) : ''}</title>
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🗑️</text></svg>">
<style>
  :root { --bg:#111118; --card:#1c1c28; --ink:#f1f0f7; --dim:#9897ad; --accent:#ff8c42; color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin:0; background:var(--bg); color:var(--ink); font:16px/1.4 system-ui,-apple-system,sans-serif;
         padding: env(safe-area-inset-top) 16px calc(32px + env(safe-area-inset-bottom)); }
  main { max-width: 640px; margin: 0 auto; }
  h1 { font-size: 32px; margin: 28px 0 2px; letter-spacing: -1px; }
  .sub { color: var(--dim); margin: 0 0 20px; }
  .banner { background:#2a2140; border-radius:12px; padding:10px 14px; margin-top:16px; font-size:14px; }
  .banner a { color: var(--accent); }
  .grid { display: grid; gap: 10px; }
  .card { display:flex; gap:14px; align-items:center; background:var(--card); border-radius:16px; padding:14px 16px;
          color:inherit; text-decoration:none; }
  .card:active { transform: scale(.98); }
  .emoji { font-size: 34px; width: 44px; text-align: center; flex: none; }
  .body { display:flex; flex-direction:column; gap:2px; min-width:0; }
  .t { font-weight: 700; font-size: 18px; }
  .d { color: var(--dim); font-size: 14px; }
  .m { color: #6f6e86; font-size: 12px; }
  .m i { font-style: normal; }
  .empty { color: var(--dim); }
  footer { margin-top: 28px; color:#5d5c72; font-size: 13px; }
  footer a { color: inherit; }
</style>
</head>
<body>
<main>
  ${banner}
  <h1>dump</h1>
  <p class="sub">dumb ideas, vibecoded in bed.</p>
  <div class="grid">${cards || '<p class="empty">Nothing here yet.</p>'}</div>
  <footer>${apps.length} prototype${apps.length === 1 ? '' : 's'}${preview ? '' : ' · <a href="./preview/">branch previews</a>'}</footer>
</main>
</body>
</html>
`;
}
