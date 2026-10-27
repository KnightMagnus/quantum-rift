import { ByteBudgetCache } from './render-cache-budget.ts';
import { assetFailure } from './asset-resources.ts';
export interface AudioMixOptions {
  /** Master volume level (0..1) */
  vol?: number;

  /** Whether all audio is muted */
  mute?: boolean;

  /** Sound effects bus level (0..1) */
  sfx?: number;

  /** UI audio bus level (0..1) */
  ui?: number;

  /** Ambience audio bus level (0..1) */
  amb?: number;

  /** Music audio bus level (0..1) */
  music?: number;
}
export type AmbienceLocation = 'space' | 'station' | null;
export interface AmbienceLoopState {
  /** Whether the loop has been requested to stop */
  stop: boolean;

  /** List of active audio buffer source nodes */
  srcs: AudioBufferSourceNode[];

  /** Scheduled timer handle for next loop crossfade */
  timer?: ReturnType<typeof setTimeout>;
}
export interface AmbienceBedState {
  /** Gain node controlling bed volume */
  g: GainNode;

  /** Optional biquad filter node (used for engine lowpass) */
  f: BiquadFilterNode | null;

  /** Loop scheduler state */
  loop: AmbienceLoopState;
}
type MixerBus = 'sfx' | 'ui' | 'amb' | 'music';
const mixerBuses: MixerBus[] = ['sfx', 'ui', 'amb', 'music'];
declare global {
  interface Window {
    webkitAudioContext?: typeof AudioContext;
  }
}
// Audio (WebAudio). Positional combat effects come from the combat sound pack. Generated interface sounds,
// ambient loops (open space, station interior, your engine) and a login-screen theme use separate mixer buses:
// master > effects | interface | ambience | music. The radio is an <audio> element with its own level (radio.js).

let audioContext: AudioContext | null = null,
  master: GainNode | null = null;
const audioBus: Partial<Record<MixerBus, GainNode>> = {};
const buffers = new ByteBudgetCache<AudioBuffer>(64 * 1024 * 1024, 2000, 128);
const loading = new Map<string, Promise<AudioBuffer | null>>();
const retryAfter = new Map<string, number>();
const activeSources = new Set<AudioBufferSourceNode>();
let trimTimer: ReturnType<typeof setTimeout> | null = null;
function trimAudioSoon(): void {
  if (trimTimer || (buffers.bytes <= buffers.budgetBytes && buffers.size <= buffers.maxEntries))
    return;
  trimTimer = setTimeout(() => {
    trimTimer = null;
    buffers.evict(performance.now());
    trimAudioSoon();
  }, 2100);
}

function trackSource(source: AudioBufferSourceNode): void {
  activeSources.add(source);
  source.addEventListener('ended', () => activeSources.delete(source), { once: true });
}
export let volume = 0.6;
let level2 = { sfx: 0.5, ui: 0.8, amb: 0.5, music: 0.6 },
  muted = false;

/**
 * Computes effective master volume taking mute state into account.
 */
const level = () => (muted ? 0 : volume);

/**
 * Unlocks or initializes the WebAudio AudioContext and mixer busses on user interaction.
 * Resumes suspended context if already initialized.
 */
export function unlock() {
  if (audioContext) {
    if (audioContext.state === 'suspended') void audioContext.resume();
    return;
  }
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    master = audioContext!.createGain();
    master.gain.value = level();
    master.connect(audioContext.destination);
    for (const mixerBus of mixerBuses) {
      audioBus[mixerBus] = audioContext!.createGain();
      audioBus[mixerBus]!.gain.value = level2[mixerBus];
      audioBus[mixerBus]!.connect(master);
    }
    if (pendingMusic) {
      pendingMusic = false;
      startMusic();
    }
    if (wantAmb) setAmbience(wantAmb, true);
  } catch {
    audioContext = null;
  }
}

/**
 * Sets the master volume level.
 * @param value2 Volume level (0..1)
 */
export function setVolume(value2: number) {
  volume = value2;
  if (master) master.gain.value = level();
}

/**
 * Updates mixer settings including master volume, mute state, and individual bus levels.
 * @param audioMixOptions Mixer options to apply
 */
export function setMix(audioMixOptions: AudioMixOptions) {
  if (audioMixOptions.vol != null) volume = audioMixOptions.vol;
  if (audioMixOptions.mute != null) muted = audioMixOptions.mute;
  for (const mixerBus of mixerBuses)
    if (audioMixOptions[mixerBus] != null) {
      level2[mixerBus] = audioMixOptions[mixerBus];
      if (audioBus[mixerBus])
        audioBus[mixerBus]!.gain.setTargetAtTime(
          audioMixOptions[mixerBus],
          audioContext!.currentTime,
          0.05,
        );
    }
  if (master) master.gain.value = level();
}
/**
 * Loads and decodes an audio file by ID into memory.
 * @param identifier Sound identifier or EV sound resource ID
 */
// Retired upgrade cue is blocked even for stale or data-driven sound requests.
const retiredSound = (identifier: string | number) => String(identifier) === '10110';
function load(identifier: string | number): Promise<AudioBuffer | null> {
  if (retiredSound(identifier) || !audioContext) return Promise.resolve(null);
  const key = String(identifier);
  const cached = buffers.get(key, performance.now());
  if (cached) return Promise.resolve(cached);
  const pending = loading.get(key);
  if (pending) return pending;
  if (loading.size >= 64 || (retryAfter.get(key) || 0) > performance.now())
    return Promise.resolve(null);
  const targetUrl =
    typeof identifier === 'string' && /^[a-z]/.test(identifier)
      ? `assets/sfx/${identifier}${identifier.startsWith('amb_') || identifier.startsWith('music_') ? '.mp3' : '.wav'}`
      : `assets/sounds/${identifier}.wav`;
  const request = fetch(targetUrl)
    .then((response) => {
      if (!response.ok) throw Error(`HTTP ${response.status}`);
      return response.arrayBuffer();
    })
    .then((arrayBuffer) => audioContext!.decodeAudioData(arrayBuffer))
    .then((audioBuffer) => {
      buffers.set(
        key,
        audioBuffer,
        audioBuffer.length * audioBuffer.numberOfChannels * 4,
        performance.now(),
      );
      retryAfter.delete(key);
      trimAudioSoon();
      return audioBuffer;
    })
    .catch(() => {
      assetFailure(targetUrl, 'missing or corrupt audio');
      if (retryAfter.size >= 128) retryAfter.delete(retryAfter.keys().next().value!);
      retryAfter.set(key, performance.now() + 30000);
      return null;
    })
    .finally(() => loading.delete(key));
  loading.set(key, request);
  return request;
}

/** Decoded PCM owned by the cache; active sources keep their own buffers after eviction. */
export function audioResourceUsage() {
  buffers.evict(performance.now());
  const cached = new Set([...buffers].map(([, buffer]) => buffer));
  const active = new Set(
    [...activeSources]
      .map((source) => source.buffer)
      .filter((buffer): buffer is AudioBuffer => !!buffer),
  );
  const size = (values: Set<AudioBuffer>) =>
    [...values].reduce((bytes, buffer) => bytes + buffer.length * buffer.numberOfChannels * 4, 0);
  return {
    entries: buffers.size,
    bytes: buffers.bytes,
    budgetBytes: buffers.budgetBytes,
    pending: loading.size,
    activeSources: activeSources.size,
    activeBytes: size(active),
    totalBytes: size(new Set([...cached, ...active])),
  };
}

/** Override only cache ownership for measurement; never stop a live source. */
export function setAudioResourceBudget(bytes: number): void {
  buffers.budgetBytes = bytes;
  audioResourceUsage();
  trimAudioSoon();
}

let recent = 0,
  recentT = 0;
// positional combat effects (combat sound pack)

/**
 * Plays a positional combat sound effect with distance attenuation and stereo panning.
 * @param identifier Sound identifier or resource number
 * @param deltaX Horizontal offset relative to listener
 * @param deltaY Vertical offset relative to listener
 * @param gain Playback gain multiplier
 */
export function play(identifier: string | number, deltaX = 0, deltaY = 0, gain = 1) {
  if (!audioContext || !identifier || retiredSound(identifier)) return;
  void load(identifier);
  const audioBuffer = buffers.get(String(identifier), performance.now());
  if (!audioBuffer) return;
  const currentTime2 = audioContext!.currentTime;
  if (currentTime2 - recentT > 0.05) {
    recentT = currentTime2;
    recent = 0;
  }
  if (++recent > 6) return; // don't stack dozens at once
  const distance = Math.hypot(deltaX, deltaY),
    game = gain * Math.max(0, 1 - distance / 1600);
  if (game < 0.03) return;
  const audioBufferSourceNode = audioContext!.createBufferSource();
  audioBufferSourceNode.buffer = audioBuffer;
  const gainNode = audioContext!.createGain();
  gainNode.gain.value = game;
  let node: AudioNode = gainNode;
  if (audioContext.createStereoPanner) {
    const stereoPannerNode = audioContext.createStereoPanner();
    stereoPannerNode.pan.value = Math.max(-1, Math.min(1, deltaX / 900));
    gainNode.connect(stereoPannerNode);
    node = stereoPannerNode;
  }
  audioBufferSourceNode.connect(gainNode);
  node.connect((audioBus.sfx || master)!);
  trackSource(audioBufferSourceNode);
  audioBufferSourceNode.start();
}

/**
 * Preloads a list of sound IDs into memory.
 * @param identifiers Array of sound identifiers to preload
 */
export function preload(identifiers: Array<string | number>) {
  if (!audioContext) return;
  for (const identifier of identifiers) void load(identifier);
}

// ------------------------------------------------------------------ 2.0 interface sounds
const lastUi: Record<string, number> = {};
const UI_GAP: Record<string, number> = {
  hover: 0.18,
  click: 0.03,
  type: 0.02,
  toast: 0.25,
  chat: 0.15,
  lock: 0.08,
  pickup: 0.06,
  error: 0.2,
};

/**
 * Plays an interface sound effect with slight pitch variation and rate limiting.
 * @param name Interface sound name without 'ui_' prefix (e.g. 'click', 'tab')
 * @param gain Volume gain multiplier
 * @param rate Base playback speed multiplier
 */
export function ui(name: string, gain = 1, rate = 1) {
  if (!audioContext) return;
  const identifier = 'ui_' + name;
  void load(identifier);
  const audioBuffer = buffers.get(String(identifier), performance.now());
  if (!audioBuffer) return;
  const currentTime2 = audioContext!.currentTime;
  if (lastUi[name] != null && currentTime2 - lastUi[name] < (UI_GAP[name] || 0.05)) return;
  lastUi[name] = currentTime2;
  const audioBufferSourceNode = audioContext!.createBufferSource();
  audioBufferSourceNode.buffer = audioBuffer;
  audioBufferSourceNode.playbackRate.value = rate * (1 + (Math.random() - 0.5) * 0.04);
  const gainNode = audioContext!.createGain();
  gainNode.gain.value = gain;
  audioBufferSourceNode.connect(gainNode);
  gainNode.connect((audioBus.ui || master)!);
  trackSource(audioBufferSourceNode);
  audioBufferSourceNode.start();
}

/**
 * Preloads common UI and interface sound effects.
 */
export function preloadUi() {
  if (!audioContext) return;
  void load('jumpfar');
  for (const count of [
    'click',
    'hover',
    'tab',
    'open',
    'close',
    'error',
    'buy',
    'sell',
    'toast',
    'accept',
    'complete',
    'levelup',
    'alert',
    'lock',
    'ping',
    'chat',
    'dock',
    'undock',
    'jump',
    'arrive',
    'autopilot',
    'jumpfast',
    'lowshield',
    'pickup',
    'hail',
    'type',
    'quest',
    'state',
  ])
    void load('ui_' + count);
}

// ------------------------------------------------------------------ ambience: looping beds cross-faded so mp3 padding never clicks
let wantAmb: AmbienceLocation = null;
const ambNow: Record<string, AmbienceBedState> = {};
/**
 * Schedules overlapping copies of an ambient loop with crossfades.
 * @param identifier Sound ID for the ambience track
 * @param gainNode Target gain node
 */
function loopBed(identifier: string, gainNode: GainNode) {
  // schedules overlapping copies of the loop with 2 s cross-fades, forever, until stopped
  const ambienceLoopState: AmbienceLoopState = { stop: false, srcs: [] };
  void load(identifier)!.then((audioBuffer) => {
    if (!audioBuffer || ambienceLoopState.stop) return;
    const transform = 2,
      duration2 = audioBuffer.duration;
    const navigate = (when: number) => {
      if (ambienceLoopState.stop) return;
      const audioBufferSourceNode = audioContext!.createBufferSource();
      audioBufferSourceNode.buffer = audioBuffer;
      const gainNode2 = audioContext!.createGain();
      audioBufferSourceNode.connect(gainNode2);
      gainNode2.connect(gainNode);
      gainNode2.gain.setValueAtTime(0, when);
      gainNode2.gain.linearRampToValueAtTime(1, when + transform);
      gainNode2.gain.setValueAtTime(1, when + duration2 - transform);
      gainNode2.gain.linearRampToValueAtTime(0, when + duration2);
      trackSource(audioBufferSourceNode);
      audioBufferSourceNode.start(when);
      audioBufferSourceNode.stop(when + duration2 + 0.05);
      ambienceLoopState.srcs.push(audioBufferSourceNode);
      audioBufferSourceNode.onended = () => {
        ambienceLoopState.srcs = ambienceLoopState.srcs.filter(
          (audioBufferSourceNode2) => audioBufferSourceNode2 !== audioBufferSourceNode,
        );
        audioBufferSourceNode.disconnect();
        gainNode2.disconnect();
      };
      ambienceLoopState.timer = setTimeout(
        () => navigate(when + duration2 - transform),
        Math.max(0, (when + duration2 - transform - audioContext!.currentTime - 1) * 1000),
      );
    };
    navigate(audioContext!.currentTime + 0.05);
  });
  return ambienceLoopState;
}

/**
 * Manages an ambient audio bed (creation, volume target scheduling, and cross-fade out).
 * @param name Ambience bed name ('space', 'station', 'engine')
 * @param enabled Whether the bed should be active
 * @param target Target gain level when on
 * @param fade Fade duration in seconds
 */
function createAudioBed(name: string, enabled: boolean, target = 1, fade = 1.5) {
  if (!audioContext) return;
  let ambienceBedState = ambNow[name];
  if (enabled && !ambienceBedState) {
    const gainNode = audioContext!.createGain();
    gainNode.gain.value = 0;
    let biquadFilterNode: BiquadFilterNode | null = null;
    if (name === 'engine') {
      biquadFilterNode = audioContext.createBiquadFilter();
      biquadFilterNode.type = 'lowpass';
      biquadFilterNode.frequency.value = 400;
      biquadFilterNode.Q.value = 0.7;
      gainNode.connect(biquadFilterNode);
      biquadFilterNode.connect(audioBus.amb!);
    } else gainNode.connect(audioBus.amb!);
    ambienceBedState = ambNow[name] = {
      g: gainNode,
      f: biquadFilterNode,
      loop: loopBed('amb_' + name, gainNode),
    };
  }
  if (!ambienceBedState) return;
  ambienceBedState.g.gain.cancelScheduledValues(audioContext!.currentTime);
  ambienceBedState.g.gain.setTargetAtTime(
    enabled ? target : 0,
    audioContext!.currentTime,
    fade / 3,
  );
  if (!enabled) {
    const ambienceBedState2 = ambienceBedState;
    delete ambNow[name];
    setTimeout(
      () => {
        ambienceBedState2.loop.stop = true;
        clearTimeout(ambienceBedState2.loop.timer);
        for (const audioBufferSourceNode of ambienceBedState2.loop.srcs)
          try {
            audioBufferSourceNode.stop();
          } catch {}
        ambienceBedState2.g.disconnect();
        if (ambienceBedState2.f) ambienceBedState2.f.disconnect();
      },
      fade * 1000 + 300,
    );
  }
}

/**
 * Sets current ambience environment ('space', 'station', or null).
 * @param where Current environment
 * @param force Force update even if environment hasn't changed
 */
export function setAmbience(where: AmbienceLocation, force = false) {
  if (where === wantAmb && !force) return;
  wantAmb = where;
  if (!audioContext) return;
  createAudioBed('space', where === 'space', 0.35);
  createAudioBed('station', where === 'station', 0.45);
  createAudioBed('engine', where === 'space', 0.0001);
}

/**
 * Updates engine sound pitch/filter and volume based on ship throttle.
 * @param level Throttle level (0 idle .. 1 thrust, 1.6 afterburner)
 */
let engineTime = 0;
export function engine(level: number) {
  const ambienceBedState = ambNow.engine;
  if (!audioContext || !ambienceBedState) return;
  const currentTime2 = audioContext!.currentTime;
  if (currentTime2 - engineTime < 0.08) return;
  engineTime = currentTime2;
  const length = Math.min(1.6, level);
  ambienceBedState.g.gain.setTargetAtTime(0.14 + 0.5 * length, currentTime2, 0.25);
  if (ambienceBedState.f)
    ambienceBedState.f.frequency.setTargetAtTime(380 + 1300 * length, currentTime2, 0.3); // throttle opens the filter
}

// ------------------------------------------------------------------ music: the login screen only (in the game, the radio is the music)
let musicSrc: AudioBufferSourceNode | null = null,
  musicGain: GainNode | null = null,
  pendingMusic = false;
let musicStartedAt = 0,
  musicEpoch = 0;

/**
 * Starts login screen theme music with fade-in.
 */
export function startMusic() {
  pendingMusicAllowed = true;
  const request = ++musicRequest;
  if (!audioContext) {
    pendingMusic = true;
    return;
  }
  if (musicSrc) return;
  void load('music_login33')!.then((audioBuffer) => {
    if (!audioBuffer || musicSrc || !pendingMusicAllowed || request !== musicRequest) return;
    musicGain = audioContext!.createGain();
    musicGain.gain.value = 0;
    musicGain.connect(audioBus.music!);
    musicGain.gain.linearRampToValueAtTime(0.9, audioContext!.currentTime + 3);
    musicSrc = audioContext!.createBufferSource();
    musicSrc.buffer = audioBuffer;
    musicSrc.loop = true;
    musicSrc.connect(musicGain);
    musicStartedAt = audioContext!.currentTime;
    musicEpoch++;
    trackSource(musicSrc);
    musicSrc.start();
  });
}
let pendingMusicAllowed = true,
  musicRequest = 0;

/** Current source/context playback position; suspended WebAudio time does not advance. */
export function loginMusicTimeline() {
  const duration = musicSrc?.buffer?.duration ?? 0;
  return {
    /** Loop-relative playback seconds, not wall-clock scene time. */
    position:
      duration && audioContext
        ? Math.max(0, audioContext.currentTime - musicStartedAt) % duration
        : 0,
    /** Actual decoded theme length in seconds. */
    duration,
    /** A source only advances while its owning context is running. */
    playing: !!musicSrc && audioContext?.state === 'running',
    /** Changes when a new source starts, including after logout. */
    epoch: musicEpoch,
  };
}

/**
 * Fades out and stops login screen theme music.
 * @param fade Fade-out duration in seconds
 */
export function stopMusic(fade = 2.5) {
  pendingMusicAllowed = false;
  musicRequest++;
  pendingMusic = false;
  if (!musicSrc || !audioContext) return;
  const audioBufferSourceNode = musicSrc,
    gainNode = musicGain!;
  musicSrc = null;
  if (fade <= 0) {
    audioBufferSourceNode.stop();
    gainNode.disconnect();
    return;
  }
  gainNode.gain.cancelScheduledValues(audioContext!.currentTime);
  gainNode.gain.setValueAtTime(gainNode.gain.value, audioContext!.currentTime);
  gainNode.gain.linearRampToValueAtTime(0, audioContext!.currentTime + fade);
  setTimeout(
    () => {
      try {
        audioBufferSourceNode.stop();
      } catch {}
      gainNode.disconnect();
    },
    fade * 1000 + 200,
  );
}

/**
 * Returns audio subsystem debug diagnostics.
 */
export function debug() {
  return {
    /** Audio context state or null */
    ctx: audioContext && audioContext.state,

    /** Current mixer targets and actual bus gains, without changing playback. */
    mix: { ...level2 },
    gains: Object.fromEntries(
      mixerBuses.map((bus) => [bus, audioBus[bus]?.gain.value ?? level2[bus]]),
    ),
    master: level(),

    /** Active ambience bed names */
    amb: Object.keys(ambNow),

    /** Whether login music source is running */
    music: !!musicSrc,

    /** Number of decoded audio buffers cached */
    buffers: buffers.size,

    /** Active tether voices (zero or one) */
    towVoices: towVoice ? 1 : 0,

    /** Effective tether gain through effects/master mixer */
    towGain: towVoice
      ? towGain!.gain.value * (audioBus.sfx?.gain.value ?? 1) * master!.gain.value
      : 0,
  };
}

// One restrained intake voice; existing mixer/master/mute applies. Alarm only on upward stage changes.
let industrialVoice: OscillatorNode | null = null,
  industrialGain: GainNode | null = null,
  industrialStage = 0;
export function industrial(enabled: boolean, heat: number) {
  const stage = heat >= 150 ? 3 : heat >= 120 ? 2 : heat >= 70 ? 1 : 0;
  if (stage > industrialStage) ui('error', 0.32, 0.8 + stage * 0.2);
  industrialStage = stage;
  if (!audioContext) return;
  if (enabled && !industrialVoice) {
    industrialVoice = audioContext.createOscillator();
    industrialGain = audioContext!.createGain();
    industrialVoice.type = 'triangle';
    industrialGain.gain.value = 0.018;
    industrialVoice.connect(industrialGain);
    industrialGain.connect((audioBus.sfx || master)!);
    industrialVoice.start();
  }
  if (industrialVoice && enabled)
    industrialVoice.frequency.setTargetAtTime(
      55 + Math.min(150, heat) * 0.35,
      audioContext!.currentTime,
      0.2,
    );
  if (industrialVoice && !enabled) {
    industrialVoice.stop();
    industrialVoice.disconnect();
    industrialGain!.disconnect();
    industrialVoice = industrialGain = null;
  }
}

// One restrained tether-strain voice, downstream of the existing effects/master/mute mixer.
let towVoice: OscillatorNode | null = null,
  towGain: GainNode | null = null;
export function towing(enabled: boolean, tension = 0) {
  if (!audioContext) return;
  const strain = Math.max(0, Math.min(1, Number(tension) || 0));
  if (enabled && !towVoice) {
    towVoice = audioContext.createOscillator();
    towGain = audioContext!.createGain();
    towVoice.type = 'triangle';
    towGain!.gain.value = 0.006;
    towVoice.connect(towGain);
    towGain.connect((audioBus.sfx || master)!);
    towVoice.start();
  }
  if (enabled && towVoice) {
    towVoice.frequency.setTargetAtTime(45 + 35 * strain, audioContext!.currentTime, 0.25);
    towGain!.gain.setTargetAtTime(0.006 + 0.008 * strain, audioContext!.currentTime, 0.25);
  }
  if (!enabled && towVoice) {
    towVoice.stop();
    towVoice.disconnect();
    towGain!.disconnect();
    towVoice = towGain = null;
  }
}
