// 1.2 screens: black market, bank, officer ranks and traits, lower decks, and faction-arc cards.
import { occupiedPassengerSeats } from '/shared/passengers.js';
import { FACTIONS } from '/shared/galaxy.js';
import {
  RANKS_OFF,
  PROMOTE,
  TRAITS,
  LOWER_DECK,
  LOWER_SLOTS,
  SYN_TIERS,
  bunks,
} from '/shared/syndicate.js';

const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
const cr = (n) => Math.round(n).toLocaleString();

export function synBadge(y) {
  const t = y.syn || { name: 'Unknown', pts: 0, i: 0 };
  return `<div class="kv"><span>Syndicate standing</span><span><b style="color:#d88aff">${esc(t.name)}</b> <span class="dim">${cr(t.pts)}${t.next ? ` / ${cr(t.next)}` : ''}</span></span></div>`;
}
export function blackMarketHtml(G) {
  const B = G.landed.blackmarket,
    y = G.you;
  if (!B) return '';
  return `<div class="bmhead"><div><div class="sect" style="margin-top:0">THE BLACK MARKET</div><div class="dim small">A back room behind the bar. The fence sells to the Syndicate's own, and stock opens up as your standing grows. Smuggling, plunder, capture and Syndicate contracts raise it.</div></div>
    <div class="bmtier">${synBadge(y)}<div class="kv"><span>Commendations</span><span>${y.shards || 0}</span></div></div></div>
    <table class="tbl"><tr><th>ITEM</th><th>DETAILS</th><th>PRICE</th><th></th></tr>${B.items
      .map(
        (
          x,
        ) => `<tr class="${x.locked ? 'locked' : ''}"><td><b>${esc(x.name)}</b></td><td class="dim small">${esc(x.desc)}</td><td class="cr">${cr(x.price)}</td>
      <td style="text-align:right">${x.locked ? `<span class="dim small">${esc(x.locked)} only</span>` : `<button class="btn sm" data-act="bm" data-id="${x.id}"${y.credits < x.price ? ' disabled title="Not enough credits"' : ''}>BUY</button>`}</td></tr>`,
      )
      .join('')}</table>`;
}
export function bankHtml(G) {
  const B = G.landed.bank,
    y = G.you;
  if (!B) return '';
  const bal = y.loan ? y.loan.bal : 0,
    mins = y.loan ? Math.max(0, Math.ceil((y.loan.next - Date.now()) / 60000)) : 0,
    room = Math.max(0, B.max - bal);
  return `<div class="igrid"><div><div class="sect" style="margin-top:0">THE BANK OF THE RIFT</div>
      <div class="kv"><span>Credit rating</span><span><b>${y.credit || B.credit}</b> <span class="dim small">(300 to 850)</span></span></div>
      <div class="kv"><span>Interest</span><span>${(B.rate * 100).toFixed(2)}% every ${B.period} minutes of play</span></div>
      <div class="kv"><span>You can borrow up to</span><span class="cr">${cr(B.max)}</span></div>
      <p class="dim small">Payments are taken automatically every ${B.period} minutes while you play. Paying on time raises your rating and lowers your interest; missing one adds interest and drops your rating. Bigger earnings unlock bigger loans.</p>
    </div><div><div class="sect" style="margin-top:0">YOUR LOAN</div>
      ${bal ? `<div class="kv"><span>Balance</span><span class="cr">${cr(bal)}</span></div><div class="kv"><span>Next payment</span><span>about ${cr(B.pay)} in ${mins} min</span></div>` : '<p class="dim">No loan.</p>'}
      <div class="rrow"><input id="bankamt" type="number" min="1000" step="1000" placeholder="Amount" value="${Math.min(room, 50000)}"><button class="btn sm" data-act="bank" data-op="borrow"${room < 1000 ? ' disabled' : ''}>BORROW</button>${bal ? `<button class="btn sm" data-act="bank" data-op="pay">PAY</button><button class="btn sm" data-act="bank" data-op="payall">PAY ALL</button>` : ''}</div>
    </div></div>`;
}
// officer rank, traits and the promote button (added to each officer card in the CREW tab)
export function rankLine(G, o, interactive) {
  const r = o.rank || 0,
    P = PROMOTE[r + 1],
    y = G.you;
  const traits = (o.traits || [])
    .map((t) =>
      TRAITS[t]
        ? `<span class="trait" title="${esc(
            Object.entries(TRAITS[t].bonus)
              .map(([k, v]) => `${k} +${v}`)
              .join(', '),
          )}">${esc(TRAITS[t].name)}</span>`
        : '',
    )
    .join('');
  const btn =
    interactive && P && typeof o.id !== 'undefined' && y.officers.some((x) => x.id === o.id)
      ? `<button class="btn sm" data-act="promote" data-id="${esc(o.id)}"${o.lv < P.lv || (y.shards || 0) < P.shards || y.credits < P.credits ? ` disabled title="Needs level ${P.lv}, ${P.shards} commendations and ${cr(P.credits)} credits"` : ''}>PROMOTE</button>`
      : '';
  return `<div class="rankrow"><span class="rank">${RANKS_OFF[r]}</span>${traits}${btn}</div>`;
}
export function lowerDeckHtml(G) {
  const y = G.you,
    L = y.lower || [],
    docked = !!G.landed;
  let h = `<div class="sect">LOWER DECK <span class="dim small">· two crew slots with small passive bonuses</span></div><div class="lower">`;
  for (let i = 0; i < LOWER_SLOTS; i++) {
    const k = L[i],
      C = k && LOWER_DECK[k];
    h += `<div class="lslot">${
      C
        ? `<b>${esc(C.name)}</b><div class="dim small">${esc(C.desc)}</div><button class="btn sm" data-act="lower" data-op="dismiss" data-i="${i}">DISMISS</button>`
        : `<div class="dim small">Empty berth</div>${
            docked
              ? `<select data-lowersel="${i}">${Object.entries(LOWER_DECK)
                  .filter(([kk]) => !L.includes(kk))
                  .map(
                    ([kk, c]) =>
                      `<option value="${kk}">${esc(c.name)} · ${esc(c.desc)} · ${cr(c.cost)} cr</option>`,
                  )
                  .join(
                    '',
                  )}</select><button class="btn sm" data-act="lower" data-op="hire" data-i="${i}">HIRE</button>`
              : '<div class="dim small">Hire crew when docked.</div>'
          }`
    }</div>`;
  }
  return (
    h +
    `</div><div class="dim small">Commendations for promotions: <b>${y.shards || 0}</b>. Find them in loot chests and on the black market.</div>`
  );
}
export function arcCardsHtml(G) {
  const L = G.landed;
  if (!L || !L.arcs || !L.arcs.length) return '';
  return L.arcs
    .map(
      (o) =>
        `<div class="card story arc" style="cursor:default"><div class="storytag">${esc(FACTIONS[o.fac].name.toUpperCase())} · ${esc(o.arc)}</div><div class="t">${esc(o.title)}</div><div>${esc(o.brief)}</div>${o.locked ? `<div class="dim small">${esc(o.locked)}</div>` : `<div><button class="btn sm" data-act="arcopen" data-f="${o.fac}">READ</button></div>`}</div>`,
    )
    .join('');
}
export function bunkInfo(G, o) {
  if (o.type !== 'passenger') return '';
  const y = G.you,
    cap = bunks(G.A.ships[y.ship.hull], y.ship),
    used = occupiedPassengerSeats(y.missions);
  return o.pax > cap - used
    ? `Needs ${o.pax} passenger seats; your ship has ${Math.max(0, cap - used)} free.`
    : '';
}
