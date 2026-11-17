import { Match, simulate, HZ, L, W } from './sim.js';
import {
  STAR_KEYS, STAR_MIN, STAR_MAX, STARS, CHOICES, COLORS, PRESETS, RIVALS,
  START_BUDGET, BUDGET_STEP, blankAI, cost, compile, details, encode, decode, sanitize,
} from './teams.js';
import { makeRenderer } from './render.js';
import * as sfx from './sound.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- persistence ----------
const KEY = 'foosbots:v2';
function load() {
  try {
    const s = JSON.parse(localStorage.getItem(KEY));
    if (s && Array.isArray(s.bots) && s.bots.length) {
      s.bots = s.bots.map(sanitize);
      s.cur = Math.min(Math.max(0, s.cur | 0), s.bots.length - 1);
      s.beaten = Math.min(RIVALS.length, Math.max(0, s.beaten | 0));
      return s;
    }
  } catch {}
  const first = sanitize({ ...clone(PRESETS[0]), name: 'My Bot', color: COLORS[0] });
  return { bots: [first], cur: 0, beaten: 0 };
}
const S = load();
const save = () => { try { localStorage.setItem(KEY, JSON.stringify(S)); } catch {} };
const bot = () => S.bots[S.cur];
const budget = () => START_BUDGET + BUDGET_STEP * S.beaten;

function toast(msg) {
  const t = $('#toast');
  t.textContent = msg; t.hidden = false;
  clearTimeout(toast.h); toast.h = setTimeout(() => (t.hidden = true), 2200);
}

function show(id) {
  for (const s of ['home', 'editor', 'match']) $('#' + s).hidden = s !== id;
  window.scrollTo(0, 0);
}

const optLabel = (k, v) => CHOICES.find((c) => c[0] === k)[2].find((o) => o[0] === v)[1];
const pips = (ai) => `<div class="pips">${STAR_KEYS.map((k) => `<span>${STARS[k].icon} ${ai.stars[k]}</span>`).join('')}
  ${CHOICES.map(([k]) => `<span>${CHOICE_ICON[k]} ${optLabel(k, ai.style[k])}</span>`).join('')}</div>`;
const CHOICE_ICON = { tempo: '⏱', build: '↗', shot: '🥅', defence: '🛡' };
const badge = (ai, big) => `<span class="badge" style="background:${ai.color}">${ai.emoji ? ai.emoji : esc(ai.name.trim()[0] || '?').toUpperCase()}</span>`;

// ---------- home ----------
function renderHome() {
  const b = bot(), c = cost(b), B = budget();
  $('#my-bot').innerHTML = `${badge(b)}
    <div class="grow"><div class="nm">${esc(b.name)}</div>
    <div class="sub">${c}/${B} ★ ${c > B ? '· <b style="color:var(--bad)">over budget!</b>' : c < B ? '· <b style="color:var(--accent)">' + (B - c) + ' unspent</b>' : ''}</div>
    ${pips(b)}</div>`;

  $('#bot-list').innerHTML = S.bots.map((x, i) => `<button data-i="${i}" class="${i === S.cur ? 'cur' : ''}">${badge(x)}<span class="grow">${esc(x.name)}</span><span class="dim small">${cost(x)} ★</span></button>`).join('')
    + `<button data-new="1"><span class="badge" style="background:var(--panel2);color:var(--ink)">+</span><span class="grow">New bot</span></button>`;

  $('#ladder-prog').textContent = `· ${S.beaten}/${RIVALS.length}`;
  $('#ladder').innerHTML = RIVALS.map((r, i) => {
    const st = i < S.beaten ? 'beaten' : i === S.beaten ? 'next' : 'locked';
    const btn = st === 'locked' ? '<span class="dim">🔒</span>'
      : `<button class="btn ${st === 'next' ? 'primary' : ''}" data-rival="${i}">${st === 'next' ? 'Fight ▶' : 'Rematch'}</button>`;
    return `<li class="${st}"><span class="em">${r.emoji}</span><div class="grow"><div class="nm">${esc(r.name)}</div>
      <div class="bl">${esc(r.blurb)}</div>${st === 'locked' ? `<div class="pts">${cost(r)} ★</div>` : pips(r)}</div>${btn}</li>`;
  }).join('') + (S.beaten >= RIVALS.length ? '<li class="beaten"><span class="em">🏆</span><div class="grow"><div class="nm">Champion</div><div class="bl">You beat the whole ladder. Try Friendlies, or share your bot code.</div></div></li>' : '');

  const opts = oppOptions();
  $('#friendly-opp').innerHTML = opts.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('');
}

function oppOptions() {
  const out = RIVALS.map((r, i) => ({ label: `${r.emoji} ${r.name} (${cost(r)}★)`, ai: r, rival: i }));
  PRESETS.forEach((p) => out.push({ label: `${p.emoji} ${p.name} (archetype)`, ai: p }));
  S.bots.forEach((b, i) => out.push({ label: `🤖 ${b.name}${i === S.cur ? ' (mirror)' : ''}`, ai: b }));
  return out;
}

$('#edit-bot').onclick = () => openEditor();
$('#switch-bot').onclick = () => { $('#bot-list').hidden = !$('#bot-list').hidden; };
$('#bot-list').onclick = (e) => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.new) {
    const n = blankAI(`Bot ${S.bots.length + 1}`, COLORS[S.bots.length % COLORS.length]);
    S.bots.push(n); S.cur = S.bots.length - 1; save(); openEditor(); return;
  }
  S.cur = +b.dataset.i; save(); renderHome(); $('#bot-list').hidden = true;
};
$('#ladder').onclick = (e) => {
  const b = e.target.closest('[data-rival]');
  if (!b) return;
  const i = +b.dataset.rival;
  if (cost(bot()) > budget()) return toast(`Over budget: ${cost(bot())}/${budget()} ★. Tune your bot first.`);
  startMatch(bot(), RIVALS[i], { rival: i });
};
$('#friendly-go').onclick = () => {
  const o = oppOptions()[+$('#friendly-opp').value];
  startMatch(bot(), o.ai, { rival: -1 });
};

// ---------- editor ----------
let ed = null;
function openEditor() {
  ed = bot();
  show('editor');
  renderEditor();
}
function edChanged() { save(); renderBudget(); }
function renderBudget() {
  const c = cost(ed), B = budget(), el = $('#ed-budget');
  el.textContent = `★ ${c}/${B}`;
  el.className = 'budget' + (c > B ? ' over' : c === B ? ' full' : '');
}

function renderEditor() {
  $('#ed-name').value = ed.name;
  renderBudget();
  $('#ed-colors').innerHTML = COLORS.map((c) => `<button data-c="${c}" style="background:${c}" class="${c === ed.color ? 'on' : ''}" aria-label="colour ${c}"></button>`).join('');
  renderStars();
  renderChoices();
  $('#ed-presets').innerHTML = PRESETS.map((p, i) => `<button data-p="${i}"><b>${p.emoji} ${p.name}</b><span>${esc(p.blurb)}</span></button>`).join('');
  $('#lab-opp').innerHTML = oppOptions().map((o, i) => `<option value="${i}" ${o.rival === Math.min(S.beaten, RIVALS.length - 1) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  $('#lab-out').innerHTML = '';
  $('#ed-del').disabled = S.bots.length < 2;
}

function renderStars() {
  const d = details(ed), free = budget() - cost(ed);
  $('#ed-stars').innerHTML = STAR_KEYS.map((k) => {
    const v = ed.stars[k];
    const btns = Array.from({ length: STAR_MAX }, (_, i) => {
      const n = i + 1, on = n <= v, locked = n > v && n - v > free;
      return `<button data-n="${n}" class="${on ? 'on' : ''} ${locked ? 'locked' : ''}" aria-label="${n} stars">★</button>`;
    }).join('');
    return `<div class="starrow" data-k="${k}"><div class="top"><span class="t"><i>${STARS[k].icon}</i>${STARS[k].name}</span><span class="stars">${btns}</span></div>
      <div class="eff">${STARS[k].fmt(d)}</div><div class="desc">${STARS[k].desc}</div></div>`;
  }).join('');
}

function renderChoices() {
  $('#ed-choices').innerHTML = CHOICES.map(([k, title, opts]) => {
    const cur = opts.find((o) => o[0] === ed.style[k]);
    return `<div class="choice" data-k="${k}"><div class="t">${title}</div>
      <div class="seg">${opts.map(([v, lab]) => `<button data-v="${v}" class="${v === ed.style[k] ? 'on' : ''}">${lab}</button>`).join('')}</div>
      <div class="what"><b>${cur[1]}:</b> ${cur[2]}</div></div>`;
  }).join('');
}

$('#ed-back').onclick = () => { show('home'); renderHome(); };
$('#ed-name').oninput = (e) => { ed.name = e.target.value.slice(0, 24) || 'Bot'; save(); };
$('#ed-colors').onclick = (e) => {
  const c = e.target.dataset.c; if (!c) return;
  ed.color = c; edChanged(); renderEditor();
};
$('#ed-stars').onclick = (e) => {
  const b = e.target.closest('button[data-n]'); if (!b) return;
  const k = b.closest('.starrow').dataset.k;
  let n = +b.dataset.n;
  if (n === ed.stars[k] && n > STAR_MIN) n--; // tap the top star again to remove it
  const free = budget() - cost(ed) + ed.stars[k];
  if (n > free) { sfx.play('fumble'); return toast(`Not enough stars — free one up elsewhere (${budget()} total)`); }
  n = Math.max(STAR_MIN, Math.min(STAR_MAX, n));
  ed.stars[k] = n; sfx.play('star', n); edChanged(); renderStars();
};
$('#ed-choices').onclick = (e) => {
  const b = e.target.closest('button[data-v]'); if (!b) return;
  ed.style[b.closest('.choice').dataset.k] = b.dataset.v;
  sfx.play('click'); edChanged(); renderChoices();
};
$('#ed-presets').onclick = (e) => {
  const b = e.target.closest('[data-p]'); if (!b) return;
  const p = PRESETS[+b.dataset.p];
  if (!confirm(`Replace ${ed.name}'s settings with "${p.name}"? (name and colour stay)`)) return;
  ed.stars = clone(p.stars); ed.style = clone(p.style);
  while (cost(ed) > budget()) { const k = STAR_KEYS.reduce((a, c) => (ed.stars[c] > ed.stars[a] ? c : a)); ed.stars[k]--; }
  edChanged(); renderEditor(); toast(`Loaded ${p.name}`);
};
$('#ed-copy').onclick = async () => {
  const code = encode(ed);
  try { await navigator.clipboard.writeText(code); toast('Code copied — send it to a friend'); }
  catch { prompt('Copy this code:', code); }
};
$('#ed-import').onclick = () => {
  const code = prompt('Paste a Foosbots code (FB1-…):');
  if (!code) return;
  try {
    const ai = decode(code);
    S.bots.push(ai); S.cur = S.bots.length - 1; save();
    ed = bot(); renderEditor();
    toast(`Imported ${ai.name}${cost(ai) > budget() ? ' — over your budget, friendlies only' : ''}`);
  } catch (err) { toast(err.message || 'Bad code'); }
};
$('#ed-dup').onclick = () => {
  const c = clone(ed); c.name = (ed.name + ' 2').slice(0, 24);
  S.bots.push(c); S.cur = S.bots.length - 1; save(); ed = bot(); renderEditor(); toast('Duplicated — now editing the copy');
};
$('#ed-del').onclick = () => {
  if (S.bots.length < 2 || !confirm(`Delete ${ed.name}?`)) return;
  S.bots.splice(S.cur, 1); S.cur = 0; save(); show('home'); renderHome();
};
$('#lab-go').onclick = () => {
  const o = oppOptions()[+$('#lab-opp').value];
  const out = $('#lab-out'), btn = $('#lab-go');
  btn.disabled = true;
  const N = 40, me = compile(ed), opp = compile(o.ai);
  let w = 0, gf = 0, ga = 0, i = 0;
  const base = (Math.random() * 1e9) | 0;
  const chunk = () => {
    const t0 = performance.now();
    while (i < N && performance.now() - t0 < 30) {
      const swap = i & 1;
      const m = simulate(swap ? opp : me, swap ? me : opp, base + i);
      const mine = swap ? 1 : 0;
      if (m.winner === mine) w++;
      gf += m.score[mine]; ga += m.score[1 - mine];
      i++;
    }
    out.innerHTML = `<div class="big">${Math.round((w / i) * 100)}%</div><div class="meter"><span style="width:${(w / i) * 100}%"></span></div>
      <div class="dim">${w}–${i - w} over ${i}${i < N ? '…' : ''} matches · avg score ${(gf / i).toFixed(1)}–${(ga / i).toFixed(1)}</div>`;
    if (i < N) setTimeout(chunk, 0); else btn.disabled = false;
  };
  out.innerHTML = '<div class="dim">simulating…</div>';
  setTimeout(chunk, 0);
};

// ---------- match ----------
const R = makeRenderer($('#cv'));
let M = null, ctxM = null, speed = 1, acc = 0, lastT = 0, seen = 0, raf = 0;

function startMatch(a, b, info) {
  sfx.unlock();
  const A = clone(a), B = clone(b);
  if (A.color === B.color) B.color = COLORS.find((c) => c !== A.color && c !== '#f2f0ff') || '#3d8bff';
  ctxM = { A, B, info, seed: (Math.random() * 1e9) | 0 };
  M = new Match(compile(A), compile(B), ctxM.seed, { sfx: true });
  seen = 0; acc = 0; lastT = 0;
  $('#m-name0').textContent = A.name; $('#m-name1').textContent = B.name;
  $('#m-dot0').style.background = A.color; $('#m-dot1').style.background = B.color;
  $('#ticker').innerHTML = '';
  $('#result').hidden = true;
  setSpeed(1);
  show('match');
  requestAnimationFrame(() => { R.resize(); R.clearTrail(); });
  cancelAnimationFrame(raf);
  raf = requestAnimationFrame(frame);
}

function setSpeed(s) {
  speed = s;
  for (const b of $('#speeds').children) b.classList.toggle('on', b.dataset.s === String(s));
}
$('#speeds').onclick = (e) => {
  const s = e.target.dataset.s; if (s == null) return;
  if (s === 'skip') { while (!M.over) M.step(); M.sfx.length = 0; sfx.play('end', 1, 0, M.winner === 0); return; }
  setSpeed(+s);
};
$('#m-quit').onclick = () => {
  if (M && !M.over && !confirm('Leave this match?')) return;
  cancelAnimationFrame(raf); M = null; show('home'); renderHome();
};
window.addEventListener('resize', () => { if (M) R.resize(); });

function frame(t) {
  if (!M) return;
  const dt = lastT ? Math.min(0.1, (t - lastT) / 1000) : 0;
  lastT = t;
  acc += dt * speed * HZ;
  while (acc >= 1 && !M.over) { M.step(); acc--; }
  R.draw(M, [ctxM.A.color, ctxM.B.color]);
  $('#m-s0').textContent = M.score[0]; $('#m-s1').textContent = M.score[1];
  pumpEvents();
  pumpSounds();
  if (M.over) { if (!$('#result').hidden) return; setTimeout(showResult, 900); $('#result').hidden = false; $('#result').style.visibility = 'hidden'; return; }
  raf = requestAnimationFrame(frame);
}

function pumpSounds() {
  const q = M.sfx;
  if (!q.length) return;
  const b = M.ball;
  const pan = R.vertical ? (b.y / W) * 2 - 1 : (b.x / L) * 2 - 1;
  // at high speed only the important cues get through
  for (const e of q) if (speed <= 2 || ['goal', 'end', 'post', 'shot', 'whistle'].includes(e.k)) sfx.play(e.k, e.v, pan * 0.7, e.team === 0);
  q.length = 0;
}

function pumpEvents() {
  const tk = $('#ticker');
  while (seen < M.events.length) {
    const e = M.events[seen++];
    if (e.kind === 'end') continue;
    const who = e.team < 0 ? '' : `<span class="dot" style="background:${e.team ? ctxM.B.color : ctxM.A.color}"></span>`;
    const t = `${Math.floor(e.t / 60)}:${String(Math.floor(e.t % 60)).padStart(2, '0')}`;
    const div = document.createElement('div');
    div.innerHTML = `<span class="tm">${t}</span>${who}<span class="${e.kind === 'goal' ? 'goal' : ''}">${esc(e.text)}</span>`;
    tk.appendChild(div);
    while (tk.children.length > 4) tk.firstChild.remove();
    if (e.kind === 'goal') flash(e.team);
  }
}

function flash(team) {
  const f = $('#flash');
  f.textContent = 'GOAL!';
  f.style.color = team ? ctxM.B.color : ctxM.A.color;
  f.classList.add('on');
  clearTimeout(flash.h); flash.h = setTimeout(() => f.classList.remove('on'), 700 / Math.max(1, speed));
  if (navigator.vibrate && team === 0) try { navigator.vibrate(30); } catch {}
}

function showResult() {
  const m = M, { A, B, info } = ctxM, won = m.winner === 0;
  $('#result').style.visibility = '';
  $('#r-title').textContent = m.winner < 0 ? 'Draw' : won ? `${A.name} wins! 🎉` : `${B.name} wins`;
  $('#r-score').innerHTML = `<span style="color:${A.color}">${m.score[0]}</span> – <span style="color:${B.color}">${m.score[1]}</span>`;
  const rw = $('#r-reward');
  rw.hidden = true;
  if (won && info.rival >= 0 && info.rival === S.beaten) {
    S.beaten++; save();
    rw.hidden = false;
    rw.textContent = S.beaten >= RIVALS.length ? `🏆 Ladder complete! +${BUDGET_STEP} ★` : `Rival beaten! +${BUDGET_STEP} ★ (now ${budget()})`;
  }
  const s0 = m.stats[0], s1 = m.stats[1], tp = s0.poss + s1.poss || 1;
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '–');
  const rows = [
    ['Possession', Math.round((s0.poss / tp) * 100) + '%', Math.round((s1.poss / tp) * 100) + '%'],
    ['Shots', s0.shots, s1.shots],
    ['On target', pct(s0.onTarget, s0.shots), pct(s1.onTarget, s1.shots)],
    ['Blocked', s0.blocked, s1.blocked],
    ['Goalie saves', s0.saves, s1.saves],
    ['Passes done', `${s0.passesDone}/${s0.passes}`, `${s1.passesDone}/${s1.passes}`],
    ['Fumbles', s0.fumbles, s1.fumbles],
  ];
  const typeRow = (st) => Object.entries(st.byType).filter(([, v]) => v[0]).map(([k, v]) => `${k} ${v[1]}/${v[0]}`).join(', ') || '–';
  $('#r-stats').innerHTML = `<tr class="h"><td style="color:${A.color}">${esc(A.name)}</td><td></td><td style="color:${B.color}">${esc(B.name)}</td></tr>`
    + rows.map(([k, a, b]) => `<tr><td>${a}</td><td class="k">${k}</td><td>${b}</td></tr>`).join('')
    + `<tr><td colspan="3" class="k" style="text-align:left">Goals/shots by type — you: ${typeRow(s0)}<br>them: ${typeRow(s1)}</td></tr>`;
  $('#r-stats').insertAdjacentHTML('beforeend', `<tr><td colspan="3" class="k" style="text-align:left">Their plan: ${CHOICES.map(([k, t]) => `${t} <b>${optLabel(k, B.style[k])}</b>`).join(' · ')}</td></tr>`);
  $('#r-tips').innerHTML = tips(m, A, B).slice(0, 3).map((t) => `<div>💡 ${t}</div>`).join('');
}

function tips(m, A, B) {
  const s = m.stats[0], o = m.stats[1], out = [];
  const g = (st, k) => st.byType[k][1];
  const my = A.style, th = B.style;
  if (g(o, 'pull') >= 2 && my.defence !== 'read') out.push(`Their pull shots scored ${g(o, 'pull')}. A <b>Read</b> defence shuts pull shots down.`);
  if (th.shot === 'trick' && my.defence === 'read' && m.score[1] >= 3) out.push('Their fakes kept fooling your <b>Read</b> defence. <b>React</b> or Balanced doesn\'t bite.');
  if (g(o, 'bank') >= 2 && my.defence === 'react') out.push('Bank shots get round a <b>React</b> back line. Try Balanced or Read.');
  if (my.shot === 'pull' && th.defence === 'read') out.push('Their <b>Read</b> defence smothers pull shots. <b>Trick</b> shots punish defences that read.');
  if (my.shot === 'trick' && th.defence !== 'read' && m.winner !== 0) out.push('Trick shots only shine against Read defences. Against this one, try <b>Bank</b> or <b>Pull</b>.');
  if (s.passes >= 5 && s.passesDone / s.passes < 0.4) out.push(`Only ${s.passesDone}/${s.passes} passes arrived. More <b>Accuracy</b> and <b>Control</b>, or Build-up <b>Blast</b>.`);
  if (s.fumbles >= 3) out.push(`${s.fumbles} fumbles. More <b>Control</b>, or a quicker Tempo so rods hold the ball less.`);
  if (s.shots >= 6 && s.onTarget / s.shots < 0.7) out.push('Lots of shots off target: <b>Accuracy</b> stars fix that.');
  if (o.shots >= 8 && s.blockedBy.GK + s.blockedBy.DEF < o.shots * 0.25) out.push('Their shots walked through your back line. <b>Speed</b> stars make blockers react in time.');
  if (cost(A) < budget()) out.push(`You have ${budget() - cost(A)} unspent ★!`);
  if (!out.length) out.push(m.winner === 0 ? 'Clean win. On to the next rival — check their game plan first.' : 'Close one. Check their plan below their name on the ladder and test a counter in the Scrimmage lab.');
  return out;
}

$('#r-home').onclick = () => { $('#result').hidden = true; M = null; show('home'); renderHome(); };
$('#r-again').onclick = () => { const { info } = ctxM; startMatch(bot(), info.rival >= 0 ? RIVALS[info.rival] : ctxM.B, info); };
$('#r-tune').onclick = () => { $('#result').hidden = true; M = null; openEditor(); };

// sound toggle + unlock audio on first touch (browsers require a gesture)
function syncMute() { for (const b of document.querySelectorAll('.mute')) b.textContent = sfx.isMuted() ? '🔇' : '🔊'; }
document.addEventListener('click', (e) => {
  sfx.unlock();
  if (e.target.closest('.mute')) { sfx.setMuted(!sfx.isMuted()); syncMute(); }
}, true);
syncMute();

renderHome();
show('home');
