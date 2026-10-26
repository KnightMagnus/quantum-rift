import type { ClientGameState } from '../client/main.ts';
import type { PlanetDef, PlanetSprite } from '../client/planets.ts';

type PlanetModule = typeof import('../client/planets.ts');
type PlanetCacheProbe = {
  /** The page's own planets module. */
  planets: PlanetModule;

  /** Worlds drawn every animation frame. */
  worlds: PlanetDef[];

  /** Latest sprite drawn for each world. */
  sprites: Map<string, PlanetSprite>;

  /** Original first-system sprites, retained only to verify replacement after eviction. */
  firstSprites?: Map<string, PlanetSprite>;
};
type RecordedInput = { t: string; th?: number; tu?: number; f1?: number; [key: string]: unknown };
type SceneEvidence = {
  draws: number;
  planetFrames: number[];
  planetHash?: number;
  hubFrames: number[][];
  lightAlpha: number[];
  lightBrightness: number[];
  planetSizes: number[];
  lightPixels?: number;
  beacon?: { x: number; y: number };
  ships: Record<string, { first: number; last: number; visible: boolean }>;
  motion: {
    event: string;
    now: number;
    matches?: boolean;
    hidden: boolean;
    width: number;
    height: number;
    renderer: Record<string, string | undefined> | null;
    draws: number;
  }[];
  suppressReduceChange: boolean;
  suppressedEvents: number;
  deliveredReduceEvents: number;
};

declare global {
  const G: ClientGameState;
  const wire: RecordedInput[];
  const testSocket: WebSocket;
  const __testSocket: WebSocket;
  const radioSocket: WebSocket;
  const cockpitSocket: WebSocket;
  const radioPlays: string[];
  const radioToasts: string[];
  const radioAudio: HTMLMediaElement;
  const sameDocument: number;
  const savedYou: ClientGameState['you'];
  const pressureDescriptor: PropertyDescriptor;
  const gcanvas: HTMLCanvasElement;
  interface Window {
    readonly RiftEngine: import('../client/engine.ts').FlightEngine;
    wire: RecordedInput[];
    testSocket: WebSocket;
    __testSocket: WebSocket;
    radioSocket: WebSocket;
    cockpitSocket: WebSocket;
    fixtureSocket: WebSocket;
    radioPlays: string[];
    radioToasts: string[];
    radioAudio: HTMLMediaElement;
    sameDocument: number;
    savedYou: ClientGameState['you'];
    pressureDescriptor: PropertyDescriptor;
    cockpitText: { text: string; font: string }[];
    chatScrollSettled: boolean;
    fixturePad: { axes: number[]; buttons: { pressed: boolean }[] } | null;
    fixtureInputs: RecordedInput[];
    lastTargetSnapshot: number;
    polishArt: string;
    worlds: PlanetDef[];
    sprites: Record<string, PlanetSprite & { T?: { tw?: number; col?: unknown; R?: unknown } }>;
    planetProbe?: PlanetCacheProbe;
    originalStarterTracks: (typeof import('../shared/radio-stations.ts').RADIO_STATIONS)[number]['tracks'];
    pointerTrace: { at: number; type: string; target?: string; x: number; y: number }[];
    __decorBefore: () => void;
    __decorAfter: () => void;
    __stellarDraws: { size: number[]; canvas: string; center: number[] }[];
    trafficDraws: { src: string; x: number; y: number; t: number }[];
    cometFrame: (time: number, occlude: boolean) => void;
    sceneTest: SceneEvidence;
    loginMotionQueries: MediaQueryList[];
  }
}
