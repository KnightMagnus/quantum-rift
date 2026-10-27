import { Color, Engine, Flags, PointerScope, vec } from 'excalibur';
import type { ClientGameState } from './main.ts';
import { SpaceScene } from './space-scene.ts';
import { FlightInput } from './engine-input.ts';
import { canvasBackend } from './graphics-backend.ts';

/** One Engine owns the flight clock, input, camera, backing size and scene lifecycle. */
export class FlightEngine {
  engine!: Engine;
  scene!: SpaceScene;
  input!: FlightInput;
  /** True while the browser cannot render the authoritative world. */
  recovering = false;
  /** Number of successfully rebuilt display engines. */
  recoveries = 0;
  private state: ClientGameState;
  private advance: (time: number) => void;
  private blocked: () => boolean;
  private interrupt: () => void;
  private inputLifetime = new AbortController();
  private recoveryTimer: ReturnType<typeof setTimeout> | null = null;
  private recoveryNotice: HTMLElement | null = null;
  private canvas: HTMLCanvasElement;
  constructor(
    canvas: HTMLCanvasElement,
    state: ClientGameState,
    advance: (time: number) => void,
    blocked: () => boolean = () => false,
    interrupt: () => void = () => {},
  ) {
    this.canvas = canvas;
    this.state = state;
    this.advance = advance;
    this.blocked = blocked;
    this.interrupt = interrupt;
    canvas.addEventListener('contextlost', this.contextLost);
    canvas.addEventListener('contextrestored', this.contextRestored);
    this.createEngine();
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
  private createEngine(): void {
    const canvas = this.canvas;
    this.inputLifetime = new AbortController();
    const signal = this.inputLifetime.signal;
    // Excalibur Keyboard has no detach API. Scope its engine/scene window listeners explicitly.
    const inputGlobal = new Proxy(window, {
      get(target, key) {
        if (key === 'addEventListener')
          return (
            name: string,
            listener: EventListenerOrEventListenerObject,
            options?: boolean | AddEventListenerOptions,
          ) =>
            target.addEventListener(name, listener, {
              ...(typeof options === 'boolean' ? { capture: options } : options),
              signal,
            });
        if (key === 'removeEventListener') return target.removeEventListener.bind(target);
        return Reflect.get(target, key, target);
      },
    });
    const useCanvas = canvasBackend(new URLSearchParams(location.search).get('renderer'));
    if (useCanvas) Flags.useCanvasGraphicsContext();
    canvas.dataset.renderer = useCanvas ? 'canvas' : 'webgl';
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
      global: inputGlobal,
      antialiasing: true,
      handleContextLost: this.contextLost,
      handleContextRestored: this.contextRestored,
    });
    this.scene = new SpaceScene(this.state, this.advance);
    this.engine.add('space', this.scene);
    this.input = new FlightInput(this.engine, () => this.recovering || this.blocked());
  }
  private contextLost = (event: Event): void => {
    event.preventDefault();
    if (this.recovering) return;
    this.recovering = true;
    this.canvas.dataset.graphics = 'lost';
    this.input.clear();
    this.interrupt();
    this.engine.clock.stop();
    this.recoveryTimer = setTimeout(() => this.showRecoveryNotice(), 1000);
  };
  private showRecoveryNotice(): void {
    if (this.recoveryNotice || !this.recovering) return;
    const notice = document.createElement('div');
    notice.className = 'graphics-recovery-notice';
    notice.setAttribute('role', 'status');
    notice.textContent = 'The screen is recovering. Reload if it stays stuck. ';
    Object.assign(notice.style, {
      position: 'absolute',
      top: '8px',
      left: '8px',
      zIndex: '110',
      background: '#142638',
      color: '#e2efff',
      padding: '8px',
    });
    const reload = document.createElement('button');
    reload.textContent = 'Reload';
    reload.addEventListener('click', () => location.reload());
    notice.append(reload);
    this.canvas.parentElement?.append(notice);
    this.recoveryNotice = notice;
  }
  private contextRestored = (): void => {
    if (!this.recovering) return;
    const pointerEvents = this.engine.input.pointers.events;
    const heldKeys = [...this.engine.input.keyboard.getKeys()];
    this.interrupt();
    this.input.dispose();
    this.inputLifetime.abort();
    this.engine.input.pointers.detach();
    if (this.scene.isInitialized) {
      this.scene.input.pointers.detach();
      this.scene.input.toggleEnabled(false);
    }
    this.engine.browser.clear();
    this.scene.display.clear();
    this.engine.dispose();
    try {
      // Keep the canvas and authoritative client state; only disposable display objects change.
      this.createEngine();
      this.input.blockUntilRelease(heldKeys);
      this.engine.input.pointers.events = pointerEvents;
      this.resize();
      void this.start()
        .then(() => {
          this.input.clear();
          this.interrupt();
          this.recovering = false;
          this.recoveries++;
          this.canvas.dataset.graphics = 'ready';
          if (this.recoveryTimer) clearTimeout(this.recoveryTimer);
          this.recoveryTimer = null;
          this.recoveryNotice?.remove();
          this.recoveryNotice = null;
        })
        .catch((error: unknown) => {
          this.canvas.dataset.graphics = 'failed';
          this.showRecoveryNotice();
          console.error('Display recovery failed; reload to reconnect.', error);
        });
    } catch (error) {
      this.canvas.dataset.graphics = 'failed';
      this.showRecoveryNotice();
      console.error('Display recovery failed; reload to reconnect.', error);
    }
  };

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
    const engine = this.engine;
    await engine.goToScene('space');
    if (engine.isDisposed()) return;
    await engine.start();
    if (engine === this.engine) this.canvas.dataset.engine = 'excalibur-0.32.0';
  }
}
