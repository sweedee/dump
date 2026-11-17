#!/usr/bin/env node
// How much does each star / option matter? Each variant vs the all-3 balanced bot.
//   node tools/sweep.mjs [N=80]
import { simulate } from '../src/sim.js';
import { blankAI, compile, STAR_KEYS, CHOICES } from '../src/teams.js';
const N = Number(process.argv[2] || 80);
const base = blankAI('base');
const clone = (o) => JSON.parse(JSON.stringify(o));
function wr(a) {
  const A = compile(a), B = compile(base); let w = 0;
  for (let s = 1; s <= N; s++) { const sw = s & 1; const m = simulate(sw ? B : A, sw ? A : B, s * 7919); if (m.winner === (sw ? 1 : 0)) w++; }
  return Math.round((100 * w) / N);
}
console.log('stars (vs all-3):');
for (const k of STAR_KEYS) {
  const row = [1, 2, 4, 5].map((v) => { const a = clone(base); a.stars[k] = v; return `${v}★ ${String(wr(a)).padStart(3)}%`; });
  console.log('  ' + k.padEnd(9) + row.join('   '));
}
console.log('options (all 3★, everything else balanced):');
for (const [k, , opts] of CHOICES) {
  console.log('  ' + k.padEnd(9) + opts.map(([v]) => { const a = clone(base); a.style[k] = v; return `${v} ${wr(a)}%`; }).join('   '));
}
