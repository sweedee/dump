// Foosbots — deterministic table-soccer simulation + the "coach card" AI that drives it.
// Pure module (no DOM) so the balance tool can run thousands of matches in node.
//
// Coordinates: x runs along the table (0 = team 0's goal, L = team 1's goal), y across it.
// Units are millimetres, a real table is ~1200 × 680.

export const L = 1200, W = 680;
export const BALL_R = 17, MAN_R = 14, HIT_R = BALL_R + MAN_R;
export const GOAL_LO = 240, GOAL_HI = 440;
export const HZ = 240, DT = 1 / HZ;
const REACH_X = 44;       // how far in front/behind a rod a man can touch the ball
const ALIGN = 22;         // |man.y - ball.y| needed to touch it
const WALL_E = 0.8;       // side wall restitution
const MAN_E = 0.5;
const HOLD_LIMIT = 5;
const LEADK = Number(globalThis.process?.env?.LEADK ?? 0.07);     // seconds a rod may keep the ball (shot clock)

export const ROD_DEFS = [
  { role: 'GK', x: 75, n: 1, sp: 0, lo: 170, hi: 510 },
  { role: 'DEF', x: 225, n: 2, sp: 240, lo: 30, hi: W - 30 - 240 },
  { role: 'MID', x: 525, n: 5, sp: 120, lo: 30, hi: W - 30 - 480 },
  { role: 'ATT', x: 825, n: 3, sp: 185, lo: 30, hi: W - 30 - 370 },
];
export const SHOT_TYPES = ['straight', 'pull', 'bank', 'snake'];
const SHOT_SPEED = { straight: 1, pull: 0.9, bank: 1.9, snake: 1.55 };
const SHOT_SIGMA = { straight: 1, pull: 2.4, bank: 0.85, snake: 1.4 };

// ---- stat → number conversions (shared with the UI so the editor can explain them) ----
export const derive = (ai) => {
  const s = ai.stats;
  return {
    delay: Math.max(1, Math.round((0.175 - 0.0095 * s.reflex) * HZ)), // ticks of perception lag
    rodSpeed: 500 + 210 * s.speed,                                    // mm/s
    shotSpeed: 2000 + 450 * s.power,                                  // mm/s
    passSpeed: 2000 + 140 * s.power,
    aimSigma: 0.105 - 0.0085 * s.accuracy,                            // radians
    control: s.control,
    fumble: Math.max(0.004, 0.08 - 0.0065 * s.control),                                // per second of holding
    vision: 0.04 + 0.095 * s.vision,                                  // chance to read the gaps
  };
};

export function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

// y position after travelling dx horizontally with the given slope, bouncing off side walls.
export function pathY(y, slope, dx) {
  let s = slope, rem = dx;
  for (let k = 0; k < 6; k++) {
    if (Math.abs(s) < 1e-9) return y;
    const wall = s > 0 ? W - BALL_R : BALL_R;
    const toWall = (wall - y) / s;
    if (toWall >= rem) return y + s * rem;
    y = wall; rem -= toWall; s = -s * WALL_E;
  }
  return y;
}

const newStats = () => ({
  goals: 0, shots: 0, onTarget: 0, blocked: 0, saves: 0, passes: 0, passesDone: 0,
  poss: 0, fumbles: 0, steals: 0,
  byType: { straight: [0, 0, 0], pull: [0, 0, 0], bank: [0, 0, 0], snake: [0, 0, 0], long: [0, 0, 0] }, // [shots, goals, on target]
  blockedBy: { GK: 0, DEF: 0, MID: 0, ATT: 0 },
});

export class Match {
  constructor(aiA, aiB, seed = 1, opt = {}) {
    this.ais = [aiA, aiB];
    this.d = [derive(aiA), derive(aiB)];
    // reactive defences stay home and keep their balance: faster rods when defending
    this.d.forEach((d, i) => (d.defSpeed = 1 + 0.7 * (1 - this.ais[i].tactics.read)));
    this.rng = mulberry32(seed >>> 0);
    this.goalsToWin = opt.goalsToWin ?? 5;
    this.maxTicks = (opt.maxSeconds ?? 900) * HZ;
    this.rods = [0, 1].map((team) =>
      ROD_DEFS.map((def, idx) => ({
        team, idx, role: def.role, n: def.n, sp: def.sp, lo: def.lo, hi: def.hi,
        x: team ? L - def.x : def.x, dir: team ? -1 : 1,
        off: (def.lo + def.hi) / 2, v: 0, target: (def.lo + def.hi) / 2, speedMul: 1,
        lift: 0, kickT: 0, trapCD: 0,
      })));
    this.ball = { x: L / 2, y: W / 2, vx: 0, vy: 0, owner: null };
    this.team = [0, 1].map(() => ({ poss: null, pending: null, oppShots: [] }));
    this.score = [0, 0];
    this.stats = [newStats(), newStats()];
    this.events = [];
    this.tick = 0;
    this.freeze = 0;
    this.serveTo = -1;
    this.over = false;
    this.winner = -1;
    this.lastKick = null;
    this.slow = 0;
    this.hist = new Float32Array(256 * 2);
    this.sfx = opt.sfx ? [] : null; // sound cues for the UI: { k: kind, v: 0..1, team }
    this.serve(this.rng() < 0.5 ? 0 : 1);
  }

  get time() { return this.tick / HZ; }
  manY(r, i) { return r.off + i * r.sp; }
  snd(k, v = 1, team = -1) { if (this.sfx && this.sfx.length < 32) this.sfx.push({ k, v, team }); }
  log(team, kind, text) { this.events.push({ t: this.time, team, kind, text }); }
  gauss() {
    const u = 1 - this.rng(), v = this.rng();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  }

  serve(team) {
    const r = this.rods[team][2];
    r.off = r.target = 100; r.v = 0; // centre man of the 5-bar on the middle line
    this.beginPossession(team, r, 2, true);
    this.ball.x = r.x + r.dir * 26; this.ball.y = W / 2;
    this.slow = 0;
  }

  // ---------- main loop ----------
  step() {
    if (this.over) return;
    if (this.freeze > 0) {
      if (--this.freeze === 0 && this.serveTo >= 0) { this.serve(this.serveTo); this.serveTo = -1; }
      return;
    }
    const b = this.ball;
    this.tick++;
    const h = (this.tick & 255) * 2;
    this.hist[h] = b.x; this.hist[h + 1] = b.y;
    if (b.owner) this.stats[b.owner.team].poss++;

    this.think(0); this.think(1);
    if (this.freeze) return; // a kick may not freeze, but keep the guard cheap

    // rods
    for (const team of this.rods) for (const r of team) {
      const dd = this.d[r.team];
      const maxV = dd.rodSpeed * r.speedMul * (b.owner && b.owner.team === r.team ? 1 : dd.defSpeed);
      const want = clamp((r.target - r.off) * 30, -maxV, maxV);
      const acc = maxV * 16 * DT;
      r.v += clamp(want - r.v, -acc, acc);
      r.off += r.v * DT;
      if (r.off < r.lo) { r.off = r.lo; r.v = 0; } else if (r.off > r.hi) { r.off = r.hi; r.v = 0; }
      if (r.lift > 0) r.lift -= DT;
      if (r.kickT > 0) r.kickT -= DT;
      if (r.trapCD > 0) r.trapCD -= DT;
      r.speedMul = 1;
    }

    if (b.owner) {
      const r = this.rods[b.owner.team][b.owner.rod];
      b.y = this.manY(r, b.owner.man); b.x = r.x + r.dir * 26; b.vx = 0; b.vy = r.v;
      this.slow = 0;
      return;
    }
    this.moveBall();
    if (this.tick > this.maxTicks && !this.over) this.end(this.score[0] === this.score[1] ? -1 : this.score[0] > this.score[1] ? 0 : 1);
  }

  moveBall() {
    const b = this.ball;
    // rolling friction + table corners are slightly sloped so balls don't die there
    const sp = Math.hypot(b.vx, b.vy);
    if (sp > 0) {
      const ns = Math.max(0, sp - (170 + 0.35 * sp) * DT);
      b.vx *= ns / sp; b.vy *= ns / sp;
    }
    if ((b.x < 160 || b.x > L - 160) && (b.y < 140 || b.y > W - 140)) b.vy += (b.y < W / 2 ? 320 : -320) * DT;
    b.x += b.vx * DT; b.y += b.vy * DT;

    if (b.y < BALL_R) { if (b.vy < -300) this.snd('wall', -b.vy / 5000); b.y = BALL_R; b.vy = Math.abs(b.vy) * WALL_E; }
    else if (b.y > W - BALL_R) { if (b.vy > 300) this.snd('wall', b.vy / 5000); b.y = W - BALL_R; b.vy = -Math.abs(b.vy) * WALL_E; }

    const inMouth = b.y > GOAL_LO && b.y < GOAL_HI;
    if (b.x < BALL_R || b.x > L - BALL_R) {
      if (inMouth) {
        for (const py of [GOAL_LO, GOAL_HI]) for (const px of [0, L]) this.bouncePoint(px, py);
        if (b.x < -BALL_R) return this.goal(1);
        if (b.x > L + BALL_R) return this.goal(0);
      } else if (b.x < BALL_R) { if (b.vx < -300) this.snd('wall', -b.vx / 5000); b.x = BALL_R; b.vx = Math.abs(b.vx) * 0.7; }
      else { if (b.vx > 300) this.snd('wall', b.vx / 5000); b.x = L - BALL_R; b.vx = -Math.abs(b.vx) * 0.7; }
    }

    // men
    for (const team of this.rods) for (const r of team) {
      if (r.lift > 0 || Math.abs(b.x - r.x) > HIT_R) continue;
      for (let i = 0; i < r.n; i++) {
        const my = this.manY(r, i);
        const dx = b.x - r.x, dy = b.y - my;
        const d2 = dx * dx + dy * dy;
        if (d2 >= HIT_R * HIT_R) continue;
        const d = Math.sqrt(d2) || 1, nx = dx / d, ny = dy / d;
        b.x = r.x + nx * HIT_R; b.y = my + ny * HIT_R;
        const rvx = b.vx, rvy = b.vy - r.v, pvx = b.vx, ps = Math.hypot(b.vx, b.vy);
        const vn = rvx * nx + rvy * ny;
        if (vn < 0) { b.vx -= (1 + MAN_E) * vn * nx; b.vy -= (1 + MAN_E) * vn * ny; if (vn < -250) this.snd('block', -vn / 5000, r.team); }
        // a graze that barely changes the ball's course is a deflection, not a block
        if (Math.sign(b.vx) !== Math.sign(pvx) || Math.hypot(b.vx, b.vy) < ps * 0.6) this.touched(r);
        else if (this.lastKick && !this.lastKick.done && this.lastKick.team !== r.team) this.lastKick.deflected = true;
      }
    }

    // dead ball → re-serve
    if (Math.hypot(b.vx, b.vy) < 35) {
      this.slow++;
      const reachable = this.rods.some((t) => t.some((r) => Math.abs(b.x - r.x) < REACH_X));
      if (this.slow > (reachable ? 2.5 : 0.8) * HZ) {
        this.log(-1, 'dead', 'Dead ball — re-serve');
        this.resolveKick('dead');
        this.freeze = Math.round(0.5 * HZ); this.serveTo = b.x < L / 2 ? 0 : 1;
      }
    } else this.slow = 0;
  }

  bouncePoint(px, py) {
    const b = this.ball, dx = b.x - px, dy = b.y - py, d = Math.hypot(dx, dy);
    if (d >= BALL_R || d === 0) return;
    const nx = dx / d, ny = dy / d;
    b.x = px + nx * BALL_R; b.y = py + ny * BALL_R;
    const vn = b.vx * nx + b.vy * ny;
    if (vn < 0) { b.vx -= 1.7 * vn * nx; b.vy -= 1.7 * vn * ny; this.snd('post', -vn / 4000); }
  }

  touched(r) {
    const k = this.lastKick;
    if (!k || k.done || r.team === k.team) return;
    if (k.kind === 'shot') {
      this.stats[k.team].blocked++;
      this.stats[r.team].blockedBy[r.role]++;
      if (r.role === 'GK') this.stats[r.team].saves++;
      this.log(r.team, 'block', `${k.label} blocked by the ${ROLE_NAME[r.role]}`);
    } else {
      this.stats[r.team].steals++;
    }
    k.done = true;
  }

  resolveKick(how) { if (this.lastKick) this.lastKick.done = true; }

  goal(team) {
    const k = this.lastKick;
    this.score[team]++;
    this.stats[team].goals++;
    let label = 'Goal';
    if (k && !k.done && k.team === team && k.kind === 'shot') {
      this.stats[team].byType[k.type][1]++;
      label = k.deflected ? `${k.label}, deflected` : k.label;
    } else if (k && k.team !== team) label = 'Own goal';
    else if (k && k.kind === 'pass' && !k.done) label = 'Overhit pass!';
    else label = 'Scrappy rebound';
    if (k) k.done = true;
    this.log(team, 'goal', `GOAL! ${label}`);
    this.snd('goal', 1, team);
    this.ball.vx = this.ball.vy = 0;
    this.ball.x = team ? -BALL_R * 2 : L + BALL_R * 2;
    if (this.score[team] >= this.goalsToWin) return this.end(team);
    this.freeze = Math.round(1.1 * HZ);
    this.serveTo = 1 - team;
  }

  end(winner) {
    this.over = true; this.winner = winner;
    this.log(winner, 'end', winner < 0 ? 'Full time — draw' : 'Full time');
    this.snd('end', 1, winner);
  }

  // ---------- perception ----------
  perceived(team) {
    // reading defences anticipate, which cuts their effective reaction time
    const d = Math.max(1, Math.round(this.d[team].delay * (1 - 0.35 * this.ais[team].tactics.read)));
    const t = Math.max(0, this.tick - d), t2 = Math.max(0, t - 6);
    const h = (t & 255) * 2, h2 = (t2 & 255) * 2;
    if (this.tick - d < 7) return { x: this.ball.x, y: this.ball.y, vx: this.ball.vx, vy: this.ball.vy };
    const x = this.hist[h], y = this.hist[h + 1];
    return { x, y, vx: (x - this.hist[h2]) / (6 * DT), vy: (y - this.hist[h2 + 1]) / (6 * DT) };
  }

  // offset that puts the most convenient man on y
  align(r, y) {
    let best = r.off, cost = Infinity;
    for (let i = 0; i < r.n; i++) {
      const o = y - i * r.sp, c = clamp(o, r.lo, r.hi);
      const k = Math.abs(c - o) * 10 + Math.abs(c - r.off);
      if (k < cost) { cost = k; best = c; }
    }
    return best;
  }

  // how much room the opponent leaves on the line from (bx,by) with a given slope up to x = tx
  clearance(team, bx, by, slope, tx) {
    let min = 999;
    for (const r of this.rods[1 - team]) {
      if ((r.x - bx) * (tx - r.x) <= 0) continue;
      const y = pathY(by, slope, Math.abs(r.x - bx));
      for (let i = 0; i < r.n; i++) min = Math.min(min, Math.abs(y - this.manY(r, i)));
    }
    return min - HIT_R;
  }

  // ---------- the AI ----------
  think(T) {
    const b = this.ball, pb = this.perceived(T);
    for (const r of this.rods[T]) {
      if (b.owner && b.owner.team === T && b.owner.rod === r.idx) { this.possess(T, r); continue; }
      if (!b.owner) this.tryTouch(T, r, pb);
      if (b.owner && b.owner.team === T && b.owner.rod === r.idx) continue;
      r.target = this.position(T, r, pb);
    }
  }

  position(T, r, pb) {
    const b = this.ball, tac = this.ais[T].tactics, tm = this.team[T];
    const ownGoal = T ? L : 0;
    if (!b.owner && tm.pending && tm.pending.rod === r.idx && this.tick < tm.pending.until) {
      return this.align(r, tm.pending.y);
    }
    if (b.owner && b.owner.team !== T) {
      const between = (r.x - pb.x) * (ownGoal - r.x) > 0;
      const lead = clamp(pb.vy * 0.11 * tac.read, -80, 80); // readers commit to where the shooter is heading
      let sy = pb.y + lead;
      // reading defences bite on fakes: they jump to where the dummy is heading and get caught there
      const P = this.team[1 - T].poss;
      if (tac.read > 0.6 && P && (P.phase === 'fake' || P.phase === 'settle') && P.fakeY != null) sy = P.fakeY + P.fakeDir * 90 * tac.read;
      if (between && (r.role === 'GK' || r.role === 'DEF')) {
        const shots = tm.oppShots, n = shots.length;
        let mean = W / 2;
        if (n) { mean = 0; const k = Math.min(n, 6); for (let i = n - k; i < n; i++) mean += shots[i]; mean /= k; }
        const conf = Math.min(1, n / 3);
        const aim = W / 2 + tac.read * conf * (mean - W / 2);
        const side = sy < W / 2 ? -1 : 1;
        const half = 34 * tac.split;
        const target = aim + (r.role === 'GK' ? side : -side) * half;
        const y = sy + (target - sy) * (r.x - pb.x) / (ownGoal - pb.x);
        return this.align(r, y);
      }
      return this.align(r, sy);
    }
    if (!b.owner && Math.abs(pb.vx) > 80 && Math.sign(pb.vx) === Math.sign(r.x - pb.x)) {
      return this.align(r, this.predictY(pb, r.x));
    }
    return this.align(r, pb.y);
  }

  predictY(p, x) {
    if (Math.abs(p.vx) < 1 || Math.sign(p.vx) !== Math.sign(x - p.x)) return p.y;
    return pathY(p.y, p.vy / Math.abs(p.vx), Math.abs(x - p.x));
  }

  tryTouch(T, r, pb) {
    const b = this.ball;
    if (r.trapCD > 0 || r.lift > 0) return;
    if (Math.abs(b.x - r.x) > REACH_X) return;
    const tm = this.team[T];
    const expecting = tm.pending && tm.pending.rod === r.idx && this.tick < tm.pending.until;
    // the bot only reacts to what it has perceived (extrapolated from its delayed view)
    if (!expecting && Math.abs(pb.x + pb.vx * this.d[T].delay * DT - r.x) > REACH_X + 12) return;
    let man = -1, best = ALIGN;
    for (let i = 0; i < r.n; i++) {
      const dy = Math.abs(this.manY(r, i) - b.y);
      if (dy < best) { best = dy; man = i; }
    }
    if (man < 0) return;
    r.trapCD = 0.3;
    const tac = this.ais[T].tactics, d = this.d[T];
    const speed = Math.hypot(b.vx, b.vy);
    const inFront = r.dir * (b.x - r.x) > -6;
    if (inFront && !expecting && speed > 120 && this.rng() < tac.firstTouch) {
      // one-touch strike
      const action = this.chooseAction(T, r);
      r.target = r.off;
      this.kick(T, r, action, { oneTouch: true, speed });
      return;
    }
    let p = expecting ? 0.55 + 0.03 * d.control - (speed - 2000) / 6000 : 0.42 + 0.035 * d.control - (speed - 1200) / 3000;
    if (speed < 250) p = Math.max(p, 0.92);
    if (this.rng() < clamp(p, 0.03, 0.97)) {
      const k = this.lastKick;
      if (k && !k.done) {
        if (k.team === T && k.kind === 'pass') { this.stats[T].passesDone++; k.done = true; }
        else if (k.team !== T) this.touched(r);
      }
      this.beginPossession(T, r, man, false);
    }
  }

  chooseAction(T, r) {
    const tac = this.ais[T].tactics;
    const R = this.rng;
    let a;
    if (r.role === 'ATT') a = { kind: 'shot', type: pickMix(tac.mix, R()) };
    else if (r.role === 'MID') a = R() < tac.midPlay ? { kind: 'shot', type: pickMix(tac.mix, R()) } : { kind: 'pass' };
    else a = R() < tac.backPlay ? { kind: 'shot', type: 'straight' } : { kind: 'pass' };
    if (a.kind === 'shot') {
      if (a.type === 'bank') a.wall = this.ball.y < W / 2 ? -1 : 1;
      if (R() < tac.discipline) {
        const s = { L: 262, C: W / 2, R: W - 262 }[tac.spot] ?? W / 2;
        a.aim = T ? W - s : s; a.sig = true;
      } else if (a.type === 'bank') a.aim = R() < 0.5 ? 262 + R() * 30 : 418 - R() * 30; // banks go for the posts
      else a.aim = 258 + R() * 164;
    }
    return a;
  }

  beginPossession(T, r, man, serve) {
    const b = this.ball, tac = this.ais[T].tactics, R = this.rng;
    if (!serve && b.owner == null) {
      // keep track of steals for the stats panel
    }
    if (!serve) this.snd('trap', Math.min(1, Math.hypot(b.vx, b.vy) / 3000), T); else this.snd('whistle');
    b.owner = { team: T, rod: r.idx, man }; b.vx = b.vy = 0;
    this.team[0].pending = this.team[1].pending = null;
    const action = this.chooseAction(T, r);
    const base = r.role === 'ATT' ? 1 : 0.55;
    let setup = (0.12 + tac.patience * 1.7 * base) * (0.6 + 0.8 * R());
    if (action.type === 'snake') setup += 0.35;
    this.team[T].poss = {
      phase: 'setup', start: this.tick, end: this.tick + setup * HZ, wp: this.manY(r, man), nextWp: this.tick,
      action, fakes: R() < tac.feints ? (R() < tac.feints * 0.6 ? 2 : 1) : 0, check: this.tick + 10, fakeDir: 0,
    };
  }

  possess(T, r) {
    const b = this.ball, P = this.team[T].poss, d = this.d[T], tac = this.ais[T].tactics, R = this.rng;
    const man = b.owner.man, my = this.manY(r, man);
    const lo = r.lo + man * r.sp, hi = r.hi + man * r.sp;
    // fumbles: worse when the rod is moving fast
    const fast = Math.min(1, Math.abs(r.v) / 1200);
    if (R() < d.fumble * DT * (1 + 1.6 * fast)) {
      b.owner = null;
      b.vx = r.dir * (R() * 900 - 400); b.vy = r.v * 0.5 + (R() * 600 - 300);
      r.trapCD = 0.35;
      this.stats[T].fumbles++;
      this.log(T, 'fumble', `${ROLE_NAME[r.role]} fumbles the ball`);
      this.snd('fumble', 0.4, T);
      return;
    }
    if ((this.tick - P.start) / HZ > HOLD_LIMIT && P.phase !== 'pull') {
      this.log(T, 'clock', 'Shot clock! Forced to play');
      return this.kick(T, r, P.action, { forced: true });
    }
    const dribble = 0.45 + 0.04 * d.control + 0.25 * tac.feints;
    switch (P.phase) {
      case 'setup': {
        r.speedMul = dribble;
        if (this.tick >= P.nextWp) {
          P.wp = clamp(my + (R() * 2 - 1) * 150, lo, hi);
          // bankers drift toward their wall to flatten the angle
          if (P.action.type === 'bank') P.wp = clamp(P.wp + (P.action.wall < 0 ? -1 : 1) * 120, lo, hi);
          P.nextWp = this.tick + HZ * (0.2 + 0.45 * R()) * (1 - 0.45 * tac.feints);
        }
        r.target = P.wp - man * r.sp;
        let go = this.tick >= P.end;
        if (!go && this.tick >= P.check) {
          P.check = this.tick + 12;
          // opportunist: an open lane was spotted early
          if (R() < d.vision * 0.3 && this.laneOpen(T, r, P.action)) go = true;
        }
        if (go) P.phase = 'pre';
        break;
      }
      case 'pre':
        if (P.fakes > 0) {
          P.fakes--;
          P.fakeDir = my < W / 2 ? (R() < 0.7 ? 1 : -1) : (R() < 0.7 ? -1 : 1);
          if (my + P.fakeDir * 90 > hi || my + P.fakeDir * 90 < lo) P.fakeDir = -P.fakeDir;
          P.fakeY = clamp(my + P.fakeDir * (70 + 50 * R()), lo, hi);
          P.fakeFrom = my;
          P.until = this.tick + 0.18 * HZ;
          P.phase = 'fake';
        } else if (P.action.kind === 'shot' && P.action.type === 'pull') {
          let dir = P.fakeDir ? -P.fakeDir : (R() < 0.5 ? -1 : 1);
          if (my + dir * 100 > hi || my + dir * 100 < lo) dir = -dir;
          P.kickY = clamp(my + dir * (60 + 60 * R()), lo, hi);
          P.until = this.tick + 0.45 * HZ;
          P.phase = 'pull';
        } else return this.kick(T, r, P.action, {});
        break;
      case 'fake':
        r.speedMul = 1;
        r.target = P.fakeY - man * r.sp;
        if (this.tick >= P.until || Math.abs(my - P.fakeY) < 6) { P.phase = 'settle'; P.until = this.tick + 0.07 * HZ; }
        break;
      case 'settle': // a beat to get the ball back under control after the fake
        r.speedMul = 0.3;
        r.target = r.off;
        if (this.tick >= P.until || (P.action.type === 'pull' && P.fakes === 0)) P.phase = 'pre';
        break;
      case 'pull':
        r.speedMul = 0.6 + 0.03 * d.control;
        r.target = P.kickY - man * r.sp;
        if (Math.abs(my - P.kickY) < 12 || this.tick >= P.until) return this.kick(T, r, P.action, {});
        break;
    }
  }

  laneOpen(T, r, a) {
    const b = this.ball;
    if (a.kind === 'pass') return this.bestPass(T, r).c > 8;
    if (a.type === 'pull') return false;
    const tx = T ? 0 : L;
    return this.clearance(T, b.x, b.y, this.shotSlope(T, b.x, b.y, a.aim, a.type, a.wall), tx) > 6;
  }

  shotSlope(T, bx, by, aim, type, wall = by < W / 2 ? -1 : 1) {
    const D = Math.abs((T ? 0 : L) - bx);
    if (type !== 'bank') return (aim - by) / D;
    if (wall < 0) return -((by - BALL_R) + (aim - BALL_R) / WALL_E) / D;
    return ((W - BALL_R - by) + (W - BALL_R - aim) / WALL_E) / D;
  }

  bestPass(T, r) {
    const b = this.ball, to = this.rods[T][r.role === 'MID' ? 3 : 2];
    let best = { y: b.y, c: -999 };
    for (let y = 45; y <= W - 45; y += 25) {
      const c = this.clearance(T, b.x, b.y, (y - b.y) / Math.abs(to.x - b.x), to.x) - Math.abs(y - b.y) * 0.04;
      if (c > best.c) best = { y, c };
    }
    return best;
  }

  kick(T, r, a, opt) {
    const b = this.ball, d = this.d[T], tac = this.ais[T].tactics, R = this.rng, st = this.stats[T];
    b.owner = null;
    this.team[T].poss = null;
    let bx = b.x;
    if (r.dir * (bx - (r.x + r.dir * 30)) < 0) bx = r.x + r.dir * 30;
    const by = b.y;
    let slope, speed, sigma;
    const mult = (opt.forced ? 1.6 : 1) * (opt.oneTouch ? 1.6 : 1) * (r.role === 'ATT' ? 1 : 1.3);
    if (a.kind === 'shot') {
      const tx = T ? 0 : L;
      let aim = a.aim, type = a.type, sig = a.sig;
      const wall0 = a.wall ?? (by < W / 2 ? -1 : 1);
      slope = this.shotSlope(T, bx, by, aim, type, wall0);
      if (!opt.forced && type !== 'pull' && R() < d.vision && this.clearance(T, bx, by, slope, tx) < 6) {
        let bestC = -999;
        for (const wall of type === 'bank' ? [-1, 1] : [wall0]) for (let y = 258; y <= 422; y += 12) {
          const s = this.shotSlope(T, bx, by, y, type, wall), c = this.clearance(T, bx, by, s, tx);
          if (c > bestC) { bestC = c; aim = y; slope = s; }
        }
        sig = false;
      }
      speed = d.shotSpeed * SHOT_SPEED[type] * (r.role === 'ATT' ? 1 : 0.9);
      sigma = d.aimSigma * SHOT_SIGMA[type] * mult * (sig ? 1 - 0.35 * tac.discipline : 1);
      // pull and snake shots are hard techniques: low control means the odd mishit
      let mishit = type === 'pull' || type === 'snake' ? 0.45 - 0.03 * d.control : 0;
      if (opt.oneTouch) { mishit += 0.25 + opt.speed / 4000 - 0.02 * d.control; speed *= 0.85; } // hitting a moving ball cleanly is hard
      if (R() < mishit) { sigma *= 3; speed *= 0.8; }
      const sk = r.role === 'ATT' ? type : 'long';
      const ang = Math.atan(slope) + this.gauss() * sigma;
      slope = Math.tan(ang);
      const endY = pathY(by, slope, Math.abs(tx - bx));
      st.shots++; st.byType[sk][0]++;
      if (endY > GOAL_LO + 4 && endY < GOAL_HI - 4) { st.onTarget++; st.byType[sk][2]++; }
      this.team[1 - T].oppShots.push(aim);
      const label = (r.role === 'ATT' ? SHOT_NAME[type] : r.role === 'MID' ? 'Midfield shot' : 'Long shot') + (opt.oneTouch ? ' (one-touch)' : '');
      this.lastKick = { team: T, kind: 'shot', type: sk, label, done: false };
      // own rods in front lift out of the way
      for (const o of this.rods[T]) if (r.dir * (o.x - r.x) > 0) o.lift = 0.35;
    } else {
      const to = this.rods[T][r.role === 'MID' ? 3 : 2];
      let y;
      if (R() < d.vision) y = this.bestPass(T, r).y;
      else y = 45 + Math.floor(R() * 24) * 25;
      slope = (y - by) / Math.abs(to.x - bx);
      slope = Math.tan(Math.atan(slope) + this.gauss() * d.aimSigma * 0.6 * mult);
      speed = d.passSpeed;
      st.passes++;
      this.team[T].pending = { rod: to.idx, y: pathY(by, slope, Math.abs(to.x - bx)), until: this.tick + HZ };
      this.lastKick = { team: T, kind: 'pass', done: false };
      for (const o of this.rods[T]) if ((o.x - r.x) * (to.x - o.x) > 0) o.lift = 0.3;
    }
    const vx = r.dir * speed / Math.sqrt(1 + slope * slope);
    b.x = bx; b.y = by; b.vx = vx; b.vy = Math.abs(vx) * slope;
    r.lift = 0.06; r.kickT = 0.16; r.trapCD = 0.3;
    this.snd(a.kind === 'shot' ? 'shot' : 'pass', speed / 7000, T);
  }
}

function pickMix(mix, u) {
  const tot = SHOT_TYPES.reduce((s, k) => s + (mix[k] || 0), 0);
  if (tot <= 0) return 'straight';
  let acc = 0;
  for (const k of SHOT_TYPES) { acc += (mix[k] || 0) / tot; if (u < acc) return k; }
  return 'straight';
}

export const ROLE_NAME = { GK: 'goalie', DEF: 'defence', MID: 'midfield', ATT: 'striker' };
export const SHOT_NAME = { straight: 'Straight shot', pull: 'Pull shot', bank: 'Bank shot', snake: 'Snake shot' };

// Run a whole match headless. Returns the finished Match.
export function simulate(aiA, aiB, seed, opt) {
  const m = new Match(aiA, aiB, seed, opt);
  while (!m.over) m.step();
  return m;
}
