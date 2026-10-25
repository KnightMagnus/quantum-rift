import { validIndustrialRequest } from '../shared/wire-actions.ts';
import type { Session } from './game.ts';
import type { IndustrialRequest, IndustrialWorld } from './industrial-contracts.ts';
import type { Entity, Space } from './space.ts';
type IndustrialCapabilities2 = import('./industrial-contracts.ts').IndustrialCapabilities;
export type { IndustrialCapabilities2 as C };
export type State = import('./industrial-contracts.ts').IndustrialShip;
export type Player = import('./refinery-contracts.ts').RefineryPlayer;
import {
  INDUSTRIAL as industrialRules,
  CORONA_BANDS,
  coronaAt,
  inSweep,
} from '../shared/industrial-rules.ts';
import { RECIPES } from '../shared/refinery-rules.ts';
import { planTake, applyTake, addLots, commonLots } from '../shared/cargo-lots.ts';

function state(playerData: Player): State {
  if (!playerData.ship.uid)
    playerData.ship.uid = `industrial-${playerData.name}-${(playerData.nextUid = (playerData.nextUid || 0) + 1)}`;
  const industrialShip = (playerData.ship.industrial ??= {
    version: 1,
    heat: 0,
    cutoff: false,
    workMs: 0,
    harvestMs: 0,
    outputs: {},
    recipe: 'alloy',
    grade: 'common',
    sweep: false,
    harvest: false,
    smelter: false,
    reason: 'OFF',
    inputs: { sweep: 0, smelter: 0, corona: 0 },
  });
  validate(industrialShip);
  return industrialShip;
}

function validate(industrialShip: State) {
  if (
    industrialShip.version !== 1 ||
    !['common', 'rich', 'pure'].includes(industrialShip.grade) ||
    !['alloy', 'cells', 'cut'].includes(industrialShip.recipe) ||
    ![industrialShip.heat, industrialShip.workMs, industrialShip.harvestMs].every(
      (count) => Number.isFinite(count) && count >= 0,
    ) ||
    industrialShip.heat > 300 ||
    industrialShip.workMs > 10000.001 ||
    industrialShip.harvestMs > 3000.001 ||
    ![
      industrialShip.cutoff,
      industrialShip.sweep,
      industrialShip.harvest,
      industrialShip.smelter,
    ].every((positionX) => typeof positionX === 'boolean') ||
    !industrialShip.inputs ||
    !Object.values(industrialShip.inputs).every(
      (count) => Number.isFinite(count) && count >= 0 && count <= 100,
    ) ||
    typeof industrialShip.reason !== 'string' ||
    !industrialShip.outputs ||
    Object.entries(industrialShip.outputs).some(
      ([entryKey, count]) =>
        !['alloy_ingots', 'fuel_cells', 'cut_crystal'].includes(entryKey) ||
        !Number.isSafeInteger(count) ||
        count < 0 ||
        count >= 300,
    )
  )
    throw Error('Invalid industrial ship save');
}
/**
 * Staged whole cargo + finite-source change, same checkpoint as existing player/world economy.
 */
function transaction(
  capabilities: IndustrialCapabilities2,
  session: Session,
  callback: (refineryPlayer: Player, industrialWorld: IndustrialWorld) => void,
) {
  if (capabilities.db.economicFrozen || capabilities.paused())
    throw Error('Industrial economy requires recovery or unpause');
  const playerData = session.data as Player,
    previousValue = {
      cargo: playerData.cargo,
      cargoLots: playerData.cargoLots,
      ship: playerData.ship,
    },
    world = capabilities.db.world.industrial;
  playerData.cargo = structuredClone(playerData.cargo);
  playerData.cargoLots = structuredClone(playerData.cargoLots);
  playerData.ship = structuredClone(playerData.ship);
  capabilities.db.world.industrial = structuredClone(world);
  try {
    callback(playerData as Player, capabilities.db.world.industrial as IndustrialWorld);
    capabilities.db.touch();
    capabilities.db.flush();
    capabilities.refresh(session);
  } catch (error) {
    if (!capabilities.db.economicFrozen) {
      Object.assign(playerData, previousValue);
      capabilities.db.world.industrial = world;
    }
    throw error;
  }
}

function drones(space: Space, entity: Entity) {
  return [...space.ships.values()].filter((entity2) => entity2.industrialRoot === entity.id);
}

function support(space: Space, entity: Entity, enabled: boolean) {
  const entitys = drones(space, entity);
  if (!enabled) {
    for (const entity of entitys) space.remove(entity);
    return;
  }
  for (let length2 = entitys.length; length2 < 2; length2++) {
    const entity3 = space.makeShip({
      hull: industrialRules.droneHull,
      owner: entity.id,
      x: entity.x + (length2 ? 55 : -55),
      y: entity.y + 30,
      ai: 'industrial',
      name: `Industrial collector ${length2 + 1}`,
      faction: entity.faction,
    });
    entity3.industrialRoot = entity.id;
    entity3.guns = [];
    entity3.strength = 0;
    entitys.push(entity3);
  }
}
export const IndustrialOperations = {
  init(this: IndustrialCapabilities2) {
    const industrialWorld = this.db.world.industrial;
    if (industrialWorld) {
      if (
        industrialWorld.version !== 1 ||
        !industrialWorld.sources ||
        Object.values(industrialWorld.sources).some(
          (positionX) =>
            !Number.isFinite(positionX.units) ||
            positionX.units < 0 ||
            positionX.units > industrialRules.sourceUnits ||
            !Number.isFinite(positionX.last) ||
            positionX.last < 0,
        )
      )
        throw Error('Invalid industrial world save');
    } else this.db.world.industrial = { version: 1, sources: {} };
    // Existing owned hulls retain heat/remainders, never requested automation across restart.
    for (const playerAccount of Object.values(this.db.players)) {
      for (const ship of [
        playerAccount.ship,
        ...(playerAccount.dock || []).map((storedShip) => storedShip.ship),
      ].filter(Boolean))
        if (ship.industrial) {
          validate(ship.industrial);
          ship.industrial.sweep = ship.industrial.harvest = ship.industrial.smelter = false;
        }
    }
    this.db.touch();
  },

  stop(this: IndustrialCapabilities2, session: Session) {
    const industrialShip = session.data?.ship?.industrial;
    if (industrialShip)
      industrialShip.sweep = industrialShip.harvest = industrialShip.smelter = false;
    this.db.touch();
  },

  command(this: IndustrialCapabilities2, session: Session, industrialRequest: IndustrialRequest) {
    try {
      if (
        session.data?.ship?.hull !== industrialRules.hull ||
        !session.ent ||
        session.ent.dead ||
        session.ent.state !== 'fly' ||
        session.data.stellar ||
        this.paused() ||
        this.db.economicFrozen
      )
        throw Error('Industrial controls require an active Star Dredge flight');
      if (!validIndustrialRequest(industrialRequest)) throw Error('Invalid industrial request');
      if (
        industrialRequest.op === 'recipe' &&
        (!['alloy', 'cells', 'cut'].includes(industrialRequest.recipe || '') ||
          !['common', 'rich', 'pure'].includes(industrialRequest.grade || ''))
      )
        throw Error('Choose a mobile recipe and exact input grade');
      if (
        ['sweep', 'smelter', 'harvest'].includes(industrialRequest.op!) &&
        (industrialRequest.recipe !== undefined || industrialRequest.grade !== undefined)
      )
        throw Error('Mode request has no economic fields');
      const industrialShip = state(session.data as Player);
      if (industrialRequest.op === 'off') {
        industrialShip.sweep = industrialShip.harvest = industrialShip.smelter = false;
      } else if (industrialRequest.op === 'recipe') {
        if (
          industrialShip.workMs > 0 &&
          (industrialRequest.recipe !== industrialShip.recipe ||
            industrialRequest.grade !== industrialShip.grade)
        ) {
          const input = RECIPES.find((recipe2) => recipe2.id === industrialShip.recipe)?.inputs[0];
          const player = session.data as Player;
          if (input && (player.cargoLots?.byCommodity[input]?.[industrialShip.grade] || 0) > 0)
            throw Error('Finish earned work before switching input recipe/grade');
          // Unreserved input can be traded/jettisoned. Discard time, never transfer it.
          industrialShip.workMs = 0;
          this.toast(
            session,
            'Previous input is gone: discarded partial smelter work; outputs retained',
          );
        }
        industrialShip.recipe = industrialRequest.recipe as string;
        industrialShip.grade = industrialRequest.grade as 'common' | 'rich' | 'pure';
      } else if (
        industrialRequest.op === 'sweep' ||
        industrialRequest.op === 'smelter' ||
        industrialRequest.op === 'harvest'
      ) {
        if (
          industrialRequest.op === 'harvest' &&
          !industrialShip.harvest &&
          (!coronaAt(session.data.sys, session.ent.x, session.ent.y) ||
            industrialShip.heat > 25 ||
            industrialShip.sweep ||
            industrialShip.smelter ||
            session.lastInput?.navigation ||
            session.ent.autoCombat)
        )
          throw Error(
            'Shallow bootstrap: enter marked band, heat ≤25, sweep/smelter/navigation OFF; leave outward within 10s after 15s harvest',
          );
        industrialShip[industrialRequest.op] = !industrialShip[industrialRequest.op];
      } else throw Error('Unknown industrial control');
      this.db.touch();
      this.refresh(session);
    } catch (error) {
      this.toast(session, String(error instanceof Error ? error.message : error));
    }
  },

  industrialTick(this: IndustrialCapabilities2, space: Space, deltaTime: number) {
    if (this.paused() || this.db.economicFrozen) return;
    if (!Number.isFinite(deltaTime) || deltaTime <= 0 || deltaTime > 1)
      throw Error('Invalid industrial timestep');
    const clock = this.db.world.mining?.clock || 0;
    // oxlint-disable-next-line unicorn/no-useless-spread -- Snapshot before callbacks mutate the live collection.
    for (const entity of [...space.ships.values()]) {
      if (!entity.player || entity.hull !== industrialRules.hull) continue;
      const session = entity.player.s,
        playerData = session.data as Player;
      let industrialShip = state(playerData);
      if (entity.dead || entity.disabled || entity.state !== 'fly' || playerData.stellar) {
        support(space, entity, false);
        continue;
      }
      const band = coronaAt(playerData.sys, entity.x, entity.y);
      if (session.lastInput?.navigation || entity.autoCombat || entity.towCap) {
        industrialShip.harvest = false;
      }
      if (industrialShip.heat >= industrialRules.cutoff) industrialShip.cutoff = true;
      if (industrialShip.cutoff && industrialShip.heat <= industrialRules.restart)
        industrialShip.cutoff = false;
      const forward = entity.vx * Math.sin(entity.a) - entity.vy * Math.cos(entity.a),
        room = this.room(playerData),
        recipe = RECIPES.find((recipe2) => recipe2.id === industrialShip.recipe),
        input = recipe?.inputs[0] || 'ore',
        have = playerData.cargoLots?.byCommodity[input]?.[industrialShip.grade] || 0,
        sweep =
          industrialShip.sweep &&
          !industrialShip.cutoff &&
          forward > industrialRules.minForward &&
          room > 0,
        smelt = industrialShip.smelter && !industrialShip.cutoff && have > 0,
        harvest = industrialShip.harvest && !industrialShip.cutoff && !!band && room > 0;
      // Special power changes heat demand only, capped 20%; never output, rate or drone count.
      const efficiency = Math.max(0.8, 1 - (this.power(playerData) - 1) * 0.1);
      industrialShip.inputs = {
        sweep: sweep ? industrialRules.sweepHeat * efficiency : 0,
        smelter: smelt ? industrialRules.smelterHeat * efficiency : 0,
        corona: band ? industrialRules.coronaHeat : 0,
      };
      const rate =
          industrialShip.inputs.sweep +
          industrialShip.inputs.smelter +
          industrialShip.inputs.corona -
          industrialRules.cooling,
        start = industrialShip.heat,
        work =
          rate > 0
            ? Math.max(0, Math.min(deltaTime, (industrialRules.cutoff - start) / rate))
            : deltaTime;
      industrialShip.heat = Math.max(0, Math.min(300, start + rate * deltaTime));
      // Once cutoff is reached, active demand ceases for remainder of the timestep.
      if (start < industrialRules.cutoff && industrialShip.heat >= industrialRules.cutoff) {
        industrialShip.heat =
          industrialRules.cutoff +
          (band ? industrialRules.coronaHeat - industrialRules.cooling : -industrialRules.cooling) *
            (deltaTime - work);
        industrialShip.cutoff = true;
        industrialShip.harvest = false;
      }
      const first = start < industrialRules.cutoff ? work : deltaTime,
        midpoint = start + rate * first;

      const exposure: (
        initialHeight: number,
        finalHeight: number,
        time: number,
        threshold: number,
      ) => number = (initialHeight, finalHeight, time, threshold): number =>
        initialHeight === finalHeight
          ? initialHeight >= threshold
            ? time
            : 0
          : initialHeight < threshold && finalHeight < threshold
            ? 0
            : initialHeight >= threshold && finalHeight >= threshold
              ? time
              : (time * Math.max(0, Math.max(initialHeight, finalHeight) - threshold)) /
                Math.abs(finalHeight - initialHeight);

      const above = (threshold: number) =>
        exposure(start, midpoint, first, threshold) +
        exposure(midpoint, industrialShip.heat, deltaTime - first, threshold);
      entity.shield = Math.max(
        0,
        entity.shield - industrialRules.shieldDrain * above(industrialRules.shield),
      );
      entity.armor = Math.max(
        0,
        entity.armor - industrialRules.hullDrain * above(industrialRules.critical),
      );
      if (entity.armor <= 0) {
        space.kill(entity);
        continue;
      }
      industrialShip.reason = industrialShip.cutoff
        ? 'THERMAL CUTOFF — cool to 65'
        : sweep
          ? 'SWEEP ACTIVE'
          : harvest
            ? 'HARVEST ACTIVE'
            : smelt
              ? 'SMELTER ACTIVE'
              : industrialShip.sweep && forward <= industrialRules.minForward
                ? 'SWEEP: move forward above 20'
                : room <= 0
                  ? 'HOLD FULL'
                  : band
                    ? 'ALL OFF'
                    : 'OFF / COOLING';
      if (
        band &&
        industrialRules.coronaHeat > industrialRules.cooling &&
        !sweep &&
        !smelt &&
        !harvest
      )
        industrialShip.reason += ' · CORONA HEATING — EXIT BAND';
      support(space, entity, sweep);
      if (sweep && work > 0) {
        // Root cap shared across ship and both drones, not one cap per collector.
        let damage = industrialRules.sweepDamage * work;
        for (const rock of space.rocks) {
          if (damage <= 0) break;
          if (!rock.down && inSweep(entity, rock, deltaTime)) {
            const spent = this.sweep(space, rock, damage, playerData.name);
            damage -= spent;
          }
        }
      }
      // Drones are physical noncombat collectors; deterministic sequential selection avoids duplicate acceptance.
      for (const [index, entity2] of drones(space, entity).entries()) {
        const target = space.loot.find(
          (floatingLoot) =>
            !floatingLoot.taken &&
            !floatingLoot.it.indexClaim &&
            !floatingLoot.it.indexTakenBy &&
            inSweep(entity, floatingLoot, deltaTime),
        );
        const targetX = target?.x ?? entity.x + (index ? 65 : -65),
          targetY = target?.y ?? entity.y + 40,
          distance = Math.hypot(targetX - entity2.x, targetY - entity2.y),
          travel = Math.min(distance, 180 * deltaTime);
        if (distance) {
          entity2.vx = ((targetX - entity2.x) / distance) * 180;
          entity2.vy = ((targetY - entity2.y) / distance) * 180;
          entity2.x += ((targetX - entity2.x) / distance) * travel;
          entity2.y += ((targetY - entity2.y) / distance) * travel;
        }
        if (target && distance < 35) {
          if (this.loot(entity.player, target.it) !== false) {
            target.taken = true;
            space.events.push(['pickup', target.id]);
          }
        }
      }
      if (harvest && work > 0 && band) {
        const industrialWorld = this.db.world.industrial as IndustrialWorld;
        const source = (industrialWorld.sources[band.id] ??= {
          units: industrialRules.sourceUnits,
          last: clock,
        });
        source.units = Math.min(
          industrialRules.sourceUnits,
          source.units + Math.max(0, clock - source.last) * industrialRules.renewPerSecond,
        );
        source.last = clock;
        if (source.units >= industrialRules.units) {
          industrialShip.harvestMs = Math.min(
            industrialRules.plasmaMs,
            industrialShip.harvestMs + work * 1000,
          );
        } else industrialShip.reason = 'PLASMA SOURCE RECOVERING';
        if (industrialShip.harvestMs >= industrialRules.plasmaMs - 1e-6) {
          transaction(this, session, (refineryPlayer, industrialWorld) => {
            const industrialShip = state(refineryPlayer),
              source = industrialWorld.sources[band.id];
            if (this.room(refineryPlayer) < 1 || source.units < industrialRules.units) return;
            addLots(refineryPlayer.cargo, refineryPlayer.cargoLots, commonLots('plasma', 1));
            source.units -= industrialRules.units;
            industrialShip.harvestMs = 0;
          });
        }
      }
      industrialShip = state(playerData);
      if (smelt && work > 0 && recipe) {
        industrialShip.workMs = Math.min(
          industrialRules.workMs,
          industrialShip.workMs + work * 1000,
        );
        if (industrialShip.workMs >= industrialRules.workMs - 1e-6)
          transaction(this, session, (refineryPlayer) => {
            const industrialShip = state(refineryPlayer),
              take = planTake(refineryPlayer.cargo, refineryPlayer.cargoLots, input, 1, {
                common: industrialShip.grade === 'common' ? 1 : 0,
                rich: industrialShip.grade === 'rich' ? 1 : 0,
                pure: industrialShip.grade === 'pure' ? 1 : 0,
              });
            applyTake(refineryPlayer.cargo, refineryPlayer.cargoLots, take);
            const units =
                (industrialShip.outputs[recipe.output] || 0) + industrialRules.outputPerInput,
              count = Math.floor(units / industrialRules.units);
            if (count > this.room(refineryPlayer)) throw Error('Mobile output capacity exhausted');
            if (count)
              addLots(
                refineryPlayer.cargo,
                refineryPlayer.cargoLots,
                commonLots(recipe.output, count),
              );
            industrialShip.outputs[recipe.output] = units % industrialRules.units;
            industrialShip.workMs = 0;
          });
      }
      this.db.touch();
    }
  },

  payload(this: IndustrialCapabilities2, session: Session) {
    if (session.data?.ship?.hull !== industrialRules.hull) return null;
    const industrialShip = state(session.data as Player),
      entity = session.ent,
      band = entity ? coronaAt(session.data.sys, entity.x, entity.y) : null;
    return {
      ship: session.data.ship.uid,
      ...structuredClone(industrialShip),
      band: band?.id || null,
      safeSeconds: Math.max(
        0,
        (industrialRules.cutoff - industrialShip.heat) /
          Math.max(
            0.1,
            industrialShip.inputs.corona +
              industrialShip.inputs.sweep +
              industrialShip.inputs.smelter -
              industrialRules.cooling,
          ),
      ),
      bands: CORONA_BANDS.filter((secondValue) => secondValue.sys === session.data.sys),
      stock:
        'Sweep/smelter OFF, heat 0: 15s productive + 10s outward exit margin; entry faces east.',
    };
  },
};
