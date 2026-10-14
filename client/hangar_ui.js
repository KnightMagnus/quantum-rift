// Quantum Rift 0.5 interface pieces: crew (bar, roster, bridge), hangar (shuttles, job board, drydock), research trees, boarding.
import { rankLine, lowerDeckHtml } from './syn_ui.js';
import { SYS, FACTIONS, MATERIALS, GRADES, RESEARCH } from '/shared/galaxy.js';
import { SHUTTLES, SHUTTLE_JOBS, SHUTTLE_REPAIR, ROLES, RARITY, STAT_NAME, BRIDGE_SLOTS, ROSTER_MAX, XP_LEVEL, MAX_LEVEL, RESEARCH_TREES, RESEARCH_QUEUE_MAX, REFINE_UP, SYNERGY } from '/shared/hangar.js';
import { officerStats, credits } from '/shared/rules.js';

const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const mins = (ms) => { const m = Math.max(0, Math.ceil(ms / 60000)); return m >= 60 ? `${Math.floor(m / 60)}h ${m % 60}m` : `${m}m`; };
const SLOT_NAME = { captain: 'Captain', bridge1: 'Bridge', bridge2: 'Bridge' };

function statText(o) { return Object.entries(officerStats(o)).map(([k, v]) => `+${v}${k === 'fuel' ? '' : '%'} ${STAT_NAME[k]}`).join(', '); }
function officerCard(G, o, extra) {
  const R = RARITY[o.rarity], F = FACTIONS[o.race];
  return `<div class="ocard" style="border-color:${R.color}55"><div class="oname"><b style="color:${R.color}">${esc(o.name)}</b> <span class="dim small">${R.name} ${ROLES[o.role].name} · <span style="color:${F.color}">${F.short}</span> · Lv ${o.lv}</span></div>
    <div class="small">${statText(o)}</div>${o.xp !== undefined && o.lv < MAX_LEVEL && o.id !== undefined && typeof o.id === 'number' ? `<div class="xpbar"><i style="width:${Math.min(100, 100 * o.xp / XP_LEVEL(o.lv))}%"></i></div>` : ''}${extra || ''}</div>`;
}
function where(G, o) {
  const y = G.you; for (const k of BRIDGE_SLOTS) if (y.bridge[k] === o.id) return SLOT_NAME[k];
  const sh = y.shuttles.find(s => s.crew === o.id); if (sh) return `${SHUTTLES[sh.kind].name}${sh.state === 'out' ? ' (out)' : ''}`;
  return null;
}

// ------------------------------------------------------------------ CREW tab (any landing): bar + roster + bridge
export function crewHtml(G) {
  const y = G.you, L = G.landed;
  let h = '<div class="sect" style="margin-top:0">YOUR BRIDGE</div><div class="bridge">';
  for (const k of BRIDGE_SLOTS) {
    const o = y.officers.find(x => x.id === y.bridge[k]);
    h += `<div class="slot"><div class="dim small">${k === 'captain' ? 'CAPTAIN (x1.25)' : 'BRIDGE OFFICER'}</div>${o ? officerCard(G, o, `<button class="btn sm" data-act="off" data-op="assign" data-oid="${o.id}" data-slot="">STAND DOWN</button>`) : '<div class="dim">Empty</div>'}</div>`;
  }
  h += '</div>';
  const races = {}; for (const k of BRIDGE_SLOTS) { const o = y.officers.find(x => x.id === y.bridge[k]); if (o) races[o.race] = (races[o.race] || 0) + 1; }
  const syn = Object.entries(races).filter(([r, n]) => n >= 2 && SYNERGY[r]);
  h += `<div class="dim small">Two or more officers of one race on the bridge unlock a synergy bonus.${syn.length ? ' Active: ' + syn.map(([r]) => `<b style="color:${FACTIONS[r].color}">${FACTIONS[r].short}</b> (${Object.entries(SYNERGY[r]).map(([k, v]) => `+${v}${k === 'fuel' ? '' : '%'} ${STAT_NAME[k]}`).join(', ')})`).join(', ') : ''}</div>`;
  if (L && L.bar && L.bar.length) {
    h += `<div class="sect">THE BAR: OFFICERS LOOKING FOR A BERTH</div><div class="ogrid">` + L.bar.map(o => officerCard(G, o, `<div class="kv"><span class="cr">${credits(o.cost)} cr</span><button class="btn sm" data-act="off" data-op="hire" data-id="${o.id}">HIRE</button></div>`)).join('') + '</div><div class="dim small">New faces arrive every hour.</div>';
  }
  h += `<div class="sect">ROSTER (${y.officers.length}/${ROSTER_MAX})</div>`;
  if (!y.officers.length) h += '<p class="dim">No officers yet. Hire them at bars on inhabited worlds.</p>';
  h += '<div class="ogrid">' + y.officers.map(o => {
    const w = where(G, o), out = w && w.endsWith('(out)');
    const btns = out ? '' : BRIDGE_SLOTS.filter(k => y.bridge[k] !== o.id).map(k => `<button class="btn sm" data-act="off" data-op="assign" data-oid="${o.id}" data-slot="${k}">${k === 'captain' ? 'CAPTAIN' : k === 'bridge1' ? 'BRIDGE 1' : 'BRIDGE 2'}</button>`).join(' ') + ` <button class="btn sm" data-act="off" data-op="dismiss" data-oid="${o.id}">DISMISS</button>`;
    return officerCard(G, o, `${rankLine(G, o, true)}<div class="dim small">${w ? 'Serving: ' + esc(w) : 'Off duty'}</div><div>${btns}</div>`);
  }).join('') + '</div>';
  h += lowerDeckHtml(G);   // 1.2
  return h;
}

// ------------------------------------------------------------------ HANGAR: shuttles + job board (remote: send and track) + drydock (at the station)
export function shuttleSummary(G) {
  const y = G.you, now = Date.now();
  if (!y.shuttles.length) return '';
  return '<div class="sect">SHUTTLES</div>' + y.shuttles.map(sh => {
    const T = SHUTTLES[sh.kind];
    const st = sh.state === 'out' ? `<span style="color:#7ad0ff">${esc(sh.job.title)} · back in ${mins(sh.ends - now)}</span>` : sh.state === 'damaged' ? '<span style="color:#ff9a8a">damaged</span>' : '<span style="color:var(--ok)">ready</span>';
    return `<div class="kv"><span>${esc(T.name)}</span><span class="small">${st}</span></div>`;
  }).join('');
}
export function hangarHtml(G, atHome) {
  const y = G.you, now = Date.now(), S = y.station;
  if (!S.site) return '<p class="dim">Claim a station hull first. Its hangar launches shuttles on jobs while you fly.</p>';
  let h = `<div class="sect" style="margin-top:0">HANGAR BAYS (${y.shuttles.length}/${y.bays})</div>`;
  if (!y.bays) h += '<p class="dim">The hangar opens at Ops 2.</p>';
  const idle = y.shuttles.filter(s => s.state === 'idle'), crewFree = y.officers.filter(o => !where(G, o) || y.shuttles.some(s => s.crew === o.id && s.state !== 'out'));
  h += '<div class="ogrid">' + y.shuttles.map(sh => {
    const T = SHUTTLES[sh.kind], crew = sh.crew ? y.officers.find(o => o.id === sh.crew) : null;
    let body;
    if (sh.state === 'out') { const tot = Math.max(1, sh.ends - (sh.ends - sh.job.minutes * 60000)), pct = Math.max(0, Math.min(100, 100 - 100 * (sh.ends - now) / tot)); body = `<div class="small" style="color:#7ad0ff">${esc(sh.job.title)}</div><div class="xpbar"><i style="width:${pct}%;background:#7ad0ff"></i></div><div class="dim small">Back in ${mins(sh.ends - now)} · ${Math.round(sh.chance * 100)}% odds</div>`; }
    else if (sh.state === 'damaged') body = `<div class="small" style="color:#ff9a8a">Damaged</div>${atHome ? `<button class="btn sm" data-act="sh" data-op="repair" data-sid="${sh.id}">REPAIR ${credits(Math.round(T.cost * SHUTTLE_REPAIR))}</button>` : '<div class="dim small">Repair at your station.</div>'}`;
    else body = `<div class="small" style="color:var(--ok)">Ready</div><div class="rrow"><select data-crew="${sh.id}"><option value="">No crew</option>${y.officers.filter(o => !y.shuttles.some(s => s.crew === o.id && s !== sh && s.state === 'out')).map(o => `<option value="${o.id}" ${o.id === sh.crew ? 'selected' : ''}>${esc(o.name)} (${ROLES[o.role].name} ${o.lv})</option>`).join('')}</select></div>`;
    return `<div class="ocard"><div class="oname"><img src="assets/${G.A.ships[T.hull].img}" style="width:44px;height:30px;object-fit:contain;vertical-align:middle"> <b>${esc(T.name)}</b> <span class="dim small">${sh.runs} runs</span></div>${crew && sh.state !== 'idle' ? `<div class="dim small">Crew: ${esc(crew.name)}</div>` : ''}${body}${atHome && sh.state !== 'out' ? ` <button class="btn sm" data-act="sh" data-op="scrap" data-sid="${sh.id}">SCRAP</button>` : ''}</div>`;
  }).join('') + '</div>';
  if (atHome && y.shuttles.length < y.bays) {
    h += '<div class="sect">BUILD A SHUTTLE</div>' + Object.entries(SHUTTLES).map(([k, T]) => `<div class="kv"><span><b>${esc(T.name)}</b> <span class="dim small">${esc(T.desc)}</span></span><span class="small">${S.ops >= T.ops ? `${credits(T.cost)} + ${T.mats.map(([m, g]) => `<span style="color:${y.mats[m][g] >= 1 ? '#8ff0ad' : '#ff9a8a'}">${m} ${GRADES[g]}</span>`).join(', ')} <button class="btn sm" data-act="sh" data-op="build" data-kind="${k}">BUILD</button>` : `<span class="dim">Ops ${T.ops}</span>`}</span></div>`).join('');
  }
  // job board
  h += `<div class="sect">HANGAR JOB BOARD</div><div class="dim small">Jobs run in real time, even while you are offline. A shuttle suited to the job and a crew officer (scouts best) raise the odds. Dangerous systems pay more and can cost you the shuttle.</div>`;
  h += y.board.map(j => {
    const J = SHUTTLE_JOBS[j.kind], S_ = SYS[j.sys], rw = j.reward;
    const pay = [rw.credits ? credits(rw.credits) + ' cr' : '', ...(rw.mats || []).map(([m, g, n]) => `${n} ${m} ${GRADES[g]}`), rw.rep ? `+${rw.rep[1]} ${FACTIONS[rw.rep[0]].short}` : '', rw.chart ? 'chart the system' : ''].filter(Boolean).join(' · ');
    const opts = idle.map(sh => `<option value="${sh.id}" ${SHUTTLES[sh.kind] && J.fit === sh.kind ? 'selected' : ''}>${esc(SHUTTLES[sh.kind].name)}${J.fit === sh.kind ? ' ★' : ''}</option>`).join('');
    return `<div class="card" style="cursor:default"><div class="t">${esc(j.title)}</div><div class="dim small">${J.name} · ${esc(S_.name)} (${FACTIONS[S_.faction].short}) · ${j.jumps} jumps · danger ${j.danger} · ~${mins(j.minutes * 60000)} · best: ${SHUTTLES[J.fit].name}</div><div class="p">${pay}</div>
      ${opts ? `<div class="rrow"><select data-job="${j.id}">${opts}</select><button class="btn sm" data-act="sh" data-op="send" data-job="${j.id}">LAUNCH</button></div>` : ''}</div>`;
  }).join('') || '<p class="dim">No jobs posted. The board refreshes every three hours.</p>';
  return h;
}


// ------------------------------------------------------------------ research trees with a queue
export function researchHtml(G, interactive) {
  const y = G.you, S = y.station, now = Date.now(), q = S.queue || [];
  let h = '<div class="sect">RESEARCH LAB</div>';
  if (S.active) { const r = RESEARCH.find(r => r.id === S.active.id); h += `<div class="kv"><span>In progress</span><span><b>${esc(r.name)}</b> · ${mins(S.active.ends - now)}</span></div>`; }
  if (q.length) h += `<div class="kv"><span>Queue (${q.length}/${RESEARCH_QUEUE_MAX})${S.waiting ? ' <span style="color:#ff9a8a">waiting for resources</span>' : ''}</span><span class="small">${q.map(id => `${esc(RESEARCH.find(r => r.id === id).name)}${interactive ? ` <a href="#" data-act="st" data-op="unqueue" data-id="${id}" title="Remove">✕</a>` : ''}`).join(' → ')}</span></div>`;
  G.rtree = G.rtree || 'Combat';
  h += `<div class="chips">${RESEARCH_TREES.map(t => `<span class="chip ${t === G.rtree ? 'on' : ''}" data-act="rtree" data-t="${t}">${t.toUpperCase()} ${RESEARCH.filter(r => r.tree === t && S.done.includes(r.id)).length}/${RESEARCH.filter(r => r.tree === t).length}</span>`).join('')}</div>`;
  for (const r of RESEARCH.filter(r => r.tree === G.rtree)) {
    const done = S.done.includes(r.id), queued = q.includes(r.id) || (S.active && S.active.id === r.id), avail = !done && S.ops >= r.ops;
    const eff = Object.entries(r.bonus).map(([k, v]) => `${k}+${v}`).join(' ');
    h += `<div class="kv"><span style="color:${done ? '#8ff0ad' : avail ? '#ddd' : '#555'}">${done ? '✓ ' : ''}${esc(r.name)}${r.needs ? ` <span class="dim small">after ${esc(RESEARCH.find(x => x.id === r.needs).name)}</span>` : ''}<div class="dim small">${esc(eff)}</div></span><span class="small">${done ? 'done' : queued ? 'queued' : avail ? `${credits(r.cost)} + ${r.mats.map(([m, g]) => m + ' ' + GRADES[g]).join(', ')} · ${r.minutes}m ${interactive ? `<button class="btn sm" data-act="st" data-op="research" data-id="${r.id}">${S.active || r.needs && !S.done.includes(r.needs) ? 'QUEUE' : 'START'}</button>` : ''}` : `Ops ${r.ops}`}</span></div>`;
  }
  return h;
}
export function materialsHtml(G, interactive) {
  const y = G.you;
  let h = `<div class="sect">MATERIALS</div><table class="tbl"><tr><th></th>${GRADES.map(g => `<th>${g}</th>`).join('')}</tr>${MATERIALS.map(m => `<tr><td>${m}</td>${y.mats[m].map((n, g) => `<td style="color:${n ? '#fff' : '#444'}">${n}${interactive && g < 4 && n >= REFINE_UP.need ? ` <a href="#" class="small" data-act="st" data-op="refine" data-mat="${m}" data-g="${g}" data-n="1" title="Refine ${REFINE_UP.need} into one grade ${GRADES[g + 1]} (${credits(REFINE_UP.cost[g])} cr)">▲</a>` : ''}</td>`).join('')}</tr>`).join('')}</table>`;
  if (interactive) h += `<div class="dim small">▲ refines ${REFINE_UP.need} crates into one of the next grade. <a href="#" data-act="refineall">Refine all</a></div>`;
  return h;
}

// ------------------------------------------------------------------ boarding dialog
export function boardHtml(G, t) {
  const H = G.A.ships[t.hull], F = FACTIONS[G.FAC[t.fac]], lawful = F && !F.pirate && G.FAC[t.fac] !== 'umbral';
  const crew = BRIDGE_SLOTS.filter(k => G.you.bridge[k]).length;
  return `<h2>BOARDING: ${esc(t.name || H.name)}</h2><p class="dim">${esc(H.name)} · ${F ? F.name : ''} · disabled and drifting</p>
    <div class="bopts"><button class="btn" data-board="plunder">1 · PLUNDER<br><span class="small">credits, cargo, maybe a crate${lawful ? ' · standing -8' : ''}</span></button>
    <button class="btn" data-board="capture" ${crew ? '' : 'disabled'}>2 · CAPTURE<br><span class="small">${crew ? `prize crew of ${crew} officer${crew > 1 ? 's' : ''} · to your drydock${lawful ? ' · standing -15' : ''}` : 'needs an officer on the bridge'}</span></button>
    <button class="btn" data-board="rescue">3 · ${lawful ? 'RESCUE' : 'ARREST'}<br><span class="small">${lawful ? 'standing +6 and a reward' : 'a Concord reward'}</span></button></div>
    <button class="btn sm" data-board="">CANCEL (Esc)</button>`;
}
