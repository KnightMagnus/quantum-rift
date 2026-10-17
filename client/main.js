import { coronaRouteBlocked } from '/shared/industrial-rules.js';
import { initRefineryUI } from './refinery_ui.js';
import { binding, migrateBindings, RESERVED_KEYS } from './action-bindings.js';
import { initMiningUI, receiveMining } from './mining_ui.js';
import { landingGuidance, landingReady } from './landing_autopilot.js';
import { initLoginScene } from './login_scene.js';
import { gatewayGuidance } from './gateway_autopilot.js';
import { setArtworkVersion } from './artwork.js';
import { initHails } from './hails_ui.js';
import { receiveShipChat } from './chat_bubbles.js';
// Quantum Rift client: connection, input, client-side prediction, render loop.
import { SYS, STELLARS, FACTIONS, FACTION_HULLS } from '/shared/galaxy.js';
import { TUTORIAL } from '/shared/tutorial.js';
import {
  step,
  DT,
  TICK,
  hostileFactions,
  weaponColor,
  augmentAssets,
  K,
  wrap,
  route,
} from '/shared/rules.js';
import { STATES } from '/shared/living.js';
import {
  draw,
  radar,
  boom,
  spark,
  flash,
  blast,
  shieldHit,
  dmgNumber,
  addShake,
  resetRenderSession,
  cam,
  FAC,
} from './render.js';
import * as audio from './audio.js';
import { setRadioLevel, stopRadio } from './radio.js';
window.RiftAudio = audio; // for tests and the curious
import { infoHtml } from './info_ui.js';
import { boardHtml } from './hangar_ui.js';
import { ANOMALIES } from '/shared/fronts.js';
import { arenaSystem } from '/shared/frontier.js';
import { initCoop, onCoopMsg, coopYou, renderCaptains, openDm } from './coop_ui.js';
import { SPRITES } from '/shared/sprites26.js';
import { refreshStores } from './ui.js';
import {
  initUI,
  hud,
  toast,
  ask,
  chatLine,
  showLanded,
  hideLanded,
  renderLanded,
  refreshCompanion,
  drawMini,
  openMap,
  closeMap,
  plot,
  showDead,
  ctab,
} from './ui.js';

const $ = (id) => document.getElementById(id);
initLoginScene($('login'));

/**
 * @typedef {object} ClientGameState
 * @property {import('../shared/rules.js').GameAssets | null} A Game assets dictionary.
 * @property {import('../server/game.js').PlayerData | null} you Current player save data.
 * @property {string | null} sys Current system ID.
 * @property {string | null} landed Currently docked stellar body or null if flying.
 * @property {string | null} view Current UI view mode.
 * @property {Map<number, import('./render.js').RenderEntity>} ents Active entities in current space.
 * @property {Array<{id: number, x: number, y: number, vx: number, vy: number, w: number, c: string, life: number}>} shots Active projectile shots.
 * @property {Array<{id: number, from: {x: number, y: number}, to: {x: number, y: number}, c: string, life: number}>} beams Active beam weapon animations.
 * @property {Array<{id: number, x: number, y: number, it: {cargo?: string, n?: number, mat?: string, credits?: number}}>} loot Floating loot canisters.
 * @property {number} target Current target entity ID.
 * @property {number} zoom Camera zoom scale.
 * @property {number} spriteScale Sprite rendering scale.
 * @property {string[]} route Active hyperspace route system IDs.
 * @property {string | null} navStellar Navigation target stellar ID.
 * @property {Record<string, number>} ammo Ammunition counts.
 * @property {Record<string, string>} FAC Faction ID mapping.
 * @property {string} ctab Active console tab.
 * @property {string | null} ltab Active landed tab.
 * @property {number} myId Player entity simulation ID.
 * @property {number} myHull Player ship hull chassis ID.
 * @property {number} hover Hovered entity ID.
 * @property {Record<string, boolean | number | string | Record<string, string>>} opts Client preferences and configuration.
 * @property {Record<string, string>} [pal] Color palette mapping.
 * @property {Record<string, number>} [tokens] Current player token balances.
 * @property {Array<{name: string, sys: string, ship: string}>} [captains] Active online captains list.
 * @property {{team: string} | null} [arena] Crucible arena state.
 * @property {((e: import('./render.js').RenderEntity) => boolean)} [isAlly] Checks if entity is an allied wingmate.
 * @property {((e: import('./render.js').RenderEntity) => boolean)} [hostile] Checks if entity is hostile to player.
 */
const G = (window.G = {
  A: null,
  you: null,
  sys: null,
  landed: null,
  view: null,
  ents: new Map(),
  shots: [],
  beams: [],
  loot: [],
  target: 0,
  zoom: 1,
  spriteScale: 1.25,
  route: [],
  navStellar: null,
  ammo: {},
  FAC,
  ctab: 'missions',
  ltab: null,
  myId: 0,
  myHull: 0,
  hover: 0,
  opts: Object.assign(
    {
      dmg: true,
      shake: true,
      mouseAim: false,
      notify: false,
      cb: false,
      scale: 1,
      vol: 0.35,
      sfx: 0.75,
      radio: 0.8,
      ui: 0.55,
      amb: 0.35,
      music: 0.45,
      mute: false,
      keys: {},
    },
    (() => {
      try {
        return JSON.parse(localStorage.getItem('rift.opts') || '{}');
      } catch {
        return {};
      }
    })(),
  ),
  hostile(e) {
    if (!e || !G.you) return false;
    if (e.owner === G.myId || e.id === G.myId) return false;
    const f = FAC[e.fac];
    if (G.arena && e.fl & 16)
      return !!e.name && !e.name.startsWith(G.arena.team === 'A' ? 'Azure' : 'Crimson');
    if (e.fl & 16) return !!(G.you.duel && G.you.duel.with === e.name); // 2.6: no open-galaxy PvP; only your duel opponent
    if (G.isAlly && G.isAlly(e)) return false; // 2.6: Armada members' wingmates
    const F = FACTIONS[f];
    if (!F) return false;
    if (F.alwaysHostile) return true;
    const rep = G.you.rep[f] || 0;
    return F.pirate ? rep < 30 : rep <= -30;
  },
});
// 1.0 accessibility: palettes, key bindings, UI scale
const PALETTES = {
  normal: {
    own: '#3fd36b',
    player: '#5ad0ff',
    hostile: '#ff3a2a',
    neutral: '#c8c060',
    friend: '#7ad0ff',
    ally: '#7af0a0',
  },
  cb: {
    own: '#ffffff',
    player: '#4aa8ff',
    hostile: '#ff9f1a',
    neutral: '#9a9a9a',
    friend: '#4aa8ff',
    ally: '#d6b4ff',
  },
}; // blue/orange: safe for red-green colour blindness
G.pal = PALETTES[G.opts.cb ? 'cb' : 'normal'];
export const ACTIONS = [
  ['thrust', 'Thrust', 'KeyW'],
  ['left', 'Turn left', 'KeyA'],
  ['right', 'Turn right', 'KeyD'],
  ['rev', 'Reverse', 'KeyS'],
  ['ab', 'Afterburner', 'ShiftLeft'],
  ['fire1', 'Fire primary', 'Space'],
  ['fire2', 'Fire secondary (tap to launch or recall drones)', 'KeyF'],
  ['target', 'Next target', 'Tab'],
  ['nearest', 'Nearest hostile', 'KeyR'],
  ['land', 'Land', 'KeyL'],
  ['jump', 'Hyperjump', 'KeyJ'],
  ['map', 'Galaxy map', 'KeyM'],
  ['board', 'Board', 'KeyB'],
  ['zoomin', 'Zoom in', 'KeyZ'],
  ['zoomout', 'Zoom out', 'KeyX'],
  ['pause', 'Pause (solo)', 'KeyP'],
  ['mute', 'Mute sound', 'KeyN'],
  ['hail', 'Hail target / planet', 'KeyT'],
  ['hailInbox', 'Incoming hail inbox', 'KeyU'],
  ['info', 'Ship and captain info', 'KeyI'],
  ['face', 'Turn to face target (hold)', 'KeyE'],
  ['stop', 'Full stop', 'KeyQ'],
  ['ordAttack', 'Fleet: attack my target', 'KeyK'],
  ['ordGather', 'Fleet: form up', 'KeyG'],
  ['ordHold', 'Fleet: hold position', 'KeyH'],
  ['ordFire', 'Fleet: hold fire', 'KeyY'],
  ['ordLoot', 'Fleet: collect loot', 'KeyU'],
  ['companion', 'Next companion tab', 'KeyC'],
  ['surveyPulse', 'Scan nearby rocks', 'KeyV'],
  ['dredgeSweep', 'Dredge Sweep', 'BracketLeft'],
  ['dredgeHarvest', 'Dredge Harvest Plasma', 'BracketRight'],
  ['dredgeSmelter', 'Dredge Mobile Smelter', 'Semicolon'],
  ['towToggle', 'Attach / Detach Motherlode', 'Comma'],
  ['miningPanel', 'Mining controls', 'Backquote'],
  ['towDeliver', 'Deliver Motherlode (also automatic)', 'Period'],
  ['towOffer', 'Offer tow to selected captain', 'Home'],
  ['towAccept', 'Accept offered tow', 'End'],
  ['miningGroup', 'Join / leave group mining', 'Minus'],
  ['dredgeInput', 'Set selected processing input', 'Equal'],
  ['dredgeOff', 'Dredge all off', 'Backslash'],
];
const ALT = {
  thrust: 'ArrowUp',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  rev: 'ArrowDown',
  ab: 'ShiftRight',
}; // the arrow keys always work too
migrateBindings(G.opts, ACTIONS);
const bound = (a) => binding(G.opts.keys, ACTIONS, a);
const held = (a) => !!(keys[bound(a)] || (ALT[a] && keys[ALT[a]]));
const actionOf = (code) => {
  for (const [a] of ACTIONS) if (bound(a) === code || ALT[a] === code) return a;
  return null;
};
if (!G.opts.v21) {
  G.opts.v21 = true;
  G.opts.vol = Math.min(G.opts.vol, 0.35);
  G.opts.ui = Math.min(G.opts.ui ?? 0.55, 0.55);
  G.opts.amb = Math.min(G.opts.amb ?? 0.35, 0.35);
  try {
    localStorage.setItem('rift.opts', JSON.stringify(G.opts));
  } catch {}
} // 2.1: quieter defaults, applied once to older settings
function saveOpts() {
  try {
    localStorage.setItem('rift.opts', JSON.stringify(G.opts));
  } catch {}
}
function miningModalBlocked() {
  // Includes account/quit confirmation and future overlays without a stale ID list.
  return !!document.querySelector('.overlay:not(.hidden)');
}

const miningUI = initMiningUI({
  industrialAudio: audio.industrial,
  towAudio: audio.towing,
  G,
  send,
  bound,
  label: (c) => keyName(c),
  blocked: () => typing() || miningModalBlocked(),
  contextBlocked: miningModalBlocked,
});
initRefineryUI(G, send);
setInterval(() => miningUI.refresh(), 100);
function applyOpts() {
  G.pal = PALETTES[G.opts.cb ? 'cb' : 'normal'];
  document.documentElement.style.setProperty('--ui', G.opts.scale);
  document.body.classList.toggle('scaled', G.opts.scale !== 1);
  audio.setMix({
    vol: G.opts.vol,
    sfx: G.opts.sfx,
    ui: G.opts.ui ?? 0.8,
    amb: G.opts.amb ?? 0.5,
    music: G.opts.music ?? 0.6,
    mute: G.opts.mute,
  });
  setRadioLevel(G.opts.mute ? 0 : G.opts.vol * G.opts.radio, G.opts.radio); // 1.0.3: the radio is in the mixer
}
applyOpts();
// loading screen: warm the browser cache with the common ship sprites and station art while the login is shown
(function preloadArt() {
  const hulls = [...new Set(Object.values(FACTION_HULLS).flat())];
  const urls = [
    ...hulls.map((h) => `assets/ships/${h}.${SPRITES[h] ? 'webp' : 'png'}`),
    ...[0, 1, 2, 3, 4, 5].map((k) => `assets/stations/${k}.png`),
    'assets/hub.png',
    'assets/wormhole.png',
  ];
  let n = 0;
  const done = () => {
    n++;
    $('lloadbar').style.width = (100 * n) / urls.length + '%';
    $('lloadt').textContent = `Loading ships… ${n} / ${urls.length}`;
    if (n >= urls.length) $('lload').classList.add('done');
  };
  for (const u of urls) {
    const im = new Image();
    im.onload = im.onerror = done;
    im.src = u;
  }
  setTimeout(() => $('lload').classList.add('done'), 20000);
})();
const canvas = $('view'),
  ctx = canvas.getContext('2d'),
  rctx = $('radar').getContext('2d');
let reconnectTimer = null,
  sessionEpoch = 0,
  sessionDefaults = null;
let ws = null,
  seq = 0,
  history = [],
  keys = {},
  lastSnapT = 0;
function send(m) {
  if (ws && ws.readyState === 1) ws.send(JSON.stringify(m));
}

// ------------------------------------------------------------------ login and connection
$('lbtn').onclick = login;
// 2.0: the login theme starts on the first click or key on the login screen (browsers block sound until then)
const loginMusic = () => {
  if ($('login').classList.contains('hidden')) return;
  audio.unlock();
  audio.startMusic();
  window.removeEventListener('pointerdown', loginMusic, true);
  window.removeEventListener('keydown', loginMusic, true);
};
$('musicbtn').onclick = (e) => {
  e.stopPropagation();
  audio.unlock();
  if ((G.opts.music ?? 0.6) > 0) {
    G.opts.musicWas = G.opts.music ?? 0.6;
    G.opts.music = 0;
  } else G.opts.music = G.opts.musicWas || 0.6;
  applyOpts();
  saveOpts();
  $('musicbtn').classList.toggle('off', !G.opts.music);
  audio.startMusic();
};
$('musicbtn').classList.toggle('off', (G.opts.music ?? 0.6) === 0);
window.addEventListener('pointerdown', loginMusic, true);
window.addEventListener('keydown', loginMusic, true);
// 2.0: interface sounds for every button, tab and chip
document.addEventListener(
  'click',
  (e) => {
    const b = e.target.closest(
      'button, .btn, .chip, .card[data-act], .it, a[data-act], #ctabs button, #ltabs button',
    );
    if (!b || b.disabled) return;
    audio.unlock();
    const act = b.dataset.act;
    if (
      b.closest('#ltabs, #ctabs, .itabs, #gmodes, #cchan, #itabs') ||
      act === 'stab' ||
      act === 'rtree'
    )
      return audio.ui('tab', 0.7);
    if (act === 'trade')
      return audio.ui(b.dataset.custom === 'buy' || +b.dataset.q > 0 ? 'buy' : 'sell', 0.7);
    if (act === 'sellall') return audio.ui('sell', 0.8);
    if (
      act === 'buyship' ||
      act === 'bm' ||
      act === 'buystore' ||
      (act === 'outfit' && +b.dataset.n > 0) ||
      (act === 'mat' && +b.dataset.q > 0)
    )
      return audio.ui('buy', 0.7);
    if (act === 'outfit' && +b.dataset.n < 0) return audio.ui('sell', 0.7);
    if (act === 'accept' || act === 'arcopen' || b.id === 'storyyes')
      return audio.ui('accept', 0.7);
    if (act === 'promote' || act === 'lower') return audio.ui('levelup', 0.6);
    audio.ui('click', 0.8);
  },
  true,
);
document.addEventListener('mouseover', (e) => {
  const b =
    e.target.closest && e.target.closest('.btn:not(:disabled), button:not(:disabled), .chip');
  if (b && b !== G._hoverBtn) {
    G._hoverBtn = b;
    audio.ui('hover', 0.5);
  } else if (!b) G._hoverBtn = null;
});
$('lpass').onkeydown = (e) => {
  if (e.key === 'Enter') login();
};
try {
  $('lname').value = localStorage.getItem('rift.name') || '';
} catch {}
fetch('/api/status')
  .then((r) => r.json())
  .then((s) => {
    setArtworkVersion(s.version);
    $('lstat').textContent =
      `${s.players} captain${s.players === 1 ? '' : 's'} in the Rift right now.`;
    $('lver').textContent = 'Quantum Rift v' + s.version;
    if (s.solo) soloLogin(s);
  })
  .catch(() => {});
// solo mode: no passwords; pick a save slot, start a new captain, or load a save file
function soloLogin(s) {
  G.solo = true;
  document.body.classList.add('solo');
  $('chatin').placeholder = 'Write a note in your log (Enter)';
  $('lpass').classList.add('hidden');
  $('lstat').textContent = 'Solo game: your saves live on this computer.';
  $('lname').placeholder = 'New captain name';
  $('lbtn').textContent = 'START NEW CAPTAIN';
  const L = $('lslots');
  L.classList.remove('hidden');
  L.innerHTML =
    `<div class="solotag">YOUR CAPTAINS</div>` +
    (s.slots.length
      ? s.slots
          .map(
            (c) =>
              `<div class="slot"><div class="n"><b>${c.name.replace(/[<>&]/g, '')}</b><div class="dim small">${c.ship} · ${Math.round(c.credits).toLocaleString()} cr${c.ops ? ' · Station Tier ' + c.ops : ''} · ${c.sys}</div></div><a href="/api/export?name=${encodeURIComponent(c.name)}" download>EXPORT</a><button class="btn sm" data-slot="${c.name.replace(/"/g, '')}">PLAY</button></div>`,
          )
          .join('')
      : '<div class="dim small">No captains yet: name one above and start.</div>') +
    `<label class="btn sm" style="display:inline-flex;align-items:center;justify-content:center">LOAD A SAVE FILE<input type="file" id="limport" accept=".json" style="display:none"></label>`;
  L.querySelectorAll('[data-slot]').forEach(
    (b) =>
      (b.onclick = () => {
        $('lname').value = b.dataset.slot;
        login();
      }),
  );
  $('limport').onchange = async (e) => {
    const f = e.target.files[0];
    if (!f) return;
    const r = await fetch('/api/import', { method: 'POST', body: await f.text() });
    const j = await r.json();
    if (!j.ok) $('lerr').textContent = j.error;
    else location.reload();
  };
}
async function login() {
  if ($('lbtn').disabled) return;
  clearTimeout(reconnectTimer);
  sessionEpoch++;
  const previous = ws;
  ws = null;
  previous?.close();
  audio.unlock();
  const name = $('lname').value.trim(),
    pass = G.solo ? '' : $('lpass').value;
  $('lerr').textContent = '';
  $('lbtn').disabled = true;
  if (!G.A) {
    const was = $('lstat').textContent;
    $('lstat').textContent = 'Loading the galaxy...';
    G.A = augmentAssets(await (await fetch('/shared/assets.json')).json());
    initUI(G, send);
    initCoop(G, send, { toast, ask, plot });
    // Capture only the clean initialized state; account data arrives over the socket later.
    sessionDefaults = Object.fromEntries(
      Object.entries(G)
        .filter(([k, v]) => !['A', 'opts', 'pal'].includes(k) && !(v instanceof Element))
        .map(([k, v]) => [k, typeof v === 'function' ? v : structuredClone(v)]),
    );
    $('lstat').textContent = was;
  } // 1.0.3: the status line comes back if login fails
  try {
    localStorage.setItem('rift.name', name);
  } catch {}
  G._cred = { name, pass };
  G._kicked = false;
  openSocket(0);
}
// 2.4: a dropped connection reconnects on its own, signing back in as the same captain
function openSocket(tries) {
  if (!G._cred) return;
  const { name, pass } = G._cred;
  const epoch = sessionEpoch;
  const socket = new WebSocket(
    (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws',
  );
  ws = socket;
  const current = () => ws === socket && sessionEpoch === epoch;
  socket.onopen = () => {
    if (current()) send({ t: 'hello', name, pass });
  };
  socket.onmessage = (ev) => {
    if (current()) onMessage(JSON.parse(ev.data));
  };
  socket.onclose = () => {
    if (!current()) return;
    ws = null;
    $('lbtn').disabled = false;
    if (!G.you) return;
    if (!G._kicked && tries < 30) {
      if (!tries) toast('Connection lost. Reconnecting...');
      $('lstat').textContent = 'Reconnecting to the server...';
      reconnectTimer = setTimeout(
        () => {
          if (sessionEpoch === epoch && G._cred) openSocket(tries + 1);
        },
        Math.min(8000, 1000 + tries * 700),
      );
      return;
    }
    const reason = G._kicked
      ? 'Signed in somewhere else.'
      : 'Disconnected from the server. Sign in again when it is back.';
    // Terminal disconnect also returns a clean login, not a former captain's UI state.
    void logOut();
    $('lerr').textContent = reason;
  };
  socket.onerror = () => {
    if (current() && !G.you) {
      $('lerr').textContent = 'Could not reach the Quantum Rift server.';
      $('lbtn').disabled = false;
    }
  };
}
function onMessage(m) {
  if (hailUI.onMessage(m)) return;
  switch (m.t) {
    case 'error':
      $('lerr').textContent = m.msg;
      $('lbtn').disabled = false;
      toast(m.msg);
      if (/somewhere else/.test(m.msg)) G._kicked = true;
      break;
    case 'welcome':
      audio.stopMusic();
      audio.preloadUi();
      $('login').classList.add('hidden');
      G.myName = m.name;
      toast(G.you ? 'Reconnected.' : `Welcome to Quantum Rift, Captain ${m.name}.`);
      break;
    case 'refineryFuelQuote':
      G.refineryFuelQuote = m.quote;
      if (G.landed && G.ltab === 'refinery') renderLanded();
      refreshCompanion();
      break;
    case 'refineryQuote':
      G.refineryQuote = m.quote;
      if (G.landed && G.ltab === 'refinery') renderLanded();
      break;
    case 'refinery':
      if (G.you) G.you.refinery = m.data;
      if (G.landed && G.ltab === 'refinery') renderLanded();
      refreshCompanion();
      break;
    case 'you': {
      const first = !G.you;
      G.you = m.d;
      G.sys = m.d.sys;
      coopYou(); // 2.6
      for (const [w, n] of Object.entries(m.d.ship.ammo || {})) if (!G.view) G.ammo[w] = n;
      if (G.landed) renderLanded();
      refreshCompanion();
      refreshStores();
      if (first) ctab('missions');
      renderTut();
      break;
    }
    case 'landed':
      $('combatcontrols').classList.add('hidden');
      G.combat = {};
      if (!G.landed) audio.ui('dock', 0.8);
      audio.setAmbience('station');
      setAuto(null);
      G.landed = m;
      G.view = null;
      G.ents.clear();
      G.shots = [];
      G.beams = [];
      G.loot = [];
      G.target = 0;
      history = [];
      showLanded();
      refreshCompanion();
      audio.play(10110, 0, 0, 0.5);
      break;
    case 'space':
      if (String(m.sys).startsWith('arena-') && !SYS[m.sys]) SYS[m.sys] = arenaSystem(m.sys);
      {
        const fromSpace = !!G.view && !G.landed;
        if (G.landed) audio.ui('undock', 0.8);
        else if (fromSpace) {
          audio.ui('arrive', 0.8);
          G._arriveT = performance.now();
          G._jumping = false;
        }
        audio.setAmbience('space');
        const go = G.autoRoute;
        G.autoKeep = true;
        setAuto(null);
        G.autoRoute = go;
      }
      G.landed = null;
      hideLanded();
      G.sys = m.sys;
      G.myId = m.id;
      G.view = null;
      G.ents.clear();
      G.shots = [];
      G.beams = [];
      history = [];
      G.rocks = (m.rocks || []).map(([id, x, y, r, ore, hp]) => ({ id, x, y, r, ore, hp }));
      G.rockById = new Map(G.rocks.map((k) => [k.id, k]));
      G.miningTarget = 0;
      G.miningRocks = null;
      G.mining = null;
      G.miningPressure = null;
      G.miningHazards = [];
      receiveMining(G, m);
      if (G.route.length && G.route[0] === m.sys) G.route.shift();
      drawMini();
      if (G.autoRoute && G.route.length) {
        const epoch = sessionEpoch;
        setTimeout(() => {
          if (epoch === sessionEpoch && G.autoRoute && G.view && G.route.length && !G.auto) {
            G.autoKeep = true;
            setAuto({ mode: 'jump' }, `Autopilot: next jump to ${SYS[G.route[0]].name}.`);
          }
        }, 1500);
      } else G.autoRoute = false;
      {
        const an = G.world && G.world.anomalies && G.world.anomalies[m.sys];
        if (an && ANOMALIES[an])
          toast(`${ANOMALIES[an].icon} ${ANOMALIES[an].name}: ${ANOMALIES[an].desc}`);
      }
      G.navStellar = SYS[m.sys].stellars.find((p) => p.svc.includes('L'))
        ? SYS[m.sys].stellars.find((p) => p.svc.includes('L')).id
        : null;
      break;
    case 'snap':
      onSnap(m);
      break;
    case 'toast':
      // A refused/invalid landing must release the pending autopilot rather than
      // leave a captain parked indefinitely or repeatedly request permission.
      if (
        G.auto?.mode === 'land' &&
        G.auto.sent &&
        /Too far from |Slow down to land|refuses you permission to land|Your ship is disabled/.test(
          m.msg,
        )
      )
        setAuto(null);
      toast(m.msg);
      break;
    case 'social':
    case 'dm':
    case 'dms':
    case 'trade2':
    case 'follow':
    case 'rally':
      onCoopMsg(m);
      break; // 2.6: friends, messages, trades, follow the leader
    case 'paused':
      G.paused = m.on;
      $('pausebox').classList.toggle('hidden', !m.on || G.quitting);
      break;
    case 'chat':
      chatLine(m);
      receiveShipChat(G, m);
      if (m.from && m.from !== G.myName) audio.ui('chat', 0.7);
      break;
    case 'story':
      showStory(m);
      break;
    case 'hail':
      if ($('hailbox').classList.contains('hidden')) audio.ui('hail');
      showHail(m);
      break; // 1.1
    case 'order':
      G.order = m.o;
      break;
    case 'rivals':
      G.rivals = m.list;
      // Rivals only affect Captains; preserve in-progress gestures on other tabs.
      if (!$('infobox').classList.contains('hidden') && G.itab === 'captains') renderInfo();
      break;
    case 'world': {
      // 2.5: a new trouble close by gets a beacon and a line of news
      const was = G.world && G.world.states;
      G.world = m;
      drawMini();
      refreshCompanion();
      if (was && m.states && G.sys)
        for (const [sys, st] of Object.entries(m.states))
          if (!was[sys] && SYS[sys]) {
            const r = sys === G.sys ? [] : route(SYS, G.sys, sys);
            if (r && r.length <= 3) {
              audio.ui('state', 0.6);
              toast(
                `News: ${STATES[st.k] ? STATES[st.k].name.toLowerCase() : 'trouble'} in ${SYS[sys].name}${r.length ? `, ${r.length} jump${r.length > 1 ? 's' : ''} away` : ''}.`,
              );
              break;
            }
          }
      break;
    }
    case 'arena':
      if (m.id) {
        SYS[m.id] = SYS[m.id] || arenaSystem(m.id);
        G.arena = m;
      } else G.arena = null;
      renderTut();
      break;
    case 'boards':
      G.boards = G.boards || {};
      G.boards[m.cat] = m.list;
      if (G.landed) renderLanded();
      break;
    case 'profile':
      G.prof = m.p;
      if (!m.p) toast('No captain by that name.');
      if (G.landed) renderLanded();
      break;
    case 'notify':
      if (
        G.opts.notify &&
        document.hidden &&
        window.Notification &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification('Quantum Rift: ' + m.title, {
            body: m.body,
            icon: 'assets/stations/5.png',
          });
        } catch {}
      }
      break;
    case 'sites':
      G.sites = m.sites;
      if (G.landed) showLanded();
      refreshCompanion();
      break;
    case 'dead':
      setAuto(null);
      showDead(m);
      audio.play(10115);
      break;
  }
}

const storyQ = [];
function showStory(m) {
  if (!G.you || !m) return;
  if (!$('storybox').classList.contains('hidden')) {
    storyQ.push(m);
    return;
  } // one pop-up at a time: the rest wait their turn
  $('storyt').textContent = m.title;
  $('storyx').textContent = m.text;
  document.querySelector('#storybox .storytag').textContent = m.tag || 'STORY';
  $('storyb').innerHTML = m.done
    ? '<button class="btn" id="storyok">CONTINUE</button>'
    : `<button class="btn sm" id="storyno">${m.ref || 'Not now'}</button><button class="btn" id="storyyes">${m.acc || 'Accept'}</button>`;
  $('storybox').classList.remove('hidden');
  audio.ui(/QUEST|SIDE STORY/.test(m.tag || '') ? 'quest' : m.done ? 'complete' : 'ping', 0.7); // 2.5: story beats have their own sting
  const close = () => {
    $('storybox').classList.add('hidden');
    if (storyQ.length) {
      const epoch = sessionEpoch;
      setTimeout(() => {
        if (epoch === sessionEpoch) showStory(storyQ.shift());
      }, 150);
    }
  };
  if (m.done) $('storyok').onclick = close;
  else {
    $('storyno').onclick = close;
    $('storyyes').onclick = () => {
      send(m.arc ? { t: 'arcacc', fac: m.arc } : { t: 'storyacc', id: m.id });
      close();
    };
  }
}
window.addEventListener('rift-story', (e) => showStory(e.detail));
window.addEventListener('rift-toast-sound', (e) =>
  audio.ui(e.detail, e.detail === 'complete' || e.detail === 'alert' ? 0.8 : 0.55),
);
setInterval(() => {
  if (G.you && G.ctab === 'missions') drawMini();
}, 10000); // keeps rush countdowns current
// ------------------------------------------------------------------ snapshots and prediction
function onSnap(m) {
  receiveMining(G, m);
  G.combat = m.combat || {};
  G.formation = !!m.formation;
  $('combatcontrols').classList.remove('hidden');
  $('combatstatus').textContent =
    ' · ' +
    (G.combat.status || 'OFF') +
    (G.combat.target ? ' · Target #' + G.combat.target : '') +
    (G.combat.reason ? ' · ' + G.combat.reason : '');
  $('combatassist').textContent = G.combat.on ? 'ASSIST ON' : 'COMBAT ASSIST';
  $('combatdelegate').checked = !!G.combat.consent;
  $('combatcoordinate').checked = !!G.combat.coordinating;
  const now = performance.now();
  lastSnapT = now;
  const [id, ack, x, y, vx, vy, a, sh, ar, fu, tgt, ammo] = m.me;
  G.myId = id;
  const seen = new Set();
  for (const r of m.ships) {
    const [eid, hull, ex, ey, ea, evx, evy, fl, esh, ear, fac, name, owner, pw] = r;
    seen.add(eid);
    let e = G.ents.get(eid);
    if (!e) {
      e = { id: eid, rx: ex, ry: ey };
      G.ents.set(eid, e);
    }
    Object.assign(e, {
      hull,
      x: ex,
      y: ey,
      a: ea / 1000,
      vx: evx,
      vy: evy,
      fl,
      sh: esh,
      ar: ear,
      fac,
      name,
      owner,
      pw,
      t: now,
    });
    if (Math.hypot(e.rx - ex, e.ry - ey) > 400) {
      e.rx = ex;
      e.ry = ey;
    }
  }
  for (const k of [...G.ents.keys()]) if (!seen.has(k)) G.ents.delete(k);
  G.shots = m.shots.map(([sx, sy, svx, svy, w]) => ({ x: sx, y: sy, vx: svx, vy: svy, w, t: now }));
  G.beams = m.beams.map(([bid, ba, len, w]) => ({ id: bid, a: ba, len, w }));
  G.loot = m.loot.map(([lid, lx, ly, kind]) => ({ id: lid, x: lx, y: ly, kind }));
  for (const [w, n] of ammo) G.ammo[w] = n;
  if (!G.target || !G.ents.has(G.target))
    G.target = tgt && G.ents.has(tgt) ? tgt : G.target && !G.ents.has(G.target) ? 0 : G.target;
  // reconcile own ship: take the server state, replay inputs it has not seen yet
  const me0 = G.ents.get(id);
  if (me0) G.myHull = me0.hull;
  const v = G.view || { id, rx: x, ry: y, ox: 0, oy: 0 };
  const prevX = G.view ? G.view.x : x,
    prevY = G.view ? G.view.y : y;
  Object.assign(v, { id, x, y, vx, vy, a, shield: sh, armor: ar, fuel: fu, fl: me0 ? me0.fl : 0 });
  history = history.filter((h) => h.seq > ack);
  const st = G.you && G.you.shipStats;
  if (
    st &&
    me0 &&
    !(me0.fl & 8) &&
    !(G.combat.on || G.combat.delegated) &&
    !(G.formation && !G.auto)
  )
    for (const h of history) step(v, st, h.inp);
  if (G.view) {
    v.ox += prevX - v.x;
    v.oy += prevY - v.y;
    if (Math.hypot(v.ox, v.oy) > 300) v.ox = v.oy = 0;
  }
  G.view = v;
  {
    // 2.0 audio feedback: low shields, target lock, jump
    const st2 = G.you && G.you.shipStats,
      shp = st2 ? v.shield / Math.max(1, st2.shield) : 1;
    if (shp < 0.25 && !G._lowSh && v.armor < (st2 ? st2.armor : 1)) {
      G._lowSh = true;
      audio.ui('lowshield');
    } else if (shp > 0.45) G._lowSh = false;
    if (G.target && G.target !== G._lastTgt) audio.ui('lock', 0.7);
    G._lastTgt = G.target;
    if (v.fl & 8 && !G._jumping) {
      G._jumping = true;
      G._jumpStart = performance.now();
      audio.ui(G.you && G.you.shipStats && G.you.shipStats.jumpFast ? 'jumpfast' : 'jump', 0.9);
    } else if (!(v.fl & 8) && G._jumping && performance.now() - G._jumpStart > 2500)
      G._jumping = false; // 2.1: the jump event usually starts it first
    if (G._lastAr != null && v.armor < G._lastAr - 0.5) {
      G._hurtT = performance.now();
    }
    G._lastAr = v.armor;
  }
  for (const ev of m.ev) onEvent(ev);
}
function onEvent(ev) {
  const me = G.view,
    dx = me ? ev[1] - me.x : 0,
    dy = me ? ev[2] - me.y : 0;
  switch (ev[0]) {
    case 'snd':
      audio.play(ev[1], ev[2] - (me ? me.x : 0), ev[3] - (me ? me.y : 0), 0.55);
      break;
    case 'boom': {
      boom(ev[1], ev[2], ev[3]);
      audio.play(ev[3] > 120 ? 10115 : 241, dx, dy, 0.8);
      const d = Math.hypot(dx, dy);
      if (d < 900) addShake(Math.min(10, ev[3] / 25) * (1 - d / 900));
      break;
    }
    case 'hit': {
      spark(ev[1], ev[2], weaponColor(G.A.weapons[ev[3]]));
      if (ev.length > 4) {
        const [, x, y, , tid, dmg, src, sh] = ev;
        if (sh) shieldHit(tid, x, y);
        if (G.opts.dmg && (src === G.myId || tid === G.myId))
          dmgNumber(x, y - 10, dmg, src === G.myId);
        if (tid === G.myId) addShake(Math.min(4, 1 + dmg / 60));
      }
      break;
    }
    case 'blast':
      blast(ev[1], ev[2], ev[3]);
      break;
    case 'rock': {
      const k = G.rockById && G.rockById.get(ev[1]);
      if (k) k.hp = ev[2];
      break;
    }
    case 'flash':
      flash(ev[1], ev[2]);
      if (Math.hypot(dx, dy) > 80) audio.play('jumpfar', dx, dy, 0.8);
      break; // 2.1: your own jump has its own sound
    case 'jump':
      if (ev[1] === G.myId && !G._jumping) {
        G._jumping = true;
        G._jumpStart = performance.now();
        audio.ui(G.you && G.you.shipStats && G.you.shipStats.jumpFast ? 'jumpfast' : 'jump', 0.9);
      }
      break; // 2.1: the spool starts the moment the server begins your jump
    case 'pickup':
      audio.play(10112, 0, 0, 0.6);
      break;
    case 'flee':
      if (ev[1] === G.target) {
        const e = G.ents.get(ev[1]);
        toast(
          `${(e && e.name) || (e && G.A.ships[e.hull] ? 'The ' + G.A.ships[e.hull].name : 'Your target')} breaks off and runs for the jump point!`,
        );
      }
      break; // 2.4
  }
}

// ------------------------------------------------------------------ input
const typing = () =>
  document.activeElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
    document.activeElement.isContentEditable);
window.addEventListener('keydown', (e) => {
  if (
    (e.key === 'Enter' || e.key === ' ') &&
    !$('storybox').classList.contains('hidden') &&
    $('storyok')
  ) {
    e.preventDefault();
    $('storyok').click();
    return;
  } // 2.5.2: Enter or Space continues a story pop-up
  if (e.key === 'Enter' && G.you) {
    const c = $('chatin');
    if (document.activeElement === c) {
      sendChat();
      c.blur();
    } else if (!typing()) {
      c.focus();
    }
    e.preventDefault();
    return;
  }
  if (typing()) {
    if (e.key === 'Escape') document.activeElement.blur();
    return;
  }
  if (!G.you) return;
  audio.unlock();
  keys[e.code] = true;
  if (
    ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code) ||
    actionOf(e.code)
  )
    e.preventDefault();
  if (e.repeat) return;
  if (e.code === 'Escape') {
    closeMap();
    G.target = 0;
    send({ t: 'target', id: 0 });
    return;
  }
  if (e.code === 'KeyO') {
    openOpts();
    return;
  }
  if (G.landed && actionOf(e.code) === 'land' && !$('depart').disabled) {
    send({ t: 'depart' });
    return;
  } // 1.0.3: L leaves the dock too
  if (G.landed && /^Digit[1-9]$/.test(e.code) && G._ltabs) {
    const k = G._ltabs[+e.code.slice(5) - 1];
    if (k) {
      G.ltab = k;
      G.sel = null;
      showLanded();
      audio.ui('tab', 0.7);
    }
    return;
  } // 2.0: number keys pick landing tabs
  if (e.key === '?' || e.code === 'F1') {
    e.preventDefault();
    openControls();
    return;
  }
  switch (actionOf(e.code)) {
    case 'miningPanel':
    case 'towDeliver':
    case 'towOffer':
    case 'towAccept':
    case 'miningGroup':
    case 'dredgeInput':
    case 'dredgeOff':
    case 'towToggle':
    case 'dredgeSweep':
    case 'dredgeHarvest':
    case 'dredgeSmelter':
      miningUI.invokeMiningAction(actionOf(e.code));
      break;
    case 'surveyPulse':
      miningUI.invokeMiningAction('surveyPulse');
      break;
    case 'target':
      cycleTarget(e.shiftKey ? -1 : 1);
      break;
    case 'nearest':
      nearestHostile();
      break;
    case 'land':
      landRequest();
      break;
    case 'map':
      $('gmap').classList.contains('hidden') ? openMap() : closeMap();
      break;
    case 'jump':
      jumpNext();
      break;
    case 'zoomin':
      G.zoom = Math.min(2, G.zoom * 1.15);
      break;
    case 'zoomout':
      G.zoom = Math.max(0.35, G.zoom / 1.15);
      break;
    case 'pause':
      if (G.solo) send({ t: 'pause' });
      break;
    case 'mute':
      G.opts.mute = !G.opts.mute;
      applyOpts();
      saveOpts();
      volUi();
      toast(G.opts.mute ? 'Sound muted (N to unmute).' : 'Sound on.');
      break; // 2.1
    case 'board':
      openBoard();
      break;
    case 'hailInbox':
      send({ t: 'hailin', op: 'list' });
      hailUI.inbox();
      break;
    case 'hail':
      hailTarget();
      break;
    case 'info':
      $('infobox').classList.contains('hidden') ? openInfo() : closeInfo();
      break;
    case 'stop':
      setAuto({ mode: 'stop' }, null);
      break;
    case 'ordAttack':
      send({ t: 'order', o: 'attack' });
      break;
    case 'ordGather':
      send({ t: 'order', o: 'gather' });
      break;
    case 'ordHold':
      send({ t: 'order', o: 'hold' });
      break;
    case 'ordFire':
      send({ t: 'order', o: 'holdfire' });
      break;
    case 'ordLoot':
      send({ t: 'order', o: 'loot' });
      break;
    case 'companion': {
      const T = [
        'radio',
        'codex',
        'missions',
        'station',
        'ops',
        ...(G.solo ? [] : ['captains']),
        'log',
      ];
      ctab(T[(T.indexOf(G.ctab) + 1) % T.length]);
      break;
    }
  }
});
window.addEventListener('keyup', (e) => {
  keys[e.code] = false;
});
window.addEventListener('blur', () => {
  keys = {};
});
function jumpNext() {
  if (!G.route.length) return toast('Plot a course on the map first (M).');
  G.autoRoute = G.route.length > 1; // 1.1: J flies the whole plotted route, jump after jump
  const S = SYS[G.sys];
  if (S && S.gate === G.route[0]) {
    const w = S.stellars.find((p) => p.wormhole);
    if (w) {
      G.navStellar = w.id;
      toast(`The next leg crosses ${w.name}: fly into the wormhole.`);
    }
    return;
  }
  const me = G.view;
  if (me && S && S.stellars.some((p) => Math.hypot(me.x - p.x, me.y - p.y) < K.jumpClear)) {
    setAuto(
      { mode: 'jump' },
      'Autopilot: flying clear of the planets to jump. Steer to take over.',
    );
    return;
  } // 1.0.3
  send({ t: 'jump', to: G.route[0] });
}
// ------------------------------------------------------------------ 1.1 hailing
function hailTarget() {
  if (G.target && G.ents.get(G.target)) return send({ t: 'hail', id: G.target });
  if (G.navStellar) return send({ t: 'hail', stellar: G.navStellar });
  toast('Target a ship (click or Tab) or select a planet (click it) to hail.');
}
const hailUI = initHails({ G, send, toast, cam });
function showHail(m) {
  hailUI.show(m);
}

window.addEventListener(
  'keydown',
  (e) => {
    if (
      !$('hailbox').classList.contains('hidden') &&
      (e.key === 'Escape' || (e.code === 'KeyT' && !typing()))
    ) {
      $('hailbox').classList.add('hidden');
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);
// ship and captain info (I)
function openInfo() {
  audio.ui('open', 0.6);
  $('infobox').classList.remove('hidden');
  send({ t: 'rivals' });
  renderInfo();
}
function closeInfo() {
  audio.ui('close', 0.6);
  $('infobox').classList.add('hidden');
}
function renderInfo() {
  $('infobody').innerHTML = infoHtml(G, G.itab || 'ship');
}
$('itabs').addEventListener('click', (e) => {
  const b = e.target.closest('[data-it]');
  if (!b) return;
  G.itab = b.dataset.it;
  $('itabs')
    .querySelectorAll('button')
    .forEach((x) => x.classList.toggle('on', x === b));
  renderInfo();
});
$('infobody').addEventListener('click', (e) => {
  const pl = e.target.closest('[data-plot]');
  if (pl) {
    plot(pl.dataset.plot);
    toast(`Course plotted to ${SYS[pl.dataset.plot].name}.`);
    return;
  }
  const b = e.target.closest('[data-jet],[data-ord]');
  if (!b) return;
  if (b.dataset.jet) {
    const lots = b.dataset.grade
      ? { common: 0, rich: 0, pure: 0, [b.dataset.grade]: +b.dataset.n }
      : undefined;
    send({ t: 'jettison', cid: b.dataset.jet, n: +b.dataset.n || 0, lots });
  } else send({ t: 'order', o: b.dataset.ord });
  const epoch = sessionEpoch;
  setTimeout(() => {
    if (epoch === sessionEpoch && G.you) renderInfo();
  }, 250);
});
window.addEventListener(
  'keydown',
  (e) => {
    if (
      !$('infobox').classList.contains('hidden') &&
      (e.key === 'Escape' || e.code === 'KeyI') &&
      !typing()
    ) {
      closeInfo();
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);
// ------------------------------------------------------------------ 1.0.3 autopilot: fly to a planet, turn, brake and land; or fly clear and jump
G.startAutoJump = () => {
  const epoch = sessionEpoch;
  return setTimeout(() => {
    if (epoch !== sessionEpoch) return;
    if (G.view && G.route.length && !G.auto) {
      G.autoKeep = true;
      setAuto({ mode: 'jump' }, `Autopilot: following to ${SYS[G.route[0]].name}.`);
    }
  }, 300);
}; // 2.6: follow the leader
function setAuto(a, msg) {
  if (a && (G.towing || G.you?.towing)?.attached) {
    toast('Towing: manual flight only; detach before automatic transit.');
    return;
  }
  if (a) {
    send({ t: 'combat', op: 'off' });
    G.combat = {};
  }
  if (a && !G.auto) audio.ui('autopilot', 0.8);
  G.auto = a;
  if (!a) G.autoRoute = G.autoRoute && G.autoKeep;
  G.autoKeep = false;
  $('autobadge').classList.toggle('hidden', !a);
  if (a) {
    $('autobadge').textContent =
      a.mode === 'land'
        ? 'AUTOPILOT · LANDING'
        : a.mode === 'gateway'
          ? 'AUTOPILOT · GATEWAY'
          : a.mode === 'stop'
            ? 'FULL STOP'
            : G.autoRoute && G.route.length > 1
              ? `AUTOPILOT · ${G.route.length} JUMPS`
              : 'AUTOPILOT · JUMP';
    if (msg) toast(msg);
  }
}
function autopilot(inp) {
  const me = G.view,
    st = G.you && G.you.shipStats,
    A = G.auto,
    S = SYS[G.sys];
  if (!me || !st || !S) return setAuto(null);
  if (A.mode !== 'stop') {
    const destination =
      A.mode === 'land' || A.mode === 'gateway'
        ? S.stellars.find((p) => p.id === A.id)
        : (() => {
            const to = SYS[G.route[0]];
            if (!to) return null;
            const a = Math.atan2(to.x - S.x, -(to.y - S.y));
            return {
              x: me.x + Math.sin(a) * (K.jumpClear + 1000),
              y: me.y - Math.cos(a) * (K.jumpClear + 1000),
            };
          })();
    const speed = Math.hypot(me.vx, me.vy);
    const stoppingMargin =
      1000 +
      (speed * Math.PI) / Math.max(0.1, st.turn) +
      (speed * speed) / (2 * Math.max(1, st.accel));
    if (destination && coronaRouteBlocked(G.sys, me, destination, stoppingMargin)) {
      G.autoRoute = false;
      setAuto({ mode: 'stop' });
      toast(
        'Autopilot blocked: stellar collector keep-out. Braking; use manual flight to exit or harvest.',
      );
      return autopilot(inp);
    }
  }
  if (A.mode === 'stop') {
    // 1.1: full stop: turn against your drift and burn until still
    const sp = Math.hypot(me.vx, me.vy);
    if (sp < 6) {
      inp.thrust = 0;
      return setAuto(null);
    }
    const da = wrap(Math.atan2(-me.vx, me.vy) - me.a);
    inp.turn = Math.abs(da) < st.turn * DT ? 0 : Math.sign(da);
    inp.thrust = Math.abs(da) < 0.25 && sp > 6 ? 1 : 0;
    inp.rev = 0;
    return;
  }
  if (A.mode === 'gateway') {
    const p = S.stellars.find((x) => x.id === A.id && x.wormhole);
    if (!p || A.sys !== G.sys) return setAuto(null);
    // Aim inside the transit aperture; never send a landing request.
    gatewayGuidance(me, st, p, inp);
    return;
  }
  if (A.mode === 'land') {
    const p = S.stellars.find((x) => x.id === A.id);
    if (!p) return setAuto(null);
    landingGuidance(A, me, st, p, inp);
    if (landingReady(A, me, G.ents.get(G.myId), st, p, performance.now()))
      send({ t: 'land', stellar: p.id });
  } else {
    const to = SYS[G.route[0]];
    if (!to) return setAuto(null);
    if (S.stellars.every((p) => Math.hypot(me.x - p.x, me.y - p.y) > K.jumpClear + 60)) {
      const go = G.autoRoute;
      G.autoKeep = true;
      setAuto(null);
      inp.thrust = 0;
      jumpNext();
      G.autoRoute = go && G.route.length > 1;
      return;
    }
    const ang = Math.atan2(to.x - S.x, -(to.y - S.y)),
      da = wrap(ang - me.a);
    inp.turn = Math.abs(da) < st.turn * DT ? 0 : Math.sign(da);
    inp.thrust = Math.abs(da) < 0.5 ? 1 : 0;
    inp.rev = 0;
  }
}
function sendChat() {
  const c = $('chatin'),
    v = c.value.trim();
  c.value = '';
  if (!v) return;
  if (G.solo) {
    send({ t: 'note', text: v });
    toast('Added to your log.');
    return;
  } // 2.4: in a solo game the chat line writes notes in your captain's log
  if (v.startsWith('/s ')) send({ t: 'chat', msg: v.slice(3), ch: 'sys' });
  else if (v.startsWith('/a ') || v.startsWith('/f '))
    send({ t: 'chat', msg: v.slice(3), ch: 'armada' });
  else if (/^\/r \S/.test(v) && G.lastDmFrom)
    send({ t: 'social', op: 'dm', name: G.lastDmFrom, msg: v.slice(3) });
  else if (/^\/w \S/.test(v)) {
    const m = v.match(/^\/w ("[^"]+"|\S+) (.+)$/);
    if (m) send({ t: 'social', op: 'dm', name: m[1].replace(/"/g, ''), msg: m[2] });
  } else if (G.chan) send({ t: 'chat', msg: v, ch: G.chan });
  else send({ t: 'chat', msg: v });
}
// 1.0.1 command bar: chat channel buttons, the controls card, and shortcuts to key bindings, options and the map
$('cchan').addEventListener('click', (e) => {
  const b = e.target.closest('[data-ch]');
  if (!b) return;
  G.chan = b.dataset.ch;
  $('cchan')
    .querySelectorAll('button')
    .forEach((x) => x.classList.toggle('on', x === b));
  $('chatin').placeholder =
    G.chan === 'sys'
      ? 'Press Enter to talk to this system'
      : G.chan === 'fleet'
        ? 'Press Enter to talk to your fleet'
        : 'Press Enter to chat';
  $('chatin').focus();
});
const BASICS = [
  ['Left click', 'Target a ship, or plot a course on the map'],
  ['Double click', 'Land on a planet/station, or fly through a Gateway'],
  ['Mouse wheel', 'Zoom'],
  ['Enter', 'Chat'],
  ['O', 'Options'],
  ['Esc', 'Close a window / open log out confirmation'],
];
/**
 * Opens the flight and keyboard controls reference dialog modal.
 * @returns {void}
 */
function openControls() {
  audio.ui('open', 0.6);
  $('ctrllist').innerHTML =
    '<div class="osect">FLIGHT AND COMBAT</div><div class="ctrlgrid">' +
    ACTIONS.map(
      ([a, n]) =>
        `<span class="k">${keyName(bound(a))}${ALT[a] ? ' / ' + keyName(ALT[a]) : ''}</span><span>${n}</span>`,
    ).join('') +
    '</div>' +
    '<div class="osect">MOUSE AND MENUS</div><div class="ctrlgrid">' +
    BASICS.map(([k, n]) => `<span class="k">${k}</span><span>${n}</span>`).join('') +
    '</div>';
  $('ctrlbox').classList.remove('hidden');
}
/**
 * Closes the flight controls reference dialog modal.
 * @returns {void}
 */
const closeControls = () => $('ctrlbox').classList.add('hidden');
$('cbhelp').onclick = openControls;
$('ctrlclose').onclick = closeControls;
$('ctrlkeys').onclick = () => {
  closeControls();
  openOpts(true);
};
$('cbkeys').onclick = () => openOpts(true);
$('cbmap').onclick = () => ($('gmap').classList.contains('hidden') ? openMap() : closeMap());
/**
 * Cycles target lock through visible ships sorted by distance.
 * @param {number} dir Direction offset in target list (-1 for previous, 1 for next)
 * @returns {void}
 */
function cycleTarget(dir) {
  const me = G.view;
  if (!me) return;
  const list = [...G.ents.values()]
    .filter((e) => e.id !== G.myId)
    .sort(
      (a, b) => Math.hypot(a.rx - me.rx, a.ry - me.ry) - Math.hypot(b.rx - me.rx, b.ry - me.ry),
    );
  if (!list.length) return;
  const i = list.findIndex((e) => e.id === G.target);
  const n = list[(i + dir + list.length) % list.length];
  G.target = n.id;
  send({ t: 'target', id: n.id });
}
/**
 * Finds and targets the nearest hostile ship in the current system.
 * @returns {void}
 */
function nearestHostile() {
  const me = G.view;
  if (!me) return;
  const list = [...G.ents.values()]
    .filter((e) => G.hostile(e))
    .sort(
      (a, b) => Math.hypot(a.rx - me.rx, a.ry - me.ry) - Math.hypot(b.rx - me.rx, b.ry - me.ry),
    );
  if (list.length) {
    G.target = list[0].id;
    send({ t: 'target', id: list[0].id });
  } else toast('No hostiles nearby.');
}
/**
 * Requests docking/landing on a specified or nearest landable stellar object.
 * @param {{ id: string, name: string, x: number, y: number, r: number, svc: string[] }} [pick] Optional targeted stellar body
 * @returns {void}
 */
function landRequest(pick) {
  const me = G.view,
    S = SYS[G.sys];
  if (!me || !S) return;
  const near = S.stellars
    .filter((p) => p.svc.includes('L'))
    .sort((a, b) => Math.hypot(a.x - me.x, a.y - me.y) - Math.hypot(b.x - me.x, b.y - me.y))[0];
  // L always chooses the nearest landable body; explicit double-clicks keep their destination.
  const p = pick || near;
  if (!p) return toast('Nowhere to land in this system.');
  G.navStellar = p.id;
  // Even a nearby click must settle first: predicted distance alone can race
  // the server at the edge of its landing radius while the ship is drifting.
  setAuto({ mode: 'land', id: p.id }, `Autopilot: landing on ${p.name}. Steer to take over.`);
}

// ------------------------------------------------------------------ mouse: click to target, click a planet to set nav, double-click to land
const mouse = { x: 0, y: 0, wx: 0, wy: 0, in: false, down: false };
/**
 * Converts screen/canvas client coordinates to game world space coordinates.
 * @param {number} cx Client X coordinate
 * @param {number} cy Client Y coordinate
 * @returns {[number, number]} World coordinates [wx, wy]
 */
function toWorld(cx, cy) {
  const r = window.devicePixelRatio || 1,
    rect = canvas.getBoundingClientRect();
  return [
    ((cx - rect.left) * r - cam.W / 2) / cam.z + cam.cx,
    ((cy - rect.top) * r - cam.H / 2) / cam.z + cam.cy,
  ];
}
/**
 * Identifies the nearest interactive ship or stellar body under the given world coordinates.
 * @param {number} wx World X coordinate
 * @param {number} wy World Y coordinate
 * @returns {{ ship?: ClientEntity, stellar?: import('../server/game.js').StellarBody } | null} Picked target or null
 */
function pickAt(wx, wy) {
  if (!G.view || G.landed) return null;
  let best = null,
    bd = Infinity;
  for (const e of G.ents.values()) {
    if (e.id === G.myId) continue;
    const H = G.A.ships[e.hull];
    const r = Math.max(16 / cam.z, (H ? H.size : 50) * G.spriteScale * 0.42),
      d = Math.hypot(e.rx - wx, e.ry - wy);
    if (d < r && d < bd) {
      bd = d;
      best = { ship: e };
    }
  }
  if (best) return best;
  const S = SYS[G.sys];
  if (!S) return null;
  for (const p of S.stellars) {
    const d = Math.hypot(p.x - wx, p.y - wy);
    if (d < p.r * (p.hub ? 1 : 1.15) + 10 / cam.z && d < bd) {
      bd = d;
      best = { stellar: p };
    }
  }
  return best;
}
/**
 * Determines the appropriate mouse cursor style based on hover target.
 * @param {{ ship?: ClientEntity, stellar?: import('../server/game.js').StellarBody } | null} h Picked object under cursor
 * @returns {string} CSS cursor identifier class suffix
 */
function cursorFor(h) {
  if (G.opts.mouseAim && !h) return 'aim';
  if (!h) return '';
  if (h.ship)
    return G.hostile(h.ship)
      ? 'hostile'
      : h.ship.owner === G.myId
        ? 'friendly'
        : h.ship.fl & 16
          ? 'friendly'
          : 'neutral';
  return h.stellar.svc.includes('L') ? 'land' : '';
}
/**
 * Applies a cursor CSS class to the canvas element.
 * @param {string} c Cursor type name
 * @returns {void}
 */
function setCursor(c) {
  if (canvas.dataset.cur !== c) {
    canvas.dataset.cur = c;
    canvas.className = c ? 'cur-' + c : '';
  }
}
/**
 * Sets the active target ID and notifies the server.
 * @param {number} id Target entity ID or 0 to clear
 * @returns {void}
 */
function setTarget(id) {
  G.target = id;
  send({ t: 'target', id });
}
canvas.addEventListener('mousemove', (e) => {
  if (
    G.opts.mouseAim &&
    (e.movementX || e.movementY) &&
    G.combat &&
    (G.combat.on || G.combat.delegated)
  ) {
    send({ t: 'combat', op: 'manual' });
    G.combat.on = G.combat.delegated = false;
  }
  mouse.x = e.clientX;
  mouse.y = e.clientY;
  mouse.in = true;
  if (G._look) {
    const dx = e.clientX - G._look.x,
      dy = e.clientY - G._look.y;
    if (Math.hypot(dx, dy) > 6) G._look.moved = true;
    const r = canvas.getBoundingClientRect(),
      k = canvas.width / r.width,
      m = 3200,
      L = 2.4 / G.zoom;
    G._lookT = [Math.max(-m, Math.min(m, dx * k * L)), Math.max(-m, Math.min(m, dy * k * L))];
  }
  [mouse.wx, mouse.wy] = toWorld(e.clientX, e.clientY);
  const h = pickAt(mouse.wx, mouse.wy);
  G.hover = h && h.ship ? h.ship.id : 0;
  G.hoverStellar = h && h.stellar ? h.stellar.id : null;
  setCursor(cursorFor(h));
});
canvas.addEventListener('mouseleave', () => {
  mouse.in = false;
  mouse.down = false;
  G.hover = 0;
  G.hoverStellar = null;
});
canvas.addEventListener('mousedown', (e) => {
  if (!G.you || G.landed) return;
  audio.unlock();
  if (document.activeElement && document.activeElement.tagName === 'INPUT')
    document.activeElement.blur();
  const [wx, wy] = toWorld(e.clientX, e.clientY),
    h = pickAt(wx, wy);
  if (e.button === 2) {
    G._look = { t: performance.now(), x: e.clientX, y: e.clientY, moved: false };
    return;
  } // 2.1: hold right-click and move to look ahead (a quick click still clears your target)
  if (e.button !== 0) return;
  if (h && h.ship) {
    setTarget(h.ship.id);
    return;
  }
  if (h && h.stellar) {
    G.navStellar = h.stellar.id;
    toast(
      `Nav: ${h.stellar.name}${h.stellar.svc.includes('L') ? ' (double-click to land; L chooses nearest)' : ''}`,
    );
    return;
  }
  const rock = (G.rocks || []).find((k) => k.hp && Math.hypot(k.x - wx, k.y - wy) <= k.r + 8);
  if (rock) G.miningTarget = rock.id;
  const tow = (G.towing || G.you?.towing)?.objects.find(
    (o) => !['delivered', 'destroyed'].includes(o.status) && Math.hypot(o.x - wx, o.y - wy) < 52,
  );
  if (tow) {
    G.towTarget = tow.id;
    return;
  }
  if (G.opts.mouseAim) mouse.down = true; // mouse-aim mode: hold the left button on open space to fire
});
window.addEventListener('mouseup', (e) => {
  mouse.down = false;
  if (e.button === 2 && G._look) {
    if (!G._look.moved && performance.now() - G._look.t < 300) setTarget(0);
    G._look = null;
    G._lookT = null;
  } // the view eases back to your ship
});
canvas.addEventListener('dblclick', (e) => {
  if (!G.you || G.landed) return;
  const [wx, wy] = toWorld(e.clientX, e.clientY),
    h = pickAt(wx, wy);
  if (h?.stellar?.wormhole) {
    G.navStellar = h.stellar.id;
    setAuto(
      { mode: 'gateway', id: h.stellar.id, sys: G.sys },
      `Autopilot: through ${h.stellar.name}. Steer to take over.`,
    );
  } else if (h && h.stellar && h.stellar.svc.includes('L')) landRequest(h.stellar);
});
canvas.addEventListener('contextmenu', (e) => e.preventDefault());
canvas.addEventListener(
  'wheel',
  (e) => {
    if (!G.view) return;
    e.preventDefault();
    G.zoom = e.deltaY < 0 ? Math.min(2, G.zoom * 1.1) : Math.max(0.35, G.zoom / 1.1);
  },
  { passive: false },
);
// radar: click a blip to target it
$('radar').addEventListener('mousedown', (e) => {
  const me = G.view;
  if (!me) return;
  const rc = $('radar'),
    rect = rc.getBoundingClientRect(),
    r = rc.width / rect.width,
    mx = (e.clientX - rect.left) * r,
    my = (e.clientY - rect.top) * r;
  const W = rc.width,
    H = rc.height,
    k = (H / 2 / (G.radarR || 4200)) * 1.15;
  let best = null,
    bd = 10 * r;
  for (const en of G.ents.values()) {
    if (en.id === G.myId) continue;
    const d = Math.hypot(W / 2 + (en.rx - me.rx) * k - mx, H / 2 + (en.ry - me.ry) * k - my);
    if (d < bd) {
      bd = d;
      best = en;
    }
  }
  if (best) setTarget(best.id);
  else if (e.button === 2) setTarget(0);
});
$('radar').addEventListener('contextmenu', (e) => e.preventDefault());

// ------------------------------------------------------------------ boarding (B next to a disabled ship)
/**
 * Opens the ship boarding interface modal if alongside a disabled ship.
 * @returns {void}
 */
function openBoard() {
  const t = G.target ? G.ents.get(G.target) : null,
    me = G.view;
  if (!t || !(t.fl & 4)) return toast('Target a disabled ship to board it.');
  const H = G.A.ships[t.hull],
    d = Math.hypot(t.rx - me.rx, t.ry - me.ry);
  if (d > Math.max(120, (H.size + G.A.ships[G.myHull || G.you.ship.hull].size) * 0.5))
    return toast('Move alongside to board.');
  $('boardin').innerHTML = boardHtml(G, t);
  $('boardbox').classList.remove('hidden');
  G.boarding = t.id;
}
/**
 * Closes the ship boarding action modal.
 * @returns {void}
 */
function closeBoard() {
  $('boardbox').classList.add('hidden');
  G.boarding = 0;
}
/**
 * Sends a boarding action command (plunder, capture, rescue) to the server.
 * @param {string} act Boarding action type ('plunder' | 'capture' | 'rescue')
 * @returns {void}
 */
function doBoard(act) {
  if (act && G.boarding) send({ t: 'board', id: G.boarding, act });
  closeBoard();
}
$('boardin').addEventListener('click', (e) => {
  const b = e.target.closest('[data-board]');
  if (b && !b.disabled) doBoard(b.dataset.board);
});
window.addEventListener(
  'keydown',
  (e) => {
    if ($('boardbox').classList.contains('hidden')) return;
    const k = { Digit1: 'plunder', Digit2: 'capture', Digit3: 'rescue' }[e.code];
    if (k) {
      const b = $('boardin').querySelector(`[data-board="${k}"]`);
      if (b && !b.disabled) doBoard(k);
      e.stopImmediatePropagation();
      e.preventDefault();
    } else if (e.key === 'Escape') {
      closeBoard();
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  },
  true,
);

// ------------------------------------------------------------------ tutorial panel
/**
 * Updates the career tutorial guide widget with current stage info.
 * @returns {void}
 */
function renderTut() {
  const i = G.you ? G.you.tut : TUTORIAL.length,
    T = TUTORIAL[i];
  $('tut').classList.toggle('hidden', !T || !!G.arena || !!(G.you && G.you.duel && G.you.duel.on)); // 2.6: out of the way in the Crucible and in duels
  if (!T) return;
  $('tutn').textContent = `CAREER ${i + 1} / ${TUTORIAL.length}`;
  $('tutt').textContent = T.title;
  $('tutx').textContent = T.text;
  $('tutr').textContent =
    `Reward: ${T.reward.toLocaleString()} cr${T.mat ? ` + ${T.mat[0]} crate` : ''}`;
}
$('tutn').parentElement.style.cursor = 'pointer';
$('tutn').title = 'Click to collapse or expand';
$('tutn').onclick = () => {
  G.opts.tutMin = !G.opts.tutMin;
  saveOpts();
  $('tut').classList.toggle('mini', !!G.opts.tutMin);
}; // 2.0: the career panel folds away
$('tut').classList.toggle('mini', !!G.opts.tutMin);
$('tutskip').onclick = () => {
  ask('Hide the career guide? You will not get the remaining rewards.', () =>
    send({ t: 'tutskip' }),
  );
};

// ------------------------------------------------------------------ options
const CHECKS = ['dmg', 'shake', 'mouseAim', 'notify', 'cb', 'mute'];
let rebinding = null;
/**
 * Formats a KeyboardEvent.code string into a readable label.
 * @param {string} c KeyboardEvent code
 * @returns {string} Human-friendly key name
 */
const keyName = (c) =>
  !c
    ? 'assign key'
    : {
        Backquote: '`',
        BracketLeft: '[',
        BracketRight: ']',
        Semicolon: ';',
        Comma: ',',
        Period: '.',
        Minus: '-',
        Equal: '=',
        Backslash: '\\',
        ArrowUp: '↑',
        ArrowDown: '↓',
        ArrowLeft: '←',
        ArrowRight: '→',
        ShiftLeft: 'Shift L',
        ShiftRight: 'Shift R',
        ControlLeft: 'Ctrl L',
        ControlRight: 'Ctrl R',
        AltLeft: 'Alt L',
        AltRight: 'Alt R',
      }[c] ||
      c
        .replace(/^Key/, '')
        .replace(/^Digit/, '')
        .replace(/^Numpad/, 'Num ');
/**
 * Renders keybinding assignment rows in the options menu.
 * @returns {void}
 */
function renderKeys() {
  $('optkeys').innerHTML = ACTIONS.map(
    ([a, n]) =>
      `<div class="kb"><span>${n}</span><button class="btn sm${rebinding === a ? ' on' : ''}" data-bind="${a}">${rebinding === a ? 'press a key…' : keyName(bound(a))}</button></div>`,
  ).join('');
  $('optkeys')
    .querySelectorAll('[data-bind]')
    .forEach(
      (b) =>
        (b.onclick = () => {
          rebinding = b.dataset.bind;
          renderKeys();
        }),
    );
}
/**
 * Opens the settings modal dialog and populates current configuration values.
 * @param {boolean} [keysFirst] Whether to scroll directly down to the keybinding section
 * @returns {void}
 */
function openOpts(keysFirst) {
  audio.ui('open', 0.6);
  $('opts').classList.remove('hidden');
  for (const k of CHECKS) $('opt-' + k).checked = !!G.opts[k];
  $('opt-scale').value = G.opts.scale;
  $('opt-vol').value = G.opts.vol;
  $('opt-sfx').value = G.opts.sfx;
  $('opt-radio').value = G.opts.radio;
  $('opt-ui').value = G.opts.ui ?? 0.8;
  $('opt-amb').value = G.opts.amb ?? 0.5;
  $('opt-music').value = G.opts.music ?? 0.6;
  rebinding = null;
  renderKeys();
  document.querySelectorAll('#opts input[type=range]').forEach(paintRange);
  if (keysFirst === true) setTimeout(() => $('optkeys').scrollIntoView({ block: 'start' }), 0);
}
/**
 * Closes the settings modal dialog.
 * @returns {void}
 */
function closeOpts() {
  audio.ui('close', 0.6);
  $('opts').classList.add('hidden');
  rebinding = null;
}
$('optclose').onclick = closeOpts;
$('optbtn').onclick = openOpts;
// 2.1: the quick volume control in the command bar: one master slider and a mute button
/**
 * Updates an HTML range input's background fill gradient according to its value.
 * @param {HTMLInputElement} el Input slider element
 * @returns {void}
 */
function paintRange(el) {
  if (!el) return;
  const p = ((el.value - el.min) / (el.max - el.min || 1)) * 100;
  el.style.background = `linear-gradient(90deg,#e0362a ${p}%,#3a0808 ${p}%)`;
} // 2.1: red fill
document.addEventListener('input', (e) => {
  if (e.target.matches && e.target.matches('input[type=range]')) paintRange(e.target);
});
/**
 * Syncs the volume quick-slider and mute button with current volume settings.
 * @returns {void}
 */
function volUi() {
  const b = $('cbvol');
  if (!b) return;
  b.textContent =
    G.opts.mute || G.opts.vol <= 0.001
      ? '🔇'
      : G.opts.vol < 0.3
        ? '🔈'
        : G.opts.vol < 0.65
          ? '🔉'
          : '🔊';
  $('qvol').value = Math.round(G.opts.vol * 100);
  paintRange($('qvol'));
  $('qvoln').textContent = G.opts.mute ? 'muted' : Math.round(G.opts.vol * 100) + '%';
  $('qmute').textContent = G.opts.mute ? 'UNMUTE' : 'MUTE';
}
$('cbvol').onclick = (e) => {
  e.stopPropagation();
  $('qvolbox').classList.toggle('hidden');
  volUi();
};
$('qvol').oninput = (e) => {
  G.opts.vol = +e.target.value / 100;
  if (G.opts.mute && G.opts.vol > 0) G.opts.mute = false;
  applyOpts();
  saveOpts();
  volUi();
};
$('qmute').onclick = () => {
  G.opts.mute = !G.opts.mute;
  applyOpts();
  saveOpts();
  volUi();
};
$('qmore').onclick = () => {
  $('qvolbox').classList.add('hidden');
  openOpts();
};
document.addEventListener('click', (e) => {
  if (!e.target.closest('#qvolbox') && e.target.id !== 'cbvol')
    $('qvolbox').classList.add('hidden');
});
volUi();
for (const k of CHECKS)
  $('opt-' + k).onchange = (e) => {
    G.opts[k] = e.target.checked;
    if (
      k === 'notify' &&
      e.target.checked &&
      window.Notification &&
      Notification.permission === 'default'
    )
      Notification.requestPermission();
    applyOpts();
    saveOpts();
  };
for (const k of ['scale', 'vol', 'sfx', 'radio', 'ui', 'amb', 'music'])
  $('opt-' + k).oninput = (e) => {
    G.opts[k] = +e.target.value;
    applyOpts();
    saveOpts();
    audio.unlock();
    if (k === 'vol' || k === 'sfx') audio.play('10100', 0, 0, 1);
    if (k === 'ui') audio.ui('click');
  };
window.addEventListener('rift-radio-vol', (e) => {
  G.opts.radio = e.detail;
  applyOpts();
  saveOpts();
});
$('optreset').onclick = () => {
  G.opts.keys = {};
  migrateBindings(G.opts, ACTIONS);
  saveOpts();
  renderKeys();
};
window.addEventListener(
  'keydown',
  (e) => {
    if (!$('ctrlbox').classList.contains('hidden')) {
      if (e.key === 'Escape' || e.key === 'Enter' || e.key === '?') {
        closeControls();
        e.preventDefault();
      }
      e.stopImmediatePropagation();
      return;
    }
    if (!$('storebox').classList.contains('hidden') && e.key === 'Escape') {
      $('storebox').classList.add('hidden');
      e.stopImmediatePropagation();
      return;
    }
    if ($('opts').classList.contains('hidden')) return;
    if (rebinding) {
      // the next key pressed becomes the binding (Escape cancels); a key used by another action is swapped off it
      e.preventDefault();
      e.stopImmediatePropagation();
      if (RESERVED_KEYS.has(e.code) && e.code !== 'Escape') {
        toast('This key is reserved for steering or a fixed interface control.');
        rebinding = null;
        renderKeys();
        return;
      } // 2.0.3
      if (e.code === 'Backspace' || e.code === 'Delete') {
        G.opts.keys[rebinding] = null;
        saveOpts();
      } else if (e.code !== 'Escape') {
        for (const [a] of ACTIONS)
          if (a !== rebinding && bound(a) === e.code) G.opts.keys[a] = bound(rebinding);
        G.opts.keys[rebinding] = e.code;
        saveOpts();
      }
      rebinding = null;
      renderKeys();
      return;
    }
    if (e.key === 'Escape' || e.key === 'Enter' || e.code === 'KeyO') {
      closeOpts();
      e.preventDefault();
    }
    e.stopImmediatePropagation(); // game keys are paused while options are open
  },
  true,
);

// ------------------------------------------------------------------ loops
/**
 * Synchronizes canvas and radar internal pixel resolutions with device pixel ratio.
 * @returns {void}
 */
function resize() {
  const r = window.devicePixelRatio || 1;
  canvas.width = canvas.clientWidth * r;
  canvas.height = canvas.clientHeight * r;
  ctx.imageSmoothingEnabled = true;
  const rc = $('radar');
  rc.width = Math.round(rc.clientWidth * r);
  rc.height = Math.round(rc.clientWidth * 0.62 * r);
}
window.addEventListener('resize', resize);
// the sidebar can be dragged wider or narrower; the width is remembered
/**
 * Updates the companion sidebar HUD width CSS variable within bounds.
 * @param {number} w Requested width in CSS pixels
 * @returns {number} Clamped width in CSS pixels
 */
function setHud(w) {
  w = Math.max(280, Math.min(Math.min(760, window.innerWidth * 0.6), w));
  document.documentElement.style.setProperty('--hud', w + 'px');
  resize();
  return w;
}
try {
  const w = +localStorage.getItem('rift.hud');
  if (w) setHud(w);
} catch {}
$('hudgrip').addEventListener('mousedown', (e) => {
  e.preventDefault();
  const g = $('hudgrip');
  g.classList.add('drag');
  const move = (ev) => {
    const w = setHud(window.innerWidth - ev.clientX);
    try {
      localStorage.setItem('rift.hud', w);
    } catch {}
  };
  const up = () => {
    g.classList.remove('drag');
    window.removeEventListener('mousemove', move);
    window.removeEventListener('mouseup', up);
    refreshCompanion();
  };
  window.addEventListener('mousemove', move);
  window.addEventListener('mouseup', up);
});
resize();
// ------------------------------------------------------------------ gamepad and touch controls
const pad = { prev: [] },
  touch = { keys: {}, stick: null };
/**
 * Reads standard Gamepad API state and maps buttons/axes to ship inputs and commands.
 * @param {InputState} inp Mutable input state object
 * @returns {void}
 */
function padInput(inp) {
  const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (!gp) return;
  const B = (i) => gp.buttons[i] && gp.buttons[i].pressed,
    edge = (i) => B(i) && !pad.prev[i],
    ax = gp.axes[0] || 0,
    ay = gp.axes[1] || 0;
  if (Math.abs(ax) > 0.35) inp.turn = Math.sign(ax);
  if (ay < -0.35 || B(7)) inp.thrust = 1;
  if (B(13) || ay > 0.6) inp.rev = 1;
  if (B(0)) inp.fire1 = 1;
  if (B(1)) inp.fire2 = 1;
  if (B(6)) inp.ab = 1;
  if (edge(2)) nearestHostile();
  if (edge(3)) landRequest();
  if (edge(4)) cycleTarget(-1);
  if (edge(5)) cycleTarget(1);
  if (edge(9)) $('gmap').classList.contains('hidden') ? openMap() : closeMap();
  if (edge(8)) openBoard();
  if (edge(12)) jumpNext();
  pad.prev = gp.buttons.map((b) => b.pressed);
}
/**
 * Polls on-screen virtual joystick and touch action buttons for input state.
 * @param {InputState} inp Mutable input state object
 * @returns {void}
 */
function touchInput(inp) {
  for (const k of ['fire1', 'fire2', 'ab']) if (touch.keys[k]) inp[k] = 1;
  const st = touch.stick;
  if (!st || !G.view) return;
  const mag = Math.hypot(st.dx, st.dy);
  if (mag < 0.2) return;
  const want = Math.atan2(st.dx, -st.dy);
  let d = want - G.view.a;
  d = Math.atan2(Math.sin(d), Math.cos(d));
  const s_ = G.you && G.you.shipStats;
  if (Math.abs(d) > (s_ ? s_.turn * DT : 0.05)) inp.turn = Math.sign(d);
  if (mag > 0.6 && Math.abs(d) < 0.8) inp.thrust = 1;
}
if ('ontouchstart' in window || (window.matchMedia && matchMedia('(pointer: coarse)').matches)) {
  $('touch').classList.remove('hidden');
  const stk = $('tstick'),
    knob = stk.querySelector('i');
  const move = (t) => {
    const r = stk.getBoundingClientRect(),
      cx = r.left + r.width / 2,
      cy = r.top + r.height / 2;
    let dx = (t.clientX - cx) / (r.width / 2),
      dy = (t.clientY - cy) / (r.height / 2);
    const m = Math.hypot(dx, dy);
    if (m > 1) {
      dx /= m;
      dy /= m;
    }
    touch.stick = { dx, dy };
    knob.style.transform = `translate(${dx * 50}px,${dy * 50}px)`;
  };
  stk.addEventListener(
    'touchstart',
    (e) => {
      e.preventDefault();
      audio.unlock();
      move(e.targetTouches[0]);
    },
    { passive: false },
  );
  stk.addEventListener(
    'touchmove',
    (e) => {
      e.preventDefault();
      move(e.targetTouches[0]);
    },
    { passive: false },
  );
  stk.addEventListener('touchend', () => {
    touch.stick = null;
    knob.style.transform = '';
  });
  for (const b of $('tbtns').querySelectorAll('button')) {
    b.addEventListener(
      'touchstart',
      (e) => {
        e.preventDefault();
        audio.unlock();
        b.classList.add('on');
        if (b.dataset.k) touch.keys[b.dataset.k] = true;
        const t = b.dataset.tap;
        if (t === 'target') nearestHostile();
        else if (t === 'land') landRequest();
        else if (t === 'map') $('gmap').classList.contains('hidden') ? openMap() : closeMap();
        else if (t === 'board') openBoard();
        else if (t === 'jump') jumpNext();
      },
      { passive: false },
    );
    b.addEventListener('touchend', () => {
      b.classList.remove('on');
      if (b.dataset.k) touch.keys[b.dataset.k] = false;
    });
  }
}
let acc = 0,
  last = performance.now();
/**
 * Fixed physics and input update tick executed at fixed timestep (DT).
 * @returns {void}
 */
function fixedTick() {
  if (!G.view || G.landed || G.paused || G.quitting) return;
  // Preserve automatic-control intent even if guidance completes or refuses this tick.
  if ((G.towing || G.you?.towing)?.attached) G.auto = null;
  G.view.towCap = (G.towing || G.you?.towing)?.attached
    ? (G.towing || G.you?.towing).cap
    : undefined;
  const navigationRequested = !!G.auto;
  const inp = {
    thrust: held('thrust') ? 1 : 0,
    turn: (held('right') ? 1 : 0) - (held('left') ? 1 : 0),
    rev: held('rev') ? 1 : 0,
    ab: held('ab') ? 1 : 0,
    fire1: held('fire1') ? 1 : 0,
    fire2: held('fire2') ? 1 : 0,
  };
  if (
    G.opts.mouseAim &&
    mouse.in &&
    (mouse.down || (!(G.combat && (G.combat.on || G.combat.delegated)) && !G.you?.armada?.follow))
  ) {
    // mouse-aim: the ship turns toward the cursor unless you steer with the keys
    if (!inp.turn) {
      const want = Math.atan2(mouse.wx - G.view.x, -(mouse.wy - G.view.y));
      let d = want - G.view.a;
      d = Math.atan2(Math.sin(d), Math.cos(d));
      const st = G.you && G.you.shipStats;
      if (Math.abs(d) > (st ? st.turn * DT : 0.05)) inp.turn = Math.sign(d);
    }
    if (mouse.down) inp.fire1 = 1;
  }
  const manual0 = held('thrust') || held('left') || held('right') || held('rev'),
    before = inp.thrust + '|' + inp.turn;
  padInput(inp);
  touchInput(inp);
  // Human controls revoke Follow even while the leader is absent or Assist owns flight.
  // Navigation-generated controls below do not revoke leader-jump consent.
  if (
    !typing() &&
    G.you?.armada?.follow &&
    (inp.thrust || inp.turn || inp.rev || inp.ab || inp.fire1 || inp.fire2 || held('face'))
  ) {
    send({ t: 'armada', op: 'follow', on: false });
    G.you.armada.follow = false;
    G.formation = false;
    const checkbox = $('afollow');
    if (checkbox) checkbox.checked = false;
  }
  if (G.combat && (G.combat.on || G.combat.delegated)) {
    G.autoRoute = false;
    if (G.auto) setAuto(null);
  }
  if (G.auto) {
    if (manual0 || before !== inp.thrust + '|' + inp.turn) {
      G.autoRoute = false;
      setAuto(null);
      toast('Autopilot off.');
    } else autopilot(inp);
  }
  if (held('face') && !G.auto && G.target && G.ents.get(G.target)) {
    // 1.1: hold E to turn toward your target (leading it)
    const t = G.ents.get(G.target),
      st = G.you.shipStats,
      lead = Math.min(1, Math.hypot(t.rx - G.view.x, t.ry - G.view.y) / 600);
    const da = wrap(
      Math.atan2(t.rx + (t.vx || 0) * lead - G.view.x, -(t.ry + (t.vy || 0) * lead - G.view.y)) -
        G.view.a,
    );
    inp.turn = Math.abs(da) < st.turn * DT ? 0 : Math.sign(da);
  }
  if (typing() && !G.auto) {
    inp.thrust = inp.turn = inp.rev = inp.ab = inp.fire1 = inp.fire2 = 0;
  } // the autopilot keeps flying while you chat
  audio.engine(inp.thrust ? (inp.ab ? 1.6 : 1) : inp.rev ? 0.3 : 0); // 2.0: the engine hum follows your throttle
  seq++;
  send({
    t: 'input',
    seq,
    th: inp.thrust,
    tu: inp.turn,
    ab: inp.ab,
    rv: inp.rev,
    f1: inp.fire1,
    f2: inp.fire2,
    nav: navigationRequested || !!G.auto,
  });
  history.push({ seq, inp });
  if (history.length > 90) history.shift();
  const me0 = G.ents.get(G.myId);
  if (
    G.you &&
    !(me0 && me0.fl & 8) &&
    !(G.combat && (G.combat.on || G.combat.delegated)) &&
    !(G.formation && !G.auto)
  )
    step(G.view, G.you.shipStats, inp);
  G.view.fl = (inp.thrust ? 1 : 0) | (inp.ab ? 2 : 0);
}
/**
 * Main animation and rendering frame loop driven by requestAnimationFrame.
 * @param {number} t High-resolution timestamp from requestAnimationFrame
 * @returns {void}
 */
function frame(t) {
  const dt = Math.min(0.1, (t - last) / 1000);
  last = t;
  {
    const tg = G._look && G._lookT && !G.landed ? G._lookT : [0, 0],
      k = Math.min(1, dt * (G._look ? 7 : 5));
    G.lookX = (G.lookX || 0) + (tg[0] - (G.lookX || 0)) * k;
    G.lookY = (G.lookY || 0) + (tg[1] - (G.lookY || 0)) * k;
  } // 2.1 look-ahead
  acc += dt;
  while (acc >= DT) {
    fixedTick();
    acc -= DT;
  }
  const me = G.view;
  if (me) {
    // smooth out prediction corrections
    me.ox *= Math.pow(0.0005, dt);
    me.oy *= Math.pow(0.0005, dt);
    me.rx = me.x + me.ox + me.vx * acc;
    me.ry = me.y + me.oy + me.vy * acc;
  }
  const now = performance.now();
  for (const e of G.ents.values()) {
    if (me && e.id === G.myId) {
      e.rx = me.rx;
      e.ry = me.ry;
      e.a = me.a;
      e.fl = (e.fl & ~3) | me.fl;
      continue;
    }
    const k = Math.min(0.25, (now - e.t) / 1000),
      tx = e.x + e.vx * k,
      ty = e.y + e.vy * k;
    const s = Math.min(1, dt * 14);
    e.rx += (tx - e.rx) * s;
    e.ry += (ty - e.ry) * s;
  }
  for (const s of G.shots) {
    const k = (now - s.t) / 1000;
    s.rx = s.x + s.vx * k;
    s.ry = s.y + s.vy * k;
  }
  const shotsView = G.shots.map((s) => ({ ...s, x: s.rx ?? s.x, y: s.ry ?? s.y }));
  if (!G.landed && G.sys)
    draw(
      { ...G, shots: shotsView, view: me, hostile: G.hostile },
      ctx,
      canvas.width,
      canvas.height,
      dt,
      now,
    );
  else {
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  radar(G, rctx);
  hud();
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
setInterval(() => {
  if ((G.ctab === 'station' || G.ctab === 'ops') && G.you) refreshCompanion();
}, 15000);

$('combatassist').onclick = () => {
  G.autoRoute = false;
  setAuto(null);
  send({ t: 'combat', op: 'assist', on: !(G.combat && G.combat.on) });
};
$('combatstop').onclick = () => send({ t: 'combat', op: 'off' });
$('combatdelegate').onchange = (e) => send({ t: 'combat', op: 'delegate', on: e.target.checked });
$('combatcoordinate').onchange = (e) =>
  send({ t: 'combat', op: 'coordinate', on: e.target.checked });

// Escape belongs to existing dialogs/text inputs first. Logging out is always explicit.
let quitFocus = null,
  quitPaused = false;
function cancelQuit() {
  if ($('quitconfirm').disabled) return;
  $('quitbox').classList.add('hidden');
  G.quitting = false;
  if (quitPaused) send({ t: 'pause' });
  quitPaused = false;
  $('pausebox').classList.toggle('hidden', !G.paused);
  quitFocus?.focus();
}
function openQuit() {
  quitFocus = document.activeElement;
  G.quitting = true;
  keys = {};
  mouse.down = false;
  touch.keys = {};
  touch.stick = null;
  send({ t: 'input', seq: ++seq, th: 0, tu: 0, ab: 0, rv: 0, f1: 0, f2: 0 });
  quitPaused = !!G.solo && !G.paused;
  if (quitPaused) send({ t: 'pause' });
  $('pausebox').classList.add('hidden');
  $('quitnote').textContent = G.solo
    ? 'Your progress is saved when you log out.'
    : 'Your progress is saved when you log out. The online world keeps running.';
  $('quitbox').classList.remove('hidden');
  $('quitcancel').focus();
}
async function logOut() {
  $('quitconfirm').disabled = $('quitcancel').disabled = true;
  clearTimeout(reconnectTimer);
  sessionEpoch++;
  const epoch = sessionEpoch;
  const socket = ws;
  ws = null;
  delete G._cred;
  // The server's normal close path detaches, docks and saves the captain before closing.
  if (socket && socket.readyState < WebSocket.CLOSING) {
    await new Promise((resolve) => {
      socket.addEventListener('close', resolve, { once: true });
      socket.close(1000, 'Log out');
    });
  }
  const keep = { A: G.A, opts: G.opts, pal: G.pal, mapLegend: G.mapLegend };
  for (const key of Object.keys(G)) delete G[key];
  for (const [key, value] of Object.entries(sessionDefaults))
    G[key] = typeof value === 'function' ? value : structuredClone(value);
  Object.assign(G, keep);
  keys = {};
  history = [];
  seq = acc = lastSnapT = 0;
  mouse.down = mouse.in = false;
  pad.prev = [];
  touch.keys = {};
  touch.stick = null;
  storyQ.length = 0;
  quitPaused = false;
  quitFocus = null;
  resetRenderSession();
  hailUI.reset();
  miningUI.refresh();
  closeMap();
  document.querySelectorAll('.overlay').forEach((el) => el.classList.add('hidden'));
  for (const id of ['pausebox', 'tut', 'combatcontrols']) $(id).classList.add('hidden');
  for (const id of [
    'chatlog',
    'capview',
    'landbody',
    'infobody',
    'toasts',
    'storyx',
    'storyb',
    'hailtext',
    'hailopts',
  ])
    $(id).replaceChildren();
  // Clear persistent panel drafts too (for example, a former captain's tow recipient).
  document.querySelectorAll('input, textarea').forEach((el) => {
    if (el.id !== 'lname' && ['text', 'search', 'password', 'textarea'].includes(el.type))
      el.value = '';
  });
  $('cchan')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.ch === ''));
  $('chatin').placeholder = G.solo ? 'Write a note in your log (Enter)' : 'Press Enter to chat';
  $('itabs')
    .querySelectorAll('button')
    .forEach((b) => b.classList.toggle('on', b.dataset.it === 'ship'));
  $('qvolbox').classList.add('hidden');
  $('lerr').textContent = '';
  $('lbtn').disabled = $('quitconfirm').disabled = $('quitcancel').disabled = false;
  $('login').classList.remove('hidden');
  $('lname').focus();
  $('lname').select();
  audio.setAmbience(null);
  audio.industrial(false, 0);
  audio.towing(false);
  stopRadio();
  audio.startMusic();
  // Refresh Solo slot summaries only after the disconnect/save, without rebuilding event listeners.
  try {
    const status = await (await fetch('/api/status')).json();
    if (epoch === sessionEpoch && !G.you && G.solo) soloLogin(status);
  } catch {}
}
$('quitcancel').onclick = cancelQuit;
$('quitconfirm').onclick = logOut;
window.addEventListener(
  'keydown',
  (e) => {
    if (G.quitting) {
      if (e.key === 'Escape' && !e.repeat && !$('quitconfirm').disabled) cancelQuit();
      if (e.key === 'Tab') {
        e.preventDefault();
        (document.activeElement === $('quitcancel') ? $('quitconfirm') : $('quitcancel')).focus();
      }
      e.stopImmediatePropagation();
      if (!['Enter', ' ', 'Tab'].includes(e.key)) e.preventDefault();
      return;
    }
    if (e.key !== 'Escape' || e.repeat || !G.you || typing()) return;
    if (!$('qvolbox').classList.contains('hidden')) {
      $('qvolbox').classList.add('hidden');
      e.stopImmediatePropagation();
      return;
    }
    // Existing modals, map, and expanded mining panel consume this Escape instead.
    if ([...document.querySelectorAll('.overlay:not(.hidden)')].some((el) => el.id !== 'land'))
      return;
    if (!$('miningcontrols').classList.contains('hidden')) {
      $('miningclose').click();
      e.preventDefault();
      e.stopImmediatePropagation();
      return;
    }
    e.preventDefault();
    e.stopImmediatePropagation();
    openQuit();
  },
  true,
);
