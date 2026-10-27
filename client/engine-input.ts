import { Keys } from 'excalibur';
import type { Engine } from 'excalibur';

const keyCodes = new Set<string>(Object.values(Keys));
/** Saved browser key codes map directly to the engine's physical-key enum values. */
export class FlightInput {
  private pointerButtons = 0;
  private lifetime = new AbortController();
  get pointerHeld(): boolean {
    return !!(this.pointerButtons & 1);
  }
  private pending = new Set<string>();
  private blocked = new Set<string>();
  private engine: Engine;
  private contextBlocked: () => boolean;
  constructor(engine: Engine, contextBlocked: () => boolean = () => false) {
    this.contextBlocked = contextBlocked;
    this.engine = engine;
    // Raw button state is only a safety latch, not a second command dispatcher.
    window.addEventListener(
      'pointerdown',
      (event) => {
        this.pointerButtons = event.buttons;
      },
      { capture: true, signal: this.lifetime.signal },
    );
    window.addEventListener(
      'pointerup',
      (event) => {
        this.pointerButtons = event.buttons;
      },
      { capture: true, signal: this.lifetime.signal },
    );
    window.addEventListener(
      'pointercancel',
      () => {
        this.pointerButtons = 0;
      },
      { capture: true, signal: this.lifetime.signal },
    );
    const clear = () => this.clear();
    window.addEventListener('blur', clear, { signal: this.lifetime.signal });
    document.addEventListener(
      'visibilitychange',
      () => {
        if (document.hidden) clear();
      },
      { signal: this.lifetime.signal },
    );
    engine.input.keyboard.on('press', (event) => {
      // A held key first observed after a renderer/focus transition is not a fresh press.
      if (event.originalEvent?.repeat) {
        this.blocked.add(event.key);
        return;
      }
      const target = event.originalEvent?.target;
      const editing =
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') || target.isContentEditable);
      if (
        this.contextBlocked() ||
        editing ||
        !document.getElementById('opts')?.classList.contains('hidden') ||
        !document.getElementById('login')?.classList.contains('hidden')
      ) {
        this.blocked.add(event.key);
        return;
      }
      if (!event.originalEvent?.repeat) this.pending.add(event.key);
    });
    engine.input.keyboard.on('release', (event) => this.blocked.delete(event.key));
  }
  held(code: string | null | undefined): boolean {
    if (this.contextBlocked()) {
      this.clear();
      return false;
    }
    return (
      !!code &&
      keyCodes.has(code) &&
      !this.blocked.has(code) &&
      (this.pending.has(code) || this.engine.input.keyboard.isHeld(code as Keys))
    );
  }
  consumeTick(): void {
    this.pending.clear();
  }
  /** A replacement renderer must not treat autorepeat as a fresh manual press. */
  blockUntilRelease(codes: readonly string[]): void {
    for (const code of codes) this.blocked.add(code);
  }
  /** Remove browser safety-latch listeners when a presentation engine is replaced. */
  dispose(): void {
    this.clear();
    this.lifetime.abort();
  }
  clear(): void {
    this.pointerButtons = 0;
    this.pending.clear();
    for (const key of this.engine.input.keyboard.getKeys()) this.blocked.add(key);
  }
}
