#!/usr/bin/env node
// Scaffold a new prototype:  npm run new -- my-idea "My Idea" 🦆
import fs from 'node:fs';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const [rawSlug, title, emoji = '✨'] = process.argv.slice(2);
if (!rawSlug) {
  console.error('usage: npm run new -- <slug> ["Title"] [emoji]');
  process.exit(1);
}
const slug = rawSlug.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const dst = path.join(root, 'apps', slug);
if (fs.existsSync(dst)) {
  console.error(`apps/${slug} already exists`);
  process.exit(1);
}
const vars = {
  slug,
  title: title || slug.replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()),
  emoji,
  date: new Date().toISOString().slice(0, 10),
};
const tpl = path.join(root, 'apps', '_template');
fs.mkdirSync(dst, { recursive: true });
for (const f of fs.readdirSync(tpl)) {
  const text = fs.readFileSync(path.join(tpl, f), 'utf8').replace(/\{\{(\w+)\}\}/g, (_, k) => vars[k] ?? '');
  fs.writeFileSync(path.join(dst, f), text);
}
console.log(`Created apps/${slug}/ — open apps/${slug}/index.html and go.`);
