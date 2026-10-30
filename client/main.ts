import { createOnboarding } from './onboarding.ts';
import { projectPlayer } from './player-projection.ts';
import { ConnectionLifecycle } from './connection-lifecycle.ts';
import { FlightPrediction } from './flight-prediction.ts';
import type { PredictionView as ClientView } from './flight-prediction.ts';
import { overlays } from './overlay-controller.ts';
import { LandingFeedback, landingRefusal } from './landing-feedback.ts';
import { initProfile } from './profile_ui.ts';
import { renderStoryPortrait } from './story-portraits.ts';
import type {
  ServerMessage,
  SnapshotMessage,
  SnapshotEvent,
  StoryMessage,
  HailConversation,
} from './protocol.ts';
import type { AutopilotState } from './landing_autopilot.ts';
import { startStorySequence } from './render.ts';
import {
  playEndingCinematic,
  preloadEndingCinematic,
  prepareEndingDeparture,
} from './ending-cinematic.ts';
import type { NetworkMessage } from '../server/message-registry.ts';
import { elementById } from './dom.ts';
import { createGameConnection } from './connection.ts';
import type { NakamaConfig } from './connection.ts';
import type { GameAssets } from '../shared/rules.ts';
import type { RenderEntity, RenderShip } from './render.ts';
import type { Game } from '../server/game.ts';
import type { CombatPayload } from '../server/combat-assist.ts';
import type { MiningPrivateWire, MiningRocksWire } from '../server/mining-contracts.ts';
import type { PressureWire, MiningHazard } from '../server/mining-pressure-contracts.ts';
import type { FeatureServices } from '../server/features.ts';
import type { RefineryClientState } from './refinery-controls.ts';
import type { DirectMessage, SocialState, TradeState, TradeOffer } from './coop_ui.ts';
import type { CaptainProfile } from './frontier_ui.ts';
import type { WeaponAsset } from '../shared/rules.ts';
import type { MapTransform, MapFit } from './render.ts';
import type { initCockpitState } from './cockpit-state.ts';
export interface ContractPlan {
  id: string;
  revision: number;
  proposer: string;
  title: string;
  sys: string;
  pool: number;
  roster: Array<{ name: string; share: number; ready: boolean; slots: number }>;
  skipped: Array<{ name: string; reason: string }>;
}
export type PlayerPayload = ReturnType<Game['playerPayload']>;
export type LandedPayload = ReturnType<Game['landedPayload']>;
export type ClientInput = {
  thrust: number;
  turn: number;
  ab: number;
  rev: number;
  fire1: number;
  fire2: number;
};
export type { PredictionView as ClientView } from './flight-prediction.ts';
export interface ClientOptions {
  [preference: string]: unknown;
  miningKeysVersion?: number;
  v21?: boolean;
  dmg: boolean;
  shake: boolean;
  /** Disable story shimmer and flashing transitions without hiding targeting. */
  reducedEffects?: boolean;
  mouseAim: boolean;
  /** Persisted local policy for automated missile spending; manual fire is unchanged. */
  assistMissiles?: boolean;
  /** Place the viewscreen JUMP button in the bottom-left corner instead of bottom-right. */
  jumpLeft?: boolean;
  notify: boolean;
  cb: boolean;
  scale: number;
  vol: number;
  sfx: number;
  radio: number;
  ui: number;
  amb: number;
  music: number;
  mute: boolean;
  keys: Record<string, string | null>;
  musicWas?: number;
}
export type ClientGameState = RefineryClientState & {
  /** Friend-hosted captains always share one reality. */
  friendGame?: boolean;
  /** Game assets dictionary. */
  A: GameAssets | null;

  /** Current player save data. */
  you: PlayerPayload | null;

  /**
   * Current system ID.
   * Current system identifier
   */
  sys: string | null;

  /** Currently docked stellar body or null if flying. */
  landed: LandedPayload | null;

  /** Current UI view mode. */
  view: ClientView | null;

  /** Active entities in current space. */
  ents: Map<number, RenderEntity>;

  /** Active projectile shots. */
  shots: Array<{
    x: number;
    y: number;
    vx: number;
    vy: number;
    w: number;
    t: number;
    rx?: number;
    ry?: number;
    id?: number;
    life?: number;
    W?: WeaponAsset;
    col?: string;
    look?: string;
  }>;

  /** Active beam weapon animations. */
  beams: Array<{ id: number; a: number; len: number; w: number }>;

  /** Floating loot canisters. */
  loot: Array<{ id: number; x: number; y: number; kind: number; indexClaim?: boolean }>;

  /** Current target entity ID. */
  target: number;
  targetClearPending: boolean;

  /** Camera zoom scale. */
  zoom: number;

  /** Sprite rendering scale. */
  spriteScale: number;

  /** Active hyperspace route system IDs. */
  route: string[];

  /** Navigation target stellar ID. */
  navStellar: string | null;

  /** Whether the player clicked navStellar themselves, so L lands there instead of the nearest body. */
  navPicked: boolean;

  /** Ammunition counts. */
  ammo: Record<string, number>;

  /** Faction ID mapping. */
  FAC: string[];

  /** Active console tab. */
  ctab: string;

  /**
   * Active landed tab.
   * Currently active tab
   */
  ltab: string | null;

  /** Player entity simulation ID. */
  myId: number;

  /** Player ship hull chassis ID. */
  myHull: number;

  /** Hovered entity ID. */
  hover: number;

  /** Client preferences and configuration. */
  opts: ClientOptions;

  /** Color palette mapping. */
  pal: Record<string, string>;

  /** Checks if entity is an allied wingmate. */
  isAlly?: (entity: RenderShip | null | undefined | 0) => boolean;

  /** Checks if entity is hostile to player. */
  hostile: (entity: RenderShip | null | undefined | 0) => boolean;
  myName?: string;
  solo?: boolean;
  paused?: boolean;
  quitting?: boolean;
  ctabSub: string;
  dms: Record<string, DirectMessage[]>;
  unread: Record<string, number>;
  _dmFor?: string;
  dmWith?: string | null;
  lastDmFrom?: string;
  social?: SocialState | null;
  trade?: TradeState | null;
  tdraft?: TradeOffer | null;
  rally?: { sys: string; t: number };

  /** Crucible arena state. */
  arena?: { team: string; [field: string]: unknown } | null;
  auto?: (AutopilotState & { id?: string; sys?: string | null }) | null;
  autoKeep?: boolean;
  autoRoute?: boolean;
  startAutoJump?: () => void;
  formation?: boolean;
  combat: Partial<CombatPayload>;
  rocks: Array<{ id: number; x: number; y: number; r: number; ore: string; hp: number }>;
  rockById: Map<number, ClientGameState['rocks'][number]>;
  miningTarget?: number;
  mining?: MiningPrivateWire | null;
  miningRocks?: MiningRocksWire | null;
  miningPressure?: PressureWire | null;
  miningHazards: MiningHazard[];
  industrial?: PlayerPayload['industrial'] | null;
  towing?: PlayerPayload['towing'] | null;
  towTarget?: number;
  views: ReturnType<typeof initCockpitState>;
  mapView?: MapFit & {
    W: number;
    H: number;
    prevFit?: number;
    /** Visible-system count the zoom range was fitted to, under fog of war. */
    fogKey?: number;
  };
  mapXform?: MapTransform;
  miniXform?: MapTransform;
  mapLegend?: boolean;
  mapMode?: string;
  mapCid?: string;
  hoverSys?: string | null;
  hoverStellar?: string | null;
  lastTab: Record<string, string>;
  itab?: string;
  stab?: string;
  ysort?: string;
  ocat?: string;
  ofit?: boolean;
  codexCat?: string;
  codexQuery?: string;
  pinnedObjective?: string;
  jobType?: string;
  jobFeasible?: boolean;
  jobNearby?: boolean;
  [preference: `job${string}`]: string | boolean | undefined;
  [preference: `mission${string}`]: string | boolean | undefined;
  missionType?: string;
  missionFeasible?: boolean;
  missionNearby?: boolean;
  radioTab?: string;
  boardCat?: string;
  boards?: Record<string, Array<{ name: string; v: number; fleet?: string; ai?: boolean }> | null>;
  prof?: CaptainProfile | null;
  world?: ReturnType<FeatureServices['world']['worldPayload']>;
  sites?: ReturnType<Game['sitesPayload']>;
  rivals?: Array<{
    name: string;
    rel: number;
    sys: string;
    ship: string;
    state: string;
    fac: string;
    power: number;
    kind: string;
    mood: 'nemesis' | 'rival' | 'neutral' | 'friendly' | 'ally';
  }>;
  contractPlan?: ContractPlan | null;
  boarding?: number | null;
  order?: string;
  storeFac?: string;
  rtree?: string;
  sel?: number | null;
  chan?: string;
  radarR?: number;
  lookX?: number;
  lookY?: number;
  economyReceiptOpen?: boolean;
  _arriveT?: number;
  _crSeen?: number;
  _cred?: { name: string; pass: string };
  _exhaustReduced?: boolean;
  _hoverBtn?: Element | null;
  _hurtT?: number;
  _jumpStart?: number;
  _jumping?: boolean;
  _kicked?: boolean;
  _landedAt?: string | null;
  _lastAr?: number;
  _lastTgt?: number;
  _look?: { t: number; x: number; y: number; moved: boolean } | null;
  _lookT?: [number, number] | null;
  _lowSh?: boolean;

  /** Available interaction tab keys */
  _ltabs?: string[];
  _mhtml?: string | null;
  _toastKind?: string;
};

import { initSidebarSize } from './sidebar-size.ts';
import { jumpClearHeading } from '../shared/hyperspace-arrival.ts';
import { initShipFunctions } from './ship-functions.ts';
import { initChatProjection } from './chat-projection.ts';
import { coronaRouteBlocked } from '../shared/industrial-rules.ts';
import { initRefineryUI } from './refinery_ui.ts';
import { binding, migrateBindings, RESERVED_KEYS } from './action-bindings.ts';
import { initMiningUI, receiveMining } from './mining_ui.ts';
import { landingGuidance, landingReady, chooseLandingPort } from './landing_autopilot.ts';
import { missionTargets } from './missions.ts';
import { FlightEngine } from './engine.ts';
import { advanceFlightClock } from './flight-clock.ts';
import { initLoginScene } from './login_scene.ts';
import { gatewayGuidance } from './gateway_autopilot.ts';
import { setArtworkVersion } from './artwork.ts';
import { diagnostics, initDiagnosticControls, refreshDiagnosticControls } from './diagnostics.ts';
import { initHails } from './hails_ui.ts';
import { receiveShipChat } from './chat_bubbles.ts';
// Quantum Rift client: connection, input, client-side prediction, render loop.
import { SYS as systemsById, STELLARS, FACTIONS, FACTION_HULLS } from '../shared/galaxy.ts';
import { TUTORIAL } from '../shared/tutorial.ts';
import {
  DT as tickDuration,
  weaponColor,
  augmentAssets,
  K as physicsConstants,
  wrap,
  route,
} from '../shared/rules.ts';
import { STATES } from '../shared/living.ts';
import {
  radar,
  boom,
  spark,
  flash,
  blast,
  shieldHit,
  dmgNumber,
  addShake,
  resetRenderSession,
  cam as camera,
  FAC as factionColors,
} from './render.ts';
import * as audio from './audio.ts';
import { setRadioLevel, stopRadio, setUnlockedStations } from './radio.ts';
window.RiftAudio = audio; // for tests and the curious
import { infoHtml } from './info_ui.ts';
import { boardHtml } from './hangar_ui.ts';
import { ANOMALIES } from '../shared/fronts.ts';
import { arenaSystem } from '../shared/frontier.ts';
import { initCoop, onCoopMsg, coopYou } from './coop_ui.ts';
import { SPRITES } from '../shared/sprites26.ts';
import { refreshStores } from './ui.ts';
import {
  initUI,
  hud as renderHud,
  clearFlightStatus,
  toast,
  ask as showConfirmation,
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
} from './ui.ts';

const elementById2 = elementById;
overlays.start(clearManualFlightInput);
initLoginScene(elementById2('login'));

const clientGameState: ClientGameState = (window.G = {
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
  targetClearPending: false,
  zoom: 1,
  spriteScale: 1.25,
  route: [],
  navStellar: null,
  navPicked: false,
  ammo: {},
  FAC: factionColors,
  ctab: 'missions',
  ltab: null,
  myId: 0,
  myHull: 0,
  hover: 0,
  opts: Object.assign(
    {
      dmg: true,
      shake: true,
      reducedEffects: false,
      mouseAim: false,
      assistMissiles: true,
      jumpLeft: false,
      notify: false,
      cb: false,
      scale: 1,
      vol: 0.35,
      sfx: 0.5,
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
  hostile(event) {
    if (!event || !clientGameState.you) return false;
    if (event.owner === clientGameState.myId || event.id === clientGameState.myId) return false;
    const factionId = factionColors[event.fac as unknown as number];
    if (clientGameState.arena && event.fl & 16)
      return (
        !!event.name &&
        !event.name.startsWith(clientGameState.arena.team === 'A' ? 'Azure' : 'Crimson')
      );
    if (event.fl & 16)
      return !!(clientGameState.you!.duel && clientGameState.you!.duel.with === event.name); // no open-galaxy PvP; only your duel opponent
    if (clientGameState.isAlly && clientGameState.isAlly(event)) return false; // Armada members' wingmates
    const factionDef = FACTIONS[factionId];
    if (!factionDef) return false;
    if (factionDef.alwaysHostile) return true;
    const reputation = clientGameState.you!.rep[factionId] || 0;
    return factionDef.pirate ? reputation < 30 : reputation <= -30;
  },
} as Omit<
  ClientGameState,
  | 'pal'
  | 'views'
  | 'dms'
  | 'unread'
  | 'ctabSub'
  | 'combat'
  | 'rocks'
  | 'rockById'
  | 'miningHazards'
  | 'lastTab'
> as ClientGameState);
// Accessibility: palettes, key bindings, UI scale
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
clientGameState.pal = PALETTES[clientGameState.opts.cb ? 'cb' : 'normal'];
export const ACTIONS: Array<[string, string, string]> = [
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
  ['info', 'Ship details', 'KeyI'],
  ['captain', 'Captain', 'KeyO'],
  ['face', 'Turn to face target (hold)', 'KeyE'],
  ['stop', 'Full stop', 'KeyQ'],
  ['ordAttack', 'Fleet: attack my target', 'KeyK'],
  ['ordGather', 'Fleet: form up', 'KeyG'],
  ['ordHold', 'Fleet: hold position', 'KeyH'],
  ['ordFire', 'Fleet: hold fire', 'KeyY'],
  ['ordLoot', 'Fleet: collect loot', 'Quote'],
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
const alternateBindings: Record<string, string> = {
  thrust: 'ArrowUp',
  left: 'ArrowLeft',
  right: 'ArrowRight',
  rev: 'ArrowDown',
  ab: 'ShiftRight',
}; // the arrow keys always work too
migrateBindings(clientGameState.opts, ACTIONS);
const bound = (firstValue: string) => binding(clientGameState.opts.keys, ACTIONS, firstValue);
const held = (firstValue: string) =>
  !typing() &&
  elementById2('opts').classList.contains('hidden') &&
  !!(
    flightEngine.input.held(bound(firstValue)) ||
    flightEngine.input.held(alternateBindings[firstValue])
  );
const actionOf = (code: string) => {
  for (const [firstValue] of ACTIONS)
    if (bound(firstValue) === code || alternateBindings[firstValue] === code) return firstValue;
  return null;
};
if (!clientGameState.opts.v21) {
  clientGameState.opts.v21 = true;
  clientGameState.opts.vol = Math.min(clientGameState.opts.vol, 0.35);
  clientGameState.opts.ui = Math.min(clientGameState.opts.ui ?? 0.55, 0.55);
  clientGameState.opts.amb = Math.min(clientGameState.opts.amb ?? 0.35, 0.35);
  try {
    localStorage.setItem('rift.opts', JSON.stringify(clientGameState.opts));
  } catch {}
} // 2.1: quieter defaults, applied once to older settings
function saveOpts() {
  try {
    localStorage.setItem('rift.opts', JSON.stringify(clientGameState.opts));
  } catch {}
}
function miningModalBlocked() {
  return !!clientGameState.landed || overlays.blocksFlight();
}

const miningUI = initMiningUI({
  industrialAudio: audio.industrial,
  towAudio: audio.towing,
  G: clientGameState,
  send,
  bound,
  label: (component) => keyName(component!),
  blocked: () => typing() || miningModalBlocked(),
  contextBlocked: miningModalBlocked,
});
const refineryUI = initRefineryUI(clientGameState, send, () => {
  if (clientGameState.landed && clientGameState.ltab === 'refinery') renderLanded();
});
const shipFunctions = initShipFunctions(clientGameState, send);
const chatProjection = initChatProjection(clientGameState);
setInterval(() => {
  miningUI.refresh();
  shipFunctions.refresh();
  chatProjection.refresh();
  refineryUI.refresh();
  refreshJumpButton();
}, 100);
function applyOpts() {
  clientGameState.pal = PALETTES[clientGameState.opts.cb ? 'cb' : 'normal'];
  document.documentElement.style.setProperty('--ui', String(clientGameState.opts.scale));
  document.body.classList.toggle('scaled', clientGameState.opts.scale !== 1);
  document.body.classList.toggle('jump-left', !!clientGameState.opts.jumpLeft);
  audio.setMix({
    vol: clientGameState.opts.vol,
    sfx: clientGameState.opts.sfx,
    ui: clientGameState.opts.ui ?? 0.8,
    amb: clientGameState.opts.amb ?? 0.5,
    music: clientGameState.opts.music ?? 0.6,
    mute: clientGameState.opts.mute,
  });
  setRadioLevel(
    clientGameState.opts.mute ? 0 : clientGameState.opts.vol * clientGameState.opts.radio,
    clientGameState.opts.radio,
  ); // the radio is in the mixer
}
applyOpts();
// loading screen: warm the browser cache with the common ship sprites and station art while the login is shown
(function preloadArt() {
  const hulls = [...new Set(Object.values(FACTION_HULLS).flat())];
  const urls = [
    ...hulls.map((height) => `assets/ships/${height}.${SPRITES[height] ? 'webp' : 'png'}`),
    ...[0, 1, 2, 3, 4, 5].map((entryKey) => `assets/stations/${entryKey}.png`),
    'assets/hub.png',
    'assets/wormhole.png',
  ];
  let count = 0;
  const done = () => {
    count++;
    elementById2('lloadbar').style.width = (100 * count) / urls.length + '%';
    elementById2('lloadt').textContent = `Loading ships… ${count} / ${urls.length}`;
    if (count >= urls.length) elementById2('lload').classList.add('done');
  };
  for (const url2 of urls) {
    const htmlImageElement = new Image();
    htmlImageElement.onload = htmlImageElement.onerror = done;
    htmlImageElement.src = url2;
  }
  setTimeout(() => elementById2('lload').classList.add('done'), 20000);
})();
const canvas = elementById2('view'),
  canvasRenderingContext2D2 = elementById2('radar').getContext('2d')!;
const flightEngine = new FlightEngine(
  canvas,
  clientGameState,
  frame,
  () => overlays.blocksFlight(),
  () => {
    clearManualFlightInput();
    audio.engine(0);
  },
);
let sessionEpoch = 0,
  sessionDefaults: Record<string, unknown> | null = null;
let nakamaConfig: NakamaConfig | undefined;
let localReferenceTransport = false;
let friendHostTransport = false;
const prediction = new FlightPrediction();
const playerProjectionEffects = {
  unlockedStations: setUnlockedStations,
  coopYou: () => coopYou(),
  renderLanded: () => renderLanded(),
  refreshCompanion: () => refreshCompanion(),
  refreshStores: () => refreshStores(),
  tab: (name: ClientGameState['ctab'], persist: boolean) => ctab(name, persist),
  tutorial: () => renderTut(),
};
const onboarding = createOnboarding({
  captain: () =>
    clientGameState.you
      ? (clientGameState.solo ? 'solo.' : 'online.') + clientGameState.you.name.toLowerCase()
      : null,
  key: (action) => keyName(bound(action)),
  revealSidebar: () => {
    if (!document.body.classList.contains('tray-open')) elementById2('traytoggle').click();
  },
  selectTab: (name) => ctab(name, false),
  currentTab: () => clientGameState.ctab || 'missions',
  finished: () => {
    if (clientGameState.landed) showLanded();
    renderTut();
    if (storyQ.length) showStory(storyQ.shift());
  },
});
let _lastSnapT = 0;
function send(networkMessage: NetworkMessage) {
  connectionLifecycle.send(networkMessage);
}

// ------------------------------------------------------------------ login and connection
elementById2('lbtn').onclick = login;
// Browsers that block autoplay resume the theme on the first click or key.
const loginMusic = () => {
  if (elementById2('login').classList.contains('hidden')) return;
  audio.unlock();
  audio.startMusic();
  window.removeEventListener('pointerdown', loginMusic, true);
  window.removeEventListener('keydown', loginMusic, true);
};
elementById2('musicbtn').onclick = (pointerEvent) => {
  pointerEvent.stopPropagation();
  audio.unlock();
  if ((clientGameState.opts.music ?? 0.6) > 0) {
    clientGameState.opts.musicWas = clientGameState.opts.music ?? 0.6;
    clientGameState.opts.music = 0;
  } else clientGameState.opts.music = clientGameState.opts.musicWas || 0.6;
  applyOpts();
  saveOpts();
  elementById2('musicbtn').classList.toggle('off', !clientGameState.opts.music);
  audio.startMusic();
};
elementById2('musicbtn').classList.toggle('off', (clientGameState.opts.music ?? 0.6) === 0);
window.addEventListener('pointerdown', loginMusic, true);
window.addEventListener('keydown', loginMusic, true);
// Attempt playback now; browser policy may require the gesture fallback.
audio.unlock();
audio.startMusic();
// interface sounds for every button, tab and chip
document.addEventListener(
  'click',
  (pointerEvent) => {
    const htmlButtonElement = (pointerEvent.target as HTMLInputElement).closest<HTMLButtonElement>(
      'button, .btn, .chip, .card[data-act], .it, a[data-act], #ctabs button, #ltabs button',
    );
    if (!htmlButtonElement || htmlButtonElement.disabled) return;
    audio.unlock();
    const action = htmlButtonElement.dataset.act!;
    if (
      htmlButtonElement.closest<HTMLElement>('#ltabs, #ctabs, .itabs, #gmodes, #cchan, #itabs') ||
      action === 'stab' ||
      action === 'rtree'
    )
      return audio.ui('tab', 0.7);
    if (action === 'trade')
      return audio.ui(
        htmlButtonElement.dataset.custom === 'buy' || +htmlButtonElement.dataset.q! > 0
          ? 'buy'
          : 'sell',
        0.7,
      );
    if (action === 'sellall') return audio.ui('sell', 0.8);
    if (
      action === 'buyship' ||
      action === 'bm' ||
      action === 'buystore' ||
      (action === 'outfit' && +htmlButtonElement.dataset.n! > 0) ||
      (action === 'mat' && +htmlButtonElement.dataset.q! > 0)
    )
      return audio.ui('buy', 0.7);
    if (action === 'outfit' && +htmlButtonElement.dataset.n! < 0) return audio.ui('sell', 0.7);
    if (action === 'accept' || action === 'arcopen' || htmlButtonElement.id === 'storyyes')
      return audio.ui('accept', 0.7);
    if (action === 'promote' || action === 'lower') return audio.ui('levelup', 0.6);
    audio.ui('click', 0.8);
  },
  true,
);
document.addEventListener('mouseover', (mouseEvent) => {
  const htmlElement =
    (mouseEvent.target as HTMLInputElement).closest &&
    (mouseEvent.target as HTMLInputElement).closest<HTMLElement>(
      '.btn:not(:disabled), button:not(:disabled), .chip',
    );
  if (htmlElement && htmlElement !== clientGameState._hoverBtn) {
    clientGameState._hoverBtn = htmlElement;
    audio.ui('hover', 0.18);
  } else if (!htmlElement) clientGameState._hoverBtn = null;
});
elementById2('lpass').onkeydown = (keyboardEvent) => {
  if (keyboardEvent.key === 'Enter') void login();
};
try {
  elementById2('lname').value = localStorage.getItem('rift.name') || '';
} catch {}
const compatibilityRefresh = document.createElement('button');
compatibilityRefresh.id = 'compatibility-refresh';
compatibilityRefresh.className = 'btn hidden';
compatibilityRefresh.textContent = 'REFRESH GAME PAGE';
compatibilityRefresh.onclick = () => location.reload();
elementById2('lerr').setAttribute('role', 'alert');
elementById2('lerr').after(compatibilityRefresh);
const statusRequest = fetch('/api/status', { cache: 'no-store' })
  .then((response) => response.json())
  .then((state) => {
    nakamaConfig = state.nakama;
    localReferenceTransport = state.localAuthority === true;
    friendHostTransport = state.mode === 'friends' && state.localTransport === true;
    clientGameState.friendGame = friendHostTransport;
    setArtworkVersion(state.version);
    diagnostics.setBuild(state.version);
    elementById2('lstat').textContent = friendHostTransport
      ? 'Friend-hosted universe. Sign in with your own captain and password.'
      : state.players === null
        ? 'Online play uses Nakama.'
        : `${state.players} captain${state.players === 1 ? '' : 's'} in the Rift right now.`;
    elementById2('lver').textContent = 'Quantum Rift v' + state.version;
    if (state.solo) soloLogin(state);
  })
  .catch(() => {});
// solo mode: no passwords; pick a save slot, start a new captain, or load a save file
function soloLogin(state: { slots: import('../server/game.ts').SaveSlotSummary[] }) {
  clientGameState.solo = true;
  document.body.classList.add('solo');
  elementById2('chatin').placeholder = 'Write a note in your log (Enter)';
  elementById2('lpass').classList.add('hidden');
  elementById2('lstat').textContent = 'Solo game: your saves live on this computer.';
  elementById2('lname').placeholder = 'New captain name';
  elementById2('lbtn').textContent = 'START NEW CAPTAIN';
  const cachedElement = elementById2('lslots');
  cachedElement.classList.remove('hidden');
  cachedElement.innerHTML =
    `<div class="solotag">YOUR CAPTAINS</div>` +
    (state.slots.length
      ? state.slots
          .map(
            (saveSlotSummary) =>
              `<div class="slot"><div class="n"><b>${saveSlotSummary.name.replace(/[<>&]/g, '')}</b><div class="dim small">${saveSlotSummary.ship} · ${Math.round(saveSlotSummary.credits).toLocaleString()} cr${saveSlotSummary.ops ? ' · Station Tier ' + saveSlotSummary.ops : ''} · ${saveSlotSummary.sys}</div></div><a href="/api/export?name=${encodeURIComponent(saveSlotSummary.name)}" download>EXPORT</a><button class="btn sm" data-slot="${saveSlotSummary.name.replace(/"/g, '')}">PLAY</button></div>`,
          )
          .join('')
      : '<div class="dim small">No captains yet: name one above and start.</div>') +
    `<label class="btn sm" style="display:inline-flex;align-items:center;justify-content:center">LOAD A SAVE FILE<input type="file" id="limport" accept=".json" style="display:none"></label>`;
  cachedElement.querySelectorAll<HTMLElement>('[data-slot]').forEach(
    (htmlElement) =>
      (htmlElement.onclick = () => {
        elementById2('lname').value = htmlElement.dataset.slot!;
        void login();
      }),
  );
  elementById2('limport').onchange = async (event) => {
    const file = (event.target as HTMLInputElement).files![0];
    if (!file) return;
    const response = await fetch('/api/import', { method: 'POST', body: await file.text() });
    const innerIndex = await response.json();
    if (!innerIndex.ok) elementById2('lerr').textContent = innerIndex.error;
    else location.reload();
  };
}
async function login() {
  if (elementById2('lbtn').disabled) return;
  sessionEpoch++;
  const loginEpoch = sessionEpoch;
  const previous = connectionLifecycle.detach();
  void previous?.logout().catch(() => {});
  audio.unlock();
  elementById2('lbtn').disabled = true;
  await statusRequest;
  if (loginEpoch !== sessionEpoch) return;
  const name = elementById2('lname').value.trim(),
    pass = clientGameState.solo ? '' : elementById2('lpass').value;
  elementById2('lerr').textContent = '';
  elementById2('lbtn').disabled = true;
  if (!clientGameState.A) {
    const textContent2 = elementById2('lstat').textContent;
    elementById2('lstat').textContent = 'Loading the galaxy...';
    clientGameState.A = augmentAssets(await (await fetch('/shared/assets.json')).json());
    initUI(clientGameState, send);
    initCoop(clientGameState, send, { toast, ask: showConfirmation, plot });
    // Capture only the clean initialized state; account data arrives over the socket later.
    sessionDefaults = Object.fromEntries(
      Object.entries(clientGameState)
        .filter(
          ([entryKey, value]) =>
            !['A', 'opts', 'pal', 'views'].includes(entryKey) && !(value instanceof Element),
        )
        .map(([entryKey, value]) => [
          entryKey,
          typeof value === 'function' ? value : structuredClone(value),
        ]),
    );
    elementById2('lstat').textContent = textContent2;
  } // the status line comes back if login fails
  try {
    localStorage.setItem('rift.name', name);
  } catch {}
  if (loginEpoch !== sessionEpoch) return;
  clientGameState._cred = { name, pass };
  clientGameState._kicked = false;
  connectionLifecycle.open(0);
}
// Transport callbacks read current composition state; account teardown stays below.
const connectionLifecycle = new ConnectionLifecycle({
  epoch: () => sessionEpoch,
  credentials: () => clientGameState._cred,
  createConnection: (credentials) =>
    createGameConnection(
      {
        solo: !!clientGameState.solo || (localReferenceTransport && !friendHostTransport),
        ...(friendHostTransport ? { mode: 'friends' as const, localTransport: true } : {}),
        localUrl: (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws',
        nakama: nakamaConfig,
      },
      credentials,
    ),
  sendsHello: () => !!clientGameState.solo || localReferenceTransport || friendHostTransport,
  hasPlayer: () => !!clientGameState.you,
  kicked: () => !!clientGameState._kicked,
  receive: (data) => onMessage(JSON.parse(data)),
  disconnected: () => {
    updateAttention();
    clearFlightStatus();
    landingFeedback.reset();
    flightEngine.input.clear();
    mouse.down = false;
    releaseTouchControls();
    clientGameState._look = null;
    clientGameState._lookT = null;
    elementById2('lbtn').disabled = false;
  },
  incompatible: () => compatibilityRefresh.classList.remove('hidden'),
  loginError: (message) => {
    elementById2('lerr').textContent = message;
    elementById2('lbtn').disabled = false;
  },
  interrupted: (interrupted) => {
    const banner = elementById2('connectionstatus');
    banner.textContent = interrupted ? 'Connection interrupted. Waiting for the server...' : '';
    banner.classList.toggle('hidden', !interrupted);
  },
  reconnecting: (first, reason) => {
    const banner = elementById2('connectionstatus');
    banner.textContent = reason || 'Connection lost. Reconnecting...';
    banner.classList.remove('hidden');
    if (first) toast('Connection lost. Reconnecting...');
    elementById2('lstat').textContent = 'Reconnecting to the server...';
  },
  terminal: (reason) => {
    void logOut(reason);
  },
});

function onMessage(serverMessage: ServerMessage) {
  if (serverMessage.t === 'welcome') {
    elementById2('connectionstatus').classList.add('hidden');
    elementById2('connectionstatus').textContent = '';
  }
  if (profileUI.onMessage(serverMessage)) return;
  if (hailUI.onMessage(serverMessage)) return;
  switch (serverMessage.t) {
    case 'error':
      elementById2('lerr').textContent = serverMessage.msg;
      elementById2('lbtn').disabled = false;
      toast(serverMessage.msg);
      if (/somewhere else/.test(serverMessage.msg)) {
        clientGameState._kicked = true;
        connectionLifecycle.close();
      }
      break;
    case 'welcome':
      send({ t: 'combat', op: 'missiles', on: clientGameState.opts.assistMissiles !== false });
      compatibilityRefresh.classList.add('hidden');
      if (!clientGameState.solo && !localReferenceTransport && !friendHostTransport) {
        // Welcome establishes this native presence before its first controls, even if join/onopen is pending.
        prediction.reset();
        clientGameState.view = null;
        _lastSnapT = 0;
      }
      clientGameState.contractPlan = null;
      refineryUI.connected();
      audio.stopMusic(0);
      audio.preloadUi();
      elementById2('login').classList.add('hidden');
      clientGameState.myName = serverMessage.name;
      toast(
        clientGameState.you
          ? 'Reconnected.'
          : `Welcome to Quantum Rift, Captain ${serverMessage.name}.`,
      );
      break;
    case 'refineryFuelQuote':
      clientGameState.refineryFuelQuote = serverMessage.quote;
      if (clientGameState.landed && clientGameState.ltab === 'refinery') renderLanded();
      refreshCompanion();
      break;
    case 'refineryQuote':
      if (refineryUI.receiveQuote(serverMessage.quote)) renderLanded();
      break;
    case 'refineryError':
      refineryUI.failed(serverMessage.op);
      if (clientGameState.landed && clientGameState.ltab === 'refinery') renderLanded();
      break;
    case 'refinery':
      if (clientGameState.you) clientGameState.you!.refinery = serverMessage.data;
      refineryUI.settled(serverMessage.op);
      if (clientGameState.landed && clientGameState.ltab === 'refinery') renderLanded();
      refreshCompanion();
      break;
    case 'you':
      projectPlayer(clientGameState, serverMessage.d, playerProjectionEffects);
      if (!elementById2('infobox').classList.contains('hidden') && clientGameState.itab === 'ship')
        renderInfo();
      onboarding.start();
      break;
    case 'landed':
      releaseTouchControls();
      updateAttention();
      elementById2('combatcontrols').classList.add('hidden');
      clientGameState.combat = {};
      if (!clientGameState.landed) audio.ui('dock', 0.8);
      audio.setAmbience('station');
      setAuto(null);
      clientGameState.navPicked = false;
      clientGameState.landed = serverMessage;
      clientGameState.sys = STELLARS[serverMessage.stellar]?.system || clientGameState.sys;
      clientGameState.view = null;
      clientGameState.ents.clear();
      clientGameState.shots = [];
      clientGameState.beams = [];
      clientGameState.loot = [];
      clientGameState.target = 0;
      clientGameState.targetClearPending = false;
      prediction.clearPending();
      showLanded();
      refreshCompanion();
      break;
    case 'space':
      if (String(serverMessage.sys).startsWith('arena-') && !systemsById[serverMessage.sys])
        systemsById[serverMessage.sys] = arenaSystem(serverMessage.sys);
      {
        const fromSpace = !!clientGameState.view && !clientGameState.landed;
        if (clientGameState.landed) audio.ui('undock', 0.8);
        else if (fromSpace) {
          audio.ui('arrive', 0.8);
          clientGameState._arriveT = performance.now();
          clientGameState._jumping = false;
        }
        audio.setAmbience('space');
        const autoRoute2 = clientGameState.autoRoute;
        clientGameState.autoKeep = true;
        setAuto(null);
        clientGameState.autoRoute = autoRoute2;
      }
      clientGameState.landed = null;
      refreshStores();
      hideLanded();
      clientGameState.sys = serverMessage.sys;
      clientGameState.myId = serverMessage.id;
      updateAttention();
      clientGameState.view = null;
      clientGameState.ents.clear();
      clientGameState.shots = [];
      clientGameState.beams = [];
      prediction.clearPending();
      clientGameState.rocks = (serverMessage.rocks || []).map(
        ([identifier, positionX, positionY, radius, oreCommodity, hullPoints]) => ({
          id: identifier,
          x: positionX,
          y: positionY,
          r: radius,
          ore: oreCommodity,
          hp: hullPoints,
        }),
      );
      clientGameState.rockById = new Map(
        clientGameState.rocks.map((entryKey) => [entryKey.id, entryKey]),
      );
      clientGameState.miningTarget = 0;
      clientGameState.miningRocks = null;
      clientGameState.mining = null;
      clientGameState.miningPressure = null;
      clientGameState.miningHazards = [];
      receiveMining(clientGameState, serverMessage);
      if (clientGameState.route.length && clientGameState.route[0] === serverMessage.sys)
        clientGameState.route.shift();
      drawMini();
      if (clientGameState.autoRoute && clientGameState.route.length) {
        const epoch = sessionEpoch;
        setTimeout(() => {
          if (
            epoch === sessionEpoch &&
            clientGameState.autoRoute &&
            clientGameState.view &&
            clientGameState.route.length &&
            !clientGameState.auto
          ) {
            clientGameState.autoKeep = true;
            setAuto(
              { mode: 'jump' },
              `Autopilot: next jump to ${systemsById[clientGameState.route[0]].name}.`,
            );
          }
        }, 1500);
      } else clientGameState.autoRoute = false;
      {
        const angle =
          clientGameState.world &&
          clientGameState.world.anomalies &&
          clientGameState.world.anomalies[serverMessage.sys];
        if (angle && ANOMALIES[angle])
          toast(`${ANOMALIES[angle].icon} ${ANOMALIES[angle].name}: ${ANOMALIES[angle].desc}`);
      }
      clientGameState.navPicked = false;
      clientGameState.navStellar = systemsById[serverMessage.sys].stellars.find((rawStellarBody) =>
        rawStellarBody.svc!.includes('L'),
      )
        ? systemsById[serverMessage.sys].stellars.find((rawStellarBody) =>
            rawStellarBody.svc!.includes('L'),
          )!.id
        : null;
      break;
    case 'scene':
      if (clientGameState.landed && serverMessage.sys === clientGameState.sys)
        onSnap(serverMessage);
      break;
    case 'snap':
      if (!clientGameState.landed) onSnap(serverMessage);
      break;
    case 'toast': {
      const refusal =
        landingRefusal(serverMessage.msg) &&
        clientGameState.auto?.mode === 'land' &&
        !!clientGameState.auto.sent;
      if (refusal && clientGameState.auto?.mode === 'land' && clientGameState.auto.sent)
        setAuto(null, undefined, true);
      if (!refusal || landingFeedback.notice(serverMessage.msg)) toast(serverMessage.msg);
      break;
    }
    case 'armadaContract':
      clientGameState.contractPlan = serverMessage.plan;
      drawMini();
      break;
    case 'social':
    case 'dm':
    case 'dms':
    case 'trade2':
    case 'follow':
    case 'rally':
      onCoopMsg(serverMessage);
      if (serverMessage.t === 'social' && clientGameState.landed && clientGameState.ltab === 'jobs')
        renderLanded();
      break; // friends, messages, trades, follow the leader
    case 'paused':
      clientGameState.paused = serverMessage.on;
      elementById2('pausebox').classList.toggle(
        'hidden',
        !serverMessage.on || clientGameState.quitting,
      );
      break;
    case 'chat':
      chatLine(serverMessage);
      receiveShipChat(clientGameState, serverMessage);
      if (serverMessage.from && serverMessage.from !== clientGameState.myName)
        audio.ui('chat', 0.7);
      break;
    case 'story':
      showStory(serverMessage);
      break;
    case 'hail':
      // Landing permission may have changed through the authoritative dialogue.
      landingFeedback.reset();
      if (elementById2('hailbox').classList.contains('hidden')) audio.ui('hail');
      showHail(serverMessage);
      break; // 1.1
    case 'order':
      clientGameState.order = serverMessage.o;
      break;
    case 'rivals':
      clientGameState.rivals = serverMessage.list;
      // Rivals only affect Captains; preserve in-progress gestures on other tabs.
      if (
        !elementById2('infobox').classList.contains('hidden') &&
        clientGameState.itab === 'captains'
      )
        renderInfo();
      break;
    case 'world': {
      // a new trouble close by gets a beacon and a line of news
      const previous = clientGameState.world && clientGameState.world.states;
      clientGameState.world = serverMessage;
      drawMini();
      refreshCompanion();
      if (previous && serverMessage.states && clientGameState.sys)
        for (const [starSystem, livingPayloadState] of Object.entries(serverMessage.states))
          if (!previous[starSystem] && systemsById[starSystem]) {
            const radius =
              starSystem === clientGameState.sys
                ? []
                : route(systemsById, clientGameState.sys!, starSystem);
            if (radius && radius.length <= 3) {
              audio.ui('state', 0.6);
              toast(
                `News: ${STATES[livingPayloadState.k] ? STATES[livingPayloadState.k].name.toLowerCase() : 'trouble'} in ${systemsById[starSystem].name}${radius.length ? `, ${radius.length} jump${radius.length > 1 ? 's' : ''} away` : ''}.`,
              );
              break;
            }
          }
      break;
    }
    case 'arena':
      if (serverMessage.id) {
        systemsById[serverMessage.id] =
          systemsById[serverMessage.id] || arenaSystem(serverMessage.id);
        clientGameState.arena = serverMessage;
      } else clientGameState.arena = null;
      renderTut();
      break;
    case 'boards':
      clientGameState.boards = clientGameState.boards || {};
      clientGameState.boards[serverMessage.cat] = serverMessage.list;
      if (clientGameState.landed) renderLanded();
      break;
    case 'profile':
      clientGameState.prof = serverMessage.p;
      if (!serverMessage.p) toast('No captain by that name.');
      if (clientGameState.landed) renderLanded();
      break;
    case 'notify':
      if (
        clientGameState.opts.notify &&
        document.hidden &&
        window.Notification &&
        Notification.permission === 'granted'
      ) {
        try {
          new Notification('Quantum Rift: ' + serverMessage.title, {
            body: serverMessage.body,
            icon: 'assets/stations/5.png',
          });
        } catch {}
      }
      break;
    case 'sites':
      clientGameState.sites = serverMessage.sites;
      if (clientGameState.landed) showLanded();
      refreshCompanion();
      break;
    case 'dead':
      setAuto(null);
      showDead(serverMessage);
      audio.play(10115);
      break;
  }
}

const storyQ: StoryMessage[] = [];
let dismissStory: (() => void) | null = null;
overlays.register({
  id: 'storybox',
  priority: 22,
  dismiss: () => dismissStory?.(),
  initialFocus: () => elementById2('storyb').querySelector<HTMLElement>('button'),
  reset: () => {
    dismissStory = null;
    document.body.classList.remove('ending-choice');
    storyQ.length = 0;
    elementById2('storyb').replaceChildren();
  },
});
function showStory(storyMessage: StoryMessage | undefined) {
  if (!clientGameState.you || !storyMessage) return;
  if (
    document.body.dataset.endingCinematic === 'active' ||
    document.body.dataset.endingCinematic === 'briefing'
  ) {
    storyQ.push(storyMessage);
    return;
  }
  if (onboarding.active()) {
    storyQ.push(storyMessage);
    return;
  }
  if (!elementById2('storybox').classList.contains('hidden')) {
    storyQ.push(storyMessage);
    return;
  } // one pop-up at a time: the rest wait their turn
  if (storyMessage.sequence === 'ark-departure' && storyMessage.tableEnding) {
    setAuto(null);
    clientGameState.autoRoute = false;
    clientGameState.route = [];
    playEndingCinematic({
      text: storyMessage.text,
      lampsRelit: storyMessage.tableEnding.lampsRelit,
      hull: Number(clientGameState.you.ship.hull),
      complete: () => {
        send({ t: 'storyacc', id: 'table-departure-complete' });
        if (storyQ.length) showStory(storyQ.shift());
      },
    });
    return;
  }
  if (storyMessage.sequence)
    startStorySequence(clientGameState, storyMessage.sequence, performance.now());
  document.body.classList.toggle(
    'ending-choice',
    storyMessage.id === 'choice' && !!storyMessage.choices?.length,
  );
  if (storyMessage.id === 'choice' && storyMessage.choices?.length)
    preloadEndingCinematic(Number(clientGameState.you.ship.hull));
  elementById2('storyt').textContent = storyMessage.title;
  elementById2('storyx').textContent = storyMessage.text;
  renderStoryPortrait(storyMessage);
  document.querySelector<HTMLElement>('#storybox .storytag')!.textContent =
    storyMessage.tag || 'STORY';
  elementById2('storyb').innerHTML = storyMessage.done
    ? '<button class="btn" id="storyok">CONTINUE</button>'
    : `<button class="btn sm" id="storyno">${storyMessage.ref || 'Not now'}</button><button class="btn" id="storyyes">${storyMessage.acc || 'Accept'}</button>`;
  audio.ui(
    /QUEST|SIDE STORY/.test(storyMessage.tag || '')
      ? 'quest'
      : storyMessage.done
        ? 'complete'
        : 'ping',
    0.7,
  ); // story beats have their own sting
  const close = () => {
    dismissStory = null;
    overlays.close('storybox');
    if (!document.body.classList.contains('ending-departure'))
      document.body.classList.remove('ending-choice');
    if (storyQ.length) {
      const epoch = sessionEpoch;
      setTimeout(() => {
        if (epoch === sessionEpoch) showStory(storyQ.shift());
      }, 150);
    }
  };
  dismissStory = close;
  if (storyMessage.choices?.length) {
    elementById2('storyb').replaceChildren();
    const deferChoice = document.createElement('button');
    deferChoice.className = 'btn sm';
    deferChoice.textContent = storyMessage.ref || 'Decide later';
    deferChoice.onclick = close;
    elementById2('storyb').append(deferChoice);
    for (const choice of storyMessage.choices) {
      const button = document.createElement('button');
      button.className = 'btn';
      button.textContent = choice.label;
      button.onclick = async () => {
        if (storyMessage.id === 'choice' && choice.value === 'table') {
          const epoch = sessionEpoch;
          const buttons = elementById2('storyb').querySelectorAll('button');
          buttons.forEach((entry) => (entry.disabled = true));
          let source: HTMLImageElement | undefined;
          if (elementById2('view').dataset.renderer === 'webgl') {
            try {
              // WebGL clears its drawing buffer between frames. Capture through
              // the engine before submitting the authoritative system transfer.
              source = await flightEngine.engine.screenshot(true);
            } catch {
              if (epoch === sessionEpoch) {
                buttons.forEach((entry) => (entry.disabled = false));
                toast('The scene could not be captured. Please try again.');
              }
              return;
            }
          }
          if (epoch !== sessionEpoch || !overlays.isTop('storybox')) return;
          prepareEndingDeparture(source);
        }
        send({ t: 'storyacc', id: storyMessage.id, choice: choice.value });
        close();
      };
      elementById2('storyb').append(button);
    }
    overlays.open('storybox');
    return;
  }
  if (storyMessage.done) elementById2('storyok').onclick = close;
  else {
    elementById2('storyno').onclick = close;
    elementById2('storyyes').onclick = () => {
      send(
        storyMessage.arc
          ? { t: 'arcacc', fac: storyMessage.arc }
          : { t: 'storyacc', id: storyMessage.id },
      );
      close();
    };
  }
  overlays.open('storybox');
}
window.addEventListener('rift-story', (event) => showStory((event as CustomEvent).detail));
window.addEventListener('rift-toast-sound', (event) =>
  audio.ui(
    (event as CustomEvent).detail,
    (event as CustomEvent).detail === 'complete' || (event as CustomEvent).detail === 'alert'
      ? 0.8
      : 0.55,
  ),
);
setInterval(() => {
  if (clientGameState.you && clientGameState.ctab === 'missions') drawMini();
}, 10000); // keeps rush countdowns current
// ------------------------------------------------------------------ snapshots and prediction
function updateAttention(attention?: SnapshotMessage['attention'], nhal?: SnapshotMessage['nhal']) {
  const indicator = elementById2('attentionindicator');
  const creatureLabels = [
    nhal?.ichor ? `Ichor ${nhal.ichor}s` : '',
    nhal?.slow ? `Drag ${nhal.slow}s` : '',
    nhal?.latch ? `Latch ${nhal.latch}s` : '',
  ].filter(Boolean);
  indicator.querySelector('.function-label')!.textContent = creatureLabels.length
    ? creatureLabels[0]
    : 'ALERT';
  const state = attention?.targeted ? 'targeted' : attention?.scanned ? 'scanned' : 'clear';
  const targetingLabel =
    state === 'targeted'
      ? 'Combat alert: another ship is targeting you'
      : state === 'scanned'
        ? 'Patrol scanned your hold recently'
        : 'No combat targeting or recent scan';
  const label = targetingLabel + (creatureLabels.length ? ' — ' + creatureLabels.join(', ') : '');
  indicator.dataset.state = state;
  if (indicator.getAttribute('aria-label') !== label) {
    indicator.setAttribute('aria-label', label);
    indicator.title = label;
  }
}
function onSnap(snapshotMessage: SnapshotMessage) {
  delete elementById2('flightstatus').dataset.disconnected;
  elementById2('flightstatus').classList.remove('hidden');
  updateAttention(
    clientGameState.landed ? undefined : snapshotMessage.attention,
    clientGameState.landed ? undefined : snapshotMessage.nhal,
  );
  receiveMining(clientGameState, snapshotMessage);
  clientGameState.combat = snapshotMessage.combat || {};
  clientGameState.formation = !!snapshotMessage.formation;
  shipFunctions.refresh();
  elementById2('combatstatus').textContent =
    ' · ' +
    (clientGameState.combat.status || 'OFF') +
    (clientGameState.combat.target ? ' · Target #' + clientGameState.combat.target : '') +
    (clientGameState.combat.reason ? ' · ' + clientGameState.combat.reason : '');
  elementById2('combatassist').textContent = clientGameState.combat.on
    ? 'ASSIST ON'
    : 'COMBAT ASSIST';
  elementById2('combatdelegate').checked = !!clientGameState.combat.consent;
  elementById2('combatcoordinate').checked = !!clientGameState.combat.coordinating;
  const currentTime = performance.now();
  _lastSnapT = currentTime;
  const [
    identifier,
    acknowledgement,
    positionX,
    positionY,
    velocityX,
    velocityY,
    firstValue,
    ship,
    armor2,
    fuel2,
    target2,
    ammo,
  ] = (snapshotMessage.me || []) as NonNullable<SnapshotMessage['me']>;
  if (snapshotMessage.me) clientGameState.myId = identifier;
  const seen = new Set();
  for (const ship3 of snapshotMessage.ships) {
    const [
      entityId,
      hull,
      velocityErrorX,
      velocityErrorY,
      entityAngle,
      entityVelocityX,
      entityVelocityY,
      flags,
      entityShield,
      entityArmor,
      faction,
      name,
      owner,
      panelWidth,
      storyEnding,
      machineSlot,
      machineParent,
      machineTransition,
      machineBlades,
    ] = ship3;
    seen.add(entityId);
    let renderEntity = clientGameState.ents.get(entityId);
    if (!renderEntity) {
      renderEntity = { id: entityId, rx: velocityErrorX, ry: velocityErrorY } as RenderEntity;
      clientGameState.ents.set(entityId, renderEntity);
    }
    Object.assign(renderEntity, {
      hull,
      x: velocityErrorX,
      y: velocityErrorY,
      a: entityAngle / 1000,
      vx: entityVelocityX,
      vy: entityVelocityY,
      fl: flags,
      sh: entityShield,
      ar: entityArmor,
      fac: faction,
      name,
      owner,
      pw: panelWidth,
      storyEnding,
      indexState:
        machineSlot === undefined
          ? undefined
          : {
              slot: machineSlot,
              parent: machineParent!,
              transition: machineTransition!,
              blades: machineBlades!,
            },
      t: currentTime,
    });
    if (Math.hypot(renderEntity.rx - velocityErrorX, renderEntity.ry - velocityErrorY) > 400) {
      renderEntity.rx = velocityErrorX;
      renderEntity.ry = velocityErrorY;
    }
  }
  // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
  for (const entryKey of [...clientGameState.ents.keys()])
    if (!seen.has(entryKey)) clientGameState.ents.delete(entryKey);
  clientGameState.shots = snapshotMessage.shots.map(
    ([screenX, screenY, smoothedVelocityX, smoothedVelocityY, width, owner]) => ({
      x: screenX,
      y: screenY,
      vx: smoothedVelocityX,
      vy: smoothedVelocityY,
      w: width,
      owner,
      t: currentTime,
    }),
  );
  clientGameState.beams = snapshotMessage.beams.map(([bidPrice, bankAngle, length, width]) => ({
    id: bidPrice,
    a: bankAngle,
    len: length,
    w: width,
  }));
  clientGameState.loot = snapshotMessage.loot.map(
    ([leaderId, localX, localY, kind, indexClaim]) => ({
      id: leaderId,
      x: localX,
      y: localY,
      kind,
      indexClaim: !!indexClaim,
    }),
  );
  // Observer snapshots never create a controllable ship.
  if (!snapshotMessage.me) return;
  for (const [width, count] of ammo) clientGameState.ammo[width] = count;
  // A snapshot already in flight may still contain the target we just cleared.
  // Keep the explicit clear until the server confirms it, rather than restoring
  // a stale target which subsequent zero-target snapshots would otherwise retain.
  if (clientGameState.targetClearPending && !target2) clientGameState.targetClearPending = false;
  if (
    !clientGameState.targetClearPending &&
    (!clientGameState.target || !clientGameState.ents.has(clientGameState.target))
  )
    clientGameState.target =
      target2 && clientGameState.ents.has(target2)
        ? target2
        : clientGameState.target && !clientGameState.ents.has(clientGameState.target)
          ? 0
          : clientGameState.target;
  // reconcile own ship: take the server state, replay inputs it has not seen yet
  const renderEntity2 = clientGameState.ents.get(identifier);
  if (renderEntity2) clientGameState.myHull = renderEntity2.hull;
  const clientView = prediction.reconcile(
    clientGameState.view,
    {
      id: identifier,
      acknowledgement,
      x: positionX,
      y: positionY,
      vx: velocityX,
      vy: velocityY,
      a: firstValue,
      shield: ship,
      armor: armor2,
      fuel: fuel2,
      fl: renderEntity2 ? renderEntity2.fl : 0,
    },
    clientGameState.you?.shipStats,
    !!renderEntity2 &&
      !(renderEntity2.fl & 8) &&
      !(clientGameState.combat.on || clientGameState.combat.delegated) &&
      !(clientGameState.formation && !clientGameState.auto),
  );
  clientGameState.view = clientView;
  {
    // 2.0 audio feedback: low shields, target lock, jump
    const computedShipStats = clientGameState.you && clientGameState.you!.shipStats,
      shieldPercentage = computedShipStats
        ? clientView.shield / Math.max(1, computedShipStats.shield)
        : 1;
    if (
      shieldPercentage < 0.25 &&
      !clientGameState._lowSh &&
      clientView.armor < (computedShipStats ? computedShipStats.armor : 1)
    ) {
      clientGameState._lowSh = true;
      audio.ui('lowshield');
    } else if (shieldPercentage > 0.45) clientGameState._lowSh = false;
    if (clientGameState.target && clientGameState.target !== clientGameState._lastTgt)
      audio.ui('lock', 0.7);
    clientGameState._lastTgt = clientGameState.target;
    if (clientView.fl & 8 && !clientGameState._jumping) {
      clientGameState._jumping = true;
      clientGameState._jumpStart = performance.now();
      audio.ui(
        clientGameState.you &&
          clientGameState.you!.shipStats &&
          clientGameState.you!.shipStats.jumpFast
          ? 'jumpfast'
          : 'jump',
        0.9,
      );
    } else if (
      !(clientView.fl & 8) &&
      clientGameState._jumping &&
      performance.now() - clientGameState._jumpStart! > 2500
    )
      clientGameState._jumping = false; // the jump event usually starts it first
    if (clientGameState._lastAr != null && clientView.armor < clientGameState._lastAr - 0.5) {
      clientGameState._hurtT = performance.now();
    }
    clientGameState._lastAr = clientView.armor;
  }
  for (const snapshotEvent of snapshotMessage.ev) onEvent(snapshotEvent);
}
function onEvent(snapshotEvent: SnapshotEvent) {
  const clientView = clientGameState.view,
    deltaX = clientView ? snapshotEvent[1] - clientView.x : 0,
    deltaY = clientView ? snapshotEvent[2] - clientView.y : 0;
  switch (snapshotEvent[0]) {
    case 'snd':
      audio.play(
        snapshotEvent[1],
        snapshotEvent[2] - (clientView ? clientView.x : 0),
        snapshotEvent[3] - (clientView ? clientView.y : 0),
        0.55,
      );
      break;
    case 'boom': {
      boom(snapshotEvent[1], snapshotEvent[2], snapshotEvent[3]);
      audio.play(snapshotEvent[3] > 120 ? 10115 : 241, deltaX, deltaY, 0.8);
      const distance = Math.hypot(deltaX, deltaY);
      if (distance < 900) addShake(Math.min(10, snapshotEvent[3] / 25) * (1 - distance / 900));
      break;
    }
    case 'hit': {
      spark(
        snapshotEvent[1],
        snapshotEvent[2],
        weaponColor(clientGameState.A!.weapons[snapshotEvent[3]]),
      );
      if (snapshotEvent.length > 4) {
        const [, positionX, positionY, , targetId, damage, source, ship] = snapshotEvent;
        if (ship) shieldHit(targetId, positionX, positionY);
        if (
          clientGameState.opts.dmg &&
          (source === clientGameState.myId || targetId === clientGameState.myId)
        )
          dmgNumber(positionX, positionY - 10, damage, source === clientGameState.myId);
        if (targetId === clientGameState.myId) addShake(Math.min(4, 1 + damage / 60));
      }
      break;
    }
    case 'blast':
      blast(snapshotEvent[1], snapshotEvent[2], snapshotEvent[3]);
      break;
    case 'rock': {
      const entryKey = clientGameState.rockById && clientGameState.rockById.get(snapshotEvent[1]);
      if (entryKey) entryKey.hp = snapshotEvent[2];
      break;
    }
    case 'flash':
      flash(snapshotEvent[1], snapshotEvent[2]);
      if (Math.hypot(deltaX, deltaY) > 80) audio.play('jumpfar', deltaX, deltaY, 0.8);
      break; // your own jump has its own sound
    case 'jump':
      if (snapshotEvent[1] === clientGameState.myId && !clientGameState._jumping) {
        clientGameState._jumping = true;
        clientGameState._jumpStart = performance.now();
        audio.ui(
          clientGameState.you &&
            clientGameState.you!.shipStats &&
            clientGameState.you!.shipStats.jumpFast
            ? 'jumpfast'
            : 'jump',
          0.9,
        );
      }
      break; // the spool starts the moment the server begins your jump
    case 'pickup':
      audio.play(10112, 0, 0, 0.6);
      break;
    case 'flee':
      if (snapshotEvent[1] === clientGameState.target) {
        const renderEntity = clientGameState.ents.get(snapshotEvent[1]);
        toast(
          `${(renderEntity && renderEntity.name) || (renderEntity && clientGameState.A!.ships[renderEntity.hull] ? 'The ' + clientGameState.A!.ships[renderEntity.hull].name : 'Your target')} breaks off and runs for the jump point!`,
        );
      }
      break; // 2.4
  }
}

// ------------------------------------------------------------------ input
const editingText = () =>
  document.activeElement &&
  (['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName) ||
    (document.activeElement as HTMLElement).isContentEditable);
const typing = () =>
  (!elementById2('infobox').classList.contains('hidden') &&
    !elementById2('captainprofile').classList.contains('hidden')) ||
  editingText();
window.addEventListener('keydown', (keyboardEvent) => {
  // Dock navigation and browser shortcuts must not become flight commands.
  if (keyboardEvent.ctrlKey || keyboardEvent.metaKey) return;
  if (
    clientGameState.landed &&
    ['Tab', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(keyboardEvent.code)
  )
    return;
  // Native activation/focus keys belong to the focused control. Steering and
  // remapped actions still work after clicking a HUD button; separators consume
  // only their own sizing keys locally.
  if (
    ['Tab', 'Enter', ' '].includes(keyboardEvent.key) &&
    (keyboardEvent.target as HTMLInputElement).closest?.(
      'button, summary, a, [role="button"], [role="separator"]',
    )
  )
    return;
  if (keyboardEvent.key === 'Enter' && clientGameState.you && !overlays.blocksFlight()) {
    const inputControl = elementById2('chatin');
    if (document.activeElement === inputControl) {
      sendChat();
      inputControl.blur();
    } else if (!typing()) {
      inputControl.focus();
    }
    keyboardEvent.preventDefault();
    return;
  }
  if (typing()) {
    if (keyboardEvent.key === 'Escape') (document.activeElement as HTMLElement).blur();
    return;
  }
  if (!clientGameState.you) return;
  if (overlays.blocksFlight()) return;
  audio.unlock();
  if (
    ['Space', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(
      keyboardEvent.code,
    ) ||
    actionOf(keyboardEvent.code)
  )
    keyboardEvent.preventDefault();
  if (keyboardEvent.repeat) return;
  if (keyboardEvent.code === 'Escape') {
    closeMap();
    setTarget(0);
    return;
  }
  if (
    clientGameState.landed &&
    actionOf(keyboardEvent.code) === 'land' &&
    !elementById2('depart').disabled
  ) {
    send({ t: 'depart' });
    return;
  } // L leaves the dock too
  if (clientGameState.landed && /^Digit[1-9]$/.test(keyboardEvent.code) && clientGameState._ltabs) {
    const entryKey = clientGameState._ltabs[+keyboardEvent.code.slice(5) - 1];
    if (entryKey) {
      clientGameState.ltab = entryKey;
      clientGameState.sel = null;
      showLanded();
      audio.ui('tab', 0.7);
    }
    return;
  } // number keys pick landing tabs
  if (keyboardEvent.key === '?' || keyboardEvent.code === 'F1') {
    keyboardEvent.preventDefault();
    openControls();
    return;
  }
  switch (actionOf(keyboardEvent.code)) {
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
      miningUI.invokeMiningAction(actionOf(keyboardEvent.code)!);
      break;
    case 'surveyPulse':
      miningUI.invokeMiningAction('surveyPulse');
      break;
    case 'target':
      cycleTarget(keyboardEvent.shiftKey ? -1 : 1);
      break;
    case 'nearest':
      nearestHostile();
      break;
    case 'land':
      landRequest();
      break;
    case 'map':
      elementById2('gmap').classList.contains('hidden') ? openMap() : closeMap();
      break;
    case 'jump':
      jumpNext();
      break;
    case 'zoomin':
      clientGameState.zoom = Math.min(2, clientGameState.zoom * 1.15);
      break;
    case 'zoomout':
      clientGameState.zoom = Math.max(0.35, clientGameState.zoom / 1.15);
      break;
    case 'pause':
      if (clientGameState.solo) send({ t: 'pause' });
      break;
    case 'mute':
      clientGameState.opts.mute = !clientGameState.opts.mute;
      applyOpts();
      saveOpts();
      volUi();
      toast(clientGameState.opts.mute ? 'Sound muted (N to unmute).' : 'Sound on.');
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
      toggleInfo(true);
      break;
    case 'captain':
      toggleInfo(false);
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
      if (!document.body.classList.contains('tray-open')) elementById2('traytoggle').click();
      const time = [
        'radio',
        'codex',
        'missions',
        'station',
        'ops',
        ...(clientGameState.solo ? [] : ['captains']),
        'log',
      ];
      ctab(time[(time.indexOf(clientGameState.ctab) + 1) % time.length]);
      break;
    }
  }
});
window.addEventListener('blur', () => {
  clearManualFlightInput();
});
/**
 * Shows the viewscreen JUMP button in flight and fades it until a destination is plotted.
 * It runs the same hyperjump action as the bound key (J by default).
 */
function refreshJumpButton(): void {
  const button = elementById2('jumpholo');
  const flying = !!clientGameState.view && !clientGameState.landed;
  button.classList.toggle('hidden', !flying);
  if (!flying) return;
  const plotted = clientGameState.route.length > 0;
  const keyLabel = keyName(bound('jump'));
  button.disabled = !plotted || overlays.blocksFlight();
  button.title = plotted
    ? `Jump to ${systemsById[clientGameState.route[0]]?.name || 'the next system'} (${keyLabel})`
    : 'Plot a course on the map first (M)';
  elementById2('jumpholokey').textContent = bound('jump') ? keyLabel : '';
}
elementById2('jumpholo').onclick = () => {
  if (
    clientGameState.you &&
    clientGameState.view &&
    !clientGameState.landed &&
    !overlays.blocksFlight() &&
    clientGameState.route.length
  )
    jumpNext();
};
function jumpNext() {
  if (!clientGameState.route.length) return toast('Plot a course on the map first (M).');
  clientGameState.autoRoute = clientGameState.route.length > 1; // J flies the whole plotted route, jump after jump
  const starSystem = systemsById[clientGameState.sys!];
  if (starSystem && starSystem.gate === clientGameState.route[0]) {
    const rawStellarBody = starSystem.stellars.find((rawStellarBody) => rawStellarBody.wormhole);
    if (rawStellarBody) {
      clientGameState.navStellar = rawStellarBody.id;
      toast(`The next leg crosses ${rawStellarBody.name}: fly into the wormhole.`);
    }
    return;
  }
  const clientView = clientGameState.view;
  if (
    clientView &&
    starSystem &&
    starSystem.stellars.some(
      (rawStellarBody) =>
        Math.hypot(clientView.x - rawStellarBody.x, clientView.y - rawStellarBody.y) <
        physicsConstants.jumpClear,
    )
  ) {
    setAuto(
      { mode: 'jump' },
      'Autopilot: flying clear of the planets to jump. Steer to take over.',
    );
    return;
  } // 1.0.3
  send({ t: 'jump', to: clientGameState.route[0] });
}
// ------------------------------------------------------------------ 1.1 hailing
function hailTarget() {
  if (clientGameState.target && clientGameState.ents.get(clientGameState.target))
    return send({ t: 'hail', id: clientGameState.target });
  if (clientGameState.navStellar) return send({ t: 'hail', stellar: clientGameState.navStellar });
  toast('Target a ship (click or Tab) or select a planet (click it) to hail.');
}
const profileUI = initProfile(clientGameState, send);
const hailUI = initHails({ G: clientGameState, send, toast, cam: camera });
function showHail(hailConversation: HailConversation) {
  hailUI.show(hailConversation);
}

// Ship and captain info shares the modal controller.
function openInfo(shipDetails = false) {
  if (shipDetails) clientGameState.itab = 'ship';
  else if (!clientGameState.itab || clientGameState.itab === 'ship')
    clientGameState.itab = 'profile';
  audio.ui('open', 0.6);
  send({ t: 'rivals' });
  renderInfo();
  overlays.open('infobox');
}
function toggleInfo(shipDetails: boolean) {
  if (
    !elementById2('infobox').classList.contains('hidden') &&
    (clientGameState.itab === 'ship') === shipDetails
  )
    closeInfo();
  else openInfo(shipDetails);
}
elementById2('captainshortcut').onclick = () => toggleInfo(false);
elementById2('shipshortcut').onclick = () => toggleInfo(true);
function closeInfo() {
  profileUI.hide();
  audio.ui('close', 0.6);
  overlays.close('infobox');
}
function renderInfo() {
  const shipDetails = clientGameState.itab === 'ship';
  elementById2('infotitle').textContent = shipDetails ? 'SHIP DETAILS' : 'CAPTAIN';
  const shortcut = bound(shipDetails ? 'info' : 'captain');
  elementById2('infotitle').nextElementSibling!.textContent =
    `${shortcut ? keyName(shortcut) + ' or ' : ''}Esc to close`;
  elementById2('infobox').setAttribute('aria-label', shipDetails ? 'Ship details' : 'Captain');
  elementById2('itabs').classList.toggle('hidden', shipDetails);
  const profileSelected = clientGameState.itab === 'profile';
  elementById2('infobody').classList.toggle('hidden', profileSelected);
  if (profileSelected) profileUI.show();
  else profileUI.hide();
  if (!profileSelected)
    clientGameState.views.replace(
      elementById2('infobody'),
      infoHtml(clientGameState, clientGameState.itab || 'ship'),
      'info:' + (clientGameState.itab || 'ship'),
    );
  elementById2('itabs')
    .querySelectorAll<HTMLElement>('button')
    .forEach((htmlElement) =>
      htmlElement.classList.toggle(
        'on',
        htmlElement.dataset.it === (clientGameState.itab || 'ship'),
      ),
    );
}
elementById2('itabs').addEventListener('click', (pointerEvent) => {
  const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>('[data-it]');
  if (!htmlElement) return;
  clientGameState.itab = htmlElement.dataset.it!;
  elementById2('itabs')
    .querySelectorAll<HTMLElement>('button')
    .forEach((htmlElement2) => htmlElement2.classList.toggle('on', htmlElement2 === htmlElement));
  renderInfo();
});
elementById2('infobody').addEventListener('click', (pointerEvent) => {
  const sale = (pointerEvent.target as HTMLElement).closest<HTMLButtonElement>(
    '[data-sell-outfit]',
  );
  if (sale && !sale.disabled) {
    send({
      t: 'outfit',
      id: Number(sale.dataset.sellOutfit),
      n: -1,
      ...(sale.dataset.fixedWeapon ? { fixed: true } : {}),
    });
    return;
  }
  const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>('[data-plot]');
  if (htmlElement) {
    plot(htmlElement.dataset.plot!);
    toast(`Course plotted to ${systemsById[htmlElement.dataset.plot!].name}.`);
    return;
  }
  const htmlElement2 = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>(
    '[data-jet],[data-ord]',
  );
  if (!htmlElement2) return;
  if (htmlElement2.dataset.jet!) {
    const lots = htmlElement2.dataset.grade!
      ? { common: 0, rich: 0, pure: 0, [htmlElement2.dataset.grade!]: +htmlElement2.dataset.n! }
      : undefined;
    send({ t: 'jettison', cid: htmlElement2.dataset.jet!, n: +htmlElement2.dataset.n! || 0, lots });
  } else send({ t: 'order', o: htmlElement2.dataset.ord! });
  const epoch = sessionEpoch;
  setTimeout(() => {
    if (epoch === sessionEpoch && clientGameState.you) renderInfo();
  }, 250);
});
overlays.register({
  id: 'infobox',
  priority: 25,
  dismiss: closeInfo,
  initialFocus: () =>
    clientGameState.itab === 'ship'
      ? elementById2('infobox')
      : elementById2('itabs').querySelector<HTMLElement>('.on'),
  allowOutsidePointer: (target) => !!target.closest('#captainshortcut,#shipshortcut,#optbtn'),
  keyDown: (event) => {
    const action = actionOf(event.code);
    if (!['info', 'captain'].includes(action!) || editingText()) return false;
    if (!event.repeat) toggleInfo(action === 'info');
    return true;
  },
});
// ------------------------------------------------------------------ 1.0.3 autopilot: fly to a planet, turn, brake and land; or fly clear and jump
clientGameState.startAutoJump = () => {
  const epoch = sessionEpoch;
  return setTimeout(() => {
    if (epoch !== sessionEpoch) return;
    if (clientGameState.view && clientGameState.route.length && !clientGameState.auto) {
      clientGameState.autoKeep = true;
      setAuto(
        { mode: 'jump' },
        `Autopilot: following to ${systemsById[clientGameState.route[0]].name}.`,
      );
    }
  }, 300);
}; // follow the leader
const landingFeedback = new LandingFeedback();
function setAuto(
  firstValue: ClientGameState['auto'],
  message?: string | null,
  preserveLandingFeedback = false,
) {
  if (!preserveLandingFeedback && (!firstValue || firstValue.mode !== 'land'))
    landingFeedback.reset();
  if (firstValue && (clientGameState.towing || clientGameState.you?.towing)?.attached) {
    toast('Towing: manual flight only; detach before automatic transit.');
    return;
  }
  if (firstValue) {
    send({ t: 'combat', op: 'off' });
    clientGameState.combat = {};
  }
  if (firstValue && !clientGameState.auto) audio.ui('autopilot', 0.8);
  clientGameState.auto = firstValue;
  if (!firstValue)
    clientGameState.autoRoute = clientGameState.autoRoute && clientGameState.autoKeep;
  clientGameState.autoKeep = false;
  elementById2('autobadge').classList.toggle('hidden', !firstValue);
  if (firstValue) {
    elementById2('autobadge').textContent =
      firstValue.mode === 'land'
        ? 'AUTOPILOT · LANDING'
        : firstValue.mode === 'gateway'
          ? 'AUTOPILOT · GATEWAY'
          : firstValue.mode === 'stop'
            ? 'FULL STOP'
            : clientGameState.autoRoute && clientGameState.route.length > 1
              ? `AUTOPILOT · ${clientGameState.route.length} JUMPS`
              : 'AUTOPILOT · JUMP';
    if (message) toast(message);
  }
}
function autopilot(input: Record<string, number>): void {
  const clientView = clientGameState.view,
    computedShipStats = clientGameState.you && clientGameState.you!.shipStats,
    firstValue = clientGameState.auto!,
    starSystem = systemsById[clientGameState.sys!];
  if (!clientView || !computedShipStats || !starSystem) return setAuto(null);
  if (firstValue.mode !== 'stop') {
    const destination =
      firstValue.mode === 'land' || firstValue.mode === 'gateway'
        ? starSystem.stellars.find((rawStellarBody) => rawStellarBody.id === firstValue.id)
        : (() => {
            const starSystem2 = systemsById[clientGameState.route[0]];
            if (!starSystem2) return null;
            const atan = jumpClearHeading(
              starSystem,
              clientView.x,
              clientView.y,
              Math.atan2(starSystem2.x - starSystem.x, -(starSystem2.y - starSystem.y)),
            );
            return {
              x: clientView.x + Math.sin(atan) * (physicsConstants.jumpClear + 1000),
              y: clientView.y - Math.cos(atan) * (physicsConstants.jumpClear + 1000),
            };
          })();
    const speed = Math.hypot(clientView.vx, clientView.vy);
    const stoppingMargin =
      1000 +
      (speed * Math.PI) / Math.max(0.1, computedShipStats.turn) +
      (speed * speed) / (2 * Math.max(1, computedShipStats.accel));
    if (
      destination &&
      coronaRouteBlocked(clientGameState.sys!, clientView, destination, stoppingMargin)
    ) {
      clientGameState.autoRoute = false;
      setAuto({ mode: 'stop' });
      toast(
        'Autopilot blocked: stellar collector keep-out. Braking; use manual flight to exit or harvest.',
      );
      return autopilot(input);
    }
  }
  if (firstValue.mode === 'stop') {
    // full stop: turn against your drift and burn until still
    const space = Math.hypot(clientView.vx, clientView.vy);
    if (space < 6) {
      input.thrust = 0;
      return setAuto(null);
    }
    const wrap2 = wrap(Math.atan2(-clientView.vx, clientView.vy) - clientView.a);
    input.turn = Math.abs(wrap2) < computedShipStats.turn * tickDuration ? 0 : Math.sign(wrap2);
    input.thrust = Math.abs(wrap2) < 0.25 && space > 6 ? 1 : 0;
    input.rev = 0;
    return;
  }
  if (firstValue.mode === 'gateway') {
    const rawStellarBody = starSystem.stellars.find(
      (rawStellarBody) => rawStellarBody.id === firstValue.id && rawStellarBody.wormhole,
    );
    if (!rawStellarBody || firstValue.sys !== clientGameState.sys) return setAuto(null);
    // Aim inside the transit aperture; never send a landing request.
    gatewayGuidance(clientView, computedShipStats, rawStellarBody, input);
    return;
  }
  if (firstValue.mode === 'land') {
    const rawStellarBody = starSystem.stellars.find(
      (rawStellarBody3) => rawStellarBody3.id === firstValue.id,
    );
    if (!rawStellarBody) return setAuto(null);
    landingGuidance(firstValue, clientView, computedShipStats, rawStellarBody, input);
    if (
      landingReady(
        firstValue,
        clientView,
        clientGameState.ents.get(clientGameState.myId)!,
        computedShipStats,
        rawStellarBody,
        performance.now(),
      )
    )
      send({ t: 'land', stellar: rawStellarBody.id });
  } else {
    const starSystem2 = systemsById[clientGameState.route[0]];
    if (!starSystem2) return setAuto(null);
    if (
      starSystem.stellars.every(
        (rawStellarBody) =>
          Math.hypot(clientView.x - rawStellarBody.x, clientView.y - rawStellarBody.y) >
          physicsConstants.jumpClear + 60,
      )
    ) {
      const autoRoute2 = clientGameState.autoRoute;
      clientGameState.autoKeep = true;
      setAuto(null);
      input.thrust = 0;
      jumpNext();
      clientGameState.autoRoute = autoRoute2 && clientGameState.route.length > 1;
      return;
    }
    // Leave by the nearest open side rather than crossing the system toward the next star.
    const atan = jumpClearHeading(
        starSystem,
        clientView.x,
        clientView.y,
        Math.atan2(starSystem2.x - starSystem.x, -(starSystem2.y - starSystem.y)),
      ),
      wrap3 = wrap(atan - clientView.a);
    input.turn = Math.abs(wrap3) < computedShipStats.turn * tickDuration ? 0 : Math.sign(wrap3);
    input.thrust = Math.abs(wrap3) < 0.5 ? 1 : 0;
    input.rev = 0;
  }
}
function sendChat() {
  const inputControl = elementById2('chatin'),
    trim2 = inputControl.value.trim();
  inputControl.value = '';
  if (!trim2) return;
  if (clientGameState.solo) {
    send({ t: 'note', text: trim2 });
    toast('Added to your log.');
    return;
  } // in a solo game the chat line writes notes in your captain's log
  if (trim2.startsWith('/s ')) send({ t: 'chat', msg: trim2.slice(3), ch: 'sys' });
  else if (trim2.startsWith('/a ') || trim2.startsWith('/f '))
    send({ t: 'chat', msg: trim2.slice(3), ch: 'armada' });
  else if (/^\/r \S/.test(trim2) && clientGameState.lastDmFrom)
    send({ t: 'social', op: 'dm', name: clientGameState.lastDmFrom, msg: trim2.slice(3) });
  else if (/^\/w \S/.test(trim2)) {
    const regExpMatchArray = trim2.match(/^\/w ("[^"]+"|\S+) (.+)$/);
    if (regExpMatchArray)
      send({
        t: 'social',
        op: 'dm',
        name: regExpMatchArray[1].replace(/"/g, ''),
        msg: regExpMatchArray[2],
      });
  } else if (clientGameState.chan) send({ t: 'chat', msg: trim2, ch: clientGameState.chan });
  else send({ t: 'chat', msg: trim2 });
}
// Command bar: chat channel buttons, the controls card, and shortcuts to key bindings, options and the map
elementById2('cchan').addEventListener('click', (pointerEvent) => {
  const htmlElement = (pointerEvent.target as HTMLInputElement).closest<HTMLElement>('[data-ch]');
  if (!htmlElement) return;
  clientGameState.chan = htmlElement.dataset.ch!;
  elementById2('cchan')
    .querySelectorAll<HTMLElement>('button')
    .forEach((htmlElement2) => htmlElement2.classList.toggle('on', htmlElement2 === htmlElement));
  elementById2('chatin').placeholder =
    clientGameState.chan === 'sys'
      ? 'Press Enter to talk to this system'
      : clientGameState.chan === 'fleet'
        ? 'Press Enter to talk to your fleet'
        : 'Press Enter to chat';
  elementById2('chatin').focus();
});
const BASICS = [
  ['Left click', 'Target a ship, or plot a course on the map'],
  ['Double click', 'Land on a planet/station, or fly through a Gateway'],
  ['Mouse wheel', 'Zoom'],
  ['Enter', 'Chat'],
  ['Esc', 'Close a window / open log out confirmation'],
];
/**
 * Opens the flight and keyboard controls reference dialog modal.
 */
function openControls(): void {
  audio.ui('open', 0.6);
  elementById2('ctrllist').innerHTML =
    '<div class="osect">FLIGHT AND COMBAT</div><div class="ctrlgrid">' +
    ACTIONS.map(
      ([firstValue, count]) =>
        `<div class="ctrlbinding"><span class="k">${keyName(bound(firstValue))}${alternateBindings[firstValue] ? ' / ' + keyName(alternateBindings[firstValue]) : ''}</span><span>${count}</span></div>`,
    ).join('') +
    '</div>' +
    '<div class="osect">MOUSE AND MENUS</div><div class="ctrlgrid">' +
    BASICS.map(
      ([entryKey, count]) =>
        `<div class="ctrlbinding"><span class="k">${entryKey}</span><span>${count}</span></div>`,
    ).join('') +
    '</div>';
  overlays.open('ctrlbox');
}
/**
 * Closes the flight controls reference dialog modal.
 */
const closeControls = (): void => overlays.close('ctrlbox');
overlays.register({
  id: 'ctrlbox',
  priority: 27,
  dismiss: closeControls,
  initialFocus: () => elementById2('ctrlclose'),
  keyDown: (event) => {
    if (event.key !== '?') return false;
    if (!event.repeat) closeControls();
    return true;
  },
});
const replayIntroduction = document.createElement('button');
replayIntroduction.className = 'btn';
replayIntroduction.id = 'introreplay';
replayIntroduction.textContent = 'REPLAY INTRODUCTION';
elementById2('ctrlclose').parentElement!.prepend(replayIntroduction);
replayIntroduction.onclick = () => {
  closeControls();
  onboarding.start(true);
};
elementById2('cbhelp').onclick = openControls;
elementById2('ctrlclose').onclick = closeControls;
elementById2('ctrlkeys').onclick = () => {
  closeControls();
  openOpts(true);
};
// Key binding editor remains available through Options and Controls.
elementById2('gclose').onclick = closeMap;
elementById2('cbmap').onclick = () =>
  elementById2('gmap').classList.contains('hidden') ? openMap() : closeMap();
/**
 * Cycles target lock through visible ships sorted by distance.
 * @param direction Direction offset in target list (-1 for previous, 1 for next)
 */
function cycleTarget(direction: number): void {
  const clientView = clientGameState.view;
  if (!clientView) return;
  const list = [...clientGameState.ents.values()]
    .filter((renderEntity) => renderEntity.id !== clientGameState.myId)
    .sort(
      (renderEntity, renderEntity2) =>
        Math.hypot(renderEntity.rx - clientView.rx, renderEntity.ry - clientView.ry) -
        Math.hypot(renderEntity2.rx - clientView.rx, renderEntity2.ry - clientView.ry),
    );
  if (!list.length) return;
  const index = list.findIndex((renderEntity) => renderEntity.id === clientGameState.target);
  const renderEntity = list[(index + direction + list.length) % list.length];
  setTarget(renderEntity.id);
}
/**
 * Finds and targets the nearest hostile ship in the current system.
 */
function nearestHostile(): void {
  const clientView = clientGameState.view;
  if (!clientView) return;
  const list = [...clientGameState.ents.values()]
    .filter((renderEntity) => clientGameState.hostile(renderEntity))
    .sort(
      (renderEntity, renderEntity2) =>
        Math.hypot(renderEntity.rx - clientView.rx, renderEntity.ry - clientView.ry) -
        Math.hypot(renderEntity2.rx - clientView.rx, renderEntity2.ry - clientView.ry),
    );
  if (list.length) {
    setTarget(list[0].id);
  } else toast('No hostiles nearby.');
}
/**
 * Requests docking/landing on a specified or nearest landable stellar object.
 * @param pick Optional targeted stellar body
 */
function landRequest(pick?: {
  id: string;
  name: string;
  x: number;
  y: number;
  r: number;
  svc?: string;
}): void {
  const clientView = clientGameState.view,
    starSystem = systemsById[clientGameState.sys!];
  if (!clientView || !starSystem) return;
  const objectives = missionTargets(clientGameState);
  const highlighted = chooseLandingPort(
    starSystem.stellars.filter((rawStellarBody) => rawStellarBody.svc!.includes('L')),
    clientView,
    {
      pickedNav: clientGameState.navPicked ? clientGameState.navStellar : null,
      pinnedStellar:
        objectives.find((objective) => objective.key === clientGameState.pinnedObjective)
          ?.stellar ?? null,
      missionStellars: objectives.flatMap((objective) =>
        objective.stellar ? [objective.stellar] : [],
      ),
    },
  );
  // Double-click keeps its destination; L follows the highlighted nav point or mission.
  const position = pick || highlighted;
  const towing = !!(clientGameState.towing || clientGameState.you?.towing)?.attached;
  const distance = position
    ? Math.hypot(position.x - clientView.x, position.y - clientView.y)
    : Infinity;
  const speed = Math.hypot(clientView.vx, clientView.vy);
  landingFeedback.situation(
    JSON.stringify([
      sessionEpoch,
      clientGameState.myId,
      clientGameState.sys,
      position?.id ?? 'none',
      towing,
      !!((clientGameState.ents.get(clientGameState.myId)?.fl ?? 0) & 4),
      distance <= (position?.r ?? 0) + 60,
      speed <= 80,
      (clientGameState.you?.rep[starSystem.faction] ?? 0) <= -30,
    ]),
  );
  if (!position) {
    const message = 'Nowhere to land in this system.';
    if (landingFeedback.notice(message)) toast(message);
    return;
  }
  if (towing) {
    const message = 'Towing: manual flight only; detach before automatic transit.';
    if (landingFeedback.notice(message)) toast(message);
    return;
  }
  if (clientGameState.auto?.mode === 'land' && clientGameState.auto.id === position.id) return;
  clientGameState.navStellar = position.id;
  // Even a nearby click must settle first: predicted distance alone can race
  // the server at the edge of its landing radius while the ship is drifting.
  const message = `Autopilot: landing on ${position.name}. Steer to take over.`;
  setAuto({ mode: 'land', id: position.id }, landingFeedback.notice(message) ? message : undefined);
}

// ------------------------------------------------------------------ mouse: click to target, click a planet to set nav, double-click to land
const mouse = { x: 0, y: 0, wx: 0, wy: 0, in: false, down: false };
/**
 * Converts screen/canvas client coordinates to game world space coordinates.
 * @param centerX Client X coordinate
 * @param centerY Client Y coordinate
 * @returns World coordinates [wx, wy]
 */
function toWorld(centerX: number, centerY: number): [number, number] {
  return flightEngine.worldPoint(centerX, centerY);
}

/**
 * Identifies the nearest interactive ship or stellar body under the given world coordinates.
 * @param worldX World X coordinate
 * @param worldY World Y coordinate
 * @returns Picked target or null
 */
function pickAt(
  worldX: number,
  worldY: number,
): { ship?: RenderEntity; stellar?: import('../shared/galaxy.ts').RawStellarBody } | null {
  if (!clientGameState.view || clientGameState.landed) return null;
  let best = null,
    infinity = Infinity;
  for (const renderEntity of clientGameState.ents.values()) {
    if (renderEntity.id === clientGameState.myId) continue;
    const shipHullAsset = clientGameState.A!.ships[renderEntity.hull];
    const radius = Math.max(
        16 / camera.z,
        (shipHullAsset ? shipHullAsset.size : 50) * clientGameState.spriteScale * 0.42,
      ),
      distance = Math.hypot(renderEntity.rx - worldX, renderEntity.ry - worldY);
    if (distance < radius && distance < infinity) {
      infinity = distance;
      best = { ship: renderEntity };
    }
  }
  if (best) return best;
  const starSystem = systemsById[clientGameState.sys!];
  if (!starSystem) return null;
  for (const rawStellarBody of starSystem.stellars) {
    const distance = Math.hypot(rawStellarBody.x - worldX, rawStellarBody.y - worldY);
    if (
      distance < rawStellarBody.r * (rawStellarBody.hub ? 1 : 1.15) + 10 / camera.z &&
      distance < infinity
    ) {
      infinity = distance;
      best = { stellar: rawStellarBody };
    }
  }
  return best;
}
/**
 * Determines the appropriate mouse cursor style based on hover target.
 * @param height2 Picked object under cursor
 * @returns CSS cursor identifier class suffix
 */
function cursorFor(
  height: { ship?: RenderEntity; stellar?: import('../shared/galaxy.ts').RawStellarBody } | null,
): string {
  if (clientGameState.opts.mouseAim && !height) return 'aim';
  if (!height) return '';
  if (height.ship)
    return clientGameState.hostile(height.ship)
      ? 'hostile'
      : height.ship.owner === clientGameState.myId
        ? 'friendly'
        : height.ship.fl & 16
          ? 'friendly'
          : 'neutral';
  return height.stellar!.svc!.includes('L') ? 'land' : '';
}
/**
 * Applies a cursor CSS class to the canvas element.
 * @param component Cursor type name
 */
function setCursor(component: string): void {
  if (canvas.dataset.cur! !== component) {
    canvas.dataset.cur = component;
    canvas.className = component ? 'cur-' + component : '';
  }
}
/**
 * Sets the active target ID and notifies the server.
 * @param identifier Target entity ID or 0 to clear
 */
function setTarget(identifier: number): void {
  clientGameState.targetClearPending = identifier === 0;
  clientGameState.target = identifier;
  send({ t: 'target', id: identifier });
}
flightEngine.engine.input.pointers.on('move', (event) => {
  const mouseEvent = event.nativeEvent as MouseEvent;
  if (overlays.blocksFlight()) return;
  if (
    clientGameState.opts.mouseAim &&
    (mouseEvent.movementX || mouseEvent.movementY) &&
    clientGameState.combat &&
    (clientGameState.combat.on || clientGameState.combat.delegated)
  ) {
    send({ t: 'combat', op: 'manual' });
    clientGameState.combat.on = clientGameState.combat.delegated = false;
  }
  mouse.x = mouseEvent.clientX;
  mouse.y = mouseEvent.clientY;
  mouse.in = true;
  if (clientGameState._look) {
    const deltaX = mouseEvent.clientX - clientGameState._look.x,
      deltaY = mouseEvent.clientY - clientGameState._look.y;
    if (Math.hypot(deltaX, deltaY) > 6) clientGameState._look.moved = true;
    const domRect = canvas.getBoundingClientRect(),
      entryKey = canvas.width / domRect.width,
      message = 3200,
      length = 2.4 / clientGameState.zoom;
    clientGameState._lookT = [
      Math.max(-message, Math.min(message, deltaX * entryKey * length)),
      Math.max(-message, Math.min(message, deltaY * entryKey * length)),
    ];
  }
  [mouse.wx, mouse.wy] = toWorld(mouseEvent.clientX, mouseEvent.clientY);
  const pickAt2 = pickAt(mouse.wx, mouse.wy);
  clientGameState.hover = pickAt2 && pickAt2.ship ? pickAt2.ship.id : 0;
  clientGameState.hoverStellar = pickAt2 && pickAt2.stellar ? pickAt2.stellar.id : null;
  setCursor(cursorFor(pickAt2));
});
document.addEventListener('visibilitychange', () => {
  if (document.hidden) clearManualFlightInput();
});
canvas.addEventListener('pointercancel', () => {
  mouse.down = false;
  clientGameState._look = null;
  clientGameState._lookT = null;
});
canvas.addEventListener('mouseleave', () => {
  clientGameState._look = null;
  clientGameState._lookT = null;
  mouse.in = false;
  mouse.down = false;
  clientGameState.hover = 0;
  clientGameState.hoverStellar = null;
});
flightEngine.engine.input.pointers.on('down', (event) => {
  const mouseEvent = event.nativeEvent as MouseEvent;
  if (!clientGameState.you || clientGameState.landed || overlays.blocksFlight()) return;
  audio.unlock();
  if (document.activeElement && document.activeElement.tagName === 'INPUT')
    (document.activeElement as HTMLElement).blur();
  const [worldX, worldY] = toWorld(mouseEvent.clientX, mouseEvent.clientY),
    pickAt2 = pickAt(worldX, worldY);
  if (mouseEvent.button === 2) {
    clientGameState._look = {
      t: performance.now(),
      x: mouseEvent.clientX,
      y: mouseEvent.clientY,
      moved: false,
    };
    return;
  } // hold right-click and move to look ahead (a quick click still clears your target)
  if (mouseEvent.button !== 0) return;
  if (pickAt2 && pickAt2.ship) {
    setTarget(pickAt2.ship.id);
    return;
  }
  if (pickAt2 && pickAt2.stellar) {
    clientGameState.navStellar = pickAt2.stellar.id;
    clientGameState.navPicked = true;
    toast(
      `Nav: ${pickAt2.stellar.name}${pickAt2.stellar.svc!.includes('L') ? ' (L or double-click to land)' : ''}`,
    );
    return;
  }
  const rock = (clientGameState.rocks || []).find(
    (entryKey) =>
      entryKey.hp && Math.hypot(entryKey.x - worldX, entryKey.y - worldY) <= entryKey.r + 8,
  );
  if (rock) clientGameState.miningTarget = rock.id;
  const towObject = (clientGameState.towing || clientGameState.you?.towing)?.objects.find(
    (options) =>
      !['delivered', 'destroyed'].includes(options!.status) &&
      Math.hypot(options!.x - worldX, options!.y - worldY) < 52,
  );
  if (towObject) {
    clientGameState.towTarget = towObject.id;
    return;
  }
  // Only genuinely empty space clears combat selection; resource clicks retain it.
  if (!rock) setTarget(0);
  if (clientGameState.opts.mouseAim) mouse.down = flightEngine.input.pointerHeld; // mouse-aim mode: hold the left button on open space to fire
});
// A release cannot wait behind queued pointer processing or evidence-heavy frames.
window.addEventListener('pointerup', () => {
  mouse.down = false;
});
flightEngine.engine.input.pointers.on('up', (event) => {
  const mouseEvent = event.nativeEvent as MouseEvent;
  mouse.down = false;
  if (!overlays.blocksFlight() && mouseEvent.button === 2 && clientGameState._look) {
    if (!clientGameState._look.moved && performance.now() - clientGameState._look.t < 300)
      setTarget(0);
    clientGameState._look = null;
    clientGameState._lookT = null;
  } // the view eases back to your ship
});
canvas.addEventListener('dblclick', (mouseEvent) => {
  if (!clientGameState.you || clientGameState.landed || overlays.blocksFlight()) return;
  const [worldX, worldY] = toWorld(mouseEvent.clientX, mouseEvent.clientY),
    pickAt2 = pickAt(worldX, worldY);
  if (pickAt2?.stellar?.wormhole) {
    clientGameState.navStellar = pickAt2.stellar.id;
    setAuto(
      { mode: 'gateway', id: pickAt2.stellar.id, sys: clientGameState.sys },
      `Autopilot: through ${pickAt2.stellar.name}. Steer to take over.`,
    );
  } else if (pickAt2 && pickAt2.stellar && pickAt2.stellar.svc!.includes('L'))
    landRequest(pickAt2.stellar);
});
canvas.addEventListener('contextmenu', (pointerEvent) => pointerEvent.preventDefault());
canvas.addEventListener(
  'wheel',
  (wheelEvent) => {
    if (!clientGameState.view || overlays.blocksFlight()) return;
    wheelEvent.preventDefault();
    clientGameState.zoom =
      wheelEvent.deltaY < 0
        ? Math.min(2, clientGameState.zoom * 1.1)
        : Math.max(0.35, clientGameState.zoom / 1.1);
  },
  { passive: false },
);
// radar: click a blip to target it
elementById2('radar').addEventListener('mousedown', (mouseEvent) => {
  const clientView = clientGameState.view;
  if (!clientView || overlays.blocksFlight()) return;
  const htmlCanvasElement = elementById2('radar'),
    domRect = htmlCanvasElement.getBoundingClientRect(),
    radius = htmlCanvasElement.width / domRect.width,
    mouseX = (mouseEvent.clientX - domRect.left) * radius,
    mouseY = (mouseEvent.clientY - domRect.top) * radius;
  const width2 = htmlCanvasElement.width,
    height2 = htmlCanvasElement.height,
    entryKey = (Math.min(width2, height2) / 2 / (clientGameState.radarR || 4200)) * 1.15;
  let best = null,
    body = 10 * radius;
  for (const renderEntity of clientGameState.ents.values()) {
    if (renderEntity.id === clientGameState.myId) continue;
    const distance = Math.hypot(
      width2 / 2 + (renderEntity.rx - clientView.rx) * entryKey - mouseX,
      height2 / 2 + (renderEntity.ry - clientView.ry) * entryKey - mouseY,
    );
    if (distance < body) {
      body = distance;
      best = renderEntity;
    }
  }
  if (best) setTarget(best.id);
  else if (mouseEvent.button === 2) setTarget(0);
});
elementById2('radar').addEventListener('contextmenu', (pointerEvent) =>
  pointerEvent.preventDefault(),
);

// ------------------------------------------------------------------ boarding (B next to a disabled ship)
/**
 * Opens the ship boarding interface modal if alongside a disabled ship.
 */
function openBoard(): void {
  const renderEntity = clientGameState.target
      ? clientGameState.ents.get(clientGameState.target)
      : null,
    clientView = clientGameState.view;
  if (!renderEntity || !(renderEntity.fl & 4)) return toast('Target a disabled ship to board it.');
  const shipHullAsset = clientGameState.A!.ships[renderEntity.hull],
    distance = Math.hypot(renderEntity.rx - clientView!.rx, renderEntity.ry - clientView!.ry);
  if (
    distance >
    Math.max(
      120,
      (shipHullAsset.size +
        clientGameState.A!.ships[clientGameState.myHull || clientGameState.you!.ship.hull].size) *
        0.5,
    )
  )
    return toast('Move alongside to board.');
  elementById2('boardin').innerHTML = boardHtml(clientGameState, renderEntity);
  clientGameState.boarding = renderEntity.id;
  overlays.open('boardbox');
}
/**
 * Closes the ship boarding action modal.
 */
function closeBoard(): void {
  clientGameState.boarding = 0;
  overlays.close('boardbox');
}
/**
 * Sends a boarding action command (plunder, capture, rescue) to the server.
 * @param action Boarding action type ('plunder' | 'capture' | 'rescue')
 */
function doBoard(action: string): void {
  if (action && clientGameState.boarding)
    send({ t: 'board', id: clientGameState.boarding, act: action });
  closeBoard();
}
elementById2('boardin').addEventListener('click', (pointerEvent) => {
  const htmlButtonElement = (pointerEvent.target as HTMLInputElement).closest<HTMLButtonElement>(
    '[data-board]',
  );
  if (htmlButtonElement && !htmlButtonElement.disabled) doBoard(htmlButtonElement.dataset.board!);
});
overlays.register({
  id: 'boardbox',
  priority: 10,
  dismiss: closeBoard,
  initialFocus: () => elementById2('boardin').querySelector<HTMLElement>('[data-board=""]'),
  keyDown: (event) => {
    const action = { Digit1: 'plunder', Digit2: 'capture', Digit3: 'rescue' }[event.code];
    if (!action) return false;
    const button = elementById2('boardin').querySelector<HTMLButtonElement>(
      `[data-board="${action}"]`,
    );
    if (!event.repeat && button && !button.disabled) doBoard(action);
    return true;
  },
});

// ------------------------------------------------------------------ tutorial panel
/**
 * Updates the career tutorial guide widget with current stage info.
 */
function renderTut(): void {
  const index = clientGameState.you ? clientGameState.you!.tut : TUTORIAL.length,
    tutorialStep = TUTORIAL[index];
  elementById2('tut').classList.toggle(
    'hidden',
    !tutorialStep ||
      onboarding.active() ||
      !!clientGameState.arena ||
      !!(clientGameState.you && clientGameState.you!.duel && clientGameState.you!.duel.on),
  ); // out of the way in the Crucible and in duels
  if (!tutorialStep) return;
  elementById2('tutn').textContent = `CAREER ${index + 1} / ${TUTORIAL.length}`;
  elementById2('tutt').textContent = tutorialStep.title;
  elementById2('tutx').textContent = tutorialStep.text;
  elementById2('tutr').textContent =
    `Reward: ${tutorialStep.reward.toLocaleString()} cr${tutorialStep.mat ? ` + ${tutorialStep.mat[0]} crate` : ''}`;
}
elementById2('tutn').parentElement!.style.cursor = 'pointer';
elementById2('tutn').title = 'Click to collapse or expand';
elementById2('tutn').onclick = () => {
  clientGameState.opts.tutMin = !clientGameState.opts.tutMin;
  saveOpts();
  elementById2('tut').classList.toggle('mini', !!clientGameState.opts.tutMin);
}; // the career panel folds away
elementById2('tut').classList.toggle('mini', !!clientGameState.opts.tutMin);
elementById2('tutskip').onclick = () => {
  showConfirmation('Hide the career guide? You will not get the remaining rewards.', () =>
    send({ t: 'tutskip' }),
  );
};

// ------------------------------------------------------------------ options
const CHECKS = [
  'dmg',
  'shake',
  'reducedEffects',
  'mouseAim',
  'assistMissiles',
  'jumpLeft',
  'notify',
  'cb',
  'mute',
];
let rebinding: string | null = null;
/**
 * Formats a KeyboardEvent.code string into a readable label.
 * @param component KeyboardEvent code
 * @returns Human-friendly key name
 */
const keyName = (component: string | null): string =>
  !component
    ? 'assign key'
    : {
        Backquote: '`',
        Quote: "'",
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
      }[component] ||
      component
        .replace(/^Key/, '')
        .replace(/^Digit/, '')
        .replace(/^Numpad/, 'Num ');
/** Update cockpit hints from the saved key bindings. */
function refreshInfoShortcuts(): void {
  for (const [identifier, label, action] of [
    ['shipshortcut', 'Ship details', 'info'],
    ['captainshortcut', 'Captain details', 'captain'],
  ])
    elementById2(identifier).title =
      `${label}${bound(action) ? ` (${keyName(bound(action))})` : ''}`;
}
refreshInfoShortcuts();
/** Render keybinding assignment rows in Settings. */
function renderKeys(): void {
  refreshInfoShortcuts();
  const focusedBinding = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>(
    '[data-bind]',
  )?.dataset.bind;
  elementById2('optkeys').innerHTML = ACTIONS.map(
    ([firstValue, count]) =>
      `<div class="kb"><span>${count}</span><button class="btn sm${rebinding === firstValue ? ' on' : ''}" data-bind="${firstValue}">${rebinding === firstValue ? 'press a key…' : keyName(bound(firstValue))}</button></div>`,
  ).join('');
  elementById2('optkeys')
    .querySelectorAll<HTMLElement>('[data-bind]')
    .forEach(
      (htmlElement) =>
        (htmlElement.onclick = () => {
          rebinding = htmlElement.dataset.bind!;
          renderKeys();
        }),
    );
  if (focusedBinding)
    elementById2('optkeys')
      .querySelector<HTMLElement>(`[data-bind="${focusedBinding}"]`)
      ?.focus({ preventScroll: true });
}
/**
 * Opens the settings modal dialog and populates current configuration values.
 * @param keysFirst Whether to scroll directly down to the keybinding section
 */
function openOpts(keysFirst?: boolean | PointerEvent): void {
  audio.ui('open', 0.6);
  for (const cHECKS of CHECKS)
    (elementById2('opt-' + cHECKS) as HTMLInputElement).checked = !!clientGameState.opts[cHECKS];
  elementById2('opt-scale').value = clientGameState.opts.scale;
  elementById2('opt-vol').value = clientGameState.opts.vol;
  elementById2('opt-sfx').value = clientGameState.opts.sfx;
  elementById2('opt-radio').value = clientGameState.opts.radio;
  elementById2('opt-ui').value = clientGameState.opts.ui ?? 0.8;
  elementById2('opt-amb').value = clientGameState.opts.amb ?? 0.5;
  elementById2('opt-music').value = clientGameState.opts.music ?? 0.6;
  rebinding = null;
  renderKeys();
  refreshDiagnosticControls();
  document.querySelectorAll<HTMLInputElement>('#opts input[type=range]').forEach(paintRange);
  overlays.open('opts');
  if (keysFirst === true)
    setTimeout(() => elementById2('optkeys').scrollIntoView({ block: 'start' }), 0);
}
/**
 * Closes the settings modal dialog.
 */
function closeOpts(): void {
  audio.ui('close', 0.6);
  rebinding = null;
  overlays.close('opts');
}
elementById2('optclose').onclick = closeOpts;
initDiagnosticControls();
elementById2('optbtn').onclick = openOpts;
// the quick volume control in the command bar: one master slider and a mute button
/**
 * Updates an HTML range input's background fill gradient according to its value.
 * @param htmlInputElement Input slider element
 */
function paintRange(htmlInputElement: HTMLInputElement): void {
  if (!htmlInputElement) return;
  const position =
    ((+htmlInputElement.value - +htmlInputElement.min) /
      (+htmlInputElement.max - +htmlInputElement.min || 1)) *
    100;
  htmlInputElement.style.background = `linear-gradient(90deg,var(--range-fill, #e0362a) ${position}%,var(--range-track, #3a0808) ${position}%)`;
} // red fill
document.addEventListener('input', (event) => {
  if (
    (event.target as HTMLInputElement).matches &&
    (event.target as HTMLInputElement).matches('input[type=range]')
  )
    paintRange(event.target as HTMLInputElement);
});
/**
 * Syncs the volume quick-slider and mute button with current volume settings.
 */
function volUi(): void {
  const htmlButtonElement = elementById2('cbvol');
  if (!htmlButtonElement) return;
  htmlButtonElement.textContent =
    clientGameState.opts.mute || clientGameState.opts.vol <= 0.001
      ? '🔇'
      : clientGameState.opts.vol < 0.3
        ? '🔈'
        : clientGameState.opts.vol < 0.65
          ? '🔉'
          : '🔊';
  const label = document.createElement('span');
  label.className = 'utility-label';
  label.textContent = clientGameState.opts.mute ? 'UNMUTE' : 'VOLUME';
  htmlButtonElement.append(label);
  elementById2('qvol').value = Math.round(clientGameState.opts.vol * 100);
  paintRange(elementById2('qvol'));
  elementById2('qvoln').textContent = clientGameState.opts.mute
    ? 'muted'
    : Math.round(clientGameState.opts.vol * 100) + '%';
  elementById2('qmute').textContent = clientGameState.opts.mute ? 'UNMUTE' : 'MUTE';
}
elementById2('cbvol').onclick = (pointerEvent) => {
  pointerEvent.stopPropagation();
  elementById2('qvolbox').classList.toggle('hidden');
  volUi();
};
elementById2('qvol').oninput = (event) => {
  clientGameState.opts.vol = +(event.target as HTMLInputElement).value / 100;
  if (clientGameState.opts.mute && clientGameState.opts.vol > 0) clientGameState.opts.mute = false;
  applyOpts();
  saveOpts();
  volUi();
};
elementById2('qmute').onclick = () => {
  clientGameState.opts.mute = !clientGameState.opts.mute;
  applyOpts();
  saveOpts();
  volUi();
};
elementById2('qmore').onclick = () => {
  elementById2('qvolbox').classList.add('hidden');
  openOpts();
};
document.addEventListener('click', (pointerEvent) => {
  if (
    !(pointerEvent.target as HTMLInputElement).closest<HTMLElement>('#qvolbox') &&
    (pointerEvent.target as HTMLInputElement).id !== 'cbvol'
  )
    elementById2('qvolbox').classList.add('hidden');
});
volUi();
for (const cHECKS of CHECKS)
  elementById2('opt-' + cHECKS).onchange = (event) => {
    clientGameState.opts[cHECKS] = (event.target as HTMLInputElement).checked;
    if (
      cHECKS === 'notify' &&
      (event.target as HTMLInputElement).checked &&
      window.Notification &&
      Notification.permission === 'default'
    )
      void Notification.requestPermission();
    if (cHECKS === 'assistMissiles')
      send({ t: 'combat', op: 'missiles', on: clientGameState.opts.assistMissiles !== false });
    applyOpts();
    saveOpts();
  };
for (const entryKey of ['scale', 'vol', 'sfx', 'radio', 'ui', 'amb', 'music'])
  elementById2('opt-' + entryKey).oninput = (event) => {
    clientGameState.opts[entryKey] = +(event.target as HTMLInputElement).value;
    applyOpts();
    saveOpts();
    audio.unlock();
    if (entryKey === 'vol' || entryKey === 'sfx') audio.play('10100', 0, 0, 1);
    if (entryKey === 'ui') audio.ui('click');
  };
window.addEventListener('rift-radio-vol', (event) => {
  clientGameState.opts.radio = (event as CustomEvent).detail;
  applyOpts();
  saveOpts();
});
elementById2('optreset').onclick = () => {
  clientGameState.opts.keys = {};
  migrateBindings(clientGameState.opts, ACTIONS);
  saveOpts();
  renderKeys();
};
overlays.register({
  id: 'opts',
  priority: 26,
  dismiss: closeOpts,
  initialFocus: () => elementById2('optclose'),
  reset: () => {
    rebinding = null;
  },
  keyDown: (event) => {
    if (rebinding) {
      // Escape cancels capture, not the dialog. A duplicate binding swaps actions.
      if (event.repeat) return true;
      if (RESERVED_KEYS.has(event.code) && event.code !== 'Escape') {
        toast('This key is reserved for steering or a fixed interface control.');
        rebinding = null;
        renderKeys();
        return true;
      }
      if (event.code === 'Backspace' || event.code === 'Delete') {
        clientGameState.opts.keys[rebinding] = null;
        saveOpts();
      } else if (event.code !== 'Escape') {
        for (const [action] of ACTIONS)
          if (action !== rebinding && bound(action) === event.code)
            clientGameState.opts.keys[action] = bound(rebinding);
        clientGameState.opts.keys[rebinding] = event.code;
        saveOpts();
      }
      rebinding = null;
      renderKeys();
      return true;
    }
    return false;
  },
});
overlays.register({
  id: 'storebox',
  priority: 15,
  dismiss: () => overlays.close('storebox'),
  initialFocus: () => elementById2('storein').querySelector<HTMLElement>('[data-act="sclose"]'),
});
overlays.register({
  id: 'deadbox',
  priority: 10,
  dismiss: () => overlays.close('deadbox'),
  initialFocus: () => elementById2('deadok'),
});
overlays.register({
  id: 'gmap',
  priority: 10,
  dismiss: closeMap,
  initialFocus: () => elementById2('gmap'),
  allowOutsidePointer: (target) => !!target.closest('#cbmap,#cbhelp,#optbtn'),
  keyDown: (event) => {
    if ((event.target as HTMLElement).id === 'gsearch') {
      if (event.key === 'Enter') {
        elementById2('gresults').querySelector<HTMLElement>('[data-sys]')?.click();
        return true;
      }
      if (event.key === 'Escape') {
        elementById2('gsearch').blur();
        elementById2('gmap').focus();
        return true;
      }
    }
    const action = actionOf(event.code);
    if ((action !== 'map' && action !== 'jump') || typing()) return false;
    if (event.repeat) return true;
    closeMap();
    // Clicking a system already plots the course, so the jump key leaves the map and goes.
    if (action === 'jump' && clientGameState.view && !clientGameState.landed) jumpNext();
    return true;
  },
});

// Read-only diagnostic access is useful for support and browser regression assertions.
Object.defineProperty(window, 'RiftEngine', { value: flightEngine });

// ------------------------------------------------------------------ loops
/**
 * Synchronizes canvas and radar internal pixel resolutions with device pixel ratio.
 */
function resize(): void {
  const radius = window.devicePixelRatio || 1;
  flightEngine.resize();
  const htmlCanvasElement = elementById2('radar');
  htmlCanvasElement.width = Math.round(htmlCanvasElement.clientWidth * radius);
  htmlCanvasElement.height = Math.round(htmlCanvasElement.clientHeight * radius);
}
window.addEventListener('resize', resize);
// Sidebar reflow (including UI scale and persisted widths) also changes the radar.
new ResizeObserver(resize).observe(elementById2('radar'));
initSidebarSize();
// the sidebar can be dragged wider or narrower; the width is remembered
/**
 * Updates the companion sidebar HUD width CSS variable within bounds.
 * @param width2 Requested width in CSS pixels
 * @returns Clamped width in CSS pixels
 */
function setHud(width: number): number {
  // CSS temporarily caps the displayed width to the viewport without destroying
  // a restored preference. Pointer drags below apply that cap before saving.
  width = Math.max(280, Math.min(760, width));
  document.documentElement.style.setProperty('--tray-width', width + 'px');
  resize();
  return width;
}
try {
  const width = +localStorage.getItem('rift.hud')!;
  if (width) setHud(width);
} catch {}
elementById2('hudgrip').addEventListener('pointerdown', (pointerEvent) => {
  pointerEvent.preventDefault();
  const cachedElement = elementById2('hudgrip');
  const initialPointerX = pointerEvent.clientX;
  const initialWidth = elementById2('hud').getBoundingClientRect().width;
  cachedElement.classList.add('drag');
  const move = (pointerEvent: PointerEvent) => {
    const setHud2 = setHud(
      Math.min(window.innerWidth * 0.6, initialWidth + initialPointerX - pointerEvent.clientX),
    );
    try {
      localStorage.setItem('rift.hud', String(setHud2));
    } catch {}
  };
  const upward = () => {
    cachedElement.classList.remove('drag');
    window.removeEventListener('pointermove', move);
    window.removeEventListener('pointerup', upward);
    window.removeEventListener('pointercancel', upward);
    refreshCompanion();
  };
  window.addEventListener('pointermove', move);
  window.addEventListener('pointerup', upward);
  window.addEventListener('pointercancel', upward);
});
elementById2('traytoggle').onclick = () => {
  const open = document.body.classList.toggle('tray-open');
  elementById2('traytoggle').setAttribute('aria-expanded', String(open));
  elementById2('traytoggle').title = (open ? 'Close' : 'Open') + ' ship console tray';
  elementById2('hud').inert = !open;
  resize();
};
elementById2('hud').inert = true;
resize();
// ------------------------------------------------------------------ gamepad and touch controls
const padding: { prev: boolean[]; blocked: boolean } = { prev: [], blocked: false },
  touch: { keys: Record<string, boolean>; stick: { dx: number; dy: number } | null } = {
    keys: {},
    stick: null,
  };
/**
 * Reads standard Gamepad API state and maps buttons/axes to ship inputs and commands.
 * @param clientInput Mutable input state object
 */
function padInput(clientInput: ClientInput): void {
  const gamepad = navigator.getGamepads ? [...navigator.getGamepads()].find(Boolean) : null;
  if (!gamepad) {
    padding.blocked = false;
    return;
  }
  if (gamepad.buttons[9]?.pressed && !padding.prev[9] && !typing() && overlays.isTop('gmap')) {
    closeMap();
    padding.prev = gamepad.buttons.map((button) => button.pressed);
    padding.blocked = true;
    return;
  }
  const blocked = !!typing() || overlays.blocksFlight() || document.hidden;
  if (blocked || padding.blocked) {
    padding.prev = gamepad.buttons.map((button) => button.pressed);
    padding.blocked =
      blocked ||
      gamepad.buttons.some((button) => button.pressed) ||
      gamepad.axes.some((axis) => Math.abs(axis) > 0.2);
    return;
  }
  const secondValue = (index: number) => gamepad.buttons[index] && gamepad.buttons[index].pressed,
    edge = (index: number) => secondValue(index) && !padding.prev[index],
    axisX = gamepad.axes[0] || 0,
    axisY = gamepad.axes[1] || 0;
  if (Math.abs(axisX) > 0.35) clientInput.turn = Math.sign(axisX);
  if (axisY < -0.35 || secondValue(7)) clientInput.thrust = 1;
  if (secondValue(13) || axisY > 0.6) clientInput.rev = 1;
  if (secondValue(0)) clientInput.fire1 = 1;
  if (secondValue(1)) clientInput.fire2 = 1;
  if (secondValue(6)) clientInput.ab = 1;
  if (edge(2)) nearestHostile();
  if (edge(3)) landRequest();
  if (edge(4)) cycleTarget(-1);
  if (edge(5)) cycleTarget(1);
  if (edge(9)) elementById2('gmap').classList.contains('hidden') ? openMap() : closeMap();
  if (edge(8)) openBoard();
  if (edge(12)) jumpNext();
  padding.prev = gamepad.buttons.map((gamepadButton) => gamepadButton.pressed);
}
/**
 * Polls on-screen virtual joystick and touch action buttons for input state.
 * @param clientInput Mutable input state object
 */
function touchInput(clientInput: ClientInput): void {
  if (typing() || overlays.blocksFlight()) return;
  for (const entryKey of ['fire1', 'fire2', 'ab'] as const)
    if (touch.keys[entryKey]) clientInput[entryKey] = 1;
  const stick2 = touch.stick;
  if (!stick2 || !clientGameState.view) return;
  const magnitude = Math.hypot(stick2.dx, stick2.dy);
  if (magnitude < 0.2) return;
  const want = Math.atan2(stick2.dx, -stick2.dy);
  let distance = want - clientGameState.view.a;
  distance = Math.atan2(Math.sin(distance), Math.cos(distance));
  const computedShipStats = clientGameState.you && clientGameState.you!.shipStats;
  if (Math.abs(distance) > (computedShipStats ? computedShipStats.turn * tickDuration : 0.05))
    clientInput.turn = Math.sign(distance);
  if (magnitude > 0.6 && Math.abs(distance) < 0.8) clientInput.thrust = 1;
}
const touchPointers = new Map<number, HTMLElement>();
let touchStickPointer: number | null = null;

/** Release touch holds across physical cancellation, modal changes and hidden pages. */
function releaseTouchControls(): void {
  touchPointers.clear();
  touchStickPointer = null;
  touch.keys = {};
  touch.stick = null;
  for (const button of elementById2('tbtns').querySelectorAll('.on')) button.classList.remove('on');
  const knob = elementById2('tstick').querySelector<HTMLElement>('i');
  if (knob) knob.style.transform = '';
}
if (
  'ontouchstart' in window ||
  ((window.matchMedia as typeof matchMedia | undefined) && matchMedia('(pointer: coarse)').matches)
) {
  elementById2('touch').classList.remove('hidden');
  const stick = elementById2('tstick');
  const knob = stick.querySelector<HTMLElement>('i')!;
  const move = (event: PointerEvent) => {
    const bounds = stick.getBoundingClientRect();
    let dx = (event.clientX - bounds.left - bounds.width / 2) / (bounds.width / 2);
    let dy = (event.clientY - bounds.top - bounds.height / 2) / (bounds.height / 2);
    const magnitude = Math.hypot(dx, dy);
    if (magnitude > 1) {
      dx /= magnitude;
      dy /= magnitude;
    }
    touch.stick = { dx, dy };
    knob.style.transform = `translate(${dx * 50}px,${dy * 50}px)`;
  };
  stick.addEventListener('pointerdown', (event) => {
    if (
      event.button !== 0 ||
      typing() ||
      clientGameState.landed ||
      overlays.blocksFlight() ||
      touchStickPointer !== null
    )
      return;
    event.preventDefault();
    event.stopPropagation();
    audio.unlock();
    touchStickPointer = event.pointerId;
    stick.setPointerCapture(event.pointerId);
    move(event);
  });
  stick.addEventListener('pointermove', (event) => {
    if (touchStickPointer === event.pointerId && !overlays.blocksFlight()) move(event);
  });
  const releaseStick = (event: PointerEvent) => {
    if (touchStickPointer !== event.pointerId) return;
    touchStickPointer = null;
    touch.stick = null;
    knob.style.transform = '';
  };
  for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
    stick.addEventListener(name, releaseStick);
  for (const button of elementById2('tbtns').querySelectorAll<HTMLElement>('button')) {
    button.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 || typing() || clientGameState.landed || overlays.blocksFlight())
        return;
      if (!button.dataset.k) return;
      event.preventDefault();
      event.stopPropagation();
      audio.unlock();
      button.setPointerCapture(event.pointerId);
      touchPointers.set(event.pointerId, button);
      button.classList.add('on');
      if (button.dataset.k) touch.keys[button.dataset.k] = true;
    });
    // Open dialogs after release so a tap cannot click through into the new dialog.
    button.addEventListener('click', (event) => {
      if (!button.dataset.tap || typing() || clientGameState.landed || overlays.blocksFlight())
        return;
      event.preventDefault();
      event.stopPropagation();
      audio.unlock();
      const action = button.dataset.tap;
      if (action === 'target') nearestHostile();
      else if (action === 'land') landRequest();
      else if (action === 'map') openMap();
      else if (action === 'board') openBoard();
      else if (action === 'jump') jumpNext();
    });
    const release = (event: PointerEvent) => {
      touchPointers.delete(event.pointerId);
      const held = [...touchPointers.values()].includes(button);
      button.classList.toggle('on', held);
      if (button.dataset.k) touch.keys[button.dataset.k] = held;
    };
    for (const name of ['pointerup', 'pointercancel', 'lostpointercapture'] as const)
      button.addEventListener(name, release);
  }
  window.addEventListener('blur', releaseTouchControls);
}
function clearManualFlightInput(): void {
  flightEngine.input.clear();
  mouse.down = false;
  clientGameState._look = null;
  clientGameState._lookT = null;
  releaseTouchControls();
  padding.blocked = true;
  if (clientGameState.view && !clientGameState.landed)
    send({ t: 'input', seq: prediction.nextSequence(), th: 0, tu: 0, ab: 0, rv: 0, f1: 0, f2: 0 });
}
let account = 0,
  last = performance.now();
/**
 * Fixed physics and input update tick executed at fixed timestep (DT).
 */
function fixedTick(): void {
  if (
    !clientGameState.view ||
    flightEngine.recovering ||
    clientGameState.landed ||
    clientGameState.paused ||
    clientGameState.quitting
  )
    return;
  if (overlays.blocksFlight()) {
    flightEngine.input.clear();
    mouse.down = false;
    releaseTouchControls();
    padding.blocked = true;
  }
  // Preserve automatic-control intent even if guidance completes or refuses this tick.
  const towing = clientGameState.towing || clientGameState.you?.towing;
  if (towing?.attached) clientGameState.auto = null;
  clientGameState.view.towCap = towing?.attached ? towing.cap : undefined;
  const navigationRequested = !!clientGameState.auto;
  const input = {
    thrust: held('thrust') ? 1 : 0,
    turn: (held('right') ? 1 : 0) - (held('left') ? 1 : 0),
    rev: held('rev') ? 1 : 0,
    ab: held('ab') ? 1 : 0,
    fire1: held('fire1') ? 1 : 0,
    fire2:
      held('fire2') || (!typing() && !overlays.blocksFlight() && shipFunctions.secondary()) ? 1 : 0,
  };
  if (
    !typing() &&
    !overlays.blocksFlight() &&
    clientGameState.opts.mouseAim &&
    mouse.in &&
    (mouse.down ||
      (!(
        clientGameState.combat &&
        (clientGameState.combat.on || clientGameState.combat.delegated)
      ) &&
        !clientGameState.you?.armada?.follow))
  ) {
    // mouse-aim: the ship turns toward the cursor unless you steer with the keys
    if (!input.turn) {
      const want = Math.atan2(
        mouse.wx - clientGameState.view.x,
        -(mouse.wy - clientGameState.view.y),
      );
      let distance = want - clientGameState.view.a;
      distance = Math.atan2(Math.sin(distance), Math.cos(distance));
      const computedShipStats = clientGameState.you && clientGameState.you!.shipStats;
      if (Math.abs(distance) > (computedShipStats ? computedShipStats.turn * tickDuration : 0.05))
        input.turn = Math.sign(distance);
    }
    if (mouse.down) input.fire1 = 1;
  }
  const manual = held('thrust') || held('left') || held('right') || held('rev'),
    before = input.thrust + '|' + input.turn;
  padInput(input);
  touchInput(input);
  // Human controls revoke Follow even while the leader is absent or Assist owns flight.
  // Navigation-generated controls below do not revoke leader-jump consent.
  if (
    !typing() &&
    clientGameState.you?.armada?.follow &&
    (input.thrust ||
      input.turn ||
      input.rev ||
      input.ab ||
      input.fire1 ||
      input.fire2 ||
      held('face'))
  ) {
    send({ t: 'armada', op: 'follow', on: false });
    clientGameState.you!.armada.follow = false;
    clientGameState.formation = false;
    const checkbox = elementById2('afollow');
    if (checkbox) checkbox.checked = false;
  }
  if (clientGameState.combat && (clientGameState.combat.on || clientGameState.combat.delegated)) {
    clientGameState.autoRoute = false;
    if (clientGameState.auto) setAuto(null);
  }
  if (clientGameState.auto) {
    if (manual || before !== input.thrust + '|' + input.turn) {
      clientGameState.autoRoute = false;
      setAuto(null);
      toast('Autopilot off.');
    } else autopilot(input);
  }
  if (
    held('face') &&
    !clientGameState.auto &&
    clientGameState.target &&
    clientGameState.ents.get(clientGameState.target)
  ) {
    // hold E to turn toward your target (leading it)
    const renderEntity = clientGameState.ents.get(clientGameState.target),
      computedShipStats = clientGameState.you!.shipStats,
      lead = Math.min(
        1,
        Math.hypot(
          renderEntity!.rx - clientGameState.view.x,
          renderEntity!.ry - clientGameState.view.y,
        ) / 600,
      );
    const wrap2 = wrap(
      Math.atan2(
        renderEntity!.rx + (renderEntity!.vx || 0) * lead - clientGameState.view.x,
        -(renderEntity!.ry + (renderEntity!.vy || 0) * lead - clientGameState.view.y),
      ) - clientGameState.view.a,
    );
    input.turn = Math.abs(wrap2) < computedShipStats!.turn * tickDuration ? 0 : Math.sign(wrap2);
  }
  if (typing() || overlays.blocksFlight()) {
    input.fire1 = input.fire2 = 0;
    if (!clientGameState.auto) input.thrust = input.turn = input.rev = input.ab = 0;
  } // the autopilot keeps flying while you chat
  audio.engine(input.thrust ? (input.ab ? 1.6 : 1) : input.rev ? 0.3 : 0); // the engine hum follows your throttle
  const sequence = prediction.nextSequence();
  send({
    t: 'input',
    seq: sequence,
    th: input.thrust,
    tu: input.turn,
    ab: input.ab,
    rv: input.rev,
    f1: input.fire1,
    f2: input.fire2,
    nav: navigationRequested || !!clientGameState.auto,
  });
  const renderEntity2 = clientGameState.ents.get(clientGameState.myId);
  prediction.record(
    sequence,
    input,
    clientGameState.view,
    clientGameState.you?.shipStats,
    !!clientGameState.you &&
      !(renderEntity2 && renderEntity2.fl & 8) &&
      !(
        clientGameState.combat &&
        (clientGameState.combat.on || clientGameState.combat.delegated)
      ) &&
      !(clientGameState.formation && !clientGameState.auto),
  );
}
/**
 * Presentation and prediction update driven exclusively by the Excalibur scene.
 * @param time High-resolution engine update timestamp
 */
function frame(time: number): void {
  const deltaTime = Math.min(0.1, (time - last) / 1000);
  last = time;
  {
    const targetLook =
        clientGameState._look && clientGameState._lookT && !clientGameState.landed
          ? clientGameState._lookT
          : [0, 0],
      entryKey = Math.min(1, deltaTime * (clientGameState._look ? 7 : 5));
    clientGameState.lookX =
      (clientGameState.lookX || 0) + (targetLook[0] - (clientGameState.lookX || 0)) * entryKey;
    clientGameState.lookY =
      (clientGameState.lookY || 0) + (targetLook[1] - (clientGameState.lookY || 0)) * entryKey;
  } // 2.1 look-ahead
  account = advanceFlightClock(account, deltaTime, tickDuration, () => {
    fixedTick();
    flightEngine.input.consumeTick();
  });
  const clientView = clientGameState.view;
  if (clientView) {
    // smooth out prediction corrections
    clientView.ox *= Math.pow(0.0005, deltaTime);
    clientView.oy *= Math.pow(0.0005, deltaTime);
    clientView.rx = clientView.x + clientView.ox + clientView.vx * account;
    clientView.ry = clientView.y + clientView.oy + clientView.vy * account;
  }
  const currentTime = performance.now();
  for (const renderEntity of clientGameState.ents.values()) {
    if (clientGameState.paused) continue;
    if (clientView && renderEntity.id === clientGameState.myId) {
      renderEntity.rx = clientView.rx;
      renderEntity.ry = clientView.ry;
      renderEntity.a = clientView.a;
      renderEntity.fl = (renderEntity.fl & ~3) | clientView.fl;
      continue;
    }
    const entryKey = Math.min(0.25, (currentTime - renderEntity.t!) / 1000),
      targetX = renderEntity.x + renderEntity.vx * entryKey,
      targetY = renderEntity.y + renderEntity.vy * entryKey;
    const state = Math.min(1, deltaTime * 14);
    renderEntity.rx += (targetX - renderEntity.rx) * state;
    renderEntity.ry += (targetY - renderEntity.ry) * state;
  }
  for (const shot of clientGameState.shots) {
    if (clientGameState.paused) continue;
    const entryKey = (currentTime - shot.t) / 1000;
    shot.rx = shot.x + shot.vx * entryKey;
    shot.ry = shot.y + shot.vy * entryKey;
  }
  radar(clientGameState, canvasRenderingContext2D2);
  renderHud();
}
void flightEngine.start().catch((error) => {
  console.error('Flight engine failed to start', error);
  toast('Graphics could not start. Reload to retry.');
});
setInterval(() => {
  if ((clientGameState.ctab === 'station' || clientGameState.ctab === 'ops') && clientGameState.you)
    refreshCompanion();
}, 15000);

elementById2('combatassist').onclick = () => {
  clientGameState.autoRoute = false;
  setAuto(null);
  send({ t: 'combat', op: 'missiles', on: clientGameState.opts.assistMissiles !== false });
  send({ t: 'combat', op: 'assist', on: !(clientGameState.combat && clientGameState.combat.on) });
};
elementById2('combatstop').onclick = () => send({ t: 'combat', op: 'off' });
elementById2('combatdelegate').onchange = (event) => {
  send({ t: 'combat', op: 'missiles', on: clientGameState.opts.assistMissiles !== false });
  send({ t: 'combat', op: 'delegate', on: (event.target as HTMLInputElement).checked });
};
elementById2('combatcoordinate').onchange = (event) => {
  send({ t: 'combat', op: 'missiles', on: clientGameState.opts.assistMissiles !== false });
  send({ t: 'combat', op: 'coordinate', on: (event.target as HTMLInputElement).checked });
};

// Escape belongs to existing dialogs/text inputs first. Logging out is always explicit.
let quitPaused = false;
function cancelQuit() {
  if (elementById2('quitconfirm').disabled) return;
  clientGameState.quitting = false;
  if (quitPaused) send({ t: 'pause' });
  quitPaused = false;
  elementById2('pausebox').classList.toggle('hidden', !clientGameState.paused);
  overlays.close('quitbox');
}
function openQuit() {
  clientGameState.quitting = true;
  quitPaused = !!clientGameState.solo && !clientGameState.paused;
  if (quitPaused) send({ t: 'pause' });
  elementById2('pausebox').classList.add('hidden');
  elementById2('quitnote').textContent = clientGameState.solo
    ? 'Your progress is saved when you log out.'
    : 'Your progress is saved when you log out. The online world keeps running.';
  overlays.open('quitbox');
}
async function logOut(reason = '') {
  elementById2('quitconfirm').disabled = elementById2('quitcancel').disabled = true;
  diagnostics.clear();
  refreshDiagnosticControls();
  sessionEpoch++;
  const epoch = sessionEpoch;
  const socket = connectionLifecycle.detach();
  delete clientGameState._cred;
  // The server's normal close path detaches, docks and saves the captain before closing.
  try {
    await socket?.logout();
  } catch {
    // A disconnected service cannot acknowledge revocation; still clear local account state.
  }
  if (epoch !== sessionEpoch) return;
  clientGameState.views.reset();
  const keep = {
    A: clientGameState.A,
    opts: clientGameState.opts,
    pal: clientGameState.pal,
    mapLegend: clientGameState.mapLegend,
    views: clientGameState.views,
  };
  const sessionState = clientGameState as unknown as Record<string, unknown>;
  for (const entryKey of Object.keys(clientGameState)) delete sessionState[entryKey];
  for (const [entryKey, value] of Object.entries(sessionDefaults!))
    sessionState[entryKey] = typeof value === 'function' ? value : structuredClone(value);
  Object.assign(clientGameState, keep);
  updateAttention();
  clearFlightStatus();
  landingFeedback.reset();
  flightEngine.input.clear();
  prediction.reset();
  account = _lastSnapT = 0;
  mouse.down = mouse.in = false;
  padding.prev = [];
  releaseTouchControls();
  storyQ.length = 0;
  quitPaused = false;
  overlays.reset();
  resetRenderSession();
  hailUI.reset();
  profileUI.reset();
  miningUI.refresh();
  closeMap();
  document
    .querySelectorAll<HTMLElement>('.overlay')
    .forEach((htmlElement) => htmlElement.classList.add('hidden'));
  for (const identifier of ['pausebox', 'tut', 'combatcontrols'])
    elementById2(identifier).classList.add('hidden');
  for (const identifier of [
    'chatlog',
    'storein',
    'storebuttonslot',
    'capview',
    'landbody',
    'infobody',
    'toasts',
    'storyx',
    'storyb',
    'hailtext',
    'hailopts',
  ])
    elementById2(identifier).replaceChildren();
  // Clear persistent panel drafts too (for example, a former captain's tow recipient).
  document
    .querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('input, textarea')
    .forEach((element) => {
      if (
        element.id !== 'lname' &&
        ['text', 'search', 'password', 'textarea'].includes(element.type)
      )
        element.value = '';
    });
  elementById2('cchan')
    .querySelectorAll<HTMLElement>('button')
    .forEach((htmlElement) => htmlElement.classList.toggle('on', htmlElement.dataset.ch === ''));
  elementById2('chatin').placeholder = clientGameState.solo
    ? 'Write a note in your log (Enter)'
    : 'Press Enter to chat';
  elementById2('itabs')
    .querySelectorAll<HTMLElement>('button')
    .forEach((htmlElement) =>
      htmlElement.classList.toggle('on', htmlElement.dataset.it === 'ship'),
    );
  elementById2('qvolbox').classList.add('hidden');
  elementById2('lerr').textContent = reason;
  elementById2('lbtn').disabled =
    elementById2('quitconfirm').disabled =
    elementById2('quitcancel').disabled =
      false;
  elementById2('login').classList.remove('hidden');
  elementById2('lname').focus();
  elementById2('lname').select();
  audio.setAmbience(null);
  audio.industrial(false, 0);
  audio.towing(false);
  stopRadio();
  audio.startMusic();
  // Refresh Solo slot summaries only after the disconnect/save, without rebuilding event listeners.
  try {
    const status = await (await fetch('/api/status')).json();
    if (epoch === sessionEpoch && !clientGameState.you && clientGameState.solo) soloLogin(status);
  } catch {}
}
overlays.register({
  id: 'quitbox',
  priority: 200,
  dismiss: cancelQuit,
  initialFocus: () => elementById2('quitcancel'),
});
elementById2('ejectshortcut').onclick = openQuit;
elementById2('quitcancel').onclick = cancelQuit;
elementById2('quitconfirm').onclick = () => logOut();
window.addEventListener(
  'keydown',
  (keyboardEvent) => {
    if (keyboardEvent.key !== 'Escape' || keyboardEvent.repeat || !clientGameState.you || typing())
      return;
    if (!elementById2('qvolbox').classList.contains('hidden')) {
      elementById2('qvolbox').classList.add('hidden');
      keyboardEvent.stopImmediatePropagation();
      return;
    }
    // Existing modals, map, and expanded mining panel consume this Escape instead.
    if (
      [...document.querySelectorAll<HTMLElement>('.overlay:not(.hidden)')].some(
        (htmlElement) => htmlElement.id !== 'land',
      )
    )
      return;
    const focusedPanel = document.activeElement!.closest<HTMLElement>(
      '.function-panel:not(.hidden)',
    );
    if (focusedPanel) {
      focusedPanel.querySelector<HTMLElement>('header button')?.click();
      keyboardEvent.preventDefault();
      keyboardEvent.stopImmediatePropagation();
      return;
    }
    if (chatProjection.isOpen()) {
      chatProjection.collapse();
      keyboardEvent.preventDefault();
      keyboardEvent.stopImmediatePropagation();
      return;
    }
    if (!elementById2('miningcontrols').classList.contains('hidden')) {
      elementById2('miningclose').click();
      keyboardEvent.preventDefault();
      keyboardEvent.stopImmediatePropagation();
      return;
    }
    keyboardEvent.preventDefault();
    keyboardEvent.stopImmediatePropagation();
    openQuit();
  },
  true,
);

declare global {
  interface Window {
    G: ClientGameState;
    RiftAudio: typeof audio;
  }
}
