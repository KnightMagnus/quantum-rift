// Derive sprite roll from heading samples, not the number of display frames between snapshots.
const ENTER_RATE = 0.55;
const EXIT_RATE = 0.3;
const FILTER_MS = 120;
const STALE_MS = 250;

export function shipBank(e, now, predicted = false) {
  const sampleAt = predicted || !Number.isFinite(e.t) ? now : e.t;
  let state = e._bank;
  if (!state || sampleAt < state.at || now - state.drawAt > 500) {
    e._bank = { angle: e.a, at: sampleAt, drawAt: now, rate: 0, bank: 0 };
    return 0;
  }
  state.drawAt = now;
  if (sampleAt > state.at) {
    const dt = sampleAt - state.at;
    const delta = Math.atan2(Math.sin(e.a - state.angle), Math.cos(e.a - state.angle));
    const blend = 1 - Math.exp(-dt / FILTER_MS);
    state.rate += ((delta * 1000) / dt - state.rate) * blend;
    state.angle = e.a;
    state.at = sampleAt;
  }
  // A stopped/lost stream must not leave a ship permanently rolled.
  if (now - state.at > STALE_MS) state.rate = 0;
  if (state.rate > ENTER_RATE) state.bank = 1;
  else if (state.rate < -ENTER_RATE) state.bank = 2;
  else if (Math.abs(state.rate) < EXIT_RATE) state.bank = 0;
  return state.bank;
}
