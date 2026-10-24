import { validTowingRequest, validTowingAuthority } from '../shared/wire-actions.ts';
import type { RefineryPlayer } from './refinery-contracts.ts';
import type { Space } from './space.ts';
import type { TowRequest } from './towing-contracts.ts';
type TowCapabilities2 = import('./towing-contracts.ts').TowCapabilities;
export type { TowCapabilities2 as C };
type TowWorld2 = import('./towing-contracts.ts').TowWorld;
export type { TowWorld2 as W };
export type ObjectRecord = import('./towing-contracts.ts').Motherlode;
export type Session = import('./towing-contracts.ts').Session;
import { SYS as systemsById, STELLARS } from '../shared/galaxy.ts';
import { TOW as towingRules, towSpeed } from '../shared/towing-rules.ts';
import { addLots, assertLots } from '../shared/cargo-lots.ts';

class DeliveryHoldFull extends Error {}

const deliveryNotices: WeakMap<Session, string> = new WeakMap();

function state(capabilities: TowCapabilities2): TowWorld2 {
  const towWorld = capabilities.db.world.towing;
  if (!towWorld) throw Error('Towing unavailable');
  return towWorld;
}

function currentTime(capabilities: TowCapabilities2) {
  return capabilities.db.world.mining?.clock || 0;
}

function entryKey2(capabilities: TowCapabilities2, session: Session) {
  return capabilities.db.key(session.data.name);
}

function active(motherlode: ObjectRecord) {
  return motherlode.status === 'attached';
}

function attached(capabilities: TowCapabilities2, session: Session) {
  return state(capabilities)
    .slots.map((towSlot) => towSlot.object)
    .find(
      (motherlode) =>
        motherlode && active(motherlode) && motherlode.owner === entryKey2(capabilities, session),
    );
}

function flight(capabilities: TowCapabilities2, session: Session) {
  const entity = session.ent,
    computedShipStats = capabilities.stats(session.data);
  if (
    capabilities.paused() ||
    capabilities.db.economicFrozen ||
    !entity ||
    entity.dead ||
    entity.disabled ||
    entity.state !== 'fly' ||
    session.data.stellar
  )
    throw Error('Towing requires a living active flight and recovered economy');
  if (
    !session.data.ship.uid ||
    !computedShipStats?.towRig ||
    computedShipStats.cargo < towingRules.minCargo ||
    entity.fighterOf ||
    entity.wormExit
  )
    throw Error('Fit a Tow Rig on a cargo hull of at least 60t (stock Dredge included)');
  return entity;
}

function validate(towWorld: TowWorld2) {
  if (
    towWorld.version !== 1 ||
    !Number.isSafeInteger(towWorld.nextId) ||
    towWorld.nextId < 1 ||
    !Array.isArray(towWorld.slots) ||
    !Array.isArray(towWorld.receipts) ||
    !Array.isArray(towWorld.offers) ||
    towWorld.receipts.length > towingRules.receiptLimit ||
    towWorld.offers.length > towWorld.slots.length
  )
    throw Error('Invalid towing schema');
  const identifiers = new Set(),
    owners = new Set(),
    ships = new Set(),
    keys = new Set();
  for (const slot of towWorld.slots) {
    if (
      keys.has(slot.key) ||
      !systemsById[slot.sys]?.fields?.[slot.field] ||
      slot.key !== `${slot.sys}:${slot.field}` ||
      !Number.isSafeInteger(slot.field) ||
      slot.field < 0 ||
      slot.field >= 3 ||
      slot.issued !== slot.epoch * towingRules.mass ||
      ![slot.epoch, slot.issued, slot.delivered, slot.discarded].every(
        (count) => Number.isSafeInteger(count) && count >= 0,
      ) ||
      !Number.isFinite(slot.nextAt) ||
      slot.nextAt < 0
    )
      throw Error('Invalid tow source');
    keys.add(slot.key);
    const motherlode = slot.object;
    let reserved = 0;
    if (motherlode) {
      if (
        !Number.isSafeInteger(motherlode.id) ||
        motherlode.id < 1 ||
        motherlode.id >= towWorld.nextId ||
        identifiers.has(motherlode.id) ||
        motherlode.epoch !== slot.epoch ||
        motherlode.epoch < 1 ||
        motherlode.slot !== slot.key ||
        motherlode.sys !== slot.sys ||
        motherlode.mass !== towingRules.mass ||
        !['ore', 'gas', 'shards'].includes(motherlode.ore) ||
        !['available', 'attached', 'detached', 'delivered', 'destroyed'].includes(
          motherlode.status,
        ) ||
        !Number.isSafeInteger(motherlode.revision) ||
        motherlode.revision < 1 ||
        !Number.isFinite(motherlode.graceUntil) ||
        motherlode.graceUntil < 0 ||
        ![motherlode.x, motherlode.y, motherlode.vx, motherlode.vy, motherlode.hp].every(
          Number.isFinite,
        ) ||
        motherlode.hp < 0 ||
        motherlode.hp > 100 ||
        !Array.isArray(motherlode.acceptPorts) ||
        !motherlode.acceptPorts.length ||
        motherlode.acceptPorts.some(
          (position) =>
            STELLARS[position]?.system !== motherlode.sys ||
            !STELLARS[position]?.svc?.includes('L'),
        )
      )
        throw Error('Invalid motherlode');
      if (
        !motherlode.lots ||
        Object.keys(motherlode.lots).sort().join() !== 'common,pure,rich' ||
        Object.values(motherlode.lots).some((count) => !Number.isSafeInteger(count) || count < 0) ||
        Object.values(motherlode.lots).reduce(
          (firstValue, secondValue) => firstValue + secondValue,
          0,
        ) !== motherlode.mass
      )
        throw Error('Invalid motherlode mass/grades');
      if (
        (motherlode.owner !== null &&
          (typeof motherlode.owner !== 'string' ||
            !motherlode.owner ||
            motherlode.owner !== motherlode.owner.trim().toLowerCase())) ||
        (motherlode.ship !== null && (typeof motherlode.ship !== 'string' || !motherlode.ship))
      )
        throw Error('Invalid tow identity');
      if (active(motherlode)) {
        if (
          !motherlode.owner ||
          !motherlode.ship ||
          motherlode.graceUntil !== 0 ||
          owners.has(motherlode.owner) ||
          ships.has(motherlode.owner + ':' + motherlode.ship)
        )
          throw Error('Duplicate tow owner/hull');
        owners.add(motherlode.owner);
        ships.add(motherlode.owner + ':' + motherlode.ship);
      }
      if (
        motherlode.status === 'available' &&
        (motherlode.owner !== null || motherlode.ship !== null || motherlode.graceUntil !== 0)
      )
        throw Error('Invalid available owner');
      if (motherlode.status === 'detached' && (!motherlode.owner || !motherlode.ship))
        throw Error('Invalid detached owner');
      if (
        (motherlode.status === 'delivered' || motherlode.status === 'destroyed') &&
        motherlode.hp !== (motherlode.status === 'destroyed' ? 0 : 100)
      )
        throw Error('Invalid terminal object');
      identifiers.add(motherlode.id);
      if (!['delivered', 'destroyed'].includes(motherlode.status)) reserved = motherlode.mass;
    }
    if (slot.issued !== slot.delivered + slot.discarded + reserved)
      throw Error('Tow source conservation failure');
  }
  const receipts = new Set();
  for (const towReceipt of towWorld.receipts) {
    if (
      !Number.isSafeInteger(towReceipt.id) ||
      towReceipt.id < 1 ||
      towReceipt.id >= towWorld.nextId ||
      receipts.has(towReceipt.id) ||
      typeof towReceipt.owner !== 'string' ||
      !towReceipt.owner ||
      towReceipt.owner !== towReceipt.owner.trim().toLowerCase() ||
      !STELLARS[towReceipt.port] ||
      !['ore', 'gas', 'shards'].includes(towReceipt.ore) ||
      towReceipt.mass !== towingRules.mass ||
      Object.keys(towReceipt.lots || {})
        .sort()
        .join() !== 'common,pure,rich' ||
      Object.values(towReceipt.lots).some((count) => !Number.isSafeInteger(count) || count < 0) ||
      Object.values(towReceipt.lots).reduce(
        (firstValue, secondValue) => firstValue + secondValue,
        0,
      ) !== towReceipt.mass
    )
      throw Error('Invalid tow receipt');
    const live = towWorld.slots.find((towSlot) => towSlot.object?.id === towReceipt.id)?.object;
    if (
      live &&
      (live.status !== 'delivered' ||
        live.owner !== towReceipt.owner ||
        live.ore !== towReceipt.ore ||
        JSON.stringify(live.lots) !== JSON.stringify(towReceipt.lots))
    )
      throw Error('Invalid receipt/object correspondence');
    receipts.add(towReceipt.id);
  }
  const offerIds = new Set();
  for (const offer of towWorld.offers) {
    const motherlode = towWorld.slots.find((towSlot) => towSlot.object?.id === offer.id)?.object;
    if (
      offerIds.has(offer.id) ||
      !motherlode ||
      !active(motherlode) ||
      motherlode.owner !== offer.from ||
      motherlode.ship !== offer.fromShip ||
      motherlode.revision !== offer.revision ||
      !Number.isFinite(offer.until) ||
      offer.until < 0 ||
      !Number.isSafeInteger(offer.revision) ||
      !offer.from ||
      !offer.to ||
      offer.from === offer.to ||
      !offer.fromShip ||
      !offer.toShip ||
      !Number.isSafeInteger(offer.fromEntity) ||
      !Number.isSafeInteger(offer.toEntity)
    )
      throw Error('Invalid tow offer');
    offerIds.add(offer.id);
  }
}

function release(capabilities: TowCapabilities2, motherlode: ObjectRecord) {
  if (!active(motherlode)) return;
  motherlode.status = 'detached';
  motherlode.graceUntil = currentTime(capabilities) + towingRules.grace;
  motherlode.revision++;
  motherlode.vx = motherlode.vy = 0;
  state(capabilities).offers = state(capabilities).offers.filter(
    (towOffer) => towOffer.id !== motherlode.id,
  );
}

function transaction(capabilities: TowCapabilities2, session: Session, callback: () => void) {
  if (capabilities.db.economicFrozen || capabilities.paused())
    throw Error('Towing economy requires recovery/unpause');
  const playerData = session.data as RefineryPlayer,
    previousValue = { cargo: playerData.cargo, cargoLots: playerData.cargoLots },
    towWorld = capabilities.db.world.towing;
  playerData.cargo = structuredClone(playerData.cargo);
  playerData.cargoLots = structuredClone(playerData.cargoLots);
  capabilities.db.world.towing = structuredClone(towWorld);
  try {
    callback();
    assertLots(playerData.cargo, playerData.cargoLots);
    validate(state(capabilities));
    capabilities.db.touch();
    capabilities.db.flush();
  } catch (error) {
    if (!capabilities.db.economicFrozen) {
      Object.assign(playerData, previousValue);
      capabilities.db.world.towing = towWorld;
    }
    throw error;
  }
}
/**
 * Load-centred collection radius: the port body plus its existing 180-unit approach apron.
 */
function crossesPort(
  position: { x: number; y: number },
  firstValue: { x: number; y: number },
  secondValue: { x: number; y: number },
) {
  const deltaX = secondValue.x - firstValue.x,
    deltaY = secondValue.y - firstValue.y;
  const time = Math.max(
    0,
    Math.min(
      1,
      ((position.x - firstValue.x) * deltaX + (position.y - firstValue.y) * deltaY) /
        (deltaX * deltaX + deltaY * deltaY || 1),
    ),
  );
  return Math.hypot(
    firstValue.x + deltaX * time - position.x,
    firstValue.y + deltaY * time - position.y,
  );
}
/**
 * Shared by explicit delivery and the authoritative physics tick. Never accepts client coordinates.
 */
function deliver(
  capabilities: TowCapabilities2,
  session: Session,
  motherlode: ObjectRecord,
  port: string,
  previous: { x: number; y: number } = motherlode,
) {
  const entity = flight(capabilities, session),
    stellarBody = STELLARS[port];
  if (
    !active(motherlode) ||
    motherlode.owner !== entryKey2(capabilities, session) ||
    motherlode.ship !== session.data.ship.uid
  )
    throw Error('Only current tow owner may deliver');
  if (
    !stellarBody ||
    !motherlode.acceptPorts.includes(stellarBody.id) ||
    stellarBody.system !== motherlode.sys ||
    crossesPort(stellarBody, previous, motherlode) > stellarBody.r + towingRules.deliveryApron
  )
    throw Error('Bring the motherlode into an accepted port collection zone');
  const pass = (session.data as RefineryPlayer).landPass?.[stellarBody.id] || 0;
  if (
    !stellarBody.outlaw &&
    (session.data.rep?.[systemsById[motherlode.sys].faction] || 0) <= -30 &&
    pass <= Date.now()
  )
    throw Error('Port refuses delivery permission');
  if (capabilities.room(session.data) < motherlode.mass)
    throw new DeliveryHoldFull(`Need ${motherlode.mass}t free hold; store cargo or detach first`);
  transaction(capabilities, session, () => {
    const towWorld = state(capabilities),
      towSlot = towWorld.slots.find((towSlot) => towSlot.object?.id === motherlode.id);
    if (!towSlot?.object) throw Error('Missing source');
    addLots(
      (session.data as RefineryPlayer).cargo,
      (session.data as RefineryPlayer).cargoLots,
      { cid: motherlode.ore, qty: motherlode.mass, grades: { ...motherlode.lots } },
      capabilities.room(session.data),
    );
    towSlot.object.status = 'delivered';
    towSlot.object.revision++;
    towSlot.delivered += motherlode.mass;
    towSlot.nextAt =
      currentTime(capabilities) +
      towingRules.recovery * capabilities.field(motherlode.sys, towSlot.field).factor;
    towWorld.offers = towWorld.offers.filter((towOffer) => towOffer.id !== motherlode.id);
    towWorld.receipts.push({
      id: motherlode.id,
      owner: entryKey2(capabilities, session),
      port: stellarBody.id,
      ore: motherlode.ore,
      lots: { ...motherlode.lots },
      mass: motherlode.mass,
    });
    towWorld.receipts = towWorld.receipts.slice(-towingRules.receiptLimit);
  });
  entity.towCap = undefined;
  capabilities.toast(
    session,
    `Motherlode delivered: ${motherlode.mass}t ${motherlode.ore}; no second credit/fragment reward.`,
  );
}

function ensure(capabilities: TowCapabilities2, starSystem: string) {
  if (capabilities.db.economicFrozen || capabilities.paused()) return;
  const towWorld = state(capabilities),
    starSystem2 = systemsById[starSystem];
  if (!starSystem2 || starSystem2.arena || !starSystem2.fields?.length) return;
  const ports = starSystem2.stellars
    .filter(
      (stellarBody) =>
        stellarBody.svc?.includes('L') &&
        !stellarBody.site &&
        !stellarBody.wormhole &&
        !stellarBody.outlaw,
    )
    .map((stellarBody) => stellarBody.id);
  if (!ports.length) return;
  // One separately authored finite source per field, capped at three. Never a normal-rock copy.
  for (const [index, factionId] of starSystem2.fields.slice(0, 3).entries()) {
    const slotKey = `${starSystem}:${index}`;
    let slot = towWorld.slots.find((towSlot) => towSlot.key === slotKey);
    if (!slot) {
      slot = {
        key: slotKey,
        sys: starSystem,
        field: index,
        epoch: 0,
        issued: 0,
        delivered: 0,
        discarded: 0,
        nextAt: 0,
        object: null,
      };
      towWorld.slots.push(slot);
    }
    if (slot.object && !['delivered', 'destroyed'].includes(slot.object.status)) continue;
    if (currentTime(capabilities) < slot.nextAt) continue;
    // IDs and accumulated conservation counters must never wrap into stale authority.
    if (
      towWorld.nextId >= Number.MAX_SAFE_INTEGER ||
      slot.issued > Number.MAX_SAFE_INTEGER - towingRules.mass
    )
      continue;
    // Lazy wake issues at most one current finite object, never accumulated offline rewards.
    slot.epoch++;
    slot.issued += towingRules.mass;
    slot.object = {
      id: towWorld.nextId++,
      epoch: slot.epoch,
      slot: slotKey,
      sys: starSystem,
      x: factionId.x + 120,
      y: factionId.y,
      vx: 0,
      vy: 0,
      mass: towingRules.mass,
      ore: ['ore', 'gas', 'shards'][index % 3],
      lots: { common: 18, rich: 5, pure: 1 },
      hp: 100,
      status: 'available',
      owner: null,
      ship: null,
      graceUntil: 0,
      revision: 1,
      acceptPorts: ports,
    };
    capabilities.db.touch();
  }
}
export const TowingOperations = {
  init(this: TowCapabilities2) {
    if (!this.db.world.towing)
      this.db.world.towing = { version: 1, nextId: 1, slots: [], receipts: [], offers: [] };
    const towWorld = state(this);
    validate(towWorld);
    for (const motherlode of towWorld.slots.map((towSlot) => towSlot.object))
      if (motherlode) release(this, motherlode);
    towWorld.offers = [];
    this.db.touch();
  },

  ensure(this: TowCapabilities2, starSystem: string) {
    ensure(this, starSystem);
  },

  attached(this: TowCapabilities2, session: Session) {
    return attached(this, session) || null;
  },

  detach(this: TowCapabilities2, session: Session) {
    const motherlode = attached(this, session);
    if (!motherlode) return false;
    release(this, motherlode);
    if (session.ent) session.ent.towCap = undefined;
    this.db.touch();
    return true;
  },

  towingTick(this: TowCapabilities2, space: Space) {
    if (this.paused() || this.db.economicFrozen) return;
    ensure(this, space.id);
    const towWorld = state(this);
    towWorld.offers = towWorld.offers.filter((towOffer) => towOffer.until > currentTime(this));
    for (const index of towWorld.slots.flatMap((towSlot, index) =>
      towSlot.sys === space.id ? [index] : [],
    )) {
      const slot = state(this).slots[index];
      const motherlode = slot.object;
      if (!motherlode || !active(motherlode)) continue;
      const session = [...this.sessions()].find(
        (session) =>
          session.data &&
          entryKey2(this, session) === motherlode.owner &&
          session.data.sys === space.id &&
          session.data.ship.uid === motherlode.ship,
      );
      const entity = session?.ent;
      if (
        !session ||
        !entity ||
        entity.dead ||
        entity.disabled ||
        entity.state !== 'fly' ||
        entity.towCap !== towSpeed(entity.hull) ||
        Math.hypot(entity.x - motherlode.x, entity.y - motherlode.y) > towingRules.breakRange
      ) {
        release(this, motherlode);
        if (entity) entity.towCap = undefined;
        continue;
      }
      const previous = { x: motherlode.x, y: motherlode.y };
      const targetX = entity.x - Math.sin(entity.a) * towingRules.tether,
        targetY = entity.y + Math.cos(entity.a) * towingRules.tether,
        deltaX = targetX - motherlode.x,
        deltaY = targetY - motherlode.y,
        distance = Math.hypot(deltaX, deltaY),
        speed = Math.min(towSpeed(entity.hull), distance * 2),
        deltaTime = 1 / 30;
      motherlode.vx = distance ? (deltaX / distance) * speed : 0;
      motherlode.vy = distance ? (deltaY / distance) * speed : 0;
      motherlode.x += motherlode.vx * deltaTime;
      motherlode.y += motherlode.vy * deltaTime;
      const ports = motherlode.acceptPorts
        .map((identifier) => STELLARS[identifier])
        .filter(
          (stellarBody) =>
            stellarBody?.system === motherlode.sys &&
            crossesPort(stellarBody, previous, motherlode) <=
              stellarBody.r + towingRules.deliveryApron,
        );
      if (!ports.length) deliveryNotices.delete(session);
      for (const port of ports) {
        try {
          deliver(this, session, motherlode, port.id, previous);
          deliveryNotices.delete(session);
          this.refresh(session);
          break;
        } catch (error) {
          // No room: leave the intact, owned load safely at the port so the pilot
          // can land, unload and reattach. Never discard cargo or mint partial output.
          if (error instanceof DeliveryHoldFull && !this.db.economicFrozen) {
            release(this, motherlode);
            entity.towCap = undefined;
            this.toast(
              session,
              `Motherlode safely detached: need ${motherlode.mass}t free hold. Unload, then reattach within ${towingRules.grace}s to deliver.`,
            );
            this.refresh(session);
            break;
          }
          if (port === ports.at(-1)) {
            const reason = error instanceof Error ? error.message : 'Port cannot accept delivery';
            const notice = `${motherlode.id}:${port.id}:${reason}`;
            if (deliveryNotices.get(session) !== notice) this.toast(session, reason);
            deliveryNotices.set(session, notice);
          }
        }
      }
      this.db.touch();
    }
  },

  command(this: TowCapabilities2, session: Session, towRequest: TowRequest) {
    try {
      if (!session.data || !validTowingRequest(towRequest)) throw Error('Invalid towing request');
      if (!validTowingAuthority(towRequest)) throw Error('Unexpected towing authority');
      if (this.db.economicFrozen || this.paused()) throw Error('Towing requires recovery/unpause');
      const towWorld = state(this),
        receipt = towWorld.receipts.find((towReceipt) => towReceipt.id === towRequest.id),
        account = entryKey2(this, session);
      if (towRequest.op === 'deliver' && receipt) {
        if (receipt.owner !== account || receipt.port !== towRequest.port)
          throw Error('Already delivered');
        this.toast(session, 'Motherlode already delivered once; no additional output.');
        return true;
      }
      const slot = towWorld.slots.find((towSlot) => towSlot.object?.id === towRequest.id),
        motherlode = slot?.object;
      if (
        !slot ||
        !motherlode ||
        ['delivered', 'destroyed'].includes(motherlode.status) ||
        motherlode.revision !== towRequest.revision ||
        motherlode.sys !== session.data.sys
      )
        throw Error('Motherlode changed; refresh selection');
      const entity = flight(this, session),
        distance = Math.hypot(entity.x - motherlode.x, entity.y - motherlode.y);
      if (towRequest.op === 'attach') {
        if (
          active(motherlode) ||
          attached(this, session) ||
          distance > towingRules.attachRange ||
          (motherlode.status === 'detached' &&
            motherlode.owner !== account &&
            currentTime(this) < motherlode.graceUntil)
        )
          throw Error('Motherlode unavailable, too far or reserved');
        const scan = session.data.miningSurvey;
        if (
          motherlode.owner !== account &&
          (!scan ||
            scan.sys !== motherlode.sys ||
            scan.revealUntil < currentTime(this) ||
            Math.hypot(scan.x - motherlode.x, scan.y - motherlode.y) > 1500)
        )
          throw Error('Survey this motherlode first');
        if (
          Math.hypot(entity.vx, entity.vy) > towSpeed(entity.hull) ||
          Math.hypot(entity.vx - motherlode.vx, entity.vy - motherlode.vy) > towSpeed(entity.hull)
        )
          throw Error('Slow below tow cap before attachment');
        motherlode.status = 'attached';
        motherlode.owner = account;
        motherlode.ship = session.data.ship.uid || null;
        motherlode.graceUntil = 0;
        motherlode.revision++;
        entity.towCap = towSpeed(entity.hull);
        this.stopCombat(session);
        session.data.armadaFollow = false;
        if (session.data.ship.industrial) session.data.ship.industrial.harvest = false;
      } else if (towRequest.op === 'accept') {
        const offer = towWorld.offers.find(
            (towOffer) =>
              towOffer.id === motherlode.id &&
              towOffer.to === account &&
              towOffer.revision === motherlode.revision &&
              towOffer.until > currentTime(this),
          ),
          from =
            offer &&
            [...this.sessions()].find(
              (session) => session.data && entryKey2(this, session) === offer.from,
            );
        if (
          !offer ||
          !from?.ent ||
          !active(motherlode) ||
          motherlode.owner !== offer.from ||
          from.ent.id !== offer.fromEntity ||
          entity.id !== offer.toEntity ||
          from.data.ship.uid !== offer.fromShip ||
          session.data.ship.uid !== offer.toShip ||
          from.data.sys !== motherlode.sys ||
          from.ent.dead ||
          from.ent.disabled ||
          from.ent.state !== 'fly' ||
          motherlode.ship !== from.data.ship.uid ||
          Math.hypot(from.ent.x - motherlode.x, from.ent.y - motherlode.y) >
            towingRules.breakRange ||
          distance > towingRules.attachRange ||
          Math.hypot(from.ent.x - entity.x, from.ent.y - entity.y) > towingRules.attachRange ||
          attached(this, session) ||
          Math.hypot(entity.vx, entity.vy) > towSpeed(entity.hull) ||
          Math.hypot(entity.vx - motherlode.vx, entity.vy - motherlode.vy) > towSpeed(entity.hull)
        )
          throw Error('Transfer expired or flight/range changed');
        // Carry no velocity above the recipient's cap into snapshots/checkpoints.
        const carried = Math.hypot(motherlode.vx, motherlode.vy),
          towSpeed2 = towSpeed(entity.hull);
        if (carried > towSpeed2) {
          motherlode.vx *= towSpeed2 / carried;
          motherlode.vy *= towSpeed2 / carried;
        }
        from.ent.towCap = undefined;
        motherlode.owner = account;
        motherlode.ship = session.data.ship.uid || null;
        motherlode.revision++;
        entity.towCap = towSpeed(entity.hull);
        towWorld.offers = towWorld.offers.filter((towOffer) => towOffer.id !== motherlode.id);
        this.stopCombat(session);
        session.data.armadaFollow = false;
        if (session.data.ship.industrial) session.data.ship.industrial.harvest = false;
        this.refresh(from);
      } else {
        if (
          !active(motherlode) ||
          motherlode.owner !== account ||
          motherlode.ship !== session.data.ship.uid
        )
          throw Error('Only current tow owner may do that');
        if (towRequest.op === 'detach') {
          release(this, motherlode);
          entity.towCap = undefined;
        } else if (towRequest.op === 'offer') {
          const session2 = [...this.sessions()].find(
            (session) =>
              session.data && this.db.key(session.data.name) === this.db.key(towRequest.to || ''),
          );
          if (!session2 || session2 === session || session2.data.sys !== motherlode.sys)
            throw Error('Choose another nearby captain');
          const target = flight(this, session2);
          if (
            attached(this, session2) ||
            Math.hypot(target.x - entity.x, target.y - entity.y) > towingRules.attachRange
          )
            throw Error('Recipient unavailable or too far');
          towWorld.offers = towWorld.offers.filter((towOffer) => towOffer.id !== motherlode.id);
          towWorld.offers.push({
            id: motherlode.id,
            revision: motherlode.revision,
            from: account,
            to: entryKey2(this, session2),
            fromShip: session.data.ship.uid || '',
            toShip: session2.data.ship.uid || '',
            fromEntity: entity.id,
            toEntity: target.id,
            until: currentTime(this) + towingRules.offerSeconds,
          });
          this.toast(
            session2,
            `${session.data.name} offers motherlode ${motherlode.id}; accept explicitly in TOW controls.`,
          );
        } else if (towRequest.op === 'deliver') {
          deliver(this, session, motherlode, towRequest.port || '');
        }
      }
      validate(state(this));
      this.db.touch();
      this.refresh(session);
      return true;
    } catch (error) {
      this.toast(session, error instanceof Error ? error.message : 'Towing rejected');
      return false;
    }
  },
  /**
   * Authorized object-only destruction. No generic neutral weapon/hazard collision path calls it.
   */
  destroy(this: TowCapabilities2, session: Session, identifier: number, revision: number) {
    if (this.db.economicFrozen || this.paused()) return false;
    const slot = state(this).slots.find((towSlot) => towSlot.object?.id === identifier),
      motherlode = slot?.object;
    if (
      !slot ||
      !motherlode ||
      motherlode.status !== 'attached' ||
      motherlode.owner !== entryKey2(this, session) ||
      motherlode.ship !== session.data.ship.uid ||
      motherlode.revision !== revision
    )
      return false;
    motherlode.hp = 0;
    motherlode.status = 'destroyed';
    motherlode.revision++;
    slot.discarded += motherlode.mass;
    slot.nextAt =
      currentTime(this) + towingRules.recovery * this.field(motherlode.sys, slot.field).factor;
    state(this).offers = state(this).offers.filter((towOffer) => towOffer.id !== motherlode.id);
    if (session.ent) session.ent.towCap = undefined;
    this.db.touch();
    return true;
  },

  payload(this: TowCapabilities2, session: Session) {
    if (!session.data) return null;
    ensure(this, session.data.sys);
    const scan = session.data.miningSurvey,
      account = entryKey2(this, session),
      towWorld = state(this);
    return {
      version: 1,
      now: currentTime(this),
      cap: towSpeed(session.data.ship.hull),
      rig: !!this.stats(session.data)?.towRig,
      attached: attached(this, session)?.id || null,
      objects: towWorld.slots
        .filter((towSlot) => towSlot.sys === session.data.sys)
        .map((slot) => {
          const motherlode = slot.object;
          if (!motherlode) return null;
          const revealed =
            motherlode.owner === account ||
            !!(
              scan &&
              scan.sys === motherlode.sys &&
              scan.revealUntil >= currentTime(this) &&
              Math.hypot(scan.x - motherlode.x, scan.y - motherlode.y) <= 1500
            );
          return {
            id: motherlode.id,
            revision: motherlode.revision,
            x: motherlode.x,
            y: motherlode.y,
            vx: motherlode.vx,
            vy: motherlode.vy,
            ore: motherlode.ore,
            status: motherlode.status,
            owner: motherlode.owner,
            graceUntil: motherlode.graceUntil,
            mass: revealed ? motherlode.mass : null,
            ports: revealed ? motherlode.acceptPorts : [],
            revealed,
            field: this.field(motherlode.sys, slot.field),
            hp: motherlode.hp,
            tug: active(motherlode)
              ? (() => {
                  const entity = [...this.sessions()].find(
                    (session) =>
                      session.data &&
                      entryKey2(this, session) === motherlode.owner &&
                      session.data.ship.uid === motherlode.ship &&
                      session.data.sys === motherlode.sys,
                  )?.ent;
                  return entity ? { x: entity.x, y: entity.y } : null;
                })()
              : null,
          };
        })
        .filter((object): object is NonNullable<typeof object> => Boolean(object)),
      offers: towWorld.offers
        .filter((towOffer) => towOffer.to === account && towOffer.until > currentTime(this))
        .map((towOffer) => ({
          id: towOffer.id,
          revision: towOffer.revision,
          from: towOffer.from,
          until: towOffer.until,
        })),
    };
  },
};
