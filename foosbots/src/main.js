import { Match, simulate, HZ, SHOT_NAME } from './sim.js';
import {
  STAT_KEYS, STAT_MIN, STAT_MAX, STATS, TACTICS, SHOTS, COLORS, PRESETS, RIVALS,
  START_BUDGET, BUDGET_STEP, blankAI, cost, encode, decode, sanitize,
} from './teams.js';
import { makeRenderer } from './render.js';

const $ = (s) => document.querySelector(s);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const clone = (o) => JSON.parse(JSON.stringify(o));

// ---------- persistence ----------
const KEY = 'foosbots:v1';
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
  const first = clone(PRESETS[0]);
  first.name = 'My Bot'; first.color = COLORS[0];
  delete first.emoji; delete first.blurb;
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

const badge = (ai, big) => `<span class="badge" style="background:${ai.color}">${ai.emoji ? ai.emoji : esc(ai.name.trim()[0] || '?').toUpperCase()}</span>`;

// ---------- home ----------
function renderHome() {
  const b = bot(), c = cost(b), B = budget();
  $('#my-bot').innerHTML = `${badge(b)}
    <div class="grow"><div class="nm">${esc(b.name)}</div>
    <div class="sub">${c}/${B} points ${c > B ? '· <b style="color:var(--bad)">over budget!</b>' : c < B ? '· <b style="color:var(--accent)">' + (B - c) + ' unspent</b>' : ''}</div>
    <div class="pips">${STAT_KEYS.map((k) => `<span>${STATS[k].icon} ${b.stats[k]}</span>`).join('')}</div></div>`;

  $('#bot-list').innerHTML = S.bots.map((x, i) => `<button data-i="${i}" class="${i === S.cur ? 'cur' : ''}">${badge(x)}<span class="grow">${esc(x.name)}</span><span class="dim small">${cost(x)} pts</span></button>`).join('')
    + `<button data-new="1"><span class="badge" style="background:var(--panel2);color:var(--ink)">+</span><span class="grow">New bot</span></button>`;

  $('#ladder-prog').textContent = `· ${S.beaten}/${RIVALS.length}`;
  $('#ladder').innerHTML = RIVALS.map((r, i) => {
    const st = i < S.beaten ? 'beaten' : i === S.beaten ? 'next' : 'locked';
    const btn = st === 'locked' ? '<span class="dim">🔒</span>'
      : `<button class="btn ${st === 'next' ? 'primary' : ''}" data-rival="${i}">${st === 'next' ? 'Fight ▶' : 'Rematch'}</button>`;
    return `<li class="${st}"><span class="em">${r.emoji}</span><div class="grow"><div class="nm">${esc(r.name)}</div>
      <div class="bl">${esc(r.blurb)}</div><div class="pts">${cost(r)} build points</div></div>${btn}</li>`;
  }).join('') + (S.beaten >= RIVALS.length ? '<li class="beaten"><span class="em">🏆</span><div class="grow"><div class="nm">Champion</div><div class="bl">You beat the whole ladder. Try Friendlies, or share your bot code.</div></div></li>' : '');

  const opts = oppOptions();
  $('#friendly-opp').innerHTML = opts.map((o, i) => `<option value="${i}">${esc(o.label)}</option>`).join('');
}

function oppOptions() {
  const out = RIVALS.map((r, i) => ({ label: `${r.emoji} ${r.name} (${cost(r)})`, ai: r, rival: i }));
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
  if (cost(bot()) > budget()) return toast(`Over budget: ${cost(bot())}/${budget()} points. Tune your bot first.`);
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
  el.textContent = `${c}/${B}`;
  el.className = 'budget' + (c > B ? ' over' : c === B ? ' full' : '');
}

function renderEditor() {
  $('#ed-name').value = ed.name;
  renderBudget();
  $('#ed-colors').innerHTML = COLORS.map((c) => `<button data-c="${c}" style="background:${c}" class="${c === ed.color ? 'on' : ''}" aria-label="colour ${c}"></button>`).join('');

  $('#ed-stats').innerHTML = STAT_KEYS.map((k) => {
    const v = ed.stats[k];
    return `<div class="stat" data-k="${k}"><div class="t"><i>${STATS[k].icon}</i>${STATS[k].name}</div>
      <div class="stepper"><button data-d="-1" ${v <= STAT_MIN ? 'disabled' : ''}>−</button><button data-d="1" ${v >= STAT_MAX || cost(ed) >= budget() ? 'disabled' : ''}>+</button></div>
      <div class="v">${v}/10 · ${STATS[k].fmt(ed)}</div>
      <div class="bar">${Array.from({ length: 10 }, (_, i) => `<span class="${i < v ? 'on' : ''}"></span>`).join('')}</div>
      <div class="desc">${STATS[k].desc}</div></div>`;
  }).join('');

  $('#ed-tactics').innerHTML = TACTICS.map(([k, t, lo, hi, help]) => {
    const v = Math.round(ed.tactics[k] * 100);
    return `<div class="tac" data-k="${k}"><div class="top"><span class="t">${t} <button class="q" aria-label="explain">ⓘ</button></span><span class="pct">${v}%</span></div>
      <input type="range" min="0" max="100" step="5" value="${v}" aria-label="${t}" />
      <div class="ends"><span>${lo}</span><span>${hi}</span></div><div class="help">${help}</div></div>`;
  }).join('');

  renderShots();
  $('#ed-spot').innerHTML = [['L', 'Left'], ['C', 'Centre'], ['R', 'Right']].map(([k, n]) => `<button data-s="${k}" class="${ed.tactics.spot === k ? 'on' : ''}">${n}</button>`).join('');
  $('#ed-presets').innerHTML = PRESETS.map((p, i) => `<button data-p="${i}"><b>${p.emoji} ${p.name}</b><span>${esc(p.blurb)}</span></button>`).join('');
  $('#lab-opp').innerHTML = oppOptions().map((o, i) => `<option value="${i}" ${o.rival === Math.min(S.beaten, RIVALS.length - 1) ? 'selected' : ''}>${esc(o.label)}</option>`).join('');
  $('#lab-out').innerHTML = '';
  $('#ed-del').disabled = S.bots.length < 2;
}

function renderShots() {
  const mix = ed.tactics.mix, tot = SHOTS.reduce((s, [k]) => s + mix[k], 0) || 1;
  $('#ed-shots').innerHTML = SHOTS.map(([k, n, help]) => `<div class="tac open" data-mix="${k}"><div class="top"><span class="t">${n}</span><span class="pct">${Math.round((mix[k] / tot) * 100)}%</span></div>
    <input type="range" min="0" max="10" step="1" value="${mix[k]}" aria-label="${n}" /><div class="help">${help}</div></div>`).join('');
}

$('#ed-back').onclick = () => { show('home'); renderHome(); };
$('#ed-name').oninput = (e) => { ed.name = e.target.value.slice(0, 24) || 'Bot'; save(); };
$('#ed-colors').onclick = (e) => {
  const c = e.target.dataset.c; if (!c) return;
  ed.color = c; edChanged(); renderEditor();
};
$('#ed-stats').onclick = (e) => {
  const b = e.target.closest('button'); if (!b) return;
  const k = b.closest('.stat').dataset.k, d = +b.dataset.d;
  const v = ed.stats[k] + d;
  if (v < STAT_MIN || v > STAT_MAX || (d > 0 && cost(ed) >= budget())) return;
  ed.stats[k] = v; edChanged(); renderEditor();
};
$('#ed-tactics').oninput = (e) => {
  const tac = e.target.closest('.tac'); if (!tac) return;
  ed.tactics[tac.dataset.k] = +e.target.value / 100;
  tac.querySelector('.pct').textContent = e.target.value + '%';
  edChanged();
};
$('#ed-tactics').onclick = (e) => { if (e.target.classList.contains('q')) e.target.closest('.tac').classList.toggle('open'); };
$('#ed-shots').oninput = (e) => {
  const tac = e.target.closest('.tac'); if (!tac) return;
  ed.tactics.mix[tac.dataset.mix] = +e.target.value;
  const mix = ed.tactics.mix, tot = SHOTS.reduce((s, [k]) => s + mix[k], 0) || 1;
  for (const el of $('#ed-shots').querySelectorAll('.tac')) el.querySelector('.pct').textContent = Math.round((mix[el.dataset.mix] / tot) * 100) + '%';
  edChanged();
};
$('#ed-spot').onclick = (e) => {
  const s = e.target.dataset.s; if (!s) return;
  ed.tactics.spot = s; edChanged(); renderEditor();
};
$('#ed-presets').onclick = (e) => {
  const b = e.target.closest('[data-p]'); if (!b) return;
  const p = PRESETS[+b.dataset.p];
  if (!confirm(`Replace ${ed.name}'s settings with "${p.name}"? (name and colour stay)`)) return;
  ed.stats = clone(p.stats); ed.tactics = clone(p.tactics);
  // trim to budget if needed (budget always ≥ preset cost, but be safe)
  while (cost(ed) > budget()) { const k = STAT_KEYS.reduce((a, c) => (ed.stats[c] > ed.stats[a] ? c : a)); ed.stats[k]--; }
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
  const N = 40, me = clone(ed), opp = clone(o.ai);
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
  const A = clone(a), B = clone(b);
  if (A.color === B.color) B.color = COLORS.find((c) => c !== A.color && c !== '#f2f0ff') || '#3d8bff';
  ctxM = { A, B, info, seed: (Math.random() * 1e9) | 0 };
  M = new Match(A, B, ctxM.seed);
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
  if (s === 'skip') { while (!M.over) M.step(); return; }
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
  if (M.over) { if (!$('#result').hidden) return; setTimeout(showResult, 900); $('#result').hidden = false; $('#result').style.visibility = 'hidden'; return; }
  raf = requestAnimationFrame(frame);
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
    rw.textContent = S.beaten >= RIVALS.length ? '🏆 Ladder complete! +2 build points' : `Rival beaten! +${BUDGET_STEP} build points (now ${budget()})`;
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
  $('#r-tips').innerHTML = tips(m, A, B).slice(0, 3).map((t) => `<div>💡 ${t}</div>`).join('');
}

function tips(m, A, B) {
  const s = m.stats[0], o = m.stats[1], out = [];
  const g = (st, k) => st.byType[k][1];
  if (s.passes >= 5 && s.passesDone / s.passes < 0.35) out.push('Your passes keep getting cut out. More <b>Vision</b> picks better lanes — or set Back rods / Midfield toward Blast / Shoot.');
  if (s.fumbles >= 3) out.push(`${s.fumbles} fumbles. Raise <b>Ball control</b>, or lower Patience and Feints so rods hold the ball less.`);
  if (s.shots >= 6 && s.onTarget / s.shots < 0.7) out.push('Lots of shots off target. <b>Accuracy</b> helps, and Pull / Snake shots are wild without it.');
  if (s.shots >= 6 && o.blockedBy.GK + o.blockedBy.DEF >= s.shots * 0.5) out.push(`Their back line blocked ${o.blockedBy.GK + o.blockedBy.DEF} shots. Pull and Bank shots get around a set defence; Vision finds the gaps.`);
  const hurt = Object.keys(o.byType).filter((k) => g(o, k) >= 2).sort((a, b) => g(o, b) - g(o, a))[0];
  if (hurt === 'pull') out.push(`Their pull shots scored ${g(o, 'pull')}. <b>Reflexes</b> and <b>Rod speed</b> are what stop shots on the move.`);
  if (hurt === 'straight' && A.tactics.split < 0.5) out.push('Plain straight shots beat you. Try a more <b>Split</b> back line so goalie and defence cover different halves.');
  if (hurt === 'bank') out.push('Bank shots hurt you. Faster <b>Reflexes</b> help react after the wall bounce.');
  if (hurt === 'snake' || hurt === 'long') out.push('Their power shots were too quick. <b>Reflexes</b> buy reaction time; a Stack back line doubles up on the shot line.');
  if (A.tactics.discipline > 0.6 && B.tactics.read > 0.4) out.push('They were <b>reading</b> your signature spot. Lower Shot aim toward Anywhere to be less predictable.');
  if (B.tactics.feints > 0.6 && A.tactics.read > 0.5) out.push('A feinting opponent loves a reading defence. Slide Defence toward <b>React</b>.');
  if (cost(A) < budget()) out.push(`You have ${budget() - cost(A)} unspent build points!`);
  if (!out.length) out.push(m.winner === 0 ? 'Clean win. Try the next rival, or test changes in the Scrimmage lab.' : 'Close one. Use the Scrimmage lab to test a change over 40 matches before the rematch.');
  return out;
}

$('#r-home').onclick = () => { $('#result').hidden = true; M = null; show('home'); renderHome(); };
$('#r-again').onclick = () => { const { info } = ctxM; startMatch(bot(), info.rival >= 0 ? RIVALS[info.rival] : ctxM.B, info); };
$('#r-tune').onclick = () => { $('#result').hidden = true; M = null; openEditor(); };

renderHome();
show('home');
