// Quantum Rift 0.7 interface pieces: colonies, station defense, mastery, the arena, the exchange, leaderboards and profiles.
import { SYS, STELLARS, COMMODITIES, MATERIALS, GRADES } from '/shared/galaxy.js';
import {
  COLONY,
  COLONY_LEVELS,
  BUILDINGS,
  DEFENSE,
  MASTERY,
  masteryTier,
  ARENA,
  EXCHANGE,
  BOARDS,
} from '/shared/frontier.js';
import { credits } from '/shared/rules.js';

/**
 * @typedef {Object} ColonyData
 * @property {boolean} [open] Whether world is unsettled
 * @property {boolean} [own] Whether settled by player
 * @property {string} name Colony name
 * @property {string} [owner] Owner captain name
 * @property {number} lv Colony level
 * @property {string[]} buildings Installed building types
 * @property {Record<string, number>} store Stockpile resource amounts
 */

/**
 * @typedef {Object} ExchangeOrder
 * @property {string} id Order ID
 * @property {'buy'|'sell'} side Order side
 * @property {{id: string, name: string, cost: number}} item Order item specification
 * @property {number} qty Quantity
 * @property {number} price Unit price
 */

/**
 * @typedef {Object} ExchangeBookEntry
 * @property {{id: string, name: string, cost: number}} item Item spec
 * @property {number} [bid] Best bid price
 * @property {number} bids Number of bids
 * @property {number} [ask] Best ask price
 * @property {number} asks Number of asks
 */

/**
 * @typedef {Object} CaptainProfile
 * @property {string} name Captain name
 * @property {boolean} online Online status
 * @property {string} ship Current ship hull name
 * @property {string} shipName Custom ship name
 * @property {string} [site] Personal station site name
 * @property {number} [ops] Station Tier
 * @property {string[]} colonies List of settled colony names
 * @property {number} kills Total kills
 * @property {number} jumps Total jumps
 * @property {number} mined Total ore mined in tons
 * @property {number} earned Total credits earned
 * @property {{ rating: number, w: number, l: number }} [arena] Arena stats
 * @property {{ ship: string, tier: number }} [mastery] Best ship mastery
 * @property {number} officers Total officers
 */

/**
 * HTML-escapes a string safely for insertion into template strings.
 * @param {string | number | boolean | null | undefined} s Input value
 * @returns {string} Escaped HTML string
 */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );

/**
 * Formats a list of required material tuples with availability coloring.
 * @param {import('../server/game.js').PlayerData} y Player state object
 * @param {Array<[string, number, number]>} list Array of [material, grade, quantity] tuples
 * @returns {string} HTML markup
 */
const mats = (y, list) =>
  list
    .map(
      ([m, g, n]) =>
        `<span style="color:${y.mats[m][g] >= n ? '#8ff0ad' : '#ff9a8a'}">${n > 1 ? n + ' ' : ''}${m} ${GRADES[g]}</span>`,
    )
    .join(', ');

/**
 * Returns commodity display name by ID or 'credits'.
 * @param {string} id Commodity ID or 'credits'
 * @returns {string} Display name
 */
const com = (id) =>
  id === 'credits' ? 'credits' : (COMMODITIES.find((c) => c.id === id) || { name: id }).name;

/**
 * Formats buff percentage bonus properties into readable summary text.
 * @param {Record<string, number>} b Buff definition object
 * @returns {string} Formatted bonus text
 */
const buffText = (b) =>
  Object.entries(b)
    .map(([k, v]) => `+${v}${k === 'fuel' ? '' : '%'} ${k.replace('Pct', '')}`)
    .join(', ');

// ------------------------------------------------------------------ COLONY tab

/**
 * Renders the COLONY landed tab for founding, managing, stockpiling, and constructing buildings.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
export function colonyHtml(G) {
  const y = G.you,
    L = G.landed,
    C = L.colony,
    p = STELLARS[L.stellar];
  if (C.open)
    return `<div class="sect" style="margin-top:0">UNSETTLED WORLD</div><p>${esc(p.name)} has no flag. Settle it to build farms, mines, habitats and permanent-buff installations that work while you are away.</p>
    <div class="kv"><span>Charter</span><span>${credits(COLONY.cost)} cr + ${mats(y, COLONY.mats)}</span></div><div class="kv"><span>Your colonies</span><span>${y.colonies.length} of ${y.station.ops >= 5 ? COLONY.maxAtOps5 : COLONY.max}</span></div>
    <button class="btn" data-act="col" data-op="found">FOUND A COLONY</button>`;
  if (!C.own)
    return `<div class="sect" style="margin-top:0">${esc(C.name)}</div><p>Settled by Captain ${esc(C.owner)} (level ${C.lv}).</p>`;
  const Lv = COLONY_LEVELS[C.lv],
    next = COLONY_LEVELS[C.lv + 1];
  let h = `<div class="sect" style="margin-top:0">${esc(C.name.toUpperCase())} · LEVEL ${C.lv}</div><div class="kv"><span>Building slots</span><span>${C.buildings.length} / ${Lv.slots}</span></div><div class="kv"><span>Production</span><span>x${Lv.mult}</span></div>`;
  if (next)
    h += `<div class="kv"><span>Upgrade to level ${C.lv + 1}</span><span>${credits(next.cost)} + ${mats(y, next.mats)} <button class="btn sm" data-act="col" data-op="upgrade">UPGRADE</button></span></div>`;
  const store = Object.entries(C.store).filter(([, v]) => v >= 1);
  h += `<div class="sect">STOCKPILE</div>${store.length ? store.map(([k, v]) => `<div class="kv"><span>${esc(com(k))}</span><span>${k === 'credits' ? credits(v) : v + ' t'}</span></div>`).join('') + '<button class="btn sm" data-act="col" data-op="collect">COLLECT</button>' : '<p class="dim small">Nothing yet. Stockpiles hold a day of production.</p>'}`;
  h +=
    '<div class="sect">BUILDINGS</div>' +
    (C.buildings
      .map(
        (b, i) =>
          `<div class="kv"><span><b>${esc(BUILDINGS[b].name)}</b> <span class="dim small">${
            BUILDINGS[b].produce
              ? Object.entries(BUILDINGS[b].produce)
                  .map(
                    ([k, v]) =>
                      `${k === 'credits' ? credits(v * Lv.mult) + ' cr' : (v * Lv.mult).toFixed(1) + ' t ' + com(k)}/h`,
                  )
                  .join(', ')
              : buffText(BUILDINGS[b].buff)
          }</span></span><span><button class="btn sm" data-act="col" data-op="demolish" data-i="${i}">DEMOLISH</button></span></div>`,
      )
      .join('') || '<p class="dim small">No buildings.</p>');
  if (C.buildings.length < Lv.slots)
    h +=
      '<div class="sect">BUILD</div>' +
      Object.entries(BUILDINGS)
        .filter(([k, B]) => !(B.buff && C.buildings.includes(k)))
        .map(
          ([k, B]) =>
            `<div class="kv"><span><b>${esc(B.name)}</b> <span class="dim small">${esc(B.desc)}</span></span><span>${credits(B.cost)} <button class="btn sm" data-act="col" data-op="build" data-kind="${k}">BUILD</button></span></div>`,
        )
        .join('');
  h +=
    '<div style="margin-top:8px"><button class="btn sm" data-act="col" data-op="abandon">ABANDON COLONY</button></div>';
  return h;
}

// ------------------------------------------------------------------ station defense (inside the station dashboard)

/**
 * Renders the Station Defense rating, turret upgrades, and Station Holdout wave defense interface.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @param {boolean} [interactive] Whether interactive actions are enabled
 * @returns {string} HTML markup
 */
export function defenseHtml(G, interactive) {
  const y = G.you,
    S = y.station;
  if (S.ops < DEFENSE.minOps) return '';
  const lv = S.defense || 0,
    next = DEFENSE.levels[lv + 1];
  let h = `<div class="sect">DEFENSE</div><div class="kv"><span>Defense rating</span><span><b>${y.defense}</b> <span class="dim small">(turrets level ${lv})</span></span></div><div class="dim small">Raiders hit Personal Stations every ${DEFENSE.everyH} hours. If you are in the system they attack live and you can fight them off; otherwise the turrets decide it. A lost raid loots the refinery and some low-grade crates.</div>`;
  const H = y.holdout || { best: 0, lastT: 0 },
    wait = (H.lastT || 0) + 2 * 3600000 - Date.now();
  h += `<div class="sect">STATION HOLDOUT</div><div class="dim small">Defend your Personal Station through ten escalating waves, with your ship, your wingmates and ${1 + Math.min(5, lv)} defense platforms (more with turret levels). The rewards grow with every wave: credits, crates, Bulwark blueprints, and a grade V crate for beating all ten. You can start one every 2 hours.${G.solo ? '' : ' Your Armada is called when it starts: every member who flies in adds hostiles to each wave and shares the rewards.'}</div>
    <div class="kv"><span>Best: wave ${H.best || 0} of 10</span><span>${H.active ? `<b style="color:#ff8a70">in progress: wave ${H.wave}</b>` : wait > 0 ? `<span class="dim">ready in ${Math.ceil(wait / 60000)} min</span>` : interactive ? '<button class="btn sm" data-act="holdout">START HOLDOUT</button>' : '<span class="dim">land at your station to start</span>'}</span></div>`;
  if (next)
    h += `<div class="kv"><span>Turrets level ${lv + 1} (+${next.rating - DEFENSE.levels[lv].rating})</span><span>${credits(next.cost)} + ${mats(y, next.mats)}${interactive ? ' <button class="btn sm" data-act="st" data-op="defense">UPGRADE</button>' : ''}</span></div>`;
  return h;
}

// ------------------------------------------------------------------ mastery (overview)

/**
 * Renders the ship mastery overview tier stars, XP progress bar, and active hull bonuses.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
export function masteryHtml(G) {
  const y = G.you,
    xp = (y.mastery || {})[y.ship.hull] || 0,
    t = masteryTier(xp),
    nx = MASTERY.tiers[t];
  const stars = '★'.repeat(t) + '☆'.repeat(5 - t);
  return `<div class="sect">SHIP MASTERY</div><div class="kv"><span><span style="color:#ffd27a">${stars}</span> Tier ${t}</span><span class="small">${nx !== undefined ? `${Math.floor(xp)} / ${nx} xp` : 'mastered'}</span></div>${nx !== undefined ? `<div class="xpbar"><i style="width:${Math.min(100, (100 * (xp - MASTERY.tiers[t - 1])) / (nx - MASTERY.tiers[t - 1]))}%"></i></div>` : ''}<div class="dim small">${buffText(MASTERY.bonus[t]) || 'Fly this hull to unlock bonuses.'}${t >= 5 ? ' · gold trim' : ''}</div>`;
}

// ------------------------------------------------------------------ ARENA tab

/**
 * Renders the Crucible arena queue, current matchmaking rating, and record.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
export function arenaHtml(G) {
  const A = G.you.arena || { rating: ARENA.start, w: 0, l: 0, sizes: {} };
  let h = `<div class="sect" style="margin-top:0">THE CRUCIBLE</div><p>Rated team fights in an instanced arena, away from the open galaxy. You fly your current ship without wingmates or escorts. Losing costs no insurance, and the arena crew repair you for free. The last team flying wins. If time runs out, the team with the most hull and shields left wins.</p>
    <div class="kv"><span>Your rating</span><span><b>${A.rating}</b> <span class="dim small">${A.w} W · ${A.l} L</span></span></div>`;
  for (const [mode, n] of Object.entries(ARENA.modes))
    h += `<div class="kv"><span><b>${mode}</b> <span class="dim small">${(A.sizes || {})[mode] || 0} queued, ${n * 2} needed</span></span><span>${A.queued === mode ? '<button class="btn sm" data-act="arena" data-op="leave">LEAVE QUEUE</button>' : `<button class="btn sm" data-act="arena" data-op="queue" data-mode="${mode}">QUEUE</button>`}</span></div>`;
  h += `<div class="dim small">Winners earn ${credits(15000)} credits per team member slot. Rating moves with each result (Elo).</div>`;
  return h;
}

// ------------------------------------------------------------------ EXCHANGE tab

/**
 * Renders the player-to-player market exchange order book, active orders, and storage hold.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
export function exchangeHtml(G) {
  const y = G.you,
    X = G.landed.exchange;
  const opts =
    MATERIALS.flatMap((m) =>
      GRADES.map((g, i) => `<option value="mat:${m}:${i}">${m} ${g} crate</option>`),
    ).join('') +
    COMMODITIES.map((c) => `<option value="com:${c.id}">${esc(c.name)}</option>`).join('');
  let h = `<div class="sect" style="margin-top:0">THE EXCHANGE</div><div class="dim small">Player-to-player orders shared across every market in the Rift. Sell orders hold your goods in escrow, and buy orders hold your credits. Crossing orders fill at the resting price, and sellers pay a ${EXCHANGE.fee * 100}% fee. Bought commodities wait in exchange storage, and crates go straight to your stock.</div>
    <div class="rrow"><select id="xitem">${opts}</select><select id="xside"><option value="sell">SELL</option><option value="buy">BUY</option></select><input id="xqty" type="number" min="1" value="1" style="width:70px" title="quantity"><input id="xprice" type="number" min="1" placeholder="price each" style="width:110px"><button class="btn sm" data-act="xplace">PLACE</button></div>`;
  const name = (it) => (it.kind === 'mat' ? `${it.mat} ${GRADES[it.grade]}` : com(it.cid));
  h +=
    '<div class="sect">ORDER BOOK</div>' +
    (X.book.length
      ? `<table class="tbl"><tr><th>ITEM</th><th>BEST BID</th><th>BIDS</th><th>BEST ASK</th><th>ASKS</th></tr>${X.book.map((b) => `<tr><td>${esc(name(b.item))}</td><td class="lo">${b.bid ? credits(b.bid) : '-'}</td><td>${b.bids}</td><td class="hi">${b.ask ? credits(b.ask) : '-'}</td><td>${b.asks}</td></tr>`).join('')}</table>`
      : '<p class="dim">No orders yet.</p>');
  h +=
    `<div class="sect">YOUR ORDERS (${X.mine.length}/${EXCHANGE.maxOrders})</div>` +
    (X.mine
      .map(
        (o) =>
          `<div class="kv"><span>${o.side.toUpperCase()} ${o.qty} ${esc(name(o.item))} @ ${credits(o.price)}</span><span><button class="btn sm" data-act="xcancel" data-id="${o.id}">CANCEL</button></span></div>`,
      )
      .join('') || '<p class="dim small">None.</p>');
  const st = Object.entries(X.storage || {});
  if (st.length)
    h +=
      '<div class="sect">EXCHANGE STORAGE</div>' +
      st
        .map(([k, v]) => `<div class="kv"><span>${esc(com(k))}</span><span>${v} t</span></div>`)
        .join('') +
      '<button class="btn sm" data-act="xcollect">LOAD INTO HOLD</button>';
  h += `<div class="sect">SEND CREDITS</div><div class="rrow"><input id="xto" placeholder="captain name" maxlength="20"><input id="xamt" type="number" min="1000" placeholder="credits" style="width:120px"><button class="btn sm" data-act="xsend">SEND</button></div>`;
  return h;
}

// ------------------------------------------------------------------ leaderboards + profile (community tab)

/**
 * Renders the galactic community leaderboards and captain profile lookup.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
export function boardsHtml(G) {
  const cat = G.boardCat || 'earned',
    B = G.boards && G.boards[cat];
  let h = `<div class="sect">LEADERBOARDS</div><div class="chips">${Object.entries(BOARDS)
    .map(
      ([k, b]) =>
        `<span class="chip ${k === cat ? 'on' : ''}" data-act="board" data-cat="${k}">${b.name}</span>`,
    )
    .join('')}</div>`;
  h += B
    ? `<table class="tbl"><tr><th>#</th><th>CAPTAIN</th><th>${esc(BOARDS[cat].name.toUpperCase())}</th></tr>${B.map((r, i) => `<tr><td>${i + 1}</td><td><a href="#" data-act="prof" data-n="${esc(r.name)}">${r.fleet ? `[${esc(r.fleet)}] ` : ''}${esc(r.name)}</a>${r.ai ? ' <span class="aitag">captain</span>' : ''}</td><td>${cat === 'earned' ? credits(r.v) : r.v.toLocaleString()}</td></tr>`).join('')}</table>`
    : '<p class="dim small">Loading...</p>';
  h += `<div class="rrow"><input id="profq" placeholder="Look up a captain"><button class="btn sm" data-act="profgo">PROFILE</button></div>`;
  const P = G.prof;
  if (P)
    h += `<div class="ocard"><div class="oname"><b style="font-size:15px">${esc(P.name)}</b> ${P.online ? '<span style="color:var(--ok)">● online</span>' : '<span class="dim">offline</span>'}</div>
    <div class="kv"><span>Flies</span><span>${esc(P.ship)} "${esc(P.shipName)}"</span></div><div class="kv"><span>Station</span><span>${P.site ? `${esc(P.site)} · Station Tier ${P.ops}` : 'none'}</span></div>
    <div class="kv"><span>Colonies</span><span>${P.colonies.map(esc).join(', ') || 'none'}</span></div><div class="kv"><span>Record</span><span>${P.kills} kills · ${P.jumps} jumps · ${P.mined} t mined · ${credits(P.earned)} earned</span></div>
    <div class="kv"><span>Arena</span><span>${P.arena ? `${P.arena.rating} (${P.arena.w}-${P.arena.l})` : 'unrated'}</span></div>${P.mastery ? `<div class="kv"><span>Best mastery</span><span>${esc(P.mastery.ship)} · Tier ${P.mastery.tier}</span></div>` : ''}<div class="kv"><span>Officers</span><span>${P.officers}</span></div></div>`;
  return h;
}
