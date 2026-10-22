export interface CargoMission {
  readonly type: string;
  readonly qty?: number;
}

export interface CargoManifest {
  readonly cargo: Readonly<Record<string, number>>;
  readonly missions?: readonly CargoMission[] | null;
}

/** Delivery and smuggling cargo reserves hold space; supply cargo is bought separately. */
export function reservedCargoTonnes(missions?: readonly CargoMission[] | null): number {
  return (missions || [])
    .filter((mission) => mission.type === 'cargo' || mission.type === 'smuggle')
    .reduce((total, mission) => total + (mission.qty || 0), 0);
}

export function commodityCargoTonnes(cargo: Readonly<Record<string, number>>): number {
  return Object.values(cargo).reduce((total, quantity) => total + quantity, 0);
}

/** A snapshot of hold allocation, not an inventory owner or permission to load cargo. */
export class ShipCapacity {
  readonly capacity: number;
  readonly commodityTonnes: number;
  readonly reservedMissionTonnes: number;

  constructor(capacity: number, commodityTonnes: number, reservedMissionTonnes: number) {
    this.capacity = capacity;
    this.commodityTonnes = commodityTonnes;
    this.reservedMissionTonnes = reservedMissionTonnes;
    Object.freeze(this);
  }

  static fromManifest(capacity: number, manifest: CargoManifest): ShipCapacity {
    return new ShipCapacity(
      capacity,
      commodityCargoTonnes(manifest.cargo),
      reservedCargoTonnes(manifest.missions),
    );
  }

  get used(): number {
    return this.commodityTonnes + this.reservedMissionTonnes;
  }

  /** Signed so an over-capacity load remains distinguishable from an exactly full hold. */
  get remaining(): number {
    return this.capacity - this.commodityTonnes - this.reservedMissionTonnes;
  }

  get available(): number {
    return Math.max(0, this.remaining);
  }
}
