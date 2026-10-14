// Quantum Rift 0.6 interface pieces: the OPS companion tab (event, invasion, anomaly, goals, fleet), the FLEET and STORE landing tabs.
import { SYS, FACTIONS, GRADES } from '/shared/galaxy.js';
import { ANOMALIES, GOAL_TYPES, GOAL_REWARD, DREADNOUGHTS, CLAIM, FLEET, STORE_ITEMS, STORE_TIERS, STORE_MAT } from '/shared/fronts.js';
import { credits } from '/shared/rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const left = (t) => { const m = Math.max(0, Math.round((t - Date.now()) / 60000)); return m >= 1440 ? `${Math.floor(m / 1440)}d ${Math.floor(m % 1440 / 60)}h` : m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };

function goalRows(list, period) {
  return list.map((g, i) => `<div class="goal ${g.claimed ? 'claimed' : ''}"><div class="kv"><span>${esc(GOAL_TYPES[g.type].text(g.n))}</span><span class="small">${g.claimed ? '✓ claimed' : g.got >= g.n ? `<button class="btn sm" data-act="goal" data-p="${period}" data-i="${i}">CLAIM</button>` : `${g.type === 'trade' ? credits(g.got) : g.got} / ${g.type === 'trade' ? credits(g.n) : g.n}`}</span></div><div class="xpbar"><i style="width:${Math.min(100, 100 * g.got / g.n)}%"></i></div></div>`).join('');
}
export function opsHtml(G) {
  const y = G.you, W = G.world || {}, ev = W.event, here = SYS[G.sys];
  let h = '<button class="btn sm" data-act="stores" style="margin-bottom:6px">FACTION STORES</button>';
  const SY = y.story; if (SY && (SY.active || SY.next)) h += `<div class="evbox" style="border-color:#c9a24a"><div class="small" style="color:#c9a24a;letter-spacing:2px">MAIN STORY ${SY.step + 1}/${SY.total}</div><b style="color:#ffe2a0">${esc(SY.active ? SY.active.title : SY.next.title)}</b><div class="small">${esc(SY.active ? (SY.active.ready ? 'Done: return to collect.' : SY.active.brief) : 'Waiting for you at ' + SY.next.at + '.')}</div></div>`;
  if (ev) h += `<div class="evbox"><div class="dim small">SERVER EVENT</div><b>${esc(ev.name)}</b><div class="small">${esc(ev.desc)}</div></div>`;
  if (W.invasion) { const S = SYS[W.invasion.sys]; h += `<div class="evbox inv"><div class="small" style="color:#ff8a70">INVASION · ${left(W.invasion.until)} left</div><b>${esc(W.invasion.name)}</b> in <a href="#" data-act="plotto" data-sys="${S.id}">${esc(S.name)}</a><div class="dim small">Everyone who damages it shares the bounty.</div></div>`; }
  const an = W.anomalies && W.anomalies[G.sys];
  if (an) h += `<div class="evbox" style="border-color:${ANOMALIES[an].color}66"><b style="color:${ANOMALIES[an].color}">${ANOMALIES[an].icon} ${esc(ANOMALIES[an].name)}</b> in this system<div class="small">${esc(ANOMALIES[an].desc)}</div></div>`;
  { const D = y.directives || {}, inSpace = !!G.view; h += `<div class="sect">DIRECTIVES <span class="dim small">summon a solo armada, scaled to your ship</span></div>`;
    for (const t of [1, 2, 3]) h += `<div class="kv"><span>${['', 'Hollow', 'Umbral', 'Eclipse'][t]} Directive <span class="dim small">tier ${t}</span></span><span>${D[t] || 0} ${inSpace && D[t] ? `<button class="btn sm" data-act="summon" data-tier="${t}">SUMMON</button>` : ''}</span></div>`;
    h += `<div class="dim small">Directives drop from loot chests and armadas, and come with weekly goals and from faction stores. You get ten minutes to destroy the flagship.</div>`;
    if (y.holdout && y.holdout.active) h += `<div class="evbox inv"><b>HOLDOUT</b> · wave ${y.holdout.wave} of 10 · stay in your station's system</div>`; }
  if (y.goals) {
    h += `<div class="sect">DAILY GOALS <span class="dim small">${credits(GOAL_REWARD.daily.credits)} cr + ${GOAL_REWARD.daily.tokens} scrip each</span></div>` + goalRows(y.goals.daily, 'daily');
    h += `<div class="sect">WEEKLY GOALS <span class="dim small">${credits(GOAL_REWARD.weekly.credits)} cr + ${GOAL_REWARD.weekly.tokens} scrip each</span></div>` + goalRows(y.goals.weekly, 'weekly');
  }
  // fleet summary + anchoring (from space, as leader, in an unclaimed Frontier system)
  const F = y.fleet;
  h += `<div class="sect">FLEET</div>`;
  if (!F) h += '<p class="dim small">You are not in a fleet. Found or join one from the FLEET tab when landed.</p>';
  else {
    h += `<div class="kv"><span><b>[${esc(F.tag)}] ${esc(F.name)}</b></span><span class="small">${F.members.filter(m => m.online).length}/${F.members.length} online · bank ${credits(F.bank)}</span></div>`;
    h += F.claims.map(c => `<div class="kv"><span>Holds <b>${esc(c.name)}</b></span><span class="small">Dreadnought ${c.hp}%</span></div>`).join('');
    const claimed = W.claims && W.claims[G.sys];
    if (F.leader === y.name && G.view && here && here.faction === 'frontier' && !claimed) {
      h += `<div class="dim small">Anchor a Dreadnought here to claim ${esc(here.name)} (paid from the fleet bank):</div>` + DREADNOUGHTS.map((D, i) => `<div class="kv"><span>${esc(D.name)}</span><span><button class="btn sm" data-act="anchor" data-m="${i}" ${F.bank < D.cost ? 'disabled' : ''}>${credits(D.cost)}</button></span></div>`).join('');
    }
  }
  if (W.front) h += `<div class="dim small" style="margin-top:6px">Front window: ${W.front[0]}:00-${W.front[1]}:00 UTC, when Dreadnoughts can be damaged. ${W.vuln ? '<b style="color:#ff8a70">OPEN NOW</b>' : ''}</div>`;
  if (W.calendar) h += '<div class="sect">EVENT CALENDAR</div>' + W.calendar.map((e, i) => `<div class="kv"><span>${i === 0 ? '<b>' : ''}${esc(e.name)}${i === 0 ? '</b>' : ''}</span><span class="dim small">${i === 0 ? 'ends in ' + left(e.end) : new Date(e.start).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}</span></div>`).join('');
  return h;
}

export function fleetHtml(G) {
  const y = G.you, F = y.fleet, L = G.landed;
  if (!F) {
    let h = `<div class="sect" style="margin-top:0">FOUND A FLEET</div><div class="rrow"><input id="ftag" placeholder="TAG (2-4)" maxlength="4" style="width:90px;text-transform:uppercase"><input id="fname" placeholder="Fleet name" maxlength="24"><button class="btn sm" data-act="fcreate">FOUND · ${credits(FLEET.createCost)}</button></div>
      <div class="dim small">Fleetmates never fight each other, share a quarter of each other's bounties in the same system, get their own chat (/f) and a shared bank, and can claim Frontier systems with a Dreadnought.</div>`;
    h += `<div class="sect">FLEETS IN THE RIFT</div>` + ((L && L.fleets) || []).map(f => `<div class="kv"><span><b>[${esc(f.tag)}]</b> ${esc(f.name)} <span class="dim small">${f.members} members · ${f.claims} systems held</span></span><span><button class="btn sm" data-act="fjoin" data-tag="${f.tag}">${f.open ? 'JOIN' : 'REQUEST'}</button></span></div>`).join('') || '<p class="dim">No fleets yet. Be the first.</p>';
    return h;
  }
  const lead = F.leader === y.name;
  let h = `<div class="sect" style="margin-top:0">[${esc(F.tag)}] ${esc(F.name)}</div><div class="kv"><span>Leader</span><span>${esc(F.leader)}</span></div><div class="kv"><span>Recruiting</span><span>${F.open ? 'open to all' : 'by request'} ${lead ? `<button class="btn sm" data-act="fopen" data-v="${F.open ? 0 : 1}">${F.open ? 'CLOSE' : 'OPEN'}</button>` : ''}</span></div>`;
  h += `<div class="kv"><span>Fleet bank</span><span class="cr">${credits(F.bank)}</span></div><div class="rrow"><input id="famt" placeholder="credits" type="number" min="0" style="width:140px"><button class="btn sm" data-act="fdep">DEPOSIT</button>${lead ? '<button class="btn sm" data-act="fwd">WITHDRAW</button>' : ''}</div>`;
  if (lead && F.pending.length) h += '<div class="sect">REQUESTS</div>' + F.pending.map(n => `<div class="kv"><span>${esc(n)}</span><span><button class="btn sm" data-act="facc" data-n="${esc(n)}">ACCEPT</button> <button class="btn sm" data-act="fdeny" data-n="${esc(n)}">DENY</button></span></div>`).join('');
  h += `<div class="sect">MEMBERS (${F.members.length}/${FLEET.maxMembers})</div>` + F.members.map(m => `<div class="kv"><span>${m.online ? '<b style="color:var(--ok)">●</b>' : '<span class="dim">○</span>'} ${esc(m.name)}</span><span class="dim small">${esc(m.sys)} ${lead && m.name !== y.name ? `<button class="btn sm" data-act="fkick" data-n="${esc(m.name)}">REMOVE</button>` : ''}</span></div>`).join('');
  h += `<div class="sect">TERRITORY</div>` + (F.claims.length ? F.claims.map(c => `<div class="kv"><span>${esc(c.name)}</span><span class="small">Dreadnought ${c.hp}%</span></div>`).join('') : '<p class="dim small">No systems held.</p>');
  h += `<div class="dim small">To claim a Frontier system, the leader flies there and anchors a Dreadnought from the OPS companion tab. Held systems give members +${CLAIM.buff.damagePct}% damage and shields there, and outsiders' trades pay ${CLAIM.taxPct}% into the fleet bank. Rivals can only damage a Dreadnought during the daily front window.</div>`;
  h += '<div style="margin-top:8px"><button class="btn sm" data-act="fleave">LEAVE FLEET</button></div>';
  return h;
}

export const STORE_FACS = (FACTIONS_) => Object.entries(FACTIONS_).filter(([k, F]) => !F.region && !F.hidden && k !== 'umbral').map(([k]) => k);
export function storeMenuHtml(G, FACTIONS_) {
  const y = G.you, facs = STORE_FACS(FACTIONS_), fac = G.storeFac && facs.includes(G.storeFac) ? G.storeFac : (G.landed && G.landed.store) || 'quantum';
  G.storeFac = fac;
  const side = facs.map(k => { const F = FACTIONS_[k], rep = y.rep[k] || 0, tok = (y.tokens && y.tokens[k]) || 0;
    return `<div class="sfac ${k === fac ? 'on' : ''}" data-act="sfac" data-f="${k}"><b style="color:${F.color}">${esc(F.short)}</b><span class="dim small">${rep} · ${tok} tokens</span></div>`; }).join('');
  return `<h2>FACTION STORES <span class="dim small">Rift scrip: ${(y.tokens && y.tokens.any) || 0} · ${G.landed ? 'purchases are delivered to you here' : 'land anywhere to buy'}</span></h2><div class="sgrid"><div class="sfacs">${side}</div><div class="sbody well">${storeHtml(G, fac)}</div></div><button class="btn sm" data-act="sclose">CLOSE (Esc)</button>`;
}
export function storeHtml(G, facArg) {
  const y = G.you, fac = facArg || G.landed.store, F = FACTIONS[fac], rep = y.rep[fac] || 0, tok = (y.tokens && y.tokens[fac]) || 0, scrip = (y.tokens && y.tokens.any) || 0, landed = !!G.landed;
  const tier = [...STORE_TIERS].reverse().find(t => rep >= t.rep);
  let h = `<div class="sect" style="margin-top:0">${esc(F.name.toUpperCase())} QUARTERMASTER</div><div class="kv"><span>Your standing</span><span style="color:${F.color}">${rep} ${tier ? '· ' + tier.name : ''}</span></div>
    <div class="kv"><span>${F.short} tokens</span><span>${tok}</span></div><div class="kv"><span>Rift scrip <span class="dim small">(any store)</span></span><span>${scrip}</span></div>
    <div class="dim small">Earn ${F.short} tokens by finishing jobs in ${F.short} space and their commissions. Daily and weekly goals pay Rift scrip, which any store accepts.</div><table class="tbl"><tr><th>ITEM</th><th>STANDING</th><th>TOKENS</th><th>CREDITS</th><th></th></tr>`;
  for (const it of STORE_ITEMS) {
    const nm = it.give.crate ? `${STORE_MAT[fac]} crate (grade ${GRADES[it.give.crate]})` : it.name;
    const can = landed && rep >= it.rep && tok + scrip >= it.tokens && y.credits >= it.credits;
    h += `<tr><td>${esc(nm)}</td><td style="color:${rep >= it.rep ? '#8ff0ad' : '#ff9a8a'}">${it.rep}</td><td>${it.tokens}</td><td>${it.credits ? credits(it.credits) : '-'}</td><td style="text-align:right"><button class="btn sm" data-act="buystore" data-f="${fac}" data-id="${it.id}" ${can ? '' : 'disabled'}>BUY</button></td></tr>`;
  }
  return h + '</table>';
}
