import { browserHealth } from './health.ts';
import {
  Actor,
  Canvas,
  CoordPlane,
  ExcaliburGraphicsContextWebGL,
  Material,
  Scene,
  vec,
} from 'excalibur';
import type { Engine } from 'excalibur';
import type { ClientGameState } from './main.ts';
import { STELLARS } from '../shared/galaxy.ts';
import { draw, cam, updateEffects, setWorldProjection, cameraShake } from './render.ts';
import { WorldActors } from './world-actors.ts';
import { updateLoginScene } from './login_scene.ts';

/** The sole flight scene: native entities interleaved with procedural screen-space layers. */
export class SpaceScene extends Scene {
  /** Developer-only bounded timings when ?health=1; absent otherwise. */
  readonly health = browserHealth;
  readonly display = new WorldActors(this);
  private layers: { actor: Actor; graphic: Canvas }[] = [];
  private now = 0;
  private drawStarted = 0;
  private nextRaster = 0;
  private system: string | null | undefined;
  updates = 0;
  shakeOffset = { x: 0, y: 0 };
  readonly state: ClientGameState;
  private advance: (time: number) => void;
  constructor(state: ClientGameState, advance: (time: number) => void) {
    super();
    this.state = state;
    this.advance = advance;
  }
  onInitialize(engine: Engine): void {
    if (engine.graphicsContext instanceof ExcaliburGraphicsContextWebGL) {
      // Premultiplied RGB with zero source alpha adds light without darkening the scene.
      this.display.additive = new Material({
        name: 'authored-additive-glow',
        graphicsContext: engine.graphicsContext,
        fragmentSource: `#version 300 es
precision mediump float;
in vec2 v_uv;
uniform sampler2D u_graphic;
uniform float u_opacity;
out vec4 fragColor;
void main() { fragColor = vec4(texture(u_graphic, v_uv).rgb * u_opacity, 0.0); }
`,
      });
    }
    for (const [layer, z] of [
      ['background', 0],
      ['middle', 20],
      ['foreground', 50],
    ] as const) {
      const actor = new Actor({
        name: 'procedural:' + layer,
        x: 0,
        y: 0,
        z,
        coordPlane: CoordPlane.Screen,
      });
      actor.graphics.anchor = vec(0, 0);
      const graphic = new Canvas({
        width: engine.screen.resolution.width,
        height: engine.screen.resolution.height,
        cache: true,
        draw: (context) => {
          if (this.state.sys)
            draw(this.state, context, graphic.width, graphic.height, 0, this.now, layer);
        },
      });
      actor.graphics.use(graphic);
      this.add(actor);
      this.layers.push({ actor, graphic });
    }
    setWorldProjection((x, y) => engine.screen.worldToScreenCoordinates(vec(x, y)));
  }
  onPreUpdate(engine: Engine, elapsed: number): void {
    const started = browserHealth?.now() ?? 0;
    this.updates++;
    this.now = performance.now();
    updateLoginScene(this.now);
    this.advance(this.now);
    if (this.system !== this.state.sys) {
      this.display.clear();
      this.system = this.state.sys;
    }
    const dock = this.state.landed && STELLARS[this.state.landed.stellar];
    const x = dock ? dock.x : (this.state.view?.rx || 0) + (this.state.lookX || 0);
    const y = dock ? dock.y : (this.state.view?.ry || 0) + (this.state.lookY || 0);
    this.shakeOffset = cameraShake(this.state);
    this.camera.pos = vec(x + this.shakeOffset.x, y + this.shakeOffset.y);
    this.camera.zoom = this.state.zoom;
    Object.assign(cam, {
      cx: x,
      cy: y,
      z: this.state.zoom,
      W: engine.screen.resolution.width,
      H: engine.screen.resolution.height,
    });
    updateEffects(this.state, Math.min(0.1, elapsed / 1000), this.now);
    this.display.update(this.state, this.now);
    const rasterDue = this.now >= this.nextRaster;
    if (rasterDue) this.nextRaster = this.now + 1000 / 30;
    for (const { actor, graphic } of this.layers) {
      if (rasterDue) graphic.flagDirty();
      actor.graphics.visible = !!this.state.sys;
      if (
        graphic.width !== engine.screen.resolution.width ||
        graphic.height !== engine.screen.resolution.height
      ) {
        graphic.width = engine.screen.resolution.width;
        graphic.height = engine.screen.resolution.height;
      }
    }
    if (browserHealth) browserHealth.observe('browserUpdateMs', browserHealth.now() - started);
  }
  onPreDraw(): void {
    this.drawStarted = browserHealth?.now() ?? 0;
  }
  onPostDraw(): void {
    if (browserHealth)
      browserHealth.observe('browserDrawMs', browserHealth.now() - this.drawStarted);
  }
  onDeactivate(): void {
    this.display.clear();
  }
}
