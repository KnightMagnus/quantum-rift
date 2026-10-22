// Deliberate fixture replacement: production never repairs stale premium records.
import { migrateCargoLots } from '../../shared/cargo-lots.ts';
export function seedCargo(player, cargo) {
  player.cargo = cargo;
  delete player.cargoLots;
  migrateCargoLots(player);
}
