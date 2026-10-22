import type { DocksCapabilities, HangarCapabilities } from '../../server/features.ts';
import type { SavedSurvey } from '../../server/mining-contracts.ts';
import type { OfficerRecord } from '../../shared/rules.ts';
import type { RawStellarBody } from '../../shared/galaxy.ts';
import type { ArmadaState } from '../../server/db.ts';
import type { SavedDockWing } from '../../server/save-contracts.ts';
import type { PlayerAccount } from '../../server/db.ts';
import type { Game, Session, PlayerData, Mission } from '../../server/game.ts';
import type { Entity, Space } from '../../server/space.ts';
import type { ComputedShipStats } from '../../shared/rules.ts';

/** Fields supplied by a unit mock are checked; constructor-owned fields outside the scenario are omitted. */
export type FixtureShape<Value> = Value extends (...parameters: infer Parameters) => infer Result
  ? (...parameters: Parameters) => FixtureShape<Result>
  : Value extends ReadonlyMap<infer Key, infer Entry>
    ? Map<Key, FixtureShape<Entry>>
    : Value extends Set<infer Entry>
      ? Set<Entry>
      : Value extends (infer Entry)[]
        ? FixtureShape<Entry>[]
        : Value extends readonly (infer Entry)[]
          ? readonly FixtureShape<Entry>[]
          : Value extends object
            ? { [Key in keyof Value]?: FixtureShape<Value[Key]> }
            : Value;

// These deliberate unit boundaries do not claim to construct complete live objects.
export const mockGame = (value: FixtureShape<Game>): Game => value as Game;
export const mockSpace = (value: FixtureShape<Space>): Space => value as Space;
export const mockEntity = (value: FixtureShape<Entity>): Entity => value as Entity;
export const mockSession = (value: FixtureShape<Session>): Session => value as Session;
export const mockShipStats = (value: FixtureShape<ComputedShipStats>): ComputedShipStats =>
  value as ComputedShipStats;
export const mockWeaponMount = (
  value: Omit<FixtureShape<Entity['guns'][number]>, 'snd'> & { snd?: string | number },
): Entity['guns'][number] => value as Entity['guns'][number];
export const mockPlayerReference = (
  value: FixtureShape<NonNullable<Entity['player']>>,
): NonNullable<Entity['player']> => value as NonNullable<Entity['player']>;
export const mockStation = (
  value: FixtureShape<Session['data']['station']>,
): Session['data']['station'] => value as Session['data']['station'];
export const mockMission = (value: FixtureShape<Mission>): Mission => value as Mission;
export const mockRivals = (
  value: FixtureShape<Game['features']['rivals']>,
): Game['features']['rivals'] => value as Game['features']['rivals'];
export const mockPlayerData = (value: FixtureShape<PlayerData>): PlayerData => value as PlayerData;
export const mockSavedDockWing = (value: FixtureShape<SavedDockWing>): SavedDockWing =>
  value as SavedDockWing;
export const mockPlayerAccount = (value: FixtureShape<PlayerAccount>): PlayerAccount =>
  value as PlayerAccount;
export const mockRawStellarBody = (value: FixtureShape<RawStellarBody>): RawStellarBody =>
  value as RawStellarBody;
export const mockArmadaState = (value: FixtureShape<ArmadaState>): ArmadaState =>
  value as ArmadaState;
export const mockSavedSurvey = (value: FixtureShape<SavedSurvey>): SavedSurvey =>
  value as SavedSurvey;
export const mockOfficer = (value: FixtureShape<OfficerRecord>): OfficerRecord =>
  value as OfficerRecord;
export const mockCanvasContext = (
  value: FixtureShape<CanvasRenderingContext2D>,
): CanvasRenderingContext2D => value as unknown as CanvasRenderingContext2D;
export const mockFronts = (
  value: FixtureShape<Game['features']['fronts']>,
): Game['features']['fronts'] => value as Game['features']['fronts'];
export const mockDocksHost = (
  value: FixtureShape<DocksCapabilities & HangarCapabilities> & Partial<Pick<Game, 'O'>>,
): DocksCapabilities & HangarCapabilities & Pick<Game, 'portService'> =>
  value as DocksCapabilities & HangarCapabilities & Pick<Game, 'portService'>;
