// Coach cards, simplified: 4 star ratings (bought from a star budget) + 4 multiple-choice tactics.
// `compile()` turns a card into the detailed parameters the simulation runs on, so every star and
// every option is a big, deliberate jump rather than a fiddly slider.
import { derive, HZ } from './sim.js';

export const STAR_KEYS = ['speed', 'power', 'accuracy', 'control'];
export const STAR_MIN = 1, STAR_MAX = 5;
export const START_BUDGET = 12, BUDGET_STEP = 1;

// star → detailed engine stats (engine scale is 1..10)
const LV = [0, 3, 6, 9, 12];
const LV_SPD = [1, 3.5, 6, 8.5, 11];
const LV_POW = [0, 3, 6, 10, 15];
const LV_CTL = [0, 3, 6, 9.5, 14];
const STAR_MAP = {
  speed: (s) => ({ reflex: LV_SPD[s - 1], speed: LV_SPD[s - 1] }),
  power: (s) => ({ power: LV_POW[s - 1] }),
  accuracy: (s) => ({ accuracy: LV[s - 1], vision: LV[s - 1] }),
  control: (s) => ({ control: LV_CTL[s - 1] }),
};

export const STARS = {
  speed: { name: 'Speed', icon: '⚡', desc: 'Reaction time and how fast the rods slide. Wins blocks, stops shots on the move.',
    fmt: (d) => `reacts in ${Math.round((d.delay / HZ) * 1000)} ms · rods ${(d.rodSpeed / 1000).toFixed(1)} m/s` },
  power: { name: 'Power', icon: '💥', desc: 'Shot and pass speed. Fast shots get past blockers before they move.',
    fmt: (d) => `shots ${(d.shotSpeed / 1000).toFixed(1)} m/s` },
  accuracy: { name: 'Accuracy', icon: '🎯', desc: 'Aim, and the vision to spot an open gap at the last moment.',
    fmt: (d) => `±${((d.aimSigma * 180) / Math.PI).toFixed(1)}° aim · spots gaps ${Math.round(d.vision * 100)}%` },
  control: { name: 'Control', icon: '🧲', desc: 'Trapping, catching passes, no fumbles, landing tricky shots cleanly.',
    fmt: (d) => `${(d.fumble * 100).toFixed(1)}% fumbles/s` },
};

// [key, title, options: [value, label, what it does]]
export const CHOICES = [
  ['tempo', 'Tempo', [
    ['quick', 'Quick', 'Hits loose balls first time and shoots fast, before the defence is set. Sloppy.'],
    ['balanced', 'Balanced', 'Traps most balls, takes a moment to set up.'],
    ['patient', 'Patient', 'Always traps, then dribbles until it sees a gap. Risks fumbles and the 5 s shot clock.'],
  ]],
  ['build', 'Build-up', [
    ['pass', 'Pass', 'Goalie, defence and midfield pass forward to the strikers. Needs Control and Accuracy.'],
    ['mix', 'Mix', 'Sometimes passes, sometimes shoots from deep.'],
    ['blast', 'Blast', 'Hammers it at goal from anywhere. Lots of shots, few good ones.'],
  ]],
  ['shot', 'Striker shot', [
    ['straight', 'Straight', 'Quick and accurate, but easy for a set defence to line up against.'],
    ['pull', 'Pull', 'Drags the ball sideways and shoots on the move. Beats slow defences, wild without Control.'],
    ['bank', 'Bank', 'Off the side wall and around blockers. Very fast, slightly less accurate.'],
    ['power', 'Power', 'Spin-up snake shot: fastest of all, but erratic and needs set-up time.'],
    ['trick', 'Trick', 'Fakes one way, then shoots. Destroys defences that try to read you.'],
  ]],
  ['defence', 'Defence', [
    ['react', 'React', 'Blocks where the ball is. Never fooled by fakes, but always a step behind.'],
    ['balanced', 'Balanced', 'A bit of both.'],
    ['read', 'Read', 'Anticipates the shooter\'s movement. Great vs pulls, falls for tricks.'],
  ]],
];

export const COLORS = ['#ff5a5f', '#3d8bff', '#ffc531', '#36d399', '#c77dff', '#ff8c42', '#f2f0ff', '#2ad4d4'];

export function blankAI(name = 'My Bot', color = COLORS[0]) {
  return { name, color, stars: { speed: 3, power: 3, accuracy: 3, control: 3 },
    style: { tempo: 'balanced', build: 'mix', shot: 'straight', defence: 'balanced' } };
}

export const cost = (ai) => STAR_KEYS.reduce((s, k) => s + ai.stars[k], 0);

// card → engine parameters
export function compile(ai) {
  const stats = {};
  for (const k of STAR_KEYS) Object.assign(stats, STAR_MAP[k](ai.stars[k]));
  const st = ai.style;
  const tactics = {
    patience: 0.4, firstTouch: 0.3, backPlay: 0.5, midPlay: 0.4, feints: 0.1, discipline: 0, spot: 'C',
    read: 0.5, split: 1, mix: { straight: 1, pull: 0, bank: 0, snake: 0 },
  };
  Object.assign(tactics, {
    quick: { patience: 0.12, firstTouch: 0.6 }, balanced: { patience: 0.4, firstTouch: 0.25 }, patient: { patience: 0.65, firstTouch: 0 },
  }[st.tempo]);
  Object.assign(tactics, {
    pass: { backPlay: 0.05, midPlay: 0.05 }, mix: { backPlay: 0.5, midPlay: 0.4 }, blast: { backPlay: 0.85, midPlay: 0.75 },
  }[st.build]);
  Object.assign(tactics, {
    straight: { mix: { straight: 1 }, discipline: 0.85, spot: 'L' },
    pull: { mix: { pull: 1 } },
    bank: { mix: { bank: 1 } },
    power: { mix: { snake: 1 } },
    trick: { mix: { straight: 1 }, feints: 0.9 },
  }[st.shot]);
  tactics.mix = { straight: 0, pull: 0, bank: 0, snake: 0, ...tactics.mix };
  tactics.read = { react: 0, balanced: 0.5, read: 1 }[st.defence];
  tactics.split = 1;
  return { name: ai.name, color: ai.color, stats, tactics };
}

export const details = (ai) => derive(compile(ai));

const mk = (name, color, emoji, stars, style, blurb) => {
  const ai = blankAI(name, color);
  STAR_KEYS.forEach((k, i) => (ai.stars[k] = stars[i]));
  Object.assign(ai.style, style);
  ai.emoji = emoji; ai.blurb = blurb;
  return ai;
};

// Archetypes to start from (12 stars each).
export const PRESETS = [
  mk('All-rounder', '#3d8bff', '⚖️', [3, 3, 3, 3], {}, 'Balanced everything.'),
  mk('The Wall', '#36d399', '🧱', [5, 2, 3, 2], { tempo: 'balanced', build: 'mix', shot: 'straight', defence: 'react' }, 'Lightning hands, nothing gets past.'),
  mk('Cannon', '#ff5a5f', '💣', [2, 5, 3, 2], { tempo: 'quick', build: 'blast', shot: 'power' }, 'Hits everything as hard as possible, now.'),
  mk('Sniper', '#ffc531', '🎯', [3, 2, 5, 2], { tempo: 'patient', shot: 'straight' }, 'Waits for the gap, then threads it.'),
  mk('Trickster', '#c77dff', '🎭', [3, 2, 3, 4], { tempo: 'patient', shot: 'trick', defence: 'react' }, 'Fake, fake, goal.'),
  mk('Playmaker', '#2ad4d4', '🧠', [2, 2, 4, 4], { tempo: 'patient', build: 'pass', shot: 'pull' }, 'Passes through the lines.'),
];

// The ladder. Each rung has more stars than the last.
export const RIVALS = [
  mk('Rookie Rodney', '#9a98c4', '🐣', [3, 2, 3, 2], { tempo: 'quick', build: 'blast', shot: 'straight', defence: 'react' }, 'Just learned which end is which.'),
  mk('Brick Brigade', '#36d399', '🧱', [5, 2, 2, 2], { tempo: 'balanced', build: 'blast', shot: 'straight', defence: 'react' }, 'All defence, no ideas.'),
  mk('Metronome', '#ffc531', '⏱', [3, 3, 5, 1], { tempo: 'balanced', build: 'mix', shot: 'straight', defence: 'balanced' }, 'Same shot, same spot, every time.'),
  mk('Blitz', '#ff5a5f', '⚡', [3, 5, 3, 2], { tempo: 'quick', build: 'blast', shot: 'power', defence: 'balanced' }, 'One-touch hammer shots from everywhere.'),
  mk('Banksy', '#ff8c42', '🎨', [4, 3, 4, 3], { tempo: 'balanced', build: 'mix', shot: 'bank', defence: 'balanced' }, 'Loves a side wall.'),
  mk('Tiki-Taka', '#2ad4d4', '🧶', [4, 3, 4, 5], { tempo: 'patient', build: 'pass', shot: 'pull', defence: 'read' }, 'Never gives the ball away.'),
  mk('The Ghost', '#c77dff', '👻', [5, 3, 4, 5], { tempo: 'patient', build: 'mix', shot: 'trick', defence: 'react' }, 'Fakes left, fakes right, already scored.'),
  mk('Grandmaster', '#f2f0ff', '👑', [5, 4, 5, 5], { tempo: 'balanced', build: 'mix', shot: 'pull', defence: 'balanced' }, 'The final boss.'),
];

// ---- share codes ----
const STYLE_KEYS = CHOICES.map((c) => c[0]);
export function encode(ai) {
  const arr = [2, ai.name, ai.color, STAR_KEYS.map((k) => ai.stars[k]), STYLE_KEYS.map((k) => ai.style[k])];
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(arr))));
  return 'FB2-' + s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decode(code) {
  const m = String(code).trim().match(/FB2-([A-Za-z0-9_-]+)/);
  if (!m) throw new Error(/FB1-/.test(code) ? 'That code is from the old version' : 'Not a Foosbots code');
  let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const arr = JSON.parse(decodeURIComponent(escape(atob(b))));
  if (!Array.isArray(arr) || arr[0] !== 2) throw new Error('Unknown code version');
  const ai = { name: String(arr[1]).slice(0, 24) || 'Imported', color: arr[2], stars: {}, style: {} };
  STAR_KEYS.forEach((k, i) => (ai.stars[k] = arr[3]?.[i]));
  STYLE_KEYS.forEach((k, i) => (ai.style[k] = arr[4]?.[i]));
  return sanitize(ai);
}

export function sanitize(ai) {
  const base = blankAI();
  const out = { name: String(ai?.name || base.name).slice(0, 24), color: /^#[0-9a-f]{6}$/i.test(ai?.color) ? ai.color : base.color, stars: {}, style: {} };
  for (const k of STAR_KEYS) out.stars[k] = Math.max(STAR_MIN, Math.min(STAR_MAX, Math.round(Number(ai?.stars?.[k]) || base.stars[k])));
  for (const [k, , opts] of CHOICES) out.style[k] = opts.some((o) => o[0] === ai?.style?.[k]) ? ai.style[k] : base.style[k];
  return out;
}
