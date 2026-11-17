#!/usr/bin/env node
// Shot choice vs defence choice: win% of the attacker-styled bot (both 3★, otherwise balanced).
import { simulate } from '../src/sim.js';
import { blankAI, compile } from '../src/teams.js';
const N = Number(process.argv[2] || 60);
const shots = ['straight', 'pull', 'bank', 'power', 'trick'], defs = ['react', 'balanced', 'read'];
console.log('shot \\ their defence  ' + defs.map((d) => d.padEnd(9)).join(''));
for (const s of shots) {
  let row = s.padEnd(22);
  for (const d of defs) {
    const a = blankAI(); a.style.shot = s; a.style.defence = 'balanced';
    const b = blankAI(); b.style.shot = 'straight'; b.style.defence = d;
    const A = compile(a), B = compile(b); let w = 0;
    for (let i = 1; i <= N; i++) { const sw = i & 1; const m = simulate(sw ? B : A, sw ? A : B, i * 104729); if (m.winner === (sw ? 1 : 0)) w++; }
    row += (Math.round((100 * w) / N) + '%').padEnd(9);
  }
  console.log(row);
}
