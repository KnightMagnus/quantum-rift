// @ts-check
import { SYS, STELLARS } from '../shared/galaxy.js';
import { TOW, towSpeed } from '../shared/towing-rules.js';
import { addLots, assertLots } from '../shared/cargo-lots.js';

/** @import { RefineryPlayer } from './refinery-contracts.js' */
/** @import { Space } from './space.js' */
/** @import { TowRequest } from './towing-contracts.js' */
/** @typedef {import('./towing-contracts.js').TowCapabilities} C */
/** @typedef {import('./towing-contracts.js').TowWorld} W */
/** @typedef {import('./towing-contracts.js').Motherlode} ObjectRecord */
/** @typedef {import('./towing-contracts.js').Session} Session */
class DeliveryHoldFull extends Error {}
/** @type {WeakMap<Session, string>} */
const deliveryNotices = new WeakMap();
/** @param {C} capabilities @returns {W} */
function state(capabilities) {
  const w = capabilities.db.world.towing;
  if (!w) throw Error('Towing unavailable');
  return w;
}
/** @param {C} capabilities */
function now(capabilities) {
  return capabilities.db.world.mining?.clock || 0;
}
/** @param {C} capabilities @param {Session} session */
function key(capabilities, session) {
  return capabilities.db.key(session.data.name);
}
/** @param {ObjectRecord} o */
function active(o) {
  return o.status === 'attached';
}
/** @param {C} capabilities @param {Session} session */
function attached(capabilities, session) {
  return state(capabilities)
    .slots.map((x) => x.object)
    .find((o) => o && active(o) && o.owner === key(capabilities, session));
}
/** @param {C} capabilities @param {Session} session */
function flight(capabilities, session) {
  const entity = session.ent,
    st = capabilities.stats(session.data);
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
    !st?.towRig ||
    st.cargo < TOW.minCargo ||
    entity.fighterOf ||
    entity.wormExit
  )
    throw Error('Fit a Tow Rig on a cargo hull of at least 60t (stock Dredge included)');
  return entity;
}
/** @param {W} w */
function validate(w) {
  if (
    w.version !== 1 ||
    !Number.isSafeInteger(w.nextId) ||
    w.nextId < 1 ||
    !Array.isArray(w.slots) ||
    !Array.isArray(w.receipts) ||
    !Array.isArray(w.offers) ||
    w.receipts.length > TOW.receiptLimit ||
    w.offers.length > w.slots.length
  )
    throw Error('Invalid towing schema');
  const ids = new Set(),
    owners = new Set(),
    ships = new Set(),
    keys = new Set();
  for (const slot of w.slots) {
    if (
      keys.has(slot.key) ||
      !SYS[slot.sys]?.fields?.[slot.field] ||
      slot.key !== `${slot.sys}:${slot.field}` ||
      !Number.isSafeInteger(slot.field) ||
      slot.field < 0 ||
      slot.field >= 3 ||
      slot.issued !== slot.epoch * TOW.mass ||
      ![slot.epoch, slot.issued, slot.delivered, slot.discarded].every(
        (n) => Number.isSafeInteger(n) && n >= 0,
      ) ||
      !Number.isFinite(slot.nextAt) ||
      slot.nextAt < 0
    )
      throw Error('Invalid tow source');
    keys.add(slot.key);
    const o = slot.object;
    let reserved = 0;
    if (o) {
      if (
        !Number.isSafeInteger(o.id) ||
        o.id < 1 ||
        o.id >= w.nextId ||
        ids.has(o.id) ||
        o.epoch !== slot.epoch ||
        o.epoch < 1 ||
        o.slot !== slot.key ||
        o.sys !== slot.sys ||
        o.mass !== TOW.mass ||
        !['ore', 'gas', 'shards'].includes(o.ore) ||
        !['available', 'attached', 'detached', 'delivered', 'destroyed'].includes(o.status) ||
        !Number.isSafeInteger(o.revision) ||
        o.revision < 1 ||
        !Number.isFinite(o.graceUntil) ||
        o.graceUntil < 0 ||
        ![o.x, o.y, o.vx, o.vy, o.hp].every(Number.isFinite) ||
        o.hp < 0 ||
        o.hp > 100 ||
        !Array.isArray(o.acceptPorts) ||
        !o.acceptPorts.length ||
        o.acceptPorts.some((p) => STELLARS[p]?.system !== o.sys || !STELLARS[p]?.svc?.includes('L'))
      )
        throw Error('Invalid motherlode');
      if (
        !o.lots ||
        Object.keys(o.lots).sort().join() !== 'common,pure,rich' ||
        Object.values(o.lots).some((n) => !Number.isSafeInteger(n) || n < 0) ||
        Object.values(o.lots).reduce((a, b) => a + b, 0) !== o.mass
      )
        throw Error('Invalid motherlode mass/grades');
      if (
        (o.owner !== null &&
          (typeof o.owner !== 'string' || !o.owner || o.owner !== o.owner.trim().toLowerCase())) ||
        (o.ship !== null && (typeof o.ship !== 'string' || !o.ship))
      )
        throw Error('Invalid tow identity');
      if (active(o)) {
        if (
          !o.owner ||
          !o.ship ||
          o.graceUntil !== 0 ||
          owners.has(o.owner) ||
          ships.has(o.owner + ':' + o.ship)
        )
          throw Error('Duplicate tow owner/hull');
        owners.add(o.owner);
        ships.add(o.owner + ':' + o.ship);
      }
      if (o.status === 'available' && (o.owner !== null || o.ship !== null || o.graceUntil !== 0))
        throw Error('Invalid available owner');
      if (o.status === 'detached' && (!o.owner || !o.ship)) throw Error('Invalid detached owner');
      if (
        (o.status === 'delivered' || o.status === 'destroyed') &&
        o.hp !== (o.status === 'destroyed' ? 0 : 100)
      )
        throw Error('Invalid terminal object');
      ids.add(o.id);
      if (!['delivered', 'destroyed'].includes(o.status)) reserved = o.mass;
    }
    if (slot.issued !== slot.delivered + slot.discarded + reserved)
      throw Error('Tow source conservation failure');
  }
  const receipts = new Set();
  for (const r of w.receipts) {
    if (
      !Number.isSafeInteger(r.id) ||
      r.id < 1 ||
      r.id >= w.nextId ||
      receipts.has(r.id) ||
      typeof r.owner !== 'string' ||
      !r.owner ||
      r.owner !== r.owner.trim().toLowerCase() ||
      !STELLARS[r.port] ||
      !['ore', 'gas', 'shards'].includes(r.ore) ||
      r.mass !== TOW.mass ||
      Object.keys(r.lots || {})
        .sort()
        .join() !== 'common,pure,rich' ||
      Object.values(r.lots).some((n) => !Number.isSafeInteger(n) || n < 0) ||
      Object.values(r.lots).reduce((a, b) => a + b, 0) !== r.mass
    )
      throw Error('Invalid tow receipt');
    const live = w.slots.find((x) => x.object?.id === r.id)?.object;
    if (
      live &&
      (live.status !== 'delivered' ||
        live.owner !== r.owner ||
        live.ore !== r.ore ||
        JSON.stringify(live.lots) !== JSON.stringify(r.lots))
    )
      throw Error('Invalid receipt/object correspondence');
    receipts.add(r.id);
  }
  const offerIds = new Set();
  for (const offer of w.offers) {
    const o = w.slots.find((x) => x.object?.id === offer.id)?.object;
    if (
      offerIds.has(offer.id) ||
      !o ||
      !active(o) ||
      o.owner !== offer.from ||
      o.ship !== offer.fromShip ||
      o.revision !== offer.revision ||
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
/** @param {C} capabilities @param {ObjectRecord} o */
function release(capabilities, o) {
  if (!active(o)) return;
  o.status = 'detached';
  o.graceUntil = now(capabilities) + TOW.grace;
  o.revision++;
  o.vx = o.vy = 0;
  state(capabilities).offers = state(capabilities).offers.filter((x) => x.id !== o.id);
}
/** @param {C} capabilities @param {Session} session @param {()=>void} fn */
function transaction(capabilities, session, fn) {
  if (capabilities.db.economicFrozen || capabilities.paused())
    throw Error('Towing economy requires recovery/unpause');
  const playerData = /** @type {RefineryPlayer} */ (session.data),
    old = { cargo: playerData.cargo, cargoLots: playerData.cargoLots },
    w = capabilities.db.world.towing;
  playerData.cargo = structuredClone(playerData.cargo);
  playerData.cargoLots = structuredClone(playerData.cargoLots);
  capabilities.db.world.towing = structuredClone(w);
  try {
    fn();
    assertLots(playerData.cargo, playerData.cargoLots);
    validate(state(capabilities));
    capabilities.db.touch();
    capabilities.db.flush();
  } catch (error) {
    if (!capabilities.db.economicFrozen) {
      Object.assign(playerData, old);
      capabilities.db.world.towing = w;
    }
    throw error;
  }
}
/** Load-centred collection radius: the port body plus its existing 180-unit approach apron.
 * @param {{x:number,y:number}} p @param {{x:number,y:number}} a @param {{x:number,y:number}} b */
function crossesPort(p, a, b) {
  const dx = b.x - a.x,
    dy = b.y - a.y;
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy || 1)),
  );
  return Math.hypot(a.x + dx * t - p.x, a.y + dy * t - p.y);
}
/** Shared by explicit delivery and the authoritative physics tick. Never accepts client coordinates.
 * @param {C} capabilities @param {Session} session @param {ObjectRecord} o @param {string} port
 * @param {{x:number,y:number}} [previous] */
function deliver(capabilities, session, o, port, previous = o) {
  const entity = flight(capabilities, session),
    stellarBody = STELLARS[port];
  if (!active(o) || o.owner !== key(capabilities, session) || o.ship !== session.data.ship.uid)
    throw Error('Only current tow owner may deliver');
  if (
    !stellarBody ||
    !o.acceptPorts.includes(stellarBody.id) ||
    stellarBody.system !== o.sys ||
    crossesPort(stellarBody, previous, o) > stellarBody.r + TOW.deliveryApron
  )
    throw Error('Bring the motherlode into an accepted port collection zone');
  const pass = /** @type {RefineryPlayer} */ (session.data).landPass?.[stellarBody.id] || 0;
  if (
    !stellarBody.outlaw &&
    (session.data.rep?.[SYS[o.sys].faction] || 0) <= -30 &&
    pass <= Date.now()
  )
    throw Error('Port refuses delivery permission');
  if (capabilities.room(session.data) < o.mass)
    throw new DeliveryHoldFull(`Need ${o.mass}t free hold; store cargo or detach first`);
  transaction(capabilities, session, () => {
    const ws = state(capabilities),
      ss = ws.slots.find((x) => x.object?.id === o.id);
    if (!ss?.object) throw Error('Missing source');
    addLots(
      /** @type {RefineryPlayer} */ (session.data).cargo,
      /** @type {RefineryPlayer} */ (session.data).cargoLots,
      { cid: o.ore, qty: o.mass, grades: { ...o.lots } },
      capabilities.room(session.data),
    );
    ss.object.status = 'delivered';
    ss.object.revision++;
    ss.delivered += o.mass;
    ss.nextAt = now(capabilities) + TOW.recovery * capabilities.field(o.sys, ss.field).factor;
    ws.offers = ws.offers.filter((x) => x.id !== o.id);
    ws.receipts.push({
      id: o.id,
      owner: key(capabilities, session),
      port: stellarBody.id,
      ore: o.ore,
      lots: { ...o.lots },
      mass: o.mass,
    });
    ws.receipts = ws.receipts.slice(-TOW.receiptLimit);
  });
  entity.towCap = undefined;
  capabilities.toast(
    session,
    `Motherlode delivered: ${o.mass}t ${o.ore}; no second credit/fragment reward.`,
  );
}
/** @param {C} capabilities @param {string} sys */
function ensure(capabilities, sys) {
  if (capabilities.db.economicFrozen || capabilities.paused()) return;
  const w = state(capabilities),
    S = SYS[sys];
  if (!S || S.arena || !S.fields?.length) return;
  const ports = S.stellars
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
  for (const [i, f] of S.fields.slice(0, 3).entries()) {
    const slotKey = `${sys}:${i}`;
    let slot = w.slots.find((s) => s.key === slotKey);
    if (!slot) {
      slot = {
        key: slotKey,
        sys,
        field: i,
        epoch: 0,
        issued: 0,
        delivered: 0,
        discarded: 0,
        nextAt: 0,
        object: null,
      };
      w.slots.push(slot);
    }
    if (slot.object && !['delivered', 'destroyed'].includes(slot.object.status)) continue;
    if (now(capabilities) < slot.nextAt) continue;
    // IDs and accumulated conservation counters must never wrap into stale authority.
    if (w.nextId >= Number.MAX_SAFE_INTEGER || slot.issued > Number.MAX_SAFE_INTEGER - TOW.mass)
      continue;
    // Lazy wake issues at most one current finite object, never accumulated offline rewards.
    slot.epoch++;
    slot.issued += TOW.mass;
    slot.object = {
      id: w.nextId++,
      epoch: slot.epoch,
      slot: slotKey,
      sys,
      x: f.x + 120,
      y: f.y,
      vx: 0,
      vy: 0,
      mass: TOW.mass,
      ore: ['ore', 'gas', 'shards'][i % 3],
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
  /** @this {C} */
  init() {
    if (!this.db.world.towing)
      this.db.world.towing = { version: 1, nextId: 1, slots: [], receipts: [], offers: [] };
    const w = state(this);
    validate(w);
    for (const o of w.slots.map((s) => s.object)) if (o) release(this, o);
    w.offers = [];
    this.db.touch();
  },
  /** @this {C} @param {string} sys */
  ensure(sys) {
    ensure(this, sys);
  },
  /** @this {C} @param {Session} session */
  attached(session) {
    return attached(this, session) || null;
  },
  /** @this {C} @param {Session} session */
  detach(session) {
    const o = attached(this, session);
    if (!o) return false;
    release(this, o);
    if (session.ent) session.ent.towCap = undefined;
    this.db.touch();
    return true;
  },
  /** @this {C} @param {Space} space */
  towingTick(space) {
    if (this.paused() || this.db.economicFrozen) return;
    ensure(this, space.id);
    const w = state(this);
    w.offers = w.offers.filter((x) => x.until > now(this));
    for (const index of w.slots.flatMap((x, i) => (x.sys === space.id ? [i] : []))) {
      const slot = state(this).slots[index];
      const o = slot.object;
      if (!o || !active(o)) continue;
      const session = [...this.sessions()].find(
        (s) =>
          s.data &&
          key(this, s) === o.owner &&
          s.data.sys === space.id &&
          s.data.ship.uid === o.ship,
      );
      const entity = session?.ent;
      if (
        !session ||
        !entity ||
        entity.dead ||
        entity.disabled ||
        entity.state !== 'fly' ||
        entity.towCap !== towSpeed(entity.hull) ||
        Math.hypot(entity.x - o.x, entity.y - o.y) > TOW.breakRange
      ) {
        release(this, o);
        if (entity) entity.towCap = undefined;
        continue;
      }
      const previous = { x: o.x, y: o.y };
      const tx = entity.x - Math.sin(entity.a) * TOW.tether,
        ty = entity.y + Math.cos(entity.a) * TOW.tether,
        dx = tx - o.x,
        dy = ty - o.y,
        dist = Math.hypot(dx, dy),
        speed = Math.min(towSpeed(entity.hull), dist * 2),
        dt = 1 / 30;
      o.vx = dist ? (dx / dist) * speed : 0;
      o.vy = dist ? (dy / dist) * speed : 0;
      o.x += o.vx * dt;
      o.y += o.vy * dt;
      const ports = o.acceptPorts
        .map((id) => STELLARS[id])
        .filter(
          (stellarBody) =>
            stellarBody?.system === o.sys &&
            crossesPort(stellarBody, previous, o) <= stellarBody.r + TOW.deliveryApron,
        );
      if (!ports.length) deliveryNotices.delete(session);
      for (const port of ports) {
        try {
          deliver(this, session, o, port.id, previous);
          deliveryNotices.delete(session);
          this.refresh(session);
          break;
        } catch (error) {
          // No room: leave the intact, owned load safely at the port so the pilot
          // can land, unload and reattach. Never discard cargo or mint partial output.
          if (error instanceof DeliveryHoldFull && !this.db.economicFrozen) {
            release(this, o);
            entity.towCap = undefined;
            this.toast(
              session,
              `Motherlode safely detached: need ${o.mass}t free hold. Unload, then reattach within ${TOW.grace}s to deliver.`,
            );
            this.refresh(session);
            break;
          }
          if (port === ports.at(-1)) {
            const reason = error instanceof Error ? error.message : 'Port cannot accept delivery';
            const notice = `${o.id}:${port.id}:${reason}`;
            if (deliveryNotices.get(session) !== notice) this.toast(session, reason);
            deliveryNotices.set(session, notice);
          }
        }
      }
      this.db.touch();
    }
  },
  /** @this {C} @param {Session} session @param {TowRequest} q */
  command(session, q) {
    try {
      if (
        !session.data ||
        !['attach', 'detach', 'offer', 'accept', 'deliver'].includes(q.op || '') ||
        Object.keys(q).some((k) => !['t', 'op', 'id', 'revision', 'to', 'port'].includes(k)) ||
        (q.to !== undefined && (typeof q.to !== 'string' || !q.to.trim() || q.to.length > 64)) ||
        (q.port !== undefined && typeof q.port !== 'string') ||
        !Number.isSafeInteger(q.id) ||
        !Number.isSafeInteger(q.revision)
      )
        throw Error('Invalid towing request');
      if ((q.op !== 'offer' && q.to !== undefined) || (q.op !== 'deliver' && q.port !== undefined))
        throw Error('Unexpected towing authority');
      if (this.db.economicFrozen || this.paused()) throw Error('Towing requires recovery/unpause');
      const w = state(this),
        receipt = w.receipts.find((x) => x.id === q.id),
        account = key(this, session);
      if (q.op === 'deliver' && receipt) {
        if (receipt.owner !== account || receipt.port !== q.port) throw Error('Already delivered');
        this.toast(session, 'Motherlode already delivered once; no additional output.');
        return true;
      }
      const slot = w.slots.find((x) => x.object?.id === q.id),
        o = slot?.object;
      if (
        !slot ||
        !o ||
        ['delivered', 'destroyed'].includes(o.status) ||
        o.revision !== q.revision ||
        o.sys !== session.data.sys
      )
        throw Error('Motherlode changed; refresh selection');
      const entity = flight(this, session),
        distance = Math.hypot(entity.x - o.x, entity.y - o.y);
      if (q.op === 'attach') {
        if (
          active(o) ||
          attached(this, session) ||
          distance > TOW.attachRange ||
          (o.status === 'detached' && o.owner !== account && now(this) < o.graceUntil)
        )
          throw Error('Motherlode unavailable, too far or reserved');
        const scan = session.data.miningSurvey;
        if (
          o.owner !== account &&
          (!scan ||
            scan.sys !== o.sys ||
            scan.revealUntil < now(this) ||
            Math.hypot(scan.x - o.x, scan.y - o.y) > 1500)
        )
          throw Error('Survey this motherlode first');
        if (
          Math.hypot(entity.vx, entity.vy) > towSpeed(entity.hull) ||
          Math.hypot(entity.vx - o.vx, entity.vy - o.vy) > towSpeed(entity.hull)
        )
          throw Error('Slow below tow cap before attachment');
        o.status = 'attached';
        o.owner = account;
        o.ship = session.data.ship.uid || null;
        o.graceUntil = 0;
        o.revision++;
        entity.towCap = towSpeed(entity.hull);
        this.stopCombat(session);
        session.data.armadaFollow = false;
        if (session.data.ship.industrial) session.data.ship.industrial.harvest = false;
      } else if (q.op === 'accept') {
        const offer = w.offers.find(
            (x) =>
              x.id === o.id && x.to === account && x.revision === o.revision && x.until > now(this),
          ),
          from = offer && [...this.sessions()].find((x) => x.data && key(this, x) === offer.from);
        if (
          !offer ||
          !from?.ent ||
          !active(o) ||
          o.owner !== offer.from ||
          from.ent.id !== offer.fromEntity ||
          entity.id !== offer.toEntity ||
          from.data.ship.uid !== offer.fromShip ||
          session.data.ship.uid !== offer.toShip ||
          from.data.sys !== o.sys ||
          from.ent.dead ||
          from.ent.disabled ||
          from.ent.state !== 'fly' ||
          o.ship !== from.data.ship.uid ||
          Math.hypot(from.ent.x - o.x, from.ent.y - o.y) > TOW.breakRange ||
          distance > TOW.attachRange ||
          Math.hypot(from.ent.x - entity.x, from.ent.y - entity.y) > TOW.attachRange ||
          attached(this, session) ||
          Math.hypot(entity.vx, entity.vy) > towSpeed(entity.hull) ||
          Math.hypot(entity.vx - o.vx, entity.vy - o.vy) > towSpeed(entity.hull)
        )
          throw Error('Transfer expired or flight/range changed');
        // Carry no velocity above the recipient's cap into snapshots/checkpoints.
        const carried = Math.hypot(o.vx, o.vy),
          cap = towSpeed(entity.hull);
        if (carried > cap) {
          o.vx *= cap / carried;
          o.vy *= cap / carried;
        }
        from.ent.towCap = undefined;
        o.owner = account;
        o.ship = session.data.ship.uid || null;
        o.revision++;
        entity.towCap = towSpeed(entity.hull);
        w.offers = w.offers.filter((x) => x.id !== o.id);
        this.stopCombat(session);
        session.data.armadaFollow = false;
        if (session.data.ship.industrial) session.data.ship.industrial.harvest = false;
        this.refresh(from);
      } else {
        if (!active(o) || o.owner !== account || o.ship !== session.data.ship.uid)
          throw Error('Only current tow owner may do that');
        if (q.op === 'detach') {
          release(this, o);
          entity.towCap = undefined;
        } else if (q.op === 'offer') {
          const to = [...this.sessions()].find(
            (x) => x.data && this.db.key(x.data.name) === this.db.key(q.to || ''),
          );
          if (!to || to === session || to.data.sys !== o.sys)
            throw Error('Choose another nearby captain');
          const target = flight(this, to);
          if (
            attached(this, to) ||
            Math.hypot(target.x - entity.x, target.y - entity.y) > TOW.attachRange
          )
            throw Error('Recipient unavailable or too far');
          w.offers = w.offers.filter((x) => x.id !== o.id);
          w.offers.push({
            id: o.id,
            revision: o.revision,
            from: account,
            to: key(this, to),
            fromShip: session.data.ship.uid || '',
            toShip: to.data.ship.uid || '',
            fromEntity: entity.id,
            toEntity: target.id,
            until: now(this) + TOW.offerSeconds,
          });
          this.toast(
            to,
            `${session.data.name} offers motherlode ${o.id}; accept explicitly in TOW controls.`,
          );
        } else if (q.op === 'deliver') {
          deliver(this, session, o, q.port || '');
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
  /** Authorized object-only destruction. No generic neutral weapon/hazard collision path calls it.
   * @this {C} @param {Session} session @param {number} id @param {number} revision */
  destroy(session, id, revision) {
    if (this.db.economicFrozen || this.paused()) return false;
    const slot = state(this).slots.find((x) => x.object?.id === id),
      o = slot?.object;
    if (
      !slot ||
      !o ||
      o.status !== 'attached' ||
      o.owner !== key(this, session) ||
      o.ship !== session.data.ship.uid ||
      o.revision !== revision
    )
      return false;
    o.hp = 0;
    o.status = 'destroyed';
    o.revision++;
    slot.discarded += o.mass;
    slot.nextAt = now(this) + TOW.recovery * this.field(o.sys, slot.field).factor;
    state(this).offers = state(this).offers.filter((x) => x.id !== o.id);
    if (session.ent) session.ent.towCap = undefined;
    this.db.touch();
    return true;
  },
  /** @this {C} @param {Session} session */
  payload(session) {
    if (!session.data) return null;
    ensure(this, session.data.sys);
    const scan = session.data.miningSurvey,
      account = key(this, session),
      w = state(this);
    return {
      version: 1,
      now: now(this),
      cap: towSpeed(session.data.ship.hull),
      rig: !!this.stats(session.data)?.towRig,
      attached: attached(this, session)?.id || null,
      objects: w.slots
        .filter((x) => x.sys === session.data.sys)
        .map((slot) => {
          const o = slot.object;
          if (!o) return null;
          const revealed =
            o.owner === account ||
            !!(
              scan &&
              scan.sys === o.sys &&
              scan.revealUntil >= now(this) &&
              Math.hypot(scan.x - o.x, scan.y - o.y) <= 1500
            );
          return {
            id: o.id,
            revision: o.revision,
            x: o.x,
            y: o.y,
            vx: o.vx,
            vy: o.vy,
            ore: o.ore,
            status: o.status,
            owner: o.owner,
            graceUntil: o.graceUntil,
            mass: revealed ? o.mass : null,
            ports: revealed ? o.acceptPorts : [],
            revealed,
            field: this.field(o.sys, slot.field),
            hp: o.hp,
            tug: active(o)
              ? (() => {
                  const entity = [...this.sessions()].find(
                    (x) =>
                      x.data &&
                      key(this, x) === o.owner &&
                      x.data.ship.uid === o.ship &&
                      x.data.sys === o.sys,
                  )?.ent;
                  return entity ? { x: entity.x, y: entity.y } : null;
                })()
              : null,
          };
        })
        .filter(Boolean),
      offers: w.offers
        .filter((x) => x.to === account && x.until > now(this))
        .map((x) => ({ id: x.id, revision: x.revision, from: x.from, until: x.until })),
    };
  },
};
