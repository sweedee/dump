#!/usr/bin/env node
// Runs the "test" script of every app that defines one. Used by CI before deploy.
import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
let failed = 0;
for (const slug of fs.readdirSync(path.join(root, 'apps')).sort()) {
  const dir = path.join(root, 'apps', slug);
  const pkgFile = path.join(dir, 'package.json');
  if (slug.startsWith('_') || !fs.existsSync(pkgFile)) continue;
  const pkg = JSON.parse(fs.readFileSync(pkgFile, 'utf8'));
  if (!pkg.scripts?.test) continue;
  console.log(`\n▸ ${slug}: npm test`);
  try {
    execSync('npm test --silent', { cwd: dir, stdio: 'inherit' });
  } catch {
    failed++;
    console.error(`✗ ${slug} failed`);
  }
}
process.exit(failed ? 1 : 0);
