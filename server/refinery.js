// @ts-check
import fs from 'node:fs';
import { recordEconomy } from '../shared/economy-receipt.js';
import {
  RECIPES,
  REFINERY_RULES as R,
  recovery,
  outputUnits,
  storedDuration,
  refineryFee,
} from '../shared/refinery-rules.js';
import { assertLots, planTake, applyTake, addLots, commonLots } from '../shared/cargo-lots.js';

/** @import { FuelQuote, MiningOrder, RefineryPlayer, RefineryRequest, RefineryWire } from './refinery-contracts.js' */
/** @typedef {import('./refinery-contracts.js').RefineryCapabilities} C */
/** @typedef {import('./refinery-contracts.js').SavedRefinery} W */
/** @typedef {import('./refinery-contracts.js').RefinerySession} Session */
/** @typedef {import('./refinery-contracts.js').RefineryQuote} Quote */
/** @param {C} capabilities @returns {W} */
function state(capabilities) {
  const w = capabilities.db.world.refinery;
  if (!w) throw Error('Refinery unavailable');
  return w;
}
/** @param {number} n */
function integer(n) {
  if (!Number.isSafeInteger(n) || n < 0) throw Error('Invalid refinery integer');
}
/** @param {unknown} value */
function identity(value) {
  if (typeof value !== 'string' || !value.trim()) throw Error('Invalid refinery identity');
}
/** @param {W} w */
function validate(w) {
  if (
    w.version !== 1 ||
    !Array.isArray(w.quotes) ||
    !Array.isArray(w.fuelQuotes) ||
    !Array.isArray(w.batches) ||
    !Array.isArray(w.ready) ||
    !Array.isArray(w.operations) ||
    !Array.isArray(w.orders) ||
    !Array.isArray(w.demand)
  )
    throw Error('Invalid refinery save/version');
  integer(w.nextId);
  for (const q of w.fuelQuotes) {
    for (const value of [q.id, q.owner, q.ship]) identity(value);
    for (const n of [q.n, q.gain, q.issuedAt, q.expires]) integer(n);
    if (![q.before, q.capacity].every((n) => Number.isFinite(n) && n >= 0))
      throw Error('Invalid fuel state');
    if (
      !q.owner ||
      q.n < 1 ||
      q.n > 30 ||
      q.gain !== q.n * R.fuelPerCell ||
      q.before + q.gain > q.capacity
    )
      throw Error('Invalid fuel quote');
  }

  for (const q of [...w.quotes, ...w.batches.map((b) => b.quote)]) {
    for (const value of [q.id, q.owner, q.port, q.fingerprint]) identity(value);
    if (
      q.version !== 1 ||
      !RECIPES.some((r) => r.id === q.recipe && r.output === q.output) ||
      !q.owner ||
      !q.port ||
      !['instant', 'stored'].includes(q.mode)
    )
      throw Error('Invalid refinery quote');
    for (const v of [q.units, q.fee, q.expires, q.inputTonnes, q.duration, q.cancelFee]) integer(v);
    const recipe = RECIPES.find((r) => r.id === q.recipe);
    if (
      !recipe ||
      !Array.isArray(q.inputs) ||
      q.inputs.length !== recipe.inputs.length ||
      ![75, 80, 85, 95, 100].includes(q.recovery) ||
      q.inputTonnes < 1 ||
      (q.preview !== undefined && typeof q.preview !== 'boolean') ||
      q.inputTonnes > (q.mode === 'instant' ? R.instantCap : R.storedCap) ||
      q.cancelFee > q.fee ||
      typeof q.fingerprint !== 'string'
    )
      throw Error('Invalid refinery quote schema');
    let tonnes = 0;
    for (const [index, input] of q.inputs.entries()) {
      if (
        input.cid !== recipe.inputs[index] ||
        !input.lots ||
        Object.keys(input.lots).sort().join(',') !== 'common,pure,rich'
      )
        throw Error('Invalid refinery input');
      for (const n of Object.values(input.lots)) integer(n);
      if (recipe.pure && (input.lots.common || input.lots.rich || input.lots.pure % 3))
        throw Error('Invalid pure recipe');
      tonnes += Object.values(input.lots).reduce((a, b) => a + b, 0);
    }
    if (recipe.pure && q.inputs.some((i) => i.lots.pure !== q.inputs[0].lots.pure))
      throw Error('Invalid unequal composite inputs');
    if (tonnes !== q.inputTonnes || q.units !== outputUnits(tonnes, q.recovery, recipe.pure))
      throw Error('Invalid refinery entitlement');
  }
  for (const b of w.batches) {
    identity(b.id);
    if (
      !['queued', 'processing', 'ready', 'collected', 'cancelled'].includes(b.status) ||
      typeof b.credited !== 'boolean' ||
      b.owner !== b.quote.owner ||
      b.port !== b.quote.port
    )
      throw Error('Invalid refinery batch');
    for (const n of [b.submittedAt, b.startAt, b.readyAt]) integer(n);
    if (
      !Array.isArray(b.returns) ||
      b.startAt !== b.submittedAt + (b.quote.mode === 'stored' ? R.queueMs : 0) ||
      b.readyAt !== b.startAt + b.quote.duration ||
      b.credited !== ['ready', 'collected'].includes(b.status) ||
      (b.status !== 'cancelled' && b.returns.length) ||
      (b.status === 'cancelled' && b.returns.length !== b.quote.inputs.length)
    )
      throw Error('Invalid batch state');
    for (const [index, i] of b.returns.entries()) {
      const source = b.quote.inputs[index];
      if (
        !source ||
        i.cid !== source.cid ||
        !i.lots ||
        Object.keys(i.lots).sort().join(',') !== 'common,pure,rich'
      )
        throw Error('Invalid return escrow');
      for (const grade of /** @type {const} */ (['common', 'rich', 'pure'])) {
        integer(i.lots[grade]);
        if (i.lots[grade] > source.lots[grade]) throw Error('Invalid return entitlement');
      }
    }
  }
  for (const r of w.ready) {
    for (const n of [r.units, r.producedUnits, r.claimedUnits]) integer(n);
    if (
      r.units + r.claimedUnits !== r.producedUnits ||
      !r.owner ||
      !r.port ||
      !RECIPES.some((x) => x.output === r.cid)
    )
      throw Error('Invalid ready ledger');
  }
  for (const values of [
    w.fuelQuotes.map((q) => q.id),
    w.operations.map((o) => `${o.owner}:${o.kind}:${o.id}`),
    w.quotes.map((q) => q.id),
    w.batches.map((b) => b.id),
    w.ready.map((r) => `${r.owner}:${r.port}:${r.cid}`),
    w.demand.map((d) => d.key),
    w.orders.map((o) => o.id),
  ])
    if (new Set(values).size !== values.length) throw Error('Duplicate refinery identity');
  for (const o of w.operations) {
    for (const value of [o.id, o.owner, o.result]) identity(value);
    integer(o.time);
    if (!['submit', 'cancel', 'fuel', 'accept', 'deliver', 'cancelOrder'].includes(o.kind))
      throw Error('Invalid refinery receipt');
  }
  for (const d of w.demand) {
    identity(d.key);
    if (!Array.isArray(d.usedOffers) || new Set(d.usedOffers).size !== d.usedOffers.length)
      throw Error('Invalid used offers');
    for (const id of d.usedOffers) identity(id);
    for (const n of [d.input, d.composite, d.reserved, d.paid, d.sold]) integer(n);
    if (
      d.reserved !==
      w.orders
        .filter((o) => o.demand === d.key && o.status === 'accepted')
        .reduce((n, o) => n + o.qty, 0)
    )
      throw Error('Invalid order reservation');
  }
  for (const o of w.orders) {
    for (const n of [o.qty, o.reward, o.deadline]) integer(n);
    if (
      !['accepted', 'delivered', 'cancelled', 'expired'].includes(o.status) ||
      !['common', 'rich', 'pure'].includes(o.grade) ||
      !o.owner ||
      !o.port ||
      !o.qty
    )
      throw Error('Invalid mining order');
  }
}
/** @param {W} w @param {string} owner @param {string} port @param {string} cid */
function balance(w, owner, port, cid) {
  let b = w.ready.find((b) => b.owner === owner && b.port === port && b.cid === cid);
  if (!b) {
    b = { owner, port, cid, units: 0, producedUnits: 0, claimedUnits: 0 };
    w.ready.push(b);
  }
  return b;
}
/** @param {C} capabilities */
function advance(capabilities) {
  if (capabilities.db.economicFrozen) return;
  const w = state(capabilities),
    now = capabilities.now();
  let changed = false;
  for (const b of w.batches) {
    if (b.status === 'cancelled' || b.credited) continue;
    if (now >= b.readyAt) {
      const ready = balance(w, b.owner, b.port, b.quote.output);
      ready.units += b.quote.units;
      ready.producedUnits += b.quote.units;
      b.credited = true;
      b.status = 'ready';
      changed = true;
    } else if (now >= b.startAt && b.status === 'queued') {
      b.status = 'processing';
      changed = true;
    }
  }
  for (const o of w.orders)
    if (o.status === 'accepted' && now > o.deadline) {
      o.status = 'expired';
      const d = w.demand.find((d) => d.key === o.demand);
      if (d) {
        d.reserved -= o.qty;
        d.paid -= o.reward;
      }
      const account = /** @type {RefineryPlayer|null} */ (capabilities.db.get(o.owner));
      if (account) account.missions = account.missions.filter((mission) => mission.id !== o.id);
      changed = true;
    }
  if (changed) {
    capabilities.db.touch();
    try {
      capabilities.db.flush();
    } catch (e) {
      capabilities.db.economicFrozen = true;
      throw e;
    }
  }
}
/** Bound settled history without discarding live escrow/reservations. IDs never recycle.
 * @param {W} w @param {number} now */
function prune(w, now) {
  w.fuelQuotes = w.fuelQuotes.filter((q) => q.expires > now);
  for (const owner of new Set(w.batches.map((b) => b.owner))) {
    const done = w.batches.filter(
      (b) =>
        b.owner === owner &&
        (b.credited ||
          (b.status === 'cancelled' &&
            b.returns.every((i) => !Object.values(i.lots).some(Boolean)))),
    );
    if (done.length > R.settledLimit) {
      const remove = new Set(done.slice(0, done.length - R.settledLimit));
      w.batches = w.batches.filter((b) => !remove.has(b));
    }
  }
  for (const owner of new Set(w.orders.map((o) => o.owner))) {
    const done = w.orders.filter((o) => o.owner === owner && o.status !== 'accepted');
    if (done.length > R.settledLimit) {
      const remove = new Set(done.slice(0, done.length - R.settledLimit));
      w.orders = w.orders.filter((o) => !remove.has(o));
    }
  }
  const active = new Set(w.orders.filter((o) => o.status === 'accepted').map((o) => o.demand));
  w.demand = w.demand.filter((d) =>
    active.has(d.key) || d.key.startsWith('rush:')
      ? active.has(d.key) || w.orders.some((o) => o.demand === d.key && o.deadline > now - 86400000)
      : Number(d.key.split(':').at(-1)) >= Math.floor(now / 86400000) - 2,
  );
}
/** @param {W} w @param {string} port @param {number} now */
function demand(w, port, now) {
  const key = `${port}:${Math.floor(now / 86400000)}`;
  let d = w.demand.find((d) => d.key === key);
  if (!d) {
    d = { key, input: 0, composite: 0, reserved: 0, paid: 0, sold: 0, usedOffers: [] };
    w.demand.push(d);
  }
  return d;
}
/** Transaction uses copies and the existing world+player checkpoint. No async gap.
 * @param {C} capabilities @param {Session} session @param {(w:W,d:RefineryPlayer)=>void} fn */
function transaction(capabilities, session, fn) {
  if (capabilities.db.economicFrozen || capabilities.paused())
    throw Error('Economy paused; recover checkpoint before continuing.');
  /** @type {[object,string[]][]} */ const targets = [
    [
      session.data,
      ['cargo', 'cargoLots', 'credits', 'fuel', 'missions', 'stats', 'economyReceipt'],
    ],
    [capabilities.db.world, ['refinery']],
  ];
  for (const [target, keys] of targets)
    for (const key of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(target, key);
      if (
        descriptor
          ? !Object.hasOwn(descriptor, 'value') || !descriptor.writable
          : !Object.isExtensible(target)
      )
        throw Error('Refinery settlement target is not writable.');
    }
  advance(capabilities);
  const old = state(capabilities),
    playerData = session.data,
    next = structuredClone(old),
    player = structuredClone(playerData);
  // Flight fuel is authoritative; unrelated escrow actions must not restore the stale dock save.
  if (session.ent) player.fuel = session.ent.fuel;
  assertLots(player.cargo, player.cargoLots);
  fn(next, player);
  prune(next, capabilities.now());
  assertLots(player.cargo, player.cargoLots);
  validate(next);
  const prior = {
    cargo: playerData.cargo,
    cargoLots: playerData.cargoLots,
    credits: playerData.credits,
    fuel: playerData.fuel,
    missions: playerData.missions,
    stats: playerData.stats,
    economyReceipt: playerData.economyReceipt,
  };
  Object.assign(playerData, {
    cargo: player.cargo,
    cargoLots: player.cargoLots,
    credits: player.credits,
    fuel: player.fuel,
    missions: player.missions,
    stats: player.stats,
    economyReceipt: player.economyReceipt,
  });
  capabilities.db.world.refinery = next;
  capabilities.db.touch();
  try {
    capabilities.db.flush();
  } catch (e) {
    if (capabilities.db.economicFrozen || fs.existsSync(capabilities.db.journal))
      capabilities.db.economicFrozen = true;
    else {
      Object.assign(playerData, prior);
      capabilities.db.world.refinery = old;
      capabilities.db.touch();
    }
    throw e;
  }
  if (session.ent && typeof playerData.fuel === 'number') session.ent.fuel = playerData.fuel;
}
/** @param {W} w @param {string} owner @param {string} kind @param {string} id @param {number} now @param {string} result */
function receipt(w, owner, kind, id, now, result) {
  if (w.operations.some((o) => o.owner === owner && o.kind === kind && o.id === id))
    throw Error('Operation already settled.');
  w.operations.push({ owner, kind, id, time: now, result });
  const mine = w.operations.filter((o) => o.owner === owner);
  if (mine.length > R.receiptLimit) {
    const remove = new Set(mine.slice(0, mine.length - R.receiptLimit));
    w.operations = w.operations.filter((o) => !remove.has(o));
  }
}
/** @param {C} capabilities @param {RefineryPlayer} playerData @param {string} port @param {string[]} ids @param {number} now */
function economics(capabilities, playerData, port, ids, now) {
  return ids.map((cid) => capabilities.pricing(playerData, port, cid, now));
}
/** @param {C} capabilities @param {Session} session @param {RefineryRequest} m */
function quote(capabilities, session, m, preview = false) {
  const port = m.port || session.data.stellar,
    recipe = RECIPES.find((r) => r.id === m.recipe),
    n = m.n,
    grade = m.grade || 'common',
    mode = m.mode || 'stored';
  if (
    !port ||
    !recipe ||
    typeof n !== 'number' ||
    !Number.isSafeInteger(n) ||
    !n ||
    n < 1 ||
    !['common', 'rich', 'pure'].includes(grade) ||
    !['instant', 'stored'].includes(mode)
  )
    throw Error('Invalid recipe/quantity.');
  const a = capabilities.access(session.data, port);
  if (!a.available || session.data.stellar !== port || session.ent)
    throw Error('Dock at an eligible refinery.');
  if (recipe.inputs[0] === 'plasma' && grade !== 'common') throw Error('Plasma is ungraded cargo.');
  if (recipe.pure && grade !== 'pure') throw Error('Composite requires pure ore, gas and shards.');
  const total = recipe.inputs.length * n;
  if (total > (mode === 'instant' ? R.instantCap : R.storedCap) || (recipe.pure && n % 3 !== 0))
    throw Error('Service cap or complete composite recipe exceeded.');
  const inputs = recipe.inputs.map((cid) => ({
    cid,
    lots: {
      common: grade === 'common' ? n : 0,
      rich: grade === 'rich' ? n : 0,
      pure: grade === 'pure' ? n : 0,
    },
  }));
  const now = capabilities.now(),
    owner = capabilities.db.key(session.data.name),
    percent = recovery(a.faction, a.home, recipe),
    units = outputUnits(total, percent, recipe.pure),
    prices = economics(capabilities, session.data, port, [...recipe.inputs, recipe.output], now),
    ask = prices.slice(0, -1).reduce((v, p) => v + p.ask * n, 0),
    existing =
      state(capabilities).ready.find(
        (b) => b.owner === owner && b.port === port && b.cid === recipe.output,
      )?.units || 0,
    bid = prices[prices.length - 1].bid * Math.ceil((units + (existing % 300)) / 300),
    service =
      (a.home ? R.homeFeePerTon : a.faction === 'outlaw' ? R.outlawFeePerTon : R.publicFeePerTon) *
      total *
      (mode === 'stored' ? R.storedFeeFactor : 1),
    fee = refineryFee(bid, ask, service);
  /** @type {Quote|undefined} */ let q;
  transaction(capabilities, session, (w) => {
    w.quotes = w.quotes.filter((q) => q.expires > now);
    // UI previews replace only earlier UI previews; legacy explicitly issued quotes remain intact.
    if (preview) w.quotes = w.quotes.filter((q) => q.owner !== owner || !q.preview);
    const mine = w.quotes.filter((q) => q.owner === owner);
    if (mine.length >= R.maxQuotes) throw Error('Too many active quotes.');
    q = {
      id: `q${w.nextId++}`,
      ...(preview ? { preview: true } : {}),
      owner,
      port,
      recipe: recipe.id,
      version: 1,
      mode,
      inputs,
      inputTonnes: total,
      units,
      output: recipe.output,
      fee,
      cancelFee: Math.min(fee, R.cancelFee),
      expires: now + R.quoteMs,
      duration: mode === 'instant' ? 0 : storedDuration(total),
      recovery: percent,
      fingerprint: JSON.stringify(prices),
      ask,
      bid,
    };
    w.quotes.push(q);
  });
  capabilities.send(session, { t: 'refineryQuote', quote: q });
}
/** @param {C} capabilities @param {Session} session @param {string} id */
function submit(capabilities, session, id) {
  const owner = capabilities.db.key(session.data.name),
    now = capabilities.now();
  if (
    state(capabilities).operations.some(
      (o) => o.owner === owner && o.kind === 'submit' && o.id === id,
    )
  )
    return;
  transaction(capabilities, session, (w, playerData) => {
    const q = w.quotes.find((q) => q.id === id && q.owner === owner);
    if (!q || q.expires < now)
      throw Error('The refining price has expired. Check the updated cost and try again.');
    const a = capabilities.access(playerData, q.port);
    if (!a.available || playerData.stellar !== q.port || session.ent)
      throw Error('Refinery access changed.');
    const recipe = RECIPES.find((r) => r.id === q.recipe);
    if (!recipe) throw Error('Unknown recipe version.');
    const prices = economics(
      capabilities,
      playerData,
      q.port,
      [...recipe.inputs, recipe.output],
      now,
    );
    if (
      JSON.stringify(prices) !== q.fingerprint ||
      recovery(a.faction, a.home, recipe) !== q.recovery
    )
      throw Error('The refining price has changed. Check the updated cost and try again.');
    const dem = demand(w, q.port, now);
    if (
      dem.input + q.inputTonnes > R.dailyInput ||
      (recipe.pure && dem.composite + q.units > R.compositeDaily * 300)
    )
      throw Error('Daily processing demand exhausted.');
    if (
      w.batches.filter(
        (b) =>
          b.owner === owner &&
          !b.credited &&
          (b.status !== 'cancelled' || b.returns.some((i) => Object.values(i.lots).some(Boolean))),
      ).length >= R.activeBatches
    )
      throw Error('Active batch limit.');
    if (playerData.credits < q.fee) throw Error('Insufficient credits.');
    // Every mutation is on copies. A third-input failure cannot debit either of the first two.
    for (const i of q.inputs)
      applyTake(
        playerData.cargo,
        playerData.cargoLots,
        planTake(
          playerData.cargo,
          playerData.cargoLots,
          i.cid,
          Object.values(i.lots).reduce((a, b) => a + b, 0),
          i.lots,
        ),
      );
    playerData.credits -= q.fee;
    recordEconomy(playerData, q.port, 'serviceFees', q.fee);
    dem.input += q.inputTonnes;
    if (recipe.pure) dem.composite += q.units;
    const startAt = now + (q.mode === 'stored' ? R.queueMs : 0),
      batch = {
        id: `b${w.nextId++}`,
        owner,
        port: q.port,
        quote: q,
        submittedAt: now,
        startAt,
        readyAt: startAt + q.duration,
        status: /** @type {'queued'} */ ('queued'),
        credited: false,
        returns: [],
      };
    w.batches.push(batch);
    w.quotes = w.quotes.filter((x) => x !== q);
    receipt(w, owner, 'submit', id, now, batch.id);
    // Settled immutable history can be bounded; ready balances retain all fractional entitlement.
    const done = w.batches.filter(
      (b) =>
        b.owner === owner &&
        b.credited &&
        b.returns.every((i) => !Object.values(i.lots).some(Boolean)),
    );
    if (done.length > R.settledLimit) {
      const trim = new Set(done.slice(0, done.length - R.settledLimit));
      w.batches = w.batches.filter((b) => !trim.has(b));
    }
  });
  advance(capabilities);
}
/** @param {C} capabilities @param {Session} session @param {RefineryRequest} m */
function collect(capabilities, session, m) {
  const port = m.port || session.data.stellar,
    owner = capabilities.db.key(session.data.name),
    recipe = RECIPES.find((r) => r.id === m.recipe);
  if (!port || !capabilities.access(session.data, port).near)
    throw Error('Approach the collection marker within500 units.');
  transaction(capabilities, session, (w, playerData) => {
    if (m.op === 'claim') {
      if (!recipe) throw Error('Unknown output.');
      const b = balance(w, owner, port, recipe.output),
        n = Math.min(Math.floor(b.units / 300), capabilities.room(playerData));
      if (!n) throw Error('Hold full or no whole output ready; fraction remains stored.');
      addLots(
        playerData.cargo,
        playerData.cargoLots,
        commonLots(recipe.output, n),
        capabilities.room(playerData),
      );
      b.units -= n * 300;
      b.claimedUnits += n * 300;
      if (!b.units)
        for (const batch of w.batches)
          if (
            batch.owner === owner &&
            batch.port === port &&
            batch.quote.output === recipe.output &&
            batch.credited
          )
            batch.status = 'collected';
    } else {
      const b = w.batches.find((b) => b.id === m.id && b.owner === owner && b.port === port);
      if (!b || b.status !== 'cancelled') throw Error('No owned cancellation escrow.');
      let room = capabilities.room(playerData);
      for (const input of b.returns) {
        const total = Object.values(input.lots).reduce((a, b) => a + b, 0),
          n = Math.min(total, room);
        if (!n) continue;
        const lots = { common: 0, rich: 0, pure: 0 };
        let left = n;
        for (const k of /** @type {const} */ (['common', 'rich', 'pure'])) {
          lots[k] = Math.min(input.lots[k], left);
          input.lots[k] -= lots[k];
          left -= lots[k];
        }
        addLots(
          playerData.cargo,
          playerData.cargoLots,
          { cid: input.cid, qty: n, grades: lots },
          room,
        );
        room -= n;
      }
    }
  });
}
/** @param {C} capabilities @param {Session} session @param {string} id */
function cancel(capabilities, session, id) {
  const owner = capabilities.db.key(session.data.name),
    now = capabilities.now();
  if (
    state(capabilities).operations.some(
      (o) => o.owner === owner && o.kind === 'cancel' && o.id === id,
    )
  )
    return;
  transaction(capabilities, session, (w, playerData) => {
    const b = w.batches.find((b) => b.id === id && b.owner === owner);
    if (
      !b ||
      b.status !== 'queued' ||
      now >= b.startAt ||
      !capabilities.access(playerData, b.port).near
    )
      throw Error('Cancellation window closed or collection port out of range.');
    b.status = 'cancelled';
    b.returns = structuredClone(b.quote.inputs);
    playerData.credits += b.quote.fee - b.quote.cancelFee;
    recordEconomy(playerData, b.port, 'refunds', b.quote.fee - b.quote.cancelFee);
    receipt(w, owner, 'cancel', id, now, id);
  });
}
/** @param {C} capabilities @param {Session} session @param {number|undefined} n */
function fuelQuote(capabilities, session, n) {
  if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 1 || n > 30)
    throw Error('Invalid cells.');
  /** @type {FuelQuote|undefined} */ let q;
  transaction(capabilities, session, (w, playerData) => {
    const before = session.ent?.fuel ?? playerData.fuel ?? capabilities.fuelCapacity(playerData),
      capacity = capabilities.fuelCapacity(playerData),
      gain = n * R.fuelPerCell;
    if ((playerData.cargo.fuel_cells || 0) < n) throw Error('Not enough Fuel Cells.');
    if (before + gain > capacity)
      throw Error(`Each cell adds ${R.fuelPerCell} fuel; full cell would exceed capacity.`);
    const owner = capabilities.db.key(playerData.name),
      now = capabilities.now();
    q = {
      id: `f${w.nextId++}`,
      owner,
      n,
      gain,
      before,
      capacity,
      ship: `${playerData.ship.hull}:${playerData.ship.uid || ''}`,
      issuedAt: now,
      expires: now + R.quoteMs,
    };
    w.fuelQuotes = w.fuelQuotes.filter((x) => x.owner !== owner);
    w.fuelQuotes.push(q);
  });
  capabilities.send(session, { t: 'refineryFuelQuote', quote: q });
}
/** @param {C} capabilities @param {Session} session @param {RefineryRequest} m */
function fuel(capabilities, session, m) {
  const owner = capabilities.db.key(session.data.name);
  if (
    state(capabilities).operations.some(
      (o) => o.owner === owner && o.kind === 'fuel' && o.id === m.id,
    )
  )
    return;
  transaction(capabilities, session, (w, playerData) => {
    const q = w.fuelQuotes.find((q) => q.id === m.id && q.owner === owner),
      now = capabilities.now(),
      current = session.ent?.fuel ?? playerData.fuel ?? capabilities.fuelCapacity(playerData);
    if (
      !q ||
      now < q.issuedAt ||
      now >= q.expires ||
      !Number.isFinite(current) ||
      current < 0 ||
      current + q.gain > q.capacity ||
      q.capacity !== capabilities.fuelCapacity(playerData) ||
      q.ship !== `${playerData.ship.hull}:${playerData.ship.uid || ''}`
    )
      throw Error('Fuel quote stale; request a new binding quote.');
    applyTake(
      playerData.cargo,
      playerData.cargoLots,
      planTake(playerData.cargo, playerData.cargoLots, 'fuel_cells', q.n),
    );
    playerData.fuel = current + q.gain;
    receipt(w, owner, 'fuel', q.id, now, String(q.gain));
    w.fuelQuotes = w.fuelQuotes.filter((x) => x !== q);
  });
}
/** Bind economics into the opaque offer token; a paid authored slot never reopens on price drift.
 * @param {string} id */
function offerKey(id) {
  return id.slice(0, id.lastIndexOf(':'));
}
/** Finite sourcing orders share a persisted daily/event budget, never per-login inventory.
 * @param {C} capabilities @param {RefineryPlayer} playerData @param {string} port @returns {MiningOrder[]} */
function offers(capabilities, playerData, port) {
  if (!capabilities.access(playerData, port).available) return [];
  const now = capabilities.now(),
    rush = capabilities.rush(playerData.sys),
    window = Math.floor(now / R.orderWindowMs),
    key = rush
      ? `rush:${playerData.sys}:${rush.id}`
      : `order:${port}:${Math.floor(now / 86400000)}`,
    dem = state(capabilities).demand.find((x) => x.key === key);
  return ['common', 'rich', 'pure', 'compressed']
    .map((grade, i) => {
      const cid = grade === 'compressed' ? 'alloy_ingots' : ['ore', 'gas', 'shards'][i],
        qty = [8, 6, 3, 2][i],
        p = capabilities.pricing(playerData, port, cid, now),
        reward = Math.ceil(p.ask * qty * R.orderPremium + R.orderBase),
        id = `order:${port}:${window}:${i}:${rush?.id || 'normal'}:${reward}`;
      return {
        id,
        owner: '',
        port,
        cid,
        grade: grade === 'compressed' ? 'common' : grade,
        qty,
        reward,
        deadline: now + R.orderExpiryMs,
        status: /** @type {'accepted'} */ ('accepted'),
        demand: key,
        event: rush?.id || null,
      };
    })
    .filter(
      (o) =>
        !dem?.usedOffers.includes(offerKey(o.id)) &&
        (!dem ||
          (dem.input + dem.reserved + o.qty <= R.ordersDaily &&
            dem.paid + o.reward <= R.payoutDaily)),
    );
}
/** @param {C} capabilities @param {Session} session @param {RefineryRequest} m */
function order(capabilities, session, m) {
  const owner = capabilities.db.key(session.data.name),
    now = capabilities.now(),
    port = m.port || session.data.stellar;
  if (!port) throw Error('Dock to accept or deliver a sourcing order.');
  const offered =
    m.op === 'accept' ? offers(capabilities, session.data, port).find((o) => o.id === m.id) : null;
  transaction(capabilities, session, (w, playerData) => {
    if (
      m.op !== 'cancelOrder' &&
      (session.ent ||
        playerData.stellar !== port ||
        !capabilities.access(playerData, port).available)
    )
      throw Error('Order requires eligible docking.');
    if (m.op === 'accept') {
      if (!offered || playerData.missions.length >= 6) throw Error('Offer stale or six-job limit.');
      let dem = w.demand.find((d) => d.key === offered.demand);
      if (!dem) {
        dem = {
          key: offered.demand,
          input: 0,
          composite: 0,
          reserved: 0,
          paid: 0,
          sold: 0,
          usedOffers: [],
        };
        w.demand.push(dem);
      }
      if (
        dem.usedOffers.includes(offerKey(offered.id)) ||
        dem.input + dem.reserved + offered.qty > R.ordersDaily ||
        dem.paid + offered.reward > R.payoutDaily
      )
        throw Error('Finite order budget exhausted.');
      dem.reserved += offered.qty;
      dem.paid += offered.reward;
      dem.usedOffers.push(offerKey(offered.id));
      const o = { ...offered, owner };
      w.orders.push(o);
      playerData.missions.push({
        id: o.id,
        type: 'miningOrder',
        title: `Source ${o.qty}t ${o.grade} ${o.cid}`,
        sys: playerData.sys,
        dest: port,
        cid: o.cid,
        qty: o.qty,
        reward: o.reward,
        deadline: o.deadline,
        text: 'Exact-grade self-sourced order. Deliver explicitly at REFINERY; no virtual cargo.',
      });
    } else {
      const o = w.orders.find(
        (o) => o.id === m.id && o.owner === owner && o.port === port && o.status === 'accepted',
      );
      if (!o || now > o.deadline) throw Error('Order unavailable/expired.');
      const dem = w.demand.find((d) => d.key === o.demand);
      if (!dem) throw Error('Missing order reservation.');
      if (m.op === 'deliver') {
        const lots = {
          common: o.grade === 'common' ? o.qty : 0,
          rich: o.grade === 'rich' ? o.qty : 0,
          pure: o.grade === 'pure' ? o.qty : 0,
        };
        applyTake(
          playerData.cargo,
          playerData.cargoLots,
          planTake(playerData.cargo, playerData.cargoLots, o.cid, o.qty, lots),
        );
        playerData.credits += o.reward;
        playerData.stats ||= {};
        playerData.stats.earned = (playerData.stats.earned || 0) + o.reward;
        o.status = 'delivered';
        dem.input += o.qty;
      } else {
        o.status = 'cancelled';
        dem.paid -= o.reward;
      }
      dem.reserved -= o.qty;
      playerData.missions = playerData.missions.filter((x) => x.id !== o.id);
      receipt(w, owner, m.op || '', o.id, now, o.status);
    }
  });
}
/** @param {C} capabilities @param {Session} session */
function syncRush(capabilities, session) {
  for (const o of state(capabilities).orders)
    if (o.owner === capabilities.db.key(session.data.name) && o.status === 'delivered' && o.event) {
      const d = state(capabilities).demand.find((d) => d.key === o.demand);
      if (d) capabilities.rushProgress(session, o.event, d.input);
    }
}
export const RefineryOperations = {
  /** @this {C} @param {string} port @param {number} requested @param {number} [at] */
  sellRoom(port, requested, at = this.now()) {
    const key = `${port}:${Math.floor(at / 86400000)}`,
      d = state(this).demand.find((d) => d.key === key);
    return Math.max(0, Math.min(requested, R.compositeDaily - (d?.sold || 0)));
  },
  /** @this {C} @param {string} port @param {number} tonnes @param {number} [at] */
  sold(port, tonnes, at = this.now()) {
    integer(tonnes);
    const d = demand(state(this), port, at);
    if (tonnes < 0 || d.sold + tonnes > R.compositeDaily)
      throw Error('Composite buyer demand exhausted');
    d.sold += tonnes;
    this.db.touch();
  },

  /** @this {C} @param {number} milliseconds */
  resume(milliseconds) {
    for (const o of state(this).orders)
      if (o.status === 'accepted') o.deadline += Math.max(0, milliseconds);
    this.db.touch();
  },
  /** @this {C} */
  init() {
    if (this.db.world.refinery) validate(this.db.world.refinery);
    else {
      this.db.world.refinery = {
        version: 1,
        nextId: 1,
        fuelQuotes: [],
        quotes: [],
        batches: [],
        ready: [],
        operations: [],
        demand: [],
        orders: [],
      };
      this.db.touch();
    }
  },
  /** @this {C} @param {Session} session @returns {RefineryWire} */
  payload(session) {
    advance(this);
    syncRush(this, session);
    const w = state(this),
      owner = this.db.key(session.data.name),
      port = session.data.stellar || null,
      a = port ? this.access(session.data, port) : { available: false, home: false, faction: '' };
    return {
      port,
      available: a.available,
      home: a.home,
      faction: a.faction,
      now: this.now(),
      recipes: RECIPES,
      batches: w.batches.filter((b) => b.owner === owner),
      ready: w.ready.filter((b) => b.owner === owner),
      orders: w.orders.filter((o) => o.owner === owner && o.status === 'accepted'),
      offers: port ? offers(this, session.data, port) : [],
    };
  },
  /** @this {C} @param {Session} session @param {RefineryRequest} m @param {boolean} [orders] */
  command(session, m, orders = false) {
    const allowed = orders
      ? ['accept', 'deliver', 'cancelOrder']
      : ['quote', 'preview', 'submit', 'claim', 'cancel', 'returns', 'fuelQuote', 'fuel', 'list'];
    /** @type {Record<string,readonly string[]>} */
    const fields = {
      quote: ['t', 'op', 'port', 'recipe', 'grade', 'mode', 'n'],
      preview: ['t', 'op', 'port', 'recipe', 'grade', 'mode', 'n'],
      submit: ['t', 'op', 'id'],
      claim: ['t', 'op', 'port', 'recipe'],
      cancel: ['t', 'op', 'id'],
      returns: ['t', 'op', 'port', 'id'],
      fuelQuote: ['t', 'op', 'n'],
      fuel: ['t', 'op', 'id'],
      list: ['t', 'op'],
      accept: ['t', 'op', 'id', 'port'],
      deliver: ['t', 'op', 'id', 'port'],
      cancelOrder: ['t', 'op', 'id', 'port'],
    };
    if (
      !m ||
      !allowed.includes(m.op || '') ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(m)) ||
      Reflect.ownKeys(m).some((k) => typeof k !== 'string' || !fields[m.op || '']?.includes(k)) ||
      /** @type {const} */ (['id', 'port', 'recipe', 'grade', 'mode']).some(
        (k) => m[k] !== undefined && (typeof m[k] !== 'string' || m[k].length > 200),
      )
    )
      return;

    try {
      if (this.paused() || this.db.economicFrozen)
        throw Error('Economy paused or checkpoint recovery required.');
      if (orders) order(this, session, m);
      else if (m.op === 'quote') return quote(this, session, m);
      else if (m.op === 'preview') return quote(this, session, m, true);
      else if (m.op === 'submit') submit(this, session, m.id || '');
      else if (m.op === 'claim' || m.op === 'returns') collect(this, session, m);
      else if (m.op === 'cancel') cancel(this, session, m.id || '');
      else if (m.op === 'fuelQuote') return fuelQuote(this, session, m.n);
      else if (m.op === 'fuel') fuel(this, session, m);
      this.refresh(session);
      this.send(session, { t: 'refinery', op: m.op, data: this.payload(session) });
    } catch (e) {
      this.toast(session, e instanceof Error ? e.message : 'Refinery unavailable.');
      this.send(session, { t: 'refineryError', op: m.op });
    }
  },
};
