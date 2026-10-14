// Quantum Rift client: connection, input, client-side prediction, render loop.
import { SYS, STELLARS, FACTIONS, FACTION_HULLS } from '/shared/galaxy.js';
import { TUTORIAL } from '/shared/tutorial.js';
import { step, DT, TICK, hostileFactions, weaponColor, augmentAssets, K, wrap } from '/shared/rules.js';
import { draw, radar, boom, spark, flash, blast, shieldHit, dmgNumber, addShake, cam, FAC } from './render.js';
import * as audio from './audio.js';
import { setRadioLevel } from './radio.js';
window.RiftAudio = audio;   // for tests and the curious
import { infoHtml } from './info_ui.js';
import { boardHtml } from './hangar_ui.js';
import { ANOMALIES } from '/shared/fronts.js';
import { arenaSystem } from '/shared/frontier.js';
import { refreshStores } from './ui.js';
import { initUI, hud, toast, chatLine, showLanded, hideLanded, renderLanded, refreshCompanion, drawMini, openMap, closeMap, plot, showDead, ctab } from './ui.js';

const $ = (id) => document.getElementById(id);
const G = window.G = {
  A: null, you: null, sys: null, landed: null, view: null, ents: new Map(), shots: [], beams: [], loot: [], target: 0, zoom: 1, spriteScale: 1.25,
  route: [], navStellar: null, ammo: {}, FAC, ctab: 'missions', ltab: null, myId: 0, myHull: 0, hover: 0,
  opts: Object.assign({ dmg: true, shake: true, mouseAim: false, notify: false, cb: false, scale: 1, vol: 0.35, sfx: 0.75, radio: 0.8, ui: 0.55, amb: 0.35, music: 0.45, mute: false, keys: {} }, (() => { try { return JSON.parse(localStorage.getItem('rift.opts') || '{}'); } catch { return {}; } })()),
  hostile(e) {
    if (!e || !G.you) return false; if (e.owner === G.myId || e.id === G.myId) return false;
    const f = FAC[e.fac]; if (e.fl & 16) return SYS[G.sys] && SYS[G.sys].danger >= 3;
    if (G.arena && e.fl & 16) return !!e.name && !e.name.startsWith(G.arena.team === 'A' ? 'Azure' : 'Crimson');
    if (e.fl & 16 && G.you.fleet && e.name && e.name.startsWith(`[${G.you.fleet.tag}] `)) return false;
    const F = FACTIONS[f]; if (!F) return false; if (F.alwaysHostile) return true; const rep = G.you.rep[f] || 0;
    return F.pirate ? rep < 30 : rep <= -30;
  },
};
// 1.0 accessibility: palettes, key bindings, UI scale
const PALETTES = { normal: { own: '#3fd36b', player: '#5ad0ff', hostile: '#ff3a2a', neutral: '#c8c060', friend: '#7ad0ff' },
                   cb: { own: '#ffffff', player: '#4aa8ff', hostile: '#ff9f1a', neutral: '#9a9a9a', friend: '#4aa8ff' } };   // blue/orange: safe for red-green colour blindness
G.pal = PALETTES[G.opts.cb ? 'cb' : 'normal'];
export const ACTIONS = [['thrust', 'Thrust', 'KeyW'], ['left', 'Turn left', 'KeyA'], ['right', 'Turn right', 'KeyD'], ['rev', 'Reverse', 'KeyS'], ['ab', 'Afterburner', 'ShiftLeft'],
  ['fire1', 'Fire primary', 'Space'], ['fire2', 'Fire secondary (tap to launch or recall drones)', 'KeyF'], ['target', 'Next target', 'Tab'], ['nearest', 'Nearest hostile', 'KeyR'], ['land', 'Land', 'KeyL'],
  ['jump', 'Hyperjump', 'KeyJ'], ['map', 'Galaxy map', 'KeyM'], ['board', 'Board', 'KeyB'], ['zoomin', 'Zoom in', 'KeyZ'], ['zoomout', 'Zoom out', 'KeyX'], ['pause', 'Pause (solo)', 'KeyP'], ['mute', 'Mute sound', 'KeyN'], ['hail', 'Hail target / planet', 'KeyT'], ['info', 'Ship and captain info', 'KeyI'], ['face', 'Turn to face target (hold)', 'KeyE'], ['stop', 'Full stop', 'KeyQ'],
  ['ordAttack', 'Fleet: attack my target', 'KeyK'], ['ordGather', 'Fleet: form up', 'KeyG'], ['ordHold', 'Fleet: hold position', 'KeyH'], ['ordFire', 'Fleet: hold fire', 'KeyY'], ['ordLoot', 'Fleet: collect loot', 'KeyU'], ['companion', 'Next companion tab', 'KeyC']];
const ALT = { thrust: 'ArrowUp', left: 'ArrowLeft', right: 'ArrowRight', rev: 'ArrowDown', ab: 'ShiftRight' };   // the arrow keys always work too
const bound = (a) => G.opts.keys[a] || ACTIONS.find(x => x[0] === a)[2];
const held = (a) => !!(keys[bound(a)] || (ALT[a] && keys[ALT[a]]));
const actionOf = (code) => { for (const [a] of ACTIONS) if (bound(a) === code || ALT[a] === code) return a; return null; };
if (!G.opts.v21) { G.opts.v21 = true; G.opts.vol = Math.min(G.opts.vol, 0.35); G.opts.ui = Math.min(G.opts.ui ?? 0.55, 0.55); G.opts.amb = Math.min(G.opts.amb ?? 0.35, 0.35); try { localStorage.setItem('rift.opts', JSON.stringify(G.opts)); } catch {} }   // 2.1: quieter defaults, applied once to older settings
function saveOpts() { try { localStorage.setItem('rift.opts', JSON.stringify(G.opts)); } catch {} }
function applyOpts() {
  G.pal = PALETTES[G.opts.cb ? 'cb' : 'normal'];
  document.documentElement.style.setProperty('--ui', G.opts.scale); document.body.classList.toggle('scaled', G.opts.scale !== 1);
  audio.setMix({ vol: G.opts.vol, sfx: G.opts.sfx, ui: G.opts.ui ?? 0.8, amb: G.opts.amb ?? 0.5, music: G.opts.music ?? 0.6, mute: G.opts.mute });
  setRadioLevel(G.opts.mute ? 0 : G.opts.vol * G.opts.radio, G.opts.radio);   // 1.0.3: the radio is in the mixer
}
applyOpts();
// loading screen: warm the browser cache with the common ship sprites and station art while the login is shown
(function preloadArt() {
  const hulls = [...new Set(Object.values(FACTION_HULLS).flat())];
  const urls = [...hulls.map(h => `assets/ships/${h}.png`), ...[0, 1, 2, 3, 4, 5].map(k => `assets/stations/${k}.png`), 'assets/hub.png', 'assets/wormhole.png'];
  let n = 0; const done = () => { n++; $('lloadbar').style.width = (100 * n / urls.length) + '%'; $('lloadt').textContent = `Loading ships… ${n} / ${urls.length}`; if (n >= urls.length) $('lload').classList.add('done'); };
  for (const u of urls) { const im = new Image(); im.onload = im.onerror = done; im.src = u; }
  setTimeout(() => $('lload').classList.add('done'), 20000);
})();
const canvas = $('view'), ctx = canvas.getContext('2d'), rctx = $('radar').getContext('2d');
let ws = null, seq = 0, history = [], keys = {}, lastSnapT = 0;
function send(m) { if (ws && ws.readyState === 1) ws.send(JSON.stringify(m)); }

// ------------------------------------------------------------------ login and connection
$('lbtn').onclick = login;
// 2.0: the login theme starts on the first click or key on the login screen (browsers block sound until then)
const loginMusic = () => { if ($('login').classList.contains('hidden')) return; audio.unlock(); audio.startMusic(); window.removeEventListener('pointerdown', loginMusic, true); window.removeEventListener('keydown', loginMusic, true); };
$('musicbtn').onclick = (e) => { e.stopPropagation(); audio.unlock(); if ((G.opts.music ?? 0.6) > 0) { G.opts.musicWas = G.opts.music ?? 0.6; G.opts.music = 0; } else G.opts.music = G.opts.musicWas || 0.6; applyOpts(); saveOpts(); $('musicbtn').classList.toggle('off', !G.opts.music); audio.startMusic(); };
$('musicbtn').classList.toggle('off', (G.opts.music ?? 0.6) === 0);
window.addEventListener('pointerdown', loginMusic, true); window.addEventListener('keydown', loginMusic, true);
// 2.0: interface sounds for every button, tab and chip
document.addEventListener('click', (e) => {
  const b = e.target.closest('button, .btn, .chip, .card[data-act], .it, a[data-act], #ctabs button, #ltabs button'); if (!b || b.disabled) return;
  audio.unlock(); const act = b.dataset.act;
  if (b.closest('#ltabs, #ctabs, .itabs, #gmodes, #cchan, #itabs') || act === 'stab' || act === 'rtree') return audio.ui('tab', 0.7);
  if (act === 'trade') return audio.ui(+b.dataset.q > 0 ? 'buy' : 'sell', 0.7);
  if (act === 'sellall') return audio.ui('sell', 0.8);
  if (act === 'buyship' || act === 'bm' || act === 'buystore' || (act === 'outfit' && +b.dataset.n > 0) || act === 'mat' && +b.dataset.q > 0) return audio.ui('buy', 0.7);
  if (act === 'outfit' && +b.dataset.n < 0) return audio.ui('sell', 0.7);
  if (act === 'accept' || act === 'arcopen' || b.id === 'storyyes') return audio.ui('accept', 0.7);
  if (act === 'promote' || act === 'lower') return audio.ui('levelup', 0.6);
  audio.ui('click', 0.8);
}, true);
document.addEventListener('mouseover', (e) => { const b = e.target.closest && e.target.closest('.btn:not(:disabled), button:not(:disabled), .chip'); if (b && b !== G._hoverBtn) { G._hoverBtn = b; audio.ui('hover', 0.5); } else if (!b) G._hoverBtn = null; });
$('lpass').onkeydown = (e) => { if (e.key === 'Enter') login(); };
try { $('lname').value = localStorage.getItem('rift.name') || ''; } catch {}
fetch('/api/status').then(r => r.json()).then(s => { $('lstat').textContent = `${s.players} captain${s.players === 1 ? '' : 's'} in the Rift right now.`; $('lver').textContent = 'Quantum Rift v' + s.version; if (s.solo) soloLogin(s); }).catch(() => {});
// solo mode: no passwords; pick a save slot, start a new captain, or load a save file
function soloLogin(s) {
  G.solo = true; document.body.classList.add('solo'); $('chatin').placeholder = 'Write a note in your log (Enter)'; $('lpass').classList.add('hidden'); $('lstat').textContent = 'Solo game: your saves live on this computer.';
  $('lname').placeholder = 'New captain name'; $('lbtn').textContent = 'START NEW CAPTAIN';
  const L = $('lslots'); L.classList.remove('hidden');
  L.innerHTML = `<div class="solotag">YOUR CAPTAINS</div>` + (s.slots.length ? s.slots.map(c => `<div class="slot"><div class="n"><b>${c.name.replace(/[<>&]/g, '')}</b><div class="dim small">${c.ship} · ${Math.round(c.credits).toLocaleString()} cr${c.ops ? ' · Ops ' + c.ops : ''} · ${c.sys}</div></div><a href="/api/export?name=${encodeURIComponent(c.name)}" download>EXPORT</a><button class="btn sm" data-slot="${c.name.replace(/"/g, '')}">PLAY</button></div>`).join('') : '<div class="dim small">No captains yet: name one above and start.</div>')
    + `<label class="btn sm" style="display:inline-flex;align-items:center;justify-content:center">LOAD A SAVE FILE<input type="file" id="limport" accept=".json" style="display:none"></label>`;
  L.querySelectorAll('[data-slot]').forEach(b => b.onclick = () => { $('lname').value = b.dataset.slot; login(); });
  $('limport').onchange = async (e) => { const f = e.target.files[0]; if (!f) return; const r = await fetch('/api/import', { method: 'POST', body: await f.text() }); const j = await r.json(); if (!j.ok) $('lerr').textContent = j.error; else location.reload(); };
}
async function login() {
  audio.unlock();
  const name = $('lname').value.trim(), pass = G.solo ? '' : $('lpass').value;
  $('lerr').textContent = ''; $('lbtn').disabled = true;
  if (!G.A) { const was = $('lstat').textContent; $('lstat').textContent = 'Loading the galaxy...'; G.A = augmentAssets(await (await fetch('/shared/assets.json')).json()); initUI(G, send); $('lstat').textContent = was; }   // 1.0.3: the status line comes back if login fails
  try { localStorage.setItem('rift.name', name); } catch {}
  G._cred = { name, pass }; G._kicked = false; openSocket(0);
}
// 2.4: a dropped connection reconnects on its own, signing back in as the same captain
function openSocket(tries) {
  const { name, pass } = G._cred;
  ws = new WebSocket((location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws');
  ws.onopen = () => send({ t: 'hello', name, pass });
  ws.onmessage = (ev) => onMessage(JSON.parse(ev.data));
  ws.onclose = () => {
    $('lbtn').disabled = false; if (!G.you) return;
    if (!G._kicked && tries < 30) { if (!tries) toast('Connection lost. Reconnecting...'); $('lstat').textContent = 'Reconnecting to the server...'; setTimeout(() => openSocket(tries + 1), Math.min(8000, 1000 + tries * 700)); return; }
    $('login').classList.remove('hidden'); $('lerr').textContent = G._kicked ? 'Signed in somewhere else.' : 'Disconnected from the server. Sign in again when it is back.';
  };
  ws.onerror = () => { if (!G.you) { $('lerr').textContent = 'Could not reach the Quantum Rift server.'; $('lbtn').disabled = false; } };
}
function onMessage(m) {
  switch (m.t) {
    case 'error': $('lerr').textContent = m.msg; $('lbtn').disabled = false; toast(m.msg); if (/somewhere else/.test(m.msg)) G._kicked = true; break;
    case 'welcome': audio.stopMusic(); audio.preloadUi(); $('login').classList.add('hidden'); G.myName = m.name; toast(G.you ? 'Reconnected.' : `Welcome to Quantum Rift, Captain ${m.name}.`);
      break;
    case 'you': {
      const first = !G.you; G.you = m.d; G.sys = m.d.sys;
      for (const [w, n] of Object.entries(m.d.ship.ammo || {})) if (!G.view) G.ammo[w] = n;
      if (G.landed) renderLanded(); refreshCompanion(); refreshStores(); if (first) ctab('missions'); renderTut();
      break;
    }
    case 'landed': if (!G.landed) audio.ui('dock', 0.8); audio.setAmbience('station'); setAuto(null); G.landed = m; G.view = null; G.ents.clear(); G.shots = []; G.beams = []; G.loot = []; G.target = 0; history = []; showLanded(); refreshCompanion();
      audio.play(10110, 0, 0, 0.5); break;
    case 'space': if (String(m.sys).startsWith('arena-') && !SYS[m.sys]) SYS[m.sys] = arenaSystem(m.sys);
      { const fromSpace = !!G.view && !G.landed; if (G.landed) audio.ui('undock', 0.8); else if (fromSpace) { audio.ui('arrive', 0.8); G._arriveT = performance.now(); G._jumping = false; } audio.setAmbience('space'); const go = G.autoRoute; G.autoKeep = true; setAuto(null); G.autoRoute = go; } G.landed = null; hideLanded(); G.sys = m.sys; G.myId = m.id; G.view = null; G.ents.clear(); G.shots = []; G.beams = []; history = [];
      G.rocks = (m.rocks || []).map(([id, x, y, r, ore, hp]) => ({ id, x, y, r, ore, hp })); G.rockById = new Map(G.rocks.map(k => [k.id, k]));
      if (G.route.length && G.route[0] === m.sys) G.route.shift(); drawMini();
      if (G.autoRoute && G.route.length) setTimeout(() => { if (G.autoRoute && G.view && G.route.length && !G.auto) { G.autoKeep = true; setAuto({ mode: 'jump' }, `Autopilot: next jump to ${SYS[G.route[0]].name}.`); } }, 1500); else G.autoRoute = false;
      { const an = G.world && G.world.anomalies && G.world.anomalies[m.sys]; if (an && ANOMALIES[an]) toast(`${ANOMALIES[an].icon} ${ANOMALIES[an].name}: ${ANOMALIES[an].desc}`); }
      G.navStellar = SYS[m.sys].stellars.find(p => p.svc.includes('L')) ? SYS[m.sys].stellars.find(p => p.svc.includes('L')).id : null; break;
    case 'snap': onSnap(m); break;
    case 'toast': toast(m.msg); break;
    case 'paused': G.paused = m.on; $('pausebox').classList.toggle('hidden', !m.on); break;
    case 'chat': chatLine(m); if (m.from && m.from !== G.myName) audio.ui('chat', 0.7); break;
    case 'story': showStory(m); break;
    case 'hail': if ($('hailbox').classList.contains('hidden')) audio.ui('hail'); showHail(m); break;                       // 1.1
    case 'order': G.order = m.o; break;
    case 'rivals': G.rivals = m.list; if (!$('infobox').classList.contains('hidden')) renderInfo(); break;
    case 'world': G.world = m; drawMini(); refreshCompanion(); break;
    case 'arena': if (m.id) { SYS[m.id] = SYS[m.id] || arenaSystem(m.id); G.arena = m; } else G.arena = null; break;
    case 'boards': G.boards = G.boards || {}; G.boards[m.cat] = m.list; if (G.landed) renderLanded(); break;
    case 'profile': G.prof = m.p; if (!m.p) toast('No captain by that name.'); if (G.landed) renderLanded(); break;
    case 'notify': if (G.opts.notify && document.hidden && window.Notification && Notification.permission === 'granted') { try { new Notification('Quantum Rift: ' + m.title, { body: m.body, icon: 'assets/stations/5.png' }); } catch {} } break;
    case 'sites': G.sites = m.sites; if (G.landed) showLanded(); refreshCompanion(); break;
    case 'dead': setAuto(null); showDead(m); audio.play(10115); break;
  }
}

const storyQ = [];
function showStory(m) {
  if (!$('storybox').classList.contains('hidden')) { storyQ.push(m); return; }   // one pop-up at a time: the rest wait their turn
  $('storyt').textContent = m.title; $('storyx').textContent = m.text; document.querySelector('#storybox .storytag').textContent = m.tag || 'STORY';
  $('storyb').innerHTML = m.done ? '<button class="btn" id="storyok">CONTINUE</button>' : `<button class="btn sm" id="storyno">${m.ref || 'Not now'}</button><button class="btn" id="storyyes">${m.acc || 'Accept'}</button>`;
  $('storybox').classList.remove('hidden'); audio.ui(m.done ? 'complete' : 'ping', 0.7);
  const close = () => { $('storybox').classList.add('hidden'); if (storyQ.length) setTimeout(() => showStory(storyQ.shift()), 150); };
  if (m.done) $('storyok').onclick = close; else { $('storyno').onclick = close; $('storyyes').onclick = () => { send(m.arc ? { t: 'arcacc', fac: m.arc } : { t: 'storyacc', id: m.id }); close(); }; }
}
window.addEventListener('rift-story', (e) => showStory(e.detail));
window.addEventListener('rift-toast-sound', (e) => audio.ui(e.detail, e.detail === 'complete' || e.detail === 'alert' ? 0.8 : 0.55));
setInterval(() => { if (G.ctab === 'missions') drawMini(); }, 10000);   // keeps rush countdowns current
// ------------------------------------------------------------------ snapshots and prediction
function onSnap(m) {
  const now = performance.now(); lastSnapT = now;
  const [id, ack, x, y, vx, vy, a, sh, ar, fu, tgt, ammo] = m.me;
  G.myId = id;
  const seen = new Set();
  for (const r of m.ships) {
    const [eid, hull, ex, ey, ea, evx, evy, fl, esh, ear, fac, name, owner, pw] = r; seen.add(eid);
    let e = G.ents.get(eid);
    if (!e) { e = { id: eid, rx: ex, ry: ey }; G.ents.set(eid, e); }
    Object.assign(e, { hull, x: ex, y: ey, a: ea / 1000, vx: evx, vy: evy, fl, sh: esh, ar: ear, fac, name, owner, pw, t: now });
    if (Math.hypot(e.rx - ex, e.ry - ey) > 400) { e.rx = ex; e.ry = ey; }
  }
  for (const k of [...G.ents.keys()]) if (!seen.has(k)) G.ents.delete(k);
  G.shots = m.shots.map(([sx, sy, svx, svy, w]) => ({ x: sx, y: sy, vx: svx, vy: svy, w, t: now }));
  G.beams = m.beams.map(([bid, ba, len, w]) => ({ id: bid, a: ba, len, w }));
  G.loot = m.loot.map(([lid, lx, ly, kind]) => ({ id: lid, x: lx, y: ly, kind }));
  for (const [w, n] of ammo) G.ammo[w] = n;
  if (!G.target || !G.ents.has(G.target)) G.target = tgt && G.ents.has(tgt) ? tgt : (G.target && !G.ents.has(G.target) ? 0 : G.target);
  // reconcile own ship: take the server state, replay inputs it has not seen yet
  const me0 = G.ents.get(id); if (me0) G.myHull = me0.hull;
  const v = G.view || { id, rx: x, ry: y, ox: 0, oy: 0 };
  const prevX = G.view ? G.view.x : x, prevY = G.view ? G.view.y : y;
  Object.assign(v, { id, x, y, vx, vy, a, shield: sh, armor: ar, fuel: fu, fl: me0 ? me0.fl : 0 });
  history = history.filter(h => h.seq > ack);
  const st = G.you && G.you.shipStats;
  if (st && me0 && !(me0.fl & 8)) for (const h of history) step(v, st, h.inp);
  if (G.view) { v.ox += prevX - v.x; v.oy += prevY - v.y; if (Math.hypot(v.ox, v.oy) > 300) v.ox = v.oy = 0; }
  G.view = v;
  { // 2.0 audio feedback: low shields, target lock, jump
    const st2 = G.you && G.you.shipStats, shp = st2 ? v.shield / Math.max(1, st2.shield) : 1;
    if (shp < 0.25 && !G._lowSh && v.armor < (st2 ? st2.armor : 1)) { G._lowSh = true; audio.ui('lowshield'); } else if (shp > 0.45) G._lowSh = false;
    if (G.target && G.target !== G._lastTgt) audio.ui('lock', 0.7); G._lastTgt = G.target;
    if ((v.fl & 8) && !G._jumping) { G._jumping = true; G._jumpStart = performance.now(); audio.ui(G.you && G.you.shipStats && G.you.shipStats.jumpFast ? 'jumpfast' : 'jump', 0.9); } else if (!(v.fl & 8) && G._jumping && performance.now() - G._jumpStart > 2500) G._jumping = false;   // 2.1: the jump event usually starts it first
    if (G._lastAr != null && v.armor < G._lastAr - 0.5) { G._hurtT = performance.now(); } G._lastAr = v.armor;
  }
  for (const ev of m.ev) onEvent(ev);
}
function onEvent(ev) {
  const me = G.view, dx = me ? ev[1] - me.x : 0, dy = me ? ev[2] - me.y : 0;
  switch (ev[0]) {
    case 'snd': audio.play(ev[1], ev[2] - (me ? me.x : 0), ev[3] - (me ? me.y : 0), 0.55); break;
    case 'boom': { boom(ev[1], ev[2], ev[3]); audio.play(ev[3] > 120 ? 10115 : 241, dx, dy, 0.8); const d = Math.hypot(dx, dy); if (d < 900) addShake(Math.min(10, ev[3] / 25) * (1 - d / 900)); break; }
    case 'hit': {
      spark(ev[1], ev[2], weaponColor(G.A.weapons[ev[3]]));
      if (ev.length > 4) {
        const [, x, y, , tid, dmg, src, sh] = ev;
        if (sh) shieldHit(tid, x, y);
        if (G.opts.dmg && (src === G.myId || tid === G.myId)) dmgNumber(x, y - 10, dmg, src === G.myId);
        if (tid === G.myId) addShake(Math.min(4, 1 + dmg / 60));
      }
      break;
    }
    case 'blast': blast(ev[1], ev[2], ev[3]); break;
    case 'rock': { const k = G.rockById && G.rockById.get(ev[1]); if (k) k.hp = ev[2]; break; }
    case 'flash': flash(ev[1], ev[2]); if (Math.hypot(dx, dy) > 80) audio.play('jumpfar', dx, dy, 0.8); break;   // 2.1: your own jump has its own sound
    case 'jump': if (ev[1] === G.myId && !G._jumping) { G._jumping = true; G._jumpStart = performance.now(); audio.ui(G.you && G.you.shipStats && G.you.shipStats.jumpFast ? 'jumpfast' : 'jump', 0.9); } break;   // 2.1: the spool starts the moment the server begins your jump
    case 'pickup': audio.play(10112, 0, 0, 0.6); break;
    case 'flee': if (ev[1] === G.target) { const e = G.ents.get(ev[1]); toast(`${(e && e.name) || (e && G.A.ships[e.hull] ? 'The ' + G.A.ships[e.hull].name : 'Your target')} breaks off and runs for the jump point!`); } break;   // 2.4
  }
}

// ------------------------------------------------------------------ input
const typing = () => document.activeElement && (document.activeElement.tagName === 'INPUT');
window.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && G.you) { const c = $('chatin'); if (document.activeElement === c) { sendChat(); c.blur(); } else if (!typing()) { c.focus(); } e.preventDefault(); return; }
  if (typing()) { if (e.key === 'Escape') document.activeElement.blur(); return; }
  if (!G.you) return;
  audio.unlock();
  keys[e.code] = true;
  if (['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) || actionOf(e.code)) e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape') { closeMap(); G.target = 0; send({ t: 'target', id: 0 }); return; }
  if (e.code === 'KeyO') { openOpts(); return; }
  if (G.landed && actionOf(e.code) === 'land' && !$('depart').disabled) { send({ t: 'depart' }); return; }   // 1.0.3: L leaves the dock too
  if (G.landed && /^Digit[1-9]$/.test(e.code) && G._ltabs) { const k = G._ltabs[+e.code.slice(5) - 1]; if (k) { G.ltab = k; G.sel = null; showLanded(); audio.ui('tab', 0.7); } return; }   // 2.0: number keys pick landing tabs
  if (e.key === '?' || e.code === 'F1') { e.preventDefault(); openControls(); return; }
  switch (actionOf(e.code)) {
    case 'target': cycleTarget(e.shiftKey ? -1 : 1); break;
    case 'nearest': nearestHostile(); break;
    case 'land': landRequest(); break;
    case 'map': $('gmap').classList.contains('hidden') ? openMap() : closeMap(); break;
    case 'jump': jumpNext(); break;
    case 'zoomin': G.zoom = Math.min(2, G.zoom * 1.15); break;
    case 'zoomout': G.zoom = Math.max(0.35, G.zoom / 1.15); break;
    case 'pause': if (G.solo) send({ t: 'pause' }); break;
    case 'mute': G.opts.mute = !G.opts.mute; applyOpts(); saveOpts(); volUi(); toast(G.opts.mute ? 'Sound muted (N to unmute).' : 'Sound on.'); break;   // 2.1
    case 'board': openBoard(); break;
    case 'hail': hailTarget(); break;
    case 'info': $('infobox').classList.contains('hidden') ? openInfo() : closeInfo(); break;
    case 'stop': setAuto({ mode: 'stop' }, null); break;
    case 'ordAttack': send({ t: 'order', o: 'attack' }); break;
    case 'ordGather': send({ t: 'order', o: 'gather' }); break;
    case 'ordHold': send({ t: 'order', o: 'hold' }); break;
    case 'ordFire': send({ t: 'order', o: 'holdfire' }); break;
    case 'ordLoot': send({ t: 'order', o: 'loot' }); break;
    case 'companion': { const T = ['radio', 'codex', 'missions', 'station', 'ops', 'log']; ctab(T[(T.indexOf(G.ctab) + 1) % T.length]); break; }
  }
});
window.addEventListener('keyup', (e) => { keys[e.code] = false; });
window.addEventListener('blur', () => { keys = {}; });
function jumpNext() {
  if (!G.route.length) return toast('Plot a course on the map first (M).');
  G.autoRoute = G.route.length > 1;   // 1.1: J flies the whole plotted route, jump after jump
  const S = SYS[G.sys];
  if (S && S.gate === G.route[0]) { const w = S.stellars.find(p => p.wormhole); if (w) { G.navStellar = w.id; toast(`The next leg crosses ${w.name}: fly into the wormhole.`); } return; }
  const me = G.view;
  if (me && S && S.stellars.some(p => Math.hypot(me.x - p.x, me.y - p.y) < K.jumpClear)) { setAuto({ mode: 'jump' }, 'Autopilot: flying clear of the planets to jump. Steer to take over.'); return; }   // 1.0.3
  send({ t: 'jump', to: G.route[0] });
}
// ------------------------------------------------------------------ 1.1 hailing
function hailTarget() {
  if (G.target && G.ents.get(G.target)) return send({ t: 'hail', id: G.target });
  if (G.navStellar) return send({ t: 'hail', stellar: G.navStellar });
  toast('Target a ship (click or Tab) or select a planet (click it) to hail.');
}
function showHail(m) {
  $('hailwho').textContent = m.who || ''; $('hailsub').textContent = m.sub ? '· ' + m.sub : ''; $('hailtext').textContent = m.text || '';
  const key = m.stellar ? { stellar: m.stellar } : { id: m.id };
  $('hailopts').innerHTML = (m.opts || []).map(o => `<button class="btn" data-k="${o.k}">${o.label.replace(/[<>&]/g, '')}</button>`).join('') + '<button class="btn sm" data-k="">CLOSE</button>';
  $('hailopts').querySelectorAll('button').forEach(b => b.onclick = () => { if (b.dataset.k) send({ t: 'hailopt', ...key, k: b.dataset.k }); else $('hailbox').classList.add('hidden'); });
  $('hailbox').classList.remove('hidden');
}
window.addEventListener('keydown', (e) => { if (!$('hailbox').classList.contains('hidden') && (e.key === 'Escape' || e.code === 'KeyT')) { $('hailbox').classList.add('hidden'); e.stopImmediatePropagation(); e.preventDefault(); } }, true);
// ship and captain info (I)
function openInfo() { audio.ui('open', 0.6); $('infobox').classList.remove('hidden'); send({ t: 'rivals' }); renderInfo(); }
function closeInfo() { audio.ui('close', 0.6); $('infobox').classList.add('hidden'); }
function renderInfo() { $('infobody').innerHTML = infoHtml(G, G.itab || 'ship'); }
$('itabs').addEventListener('click', (e) => { const b = e.target.closest('[data-it]'); if (!b) return; G.itab = b.dataset.it; $('itabs').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); renderInfo(); });
$('infobody').addEventListener('click', (e) => { const b = e.target.closest('[data-jet],[data-ord]'); if (!b) return; if (b.dataset.jet) send({ t: 'jettison', cid: b.dataset.jet, n: +b.dataset.n || 0 }); else send({ t: 'order', o: b.dataset.ord }); setTimeout(renderInfo, 250); });
window.addEventListener('keydown', (e) => { if (!$('infobox').classList.contains('hidden') && (e.key === 'Escape' || e.code === 'KeyI') && !typing()) { closeInfo(); e.stopImmediatePropagation(); e.preventDefault(); } }, true);
// ------------------------------------------------------------------ 1.0.3 autopilot: fly to a planet, turn, brake and land; or fly clear and jump
function setAuto(a, msg) { if (a && !G.auto) audio.ui('autopilot', 0.8); G.auto = a; if (!a) G.autoRoute = G.autoRoute && G.autoKeep; G.autoKeep = false; $('autobadge').classList.toggle('hidden', !a); if (a) { $('autobadge').textContent = a.mode === 'land' ? 'AUTOPILOT · LANDING' : a.mode === 'stop' ? 'FULL STOP' : G.autoRoute && G.route.length > 1 ? `AUTOPILOT · ${G.route.length} JUMPS` : 'AUTOPILOT · JUMP'; if (msg) toast(msg); } }
function arrive(inp, me, st, tx, ty, stopR) {
  const dx = tx - me.x, dy = ty - me.y, d = Math.hypot(dx, dy) || 1, ux = dx / d, uy = dy / d;
  const sp = Math.hypot(me.vx, me.vy), tflip = Math.PI / st.turn, rem = Math.max(0, d - stopR);
  const vAllow = Math.min(st.maxSpeed * 0.98, Math.sqrt(2 * st.accel * Math.max(0, rem - sp * tflip)) * 0.85);
  const ex = ux * vAllow - me.vx, ey = uy * vAllow - me.vy;
  if (Math.hypot(ex, ey) < 12) { inp.thrust = 0; inp.turn = 0; return; }
  const da = wrap(Math.atan2(ex, -ey) - me.a);
  inp.turn = Math.abs(da) < st.turn * DT ? 0 : Math.sign(da); inp.thrust = Math.abs(da) < 0.35 ? 1 : 0; inp.rev = 0; inp.ab = 0;
}
function autopilot(inp) {
  const me = G.view, st = G.you && G.you.shipStats, A = G.auto, S = SYS[G.sys]; if (!me || !st || !S) return setAuto(null);
  if (A.mode === 'stop') {   // 1.1: full stop: turn against your drift and burn until still
    const sp = Math.hypot(me.vx, me.vy); if (sp < 6) { inp.thrust = 0; return setAuto(null); }
    const da = wrap(Math.atan2(-me.vx, me.vy) - me.a); inp.turn = Math.abs(da) < st.turn * DT ? 0 : Math.sign(da); inp.thrust = Math.abs(da) < 0.25 && sp > 6 ? 1 : 0; inp.rev = 0; return;
  }
  if (A.mode === 'land') {
    const p = S.stellars.find(x => x.id === A.id); if (!p) return setAuto(null);
    arrive(inp, me, st, p.x, p.y, p.r * 0.6);
    const d = Math.hypot(p.x - me.x, p.y - me.y), sp = Math.hypot(me.vx, me.vy);
    if (d < p.r + 50 && sp < 70 && performance.now() - (A.sent || 0) > 800) { A.sent = performance.now(); send({ t: 'land', stellar: p.id }); }
  } else {
    const to = SYS[G.route[0]]; if (!to) return setAuto(null);
    if (S.stellars.every(p => Math.hypot(me.x - p.x, me.y - p.y) > K.jumpClear + 60)) { const go = G.autoRoute; G.autoKeep = true; setAuto(null); inp.thrust = 0; jumpNext(); G.autoRoute = go && G.route.length > 1; return; }
    const ang = Math.atan2(to.x - S.x, -(to.y - S.y)), da = wrap(ang - me.a);
    inp.turn = Math.abs(da) < st.turn * DT ? 0 : Math.sign(da); inp.thrust = Math.abs(da) < 0.5 ? 1 : 0; inp.rev = 0;
  }
}
function sendChat() { const c = $('chatin'), v = c.value.trim(); c.value = ''; if (!v) return;
  if (G.solo) { send({ t: 'note', text: v }); toast('Added to your log.'); return; }   // 2.4: in a solo game the chat line writes notes in your captain's log
  if (v.startsWith('/s ')) send({ t: 'chat', msg: v.slice(3), ch: 'sys' }); else if (v.startsWith('/f ')) send({ t: 'chat', msg: v.slice(3), ch: 'fleet' }); else if (G.chan) send({ t: 'chat', msg: v, ch: G.chan }); else send({ t: 'chat', msg: v }); }
// 1.0.1 command bar: chat channel buttons, the controls card, and shortcuts to key bindings, options and the map
$('cchan').addEventListener('click', (e) => { const b = e.target.closest('[data-ch]'); if (!b) return; G.chan = b.dataset.ch; $('cchan').querySelectorAll('button').forEach(x => x.classList.toggle('on', x === b)); $('chatin').placeholder = G.chan === 'sys' ? 'Press Enter to talk to this system' : G.chan === 'fleet' ? 'Press Enter to talk to your fleet' : 'Press Enter to chat'; $('chatin').focus(); });
const BASICS = [['Left click', 'Target a ship, or plot a course on the map'], ['Double click', 'Land on a planet or station'], ['Mouse wheel', 'Zoom'], ['Enter', 'Chat'], ['O', 'Options'], ['Esc', 'Close a window, clear the target']];
function openControls() { audio.ui('open', 0.6);
  $('ctrllist').innerHTML = '<div class="osect">FLIGHT AND COMBAT</div><div class="ctrlgrid">' + ACTIONS.map(([a, n]) => `<span class="k">${keyName(bound(a))}${ALT[a] ? ' / ' + keyName(ALT[a]) : ''}</span><span>${n}</span>`).join('') + '</div>'
    + '<div class="osect">MOUSE AND MENUS</div><div class="ctrlgrid">' + BASICS.map(([k, n]) => `<span class="k">${k}</span><span>${n}</span>`).join('') + '</div>';
  $('ctrlbox').classList.remove('hidden');
}
const closeControls = () => $('ctrlbox').classList.add('hidden');
$('cbhelp').onclick = openControls; $('ctrlclose').onclick = closeControls;
$('ctrlkeys').onclick = () => { closeControls(); openOpts(true); };
$('cbkeys').onclick = () => openOpts(true);
$('cbmap').onclick = () => ($('gmap').classList.contains('hidden') ? openMap() : closeMap());
function cycleTarget(dir) {
  const me = G.view; if (!me) return;
  const list = [...G.ents.values()].filter(e => e.id !== G.myId).sort((a, b) => Math.hypot(a.rx - me.rx, a.ry - me.ry) - Math.hypot(b.rx - me.rx, b.ry - me.ry));
  if (!list.length) return;
  const i = list.findIndex(e => e.id === G.target); const n = list[(i + dir + list.length) % list.length];
  G.target = n.id; send({ t: 'target', id: n.id });
}
function nearestHostile() {
  const me = G.view; if (!me) return;
  const list = [...G.ents.values()].filter(e => G.hostile(e)).sort((a, b) => Math.hypot(a.rx - me.rx, a.ry - me.ry) - Math.hypot(b.rx - me.rx, b.ry - me.ry));
  if (list.length) { G.target = list[0].id; send({ t: 'target', id: list[0].id }); } else toast('No hostiles nearby.');
}
function landRequest(pick) {
  const me = G.view, S = SYS[G.sys]; if (!me || !S) return;
  const nav = pick || (G.navStellar && S.stellars.find(p => p.id === G.navStellar && p.svc.includes('L')));
  const near = S.stellars.filter(p => p.svc.includes('L')).sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  // L lands on the nav point if one is set (by clicking it), otherwise on the nearest landable body
  const p = nav && (pick || Math.hypot(nav.x - me.x, nav.y - me.y) < 1500) ? nav : near;
  if (!p) return toast('Nowhere to land in this system.');
  G.navStellar = p.id;
  const d = Math.hypot(p.x - me.x, p.y - me.y);
  if (d > p.r + 60 || Math.hypot(me.vx, me.vy) > 80) { setAuto({ mode: 'land', id: p.id }, `Autopilot: landing on ${p.name}. Steer to take over.`); return; }   // 1.0.3
  send({ t: 'land', stellar: p.id });
}

// ------------------------------------------------------------------ mouse: click to target, click a planet to set nav, double-click to land
const mouse = { x: 0, y: 0, wx: 0, wy: 0, in: false, down: false };
function toWorld(cx, cy) { const r = window.devicePixelRatio || 1, rect = canvas.getBoundingClientRect(); return [ (( cx - rect.left) * r - cam.W / 2) / cam.z + cam.cx, ((cy - rect.top) * r - cam.H / 2) / cam.z + cam.cy ]; }
function pickAt(wx, wy) {
  if (!G.view || G.landed) return null;
  let best = null, bd = Infinity;
  for (const e of G.ents.values()) {
    if (e.id === G.myId) continue;
    const H = G.A.ships[e.hull]; const r = Math.max(16 / cam.z, (H ? H.size : 50) * G.spriteScale * 0.42), d = Math.hypot(e.rx - wx, e.ry - wy);
    if (d < r && d < bd) { bd = d; best = { ship: e }; }
  }
  if (best) return best;
  const S = SYS[G.sys]; if (!S) return null;
  for (const p of S.stellars) { const d = Math.hypot(p.x - wx, p.y - wy); if (d < p.r * (p.hub ? 1 : 1.15) + 10 / cam.z && d < bd) { bd = d; best = { stellar: p }; } }
  return best;
}
function cursorFor(h) {
  if (G.opts.mouseAim && !h) return 'aim';
  if (!h) return '';
  if (h.ship) return G.hostile(h.ship) ? 'hostile' : (h.ship.owner === G.myId ? 'friendly' : (h.ship.fl & 16 ? 'friendly' : 'neutral'));
  return h.stellar.svc.includes('L') ? 'land' : '';
}
function setCursor(c) { if (canvas.dataset.cur !== c) { canvas.dataset.cur = c; canvas.className = c ? 'cur-' + c : ''; } }
function setTarget(id) { G.target = id; send({ t: 'target', id }); }
canvas.addEventListener('mousemove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY; mouse.in = true;
  if (G._look) { const dx = e.clientX - G._look.x, dy = e.clientY - G._look.y; if (Math.hypot(dx, dy) > 6) G._look.moved = true;
    const r = canvas.getBoundingClientRect(), k = canvas.width / r.width, m = 3200, L = 2.4 / G.zoom; G._lookT = [Math.max(-m, Math.min(m, dx * k * L)), Math.max(-m, Math.min(m, dy * k * L))]; }
  [mouse.wx, mouse.wy] = toWorld(e.clientX, e.clientY);
  const h = pickAt(mouse.wx, mouse.wy); G.hover = h && h.ship ? h.ship.id : 0; G.hoverStellar = h && h.stellar ? h.stellar.id : null; setCursor(cursorFor(h));
});
canvas.addEventListener('mouseleave', () => { mouse.in = false; mouse.down = false; G.hover = 0; G.hoverStellar = null; });
canvas.addEventListener('mousedown', (e) => {
  if (!G.you || G.landed) return; audio.unlock();
  if (document.activeElement && document.activeElement.tagName === 'INPUT') document.activeElement.blur();
  const [wx, wy] = toWorld(e.clientX, e.clientY), h = pickAt(wx, wy);
  if (e.button === 2) { G._look = { t: performance.now(), x: e.clientX, y: e.clientY, moved: false }; return; }   // 2.1: hold right-click and move to look ahead (a quick click still clears your target)
  if (e.button !== 0) return;
  if (h && h.ship) { setTarget(h.ship.id); return; }
  if (h && h.stellar) { G.navStellar = h.stellar.id; toast(`Nav: ${h.stellar.name}${h.stellar.svc.includes('L') ? ' (double-click or L to land)' : ''}`); return; }
  if (G.opts.mouseAim) mouse.down = true;   // mouse-aim mode: hold the left button on open space to fire
});
window.addEventListener('mouseup', (e) => {
  mouse.down = false;
  if (e.button === 2 && G._look) { if (!G._look.moved && performance.now() - G._look.t < 300) setTarget(0); G._look = null; G._lookT = null; }   // the view eases back to your ship
});
canvas.addEventListener('dblclick', (e) => {
  if (!G.you || G.landed) return;
  const [wx, wy] = toWorld(e.clientX, e.clientY), h = pickAt(wx, wy);
  if (h && h.stellar && h.stellar.svc.includes('L')) landRequest(h.stellar);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener('wheel', (e) => { if (!G.view) return; e.preventDefault(); G.zoom = e.deltaY < 0 ? Math.min(2, G.zoom * 1.1) : Math.max(0.35, G.zoom / 1.1); }, { passive: false });
// radar: click a blip to target it
$('radar').addEventListener('mousedown', (e) => {
  const me = G.view; if (!me) return;
  const rc = $('radar'), rect = rc.getBoundingClientRect(), r = rc.width / rect.width, mx = (e.clientX - rect.left) * r, my = (e.clientY - rect.top) * r;
  const W = rc.width, H = rc.height, k = (H / 2) / (G.radarR || 4200) * 1.15;
  let best = null, bd = 10 * r;
  for (const en of G.ents.values()) { if (en.id === G.myId) continue; const d = Math.hypot(W / 2 + (en.rx - me.rx) * k - mx, H / 2 + (en.ry - me.ry) * k - my); if (d < bd) { bd = d; best = en; } }
  if (best) setTarget(best.id); else if (e.button === 2) setTarget(0);
});
$('radar').addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ boarding (B next to a disabled ship)
function openBoard() {
  const t = G.target ? G.ents.get(G.target) : null, me = G.view;
  if (!t || !(t.fl & 4)) return toast('Target a disabled ship to board it.');
  const H = G.A.ships[t.hull], d = Math.hypot(t.rx - me.rx, t.ry - me.ry);
  if (d > Math.max(120, (H.size + G.A.ships[G.myHull || G.you.ship.hull].size) * 0.5)) return toast('Move alongside to board.');
  $('boardin').innerHTML = boardHtml(G, t); $('boardbox').classList.remove('hidden'); G.boarding = t.id;
}
function closeBoard() { $('boardbox').classList.add('hidden'); G.boarding = 0; }
function doBoard(act) { if (act && G.boarding) send({ t: 'board', id: G.boarding, act }); closeBoard(); }
$('boardin').addEventListener('click', (e) => { const b = e.target.closest('[data-board]'); if (b && !b.disabled) doBoard(b.dataset.board); });
window.addEventListener('keydown', (e) => {
  if ($('boardbox').classList.contains('hidden')) return;
  const k = { Digit1: 'plunder', Digit2: 'capture', Digit3: 'rescue' }[e.code];
  if (k) { const b = $('boardin').querySelector(`[data-board="${k}"]`); if (b && !b.disabled) doBoard(k); e.stopImmediatePropagation(); e.preventDefault(); }
  else if (e.key === 'Escape') { closeBoard(); e.stopImmediatePropagation(); e.preventDefault(); }
}, true);

// ------------------------------------------------------------------ tutorial panel
function renderTut() {
  const i = G.you ? G.you.tut : TUTORIAL.length, T = TUTORIAL[i];
  $('tut').classList.toggle('hidden', !T);
  if (!T) return;
  $('tutn').textContent = `CAREER ${i + 1} / ${TUTORIAL.length}`; $('tutt').textContent = T.title; $('tutx').textContent = T.text;
  $('tutr').textContent = `Reward: ${T.reward.toLocaleString()} cr${T.mat ? ` + ${T.mat[0]} crate` : ''}`;
}
$('tutn').parentElement.style.cursor = 'pointer'; $('tutn').title = 'Click to collapse or expand';
$('tutn').onclick = () => { G.opts.tutMin = !G.opts.tutMin; saveOpts(); $('tut').classList.toggle('mini', !!G.opts.tutMin); };   // 2.0: the career panel folds away
$('tut').classList.toggle('mini', !!G.opts.tutMin);
$('tutskip').onclick = () => { if (confirm('Hide the career guide? You will not get the remaining rewards.')) send({ t: 'tutskip' }); };

// ------------------------------------------------------------------ options
const CHECKS = ['dmg', 'shake', 'mouseAim', 'notify', 'cb', 'mute'];
let rebinding = null;
const keyName = (c) => ({ ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', ShiftLeft: 'Shift L', ShiftRight: 'Shift R', ControlLeft: 'Ctrl L', ControlRight: 'Ctrl R', AltLeft: 'Alt L', AltRight: 'Alt R' })[c] || c.replace(/^Key/, '').replace(/^Digit/, '').replace(/^Numpad/, 'Num ');
function renderKeys() {
  $('optkeys').innerHTML = ACTIONS.map(([a, n]) => `<div class="kb"><span>${n}</span><button class="btn sm${rebinding === a ? ' on' : ''}" data-bind="${a}">${rebinding === a ? 'press a key…' : keyName(bound(a))}</button></div>`).join('');
  $('optkeys').querySelectorAll('[data-bind]').forEach(b => b.onclick = () => { rebinding = b.dataset.bind; renderKeys(); });
}
function openOpts(keysFirst) { audio.ui('open', 0.6);
  $('opts').classList.remove('hidden'); for (const k of CHECKS) $('opt-' + k).checked = !!G.opts[k];
  $('opt-scale').value = G.opts.scale; $('opt-vol').value = G.opts.vol; $('opt-sfx').value = G.opts.sfx; $('opt-radio').value = G.opts.radio; $('opt-ui').value = G.opts.ui ?? 0.8; $('opt-amb').value = G.opts.amb ?? 0.5; $('opt-music').value = G.opts.music ?? 0.6; rebinding = null; renderKeys();
  document.querySelectorAll('#opts input[type=range]').forEach(paintRange);
  if (keysFirst === true) setTimeout(() => $('optkeys').scrollIntoView({ block: 'start' }), 0);
}
function closeOpts() { audio.ui('close', 0.6); $('opts').classList.add('hidden'); rebinding = null; }
$('optclose').onclick = closeOpts; $('optbtn').onclick = openOpts;
// 2.1: the quick volume control in the command bar: one master slider and a mute button
function paintRange(el) { if (!el) return; const p = (el.value - el.min) / ((el.max - el.min) || 1) * 100; el.style.background = `linear-gradient(90deg,#e0362a ${p}%,#3a0808 ${p}%)`; }   // 2.1: red fill
document.addEventListener('input', (e) => { if (e.target.matches && e.target.matches('input[type=range]')) paintRange(e.target); });
function volUi() {
  const b = $('cbvol'); if (!b) return; b.textContent = G.opts.mute || G.opts.vol <= 0.001 ? '🔇' : G.opts.vol < 0.3 ? '🔈' : G.opts.vol < 0.65 ? '🔉' : '🔊';
  $('qvol').value = Math.round(G.opts.vol * 100); paintRange($('qvol')); $('qvoln').textContent = G.opts.mute ? 'muted' : Math.round(G.opts.vol * 100) + '%'; $('qmute').textContent = G.opts.mute ? 'UNMUTE' : 'MUTE';
}
$('cbvol').onclick = (e) => { e.stopPropagation(); $('qvolbox').classList.toggle('hidden'); volUi(); };
$('qvol').oninput = (e) => { G.opts.vol = +e.target.value / 100; if (G.opts.mute && G.opts.vol > 0) G.opts.mute = false; applyOpts(); saveOpts(); volUi(); };
$('qmute').onclick = () => { G.opts.mute = !G.opts.mute; applyOpts(); saveOpts(); volUi(); };
$('qmore').onclick = () => { $('qvolbox').classList.add('hidden'); openOpts(); };
document.addEventListener('click', (e) => { if (!e.target.closest('#qvolbox') && e.target.id !== 'cbvol') $('qvolbox').classList.add('hidden'); });
volUi();
for (const k of CHECKS) $('opt-' + k).onchange = (e) => { G.opts[k] = e.target.checked; if (k === 'notify' && e.target.checked && window.Notification && Notification.permission === 'default') Notification.requestPermission(); applyOpts(); saveOpts(); };
for (const k of ['scale', 'vol', 'sfx', 'radio', 'ui', 'amb', 'music']) $('opt-' + k).oninput = (e) => { G.opts[k] = +e.target.value; applyOpts(); saveOpts(); audio.unlock(); if (k === 'vol' || k === 'sfx') audio.play('10100', 0, 0, 1); if (k === 'ui') audio.ui('click'); };
window.addEventListener('rift-radio-vol', (e) => { G.opts.radio = e.detail; applyOpts(); saveOpts(); });
$('optreset').onclick = () => { G.opts.keys = {}; saveOpts(); renderKeys(); };
window.addEventListener('keydown', (e) => {
  if (!$('ctrlbox').classList.contains('hidden')) { if (e.key === 'Escape' || e.key === 'Enter' || e.key === '?') { closeControls(); e.preventDefault(); } e.stopImmediatePropagation(); return; }
  if (!$('storebox').classList.contains('hidden') && e.key === 'Escape') { $('storebox').classList.add('hidden'); e.stopImmediatePropagation(); return; }
  if ($('opts').classList.contains('hidden')) return;
  if (rebinding) {   // the next key pressed becomes the binding (Escape cancels); a key used by another action is swapped off it
    e.preventDefault(); e.stopImmediatePropagation();
    if (Object.values(ALT).includes(e.code)) { toast('The arrow keys and right Shift always steer, so they cannot be bound to other actions.'); rebinding = null; renderKeys(); return; }   // 2.0.3
    if (e.code !== 'Escape') { for (const [a] of ACTIONS) if (a !== rebinding && bound(a) === e.code) G.opts.keys[a] = bound(rebinding); G.opts.keys[rebinding] = e.code; saveOpts(); }
    rebinding = null; renderKeys(); return;
  }
  if (e.key === 'Escape' || e.key === 'Enter' || e.code === 'KeyO') { closeOpts(); e.preventDefault(); }
  e.stopImmediatePropagation();   // game keys are paused while options are open
}, true);

// ------------------------------------------------------------------ loops
function resize() {
  const r = window.devicePixelRatio || 1; canvas.width = canvas.clientWidth * r; canvas.height = canvas.clientHeight * r; ctx.imageSmoothingEnabled = true;
  const rc = $('radar'); rc.width = Math.round(rc.clientWidth * r); rc.height = Math.round(rc.clientWidth * 0.62 * r);
}
window.addEventListener('resize', resize);
// the sidebar can be dragged wider or narrower; the width is remembered
function setHud(w) { w = Math.max(280, Math.min(Math.min(760, window.innerWidth * 0.6), w)); document.documentElement.style.setProperty('--hud', w + 'px'); resize(); return w; }
try { const w = +localStorage.getItem('rift.hud'); if (w) setHud(w); } catch {}
$('hudgrip').addEventListener('mousedown', (e) => {
  e.preventDefault(); const g = $('hudgrip'); g.classList.add('drag');
  const move = (ev) => { const w = setHud(window.innerWidth - ev.clientX); try { localStorage.setItem('rift.hud', w); } catch {} };
  const up = () => { g.classList.remove('drag'); window.removeEventListener('mousemove', move); window.removeEventListener('mouseup', up); refreshCompanion(); };
  window.addEventListener('mousemove', move); window.addEventListener('mouseup', up);
});
resize();
// ------------------------------------------------------------------ gamepad and touch controls
const pad = { prev: [] }, touch = { keys: {}, stick: null };
function padInput(inp) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null; if (!gp) return;
  const B = (i) => gp.buttons[i] && gp.buttons[i].pressed, edge = (i) => B(i) && !pad.prev[i], ax = gp.axes[0] || 0, ay = gp.axes[1] || 0;
  if (Math.abs(ax) > 0.35) inp.turn = Math.sign(ax);
  if (ay < -0.35 || B(7)) inp.thrust = 1;
  if (B(13) || ay > 0.6) inp.rev = 1;
  if (B(0)) inp.fire1 = 1; if (B(1)) inp.fire2 = 1; if (B(6)) inp.ab = 1;
  if (edge(2)) nearestHostile(); if (edge(3)) landRequest(); if (edge(4)) cycleTarget(-1); if (edge(5)) cycleTarget(1);
  if (edge(9)) ($('gmap').classList.contains('hidden') ? openMap() : closeMap()); if (edge(8)) openBoard();
  if (edge(12)) jumpNext();
  pad.prev = gp.buttons.map(b => b.pressed);
}
function touchInput(inp) {
  for (const k of ['fire1', 'fire2', 'ab']) if (touch.keys[k]) inp[k] = 1;
  const st = touch.stick; if (!st || !G.view) return;
  const mag = Math.hypot(st.dx, st.dy); if (mag < 0.2) return;
  const want = Math.atan2(st.dx, -st.dy); let d = want - G.view.a; d = Math.atan2(Math.sin(d), Math.cos(d));
  const s_ = G.you && G.you.shipStats; if (Math.abs(d) > (s_ ? s_.turn * DT : 0.05)) inp.turn = Math.sign(d);
  if (mag > 0.6 && Math.abs(d) < 0.8) inp.thrust = 1;
}
if ('ontouchstart' in window || (window.matchMedia && matchMedia('(pointer: coarse)').matches)) {
  $('touch').classList.remove('hidden');
  const stk = $('tstick'), knob = stk.querySelector('i');
  const move = (t) => { const r = stk.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2; let dx = (t.clientX - cx) / (r.width / 2), dy = (t.clientY - cy) / (r.height / 2); const m = Math.hypot(dx, dy); if (m > 1) { dx /= m; dy /= m; } touch.stick = { dx, dy }; knob.style.transform = `translate(${dx * 50}px,${dy * 50}px)`; };
  stk.addEventListener('touchstart', (e) => { e.preventDefault(); audio.unlock(); move(e.targetTouches[0]); }, { passive: false });
  stk.addEventListener('touchmove', (e) => { e.preventDefault(); move(e.targetTouches[0]); }, { passive: false });
  stk.addEventListener('touchend', () => { touch.stick = null; knob.style.transform = ''; });
  for (const b of $('tbtns').querySelectorAll('button')) {
    b.addEventListener('touchstart', (e) => { e.preventDefault(); audio.unlock(); b.classList.add('on');
      if (b.dataset.k) touch.keys[b.dataset.k] = true;
      const t = b.dataset.tap; if (t === 'target') nearestHostile(); else if (t === 'land') landRequest(); else if (t === 'map') ($('gmap').classList.contains('hidden') ? openMap() : closeMap()); else if (t === 'board') openBoard();
      else if (t === 'jump') jumpNext(); }, { passive: false });
    b.addEventListener('touchend', () => { b.classList.remove('on'); if (b.dataset.k) touch.keys[b.dataset.k] = false; });
  }
}
let acc = 0, last = performance.now();
function fixedTick() {
  if (!G.view || G.landed || G.paused) return;
  const inp = { thrust: held('thrust') ? 1 : 0, turn: (held('right') ? 1 : 0) - (held('left') ? 1 : 0),
                rev: held('rev') ? 1 : 0, ab: held('ab') ? 1 : 0, fire1: held('fire1') ? 1 : 0, fire2: held('fire2') ? 1 : 0 };
  if (G.opts.mouseAim && mouse.in) {   // mouse-aim: the ship turns toward the cursor unless you steer with the keys
    if (!inp.turn) { const want = Math.atan2(mouse.wx - G.view.x, -(mouse.wy - G.view.y)); let d = want - G.view.a; d = Math.atan2(Math.sin(d), Math.cos(d)); const st = G.you && G.you.shipStats; if (Math.abs(d) > (st ? st.turn * DT : 0.05)) inp.turn = Math.sign(d); }
    if (mouse.down) inp.fire1 = 1;
  }
  const manual0 = held('thrust') || held('left') || held('right') || held('rev'), before = inp.thrust + '|' + inp.turn;
  padInput(inp); touchInput(inp);
  if (G.auto) { if (manual0 || before !== inp.thrust + '|' + inp.turn) { G.autoRoute = false; setAuto(null); toast('Autopilot off.'); } else autopilot(inp); }
  if (held('face') && !G.auto && G.target && G.ents.get(G.target)) {   // 1.1: hold E to turn toward your target (leading it)
    const t = G.ents.get(G.target), st = G.you.shipStats, lead = Math.min(1, Math.hypot(t.rx - G.view.x, t.ry - G.view.y) / 600);
    const da = wrap(Math.atan2(t.rx + (t.vx || 0) * lead - G.view.x, -(t.ry + (t.vy || 0) * lead - G.view.y)) - G.view.a); inp.turn = Math.abs(da) < st.turn * DT ? 0 : Math.sign(da);
  }
  if (typing() && !G.auto) { inp.thrust = inp.turn = inp.rev = inp.ab = inp.fire1 = inp.fire2 = 0; }   // the autopilot keeps flying while you chat
  audio.engine(inp.thrust ? (inp.ab ? 1.6 : 1) : inp.rev ? 0.3 : 0);   // 2.0: the engine hum follows your throttle
  seq++;
  send({ t: 'input', seq, th: inp.thrust, tu: inp.turn, ab: inp.ab, rv: inp.rev, f1: inp.fire1, f2: inp.fire2 });
  history.push({ seq, inp }); if (history.length > 90) history.shift();
  const me0 = G.ents.get(G.myId);
  if (G.you && !(me0 && me0.fl & 8)) step(G.view, G.you.shipStats, inp);
  G.view.fl = (inp.thrust ? 1 : 0) | (inp.ab ? 2 : 0);
}
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000); last = t;
  { const tg = G._look && G._lookT && !G.landed ? G._lookT : [0, 0], k = Math.min(1, dt * (G._look ? 7 : 5)); G.lookX = (G.lookX || 0) + (tg[0] - (G.lookX || 0)) * k; G.lookY = (G.lookY || 0) + (tg[1] - (G.lookY || 0)) * k; }   // 2.1 look-ahead
  acc += dt; while (acc >= DT) { fixedTick(); acc -= DT; }
  const me = G.view;
  if (me) {   // smooth out prediction corrections
    me.ox *= Math.pow(0.0005, dt); me.oy *= Math.pow(0.0005, dt);
    me.rx = me.x + me.ox + me.vx * acc; me.ry = me.y + me.oy + me.vy * acc;
  }
  const now = performance.now();
  for (const e of G.ents.values()) {
    if (me && e.id === G.myId) { e.rx = me.rx; e.ry = me.ry; e.a = me.a; e.fl = (e.fl & ~3) | me.fl; continue; }
    const k = Math.min(0.25, (now - e.t) / 1000), tx = e.x + e.vx * k, ty = e.y + e.vy * k;
    const s = Math.min(1, dt * 14); e.rx += (tx - e.rx) * s; e.ry += (ty - e.ry) * s;
  }
  for (const s of G.shots) { const k = (now - s.t) / 1000; s.rx = s.x + s.vx * k; s.ry = s.y + s.vy * k; }
  const shotsView = G.shots.map(s => ({ ...s, x: s.rx ?? s.x, y: s.ry ?? s.y }));
  if (!G.landed && G.sys) draw({ ...G, shots: shotsView, view: me, hostile: G.hostile }, ctx, canvas.width, canvas.height, dt, now);
  else { ctx.fillStyle = '#000'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
  radar(G, rctx); hud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => { if ((G.ctab === 'station' || G.ctab === 'ops') && G.you) refreshCompanion(); }, 15000);
