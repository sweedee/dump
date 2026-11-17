// Canvas renderer. Draws in table coordinates through a transform, so the table can be
// shown vertically (phones in portrait: your bot attacks upward) or horizontally.
import { L, W, BALL_R, GOAL_LO, GOAL_HI } from './sim.js';

const FRAME = 34;

export function makeRenderer(canvas) {
  const ctx = canvas.getContext('2d');
  let vertical = true, scale = 1, cw = 0, ch = 0;
  const trail = [];

  function resize() {
    const box = canvas.parentElement.getBoundingClientRect();
    const availW = Math.max(100, box.width - 16), availH = Math.max(100, box.height - 8);
    const TW = W + FRAME * 2, TL = L + FRAME * 2;
    const sV = Math.min(availW / TW, availH / TL);
    const sH = Math.min(availW / TL, availH / TW);
    vertical = sV >= sH;
    scale = vertical ? sV : sH;
    cw = Math.floor((vertical ? TW : TL) * scale);
    ch = Math.floor((vertical ? TL : TW) * scale);
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    canvas.width = cw * dpr; canvas.height = ch * dpr;
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px';
    canvas._dpr = dpr;
  }

  function setTable() {
    const s = scale * canvas._dpr, f = FRAME * s;
    // vertical: sx = f + y*s, sy = f + (L - x)*s
    if (vertical) ctx.setTransform(0, -s, s, 0, f, f + L * s);
    else ctx.setTransform(s, 0, 0, s, f, f);
  }

  function rr(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawTable() {
    // frame
    ctx.fillStyle = '#3a2618';
    rr(-FRAME, -FRAME, L + FRAME * 2, W + FRAME * 2, 26); ctx.fill();
    ctx.fillStyle = '#4b3220';
    rr(-FRAME + 6, -FRAME + 6, L + FRAME * 2 - 12, W + FRAME * 2 - 12, 20); ctx.fill();
    // goals
    ctx.fillStyle = '#05080b';
    ctx.fillRect(-FRAME + 4, GOAL_LO, FRAME - 4, GOAL_HI - GOAL_LO);
    ctx.fillRect(L, GOAL_LO, FRAME - 4, GOAL_HI - GOAL_LO);
    // pitch with stripes
    ctx.fillStyle = '#1f7a45';
    ctx.fillRect(0, 0, L, W);
    ctx.fillStyle = '#22844b';
    for (let i = 0; i < 8; i++) if (i % 2) ctx.fillRect(i * 150, 0, 150, W);
    ctx.strokeStyle = '#ffffff55'; ctx.lineWidth = 4;
    ctx.strokeRect(2, 2, L - 4, W - 4);
    ctx.beginPath(); ctx.moveTo(L / 2, 0); ctx.lineTo(L / 2, W); ctx.stroke();
    ctx.beginPath(); ctx.arc(L / 2, W / 2, 90, 0, Math.PI * 2); ctx.stroke();
    ctx.strokeRect(2, 170, 150, W - 340); ctx.strokeRect(L - 152, 170, 150, W - 340);
    ctx.strokeRect(2, GOAL_LO - 20, 50, GOAL_HI - GOAL_LO + 40); ctx.strokeRect(L - 52, GOAL_LO - 20, 50, GOAL_HI - GOAL_LO + 40);
    ctx.fillStyle = '#ffffff55';
    ctx.beginPath(); ctx.arc(L / 2, W / 2, 6, 0, Math.PI * 2); ctx.fill();
  }

  function drawRod(m, r, color, owned) {
    // bar
    ctx.strokeStyle = '#c5ccd3'; ctx.lineWidth = 7;
    ctx.beginPath(); ctx.moveTo(r.x, -FRAME + 4); ctx.lineTo(r.x, W + FRAME - 4); ctx.stroke();
    ctx.strokeStyle = '#ffffff66'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(r.x - 1.5, -FRAME + 4); ctx.lineTo(r.x - 1.5, W + FRAME - 4); ctx.stroke();
    const lifted = r.lift > 0.07;
    const kick = r.kickT > 0 ? Math.sin((1 - r.kickT / 0.16) * Math.PI) : 0;
    for (let i = 0; i < r.n; i++) {
      const y = m.manY(r, i);
      ctx.globalAlpha = lifted ? 0.45 : 1;
      // shadow
      ctx.fillStyle = '#0005';
      rr(r.x - 11 + 5, y - 17 + 5, 22, 34, 8); ctx.fill();
      // foot (swings forward on a kick)
      const fx = r.x + r.dir * (14 + kick * 26);
      ctx.fillStyle = shade(color, -0.35);
      rr(Math.min(r.x, fx) - 6, y - 9, Math.abs(fx - r.x) + 12, 18, 7); ctx.fill();
      // body
      ctx.fillStyle = color;
      rr(r.x - 11, y - 17, 22, 34, 8); ctx.fill();
      ctx.fillStyle = shade(color, 0.35);
      ctx.beginPath(); ctx.arc(r.x, y, 8.5, 0, Math.PI * 2); ctx.fill();
      if (owned === i) {
        ctx.strokeStyle = '#fff'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.arc(r.x, y, 22, 0, Math.PI * 2); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
  }

  function draw(m, colors) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setTable();
    drawTable();
    const b = m.ball;
    // ball trail
    const sp = Math.hypot(b.vx, b.vy);
    trail.push({ x: b.x, y: b.y, s: sp });
    if (trail.length > 10) trail.shift();
    for (let i = 1; i < trail.length; i++) {
      const p = trail[i - 1], q = trail[i];
      if (q.s < 1800) continue;
      ctx.strokeStyle = `rgba(255,255,255,${(i / trail.length) * 0.35})`;
      ctx.lineWidth = BALL_R * 1.6 * (i / trail.length);
      ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
    }
    // rods: draw lifted ones first so active blockers sit on top
    const rods = [...m.rods[0], ...m.rods[1]].sort((a, c) => (c.lift > 0) - (a.lift > 0));
    for (const r of rods) {
      const own = b.owner && b.owner.team === r.team && b.owner.rod === r.idx ? b.owner.man : -1;
      drawRod(m, r, colors[r.team], own);
    }
    // ball
    if (b.x > -BALL_R * 1.5 && b.x < L + BALL_R * 1.5) {
      ctx.fillStyle = '#0006';
      ctx.beginPath(); ctx.arc(b.x + 5, b.y + 5, BALL_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#fafafa';
      ctx.beginPath(); ctx.arc(b.x, b.y, BALL_R, 0, Math.PI * 2); ctx.fill();
      ctx.fillStyle = '#d8d8d8';
      ctx.beginPath(); ctx.arc(b.x + 4, b.y + 4, BALL_R * 0.55, 0, Math.PI * 2); ctx.fill();
    }
  }

  return { resize, draw, clearTrail: () => (trail.length = 0), get vertical() { return vertical; } };
}

export function shade(hex, k) {
  const n = parseInt(hex.slice(1), 16);
  let r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const f = (c) => Math.round(k < 0 ? c * (1 + k) : c + (255 - c) * k);
  r = f(r); g = f(g); b = f(b);
  return '#' + ((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1);
}
