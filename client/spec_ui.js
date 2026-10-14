// Quantum Rift 0.8 interface: the Specialists section of the station (blueprints, building, parts, components, tier-ups).
import { GRADES } from '/shared/galaxy.js';
import { SPECIALISTS, SPEC, SPEC_RES, BP_NEED, BUILD, PART_RATE, COMPONENTS, TIER_MAX, COMP_COST, TIER_UP_MIN, specPower } from '/shared/specialty.js';
import { ROLES_INFO } from '/shared/roles.js';
import { credits } from '/shared/rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const res = (k, n) => `<span style="color:${SPEC_RES[k].color}">${SPEC_RES[k].icon} ${n} ${esc(SPEC_RES[k].name)}</span>`;

export function specialistsHtml(G, interactive) {
  const y = G.you, bp = y.bp || {}, spec = y.spec || {}, parts = y.parts || {}, ss = y.specState || {}, cur = SPEC[y.ship.hull];
  let h = `<div class="dim small">Ten one-of-a-kind ships, each built for a single job. Each job drops that ship's <b>blueprints</b>, whatever you fly. Flying the specialist itself earns its unique resource, which the station refines into <b>parts</b> (${PART_RATE} to 1). Parts upgrade her five components, and a full set unlocks a timed <b>tier-up</b> in the drydock, up to Tier ${TIER_MAX}.</div>`;
  if (cur) {   // the specialist you are flying
    const st = ss[cur.id] || { tier: 1, comp: {} }, pw = specPower(st), cost = COMP_COST(st.tier), full = Object.keys(COMPONENTS).every(c => (st.comp[c] || 0) >= st.tier);
    h += `<div class="ocard" style="border-color:#c9a24a88;margin-top:6px"><div class="oname"><img src="assets/${G.A.ships[cur.id].img}" style="width:84px;height:64px;object-fit:contain;float:left;margin-right:8px"><b style="font-size:15px;color:#fff">${esc(cur.name)}</b> <span class="dim">${esc(cur.sub)}</span> <span style="color:${ROLES_INFO[cur.role].color}">${ROLES_INFO[cur.role].icon} ${ROLES_INFO[cur.role].name}</span>
      <div style="color:#ffd27a">${'★'.repeat(st.tier)}${'☆'.repeat(TIER_MAX - st.tier)} Tier ${st.tier} · specialty ${Math.round(pw * 100)}%</div><div class="small">${esc(cur.ability)}</div></div>
      <div class="kv" style="clear:both"><span>${res(cur.res, spec[cur.res] || 0)}</span><span>${parts[cur.id] || 0} parts ${interactive && (spec[cur.res] || 0) >= PART_RATE ? `<button class="btn sm" data-act="spec" data-op="parts" data-id="${cur.id}">REFINE ${Math.floor((spec[cur.res] || 0) / PART_RATE)}</button>` : ''}</span></div>`;
    if (st.upT && st.upT > Date.now()) h += `<div class="kv"><span style="color:#7ad0ff">In the drydock for Tier ${st.tier + 1}</span><span>${mins(st.upT - Date.now())} left</span></div>`;
    else {
      h += '<table class="tbl"><tr><th>COMPONENT</th><th>LEVEL</th><th>EACH LEVEL</th><th></th></tr>' + Object.entries(COMPONENTS).map(([c, C]) => {
        const lv = st.comp[c] || 0, can = lv < st.tier;
        return `<tr><td>${C.name}</td><td>${lv} / ${st.tier}</td><td class="dim small">${Object.entries(C.bonus).map(([k, v]) => k === 'ability' ? `+${v}% specialty` : `+${v}% ${k.replace('Pct', '')}`).join(', ')}</td><td style="text-align:right">${can ? (interactive ? `<button class="btn sm" data-act="spec" data-op="comp" data-c="${c}">${cost.parts} parts + ${credits(cost.credits)}</button>` : `<span class="dim small">${cost.parts} parts</span>`) : '<span style="color:var(--ok)">✓</span>'}</td></tr>`;
      }).join('') + '</table>';
      if (st.tier < TIER_MAX) h += full ? (interactive ? `<button class="btn sm" data-act="spec" data-op="tierup">TIER UP TO ${st.tier + 1} (${TIER_UP_MIN[st.tier]} min in drydock)</button>` : `<div class="dim small">Ready for Tier ${st.tier + 1}. Tier her up at your station.</div>`) : `<div class="dim small">Upgrade every component to unlock Tier ${st.tier + 1}.</div>`;
    }
    h += '</div>';
  }
  h += '<div class="sect">THE SPECIALISTS</div><div class="ogrid">' + SPECIALISTS.map(sp => {
    const n = bp[sp.id] || 0, R = ROLES_INFO[sp.role], st = ss[sp.id];
    const btn = interactive ? (y.station.ops < BUILD.ops ? `<span class="dim small">Ops ${BUILD.ops}</span>` : n >= BP_NEED ? `<button class="btn sm" data-act="spec" data-op="build" data-id="${sp.id}">BUILD · ${credits(sp.cost)}</button>` : '') : '';
    return `<div class="ocard"><div class="oname"><img src="assets/${G.A.ships[sp.id].img}" style="width:64px;height:48px;object-fit:contain;float:left;margin-right:6px"><b>${esc(sp.name)}</b> <span class="small" style="color:${R.color}">${R.icon} ${R.name}</span>${st ? ` <span style="color:#ffd27a" class="small">T${st.tier}</span>` : ''}<div class="dim small">${esc(sp.sub)}</div></div>
      <div class="small" style="clear:both">${esc(sp.ability)}</div><div class="dim small">Loop: ${esc(sp.loop)}</div>
      <div class="kv"><span class="small">Blueprints ${Math.min(n, BP_NEED)}/${BP_NEED}</span><span class="small">${res(sp.res, spec[sp.res] || 0)} · ${parts[sp.id] || 0} parts</span></div><div class="xpbar"><i style="width:${Math.min(100, 100 * n / BP_NEED)}%;background:#c9a24a"></i></div>${btn}</div>`;
  }).join('') + '</div>';
  if (interactive) h += `<div class="dim small">Building a specialist also takes ${BUILD.mats.map(([m, g, n]) => `${n} ${m} ${GRADES[g]}`).join(', ')}. Your current ship is traded in, or store it in the drydock first.</div>`;
  return h;
}
