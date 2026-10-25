/** One dialog owner supplies its actions; the controller owns input arbitration. */
export interface OverlayPolicy {
  /** Existing dialog element ID. */
  id: string;
  /** Visual and keyboard priority; larger values sit above lower dialogs. */
  priority: number;
  /** Cancel without submitting a gameplay action. May refuse while committing. */
  dismiss: () => void;
  /** Safe initial native control, resolved after the owner renders its content. */
  initialFocus: () => HTMLElement | null;
  /**
   * Optional owner shortcut or pending-edit cancellation, before default dismissal.
   * Return true only when its native default was handled.
   */
  keyDown?: (event: KeyboardEvent) => boolean;
  /** Clear pending owner callbacks on logout without submitting or restoring focus. */
  reset?: () => void;
}

/** DOM visibility stays authoritative, including overlays not yet migrated. */
export class OverlayController {
  private policies = new Map<string, OverlayPolicy>();
  private returnFocus = new Map<string, HTMLElement | null>();
  private releaseInput = () => {};
  private started = false;

  register(policy: OverlayPolicy): void {
    if (this.policies.has(policy.id)) throw Error('Duplicate overlay owner: ' + policy.id);
    this.policies.set(policy.id, policy);
  }

  start(releaseInput: () => void): void {
    if (this.started) throw Error('Overlay controller already started');
    this.started = true;
    this.releaseInput = releaseInput;
    window.addEventListener('keydown', (event) => this.keyDown(event), true);
    const blockOutsideDialog = (event: Event) => {
      const top = this.top();
      if (
        top &&
        this.policies.has(top.id) &&
        event.target instanceof Node &&
        !top.contains(event.target)
      ) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    window.addEventListener('pointerdown', blockOutsideDialog, true);
    window.addEventListener('click', blockOutsideDialog, true);
  }

  open(id: string): void {
    const policy = this.policies.get(id);
    if (!policy) throw Error('Unregistered overlay: ' + id);
    const element = document.getElementById(id)!;
    if (!this.returnFocus.has(id))
      this.returnFocus.set(id, document.activeElement as HTMLElement | null);
    element.style.zIndex = String(policy.priority);
    element.classList.remove('hidden');
    this.releaseInput();
    if (this.top() === element) policy.initialFocus()?.focus({ preventScroll: true });
  }

  close(id: string): void {
    document.getElementById(id)!.classList.add('hidden');
    const returnTo = this.returnFocus.get(id);
    this.returnFocus.delete(id);
    const top = this.top();
    if (returnTo?.isConnected && !returnTo.closest('.hidden') && (!top || top.contains(returnTo)))
      returnTo.focus({ preventScroll: true });
  }

  /** Drop references during account teardown without focusing former-account UI. */
  reset(): void {
    this.returnFocus.clear();
    for (const policy of this.policies.values()) {
      document.getElementById(policy.id)!.classList.add('hidden');
      policy.reset?.();
    }
  }

  blocksFlight(): boolean {
    return !!document.querySelector('.overlay:not(.hidden):not(#land)');
  }

  /** Migrated dialogs own all shortcuts, including closing a map underneath them. */
  hasExclusiveDialog(): boolean {
    const top = this.top();
    return !!top && this.policies.has(top.id);
  }

  private top(): HTMLElement | null {
    let top: HTMLElement | null = null;
    let priority = -Infinity;
    for (const element of document.querySelectorAll<HTMLElement>(
      '.overlay:not(.hidden):not(#land)',
    )) {
      const current =
        this.policies.get(element.id)?.priority ?? (Number(getComputedStyle(element).zIndex) || 0);
      if (current >= priority) {
        top = element;
        priority = current;
      }
    }
    return top;
  }

  private keyDown(event: KeyboardEvent): void {
    const top = this.top();
    const policy = top && this.policies.get(top.id);
    // Unmigrated overlays keep their existing keyboard owners.
    if (!policy || !top) return;
    event.stopImmediatePropagation();
    if (policy.keyDown?.(event)) {
      event.preventDefault();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      if (!event.repeat) policy.dismiss();
    } else if (event.key === 'Tab') {
      const controls = [
        ...top.querySelectorAll<HTMLElement>(
          'button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled), a[href], [tabindex="0"]',
        ),
      ].filter((element) => element.getClientRects().length > 0);
      const first = controls[0],
        last = controls.at(-1);
      if (
        !top.contains(document.activeElement) ||
        (event.shiftKey && document.activeElement === first) ||
        (!event.shiftKey && document.activeElement === last)
      ) {
        event.preventDefault();
        (event.shiftKey ? last : first)?.focus();
      }
    }
  }
}

export const overlays = new OverlayController();
