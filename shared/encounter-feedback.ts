/** Recipient-visible encounter state; positions and deadlines come from current simulation state. */
export interface EncounterFeedback {
  /** Live actor identity. */
  id: number;
  /** Current disclosed actor name. */
  name: string;
  /** Remaining combined shield and armor fraction. */
  health: number;
  /** World-space center of the actor and any range telegraph. */
  x: number;
  /** World-space vertical center. */
  y: number;
  /** An active, cancellable ability windup; absent for ordinary weapon attacks. */
  ability?: {
    /** Actual attack or call, not an estimated next attack. */
    name: string;
    /** Remaining simulation seconds in the active windup. */
    seconds: number;
    /** Range boundary centered on the actor; leaving it avoids or breaks the ability. */
    radius: number;
  };
}
