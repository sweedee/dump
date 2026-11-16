#!/usr/bin/env node
// Verifies every level is beatable and reports how many tray arrangements work.
//   node apps/patchwork/tools/check-levels.mjs        # all levels
//   node apps/patchwork/tools/check-levels.mjs 3      # just level 3 (1-based), lists solutions
// Levels with a `solution` field get that layout checked explicitly; full
// enumeration is skipped when there are too many layouts.
import { CHUNKS, LEVELS } from '../src/levels.js';
import { buildWorld, slotKeys } from '../src/world.js';
import { solve, arrangements } from '../src/solver.js';

const MAX_LAYOUTS = 3000;
const only = process.argv[2] ? Number(process.argv[2]) - 1 : null;
let bad = 0;

function countLayouts(level, slots) {
  let n = 0;
  for (const _ of arrangements(level, slots)) if (++n > MAX_LAYOUTS) return n;
  return n;
}

LEVELS.forEach((level, i) => {
  if (only != null && i !== only) return;
  const slots = slotKeys(level);
  const t0 = Date.now();
  const label = `${String(i + 1).padStart(2)}. ${level.name.padEnd(16)}`;
  let line = '';
  if (level.solution) {
    const pl = {};
    const used = new Set();
    for (const s of slots) {
      const k = level.pieces.findIndex((p, j) => p === level.solution[s] && !used.has(j));
      if (k < 0) throw new Error(`${level.name}: solution piece for ${s} not in tray`);
      used.add(k);
      pl[s] = k;
    }
    const ok = solve(buildWorld(level, pl, CHUNKS)).solvable;
    if (!ok) bad++;
    line += ok ? 'intended ✅ ' : 'intended ❌ ';
  }
  if (countLayouts(level, slots) > MAX_LAYOUTS) {
    console.log(`${label} ${line}(>${MAX_LAYOUTS} layouts, enumeration skipped)`);
    return;
  }
  let total = 0, ok = 0;
  const sols = [];
  for (const pl of arrangements(level, slots)) {
    total++;
    if (solve(buildWorld(level, pl, CHUNKS)).solvable) {
      ok++;
      sols.push(slots.map((s) => `${s}=${level.pieces[pl[s]]}`).join(' '));
    }
  }
  if (ok === 0) bad++;
  const flag = ok === 0 ? '❌ UNSOLVABLE' : ok === total && total > 1 ? '⚠️  every layout works' : '✅';
  console.log(`${label} ${line}${ok}/${total} layouts solvable ${flag} (${Date.now() - t0}ms)`);
  if (only != null) sols.forEach((s) => console.log('     ', s));
});
process.exit(bad ? 1 : 0);
