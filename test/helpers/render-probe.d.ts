// Private render routines exposed only by regression HTTP fixtures.
export * from '../../client/render.ts';
import type { GalaxySystem, StellarBody } from '../../client/render.ts';
import type { PlanetDef } from '../../client/planets.ts';
type Point = {
  x: number;
  y: number;
};
type DebrisBit = {
  a: number;
  d: number;
  s: number;
  sp: number;
  rot: number;
  hot?: boolean;
};
type DecorSprite = Point & {
  img: string;
  size: number;
  rot: number;
  spin: number;
};
type DecorLayer = Point & {
  img: string;
  size: number;
  rot: number;
  depth: number;
};
type DecorModel = {
  sun:
    | (Point & {
        size: number;
        core: string;
        halo: string;
        depth: number;
      })
    | null;
  gal: (DecorLayer & {
    squash: number;
    a: number;
  })[];
  hole:
    | (Point & {
        size: number;
        rot: number;
        depth: number;
      })
    | null;
  pulsar:
    | (Point & {
        spin: number;
        len: number;
        depth: number;
      })
    | null;
  giant: null;
  arc: DecorLayer | null;
  neb: (DecorLayer & {
    a: number;
  })[];
  belt: {
    depth: number;
    rocks: (Point & {
      s: number;
      k: number;
      rot: number;
      sp: number;
    })[];
  } | null;
  storm:
    | (Point & {
        R: number;
        img: string;
        depth: number;
      })
    | null;
  derelict: DecorSprite[];
  wreck: (DecorSprite & {
    bits: DebrisBit[];
  })[];
  ruin: DecorSprite[];
  crystal: (DecorSprite & {
    ph: number;
  })[];
  debris: (Point & {
    spin: number;
    bits: DebrisBit[];
  })[];
  comet: {
    x0: number;
    y0: number;
    vx: number;
    vy: number;
    len: number;
    hue: string;
    period: number;
  } | null;
  sats: {
    cx: number;
    cy: number;
    R: number;
    a: number;
    sp: number;
    img: string;
    size: number;
  }[];
  pods: (Point & {
    vx: number;
    vy: number;
    img: string;
    size: number;
    rot: number;
    sp: number;
  })[];
  beacons: (Point & {
    col: string;
    ph: number;
  })[];
  bgp?: (Point & {
    p: PlanetDef;
    size: number;
    depth: number;
    a: number;
  })[];
  meteorT: number;
  arena?: {
    R: number;
  };
};
declare function decorFor(starSystem: GalaxySystem): DecorModel;
declare function drawDecorFar(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  starSystem: GalaxySystem,
  width2: number,
  height2: number,
  positionZ: number,
  centerX: number,
  centerY: number,
  currentTime: number,
): void;
declare function drawDecorNear(
  canvasRenderingContext2D: CanvasRenderingContext2D,
  starSystem: GalaxySystem,
  width2: number,
  height2: number,
  positionZ: number,
  screenX: (worldX: number) => number,
  screenY: (worldY: number) => number,
  currentTime: number,
): void;
export { decorFor, drawDecorFar, drawDecorNear };
export declare function stationSprite(
  stellarBody: StellarBody,
): HTMLImageElement | HTMLCanvasElement | null;
export declare const stationImgs: HTMLImageElement[];
export declare const hubImg: HTMLImageElement;
