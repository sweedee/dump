import { CHUNKS, LEVELS } from './levels.js';
import { buildWorld, slotKeys, CHUNK } from './world.js';
import { step, makePlayer, isSolid, DT, PW, PH } from './physics.js';

const $ = (s) => document.querySelector(s);

// ---------- persistence (best effort) ----------
const store = {
  get(k, d) {
    try { const v = localStorage.getItem('patchwork:' + k); return v == null ? d : JSON.parse(v); } catch { return d; }
  },
  set(k, v) {
    try { localStorage.setItem('patchwork:' + k, JSON.stringify(v)); } catch {}
  },
};

// ---------- state ----------
const S = {
  mode: 'menu', // menu | build | play
  li: 0,
  level: null,
  slots: [],
  placement: {}, // slotKey -> piece index
  sel: null, // { tray: idx } | { slot: key }
  world: null,
  player: null,
  prev: { x: 0, y: 0 },
  deaths: 0,
  deadT: 0,
  won: false,
  particles: [],
  tile: 24,
  t: 0,
};

// ---------- colors ----------
const C = {
  sky1: '#1b1b3a', sky2: '#2b2152',
  rock: '#2f7f74', rockDark: '#245f58', grass: '#7ff0c8',
  spike: '#ff4d6d', spikeHi: '#ffd0d8',
  spring: '#ffd166', springDark: '#b7862b',
  flag: '#7cff6b', pole: '#e6e6f0',
  player: '#ff8c42', playerDark: '#c25a17',
  slotLine: '#8f8cd6', slotFill: '#ffffff08', lock: '#ffffff10',
};

// ---------- drawing ----------
function drawTile(ctx, ch, x, y, s, get, t) {
  const px = x * s, py = y * s;
  if (ch === '#') {
    ctx.fillStyle = C.rock;
    ctx.fillRect(px, py, s, s);
    ctx.fillStyle = C.rockDark;
    ctx.fillRect(px + s * 0.15, py + s * 0.55, s * 0.18, s * 0.18);
    ctx.fillRect(px + s * 0.6, py + s * 0.3, s * 0.14, s * 0.14);
    if (!isSolid(get(x, y - 1) ?? '#')) {
      ctx.fillStyle = C.grass;
      ctx.fillRect(px, py, s, Math.max(2, s * 0.18));
    }
  } else if (ch === '^') {
    ctx.fillStyle = C.spike;
    const n = 3, w = s / n;
    ctx.beginPath();
    for (let i = 0; i < n; i++) {
      ctx.moveTo(px + i * w, py + s);
      ctx.lineTo(px + i * w + w / 2, py + s * 0.4);
      ctx.lineTo(px + (i + 1) * w, py + s);
    }
    ctx.fill();
    ctx.fillStyle = C.spikeHi;
    for (let i = 0; i < n; i++) ctx.fillRect(px + i * w + w / 2 - 1, py + s * 0.42, 2, s * 0.12);
  } else if (ch === 'S') {
    ctx.fillStyle = C.springDark;
    ctx.fillRect(px + s * 0.1, py + s * 0.75, s * 0.8, s * 0.25);
    ctx.strokeStyle = C.spring;
    ctx.lineWidth = Math.max(2, s * 0.08);
    ctx.beginPath();
    for (let i = 0; i <= 4; i++) {
      const yy = py + s * 0.75 - i * s * 0.12;
      ctx.lineTo(px + s * (i % 2 ? 0.25 : 0.75), yy);
    }
    ctx.stroke();
    ctx.fillStyle = C.spring;
    ctx.fillRect(px + s * 0.05, py + s * 0.2, s * 0.9, s * 0.16);
  } else if (ch === 'G') {
    ctx.fillStyle = C.pole;
    ctx.fillRect(px + s * 0.3, py + s * 0.05, Math.max(2, s * 0.08), s * 0.95);
    ctx.fillStyle = C.flag;
    const wave = Math.sin(t * 6) * s * 0.06;
    ctx.beginPath();
    ctx.moveTo(px + s * 0.38, py + s * 0.08);
    ctx.quadraticCurveTo(px + s * 0.6, py + s * 0.14 + wave, px + s * 0.92, py + s * 0.22);
    ctx.lineTo(px + s * 0.38, py + s * 0.45);
    ctx.fill();
  }
}

function drawPlayer(ctx, x, y, s, facing, vy, alpha = 1) {
  const stretch = Math.max(-0.18, Math.min(0.18, -vy * 0.012));
  const w = PW * s * (1 - stretch * 0.6), h = PH * s * (1 + stretch);
  const cx = (x + PW / 2) * s, by = (y + PH) * s;
  ctx.globalAlpha = alpha;
  ctx.fillStyle = C.player;
  roundRect(ctx, cx - w / 2, by - h, w, h, s * 0.18);
  ctx.fill();
  ctx.fillStyle = C.playerDark;
  ctx.fillRect(cx - w / 2, by - h * 0.25, w, h * 0.25);
  ctx.fillStyle = '#fff';
  const ex = cx + facing * w * 0.18, ey = by - h * 0.65;
  ctx.fillRect(ex - s * 0.12, ey, s * 0.09, s * 0.16);
  ctx.fillRect(ex + s * 0.05, ey, s * 0.09, s * 0.16);
  ctx.globalAlpha = 1;
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function chunkCanvas(name, px = 66) {
  const cv = document.createElement('canvas');
  const dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.width = cv.height = Math.round(px * dpr);
  const ctx = cv.getContext('2d');
  const s = cv.width / CHUNK;
  const rows = CHUNKS[name];
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, C.sky1);
  g.addColorStop(1, C.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);
  const get = (x, y) => (x < 0 || y < 0 || x >= CHUNK || y >= CHUNK ? '.' : rows[y][x]);
  for (let y = 0; y < CHUNK; y++) for (let x = 0; x < CHUNK; x++) drawTile(ctx, rows[y][x], x, y, s, get, 0);
  return cv;
}

// ---------- canvas / layout ----------
const cv = $('#cv');
const ctx = cv.getContext('2d');
let dpr = 1;

function resize() {
  if (!S.level) return;
  const stage = $('#stage').getBoundingClientRect();
  const W = S.level.cols * CHUNK, H = S.level.rows * CHUNK;
  const tile = Math.max(8, Math.floor(Math.min((stage.width - 16) / W, (stage.height - 8) / H, 56)));
  S.tile = tile;
  dpr = Math.min(window.devicePixelRatio || 1, 3);
  cv.style.width = tile * W + 'px';
  cv.style.height = tile * H + 'px';
  cv.width = Math.round(tile * W * dpr);
  cv.height = Math.round(tile * H * dpr);
}
window.addEventListener('resize', resize);

function currentWorld() {
  return S.mode === 'play' ? S.world : buildWorld(S.level, S.placement, CHUNKS);
}

function render() {
  const world = currentWorld();
  const s = S.tile * dpr;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  const g = ctx.createLinearGradient(0, 0, 0, cv.height);
  g.addColorStop(0, C.sky1);
  g.addColorStop(1, C.sky2);
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, cv.width, cv.height);

  const get = (x, y) => (x < 0 || x >= world.w || y < 0 ? '#' : y >= world.h ? '.' : world.get(x, y));
  for (let y = 0; y < world.h; y++)
    for (let x = 0; x < world.w; x++) drawTile(ctx, world.get(x, y), x, y, s, get, S.t);

  const cs = CHUNK * s;
  if (S.mode === 'build') {
    for (let r = 0; r < S.level.rows; r++)
      for (let c = 0; c < S.level.cols; c++) {
        const key = `${c},${r}`;
        const x = c * cs, y = r * cs;
        if (S.level.fixed[key]) {
          ctx.fillStyle = C.lock;
          ctx.fillRect(x, y, cs, cs);
          ctx.font = `${Math.round(s * 0.7)}px system-ui`;
          ctx.globalAlpha = 0.35;
          ctx.fillText('🔒', x + s * 0.15, y + s * 0.8);
          ctx.globalAlpha = 1;
        } else if (S.placement[key] == null) {
          ctx.fillStyle = C.slotFill;
          ctx.fillRect(x + 3 * dpr, y + 3 * dpr, cs - 6 * dpr, cs - 6 * dpr);
          ctx.setLineDash([6 * dpr, 5 * dpr]);
          ctx.strokeStyle = S.sel?.tray != null || S.sel?.slot ? C.accentLine || '#ffb27a' : C.slotLine;
          ctx.lineWidth = 2 * dpr;
          ctx.strokeRect(x + 4 * dpr, y + 4 * dpr, cs - 8 * dpr, cs - 8 * dpr);
          ctx.setLineDash([]);
          ctx.fillStyle = C.slotLine;
          ctx.font = `700 ${Math.round(cs * 0.3)}px system-ui`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('+', x + cs / 2, y + cs / 2);
          ctx.textAlign = 'start';
          ctx.textBaseline = 'alphabetic';
        }
        if (S.sel?.slot === key || hoverSlot === key) {
          ctx.strokeStyle = '#ff8c42';
          ctx.lineWidth = 3 * dpr;
          ctx.strokeRect(x + 1.5 * dpr, y + 1.5 * dpr, cs - 3 * dpr, cs - 3 * dpr);
        }
      }
    // grid lines
    ctx.strokeStyle = '#ffffff22';
    ctx.lineWidth = 1 * dpr;
    for (let c = 1; c < S.level.cols; c++) line(c * cs, 0, c * cs, cv.height);
    for (let r = 1; r < S.level.rows; r++) line(0, r * cs, cv.width, r * cs);
    if (world.spawn) drawPlayer(ctx, world.spawn.x, world.spawn.y, s, 1, 0, 0.55);
  } else if (S.mode === 'play') {
    ctx.strokeStyle = '#ffffff0c';
    ctx.lineWidth = 1 * dpr;
    for (let c = 1; c < S.level.cols; c++) line(c * cs, 0, c * cs, cv.height);
    for (let r = 1; r < S.level.rows; r++) line(0, r * cs, cv.width, r * cs);
    const p = S.player;
    if (S.deadT <= 0) {
      const a = S.alpha ?? 1;
      const x = S.prev.x + (p.x - S.prev.x) * a, y = S.prev.y + (p.y - S.prev.y) * a;
      drawPlayer(ctx, x, y, s, p.facing, p.vy);
    }
    for (const q of S.particles) {
      ctx.globalAlpha = Math.max(0, q.life / q.max);
      ctx.fillStyle = q.color;
      ctx.fillRect(q.x * s - q.size * dpr / 2, q.y * s - q.size * dpr / 2, q.size * dpr, q.size * dpr);
    }
    ctx.globalAlpha = 1;
  }
}
function line(x0, y0, x1, y1) {
  ctx.beginPath();
  ctx.moveTo(x0, y0);
  ctx.lineTo(x1, y1);
  ctx.stroke();
}

// ---------- menu ----------
function progress() {
  return store.get('progress', {}); // { [li]: { best } }
}
function showMenu() {
  S.mode = 'menu';
  $('#game').hidden = true;
  $('#menu').hidden = false;
  const prog = progress();
  const list = $('#level-list');
  list.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const li = document.createElement('li');
    const b = document.createElement('button');
    const done = prog[i];
    if (done) b.classList.add('done');
    b.innerHTML = `<span class="n">${done ? '✓' : i + 1}</span><span class="name"></span><span class="meta">${lv.cols}×${lv.rows}${done ? ` · ☠ ${done.best}` : ''}</span>`;
    b.querySelector('.name').textContent = lv.name;
    b.onclick = () => openLevel(i);
    li.append(b);
    list.append(li);
  });
}

// ---------- build mode ----------
function openLevel(i) {
  S.li = i;
  S.level = LEVELS[i];
  S.slots = slotKeys(S.level);
  S.placement = loadPlacement(i);
  S.sel = null;
  S.deaths = 0;
  $('#menu').hidden = true;
  $('#game').hidden = false;
  $('#lvl-num').textContent = `${i + 1}.`;
  $('#lvl-name').textContent = S.level.name;
  $('#hint').textContent = S.level.hint || '';
  $('#win').hidden = true;
  enterBuild();
  resize();
}

function loadPlacement(i) {
  const saved = store.get('layout:' + i, {});
  const lv = LEVELS[i];
  const used = new Set();
  const out = {};
  for (const k of slotKeys(lv)) {
    const v = saved[k];
    if (Number.isInteger(v) && v >= 0 && v < lv.pieces.length && !used.has(v)) {
      out[k] = v;
      used.add(v);
    }
  }
  return out;
}

function enterBuild() {
  S.mode = 'build';
  $('#build-ui').hidden = false;
  $('#play-ui').hidden = true;
  updateDeaths();
  renderTray();
  resize();
}

function placedSet() {
  return new Set(Object.values(S.placement));
}

function renderTray() {
  const tray = $('#tray');
  tray.innerHTML = '';
  const placed = placedSet();
  S.level.pieces.forEach((name, i) => {
    if (placed.has(i)) return;
    const b = document.createElement('div');
    b.className = 'piece' + (S.sel?.tray === i ? ' sel' : '');
    b.dataset.idx = i;
    b.append(chunkCanvas(name));
    tray.append(b);
  });
  const full = S.slots.every((k) => S.placement[k] != null);
  $('#play').disabled = !full;
  if (!S.sel?.slot) $('#hint').textContent = full ? 'Looks good? Hit Play. You can rebuild any time.' : S.level.hint || '';
  store.set('layout:' + S.li, S.placement);
}

function slotAt(clientX, clientY) {
  const r = cv.getBoundingClientRect();
  const x = clientX - r.left, y = clientY - r.top;
  if (x < 0 || y < 0 || x >= r.width || y >= r.height) return null;
  const cs = (r.width / S.level.cols);
  const c = Math.floor(x / cs), rr = Math.floor(y / cs);
  if (c < 0 || rr < 0 || c >= S.level.cols || rr >= S.level.rows) return null;
  return `${c},${rr}`;
}
function overTray(clientX, clientY) {
  const r = $('#tray').getBoundingClientRect();
  return clientX >= r.left && clientX <= r.right && clientY >= r.top - 20 && clientY <= r.bottom + 20;
}

// Put tray piece `idx` into `key`; whatever was there goes back to the tray.
function placeFromTray(idx, key) {
  if (S.level.fixed[key]) return bump();
  S.placement[key] = idx;
  S.sel = null;
  renderTray();
}
// Move a placed piece to another slot (swapping if occupied).
function moveSlot(from, to) {
  if (S.level.fixed[to]) return bump();
  const a = S.placement[from], b = S.placement[to];
  S.placement[to] = a;
  if (b == null) delete S.placement[from];
  else S.placement[from] = b;
  S.sel = null;
  renderTray();
}
function returnSlot(key) {
  delete S.placement[key];
  S.sel = null;
  renderTray();
}
function bump() {
  cv.classList.remove('shake');
  void cv.offsetWidth;
  cv.classList.add('shake');
  if (navigator.vibrate) try { navigator.vibrate(30); } catch {}
}

function tapSlot(key) {
  if (S.level.fixed[key]) return bump();
  const filled = S.placement[key] != null;
  if (S.sel?.tray != null) return placeFromTray(S.sel.tray, key);
  if (S.sel?.slot) {
    if (S.sel.slot === key) return returnSlot(key);
    return moveSlot(S.sel.slot, key);
  }
  if (filled) {
    S.sel = { slot: key };
  } else if (S.slots.length) {
    // nothing selected: nudge the user toward the tray
    const first = $('#tray .piece');
    if (first) { first.classList.add('shake'); setTimeout(() => first.classList.remove('shake'), 300); }
  }
  renderTray();
  if (S.sel?.slot) $('#hint').textContent = 'Tap another slot to swap, or tap it again to remove.';
}
function tapTrayPiece(idx) {
  if (S.sel?.slot) {
    placeFromTray(idx, S.sel.slot);
    return;
  }
  S.sel = S.sel?.tray === idx ? null : { tray: idx };
  // if there's exactly one empty slot, just drop it in
  const empty = S.slots.filter((k) => S.placement[k] == null);
  if (S.sel && empty.length === 1 && S.slots.length === 1) return placeFromTray(idx, empty[0]);
  renderTray();
}

// Unified pointer handling: tap OR drag, from tray pieces or placed slots.
let drag = null;
let hoverSlot = null;
const ghost = $('#ghost');

function startPointer(e, src) {
  drag = { src, x0: e.clientX, y0: e.clientY, moved: false, id: e.pointerId };
}
$('#tray').addEventListener('pointerdown', (e) => {
  const el = e.target.closest('.piece');
  if (!el) return;
  startPointer(e, { tray: Number(el.dataset.idx), el });
});
cv.addEventListener('pointerdown', (e) => {
  if (S.mode !== 'build') return;
  const key = slotAt(e.clientX, e.clientY);
  if (!key) return;
  startPointer(e, { slot: key });
});
window.addEventListener('pointermove', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const dx = e.clientX - drag.x0, dy = e.clientY - drag.y0;
  if (!drag.moved && Math.hypot(dx, dy) > 10) {
    const name = drag.src.tray != null ? S.level.pieces[drag.src.tray] : S.placement[drag.src.slot] != null ? S.level.pieces[S.placement[drag.src.slot]] : null;
    if (!name || (drag.src.slot && S.level.fixed[drag.src.slot])) { drag = null; return; }
    drag.moved = true;
    ghost.innerHTML = '';
    ghost.append(chunkCanvas(name, 76));
    ghost.hidden = false;
    drag.src.el?.classList.add('dragging');
  }
  if (drag.moved) {
    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    const k = slotAt(e.clientX, e.clientY);
    hoverSlot = k && !S.level.fixed[k] ? k : null;
  }
});
window.addEventListener('pointerup', (e) => {
  if (!drag || e.pointerId !== drag.id) return;
  const d = drag;
  drag = null;
  ghost.hidden = true;
  hoverSlot = null;
  d.src.el?.classList.remove('dragging');
  if (!d.moved) {
    if (d.src.tray != null) tapTrayPiece(d.src.tray);
    else tapSlot(d.src.slot);
    return;
  }
  const key = slotAt(e.clientX, e.clientY);
  if (d.src.tray != null) {
    if (key) placeFromTray(d.src.tray, key);
  } else {
    if (key && key !== d.src.slot) moveSlot(d.src.slot, key);
    else if (!key && overTray(e.clientX, e.clientY)) returnSlot(d.src.slot);
  }
});
window.addEventListener('pointercancel', () => {
  if (drag) drag.src.el?.classList.remove('dragging');
  drag = null;
  ghost.hidden = true;
  hoverSlot = null;
});

$('#clear').onclick = () => {
  S.placement = {};
  S.sel = null;
  $('#hint').textContent = S.level.hint || '';
  renderTray();
};
$('#play').onclick = () => startPlay();
$('#to-menu').onclick = () => showMenu();

// ---------- play mode ----------
function startPlay() {
  S.world = buildWorld(S.level, S.placement, CHUNKS);
  S.mode = 'play';
  S.won = false;
  S.sel = null;
  $('#build-ui').hidden = true;
  $('#play-ui').hidden = false;
  $('#hint').textContent = S.level.hint || '';
  resize();
  spawn();
}
function spawn() {
  const sp = S.world.spawn;
  S.player = makePlayer(sp.x, sp.y);
  S.prev = { x: sp.x, y: sp.y };
  S.deadT = 0;
  input.jumpLatch = false;
}
function die() {
  S.deaths++;
  updateDeaths();
  const p = S.player;
  for (let i = 0; i < 24; i++) {
    const a = Math.random() * Math.PI * 2, v = 2 + Math.random() * 6;
    S.particles.push({ x: p.x + PW / 2, y: Math.min(p.y + PH / 2, S.world.h), vx: Math.cos(a) * v, vy: Math.sin(a) * v - 4, life: 0.7, max: 0.7, size: 3 + Math.random() * 4, color: Math.random() < 0.5 ? C.player : C.spike });
  }
  S.deadT = 0.6;
  if (navigator.vibrate) try { navigator.vibrate(40); } catch {}
}
function win() {
  S.won = true;
  const prog = progress();
  const prev = prog[S.li];
  prog[S.li] = { best: prev ? Math.min(prev.best, S.deaths) : S.deaths };
  store.set('progress', prog);
  for (let i = 0; i < 40; i++) {
    const a = Math.random() * Math.PI * 2, v = 3 + Math.random() * 7;
    S.particles.push({ x: S.player.x + PW / 2, y: S.player.y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 5, life: 1.2, max: 1.2, size: 3 + Math.random() * 4, color: [C.flag, C.spring, C.grass, C.player][i % 4] });
  }
  const last = S.li === LEVELS.length - 1;
  $('#win-stats').textContent = `${S.deaths === 0 ? 'Flawless!' : `☠ ${S.deaths} death${S.deaths === 1 ? '' : 's'}`}${last ? ' · That was the last level!' : ''}`;
  $('#win-next').hidden = last;
  setTimeout(() => { if (S.won && S.mode === 'play') $('#win').hidden = false; }, 700);
}
function updateDeaths() {
  $('#deaths').textContent = `☠ ${S.deaths}`;
}
$('#rebuild').onclick = () => enterBuild();
$('#respawn').onclick = () => { if (!S.won) spawn(); };
$('#win-menu').onclick = () => { $('#win').hidden = true; showMenu(); };
$('#win-next').onclick = () => openLevel(Math.min(S.li + 1, LEVELS.length - 1));

// ---------- input ----------
const input = { left: false, right: false, jump: false, padDir: 0, jumpTouch: false };
const keymap = { ArrowLeft: 'left', KeyA: 'left', ArrowRight: 'right', KeyD: 'right', Space: 'jump', ArrowUp: 'jump', KeyW: 'jump', KeyZ: 'jump' };
window.addEventListener('keydown', (e) => {
  if (S.mode === 'play') {
    if (keymap[e.code]) { input[keymap[e.code]] = true; e.preventDefault(); }
    if (e.code === 'KeyR') spawn();
    if (e.code === 'KeyB' || e.code === 'Escape') enterBuild();
    if ((e.code === 'Enter') && S.won && !$('#win-next').hidden) $('#win-next').click();
  } else if (S.mode === 'build' && e.code === 'Enter' && !$('#play').disabled) startPlay();
});
window.addEventListener('keyup', (e) => {
  if (keymap[e.code]) input[keymap[e.code]] = false;
});
window.addEventListener('blur', () => { input.left = input.right = input.jump = false; });

// Touch pad: one zone, finger position picks direction (you can slide between).
const pad = $('#pad');
const padPointers = new Map();
function padUpdate() {
  let dir = 0;
  const r = pad.getBoundingClientRect();
  for (const x of padPointers.values()) dir = x < r.left + r.width / 2 ? -1 : 1;
  input.padDir = dir;
  pad.children[0].classList.toggle('on', dir < 0);
  pad.children[1].classList.toggle('on', dir > 0);
}
pad.addEventListener('pointerdown', (e) => { pad.setPointerCapture(e.pointerId); padPointers.set(e.pointerId, e.clientX); padUpdate(); e.preventDefault(); });
pad.addEventListener('pointermove', (e) => { if (padPointers.has(e.pointerId)) { padPointers.set(e.pointerId, e.clientX); padUpdate(); } });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
  pad.addEventListener(ev, (e) => { padPointers.delete(e.pointerId); padUpdate(); });
const jumpBtn = $('#jump');
const jumpPointers = new Set();
jumpBtn.addEventListener('pointerdown', (e) => { jumpBtn.setPointerCapture(e.pointerId); jumpPointers.add(e.pointerId); input.jumpTouch = true; jumpBtn.classList.add('on'); e.preventDefault(); });
for (const ev of ['pointerup', 'pointercancel', 'lostpointercapture'])
  jumpBtn.addEventListener(ev, (e) => { jumpPointers.delete(e.pointerId); input.jumpTouch = jumpPointers.size > 0; jumpBtn.classList.toggle('on', input.jumpTouch); });
document.addEventListener('contextmenu', (e) => e.preventDefault());

function currentInput() {
  let dir = (input.right ? 1 : 0) - (input.left ? 1 : 0);
  if (input.padDir) dir = input.padDir;
  return { dir, jump: input.jump || input.jumpTouch };
}

// ---------- loop ----------
let last = performance.now(), acc = 0;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  S.t += dt;
  if (S.mode === 'play') {
    acc += dt;
    while (acc >= DT) {
      acc -= DT;
      tick();
    }
    S.alpha = acc / DT;
  }
  for (const q of S.particles) {
    q.life -= dt;
    q.vy += 30 * dt;
    q.x += q.vx * dt;
    q.y += q.vy * dt;
  }
  S.particles = S.particles.filter((q) => q.life > 0);
  if (S.mode !== 'menu' && S.level) render();
  requestAnimationFrame(frame);
}
function tick() {
  if (S.won) return;
  if (S.deadT > 0) {
    S.deadT -= DT;
    if (S.deadT <= 0) spawn();
    return;
  }
  const p = S.player;
  S.prev = { x: p.x, y: p.y };
  const ev = step(p, currentInput(), S.world);
  if (ev.win) win();
  else if (ev.dead) die();
}
requestAnimationFrame(frame);

// ---------- boot ----------
const qs = new URLSearchParams(location.search);
if (qs.has('level')) openLevel(Math.max(0, Math.min(LEVELS.length - 1, Number(qs.get('level')) - 1)));
else showMenu();
