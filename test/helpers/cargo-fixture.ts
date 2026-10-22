// Deliberate fixture replacement: production never repairs stale premium records.
import type { CargoOwner, CargoTotals } from '../../shared/cargo-contracts.ts';
import { migrateCargoLots } from '../../shared/cargo-lots.ts';
export function seedCargo(
  player: CargoOwner,
  cargo: { food?: number; ore?: number; metal?: string | number },
) {
  // Deliberately malformed saved quantities exercise migration validation.
  player.cargo = cargo as CargoTotals;
  delete player.cargoLots;
  migrateCargoLots(player);
}
