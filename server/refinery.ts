import type {
  FuelQuote,
  MiningOrder,
  RefineryPlayer,
  RefineryRequest,
} from './refinery-contracts.ts';
type RefineryCapabilities2 = import('./refinery-contracts.ts').RefineryCapabilities;
export type { RefineryCapabilities2 as C };
type SavedRefinery2 = import('./refinery-contracts.ts').SavedRefinery;
export type { SavedRefinery2 as W };
export type Session = import('./refinery-contracts.ts').RefinerySession;
export type Quote = import('./refinery-contracts.ts').RefineryQuote;
import { recordEconomy } from '../shared/economy-receipt.ts';
import {
  RECIPES,
  REFINERY_RULES as refineryRules,
  recovery,
  outputUnits,
  storedDuration,
  refineryFee,
} from '../shared/refinery-rules.ts';
import { assertLots, planTake, applyTake, addLots, commonLots } from '../shared/cargo-lots.ts';

function state(capabilities: RefineryCapabilities2): SavedRefinery2 {
  const savedRefinery = capabilities.db.world.refinery;
  if (!savedRefinery) throw Error('Refinery unavailable');
  return savedRefinery;
}

function integer(count: number) {
  if (!Number.isSafeInteger(count) || count < 0) throw Error('Invalid refinery integer');
}

function identity(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) throw Error('Invalid refinery identity');
}

function validate(savedRefinery: SavedRefinery2) {
  if (
    savedRefinery.version !== 1 ||
    !Array.isArray(savedRefinery.quotes) ||
    !Array.isArray(savedRefinery.fuelQuotes) ||
    !Array.isArray(savedRefinery.batches) ||
    !Array.isArray(savedRefinery.ready) ||
    !Array.isArray(savedRefinery.operations) ||
    !Array.isArray(savedRefinery.orders) ||
    !Array.isArray(savedRefinery.demand)
  )
    throw Error('Invalid refinery save/version');
  integer(savedRefinery.nextId);
  for (const fuelQuote of savedRefinery.fuelQuotes) {
    for (const value of [fuelQuote.id, fuelQuote.owner, fuelQuote.ship]) identity(value);
    for (const count of [fuelQuote.n, fuelQuote.gain, fuelQuote.issuedAt, fuelQuote.expires])
      integer(count);
    if (
      ![fuelQuote.before, fuelQuote.capacity].every((count) => Number.isFinite(count) && count >= 0)
    )
      throw Error('Invalid fuel state');
    if (
      !fuelQuote.owner ||
      fuelQuote.n < 1 ||
      fuelQuote.n > 30 ||
      fuelQuote.gain !== fuelQuote.n * refineryRules.fuelPerCell ||
      fuelQuote.before + fuelQuote.gain > fuelQuote.capacity
    )
      throw Error('Invalid fuel quote');
  }

  for (const refineryQuote of [
    ...savedRefinery.quotes,
    ...savedRefinery.batches.map((refineryBatch) => refineryBatch.quote),
  ]) {
    for (const value of [
      refineryQuote.id,
      refineryQuote.owner,
      refineryQuote.port,
      refineryQuote.fingerprint,
    ])
      identity(value);
    if (
      refineryQuote.version !== 1 ||
      !RECIPES.some(
        (recipe2) => recipe2.id === refineryQuote.recipe && recipe2.output === refineryQuote.output,
      ) ||
      !refineryQuote.owner ||
      !refineryQuote.port ||
      !['instant', 'stored'].includes(refineryQuote.mode)
    )
      throw Error('Invalid refinery quote');
    for (const value of [
      refineryQuote.units,
      refineryQuote.fee,
      refineryQuote.expires,
      refineryQuote.inputTonnes,
      refineryQuote.duration,
      refineryQuote.cancelFee,
    ])
      integer(value);
    const recipe = RECIPES.find((recipe2) => recipe2.id === refineryQuote.recipe);
    if (
      !recipe ||
      !Array.isArray(refineryQuote.inputs) ||
      refineryQuote.inputs.length !== recipe.inputs.length ||
      ![75, 80, 85, 95, 100].includes(refineryQuote.recovery) ||
      refineryQuote.inputTonnes < 1 ||
      (refineryQuote.preview !== undefined && typeof refineryQuote.preview !== 'boolean') ||
      refineryQuote.inputTonnes >
        (refineryQuote.mode === 'instant' ? refineryRules.instantCap : refineryRules.storedCap) ||
      refineryQuote.cancelFee > refineryQuote.fee ||
      typeof refineryQuote.fingerprint !== 'string'
    )
      throw Error('Invalid refinery quote schema');
    let tonnes = 0;
    for (const [index, input] of refineryQuote.inputs.entries()) {
      if (
        input.cid !== recipe.inputs[index] ||
        !input.lots ||
        Object.keys(input.lots).sort().join(',') !== 'common,pure,rich'
      )
        throw Error('Invalid refinery input');
      for (const count of Object.values(input.lots)) integer(count);
      if (recipe.pure && (input.lots.common || input.lots.rich || input.lots.pure % 3))
        throw Error('Invalid pure recipe');
      tonnes += Object.values(input.lots).reduce(
        (firstValue, secondValue) => firstValue + secondValue,
        0,
      );
    }
    if (
      recipe.pure &&
      refineryQuote.inputs.some(
        (refineryInput) => refineryInput.lots.pure !== refineryQuote.inputs[0].lots.pure,
      )
    )
      throw Error('Invalid unequal composite inputs');
    if (
      tonnes !== refineryQuote.inputTonnes ||
      refineryQuote.units !== outputUnits(tonnes, refineryQuote.recovery, recipe.pure)
    )
      throw Error('Invalid refinery entitlement');
  }
  for (const refineryBatch of savedRefinery.batches) {
    identity(refineryBatch.id);
    if (
      !['queued', 'processing', 'ready', 'collected', 'cancelled'].includes(refineryBatch.status) ||
      typeof refineryBatch.credited !== 'boolean' ||
      refineryBatch.owner !== refineryBatch.quote.owner ||
      refineryBatch.port !== refineryBatch.quote.port
    )
      throw Error('Invalid refinery batch');
    for (const count of [refineryBatch.submittedAt, refineryBatch.startAt, refineryBatch.readyAt])
      integer(count);
    if (
      !Array.isArray(refineryBatch.returns) ||
      refineryBatch.startAt !==
        refineryBatch.submittedAt +
          (refineryBatch.quote.mode === 'stored' ? refineryRules.queueMs : 0) ||
      refineryBatch.readyAt !== refineryBatch.startAt + refineryBatch.quote.duration ||
      refineryBatch.credited !== ['ready', 'collected'].includes(refineryBatch.status) ||
      (refineryBatch.status !== 'cancelled' && refineryBatch.returns.length) ||
      (refineryBatch.status === 'cancelled' &&
        refineryBatch.returns.length !== refineryBatch.quote.inputs.length)
    )
      throw Error('Invalid batch state');
    for (const [index, refineryInput] of refineryBatch.returns.entries()) {
      const source = refineryBatch.quote.inputs[index];
      if (
        !source ||
        refineryInput.cid !== source.cid ||
        !refineryInput.lots ||
        Object.keys(refineryInput.lots).sort().join(',') !== 'common,pure,rich'
      )
        throw Error('Invalid return escrow');
      for (const grade of ['common', 'rich', 'pure'] as const) {
        integer(refineryInput.lots[grade]);
        if (refineryInput.lots[grade] > source.lots[grade])
          throw Error('Invalid return entitlement');
      }
    }
  }
  for (const refineryReady of savedRefinery.ready) {
    for (const count of [
      refineryReady.units,
      refineryReady.producedUnits,
      refineryReady.claimedUnits,
    ])
      integer(count);
    if (
      refineryReady.units + refineryReady.claimedUnits !== refineryReady.producedUnits ||
      !refineryReady.owner ||
      !refineryReady.port ||
      !RECIPES.some((recipe) => recipe.output === refineryReady.cid)
    )
      throw Error('Invalid ready ledger');
  }
  for (const values of [
    savedRefinery.fuelQuotes.map((fuelQuote) => fuelQuote.id),
    savedRefinery.operations.map(
      (refineryReceipt) => `${refineryReceipt.owner}:${refineryReceipt.kind}:${refineryReceipt.id}`,
    ),
    savedRefinery.quotes.map((refineryQuote) => refineryQuote.id),
    savedRefinery.batches.map((refineryBatch) => refineryBatch.id),
    savedRefinery.ready.map(
      (refineryReady) => `${refineryReady.owner}:${refineryReady.port}:${refineryReady.cid}`,
    ),
    savedRefinery.demand.map((refineryDemand) => refineryDemand.key),
    savedRefinery.orders.map((miningOrder) => miningOrder.id),
  ])
    if (new Set(values).size !== values.length) throw Error('Duplicate refinery identity');
  for (const refineryReceipt of savedRefinery.operations) {
    for (const value of [refineryReceipt.id, refineryReceipt.owner, refineryReceipt.result])
      identity(value);
    integer(refineryReceipt.time);
    if (
      !['submit', 'cancel', 'fuel', 'accept', 'deliver', 'cancelOrder'].includes(
        refineryReceipt.kind,
      )
    )
      throw Error('Invalid refinery receipt');
  }
  for (const refineryDemand of savedRefinery.demand) {
    identity(refineryDemand.key);
    if (
      !Array.isArray(refineryDemand.usedOffers) ||
      new Set(refineryDemand.usedOffers).size !== refineryDemand.usedOffers.length
    )
      throw Error('Invalid used offers');
    for (const usedOffer of refineryDemand.usedOffers) identity(usedOffer);
    for (const count of [
      refineryDemand.input,
      refineryDemand.composite,
      refineryDemand.reserved,
      refineryDemand.paid,
      refineryDemand.sold,
    ])
      integer(count);
    if (
      refineryDemand.reserved !==
      savedRefinery.orders
        .filter(
          (miningOrder) =>
            miningOrder.demand === refineryDemand.key && miningOrder.status === 'accepted',
        )
        .reduce((count, miningOrder) => count + miningOrder.qty, 0)
    )
      throw Error('Invalid order reservation');
  }
  for (const miningOrder of savedRefinery.orders) {
    for (const count of [miningOrder.qty, miningOrder.reward, miningOrder.deadline]) integer(count);
    if (
      !['accepted', 'delivered', 'cancelled', 'expired'].includes(miningOrder.status) ||
      !['common', 'rich', 'pure'].includes(miningOrder.grade) ||
      !miningOrder.owner ||
      !miningOrder.port ||
      !miningOrder.qty
    )
      throw Error('Invalid mining order');
  }
}

function balance(savedRefinery: SavedRefinery2, owner: string, port: string, captainId: string) {
  let refineryReady = savedRefinery.ready.find(
    (refineryReady) =>
      refineryReady.owner === owner &&
      refineryReady.port === port &&
      refineryReady.cid === captainId,
  );
  if (!refineryReady) {
    refineryReady = { owner, port, cid: captainId, units: 0, producedUnits: 0, claimedUnits: 0 };
    savedRefinery.ready.push(refineryReady);
  }
  return refineryReady;
}

function advance(capabilities: RefineryCapabilities2) {
  if (capabilities.db.economicFrozen) return;
  const savedRefinery = state(capabilities),
    currentTime = capabilities.now();
  let changed = false;
  for (const refineryBatch of savedRefinery.batches) {
    if (refineryBatch.status === 'cancelled' || refineryBatch.credited) continue;
    if (currentTime >= refineryBatch.readyAt) {
      const ready = balance(
        savedRefinery,
        refineryBatch.owner,
        refineryBatch.port,
        refineryBatch.quote.output,
      );
      ready.units += refineryBatch.quote.units;
      ready.producedUnits += refineryBatch.quote.units;
      refineryBatch.credited = true;
      refineryBatch.status = 'ready';
      changed = true;
    } else if (currentTime >= refineryBatch.startAt && refineryBatch.status === 'queued') {
      refineryBatch.status = 'processing';
      changed = true;
    }
  }
  for (const miningOrder of savedRefinery.orders)
    if (miningOrder.status === 'accepted' && currentTime > miningOrder.deadline) {
      miningOrder.status = 'expired';
      const refineryDemand = savedRefinery.demand.find(
        (refineryDemand) => refineryDemand.key === miningOrder.demand,
      );
      if (refineryDemand) {
        refineryDemand.reserved -= miningOrder.qty;
        refineryDemand.paid -= miningOrder.reward;
      }
      const account = capabilities.db.get(miningOrder.owner) as RefineryPlayer | null;
      if (account)
        account.missions = account.missions.filter((mission) => mission.id !== miningOrder.id);
      changed = true;
    }
  if (changed) {
    capabilities.db.touch();
    try {
      capabilities.db.flush();
    } catch (event) {
      capabilities.db.economicFrozen = true;
      throw event;
    }
  }
}
/**
 * Bound settled history without discarding live escrow/reservations. IDs never recycle.
 */
function prune(savedRefinery: SavedRefinery2, currentTime: number) {
  savedRefinery.fuelQuotes = savedRefinery.fuelQuotes.filter(
    (fuelQuote) => fuelQuote.expires > currentTime,
  );
  for (const owner of new Set(savedRefinery.batches.map((refineryBatch) => refineryBatch.owner))) {
    const done = savedRefinery.batches.filter(
      (refineryBatch) =>
        refineryBatch.owner === owner &&
        (refineryBatch.credited ||
          (refineryBatch.status === 'cancelled' &&
            refineryBatch.returns.every(
              (refineryInput) => !Object.values(refineryInput.lots).some(Boolean),
            ))),
    );
    if (done.length > refineryRules.settledLimit) {
      const remove = new Set(done.slice(0, done.length - refineryRules.settledLimit));
      savedRefinery.batches = savedRefinery.batches.filter(
        (refineryBatch) => !remove.has(refineryBatch),
      );
    }
  }
  for (const owner of new Set(savedRefinery.orders.map((miningOrder) => miningOrder.owner))) {
    const done = savedRefinery.orders.filter(
      (miningOrder) => miningOrder.owner === owner && miningOrder.status !== 'accepted',
    );
    if (done.length > refineryRules.settledLimit) {
      const remove = new Set(done.slice(0, done.length - refineryRules.settledLimit));
      savedRefinery.orders = savedRefinery.orders.filter((miningOrder) => !remove.has(miningOrder));
    }
  }
  const active = new Set(
    savedRefinery.orders
      .filter((miningOrder) => miningOrder.status === 'accepted')
      .map((miningOrder) => miningOrder.demand),
  );
  savedRefinery.demand = savedRefinery.demand.filter((refineryDemand) =>
    active.has(refineryDemand.key) || refineryDemand.key.startsWith('rush:')
      ? active.has(refineryDemand.key) ||
        savedRefinery.orders.some(
          (miningOrder) =>
            miningOrder.demand === refineryDemand.key &&
            miningOrder.deadline > currentTime - 86400000,
        )
      : Number(refineryDemand.key.split(':').at(-1)) >= Math.floor(currentTime / 86400000) - 2,
  );
}

function demand(savedRefinery: SavedRefinery2, port: string, currentTime: number) {
  const entryKey = `${port}:${Math.floor(currentTime / 86400000)}`;
  let refineryDemand = savedRefinery.demand.find(
    (refineryDemand) => refineryDemand.key === entryKey,
  );
  if (!refineryDemand) {
    refineryDemand = {
      key: entryKey,
      input: 0,
      composite: 0,
      reserved: 0,
      paid: 0,
      sold: 0,
      usedOffers: [],
    };
    savedRefinery.demand.push(refineryDemand);
  }
  return refineryDemand;
}
/**
 * Transaction uses copies and the existing world+player checkpoint. No async gap.
 */
function transaction(
  capabilities: RefineryCapabilities2,
  session: Session,
  callback: (savedRefinery: SavedRefinery2, refineryPlayer: RefineryPlayer) => void,
) {
  if (capabilities.db.economicFrozen || capabilities.paused())
    throw Error('Economy paused; recover checkpoint before continuing.');
  const targets: [object, string[]][] = [
    [
      session.data,
      ['cargo', 'cargoLots', 'credits', 'fuel', 'missions', 'stats', 'economyReceipt'],
    ],
    [capabilities.db.world, ['refinery']],
  ];
  for (const [target, keys] of targets)
    for (const entryKey of keys) {
      const descriptor = Object.getOwnPropertyDescriptor(target, entryKey);
      if (
        descriptor
          ? !Object.hasOwn(descriptor, 'value') || !descriptor.writable
          : !Object.isExtensible(target)
      )
        throw Error('Refinery settlement target is not writable.');
    }
  advance(capabilities);
  const savedRefinery = state(capabilities),
    playerData = session.data,
    next = structuredClone(savedRefinery),
    player = structuredClone(playerData);
  // Flight fuel is authoritative; unrelated escrow actions must not restore the stale dock save.
  if (session.ent) player.fuel = session.ent.fuel;
  assertLots(player.cargo, player.cargoLots);
  callback(next, player);
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
  } catch (event) {
    if (capabilities.db.hasPendingCheckpoint()) capabilities.db.economicFrozen = true;
    else {
      Object.assign(playerData, prior);
      capabilities.db.world.refinery = savedRefinery;
      capabilities.db.touch();
    }
    throw event;
  }
  if (session.ent && typeof playerData.fuel === 'number') session.ent.fuel = playerData.fuel;
}

function receipt(
  savedRefinery: SavedRefinery2,
  owner: string,
  kind: string,
  identifier: string,
  currentTime: number,
  result: string,
) {
  if (
    savedRefinery.operations.some(
      (refineryReceipt) =>
        refineryReceipt.owner === owner &&
        refineryReceipt.kind === kind &&
        refineryReceipt.id === identifier,
    )
  )
    throw Error('Operation already settled.');
  savedRefinery.operations.push({ owner, kind, id: identifier, time: currentTime, result });
  const mine = savedRefinery.operations.filter(
    (refineryReceipt) => refineryReceipt.owner === owner,
  );
  if (mine.length > refineryRules.receiptLimit) {
    const remove = new Set(mine.slice(0, mine.length - refineryRules.receiptLimit));
    savedRefinery.operations = savedRefinery.operations.filter(
      (refineryReceipt) => !remove.has(refineryReceipt),
    );
  }
}

function economics(
  capabilities: RefineryCapabilities2,
  playerData: RefineryPlayer,
  port: string,
  identifiers: string[],
  currentTime: number,
) {
  return identifiers.map((captainId) =>
    capabilities.pricing(playerData, port, captainId, currentTime),
  );
}

function quote(
  capabilities: RefineryCapabilities2,
  session: Session,
  refineryRequest: RefineryRequest,
  preview = false,
) {
  const port = refineryRequest.port || session.data.stellar,
    recipe = RECIPES.find((recipe2) => recipe2.id === refineryRequest.recipe),
    count = refineryRequest.n,
    grade = refineryRequest.grade || 'common',
    mode = refineryRequest.mode || 'stored';
  if (
    !port ||
    !recipe ||
    typeof count !== 'number' ||
    !Number.isSafeInteger(count) ||
    !count ||
    count < 1 ||
    !['common', 'rich', 'pure'].includes(grade) ||
    !['instant', 'stored'].includes(mode)
  )
    throw Error('Invalid recipe/quantity.');
  const access2 = capabilities.access(session.data, port);
  if (!access2.available || session.data.stellar !== port || session.ent)
    throw Error('Dock at an eligible refinery.');
  if (recipe.inputs[0] === 'plasma' && grade !== 'common') throw Error('Plasma is ungraded cargo.');
  if (recipe.pure && grade !== 'pure') throw Error('Composite requires pure ore, gas and shards.');
  const total = recipe.inputs.length * count;
  if (
    total > (mode === 'instant' ? refineryRules.instantCap : refineryRules.storedCap) ||
    (recipe.pure && count % 3 !== 0)
  )
    throw Error('Service cap or complete composite recipe exceeded.');
  const inputs = recipe.inputs.map((captainId) => ({
    cid: captainId,
    lots: {
      common: grade === 'common' ? count : 0,
      rich: grade === 'rich' ? count : 0,
      pure: grade === 'pure' ? count : 0,
    },
  }));
  const currentTime = capabilities.now(),
    owner = capabilities.db.key(session.data.name),
    percent = recovery(access2.faction, access2.home, recipe),
    units = outputUnits(total, percent, recipe.pure),
    prices = economics(
      capabilities,
      session.data,
      port,
      [...recipe.inputs, recipe.output],
      currentTime,
    ),
    showConfirmation = prices
      .slice(0, -1)
      .reduce((value, position) => value + position.ask * count, 0),
    existing =
      state(capabilities).ready.find(
        (refineryReady) =>
          refineryReady.owner === owner &&
          refineryReady.port === port &&
          refineryReady.cid === recipe.output,
      )?.units || 0,
    bidPrice = prices[prices.length - 1].bid * Math.ceil((units + (existing % 300)) / 300),
    service =
      (access2.home
        ? refineryRules.homeFeePerTon
        : access2.faction === 'outlaw'
          ? refineryRules.outlawFeePerTon
          : refineryRules.publicFeePerTon) *
      total *
      (mode === 'stored' ? refineryRules.storedFeeFactor : 1),
    refineryFee2 = refineryFee(bidPrice, showConfirmation, service);
  let refineryQuote: Quote | undefined;
  transaction(capabilities, session, (savedRefinery) => {
    savedRefinery.quotes = savedRefinery.quotes.filter(
      (refineryQuote) => refineryQuote.expires > currentTime,
    );
    // UI previews replace only earlier UI previews; legacy explicitly issued quotes remain intact.
    if (preview)
      savedRefinery.quotes = savedRefinery.quotes.filter(
        (refineryQuote) => refineryQuote.owner !== owner || !refineryQuote.preview,
      );
    const mine = savedRefinery.quotes.filter((refineryQuote) => refineryQuote.owner === owner);
    if (mine.length >= refineryRules.maxQuotes) throw Error('Too many active quotes.');
    refineryQuote = {
      id: `q${savedRefinery.nextId++}`,
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
      fee: refineryFee2,
      cancelFee: Math.min(refineryFee2, refineryRules.cancelFee),
      expires: currentTime + refineryRules.quoteMs,
      duration: mode === 'instant' ? 0 : storedDuration(total),
      recovery: percent,
      fingerprint: JSON.stringify(prices),
      ask: showConfirmation,
      bid: bidPrice,
    };
    savedRefinery.quotes.push(refineryQuote);
  });
  capabilities.send(session, { t: 'refineryQuote', quote: refineryQuote });
}

function submit(capabilities: RefineryCapabilities2, session: Session, identifier: string) {
  const owner = capabilities.db.key(session.data.name),
    currentTime = capabilities.now();
  if (
    state(capabilities).operations.some(
      (refineryReceipt) =>
        refineryReceipt.owner === owner &&
        refineryReceipt.kind === 'submit' &&
        refineryReceipt.id === identifier,
    )
  )
    return;
  transaction(capabilities, session, (savedRefinery, playerData) => {
    const refineryQuote = savedRefinery.quotes.find(
      (refineryQuote) => refineryQuote.id === identifier && refineryQuote.owner === owner,
    );
    if (!refineryQuote || refineryQuote.expires < currentTime)
      throw Error('The refining price has expired. Check the updated cost and try again.');
    const access2 = capabilities.access(playerData, refineryQuote.port);
    if (!access2.available || playerData.stellar !== refineryQuote.port || session.ent)
      throw Error('Refinery access changed.');
    const recipe = RECIPES.find((recipe2) => recipe2.id === refineryQuote.recipe);
    if (!recipe) throw Error('Unknown recipe version.');
    const prices = economics(
      capabilities,
      playerData,
      refineryQuote.port,
      [...recipe.inputs, recipe.output],
      currentTime,
    );
    if (
      JSON.stringify(prices) !== refineryQuote.fingerprint ||
      recovery(access2.faction, access2.home, recipe) !== refineryQuote.recovery
    )
      throw Error('The refining price has changed. Check the updated cost and try again.');
    const refineryDemand = demand(savedRefinery, refineryQuote.port, currentTime);
    if (
      refineryDemand.input + refineryQuote.inputTonnes > refineryRules.dailyInput ||
      (recipe.pure &&
        refineryDemand.composite + refineryQuote.units > refineryRules.compositeDaily * 300)
    )
      throw Error('Daily processing demand exhausted.');
    if (
      savedRefinery.batches.filter(
        (refineryBatch) =>
          refineryBatch.owner === owner &&
          !refineryBatch.credited &&
          (refineryBatch.status !== 'cancelled' ||
            refineryBatch.returns.some((refineryInput) =>
              Object.values(refineryInput.lots).some(Boolean),
            )),
      ).length >= refineryRules.activeBatches
    )
      throw Error('Active batch limit.');
    if (playerData.credits < refineryQuote.fee) throw Error('Insufficient credits.');
    // Every mutation is on copies. A third-input failure cannot debit either of the first two.
    for (const refineryInput of refineryQuote.inputs)
      applyTake(
        playerData.cargo,
        playerData.cargoLots,
        planTake(
          playerData.cargo,
          playerData.cargoLots,
          refineryInput.cid,
          Object.values(refineryInput.lots).reduce(
            (firstValue, secondValue) => firstValue + secondValue,
            0,
          ),
          refineryInput.lots,
        ),
      );
    playerData.credits -= refineryQuote.fee;
    recordEconomy(playerData, refineryQuote.port, 'serviceFees', refineryQuote.fee);
    refineryDemand.input += refineryQuote.inputTonnes;
    if (recipe.pure) refineryDemand.composite += refineryQuote.units;
    const startAt = currentTime + (refineryQuote.mode === 'stored' ? refineryRules.queueMs : 0),
      batch = {
        id: `b${savedRefinery.nextId++}`,
        owner,
        port: refineryQuote.port,
        quote: refineryQuote,
        submittedAt: currentTime,
        startAt,
        readyAt: startAt + refineryQuote.duration,
        status: 'queued' as const,
        credited: false,
        returns: [],
      };
    savedRefinery.batches.push(batch);
    savedRefinery.quotes = savedRefinery.quotes.filter(
      (refineryQuote2) => refineryQuote2 !== refineryQuote,
    );
    receipt(savedRefinery, owner, 'submit', identifier, currentTime, batch.id);
    // Settled immutable history can be bounded; ready balances retain all fractional entitlement.
    const done = savedRefinery.batches.filter(
      (refineryBatch) =>
        refineryBatch.owner === owner &&
        refineryBatch.credited &&
        refineryBatch.returns.every(
          (refineryInput) => !Object.values(refineryInput.lots).some(Boolean),
        ),
    );
    if (done.length > refineryRules.settledLimit) {
      const trim = new Set(done.slice(0, done.length - refineryRules.settledLimit));
      savedRefinery.batches = savedRefinery.batches.filter(
        (refineryBatch) => !trim.has(refineryBatch),
      );
    }
  });
  advance(capabilities);
}

function collect(
  capabilities: RefineryCapabilities2,
  session: Session,
  refineryRequest: RefineryRequest,
) {
  const port = refineryRequest.port || session.data.stellar,
    owner = capabilities.db.key(session.data.name),
    recipe = RECIPES.find((recipe2) => recipe2.id === refineryRequest.recipe);
  if (!port || !capabilities.access(session.data, port).near)
    throw Error('Approach the collection marker within500 units.');
  transaction(capabilities, session, (savedRefinery, playerData) => {
    if (refineryRequest.op === 'claim') {
      if (!recipe) throw Error('Unknown output.');
      const refineryReady = balance(savedRefinery, owner, port, recipe.output),
        count = Math.min(Math.floor(refineryReady.units / 300), capabilities.room(playerData));
      if (!count) throw Error('Hold full or no whole output ready; fraction remains stored.');
      addLots(
        playerData.cargo,
        playerData.cargoLots,
        commonLots(recipe.output, count),
        capabilities.room(playerData),
      );
      refineryReady.units -= count * 300;
      refineryReady.claimedUnits += count * 300;
      if (!refineryReady.units)
        for (const batch of savedRefinery.batches)
          if (
            batch.owner === owner &&
            batch.port === port &&
            batch.quote.output === recipe.output &&
            batch.credited
          )
            batch.status = 'collected';
    } else {
      const refineryBatch = savedRefinery.batches.find(
        (refineryBatch) =>
          refineryBatch.id === refineryRequest.id &&
          refineryBatch.owner === owner &&
          refineryBatch.port === port,
      );
      if (!refineryBatch || refineryBatch.status !== 'cancelled')
        throw Error('No owned cancellation escrow.');
      let room = capabilities.room(playerData);
      for (const input of refineryBatch.returns) {
        const total = Object.values(input.lots).reduce(
            (firstValue, secondValue) => firstValue + secondValue,
            0,
          ),
          count = Math.min(total, room);
        if (!count) continue;
        const lots = { common: 0, rich: 0, pure: 0 };
        let left = count;
        for (const entryKey of ['common', 'rich', 'pure'] as const) {
          lots[entryKey] = Math.min(input.lots[entryKey], left);
          input.lots[entryKey] -= lots[entryKey];
          left -= lots[entryKey];
        }
        addLots(
          playerData.cargo,
          playerData.cargoLots,
          { cid: input.cid, qty: count, grades: lots },
          room,
        );
        room -= count;
      }
    }
  });
}

function cancel(capabilities: RefineryCapabilities2, session: Session, identifier: string) {
  const owner = capabilities.db.key(session.data.name),
    currentTime = capabilities.now();
  if (
    state(capabilities).operations.some(
      (refineryReceipt) =>
        refineryReceipt.owner === owner &&
        refineryReceipt.kind === 'cancel' &&
        refineryReceipt.id === identifier,
    )
  )
    return;
  transaction(capabilities, session, (savedRefinery, playerData) => {
    const refineryBatch = savedRefinery.batches.find(
      (refineryBatch) => refineryBatch.id === identifier && refineryBatch.owner === owner,
    );
    if (
      !refineryBatch ||
      refineryBatch.status !== 'queued' ||
      currentTime >= refineryBatch.startAt ||
      !capabilities.access(playerData, refineryBatch.port).near
    )
      throw Error('Cancellation window closed or collection port out of range.');
    refineryBatch.status = 'cancelled';
    refineryBatch.returns = structuredClone(refineryBatch.quote.inputs);
    playerData.credits += refineryBatch.quote.fee - refineryBatch.quote.cancelFee;
    recordEconomy(
      playerData,
      refineryBatch.port,
      'refunds',
      refineryBatch.quote.fee - refineryBatch.quote.cancelFee,
    );
    receipt(savedRefinery, owner, 'cancel', identifier, currentTime, identifier);
  });
}

function fuelQuote(
  capabilities: RefineryCapabilities2,
  session: Session,
  count: number | undefined,
) {
  if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1 || count > 30)
    throw Error('Invalid cells.');
  let fuelQuote: FuelQuote | undefined;
  transaction(capabilities, session, (savedRefinery, playerData) => {
    const before = session.ent?.fuel ?? playerData.fuel ?? capabilities.fuelCapacity(playerData),
      capacity = capabilities.fuelCapacity(playerData),
      gain = count * refineryRules.fuelPerCell;
    if ((playerData.cargo.fuel_cells || 0) < count) throw Error('Not enough Fuel Cells.');
    if (before + gain > capacity)
      throw Error(
        `Each cell adds ${refineryRules.fuelPerCell} fuel; full cell would exceed capacity.`,
      );
    const owner = capabilities.db.key(playerData.name),
      currentTime = capabilities.now();
    fuelQuote = {
      id: `f${savedRefinery.nextId++}`,
      owner,
      n: count,
      gain,
      before,
      capacity,
      ship: `${playerData.ship.hull}:${playerData.ship.uid || ''}`,
      issuedAt: currentTime,
      expires: currentTime + refineryRules.quoteMs,
    };
    savedRefinery.fuelQuotes = savedRefinery.fuelQuotes.filter(
      (fuelQuote3) => fuelQuote3.owner !== owner,
    );
    savedRefinery.fuelQuotes.push(fuelQuote);
  });
  capabilities.send(session, { t: 'refineryFuelQuote', quote: fuelQuote });
}

function fuel(
  capabilities: RefineryCapabilities2,
  session: Session,
  refineryRequest: RefineryRequest,
) {
  const owner = capabilities.db.key(session.data.name);
  if (
    state(capabilities).operations.some(
      (refineryReceipt) =>
        refineryReceipt.owner === owner &&
        refineryReceipt.kind === 'fuel' &&
        refineryReceipt.id === refineryRequest.id,
    )
  )
    return;
  transaction(capabilities, session, (savedRefinery, playerData) => {
    const fuelQuote = savedRefinery.fuelQuotes.find(
        (fuelQuote) => fuelQuote.id === refineryRequest.id && fuelQuote.owner === owner,
      ),
      currentTime = capabilities.now(),
      current = session.ent?.fuel ?? playerData.fuel ?? capabilities.fuelCapacity(playerData);
    if (
      !fuelQuote ||
      currentTime < fuelQuote.issuedAt ||
      currentTime >= fuelQuote.expires ||
      !Number.isFinite(current) ||
      current < 0 ||
      current + fuelQuote.gain > fuelQuote.capacity ||
      fuelQuote.capacity !== capabilities.fuelCapacity(playerData) ||
      fuelQuote.ship !== `${playerData.ship.hull}:${playerData.ship.uid || ''}`
    )
      throw Error('Fuel quote stale; request a new binding quote.');
    applyTake(
      playerData.cargo,
      playerData.cargoLots,
      planTake(playerData.cargo, playerData.cargoLots, 'fuel_cells', fuelQuote.n),
    );
    playerData.fuel = current + fuelQuote.gain;
    receipt(savedRefinery, owner, 'fuel', fuelQuote.id, currentTime, String(fuelQuote.gain));
    savedRefinery.fuelQuotes = savedRefinery.fuelQuotes.filter(
      (fuelQuote2) => fuelQuote2 !== fuelQuote,
    );
  });
}
/**
 * Bind economics into the opaque offer token; a paid authored slot never reopens on price drift.
 */
function offerKey(identifier: string) {
  return identifier.slice(0, identifier.lastIndexOf(':'));
}
/**
 * Finite sourcing orders share a persisted daily/event budget, never per-login inventory.
 */
function offers(
  capabilities: RefineryCapabilities2,
  playerData: RefineryPlayer,
  port: string,
): MiningOrder[] {
  if (!capabilities.access(playerData, port).available) return [];
  const currentTime = capabilities.now(),
    rush = capabilities.rush(playerData.sys),
    window = Math.floor(currentTime / refineryRules.orderWindowMs),
    entryKey = rush
      ? `rush:${playerData.sys}:${rush.id}`
      : `order:${port}:${Math.floor(currentTime / 86400000)}`,
    refineryDemand = state(capabilities).demand.find(
      (refineryDemand) => refineryDemand.key === entryKey,
    );
  return ['common', 'rich', 'pure', 'compressed']
    .map((grade, index) => {
      const captainId = grade === 'compressed' ? 'alloy_ingots' : ['ore', 'gas', 'shards'][index],
        quantity = [8, 6, 3, 2][index],
        pricing2 = capabilities.pricing(playerData, port, captainId, currentTime),
        reward = Math.ceil(
          pricing2.ask * quantity * refineryRules.orderPremium + refineryRules.orderBase,
        ),
        identifier = `order:${port}:${window}:${index}:${rush?.id || 'normal'}:${reward}`;
      return {
        id: identifier,
        owner: '',
        port,
        cid: captainId,
        grade: grade === 'compressed' ? 'common' : grade,
        qty: quantity,
        reward,
        deadline: currentTime + refineryRules.orderExpiryMs,
        status: 'accepted' as const,
        demand: entryKey,
        event: rush?.id || null,
      };
    })
    .filter(
      (options) =>
        !refineryDemand?.usedOffers.includes(offerKey(options.id)) &&
        (!refineryDemand ||
          (refineryDemand.input + refineryDemand.reserved + options.qty <=
            refineryRules.ordersDaily &&
            refineryDemand.paid + options.reward <= refineryRules.payoutDaily)),
    );
}

function order(
  capabilities: RefineryCapabilities2,
  session: Session,
  refineryRequest: RefineryRequest,
) {
  const owner = capabilities.db.key(session.data.name),
    currentTime = capabilities.now(),
    port = refineryRequest.port || session.data.stellar;
  if (!port) throw Error('Dock to accept or deliver a sourcing order.');
  const offered =
    refineryRequest.op === 'accept'
      ? offers(capabilities, session.data, port).find(
          (miningOrder) => miningOrder.id === refineryRequest.id,
        )
      : null;
  transaction(capabilities, session, (savedRefinery, playerData) => {
    if (
      refineryRequest.op !== 'cancelOrder' &&
      (session.ent ||
        playerData.stellar !== port ||
        !capabilities.access(playerData, port).available)
    )
      throw Error('Order requires eligible docking.');
    if (refineryRequest.op === 'accept') {
      if (!offered || playerData.missions.length >= 6) throw Error('Offer stale or six-job limit.');
      let refineryDemand = savedRefinery.demand.find(
        (refineryDemand) => refineryDemand.key === offered.demand,
      );
      if (!refineryDemand) {
        refineryDemand = {
          key: offered.demand,
          input: 0,
          composite: 0,
          reserved: 0,
          paid: 0,
          sold: 0,
          usedOffers: [],
        };
        savedRefinery.demand.push(refineryDemand);
      }
      if (
        refineryDemand.usedOffers.includes(offerKey(offered.id)) ||
        refineryDemand.input + refineryDemand.reserved + offered.qty > refineryRules.ordersDaily ||
        refineryDemand.paid + offered.reward > refineryRules.payoutDaily
      )
        throw Error('Finite order budget exhausted.');
      refineryDemand.reserved += offered.qty;
      refineryDemand.paid += offered.reward;
      refineryDemand.usedOffers.push(offerKey(offered.id));
      const options = { ...offered, owner };
      savedRefinery.orders.push(options);
      playerData.missions.push({
        id: options.id,
        type: 'miningOrder',
        title: `Source ${options.qty}t ${options.grade} ${options.cid}`,
        sys: playerData.sys,
        dest: port,
        cid: options.cid,
        qty: options.qty,
        reward: options.reward,
        deadline: options.deadline,
        text: 'Exact-grade self-sourced order. Deliver explicitly at REFINERY; no virtual cargo.',
      });
    } else {
      const miningOrder = savedRefinery.orders.find(
        (miningOrder) =>
          miningOrder.id === refineryRequest.id &&
          miningOrder.owner === owner &&
          miningOrder.port === port &&
          miningOrder.status === 'accepted',
      );
      if (!miningOrder || currentTime > miningOrder.deadline)
        throw Error('Order unavailable/expired.');
      const refineryDemand = savedRefinery.demand.find(
        (refineryDemand3) => refineryDemand3.key === miningOrder.demand,
      );
      if (!refineryDemand) throw Error('Missing order reservation.');
      if (refineryRequest.op === 'deliver') {
        const lots = {
          common: miningOrder.grade === 'common' ? miningOrder.qty : 0,
          rich: miningOrder.grade === 'rich' ? miningOrder.qty : 0,
          pure: miningOrder.grade === 'pure' ? miningOrder.qty : 0,
        };
        applyTake(
          playerData.cargo,
          playerData.cargoLots,
          planTake(playerData.cargo, playerData.cargoLots, miningOrder.cid, miningOrder.qty, lots),
        );
        playerData.credits += miningOrder.reward;
        playerData.stats ||= {};
        playerData.stats.earned = (playerData.stats.earned || 0) + miningOrder.reward;
        miningOrder.status = 'delivered';
        refineryDemand.input += miningOrder.qty;
      } else {
        miningOrder.status = 'cancelled';
        refineryDemand.paid -= miningOrder.reward;
      }
      refineryDemand.reserved -= miningOrder.qty;
      playerData.missions = playerData.missions.filter((mission) => mission.id !== miningOrder.id);
      receipt(
        savedRefinery,
        owner,
        refineryRequest.op || '',
        miningOrder.id,
        currentTime,
        miningOrder.status,
      );
    }
  });
}

function syncRush(capabilities: RefineryCapabilities2, session: Session) {
  for (const miningOrder of state(capabilities).orders)
    if (
      miningOrder.owner === capabilities.db.key(session.data.name) &&
      miningOrder.status === 'delivered' &&
      miningOrder.event
    ) {
      const refineryDemand = state(capabilities).demand.find(
        (refineryDemand) => refineryDemand.key === miningOrder.demand,
      );
      if (refineryDemand)
        capabilities.rushProgress(session, miningOrder.event, refineryDemand.input);
    }
}
export const RefineryOperations = {
  sellRoom(
    this: RefineryCapabilities2,
    port: string,
    requested: number,
    location: number = this.now(),
  ) {
    const entryKey = `${port}:${Math.floor(location / 86400000)}`,
      refineryDemand = state(this).demand.find((refineryDemand) => refineryDemand.key === entryKey);
    return Math.max(
      0,
      Math.min(requested, refineryRules.compositeDaily - (refineryDemand?.sold || 0)),
    );
  },

  sold(this: RefineryCapabilities2, port: string, tonnes: number, location: number = this.now()) {
    integer(tonnes);
    const refineryDemand = demand(state(this), port, location);
    if (tonnes < 0 || refineryDemand.sold + tonnes > refineryRules.compositeDaily)
      throw Error('Composite buyer demand exhausted');
    refineryDemand.sold += tonnes;
    this.db.touch();
  },

  resume(this: RefineryCapabilities2, milliseconds: number) {
    for (const miningOrder of state(this).orders)
      if (miningOrder.status === 'accepted') miningOrder.deadline += Math.max(0, milliseconds);
    this.db.touch();
  },

  init(this: RefineryCapabilities2) {
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

  payload(this: RefineryCapabilities2, session: Session) {
    advance(this);
    syncRush(this, session);
    const savedRefinery = state(this),
      owner = this.db.key(session.data.name),
      port = session.data.stellar || null,
      firstValue = port
        ? this.access(session.data, port)
        : { available: false, home: false, faction: '' };
    return {
      port,
      available: firstValue.available,
      home: firstValue.home,
      faction: firstValue.faction,
      now: this.now(),
      recipes: RECIPES,
      batches: savedRefinery.batches.filter((refineryBatch) => refineryBatch.owner === owner),
      ready: savedRefinery.ready.filter((refineryReady) => refineryReady.owner === owner),
      orders: savedRefinery.orders.filter(
        (miningOrder) => miningOrder.owner === owner && miningOrder.status === 'accepted',
      ),
      offers: port ? offers(this, session.data, port) : [],
    };
  },

  command(
    this: RefineryCapabilities2,
    session: Session,
    refineryRequest: RefineryRequest,
    orders: boolean = false,
  ) {
    const allowed = orders
      ? ['accept', 'deliver', 'cancelOrder']
      : ['quote', 'preview', 'submit', 'claim', 'cancel', 'returns', 'fuelQuote', 'fuel', 'list'];

    const fields: Record<string, readonly string[]> = {
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
      !refineryRequest ||
      !allowed.includes(refineryRequest.op || '') ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(refineryRequest)) ||
      Reflect.ownKeys(refineryRequest).some(
        (entryKey) =>
          typeof entryKey !== 'string' || !fields[refineryRequest.op || '']?.includes(entryKey),
      ) ||
      (['id', 'port', 'recipe', 'grade', 'mode'] as const).some(
        (entryKey) =>
          refineryRequest[entryKey] !== undefined &&
          (typeof refineryRequest[entryKey] !== 'string' || refineryRequest[entryKey].length > 200),
      )
    )
      return;

    try {
      if (this.paused() || this.db.economicFrozen)
        throw Error('Economy paused or checkpoint recovery required.');
      if (orders) order(this, session, refineryRequest);
      else if (refineryRequest.op === 'quote') return quote(this, session, refineryRequest);
      else if (refineryRequest.op === 'preview') return quote(this, session, refineryRequest, true);
      else if (refineryRequest.op === 'submit') submit(this, session, refineryRequest.id || '');
      else if (refineryRequest.op === 'claim' || refineryRequest.op === 'returns')
        collect(this, session, refineryRequest);
      else if (refineryRequest.op === 'cancel') cancel(this, session, refineryRequest.id || '');
      else if (refineryRequest.op === 'fuelQuote')
        return fuelQuote(this, session, refineryRequest.n);
      else if (refineryRequest.op === 'fuel') fuel(this, session, refineryRequest);
      this.refresh(session);
      this.send(session, { t: 'refinery', op: refineryRequest.op, data: this.payload(session) });
    } catch (event) {
      this.toast(session, event instanceof Error ? event.message : 'Refinery unavailable.');
      this.send(session, { t: 'refineryError', op: refineryRequest.op });
    }
  },
};
