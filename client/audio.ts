export interface AudioMixOptions {
  vol?: number;
  mute?: boolean;
  sfx?: number;
  ui?: number;
  amb?: number;
  music?: number;
}
export type AmbienceLocation = 'space' | 'station' | null;
export interface AmbienceLoopState {
  stop: boolean;
  srcs: AudioBufferSourceNode[];
  timer?: ReturnType<typeof setTimeout>;
}
export interface AmbienceBedState {
  g: GainNode;
  f: BiquadFilterNode | null;
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

/**
 * @typedef {Object} AudioMixOptions
 * @property {number} [vol] Master volume level (0..1)
 * @property {boolean} [mute] Whether all audio is muted
 * @property {number} [sfx] Sound effects bus level (0..1)
 * @property {number} [ui] UI audio bus level (0..1)
 * @property {number} [amb] Ambience audio bus level (0..1)
 * @property {number} [music] Music audio bus level (0..1)
 */

/**
 * @typedef {Object} AudioDebugInfo
 * @property {string | null | undefined} ctx Audio context state or null
 * @property {string[]} amb Active ambience bed names
 * @property {boolean} music Whether login music source is running
 * @property {number} buffers Number of decoded audio buffers cached
 * @property {number} towVoices Active tether voices (zero or one)
 * @property {number} towGain Effective tether gain through effects/master mixer
 */

/**
 * @typedef {Object} AmbienceLoopState
 * @property {boolean} stop Whether the loop has been requested to stop
 * @property {AudioBufferSourceNode[]} srcs List of active audio buffer source nodes
 * @property {ReturnType<typeof setTimeout>} [timer] Scheduled timer handle for next loop crossfade
 */

/**
 * @typedef {Object} AmbienceBedState
 * @property {GainNode} g Gain node controlling bed volume
 * @property {BiquadFilterNode|null} f Optional biquad filter node (used for engine lowpass)
 * @property {AmbienceLoopState} loop Loop scheduler state
 */

let audioContext: AudioContext | null = null,
  master: GainNode | null = null;
const audioBus: Partial<Record<MixerBus, GainNode>> = {};
const buffers = new Map<string | number, AudioBuffer>(),
  loading = new Map<string | number, Promise<AudioBuffer | null>>();
export let volume = 0.6;
let level2 = { sfx: 1, ui: 0.8, amb: 0.5, music: 0.6 },
  muted = false;

/**
 * Computes effective master volume taking mute state into account.
 * @returns {number}
 */
const level = () => (muted ? 0 : volume);

/**
 * Unlocks or initializes the WebAudio AudioContext and mixer busses on user interaction.
 * Resumes suspended context if already initialized.
 * @returns {void}
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
 * @param {number} value2 Volume level (0..1)
 * @returns {void}
 */
export function setVolume(value2: number) {
  volume = value2;
  if (master) master.gain.value = level();
}

/**
 * Updates mixer settings including master volume, mute state, and individual bus levels.
 * @param {AudioMixOptions} audioMixOptions Mixer options to apply
 * @returns {void}
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
 * @param {string|number} identifier Sound identifier or EV sound resource ID
 * @returns {Promise<AudioBuffer|null>|undefined}
 */
function load(identifier: string | number) {
  if (buffers.has(identifier) || loading.has(identifier) || !audioContext)
    return loading.get(identifier);
  const targetUrl =
    typeof identifier === 'string' && /^[a-z]/.test(identifier)
      ? `assets/sfx/${identifier}${identifier.startsWith('amb_') || identifier.startsWith('music_') ? '.mp3' : '.wav'}`
      : `assets/sounds/${identifier}.wav`;
  const catch2 = fetch(targetUrl)
    .then((response) => response.arrayBuffer())
    .then((arrayBuffer) => audioContext!.decodeAudioData(arrayBuffer))
    .then((audioBuffer) => {
      buffers.set(identifier, audioBuffer);
      return audioBuffer;
    })
    .catch(() => null);
  loading.set(identifier, catch2);
  return catch2;
}
let recent = 0,
  recentT = 0;
// positional combat effects (combat sound pack)

/**
 * Plays a positional combat sound effect with distance attenuation and stereo panning.
 * @param {string|number} identifier Sound identifier or resource number
 * @param {number} [deltaX=0] Horizontal offset relative to listener
 * @param {number} [deltaY=0] Vertical offset relative to listener
 * @param {number} [gain=1] Playback gain multiplier
 * @returns {void}
 */
export function play(identifier: string | number, deltaX = 0, deltaY = 0, gain = 1) {
  if (!audioContext || !identifier) return;
  void load(identifier);
  const audioBuffer = buffers.get(identifier);
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
  audioBufferSourceNode.start();
}

/**
 * Preloads a list of sound IDs into memory.
 * @param {Array<string|number>} identifiers Array of sound identifiers to preload
 * @returns {void}
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
 * @param {string} name Interface sound name without 'ui_' prefix (e.g. 'click', 'tab')
 * @param {number} [gain=1] Volume gain multiplier
 * @param {number} [rate=1] Base playback speed multiplier
 * @returns {void}
 */
export function ui(name: string, gain = 1, rate = 1) {
  if (!audioContext) return;
  const identifier = 'ui_' + name;
  void load(identifier);
  const audioBuffer = buffers.get(identifier);
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
  audioBufferSourceNode.start();
}

/**
 * Preloads common UI and interface sound effects.
 * @returns {void}
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
 * @param {string} identifier Sound ID for the ambience track
 * @param {GainNode} gainNode Target gain node
 * @returns {AmbienceLoopState}
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
 * @param {string} name Ambience bed name ('space', 'station', 'engine')
 * @param {boolean} enabled Whether the bed should be active
 * @param {number} [target=1] Target gain level when on
 * @param {number} [fade=1.5] Fade duration in seconds
 * @returns {void}
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
 * @param {AmbienceLocation} where Current environment
 * @param {boolean} [force] Force update even if environment hasn't changed
 * @returns {void}
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
 * @param {number} level Throttle level (0 idle .. 1 thrust, 1.6 afterburner)
 * @returns {void}
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

/**
 * Starts login screen theme music with fade-in.
 * @returns {void}
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
    musicSrc.start();
  });
}
let pendingMusicAllowed = true,
  musicRequest = 0;

/**
 * Fades out and stops login screen theme music.
 * @param {number} [fade=2.5] Fade-out duration in seconds
 * @returns {void}
 */
export function stopMusic(fade = 2.5) {
  pendingMusicAllowed = false;
  musicRequest++;
  pendingMusic = false;
  if (!musicSrc || !audioContext) return;
  const audioBufferSourceNode = musicSrc,
    gainNode = musicGain!;
  musicSrc = null;
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
 * @returns {AudioDebugInfo}
 */
export function debug() {
  return {
    ctx: audioContext && audioContext.state,
    amb: Object.keys(ambNow),
    music: !!musicSrc,
    buffers: buffers.size,
    towVoices: towVoice ? 1 : 0,
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
