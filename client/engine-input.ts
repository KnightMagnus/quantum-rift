import { Keys } from 'excalibur';
import type { Engine } from 'excalibur';

const keyCodes = new Set<string>(Object.values(Keys));
/** Saved browser key codes map directly to the engine's physical-key enum values. */
export class FlightInput {
  private pointerButtons = 0;
  get pointerHeld(): boolean {
    return !!(this.pointerButtons & 1);
  }
  private pending = new Set<string>();
  private blocked = new Set<string>();
  private engine: Engine;
  constructor(engine: Engine) {
    this.engine = engine;
    // Raw button state is only a safety latch, not a second command dispatcher.
    window.addEventListener(
      'pointerdown',
      (event) => {
        this.pointerButtons = event.buttons;
      },
      true,
    );
    window.addEventListener(
      'pointerup',
      (event) => {
        this.pointerButtons = event.buttons;
      },
      true,
    );
    window.addEventListener(
      'pointercancel',
      () => {
        this.pointerButtons = 0;
      },
      true,
    );
    const clear = () => this.clear();
    window.addEventListener('blur', clear);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) clear();
    });
    engine.input.keyboard.on('press', (event) => {
      const target = event.originalEvent?.target;
      const editing =
        target instanceof HTMLElement &&
        (target.matches('input, textarea, select') || target.isContentEditable);
      if (
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
  clear(): void {
    this.pointerButtons = 0;
    this.pending.clear();
    for (const key of this.engine.input.keyboard.getKeys()) this.blocked.add(key);
  }
}
