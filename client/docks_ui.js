// 2.1 Docks: the DOCKS screen at your Personal Station, the dock switcher by the DEPART button, and the sidebar line.
import { ROLES, RARITY } from '/shared/hangar.js';
import { WING_REPAIR_COST, NEXT_DOCK_OPS } from '/shared/docks.js';
import { credits } from '/shared/rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (t) => Math.max(1, Math.ceil((t - Date.now()) / 60000));

function shipBox(G, s, empty) {
  if (!s) return `<div class="dslot empty"><div class="dimg"></div><div class="dsn dim">${empty}</div></div>`;
  const H = G.A.ships[s.hull] || {};
  return `<div class="dslot${s.repairT ? ' repair' : ''}"><img class="dimg" src="assets/${H.img}"><div class="dsn"><b>${esc(H.name)}</b><div class="dim small">"${esc(s.name)}"${s.flying ? ' · flying' : ''}${s.repairT ? ` · <span class="rep">repairs ${mins(s.repairT)} min</span>` : ''}</div></div></div>`;
}
// a picker of stored ships for one slot
function shipPick(G, D, k, slot, cur, interactive) {
  if (!interactive) return '';
  const opts = D.stored.filter(x => slot !== 'lead' || !x.wingOnly).map(x => {
    const H = G.A.ships[x.hull] || {}; return `<option value="${x.uid}"${cur && cur.uid === x.uid ? ' selected' : ''}>${esc(H.name)} "${esc(x.name)}"${x.at ? ` (${x.at})` : ''}</option>`;
  }).join('');
  const curOpt = cur && cur.flying ? `<option value="${cur.uid}" selected>${esc((G.A.ships[cur.hull] || {}).name)} "${esc(cur.name)}" (flying)</option>` : '';
  return `<select class="dpick" data-dk="${k}" data-slot="${slot}"><option value="">${cur ? '— empty this slot —' : '— choose a stored ship —'}</option>${curOpt}${opts}</select>`;
}
function crewPick(G, k, w, role, oid, interactive) {
  const y = G.you, o = y.officers.find(x => x.id === oid);
  if (!interactive) return `<span class="dim small">${role === 'cap' ? 'Captain' : 'Crew'}: ${o ? esc(o.name) : 'none'}</span>`;
  const opts = y.officers.map(x => `<option value="${x.id}"${x.id === oid ? ' selected' : ''}>${esc(x.name)} · ${RARITY[x.rarity].name} ${ROLES[x.role].name} Lv ${x.lv}</option>`).join('');
  return `<label class="dcrew"><span>${role === 'cap' ? 'CAPTAIN' : 'CREW'}</span><select data-dk="${k}" data-w="${w}" data-role="${role}"><option value="">none</option>${opts}</select></label>`;
}

export function docksHtml(G, interactive) {
  const y = G.you, D = y.docks; if (!D) return '';
  let h = `<div class="sect" style="margin-top:4px">DOCKS (${D.count} of 4)</div><div class="dim small">Each dock holds a lead ship and up to two wingmates, chosen from your stored ships. You fly the lead of your <b>active</b> dock, and its wingmates fly in formation with you. Officers you assign as a wingmate's captain and crew boost that ship. More docks open as your station's Ops level rises.</div>`;
  h += `<div class="docks">` + D.list.map((k, i) => {
    const act = i === D.active;
    return `<div class="dock${act ? ' on' : ''}"><div class="dhead"><span class="dletter">DOCK ${k.letter}</span>${act ? '<span class="dact">ACTIVE</span>' : interactive && k.lead ? `<button class="btn sm" data-act="dockgo" data-k="${i}">FLY WITH DOCK ${k.letter}</button>` : ''}</div>
      <div class="drole">LEAD SHIP</div>${shipBox(G, k.lead, 'No lead ship')}${shipPick(G, D, i, 'lead', k.lead, interactive)}
      ${k.wings.map((w, j) => `<div class="drole">WINGMATE ${j + 1}</div>${shipBox(G, w, 'Empty wing slot')}${shipPick(G, D, i, j, w, interactive)}
        ${w ? `<div class="dcrews">${crewPick(G, i, j, 'cap', w.cap, interactive)}${crewPick(G, i, j, 'crew', w.crew, interactive)}</div>${w.repairT ? `<button class="btn sm" data-act="wingrep" data-uid="${w.uid}">RUSH REPAIRS ${credits(Math.round((G.A.ships[w.hull].cost || 0) * WING_REPAIR_COST))}</button>` : ''}` : ''}`).join('')}
    </div>`;
  }).join('') + `</div>`;
  if (D.count < 4) h += `<div class="dim small" style="margin-top:6px">Next dock opens at Ops ${NEXT_DOCK_OPS[D.count]}.</div>`;
  h += `<div class="sect">STORED SHIPS (${D.stored.length} / ${D.cap} berths)</div>`;
  if (!D.cap) h += '<p class="dim">Your hangar opens at Ops 1. Ships you buy can then be sent straight to it (BUY TO HANGAR in any shipyard).</p>';
  h += D.stored.map(x => { const H = G.A.ships[x.hull] || {}; return `<div class="it dstore"><img src="assets/${H.img}"><div style="flex:1"><b>${esc(H.name)}</b> <span class="dim">"${esc(x.name)}"</span><div class="dim small">${x.at ? `Dock ${esc(x.at)}` : 'Unassigned'}${x.wingOnly ? ' · wingmate only' : ''}${x.repairT ? ` · <span class="rep">repairs ${mins(x.repairT)} min</span>` : ''}</div></div>${interactive ? `<button class="btn sm" data-act="dock" data-op="sell" data-uid="${x.uid}">SELL</button>` : ''}</div>`; }).join('') || (D.cap ? '<p class="dim small">No stored ships. Buy ships into your hangar at any shipyard, or capture them by boarding.</p>' : '');
  if (y.shipless) h += `<div class="dim small" style="color:#ff8a7a;margin-top:6px">You have no active ship: choose a lead ship for your active dock, or fly with another dock.</div>`;
  return h;
}

// the chips beside DEPART: switch docks while at your station, or just show which dock you are flying
export function dockChips(G, atHome) {
  const D = G.you && G.you.docks; if (!D || D.count < 2) return '';
  return `<span class="dchips"><span class="dim small">DOCK</span>${D.list.map((k, i) => `<button class="btn sm dchip${i === D.active ? ' on' : ''}" ${atHome && i !== D.active && k.lead ? `data-act="dockgo" data-k="${i}"` : 'disabled'} title="${k.lead ? esc((G.A.ships[k.lead.hull] || {}).name) + ` + ${k.wings.filter(Boolean).length} wingmate(s)` : 'No lead ship'}">${k.letter}</button>`).join('')}</span>`;
}

// the sidebar line: which dock you fly, and how its wingmates are doing
export function dockLine(G) {
  const D = G.you && G.you.docks; if (!D) return '';
  const k = D.list[D.active]; if (!k) return '';
  const ws = k.wings.filter(Boolean); if (!ws.length && D.count < 2) return '';
  return `DOCK ${k.letter}` + (ws.length ? ' · ' + ws.map(w => `<span class="${w.repairT ? 'rep' : 'wok'}" title="${esc(w.name)}${w.repairT ? ': under repair' : ''}">◆</span>`).join('') + ` ${ws.filter(w => !w.repairT).length} wingmate${ws.filter(w => !w.repairT).length === 1 ? '' : 's'}` : ' · no wingmates');
}
