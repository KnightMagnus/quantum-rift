import { Color, Engine, Flags, PointerScope, vec } from 'excalibur';
import type { ClientGameState } from './main.ts';
import { SpaceScene } from './space-scene.ts';
import { FlightInput } from './engine-input.ts';

/** One Engine owns the flight clock, input, camera, backing size and scene lifecycle. */
export class FlightEngine {
  readonly engine: Engine;
  readonly scene: SpaceScene;
  readonly input: FlightInput;
  private canvas: HTMLCanvasElement;
  constructor(canvas: HTMLCanvasElement, state: ClientGameState, advance: (time: number) => void) {
    this.canvas = canvas;
    if (new URLSearchParams(location.search).get('renderer') === 'canvas')
      Flags.useCanvasGraphicsContext();
    const width = Math.max(1, canvas.clientWidth),
      height = Math.max(1, canvas.clientHeight);
    this.engine = new Engine({
      canvasElement: canvas,
      width,
      height,
      pixelRatio: 1,
      physics: false,
      backgroundColor: Color.Black,
      pointerScope: PointerScope.Canvas,
      suppressPlayButton: true,
      suppressConsoleBootMessage: true,
      grabWindowFocus: false,
      antialiasing: true,
    });
    this.scene = new SpaceScene(state, advance);
    this.engine.add('space', this.scene);
    this.input = new FlightInput(this.engine);
    this.resize();
    new ResizeObserver(() => this.resize()).observe(canvas);
    const watchRatio = () => {
      const query = matchMedia(`(resolution: ${devicePixelRatio || 1}dppx)`);
      query.addEventListener(
        'change',
        () => {
          this.resize();
          watchRatio();
        },
        { once: true },
      );
    };
    watchRatio();
  }
  resize(): void {
    // Preserve the original physical-pixel zoom at DPR 1/2 without double HiDPI scaling.
    this.canvas.style.removeProperty('width');
    this.canvas.style.removeProperty('height');
    const viewport = {
      width: Math.max(1, this.canvas.clientWidth),
      height: Math.max(1, this.canvas.clientHeight),
    };
    const ratio = window.devicePixelRatio || 1;
    this.engine.screen.viewport = viewport;
    this.engine.screen.resolution = {
      width: Math.round(viewport.width * ratio),
      height: Math.round(viewport.height * ratio),
    };
    this.engine.screen.applyResolutionAndViewport();
    this.canvas.style.removeProperty('width');
    this.canvas.style.removeProperty('height');
  }
  worldPoint(clientX: number, clientY: number): [number, number] {
    const point = this.engine.screen.pageToWorldCoordinates(
      vec(clientX + scrollX, clientY + scrollY),
    );
    return [point.x - this.scene.shakeOffset.x, point.y - this.scene.shakeOffset.y];
  }
  async start(): Promise<void> {
    await this.engine.goToScene('space');
    await this.engine.start();
    this.canvas.dataset.engine = 'excalibur-0.32.0';
  }
}
