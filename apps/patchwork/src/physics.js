// Deterministic fixed-timestep platformer physics.
// Shared by the game AND the level solver (tools/check-levels.mjs), so
// "the solver says it's beatable" means "the real game can beat it".
// Units: 1 = one tile. y grows downward.

export const DT = 1 / 60;
export const PW = 0.6; // player width
export const PH = 0.8; // player height

export const BASE = {
  runSpeed: 7,
  groundAccel: 70,
  airAccel: 65,
  friction: 60,
  gravity: 46,
  jumpVel: 15.3, // ~2.54 tiles of jump height -> 2-tile walls are climbable, 3 are not
  jumpCut: 0.45, // velocity multiplier when jump is released early
  maxFall: 20,
  springVel: 23, // ~5.75 tiles of bounce
  coyote: 6, // frames you can still jump after walking off a ledge
  buffer: 6, // frames a jump press is remembered before landing
};

export const isSolid = (c) => c === '#' || c === 'S';

// world: { w, h, get(tx, ty) -> char }
function solidAt(world, tx, ty) {
  if (tx < 0 || tx >= world.w || ty < 0) return true; // walls + ceiling
  if (ty >= world.h) return false; // open bottom = bottomless pit
  return isSolid(world.get(tx, ty));
}

function hits(world, x, y) {
  const x0 = Math.floor(x), x1 = Math.floor(x + PW - 1e-6);
  const y0 = Math.floor(y), y1 = Math.floor(y + PH - 1e-6);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) if (solidAt(world, tx, ty)) return true;
  return false;
}

export function makePlayer(x, y) {
  return { x, y, vx: 0, vy: 0, grounded: true, coyote: 0, buffer: 0, jumpHeld: false, rising: false, facing: 1 };
}

const approach = (v, t, d) => (v < t ? Math.min(v + d, t) : Math.max(v - d, t));

// Advances the player one tick. Returns events: { jump, spring, land, dead, win }.
export function step(p, input, world, T = BASE) {
  const ev = {};
  const dir = input.dir;

  const accel = dir !== 0 ? (p.grounded ? T.groundAccel : T.airAccel) : p.grounded ? T.friction : T.airAccel * 0.4;
  p.vx = approach(p.vx, dir * T.runSpeed, accel * DT);
  if (dir) p.facing = dir;

  const pressed = input.jump && !p.jumpHeld;
  p.jumpHeld = input.jump;
  if (pressed) p.buffer = T.buffer;
  else if (p.buffer > 0) p.buffer--;
  if (p.grounded) p.coyote = T.coyote;
  else if (p.coyote > 0) p.coyote--;

  if (p.buffer > 0 && p.coyote > 0) {
    p.vy = -T.jumpVel;
    p.buffer = 0;
    p.coyote = 0;
    p.grounded = false;
    p.rising = true;
    ev.jump = true;
  }
  if (p.rising && !input.jump && p.vy < 0) {
    p.vy *= T.jumpCut;
    p.rising = false;
  }
  p.vy = Math.min(p.vy + T.gravity * DT, T.maxFall);
  if (p.vy >= 0) p.rising = false;

  // X axis
  p.x += p.vx * DT;
  if (hits(world, p.x, p.y)) {
    if (p.vx > 0) p.x = Math.floor(p.x + PW) - PW - 1e-4;
    else if (p.vx < 0) p.x = Math.floor(p.x) + 1 + 1e-4;
    p.vx = 0;
  }

  // Y axis
  const wasGrounded = p.grounded;
  p.grounded = false;
  p.y += p.vy * DT;
  if (hits(world, p.x, p.y)) {
    if (p.vy > 0) {
      p.y = Math.floor(p.y + PH) - PH - 1e-4;
      const row = Math.floor(p.y + PH + 0.01);
      let spring = false;
      for (let tx = Math.floor(p.x); tx <= Math.floor(p.x + PW - 1e-6); tx++)
        if (row < world.h && tx >= 0 && tx < world.w && world.get(tx, row) === 'S') spring = true;
      if (spring) {
        p.vy = -T.springVel;
        p.rising = false;
        ev.spring = true;
      } else {
        if (!wasGrounded) ev.land = true;
        p.vy = 0;
        p.grounded = true;
      }
    } else {
      p.y = Math.floor(p.y) + 1 + 1e-4;
      p.vy = 0;
      p.rising = false;
    }
  }

  // Hazards + goal
  const x0 = Math.floor(p.x), x1 = Math.floor(p.x + PW);
  const y0 = Math.floor(p.y), y1 = Math.floor(p.y + PH);
  for (let ty = y0; ty <= y1; ty++)
    for (let tx = x0; tx <= x1; tx++) {
      if (tx < 0 || tx >= world.w || ty < 0 || ty >= world.h) continue;
      const c = world.get(tx, ty);
      if (c === '^' && overlap(p, tx + 0.12, ty + 0.45, tx + 0.88, ty + 1)) ev.dead = true;
      if (c === 'G' && overlap(p, tx + 0.15, ty + 0.1, tx + 0.85, ty + 1)) ev.win = true;
    }
  if (p.y > world.h + 1) ev.dead = true;
  return ev;
}

function overlap(p, ax, ay, bx, by) {
  return p.x < bx && p.x + PW > ax && p.y < by && p.y + PH > ay;
}
