// 1.1: the ship and captain panel (I), after Endless Sky's player info: your ship, cargo (with jettison), combat
// rating, fleet orders, and the rival captains of the Rift with how they feel about you.
import { SYS, FACTIONS, COMMODITIES } from '/shared/galaxy.js';
import { RANKS } from '/shared/rivals.js';
import { synBadge } from './syn_ui.js';

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const cr = (n) => Math.round(n).toLocaleString();
const ORD = [['gather', 'Form up', 'G'], ['attack', 'Attack my target', 'K'], ['hold', 'Hold position', 'H'], ['holdfire', 'Hold fire', 'Y'], ['loot', 'Collect loot', 'U']];
const MOODC = { nemesis: '#ff5a4a', rival: '#ff9a6a', neutral: '#aab', friendly: '#9fd0ff', ally: '#6aff9a' };

export function infoHtml(G, tab) {
  const y = G.you; if (!y) return '';
  const st = y.shipStats, H = G.A.ships[y.ship.hull], rank = y.rank || { name: 'Harmless', score: 0, next: 400, i: 0 };
  if (tab === 'ship') {
    const cargo = Object.entries(y.cargo || {}).filter(([, n]) => n > 0), inSpace = !!G.view && !G.landed;
    const bar = rank.next ? Math.min(100, 100 * (rank.score - RANKS[rank.i][0]) / (rank.next - RANKS[rank.i][0])) : 100;
    return `<div class="igrid"><div>
      <div class="sect" style="margin-top:0">SHIP</div>
      ${y.shipless ? '<p class="dim">No active ship.</p>' : `<div style="display:flex;gap:10px;align-items:center"><img src="assets/${H.img}" style="width:120px;height:90px;object-fit:contain"><div><b style="color:#fff;font-size:15px">${esc(H.name)}</b><div class="dim">"${esc(y.ship.name)}"</div></div></div>
      <div class="kv"><span>Shield / armor</span><span>${cr(st.shield)} / ${cr(st.armor)}</span></div><div class="kv"><span>Speed / turn</span><span>${cr(st.maxSpeed / 0.45)} / ${cr(st.turn * 57.3 / 3)}</span></div>
      <div class="kv"><span>Cargo</span><span>${y.cargoUsed} / ${st.cargo} t</span></div><div class="kv"><span>Outfit space</span><span>${st.free} of ${st.space} free</span></div>
      <div class="kv"><span>Guns / turrets</span><span>${st.guns}/${st.maxGuns} · ${st.turrets}/${st.maxTurrets}</span></div><div class="kv"><span>Fuel</span><span>${Math.floor(((G.view && G.view.fuel) ?? y.fuel) / 100)} jumps</span></div>`}
      <div class="sect">COMBAT RATING</div><div class="kv"><span><b style="color:#ffd27a">${esc(rank.name)}</b></span><span class="dim">${cr(rank.score)}${rank.next ? ` / ${cr(rank.next)}` : ''}</span></div>
      <div class="rbar"><i style="width:${bar}%"></i></div><div class="dim small">Destroying ships raises your rating. Competent captains are offered Wanted contracts, and Dangerous ones get elite contracts.</div>
      <div class="sect">RECORD</div>${synBadge(y)}<div class="kv"><span>Commendations</span><span>${y.shards || 0}</span></div>
      <div class="kv"><span>Credit rating</span><span>${y.credit || 600}${y.loan ? ` · loan ${cr(y.loan.bal)} cr` : ''}</span></div>
      <div class="kv"><span>Faction stories</span><span>${(y.arcs || []).filter(a => a.done).length} of ${(y.arcs || []).length} complete</span></div>
      <div class="kv"><span>Farside expeditions</span><span>${(y.expd && y.expd.n) || 0} decoded</span></div>
    </div><div>
      <div class="sect" style="margin-top:0">CARGO</div>
      ${cargo.length ? cargo.map(([c, n]) => { const C = COMMODITIES.find(x => x.id === c); return `<div class="kv"><span>${esc(C ? C.name : c)}</span><span>${n} t ${inSpace ? `<button class="btn sm" data-jet="${c}" data-n="${Math.min(5, n)}">DUMP 5</button> <button class="btn sm" data-jet="${c}" data-n="0">DUMP ALL</button>` : ''}</span></div>`; }).join('') : '<p class="dim">The hold is empty.</p>'}
      ${cargo.length ? `<div class="dim small">${inSpace ? 'Jettisoned cargo floats free. Raiders chasing you often go for it instead.' : 'You can jettison cargo in space.'}</div>` : ''}
      <div class="sect">MISSION CARGO</div>${(y.missions || []).filter(m => m.qty).map(m => `<div class="kv"><span>${esc(m.title)}</span><span>${m.qty} t</span></div>`).join('') || '<p class="dim">None.</p>'}
    </div></div>`;
  }
  if (tab === 'fleet') {
    const ord = G.order || 'gather';
    return `<div class="sect" style="margin-top:0">FLEET ORDERS</div><div class="dim small" style="margin-bottom:6px">Orders apply to your escorts, wingmates and fighters. Give the same order again to cancel it.</div>
      <div class="ords">${ORD.map(([k, n, key]) => `<button class="btn ${ord === k ? 'on' : ''}" data-ord="${k}">${n} <span class="dim small">(${key})</span></button>`).join('')}</div>
      <div class="sect">ESCORTS</div>${(y.escorts || []).length ? y.escorts.map(h => { const E = G.A.ships[h]; return E ? `<div class="kv"><span><img src="assets/${E.img}" style="width:40px;height:28px;object-fit:contain;vertical-align:middle"> ${esc(E.name)}</span><span class="dim">${esc(E.sub || '')}</span></div>` : ''; }).join('') : '<p class="dim">No escorts. Hire wingmates at your Personal Station, or hail a rival who likes you and ask them to fly with you.</p>'}`;
  }
  // captains
  const list = (G.rivals || []).slice().sort((a, b) => b.rel - a.rel), seen = new Set(y.explored || []);
  return `<div class="dim small" style="margin-bottom:6px">Thirty captains with careers of their own. Hail them (T) to talk. Help them in a fight and they warm to you; fire on them and they will remember.</div>
    <table class="tbl"><tr><th>CAPTAIN</th><th>CAREER</th><th>FLAG</th><th>SHIP</th><th>LAST SEEN</th><th>STANDING</th></tr>${list.map(r => `<tr><td><b>${esc(r.name)}</b></td><td>${esc(r.kind)}</td><td><span style="color:${FACTIONS[r.fac] ? FACTIONS[r.fac].color : '#aaa'}">${esc(FACTIONS[r.fac] ? FACTIONS[r.fac].short : r.fac)}</span></td><td>${esc(r.ship)}</td>
      <td>${r.sys ? (seen.has(r.sys) ? esc(SYS[r.sys].name) : '<span class="dim">uncharted space</span>') : '<span class="dim">grounded</span>'}</td><td style="color:${MOODC[r.mood]}">${r.mood[0].toUpperCase() + r.mood.slice(1)} (${r.rel})</td></tr>`).join('')}</table>`;
}
