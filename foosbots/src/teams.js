// Coach cards: stats (bought with a point budget) + tactics (free, but every choice is a trade-off).
import { derive, HZ } from './sim.js';

export const STAT_KEYS = ['reflex', 'speed', 'power', 'accuracy', 'control', 'vision'];
export const STAT_MIN = 1, STAT_MAX = 10;
export const START_BUDGET = 30, BUDGET_STEP = 2;

export const STATS = {
  reflex: { name: 'Reflexes', icon: '⚡', desc: 'How quickly it notices the ball moving.',
    fmt: (a) => `${Math.round((derive(a).delay / HZ) * 1000)} ms lag` },
  speed: { name: 'Rod speed', icon: '↔', desc: 'How fast rods slide to block or dribble.',
    fmt: (a) => `${(derive(a).rodSpeed / 1000).toFixed(2)} m/s` },
  power: { name: 'Power', icon: '💥', desc: 'Shot and pass speed. Fast shots beat late blockers.',
    fmt: (a) => `${(derive(a).shotSpeed / 1000).toFixed(1)} m/s shots` },
  accuracy: { name: 'Accuracy', icon: '🎯', desc: 'How close shots and passes go to where they were aimed.',
    fmt: (a) => `±${((derive(a).aimSigma * 180) / Math.PI).toFixed(1)}°` },
  control: { name: 'Ball control', icon: '🧲', desc: 'Trapping loose balls, catching passes, not fumbling while dribbling.',
    fmt: (a) => `${(derive(a).fumble * 100).toFixed(1)}% fumble/s` },
  vision: { name: 'Vision', icon: '👁', desc: 'Chance to spot the open gap and re-aim at the last moment.',
    fmt: (a) => `${Math.round(derive(a).vision * 100)}% reads` },
};

// [key, title, left label, right label, help]
export const TACTICS = [
  ['patience', 'Patience', 'Snap', 'Wait', 'How long a rod dribbles before acting. Waiting lets Vision find gaps, but risks fumbles and the 5 s shot clock.'],
  ['feints', 'Feints', 'Honest', 'Tricky', 'Fake one way before shooting. Fools defences that read movement, costs control.'],
  ['firstTouch', 'First touch', 'Trap', 'Strike', 'Loose ball arrives: stop it and set up, or hit it first time (sloppier, but the defence is not set).'],
  ['backPlay', 'Back rods', 'Pass', 'Blast', 'Goalie & defence: pass up to the 5-bar or hammer it down the table.'],
  ['midPlay', 'Midfield', 'Pass', 'Shoot', '5-bar: feed the strikers or try from distance.'],
  ['discipline', 'Shot aim', 'Anywhere', 'Signature', 'Always aim for one practised spot (more accurate, but readable) or mix it up.'],
  ['read', 'Defence', 'React', 'Read', 'Read = anticipate: lead the shooter and cover where they usually aim. Strong vs habits, weak vs feints.'],
  ['split', 'Back line', 'Stack', 'Split', 'Stack: goalie and defence both block the same line. Split: each covers one half of the goal.'],
];

export const SHOTS = [
  ['straight', 'Straight', 'Quick and plain.'],
  ['pull', 'Pull', 'Drag the ball sideways and shoot on the move.'],
  ['bank', 'Bank', 'Off the side wall — dodges blockers, less accurate.'],
  ['snake', 'Snake', 'Spin-up power shot. Very fast, wild, needs set-up time.'],
];

export const COLORS = ['#ff5a5f', '#3d8bff', '#ffc531', '#36d399', '#c77dff', '#ff8c42', '#f2f0ff', '#2ad4d4'];

export function blankAI(name = 'My Bot', color = COLORS[0]) {
  return {
    name, color,
    stats: { reflex: 5, speed: 5, power: 5, accuracy: 5, control: 5, vision: 5 },
    tactics: { patience: 0.4, feints: 0.3, firstTouch: 0.3, backPlay: 0.5, midPlay: 0.3, discipline: 0.3, spot: 'C', read: 0.4, split: 0.5,
      mix: { straight: 5, pull: 4, bank: 2, snake: 1 } },
  };
}

export const cost = (ai) => STAT_KEYS.reduce((s, k) => s + ai.stats[k], 0);

const mk = (name, color, emoji, stats, t, blurb) => {
  const ai = blankAI(name, color);
  STAT_KEYS.forEach((k, i) => (ai.stats[k] = stats[i]));
  Object.assign(ai.tactics, t);
  if (t.mix) ai.tactics.mix = { straight: 0, pull: 0, bank: 0, snake: 0, ...t.mix };
  ai.emoji = emoji; ai.blurb = blurb;
  return ai;
};

// Archetypes you can start from (all cost exactly START_BUDGET).
export const PRESETS = [
  mk('All-rounder', '#3d8bff', '⚖️', [5, 5, 5, 5, 5, 5], {}, 'Balanced everything. A fine place to start tinkering.'),
  mk('The Wall', '#36d399', '🧱', [8, 7, 3, 4, 5, 3], { patience: 0.2, feints: 0, read: 0.2, split: 0.9, backPlay: 0.3, midPlay: 0.5, firstTouch: 0.2, mix: { straight: 6, bank: 2 } },
    'Fast hands, split back line. Happy to win ugly.'),
  mk('Cannon', '#ff5a5f', '💣', [4, 4, 10, 6, 3, 3], { patience: 0.05, feints: 0, firstTouch: 0.8, backPlay: 0.9, midPlay: 0.8, discipline: 0, read: 0.5, mix: { straight: 5, snake: 6 } },
    'Hits everything as hard as possible, immediately.'),
  mk('Sniper', '#ffc531', '🎯', [4, 4, 5, 9, 3, 5], { patience: 0.5, feints: 0.1, discipline: 0.9, spot: 'L', midPlay: 0.2, mix: { straight: 8, pull: 2 } },
    'One spot, practised a million times. Predictable — but can you stop it?'),
  mk('Trickster', '#c77dff', '🎭', [5, 6, 4, 4, 6, 5], { patience: 0.6, feints: 0.9, read: 0.3, firstTouch: 0.1, mix: { pull: 8, bank: 3, straight: 1 } },
    'Shuffles, fakes, pulls. Makes reading defences look silly.'),
  mk('Playmaker', '#2ad4d4', '🧠', [4, 4, 4, 5, 6, 7], { patience: 0.8, feints: 0.3, backPlay: 0.1, midPlay: 0.05, firstTouch: 0.1, read: 0.7, mix: { straight: 4, pull: 3, bank: 3 } },
    'Passes through the lines and waits for the gap.'),
];

// The ladder. Each rung has a bigger point budget than the last.
export const RIVALS = [
  mk('Rookie Rodney', '#9a98c4', '🐣', [3, 4, 4, 3, 3, 3], { patience: 0.3, feints: 0, read: 0, split: 0.2, firstTouch: 0.5, backPlay: 0.7, midPlay: 0.6, mix: { straight: 1 } },
    'Just learned which end is which.'),
  mk('Brick Brigade', '#36d399', '🧱', [7, 7, 2, 3, 4, 3], { patience: 0.2, feints: 0, read: 0.2, split: 1, backPlay: 0.4, midPlay: 0.6, firstTouch: 0.2, mix: { straight: 1 } },
    'All defence, no ideas. Score early or it gets ugly.'),
  mk('Metronome', '#ffc531', '⏱', [6, 6, 5, 9, 4, 2], { patience: 0.3, feints: 0, discipline: 1, spot: 'R', read: 0.3, split: 0.8, midPlay: 0.5, backPlay: 0.3, mix: { straight: 1 } },
    'Same shot, same spot, every time. Very, very accurate.'),
  mk('Blitz', '#ff5a5f', '💣', [4, 4, 10, 4, 3, 3], { patience: 0, feints: 0, firstTouch: 0.9, backPlay: 1, midPlay: 0.9, read: 0.4, split: 0.4, mix: { straight: 4, snake: 6 } },
    'One-touch hammer shots from everywhere.'),
  mk('Banksy', '#ff8c42', '🎨', [5, 5, 4, 6, 4, 8], { patience: 0.5, feints: 0.2, read: 0.5, split: 0.7, midPlay: 0.4, mix: { bank: 7, straight: 2, pull: 1 } },
    'Loves a side wall. Hard to block what goes around you.'),
  mk('Tiki-Taka', '#2ad4d4', '🧶', [5, 5, 4, 5, 8, 7], { patience: 0.85, feints: 0.4, backPlay: 0.05, midPlay: 0.05, firstTouch: 0, read: 0.6, split: 0.6, mix: { pull: 4, straight: 3, bank: 2 } },
    'Never gives the ball away. Waits, waits, finds the gap.'),
  mk('The Ghost', '#c77dff', '👻', [8, 7, 5, 6, 6, 5], { patience: 0.6, feints: 1, read: 0.2, split: 0.8, firstTouch: 0.2, midPlay: 0.2, mix: { pull: 8, bank: 2 } },
    'Fakes left, fakes right, already scored.'),
  mk('Grandmaster', '#f2f0ff', '👑', [7, 7, 7, 7, 7, 7], { patience: 0.55, feints: 0.5, read: 0.5, split: 0.75, firstTouch: 0.25, backPlay: 0.3, midPlay: 0.25, discipline: 0.2, mix: { straight: 3, pull: 4, bank: 3, snake: 1 } },
    'The final boss. Good at everything.'),
];
export const rivalBudget = (i) => cost(RIVALS[i]);

// ---- share codes ----
const T_KEYS = ['patience', 'feints', 'firstTouch', 'backPlay', 'midPlay', 'discipline', 'read', 'split'];
const MIX_KEYS = ['straight', 'pull', 'bank', 'snake'];

export function encode(ai) {
  const arr = [1, ai.name, ai.color, STAT_KEYS.map((k) => ai.stats[k]), T_KEYS.map((k) => Math.round(ai.tactics[k] * 100)),
    MIX_KEYS.map((k) => ai.tactics.mix[k]), ai.tactics.spot];
  const s = btoa(unescape(encodeURIComponent(JSON.stringify(arr))));
  return 'FB1-' + s.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

export function decode(code) {
  const m = String(code).trim().match(/FB1-([A-Za-z0-9_-]+)/);
  if (!m) throw new Error('Not a Foosbots code');
  let b = m[1].replace(/-/g, '+').replace(/_/g, '/');
  while (b.length % 4) b += '=';
  const arr = JSON.parse(decodeURIComponent(escape(atob(b))));
  if (!Array.isArray(arr) || arr[0] !== 1) throw new Error('Unknown code version');
  const ai = blankAI(String(arr[1]).slice(0, 24) || 'Imported', /^#[0-9a-f]{6}$/i.test(arr[2]) ? arr[2] : COLORS[1]);
  STAT_KEYS.forEach((k, i) => (ai.stats[k] = clampInt(arr[3][i], STAT_MIN, STAT_MAX)));
  T_KEYS.forEach((k, i) => (ai.tactics[k] = clampInt(arr[4][i], 0, 100) / 100));
  MIX_KEYS.forEach((k, i) => (ai.tactics.mix[k] = clampInt(arr[5][i], 0, 10)));
  ai.tactics.spot = ['L', 'C', 'R'].includes(arr[6]) ? arr[6] : 'C';
  return ai;
}
const clampInt = (v, a, b) => Math.max(a, Math.min(b, Math.round(Number(v) || 0)));

export function sanitize(ai) {
  const base = blankAI();
  const out = { ...base, ...ai, stats: { ...base.stats, ...(ai?.stats || {}) }, tactics: { ...base.tactics, ...(ai?.tactics || {}) } };
  out.tactics.mix = { ...base.tactics.mix, ...(ai?.tactics?.mix || {}) };
  STAT_KEYS.forEach((k) => (out.stats[k] = clampInt(out.stats[k], STAT_MIN, STAT_MAX)));
  return out;
}
