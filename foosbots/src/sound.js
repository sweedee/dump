// Tiny WebAudio synth for table sounds. Everything is generated, no audio files.
let ac = null, master = null, noiseBuf = null;
let muted = false;
try { muted = localStorage.getItem('foosbots:muted') === '1'; } catch {}

export function unlock() {
  if (!ac) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    ac = new AC();
    master = ac.createGain();
    master.gain.value = muted ? 0 : 0.6;
    const comp = ac.createDynamicsCompressor();
    master.connect(comp); comp.connect(ac.destination);
    noiseBuf = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  if (ac.state === 'suspended') ac.resume();
}

export const isMuted = () => muted;
export function setMuted(m) {
  muted = m;
  try { localStorage.setItem('foosbots:muted', m ? '1' : '0'); } catch {}
  if (master) master.gain.setTargetAtTime(m ? 0 : 0.6, ac.currentTime, 0.02);
}

function env(g, t, a, peak, dec) {
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), t + a);
  g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
}

function tone(freq, { type = 'sine', vol = 0.3, a = 0.002, dec = 0.1, slide = 0, at = 0, pan = 0 } = {}) {
  const t = ac.currentTime + at;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, freq * slide), t + a + dec);
  env(g, t, a, vol, dec);
  o.connect(g); chain(g, pan);
  o.start(t); o.stop(t + a + dec + 0.05);
}

function noise({ vol = 0.3, a = 0.002, dec = 0.08, freq = 2000, q = 1, type = 'bandpass', at = 0, slide = 0, pan = 0 } = {}) {
  const t = ac.currentTime + at;
  const s = ac.createBufferSource(); s.buffer = noiseBuf;
  s.playbackRate.value = 0.5 + Math.random();
  const f = ac.createBiquadFilter(); f.type = type; f.frequency.setValueAtTime(freq, t); f.Q.value = q;
  if (slide) f.frequency.exponentialRampToValueAtTime(freq * slide, t + a + dec);
  const g = ac.createGain();
  env(g, t, a, vol, dec);
  s.connect(f); f.connect(g); chain(g, pan);
  s.start(t, Math.random() * 0.5); s.stop(t + a + dec + 0.05);
}

function chain(node, pan) {
  if (pan && ac.createStereoPanner) {
    const p = ac.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, pan));
    node.connect(p); p.connect(master);
  } else node.connect(master);
}

const SOUNDS = {
  // plastic foot on ball: sharp click + low thump, louder for harder shots
  shot: (v, pan) => {
    noise({ vol: 0.25 + 0.5 * v, dec: 0.03, freq: 3500, q: 0.8, pan });
    tone(160 + 120 * v, { type: 'triangle', vol: 0.35 + 0.4 * v, dec: 0.07, slide: 0.5, pan });
  },
  pass: (v, pan) => {
    noise({ vol: 0.18, dec: 0.025, freq: 3000, pan });
    tone(240, { type: 'triangle', vol: 0.2, dec: 0.05, slide: 0.6, pan });
  },
  // ball smacking a man: hollow wooden knock
  block: (v, pan) => {
    tone(420 + Math.random() * 120, { type: 'square', vol: 0.06 + 0.12 * v, dec: 0.04, slide: 0.7, pan });
    noise({ vol: 0.12 + 0.3 * v, dec: 0.035, freq: 1400, q: 3, pan });
  },
  wall: (v, pan) => {
    noise({ vol: 0.08 + 0.3 * v, dec: 0.05, freq: 700, q: 2, pan });
    tone(110, { type: 'sine', vol: 0.1 + 0.25 * v, dec: 0.08, slide: 0.7, pan });
  },
  post: (v, pan) => {
    tone(1250, { type: 'sine', vol: 0.25, dec: 0.5, pan });
    tone(1870, { type: 'sine', vol: 0.12, dec: 0.35, pan });
    noise({ vol: 0.2, dec: 0.03, freq: 4000, pan });
  },
  trap: (v, pan) => {
    noise({ vol: 0.08 + 0.12 * v, dec: 0.03, freq: 900, q: 2, pan });
    tone(90, { vol: 0.15, dec: 0.05, pan });
  },
  fumble: (v, pan) => {
    tone(300, { type: 'triangle', vol: 0.12, dec: 0.12, slide: 0.5, pan });
  },
  whistle: () => {
    tone(2800, { type: 'sine', vol: 0.12, a: 0.01, dec: 0.18 });
    tone(2950, { type: 'sine', vol: 0.06, a: 0.01, dec: 0.18 });
  },
  // ball dropping into the goal box, then a little crowd roar + fanfare for your bot
  goal: (v, pan, mine) => {
    tone(80, { type: 'sine', vol: 0.6, dec: 0.25, slide: 0.6 });
    noise({ vol: 0.4, dec: 0.12, freq: 500, q: 1 });
    noise({ vol: 0.22, a: 0.15, dec: 1.4, freq: 1100, q: 0.5, at: 0.05 });
    const notes = mine ? [523, 659, 784, 1047] : [392, 370, 349];
    notes.forEach((f, i) => tone(f, { type: mine ? 'square' : 'triangle', vol: 0.09, a: 0.005, dec: mine ? 0.18 : 0.3, at: 0.12 + i * (mine ? 0.09 : 0.16) }));
  },
  end: (v, pan, mine) => {
    [0, 0.25, 0.5].forEach((at, i) => tone(2800, { type: 'sine', vol: 0.12, a: 0.01, dec: i === 2 ? 0.6 : 0.15, at }));
    if (mine) [523, 659, 784, 1047, 1319].forEach((f, i) => tone(f, { type: 'square', vol: 0.08, dec: 0.25, at: 0.9 + i * 0.11 }));
  },
  click: () => tone(900, { type: 'triangle', vol: 0.08, dec: 0.03 }),
  star: (v) => tone(500 + v * 120, { type: 'triangle', vol: 0.12, dec: 0.09 }),
};

const last = {};
// Play a cue from the sim. `pan` is -1..1 across the screen; `mine` = the event favours your bot.
export function play(k, v = 1, pan = 0, mine = false) {
  if (!ac || muted || ac.state !== 'running') return;
  const now = ac.currentTime;
  const gap = k === 'block' || k === 'wall' ? 0.035 : 0.015;
  if (last[k] && now - last[k] < gap) return; // avoid machine-gun stacking at 4×
  last[k] = now;
  const fn = SOUNDS[k];
  if (fn) fn(Math.max(0, Math.min(1, v)), pan, mine);
}
