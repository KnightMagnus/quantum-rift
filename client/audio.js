// Audio (WebAudio). Positional combat effects come from the EV Quantum sound pack; 2.0 adds generated interface sounds,
// ambient loops (open space, station interior, your engine) and a login-screen theme. Separate buses feed the mixer:
// master > effects | interface | ambience | music. The radio is an <audio> element with its own level (radio.js).
let ctx = null, master = null; const bus = {}; const buffers = new Map(), loading = new Map();
export let volume = 0.6;
let lv = { sfx: 1, ui: 0.8, amb: 0.5, music: 0.6 }, muted = false;
const level = () => muted ? 0 : volume;
export function unlock() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)(); master = ctx.createGain(); master.gain.value = level(); master.connect(ctx.destination);
    for (const k of ['sfx', 'ui', 'amb', 'music']) { bus[k] = ctx.createGain(); bus[k].gain.value = lv[k]; bus[k].connect(master); }
    if (pendingMusic) { pendingMusic = false; startMusic(); }
    if (wantAmb) setAmbience(wantAmb, true);
  } catch { ctx = null; }
}
export function setVolume(v) { volume = v; if (master) master.gain.value = level(); }
export function setMix(o) {
  if (o.vol != null) volume = o.vol; if (o.mute != null) muted = o.mute;
  for (const k of ['sfx', 'ui', 'amb', 'music']) if (o[k] != null) { lv[k] = o[k]; if (bus[k]) bus[k].gain.setTargetAtTime(o[k], ctx.currentTime, 0.05); }
  if (master) master.gain.value = level();
}
function load(id) {
  if (buffers.has(id) || loading.has(id) || !ctx) return loading.get(id);
  const url = typeof id === 'string' && /^[a-z]/.test(id) ? `assets/sfx/${id}${id.startsWith('amb_') || id.startsWith('music_') ? '.mp3' : '.wav'}` : `assets/sounds/${id}.wav`;
  const p = fetch(url).then(r => r.arrayBuffer()).then(b => ctx.decodeAudioData(b)).then(buf => { buffers.set(id, buf); return buf; }).catch(() => null);
  loading.set(id, p); return p;
}
let recent = 0, recentT = 0;
// positional combat effects (EV Quantum pack)
export function play(id, dx = 0, dy = 0, gain = 1) {
  if (!ctx || !id) return; load(id);
  const buf = buffers.get(id); if (!buf) return;
  const now = ctx.currentTime; if (now - recentT > 0.05) { recentT = now; recent = 0; } if (++recent > 6) return;   // don't stack dozens at once
  const d = Math.hypot(dx, dy), g = gain * Math.max(0, 1 - d / 1600); if (g < 0.03) return;
  const src = ctx.createBufferSource(); src.buffer = buf;
  const gn = ctx.createGain(); gn.gain.value = g;
  let node = gn;
  if (ctx.createStereoPanner) { const p = ctx.createStereoPanner(); p.pan.value = Math.max(-1, Math.min(1, dx / 900)); gn.connect(p); node = p; }
  src.connect(gn); node.connect(bus.sfx || master); src.start();
}
export function preload(ids) { if (!ctx) return; for (const id of ids) load(id); }

// ------------------------------------------------------------------ 2.0 interface sounds
const lastUi = {};
const UI_GAP = { hover: 0.04, click: 0.03, type: 0.02, toast: 0.25, chat: 0.15, lock: 0.08, pickup: 0.06, error: 0.2 };
export function ui(name, gain = 1, rate = 1) {
  if (!ctx) return; const id = 'ui_' + name; load(id); const buf = buffers.get(id); if (!buf) return;
  const now = ctx.currentTime; if (lastUi[name] && now - lastUi[name] < (UI_GAP[name] || 0.05)) return; lastUi[name] = now;
  const src = ctx.createBufferSource(); src.buffer = buf; src.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.04);
  const g = ctx.createGain(); g.gain.value = gain; src.connect(g); g.connect(bus.ui || master); src.start();
}
export function preloadUi() { if (!ctx) return; for (const n of ['click', 'hover', 'tab', 'open', 'close', 'error', 'buy', 'sell', 'toast', 'accept', 'complete', 'levelup', 'alert', 'lock', 'ping', 'chat', 'dock', 'undock', 'jump', 'arrive', 'autopilot', 'lowshield', 'pickup', 'hail', 'type']) load('ui_' + n); }

// ------------------------------------------------------------------ ambience: looping beds cross-faded so mp3 padding never clicks
let wantAmb = null; const ambNow = {};
function loopBed(id, gainNode) {   // schedules overlapping copies of the loop with 2 s cross-fades, forever, until stopped
  const st = { stop: false, srcs: [] };
  load(id).then(buf => {
    if (!buf || st.stop) return; const xf = 2, dur = buf.duration;
    const go = (when) => {
      if (st.stop) return;
      const src = ctx.createBufferSource(); src.buffer = buf; const g = ctx.createGain(); src.connect(g); g.connect(gainNode);
      g.gain.setValueAtTime(0, when); g.gain.linearRampToValueAtTime(1, when + xf); g.gain.setValueAtTime(1, when + dur - xf); g.gain.linearRampToValueAtTime(0, when + dur);
      src.start(when); src.stop(when + dur + 0.05); st.srcs.push(src); st.srcs = st.srcs.slice(-3);
      st.timer = setTimeout(() => go(when + dur - xf), Math.max(0, (when + dur - xf - ctx.currentTime - 1) * 1000));
    };
    go(ctx.currentTime + 0.05);
  });
  return st;
}
function bed(name, on, target = 1, fade = 1.5) {
  if (!ctx) return;
  let b = ambNow[name];
  if (on && !b) {
    const g = ctx.createGain(); g.gain.value = 0; let f = null;
    if (name === 'engine') { f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 400; f.Q.value = 0.7; g.connect(f); f.connect(bus.amb); } else g.connect(bus.amb);
    b = ambNow[name] = { g, f, loop: loopBed('amb_' + name, g) };
  }
  if (!b) return;
  b.g.gain.cancelScheduledValues(ctx.currentTime); b.g.gain.setTargetAtTime(on ? target : 0, ctx.currentTime, fade / 3);
  if (!on) { const k = b; delete ambNow[name]; setTimeout(() => { k.loop.stop = true; clearTimeout(k.loop.timer); for (const s of k.loop.srcs) try { s.stop(); } catch {} k.g.disconnect(); if (k.f) k.f.disconnect(); }, fade * 1000 + 300); }
}
// 'space' | 'station' | null
export function setAmbience(where, force) {
  if (where === wantAmb && !force) return; wantAmb = where; if (!ctx) return;
  bed('space', where === 'space', 0.35); bed('station', where === 'station', 0.45); bed('engine', where === 'space', 0.0001);
}
// engine hum follows your throttle (0 idle .. 1 thrust, 1.6 afterburner)
let engT = 0;
export function engine(level) {
  const b = ambNow.engine; if (!ctx || !b) return; const now = ctx.currentTime; if (now - engT < 0.08) return; engT = now;
  const L = Math.min(1.6, level); b.g.gain.setTargetAtTime(0.14 + 0.5 * L, now, 0.25); if (b.f) b.f.frequency.setTargetAtTime(380 + 1300 * L, now, 0.3);   // throttle opens the filter
}

// ------------------------------------------------------------------ music: the login screen only (in the game, the radio is the music)
let musicSrc = null, musicGain = null, pendingMusic = false;
export function startMusic() {
  if (!ctx) { pendingMusic = true; return; } if (musicSrc) return;
  load('music_login').then(buf => {
    if (!buf || musicSrc || !pendingMusicAllowed) return;
    musicGain = ctx.createGain(); musicGain.gain.value = 0; musicGain.connect(bus.music); musicGain.gain.linearRampToValueAtTime(0.9, ctx.currentTime + 3);
    musicSrc = ctx.createBufferSource(); musicSrc.buffer = buf; musicSrc.loop = true; musicSrc.connect(musicGain); musicSrc.start();
  });
}
let pendingMusicAllowed = true;
export function stopMusic(fade = 2.5) {
  pendingMusicAllowed = false; pendingMusic = false; if (!musicSrc || !ctx) return; const s = musicSrc, g = musicGain; musicSrc = null;
  g.gain.cancelScheduledValues(ctx.currentTime); g.gain.setValueAtTime(g.gain.value, ctx.currentTime); g.gain.linearRampToValueAtTime(0, ctx.currentTime + fade);
  setTimeout(() => { try { s.stop(); } catch {} g.disconnect(); }, fade * 1000 + 200);
}
export function debug() { return { ctx: ctx && ctx.state, amb: Object.keys(ambNow), music: !!musicSrc, buffers: buffers.size }; }
