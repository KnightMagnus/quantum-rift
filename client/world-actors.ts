import { Actor, Canvas, Circle, Color, GraphicsGroup, ImageSource, Sprite, vec } from 'excalibur';
import type { Scene, Graphic, GraphicsGrouping, Material } from 'excalibur';
import type { ClientGameState } from './main.ts';
import type { RenderShip } from './render.ts';
import { sheet, shipFrame, objImg, rockImage, drawShot } from './render.ts';
import { weaponColor, weaponLook } from '../shared/rules.ts';

/** Display-only entity registry. Authoritative velocities never enter Actor motion. */
export class WorldActors {
  readonly actors = new Map<string, Actor>();
  private embellishments = new Map<string, Canvas>();
  private images = new WeakMap<HTMLImageElement | HTMLCanvasElement, ImageSource>();
  private shotSnapshot: ClientGameState['shots'] | undefined;
  private shotGeneration = 0;
  private shotGraphics = new Map<string, ImageSource>();
  additive: Material | null = null;
  private scene: Scene;
  constructor(scene: Scene) {
    this.scene = scene;
  }

  private imageReady(resource: ImageSource): boolean {
    // Canvas ImageSource marks isLoaded before its asynchronous blob has decoded.
    // Zero dimensions let Sprite later replace the requested zoomed size with native size.
    return resource.isLoaded() && resource.width > 0 && resource.height > 0;
  }

  private sprite(
    image: HTMLImageElement | HTMLCanvasElement,
    size: number,
    source?: { x: number; y: number; width: number; height: number },
  ): Sprite | null {
    if (image instanceof HTMLImageElement && (!image.complete || !image.naturalWidth)) return null;
    let resource = this.images.get(image);
    if (!resource) {
      resource =
        image instanceof HTMLImageElement
          ? ImageSource.fromHtmlImageElement(image)
          : ImageSource.fromHtmlCanvasElement(image);
      this.images.set(image, resource);
    }
    if (!this.imageReady(resource)) return null;
    return new Sprite({
      image: resource,
      sourceView: source,
      destSize: { width: size, height: size },
    });
  }

  private bind(
    key: string,
    x: number,
    y: number,
    z: number,
    graphic: Graphic,
    live: Set<string>,
  ): Actor {
    live.add(key);
    let actor = this.actors.get(key);
    if (!actor) {
      actor = new Actor({ name: key, x, y, z });
      this.actors.set(key, actor);
      this.scene.add(actor);
    }
    actor.pos = vec(x, y);
    actor.graphics.use(graphic);
    return actor;
  }

  private ship(state: ClientGameState, ship: RenderShip, now: number, live: Set<string>): void {
    const hull = state.A?.ships[ship.hull];
    if (!hull) return;
    const frame = shipFrame(state, ship, now),
      size = hull.size * state.spriteScale;
    const source = {
      x: frame.sourceX,
      y: frame.sourceY,
      width: frame.fileSystem,
      height: frame.fileSystem,
    };
    const sprite = this.sprite(sheet(hull), size, source);
    if (!sprite) return;
    const members: GraphicsGrouping[] = [{ graphic: sprite, offset: vec(-size / 2, -size / 2) }];
    if (ship.fl & 8) {
      for (let index = 6; index >= 1; index--) {
        const ghost = sprite.clone();
        ghost.opacity = 0.22 * (1 - index / 7);
        const distance = index * size * 0.32;
        members.unshift({
          graphic: ghost,
          offset: vec(
            -size / 2 - Math.sin(ship.a) * distance,
            -size / 2 + Math.cos(ship.a) * distance,
          ),
        });
      }
    }
    if (ship.fl & (8 | 32)) {
      const key = ship.hull + ':' + frame.fraction + ':' + size + ':' + (ship.fl & (8 | 32));
      let effect = this.embellishments.get(key);
      if (!effect) {
        const extent = size * 2 + 64;
        effect = new Canvas({
          width: extent,
          height: extent,
          cache: true,
          draw: (context) => {
            const center = extent / 2;
            if (ship.fl & 8) {
              const x = center + Math.sin(ship.a) * size * 0.35,
                y = center - Math.cos(ship.a) * size * 0.35;
              const gradient = context.createRadialGradient(x, y, 0, x, y, size * 0.6);
              gradient.addColorStop(0, 'rgba(220,240,255,.85)');
              gradient.addColorStop(1, 'rgba(120,170,255,0)');
              context.fillStyle = gradient;
              context.fillRect(0, 0, extent, extent);
            } else {
              context.shadowColor = 'rgba(255,205,90,.95)';
              context.shadowBlur = 16;
              context.drawImage(
                sheet(hull),
                source.x,
                source.y,
                source.width,
                source.height,
                center - size / 2,
                center - size / 2,
                size,
                size,
              );
              context.shadowBlur = 0;
              context.globalCompositeOperation = 'destination-out';
              context.drawImage(
                sheet(hull),
                source.x,
                source.y,
                source.width,
                source.height,
                center - size / 2,
                center - size / 2,
                size,
                size,
              );
            }
          },
        });
        this.embellishments.set(key, effect);
        if (this.embellishments.size > 256)
          this.embellishments.delete(this.embellishments.keys().next().value!);
      }
      members.splice(members.length - 1, 0, {
        graphic: effect,
        offset: vec(-effect.width / 2, -effect.height / 2),
      });
    }
    const glowMembers: typeof members = [];
    if (ship.fl & 1 && hull.glow && (!hull.spr || hull.spr.glow)) {
      const glow = this.sprite(sheet(hull, true), size, source);
      if (glow) {
        const boost = !!(ship.fl & 2),
          heading = (frame.fraction0 * Math.PI) / 18;
        const flicker = matchMedia('(prefers-reduced-motion: reduce)').matches
          ? 1
          : 0.94 + 0.06 * Math.sin(now / 47 + ship.id * 2.3);
        for (let index = 12; index >= 1; index--) {
          const mask = glow.clone(),
            progress = index / 12,
            distance = size * (boost ? 0.32 : 0.14) * flicker * progress;
          mask.opacity = (boost ? 0.38 : 0.26) * (1 - progress * 0.85);
          glowMembers.push({
            graphic: mask,
            offset: vec(
              -size / 2 - Math.sin(heading) * distance,
              -size / 2 + Math.cos(heading) * distance,
            ),
          });
        }
        glow.opacity = boost ? 1 : 0.8 * flicker;
        glowMembers.push({ graphic: glow, offset: vec(-size / 2, -size / 2) });
      }
    }
    if (glowMembers.length) {
      const glowActor = this.bind(
        'glow:' + ship.id,
        ship.rx,
        ship.ry,
        41,
        new GraphicsGroup({ members: glowMembers, useAnchor: false }),
        live,
      );
      glowActor.graphics.material = this.additive;
    }
    this.bind(
      'ship:' + ship.id,
      ship.rx,
      ship.ry,
      40,
      new GraphicsGroup({ members, useAnchor: false }),
      live,
    );
  }

  update(state: ClientGameState, now: number): void {
    const live = new Set<string>();
    if (this.shotSnapshot !== state.shots) {
      this.shotSnapshot = state.shots;
      this.shotGeneration++;
    }
    if (state.sys && state.A) {
      for (const ship of state.ents.values()) this.ship(state, ship, now, live);
      if (state.view && !state.ents.has(state.view.id) && state.myHull)
        this.ship(state, { ...state.view, hull: state.myHull }, now, live);
      for (const rock of state.rocks || []) {
        if (!rock.hp) continue;
        const image =
          rock.ore === 'gas'
            ? rockImage(rock)
            : objImg(
                rock.ore === 'shards'
                  ? 'crys' + (Math.abs(rock.id) % 4)
                  : 'rock' + (Math.abs(rock.id) % 10),
              );
        const loaded = image instanceof HTMLImageElement && image.complete && image.naturalWidth;
        const fallback = loaded ? image : rockImage(rock);
        const sprite = this.sprite(fallback, loaded ? rock.r * 2.35 : fallback.width);
        if (!sprite) continue;
        const actor = this.bind('rock:' + rock.id, rock.x, rock.y, 10, sprite, live);
        actor.graphics.material = rock.ore === 'gas' ? this.additive : null;
        actor.rotation =
          (now / 1000) * (rock.ore === 'gas' ? 0.05 : 0.12) * (rock.id % 2 ? 1 : -1) + rock.id;
        actor.graphics.opacity = 0.45 + (0.55 * rock.hp) / 100;
      }
      for (const loot of state.loot) {
        const size =
          ((loot.kind === 5 ? 30 + Math.sin(now / 200) * 2 : 18) * Math.max(0.6, state.zoom)) /
          state.zoom;
        const graphic =
          this.sprite(objImg('loot' + Math.min(5, loot.kind || 0)), size) ||
          new Circle({ radius: 4, color: Color.Yellow });
        const actor = this.bind('loot:' + loot.id, loot.x, loot.y, 30, graphic, live);
        actor.rotation = now / 900 + loot.id;
      }
      state.shots.forEach((shot, index) => {
        const weapon = state.A!.weapons[shot.w];
        if (!weapon) return;
        // Cache local procedural weapon frames; the projectile itself is a native Sprite.
        const phase = Math.floor(now / 45) % 16;
        const speed = Math.hypot(shot.vx, shot.vy);
        // drawShot varies only its colored trail with speed; retain that exact identity.
        const trail = Math.min(40, (speed || 1) * 0.03);
        const identity = ':' + state.zoom + ':' + trail;
        const key = shot.w + ':' + phase + identity;
        // Cover the longest trail, torpedo/singularity pulse, flak and fixed-pixel blur.
        // A centered square remains conservative under every Actor rotation.
        const effectZoom = Math.max(0.7, state.zoom);
        const radius = Math.ceil(
          Math.max(40 * state.zoom, 23 * effectZoom, 8 * 1.25 * 2.2 * effectZoom) + 32,
        );
        const extent = radius * 2;
        let resource = this.shotGraphics.get(key);
        if (!resource) {
          const canvas = document.createElement('canvas');
          canvas.width = canvas.height = extent;
          const context = canvas.getContext('2d')!;
          drawShot(
            context,
            {
              ...shot,
              vx: speed,
              vy: 0,
              W: weapon,
              col: weaponColor(weapon),
              look: weaponLook(weapon),
            },
            radius,
            radius,
            state.zoom,
            phase * 45,
          );
          resource = ImageSource.fromHtmlCanvasElement(canvas);
          this.shotGraphics.set(key, resource);
          if (this.shotGraphics.size > 256)
            this.shotGraphics.delete(this.shotGraphics.keys().next().value!);
        }
        if (!this.imageReady(resource)) {
          const prefix = shot.w + ':';
          const suffix = identity;
          const loaded = [...this.shotGraphics].find(
            ([cachedKey, image]) =>
              cachedKey.startsWith(prefix) && cachedKey.endsWith(suffix) && this.imageReady(image),
          );
          if (!loaded) return;
          resource = loaded[1];
        }
        const graphic = new Sprite({
          image: resource,
          destSize: { width: resource.width / state.zoom, height: resource.height / state.zoom },
        });
        const actor = this.bind(
          'shot:' + this.shotGeneration + ':' + index,
          shot.rx ?? shot.x,
          shot.ry ?? shot.y,
          35,
          graphic,
          live,
        );
        actor.rotation = Math.atan2(shot.vy, shot.vx);
      });
    }
    for (const [key, actor] of this.actors)
      if (!live.has(key)) {
        actor.kill();
        this.actors.delete(key);
      }
  }

  clear(): void {
    for (const actor of this.actors.values()) actor.kill();
    this.actors.clear();
    this.shotGraphics.clear();
    this.embellishments.clear();
    this.shotSnapshot = undefined;
  }
}
