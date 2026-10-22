// Derive sprite roll from heading samples, not the number of display frames between snapshots.
// The slowest stock capital hull turns at 0.471 rad/s. Keep activation well
// below that rate, but above milliradian snapshot quantization noise (~0.015).
const ENTER_RATE = 0.2;
const EXIT_RATE = 0.1;
const FILTER_MS = 120;
const STALE_MS = 250;

export interface BankState {
  angle: number;
  at: number;
  drawAt: number;
  rate: number;
  bank: number;
}
export interface BankingEntity {
  a: number;
  t?: number;
  _bank?: BankState;
}
export function shipBank(bankingEntity: BankingEntity, currentTime: number, predicted = false) {
  const sampleAt = predicted || !Number.isFinite(bankingEntity.t) ? currentTime : bankingEntity.t!;
  let state = bankingEntity._bank;
  if (!state || sampleAt < state.at || currentTime - state.drawAt > 500) {
    bankingEntity._bank = {
      angle: bankingEntity.a,
      at: sampleAt,
      drawAt: currentTime,
      rate: 0,
      bank: 0,
    };
    return 0;
  }
  state.drawAt = currentTime;
  if (sampleAt > state.at) {
    const deltaTime = sampleAt - state.at;
    const delta = Math.atan2(
      Math.sin(bankingEntity.a - state.angle),
      Math.cos(bankingEntity.a - state.angle),
    );
    const blend = 1 - Math.exp(-deltaTime / FILTER_MS);
    state.rate += ((delta * 1000) / deltaTime - state.rate) * blend;
    state.angle = bankingEntity.a;
    state.at = sampleAt;
  }
  // A stopped/lost stream must not leave a ship permanently rolled.
  if (currentTime - state.at > STALE_MS) state.rate = 0;
  if (state.rate > ENTER_RATE) state.bank = 1;
  else if (state.rate < -ENTER_RATE) state.bank = 2;
  else if (Math.abs(state.rate) < EXIT_RATE) state.bank = 0;
  return state.bank;
}
