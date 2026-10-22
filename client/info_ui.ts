import type { StellarBody } from '../server/game.ts';
import type { ClientGameState } from './main.ts';
export type InfoTab = 'ship' | 'career' | 'fleet' | 'captains';
export type BestSaleResult = { p: StellarBody; price: number; jumps: number };
export type RivalCaptain = {
  name: string;
  kind: string;
  fac: string;
  ship: string;
  sys?: string | null;
  mood: 'nemesis' | 'rival' | 'neutral' | 'friendly' | 'ally';
  rel: number;
};
export type ShipStats = {
  shield: number;
  armor: number;
  maxSpeed: number;
  turn: number;
  cargo: number;
  space: number;
  free: number;
  guns: number;
  maxGuns: number;
  turrets: number;
  maxTurrets: number;
};

import { escapeDoubleQuotedHtml as esc } from './html.ts';
import { artworkUrl } from './artwork.ts';
// the ship and captain panel (I), the player information view: your ship, cargo (with jettison), combat
// rating, fleet orders, and the rival captains of the Rift with how they feel about you.
import { SYS, SYSTEMS, STELLARS, FACTIONS, COMMODITIES, MATERIALS } from '../shared/galaxy.ts';
import { SPEC, BP_NEED } from '../shared/specialty.ts';
import { RARITY } from '../shared/hangar.ts';
import { RANKS } from '../shared/rivals.ts';
import { synBadge } from './syn_ui.ts';
import { price } from '../shared/rules.ts';

/** @import { StellarBody } from '../server/game.ts' */
/** @import { ClientGameState } from './main.ts' */

/**
 * @typedef {'ship' | 'career' | 'fleet' | 'captains'} InfoTab
 */

/**
 * @typedef {Object} BestSaleResult
 * @property {StellarBody} p Stellar body object
 * @property {number} price Commodity price per ton
 * @property {number} jumps Jumps distance
 */

/**
 * @typedef {Object} RivalCaptain
 * @property {string} name Captain name
 * @property {string} kind Career type
 * @property {string} fac Faction identifier
 * @property {string} ship Ship hull name
 * @property {string|null} [sys] Current system ID
 * @property {'nemesis'|'rival'|'neutral'|'friendly'|'ally'} mood Standing category
 * @property {number} rel Standing relationship score
 */

/**
 * @typedef {Object} ShipStats
 * @property {number} shield Shield strength
 * @property {number} armor Armor strength
 * @property {number} maxSpeed Maximum forward speed
 * @property {number} turn Turn rate
 * @property {number} cargo Cargo capacity in tons
 * @property {number} space Total outfit space
 * @property {number} free Available free outfit space
 * @property {number} guns Equipped gun count
 * @property {number} maxGuns Maximum gun mounts
 * @property {number} turrets Equipped turret count
 * @property {number} maxTurrets Maximum turret mounts
 */

/**
 * Formats a number to rounded, localized string.
 * @param {number} n Input number
 * @returns {string} Formatted number string
 */
const cr = (n: number): string => Math.round(n).toLocaleString();
const ORD = [
  ['gather', 'Form up', 'G'],
  ['attack', 'Attack my target', 'K'],
  ['hold', 'Hold position', 'H'],
  ['holdfire', 'Hold fire', 'Y'],
  ['loot', 'Collect loot', 'U'],
];
const MOODC = {
  nemesis: '#ff5a4a',
  rival: '#ff9a6a',
  neutral: '#aab',
  friendly: '#9fd0ff',
  ally: '#6aff9a',
};

/**
 * Renders the Info panel (I key) including ship stats, cargo jettison, career ledger, wingmate orders, and rival captains.
 * @param {ClientGameState} G Game state object
 * @param {InfoTab|string} [tab] Sub-tab to render ('ship', 'career', 'fleet', or 'captains')
 * @returns {string} HTML markup
 */
export function infoHtml(G: ClientGameState, tab?: string): string {
  const y = G.you!;
  if (!y) return '';
  const st = y.shipStats!,
    H = G.A!.ships[y.ship.hull],
    rank = y.rank || { name: 'Harmless', score: 0, next: 400, i: 0 };
  if (tab === 'ship') {
    const cargo = Object.entries(y.cargo || {}).filter(([, n]) => n > 0),
      inSpace = !!G.view && !G.landed;
    const bar = rank.next
      ? Math.min(100, (100 * (rank.score - RANKS[rank.i][0])) / (rank.next - RANKS[rank.i][0]))
      : 100;
    return `<div class="igrid"><div>
      <div class="sect" style="margin-top:0">SHIP</div>
      ${
        y.shipless
          ? '<p class="dim">No active ship.</p>'
          : `<div style="display:flex;gap:10px;align-items:center"><img src="${artworkUrl(H.img!)}" style="width:120px;height:90px;object-fit:contain"><div><b style="color:#fff;font-size:15px">${esc(H.name)}</b><div class="dim">"${esc(y.ship.name)}"</div></div></div>
      <div class="kv"><span>Shield / armor</span><span>${cr(st.shield)} / ${cr(st.armor)}</span></div><div class="kv"><span>Speed / turn</span><span>${cr(st.maxSpeed / 0.45)} / ${cr((st.turn * 57.3) / 3)}</span></div>
      <div class="kv"><span>Cargo</span><span>${y.cargoUsed} / ${st.cargo} t</span></div><div class="kv"><span>Passenger seats</span><span>${(y.missions || []).filter((m) => m.type === 'passenger').reduce((sum, m) => sum + (m.pax || 0), 0)} / ${st.passengerSeats} occupied</span></div><div class="kv"><span>Outfit space</span><span>${st.free} of ${st.space} free</span></div>
      <div class="kv"><span>Guns / turrets</span><span>${st.guns}/${st.maxGuns} · ${st.turrets}/${st.maxTurrets}</span></div><div class="kv"><span>Fuel</span><span>${Math.floor(((G.view && G.view.fuel) ?? y.fuel) / 100)} jumps</span></div>`
      }
      <div class="sect">COMBAT RATING</div><div class="kv"><span><b style="color:#ffd27a">${esc(rank.name)}</b></span><span class="dim">${cr(rank.score)}${rank.next ? ` / ${cr(rank.next)}` : ''}</span></div>
      <div class="rbar"><i style="width:${bar}%"></i></div><div class="dim small">Destroying ships raises your rating. Competent captains are offered Wanted contracts, and Dangerous ones get elite contracts.</div>
      <div class="sect">RECORD</div>${synBadge(y)}<div class="kv"><span>Commendations</span><span>${y.shards || 0}</span></div>
      <div class="kv"><span>Credit rating</span><span>${y.credit || 600}${y.loan ? ` · loan ${cr(y.loan.bal)} cr` : ''}</span></div>
      <div class="kv"><span>Faction stories</span><span>${(y.arcs || []).filter((a) => a.done).length} of ${(y.arcs || []).length} complete</span></div>
      <div class="kv"><span>Farside expeditions</span><span>${(y.expd && y.expd.n) || 0} decoded</span></div>
    </div><div>
      <div class="sect" style="margin-top:0">CARGO</div>
      ${
        cargo.length
          ? cargo
              .map(([c, n]) => {
                const C = COMMODITIES.find((x) => x.id === c);
                const B = bestSale(G, c);
                const grades = Object.entries(y.cargoLots?.byCommodity[c] || {})
                  .filter(([, q]) => q > 0)
                  .map(
                    ([g, q]) =>
                      `<div class="kv small"><span>↳ ${g}</span><span>${q} t ${inSpace ? `<button class="btn sm" data-jet="${c}" data-grade="${g}" data-n="${Math.min(5, q)}">DUMP ${Math.min(5, q)}</button> <button class="btn sm" data-jet="${c}" data-grade="${g}" data-n="${q}">DUMP ALL ${g.toUpperCase()}</button>` : ''}</span></div>`,
                  )
                  .join('');
                return `<div class="kv"><span>${esc(C ? C.name : c)}${B ? `<div class="small dim">Best nearby: <b style="color:var(--cr)">${cr(B.price)}</b> at ${esc(B.p.name)}${B.jumps ? ` (${B.jumps} jump${B.jumps > 1 ? 's' : ''})` : ' (this system)'}${y.paid && y.paid[c] ? ` · you paid ${cr(y.paid[c])}` : ''} ${B.jumps ? `<button class="btn sm" data-plot="${B.p.system}">PLOT</button>` : ''}</div>` : '<div class="small dim">No market you have visited nearby buys this.</div>'}</span><span>${n} t ${inSpace ? `<button class="btn sm" data-jet="${c}" data-n="${Math.min(5, n)}">DUMP 5</button> <button class="btn sm" data-jet="${c}" data-n="0">DUMP ALL</button>` : ''}</span></div>${grades}`;
              })
              .join('')
          : '<p class="dim">The hold is empty.</p>'
      }
      ${cargo.length ? `<div class="dim small">${inSpace ? 'Jettisoned cargo floats free. Raiders chasing you often go for it instead.' : 'You can jettison cargo in space.'}</div>` : ''}
      <div class="sect">MISSION CARGO</div>${
        (y.missions || [])
          .filter((m) => m.qty)
          .map((m) => `<div class="kv"><span>${esc(m.title)}</span><span>${m.qty} t</span></div>`)
          .join('') || '<p class="dim">None.</p>'
      }
    </div></div>`;
  }
  if (tab === 'career') return careerHtml(G); // 2.4
  if (tab === 'fleet') {
    const ord = G.order || 'gather';
    return `<div class="sect" style="margin-top:0">WINGMATE ORDERS</div><div class="dim small" style="margin-bottom:6px">Orders apply to your escorts, wingmates and fighters. Give the same order again to cancel it.</div>
      <div class="ords">${ORD.map(([k, n, key]) => `<button class="btn ${ord === k ? 'on' : ''}" data-ord="${k}">${n} <span class="dim small">(${key})</span></button>`).join('')}</div>
      <div class="sect">WINGMATES${y.docks ? ` · DOCK ${y.docks.list[y.docks.active].letter}` : ''}</div>${(() => {
        const k = y.docks && y.docks.list[y.docks.active],
          ws = k ? k.wings.filter(Boolean) : [];
        return ws.length
          ? ws
              .map((w) => {
                const E = G.A!.ships[w!.hull] || {};
                return `<div class="kv"><span><img src="${artworkUrl(E.img!)}" style="width:40px;height:28px;object-fit:contain;vertical-align:middle"> ${esc(w!.name)}</span><span class="dim">${w!.repairT ? 'under repair' : esc(E.name)}</span></div>`;
              })
              .join('')
          : '<p class="dim">No wingmates in your active dock. Assign stored ships as wingmates at your Personal Station (STATION, then DOCKS).</p>';
      })()}`;
  }
  // captains
  const list = (G.rivals || []).slice().sort((a, b) => b.rel - a.rel),
    seen = new Set(y.explored || []);
  return `<div class="dim small" style="margin-bottom:6px">Thirty captains with careers of their own. Hail them (T) to talk. Help them in a fight and they warm to you; fire on them and they will remember.</div>
    <table class="tbl"><tr><th>CAPTAIN</th><th>CAREER</th><th>FLAG</th><th>SHIP</th><th>LAST SEEN</th><th>STANDING</th></tr>${list
      .map(
        (
          r,
        ) => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.kind)}</td><td><span style="color:${FACTIONS[r.fac] ? FACTIONS[r.fac].color : '#aaa'}">${esc(FACTIONS[r.fac] ? FACTIONS[r.fac].short : r.fac)}</span></td><td>${esc(r.ship)}</td>
      <td>${r.sys ? (seen.has(r.sys) ? esc(SYS[r.sys].name) : '<span class="dim">uncharted space</span>') : '<span class="dim">grounded</span>'}</td><td style="color:${MOODC[r.mood]}">${r.mood[0].toUpperCase() + r.mood.slice(1)} (${r.rel})</td></tr>`,
      )
      .join('')}</table>`;
}

// everything you own and everything you have done, on one page

/**
 * Renders the career overview ledger (holdings, net worth, story progress, exploration record).
 * @param {ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
function careerHtml(G: ClientGameState): string {
  const y = G.you!,
    assets = G.A!,
    shipVal = (sh: { hull: string | number } | null | undefined) =>
      sh && assets.ships[sh.hull] ? assets.ships[sh.hull].cost || 0 : 0;
  const stored = (y.dock || []).map((x) => x.ship).filter(Boolean),
    cargoVal = Object.entries(y.cargo || {}).reduce(
      (a, [c, n]) => a + (COMMODITIES.find((x) => x.id === c) || { base: 0 }).base * n,
      0,
    );
  const crates = MATERIALS.reduce((a, m) => a + (y.mats[m] || []).reduce((b, n) => b + n, 0), 0);
  const worth =
    y.credits +
    (y.shipless ? 0 : shipVal(y.ship)) +
    stored.reduce((a, loadout) => a + shipVal(loadout), 0) +
    cargoVal -
    (y.loan ? y.loan.bal : 0);
  const kv = (k: string, v: string | number) =>
    `<div class="kv"><span>${k}</span><span>${v}</span></div>`;
  const S = y.station || {},
    site = S.site && STELLARS[S.site],
    st = y.stats || {},
    Q = y.quests || { done: [], active: [] },
    SY = y.story || {};
  const offs = (y.officers || []).reduce(
    (a, officer) => ((a[officer.rarity] = (a[officer.rarity] || 0) + 1), a),
    {} as Record<number, number>,
  );
  const bps = Object.entries(y.bp || {})
    .filter(([id, n]) => n > 0 && SPEC[id])
    .map(
      ([id, n]) =>
        `<div class="kv small"><span>${esc(SPEC[id].name)}</span><span>${Math.min(n, BP_NEED)} / ${BP_NEED}${n >= BP_NEED ? ' <b style="color:var(--ok)">ready</b>' : ''}</span></div>`,
    )
    .join('');
  const docks = y.docks
    ? y.docks.list
        .map(
          (k) =>
            `<div class="kv small"><span>Dock ${k.letter}${k.letter === y.docks.list[y.docks.active].letter ? ' <span style="color:var(--ok)">(active)</span>' : ''}</span><span>${k.lead && assets.ships[k.lead.hull] ? esc(assets.ships[k.lead.hull].name) : '<span class="dim">no lead</span>'}${k.wings.filter(Boolean).length ? ` + ${k.wings.filter(Boolean).length} wing` : ''}</span></div>`,
        )
        .join('')
    : '';
  return `<div class="igrid"><div>
    <div class="sect" style="margin-top:0">HOLDINGS</div>
    ${kv('<b>Net worth</b>', `<b class="cr">${cr(worth)} cr</b>`)}${kv('Credits', cr(y.credits))}${y.loan ? kv('Loan', `−${cr(y.loan.bal)}`) : ''}
    ${kv('Ships', `${(y.shipless ? 0 : 1) + stored.length} <span class="dim small">(${cr((y.shipless ? 0 : shipVal(y.ship)) + stored.reduce((a, loadout) => a + shipVal(loadout), 0))} cr)</span>`)}${docks}
    ${kv('Personal Station', site ? `Station Tier ${S.ops} · ${esc(SYS[site.system].name)}` : '<span class="dim">none yet</span>')}
    ${kv('Colonies', (y.colonies || []).length ? y.colonies.map((c) => `${esc(c.name)} (Lv ${c.lv})`).join(', ') : '<span class="dim">none</span>')}
    ${kv(
      'Officers',
      (y.officers || []).length
        ? Object.entries(offs)
            .sort((a, b) => Number(b[0]) - Number(a[0]))
            .map(
              ([r, n]) =>
                `<span style="color:${RARITY[Number(r)].color}">${n} ${RARITY[Number(r)].name}</span>`,
            )
            .join(', ')
        : '<span class="dim">none</span>',
    )}
    ${kv('Material crates', crates)}${kv('Cargo', `${y.cargoUsed || 0} t <span class="dim small">(about ${cr(cargoVal)} cr)</span>`)}
    ${bps ? `<div class="sect">BLUEPRINTS</div>${bps}` : ''}
  </div><div>
    <div class="sect" style="margin-top:0">PROGRESS</div>
    ${kv('Main story', SY.pass ? 'complete' : `chapter ${Math.min((SY.step || 0) + 1, SY.total || 1)} of ${SY.total || '?'}`)}
    ${kv('Side stories', `${Q.done.filter((x) => x.side).length} of 6`)}${kv('Contact stories', `${Q.done.filter((x) => !x.side).length} finished · ${Object.values(Q.contacts || {}).filter((c) => c.n >= 2).length} trusted contacts`)}
    ${kv('Faction stories', `${(y.arcs || []).filter((a) => a.done).length} of ${(y.arcs || []).length}`)}${kv('Farside expeditions', (y.expd && y.expd.n) || 0)}
    ${kv('Combat rating', `<b style="color:#ffd27a">${esc((y.rank || {}).name || 'Harmless')}</b>`)}${kv('Ships destroyed', cr(st.kills || 0))}
    ${kv('Systems explored', `${(y.explored || []).length} of ${SYSTEMS.filter((x) => !x.arena).length}`)}${kv('Jumps made', cr(st.jumps || 0))}
    ${kv('Credits earned', cr(st.earned || 0))}${st.mined ? kv('Ore mined', `${cr(st.mined)} t`) : ''}
    ${(Q.active || []).length ? `<div class="sect">STORIES UNDER WAY</div>${Q.active.map((a) => `<div class="kv small"><span>${a.side ? '★' : '✦'} ${esc(a.name)}</span><span class="dim">step ${a.step + 1} of ${a.of}</span></div>`).join('')}` : ''}
  </div></div>`;
}

// where a good in your hold sells best, among the markets you have visited within four jumps

/**
 * Finds the nearby explored trade port within four jumps offering the best sale price for a commodity.
 * @param {ClientGameState} G Game state object
 * @param {string} cid Commodity identifier
 * @returns {BestSaleResult|null} Best sale location, price, and jumps distance or null
 */
export function bestSale(G: ClientGameState, cid: string): BestSaleResult | null {
  const y = G.you!,
    seen = new Set(y.explored || []),
    dist: Record<string, number> = { [G.sys!]: 0 },
    q = [G.sys!],
    now = Date.now();
  let best = null;
  while (q.length) {
    const s = q.shift()!;
    if (dist[s] >= 4) continue;
    for (const l of SYS[s] ? SYS[s].links : [])
      if (dist[l] === undefined) {
        dist[l] = dist[s] + 1;
        q.push(l);
      }
  }
  for (const [sid, j] of Object.entries(dist)) {
    if (!seen.has(sid) && sid !== G.sys) continue;
    for (const sp of SYS[sid].stellars) {
      const p = STELLARS[sp.id];
      if (!p || p.site || !(p.svc || '').includes('T')) continue;
      const pr = price(p, cid, now);
      if (pr === null) continue;
      if (!best || pr - j * 6 > best.price - best.jumps * 6) best = { p, price: pr, jumps: j };
    }
  }
  return best;
}
