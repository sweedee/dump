// Brute-force reachability using the real game physics.
// From every floor segment we can reach, try a fixed set of coarse input
// "macros" (walk off, hop, full jump, delayed steer...) and see where we land.
// The solver uses slightly nerfed tuning so anything it finds is comfortably
// doable by a human with the real tuning.
import { step, makePlayer, BASE, PW, PH, isSolid } from './physics.js';

export const SOLVER_TUNING = { ...BASE, jumpVel: BASE.jumpVel * 0.97, runSpeed: BASE.runSpeed * 0.95 };

const INF = 1e9;
const MACROS = (() => {
  const m = [];
  for (const dir of [-1, 1]) {
    for (const K of [4, 10, 20, INF]) m.push({ dir, jumpAt: -1, J: 0, D: 0, K });
    for (const J of [4, 8, INF])
      for (const D of [0, 10, 18])
        for (const K of [6, 14, INF]) m.push({ dir, jumpAt: 0, J, D, K });
    for (const at of [4, 10]) for (const J of [4, 8, INF]) for (const K of [14, INF]) m.push({ dir, jumpAt: at, J, D: 0, K });
  }
  return m;
})();

function inputAt(mac, f) {
  const dirStart = mac.jumpAt > 0 ? 0 : mac.D;
  const dir = f >= dirStart && f < dirStart + mac.K ? mac.dir : 0;
  const jump = mac.jumpAt >= 0 && f >= mac.jumpAt && f < mac.jumpAt + mac.J;
  return { dir, jump };
}

function standable(world, x, y) {
  if (x < 0 || x >= world.w || y < 0 || y + 1 >= world.h) return false;
  const c = world.get(x, y), b = world.get(x, y + 1);
  return !isSolid(c) && c !== '^' && b === '#';
}

// Returns { solvable, segments, path } — path is a list of segments visited (debug).
export function solve(world, T = SOLVER_TUNING) {
  if (!world.spawn) return { solvable: false };
  // segment id per standable cell
  const seg = new Int32Array(world.w * world.h).fill(-1);
  const segs = [];
  for (let y = 0; y < world.h; y++)
    for (let x = 0; x < world.w; x++) {
      if (!standable(world, x, y)) continue;
      if (x > 0 && seg[y * world.w + x - 1] >= 0) {
        const id = seg[y * world.w + x - 1];
        seg[y * world.w + x] = id;
        segs[id].x1 = x;
      } else {
        seg[y * world.w + x] = segs.length;
        segs.push({ y, x0: x, x1: x });
      }
    }

  const segOf = (p) => {
    const row = Math.floor(p.y + PH + 0.01) - 1;
    for (const px of [p.x + PW / 2, p.x + 0.05, p.x + PW - 0.05]) {
      const cx = Math.floor(px);
      if (cx >= 0 && cx < world.w && row >= 0 && row < world.h && seg[row * world.w + cx] >= 0)
        return seg[row * world.w + cx];
    }
    return -1;
  };

  const start = makePlayer(world.spawn.x, world.spawn.y);
  const startSeg = segOf(start);
  if (startSeg < 0) return { solvable: false };
  const seen = new Set([startSeg]);
  const queue = [startSeg];
  while (queue.length) {
    const s = segs[queue.shift()];
    const xs = [s.x0, s.x1 + 1 - PW];
    for (let x = s.x0; x <= s.x1; x++) xs.push(x + 0.2);
    for (const sx of xs) {
      for (const mac of MACROS) {
        const p = makePlayer(sx, s.y + 1 - PH - 1e-4);
        let left = false;
        const limit = mac.K === INF && mac.J === 0 ? 120 : 300;
        for (let f = 0; f < limit; f++) {
          const ev = step(p, inputAt(mac, f), world, T);
          if (ev.win) return { solvable: true, segments: segs.length };
          if (ev.dead) break;
          if (!p.grounded) left = true;
          else if (left) {
            const id = segOf(p);
            if (id >= 0 && !seen.has(id)) {
              seen.add(id);
              queue.push(id);
            }
            break;
          } else if (f > mac.D + Math.min(mac.K, 60) + 15 && mac.jumpAt < 0) break;
        }
      }
    }
  }
  return { solvable: false, segments: segs.length, reached: seen.size };
}

// Enumerate every distinct way to put the level's pieces into its open slots.
export function* arrangements(level, slots) {
  const n = level.pieces.length;
  const used = new Array(n).fill(false);
  const cur = {};
  const seenKeys = new Set();
  function* rec(i) {
    if (i === slots.length) {
      const key = slots.map((s) => level.pieces[cur[s]]).join('|');
      if (seenKeys.has(key)) return;
      seenKeys.add(key);
      yield { ...cur };
      return;
    }
    for (let k = 0; k < n; k++) {
      if (used[k]) continue;
      used[k] = true;
      cur[slots[i]] = k;
      yield* rec(i + 1);
      used[k] = false;
    }
  }
  yield* rec(0);
}
