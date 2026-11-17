#!/usr/bin/env node
// Round-robin of presets + ladder rivals. Prints win-rate matrix and match stats.
//   node tools/balance.mjs [matchesPerPair=20]
import { simulate, HZ } from '../src/sim.js';
import { PRESETS, RIVALS, cost } from '../src/teams.js';

const N = Number(process.argv[2] || 20);
const who = process.argv[3] || 'all';
const teams = who === 'presets' ? PRESETS : who === 'rivals' ? RIVALS : [...RIVALS, ...PRESETS];
const t0 = Date.now();
const wins = teams.map(() => teams.map(() => 0));
let goals = 0, secs = 0, matches = 0, draws = 0;
const agg = teams.map(() => ({ shots: 0, onT: 0, goals: 0, passes: 0, pd: 0, fum: 0, poss: 0, type: {} }));
for (let i = 0; i < teams.length; i++) for (let j = i + 1; j < teams.length; j++) {
  for (let k = 0; k < N; k++) {
    const swap = k & 1;
    const A = swap ? j : i, B = swap ? i : j;
    const m = simulate(teams[A], teams[B], 1000 * i + 37 * j + k);
    matches++; goals += m.score[0] + m.score[1]; secs += m.tick / HZ;
    if (m.winner < 0) draws++; else wins[m.winner ? B : A][m.winner ? A : B]++;
    [A, B].forEach((t, s) => {
      const st = m.stats[s], g = agg[t];
      g.shots += st.shots; g.onT += st.onTarget; g.goals += st.goals; g.passes += st.passes; g.pd += st.passesDone; g.fum += st.fumbles; g.poss += st.poss;
      for (const [ty, [a, b, c]] of Object.entries(st.byType)) { g.type[ty] ??= [0, 0, 0]; g.type[ty][0] += a; g.type[ty][1] += b; g.type[ty][2] += c; }
    });
  }
}
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(pad('', 16) + 'cost  win%  ' + teams.map((t) => pad(t.name.slice(0, 5), 6)).join(''));
teams.forEach((t, i) => {
  const tot = wins[i].reduce((a, b) => a + b, 0), games = N * (teams.length - 1);
  console.log(pad(t.name, 16) + pad(cost(t), 6) + pad(Math.round((tot / games) * 100), 6) + wins[i].map((w, j) => pad(i === j ? '-' : Math.round((w / N) * 100), 6)).join(''));
});
console.log(`\n${matches} matches in ${((Date.now() - t0) / 1000).toFixed(1)}s · avg ${(secs / matches).toFixed(0)} s/match · ${(goals / matches).toFixed(1)} goals · ${draws} draws`);
console.log('\nper team: shots/match  on-target%  conv%  pass-compl%  fumbles/match  shot types [shots:onTarget%:goal%]');
teams.forEach((t, i) => {
  const g = agg[i], M = N * (teams.length - 1);
  console.log(pad(t.name, 16) + pad((g.shots / M).toFixed(1), 7) + pad(Math.round((g.onT / g.shots) * 100), 6) + pad(Math.round((g.goals / g.shots) * 100), 6) +
    pad(g.passes ? Math.round((g.pd / g.passes) * 100) : '-', 6) + pad((g.fum / M).toFixed(1), 6) +
    Object.entries(g.type).filter(([, v]) => v[0]).map(([k, v]) => `${k}:${v[0]}:${Math.round(100 * v[2] / v[0])}%:${Math.round(100 * v[1] / v[0])}%`).join(' '));
});
