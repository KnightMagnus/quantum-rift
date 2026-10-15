// Quantum Rift interface: HUD, landing screens (trade, shipyard, outfitter, jobs, Quantum Station), companion tabs, galaxy map, chat.
import { missionsHtml } from './missions.js';
import { playStation, stopRadio } from './radio.js';
import { blackMarketHtml, bankHtml, arcCardsHtml, bunkInfo, synBadge } from './syn_ui.js';
import { SYS, STELLARS, FACTIONS, COMMODITIES, MATERIALS, GRADES, OPS, RESEARCH, REFINERY, ORE_PROCESS, WINGMATES, FACTION_HULLS, STATION_SHIPS, SITES, RELOCATE, relocateCost } from '/shared/galaxy.js';
import { shipStats, researchBonus, allOutfits, credits, repLabel, weaponParams, K, route, price } from '/shared/rules.js';
import { galaxy, mapHit, mapFit, stationDesign } from './render.js';
import { planetType } from './planets.js';
import { crewHtml, hangarHtml, shuttleSummary, researchHtml, materialsHtml } from './hangar_ui.js';
import { specialistsHtml } from './spec_ui.js';
import { docksHtml, dockChips, dockLine } from './docks_ui.js';
import { WING_ONLY } from '/shared/docks.js';
import { STATES } from '/shared/living.js';
import { REFINE_UP } from '/shared/hangar.js';
import { opsHtml, storeMenuHtml } from './fronts_ui.js';
import { renderCaptains } from './coop_ui.js';
import { colonyHtml, defenseHtml, masteryHtml, arenaHtml, exchangeHtml, boardsHtml } from './frontier_ui.js';

import { ROLES_INFO, BEATS } from '/shared/roles.js';
import { levelOf, winOdds, HOLDOUT } from '/shared/hostile.js';
const $ = (id) => document.getElementById(id);
export const roleTag = (H) => { const R = ROLES_INFO[H && H.role]; return R ? `<span class="role" style="color:${R.color}" title="${R.desc}">${R.icon} ${R.name}</span>` : ''; };
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
let G, send;
export function initUI(g, sender) {
  G = g; send = sender;
  try { G.mapLegend = localStorage.getItem('rift.legend') !== '0'; } catch {}
  $('glegend').classList.toggle('on', G.mapLegend !== false);
  $('glegend').addEventListener('click', () => { G.mapLegend = G.mapLegend === false; $('glegend').classList.toggle('on', G.mapLegend); try { localStorage.setItem('rift.legend', G.mapLegend ? '1' : '0'); } catch {} drawGMap(); });   // 2.4
  document.querySelectorAll('#ctabs button').forEach(b => b.onclick = () => ctab(b.dataset.tab));
  $('depart').onclick = () => send({ t: 'depart' });
  $('chatlog').addEventListener('click', (e) => { const b = e.target.closest('[data-dm]'); if (b) { ctab('captains'); G.ctabSub = 'dm'; G.dmWith = b.dataset.dm; refreshCompanion(); } });   // 2.6
  $('tg-acts').addEventListener('click', (e) => { const b = e.target.closest('[data-tga]'); if (!b) return; const n = $('tg-acts').dataset.n; if (!n) return;   // 2.6: invite, duel, message or befriend the captain you targeted
    if (b.dataset.tga === 'invite') send({ t: 'armada', op: 'invite', name: n }); else if (b.dataset.tga === 'friend') send({ t: 'social', op: 'add', name: n });
    else if (b.dataset.tga === 'duel') ask(`Challenge ${n} to a duel? A fight to disabled; nobody loses a ship.`, () => send({ t: 'duel', op: 'challenge', name: n }));
    else if (b.dataset.tga === 'dm') { ctab('captains'); G.ctabSub = 'dm'; G.dmWith = n; refreshCompanion(); } });
  $('storein').addEventListener('click', onAct); $('storesbtn').onclick = () => openStores();
  $('landbody').addEventListener('click', onAct); $('landbody').addEventListener('click', (e) => { const b = e.target.closest('[data-plot]'); if (b) { plot(b.dataset.plot); toast(`Course plotted to ${SYS[b.dataset.plot].name}. Press J in space to jump.`); } });   // 2.4 $('dockchips').addEventListener('click', onAct); $('stview').addEventListener('click', onAct); $('opsview').addEventListener('click', onAct); $('opsview').addEventListener('click', (e) => { const b = e.target.closest('[data-plot]'); if (b) { plot(b.dataset.plot); openMap(b.dataset.plot); } });   // 2.4
  $('landbody').addEventListener('change', (e) => { if (e.target.id === 'ysort') { G.ysort = e.target.value; renderLanded(); } else if (e.target.id === 'ofit') { G.ofit = e.target.checked; renderLanded(); } });   // 2.5.2: shipyard sort, outfitter filter
  $('landbody').addEventListener('change', (e) => {   // 2.1: dock pickers
    const dp = e.target.closest('select.dpick'); if (dp) { send({ t: 'docks', op: 'assign', k: +dp.dataset.dk, slot: dp.dataset.slot === 'lead' ? 'lead' : +dp.dataset.slot, uid: dp.value || null }); return; }
    const dc = e.target.closest('select[data-role]'); if (dc) { send({ t: 'docks', op: 'crew', k: +dc.dataset.dk, w: +dc.dataset.w, role: dc.dataset.role, oid: dc.value ? +dc.value : null }); return; }
 const c = e.target.closest('select[data-crew]'); if (c) send({ t: 'shuttle', op: 'crew', sid: +c.dataset.crew, oid: c.value ? +c.value : null }); });
  $('mlist').addEventListener('click', (e) => { const b = e.target.closest('[data-plot]'); if (b) { plot(b.dataset.plot); openMap(b.dataset.plot); }
    const a = e.target.closest('[data-abandon]'); if (a) { const m = (G.you.missions || []).find(x => x.id === a.dataset.abandon); if (m) ask(m.quest ? `Abandon "${m.title}"? That ends the story "${m.quest.name}".` : `Abandon "${m.title}"? You won't be paid for it.`, () => send({ t: 'abandon', id: m.id })); } });   // 2.0.3
  // galaxy map: drag to pan, wheel to zoom around the cursor, click a system to plot a course
  const gc = $('gcanvas'), mp = (e) => { const r = gc.getBoundingClientRect(); return [(e.clientX - r.left) * gc.width / r.width, (e.clientY - r.top) * gc.height / r.height]; };
  let drag = null;
  gc.onmousedown = (e) => { const [x, y] = mp(e); drag = { x, y, cx: G.mapView.cx, cy: G.mapView.cy, moved: false }; };
  window.addEventListener('mouseup', (e) => { if (!drag) return; const d = drag; drag = null; if (!d.moved && e.target === gc) { const [x, y] = mp(e); const s = mapHit(G, x, y); if (s) plot(s); } });
  gc.onmousemove = (e) => {
    const [x, y] = mp(e);
    if (drag) { if (Math.hypot(x - drag.x, y - drag.y) > 4) drag.moved = true; if (drag.moved) { G.mapView.cx = drag.cx - (x - drag.x) / G.mapView.k; G.mapView.cy = drag.cy - (y - drag.y) / G.mapView.k; } }
    G.hoverSys = mapHit(G, x, y); drawGMap();
  };
  gc.addEventListener('wheel', (e) => {
    e.preventDefault(); const V = G.mapView, [x, y] = mp(e), wx = V.cx + (x - V.W / 2) / V.k, wy = V.cy + (y - V.H / 2) / V.k;
    V.k = Math.max(V.fit * 0.8, Math.min(V.fit * 8, V.k * (e.deltaY < 0 ? 1.18 : 1 / 1.18)));
    V.cx = wx - (x - V.W / 2) / V.k; V.cy = wy - (y - V.H / 2) / V.k; drawGMap();
  }, { passive: false });
  $('gfit').onclick = () => { const f = mapFit(gc.width, gc.height); Object.assign(G.mapView, f); drawGMap(); };
  $('ghere').onclick = () => centerOn(G.sys, 3);
  $('ghome').onclick = () => { const st = G.you && G.you.station, p = st && st.claimed && st.site && STELLARS[st.site]; if (p) { centerOn(p.system, 3); G.hoverSys = p.system; drawGMap(); } else toast('You have no Personal Station yet. Claim a derelict station hull (the purple diamonds) to build one.'); };   // 2.5.2
  $('gsearch').oninput = searchMap; $('gsearch').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') { const f = $('gresults').querySelector('[data-sys]'); if (f) f.click(); } if (e.key === 'Escape') { $('gsearch').blur(); } };
  $('gresults').onclick = (e) => { const t = e.target.closest('[data-sys]'); if (!t) return; centerOn(t.dataset.sys, 3.5); plot(t.dataset.sys); $('gresults').innerHTML = ''; $('gsearch').value = ''; };
  $('deadok').onclick = () => $('deadbox').classList.add('hidden');
  // radio
  $('rgo').onclick = radioSearch; $('rq').onkeydown = (e) => { if (e.key === 'Enter') radioSearch(); e.stopPropagation(); };
  $('rfav').onclick = () => { G.radioTab = 'fav'; renderRadio(); }; $('rres').onclick = () => { G.radioTab = 'res'; renderRadio(); };
  $('rstop').onclick = () => stopRadio($('rnow'));
  $('cq').oninput = renderCodex; $('cq').onkeydown = (e) => e.stopPropagation();
  $('lgo').onclick = () => { const v = $('lq').value.trim(); if (v) { send({ t: 'note', text: v }); $('lq').value = ''; } };
  $('lq').onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') $('lgo').onclick(); };
  renderRadio();
}
// 2.0: toasts pick a sound from what they say
const TOAST_SND = [[/hired guns|raid|invasion|closing in|under attack|price on your head|ambush/i, 'alert'], [/reached level|promoted|takes notice|is now your ally|career guide complete|joins your crew/i, 'levelup'],
  [/complete|collected|delivered|paid off|job done|bounty:|rewards?/i, 'complete'], [/not enough|can't|cannot|refuses|too far|no room|denied|only at|only in|needs |you need|missed/i, 'error']];
// 2.5: which rendered landing picture (tools/rift_landscapes.py) a world shows
const LAND_SCENES = { terran: ['terran_city1', 'terran_city2', 'terran_wild1', 'terran_wild2', 'jungle1', 'jungle2'], city: ['city1', 'city2', 'terran_city1'], ocean: ['ocean1', 'ocean2'], desert: ['desert1', 'desert2', 'desert3'], ice: ['ice1', 'ice2'],
  lava: ['lava1', 'lava2'], barren: ['moon1', 'moon2', 'moon3'], gas: ['gas1', 'gas2'], toxic: ['toxic1', 'toxic2'], crystal: ['crystal1', 'crystal2'] };
function landScene(p) {
  if (p.id === 'earth') return 'l_earth';
  if (p.kind === 'station') return 'l_st_' + stationDesign(p);
  let h = 2166136261; for (const c of p.id) h = Math.imul(h ^ c.charCodeAt(0), 16777619); h >>>= 0;
  if (p.outlaw) return ['l_moon2', 'l_lava2', 'l_desert2'][h % 3];   // outlaw dens look the part
  let t = planetType(p); const d = ((p.desc || '') + ' ' + p.name).toLowerCase();
  if (t === 'terran' && /(city|capital|sprawl|metropol|towers|arcolog)/.test(d)) t = 'city';
  if (t === 'terran' && /(jungle|forest|garden)/.test(d)) return ['l_jungle1', 'l_jungle2'][h % 2];
  const L = LAND_SCENES[t] || LAND_SCENES.barren; return 'l_' + L[h % L.length];
}
// 2.5: a styled confirmation dialog in place of the browser's own confirm box
export function ask(msg, yes, opts = {}) {
  const box = document.getElementById('askbox'); document.getElementById('askx').textContent = msg;
  document.getElementById('askyes').textContent = opts.yes || 'CONFIRM'; box.classList.remove('hidden');
  const done = (ok) => { box.classList.add('hidden'); window.removeEventListener('keydown', key, true); document.getElementById('askyes').onclick = document.getElementById('askno').onclick = null; if (ok) yes(); };
  const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); e.preventDefault(); done(false); } else if (e.key === 'Enter') { e.stopPropagation(); e.preventDefault(); done(true); } };
  window.addEventListener('keydown', key, true);
  document.getElementById('askyes').onclick = () => done(true); document.getElementById('askno').onclick = () => done(false);
}
export function toast(msg) { const k = TOAST_SND.find(([re]) => re.test(msg)), kind = k ? k[1] : 'toast'; window.dispatchEvent(new CustomEvent('rift-toast-sound', { detail: kind })); G._toastKind = kind; const d = document.createElement('div'); d.textContent = msg; d.className = 't-' + kind; $('toasts').appendChild(d); setTimeout(() => d.remove(), 5200); while ($('toasts').children.length > 4) $('toasts').firstChild.remove(); }
export function chatLine(m) {
  const d = document.createElement('div');
  if (!m.from) { d.className = 'sys'; d.textContent = m.msg; }
  else d.innerHTML = `<b${m.ch === 'armada' ? ' class="armada"' : ''}${!G.solo && m.from !== G.myName ? ` data-dm="${esc(m.from)}" title="Message ${esc(m.from)}"` : ''}>${m.ch === 'armada' ? '[Armada] ' : ''}${esc(m.from)}${m.ch === 'sys' ? ' (system)' : ''}:</b> ${esc(m.msg)}`;   // 2.6: click a name to message them
  $('chatlog').appendChild(d); while ($('chatlog').children.length > 40) $('chatlog').firstChild.remove();
}

// ------------------------------------------------------------------ HUD (every frame)
export function hud() {
  if (!G) return; const me = G.view, y = G.you; if (!y) return;
  const st = y.shipStats;
  const sh = me ? me.shield : st.shield, ar = me ? me.armor : st.armor, fu = me ? me.fuel : y.fuel;
  $('v-sh').textContent = `${Math.round(sh)} / ${Math.round(st.shield)}`; $('v-ar').textContent = `${Math.round(ar)} / ${Math.round(st.armor)}`;   // 2.0
  $('b-sh').style.width = (100 * sh / Math.max(1, st.shield)) + '%'; $('b-ar').style.width = (100 * ar / Math.max(1, st.armor)) + '%';
  $('b-fu').style.width = (100 * fu / Math.max(1, st.fuel)) + '%'; $('jumps').textContent = Math.floor(fu / K.jumpFuel) + 'j';
  if (G._crSeen != null && y.credits !== G._crSeen) { const dlt = y.credits - G._crSeen, f = document.createElement('div'); f.className = 'crfloat ' + (dlt > 0 ? 'up' : 'dn'); f.textContent = (dlt > 0 ? '+' : '−') + credits(Math.abs(dlt)); $('cr').parentElement.appendChild(f); setTimeout(() => f.remove(), 1600); }   // 2.0
  G._crSeen = y.credits;
  $('spd').textContent = me ? `SPD ${Math.round(Math.hypot(me.vx, me.vy) / 0.45)} / ${Math.round(st.maxSpeed / 0.45)}` : ''; $('spd').title = 'Speed: current / top';   // 2.0.3: labelled
  { const S = SYS[G.sys], on = !!(y.newcomer && S && S.danger <= 2 && !S.farside && !['umbral', 'deep'].includes(S.faction)), el = $('prot');   // 2.0.3 newcomer protection badge
    { const dl = dockLine(G), r = $('dockrow'); if (r) { r.classList.toggle('hidden', !dl); if (dl !== r._h) { r._h = dl; r.innerHTML = dl; } } }   // 2.1
    if (el) { el.classList.toggle('hidden', !y.newcomer || !!(S && S.arena));   // 2.6: meaningless in the Crucible
 el.classList.toggle('off', !on); el.textContent = on ? '🛡 NEWCOMER PROTECTION' : '🛡 PROTECTION: NOT IN LAWLESS SPACE'; } }
  $('cr').textContent = credits(y.credits) + ' cr'; $('shipnm').textContent = y.shipless ? 'No active ship' : `${st.name} "${y.ship.name}"`;
  $('sysname').textContent = (SYS[G.sys] ? SYS[G.sys].name.toUpperCase() : '') + (SYS[G.sys] ? ' · ' + FACTIONS[SYS[G.sys].faction].short : '') + (() => { const st = stateOfSys(G.sys); return st ? ' · ' + STATES[st.k].icon + ' ' + STATES[st.k].name.toUpperCase() : ''; })();   // 2.4
  const t = G.target ? G.ents.get(G.target) : null;
  if (t) {
    const H = G.A.ships[t.hull];
    if ($('tg-img').dataset.h != t.hull) { $('tg-img').innerHTML = `<img src="assets/${H.img}" alt="">`; $('tg-img').dataset.h = t.hull; }
    $('tg-name').textContent = t.name || H.name; $('tg-sub').textContent = (ROLES_INFO[H.role] ? ROLES_INFO[H.role].icon + ' ' + ROLES_INFO[H.role].short + ' · ' : '') + (t.fl & 16 ? 'Captain · ' : '') + H.name + ' · ' + (FACTIONS[G.FAC[t.fac]] ? FACTIONS[G.FAC[t.fac]].short : '') + (G.hostile(t) ? ' · HOSTILE' : '') + (t.fl & 4 ? ' · DISABLED: B to board' : '') + (() => { const mr = G.A.ships[G.you.ship.hull].role; return BEATS[mr] === H.role ? ' · YOU COUNTER IT' : BEATS[H.role] === mr ? ' · IT COUNTERS YOU' : ''; })();
    $('tg-sh').style.width = t.sh + '%'; $('tg-ar').style.width = t.ar + '%';
    { const od = winOdds(G.you.power || 10, t.pw || 10), col = od >= 0.6 ? '#8ff0ad' : od >= 0.4 ? '#ffd27a' : '#ff8a7a';
      $('tg-dist').innerHTML = (me ? Math.round(Math.hypot(t.rx - me.rx, t.ry - me.ry)) + ' km · ' : '') + `Lv ${levelOf(t.pw || 10)} · <span style="color:${col}">${Math.round(od * 100)}% odds</span>`; }
    $('tg-bars').style.visibility = 'visible';
    { const cap = t.fl & 16 && !G.solo && !(SYS[G.sys] && SYS[G.sys].arena) && t.name && t.name !== G.myName, ally = cap && G.isAlly && G.isAlly(t), k = cap ? t.name + '|' + ally : '';   // 2.6: act on a captain you can see
      const el = $('tg-acts'); if (el._k !== k) { el._k = k; el.classList.toggle('hidden', !cap); el.innerHTML = cap ? `${ally ? '' : `<button class="btn sm" data-tga="invite">INVITE</button><button class="btn sm" data-tga="duel">DUEL</button>`}<button class="btn sm" data-tga="dm">✉</button>${G.social && G.social.friends.some(f => f.name === t.name) ? '' : '<button class="btn sm" data-tga="friend">+ FRIEND</button>'}` : ''; el.dataset.n = cap ? t.name : ''; } }
  } else if ($('tg-img').dataset.h !== '') { $('tg-img').innerHTML = ''; $('tg-img').dataset.h = ''; $('tg-name').textContent = 'No target'; $('tg-sub').textContent = 'Tab: next ship · R: nearest hostile'; $('tg-acts').classList.add('hidden'); $('tg-acts')._k = ''; $('tg-dist').textContent = ''; $('tg-bars').style.visibility = 'hidden'; }
  const fj = Math.floor(((G.view && G.view.fuel) ?? y.fuel ?? 0) / 100), shortFuel = G.route && G.route.length > fj;   // 1.0.3: warn when the route is longer than your fuel
  $('navto').classList.toggle('warnf', !!shortFuel);
  $('navto').textContent = G.route && G.route.length ? `${SYS[G.route[G.route.length - 1]].name} (${G.route.length} jump${G.route.length > 1 ? 's' : ''}, J to jump)${shortFuel ? ` · fuel for ${fj}: refuel on the way` : ''}` : (G.navStellar && STELLARS[G.navStellar] ? STELLARS[G.navStellar].name + ' (L to land)' : 'None (press M)');
  const hasFleet = !!(y.docks && y.docks.list[y.docks.active] && y.docks.list[y.docks.active].wings.some(Boolean)) || (G.order && G.order !== 'gather');   // 1.1: current fleet order
  $('fleetrow').classList.toggle('hidden', !hasFleet); if (hasFleet) $('fleetord').textContent = ({ gather: 'Formation', attack: 'Attacking your target', hold: 'Holding position', holdfire: 'Holding fire', loot: 'Collecting loot' })[G.order || 'gather'];
  const sec = Object.keys(st.weapons).map(w => G.A.weapons[w]).filter(w => w && ['homing', 'rocket', 'bay'].includes(w.type));
  $('secw').textContent = sec.length ? sec.map(w => `${w.name} (${G.ammo[w.id] ?? '?'})`).join(', ') : 'None';
}

// ------------------------------------------------------------------ companion tabs
export function ctab(name) {
  G.ctab = name;
  document.querySelectorAll('#ctabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === name));
  document.querySelectorAll('#cpanel .tab').forEach(t => t.classList.toggle('on', t.id === 't-' + name));
  refreshCompanion();
}
export function refreshCompanion() {
  if (G.ctab === 'codex') renderCodex(); else if (G.ctab === 'station') renderStationTab(); else if (G.ctab === 'ops') { if (G.you) $('opsview').innerHTML = opsHtml(G); } else if (G.ctab === 'log') renderLog(); else if (G.ctab === 'missions') drawMini(); else if (G.ctab === 'captains') renderCaptains();
}
export function drawMini() { if (G.ctab === 'missions' && G.you) { const h = missionsHtml(G); if (h !== G._mhtml) { G._mhtml = h; $('mlist').innerHTML = h; } } }   // 1.0.1: the MISSIONS tab replaced the minimap
// radio (iHeartRadio, as in the Quantum Companion)
function slug(n) { return String(n || '').toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'station'; }
function favs() { try { return JSON.parse(localStorage.getItem('rift.favs') || '[]'); } catch { return []; } }
function setFavs(f) { try { localStorage.setItem('rift.favs', JSON.stringify(f)); } catch {} }
async function radioSearch() {
  const q = $('rq').value.trim(); if (!q) return;
  G.radioTab = 'res'; G.radioRes = []; renderRadio(); $('rlist').innerHTML = '<div class="dim small" style="padding:8px">Scanning...</div>';
  try {
    const d = await (await fetch('/api/radio?q=' + encodeURIComponent(q))).json();
    G.radioRes = ((d.results && d.results.stations) || []).map(s => ({ id: String(s.id), name: s.name, sub: [s.callLetters, s.description].filter(Boolean).join(' · '), img: s.imageUrl || s.logo || '' }));
  } catch { G.radioRes = []; }
  renderRadio();
}
function renderRadio() {
  $('rfav').classList.toggle('on', G.radioTab !== 'res'); $('rres').classList.toggle('on', G.radioTab === 'res');
  const list = G.radioTab === 'res' ? (G.radioRes || []) : favs(), F = favs();
  $('rlist').innerHTML = list.length ? list.map((s, i) => `<div class="it" data-i="${i}"><img src="${esc(s.img)}" alt="" onerror="this.style.visibility='hidden'"><div class="n"><div>${esc(s.name)}</div><div class="s">${esc(s.sub)}</div></div><span class="star" data-star="${i}" style="color:${F.some(f => f.id === s.id) ? '#e6b84a' : '#555'};font-size:15px">★</span></div>`).join('')
    : `<div class="dim small" style="padding:8px">${G.radioTab === 'res' ? 'No stations found.' : 'No favorites yet. Search, then tap the star.'}</div>`;
  $('rlist').querySelectorAll('.it').forEach(el => el.onclick = (e) => {
    const s = list[+el.dataset.i];
    if (e.target.dataset.star !== undefined) { const f = favs(), k = f.findIndex(x => x.id === s.id); if (k >= 0) f.splice(k, 1); else f.push(s); setFavs(f); renderRadio(); return; }
    playStation(s, $('rnow'), slug(s.name));   // 1.0.3: plays in-game (mixer volume, auto-play), with an on-air text panel
  });
}
// codex
let codexCat = 'Ships';
function factionsSelling(h) { return Object.entries(FACTION_HULLS).filter(([f, hs]) => hs.includes(h)).map(([f]) => FACTIONS[f].short); }
function renderCodex() {
  const q = $('cq').value.trim().toLowerCase(), O = allOutfits(G.A);
  const cats = ['Ships', 'Outfits', 'Weapons'];
  $('cchips').innerHTML = cats.map(c => `<span class="chip ${c === codexCat ? 'on' : ''}" data-c="${c}">${c}</span>`).join('');
  $('cchips').querySelectorAll('.chip').forEach(ch => ch.onclick = () => { codexCat = ch.dataset.c; renderCodex(); });
  let items;
  if (codexCat === 'Ships') items = Object.values(G.A.ships).filter(s => !s.npcOnly).filter(s => s.id !== 744 || (G.you && G.you.story && G.you.story.done.includes('qv5'))).sort((a, b) => a.cost - b.cost).map(s => ({ img: 'assets/' + s.img, name: s.name, sub: `${s.sub} · ${s.cat}`, cost: s.kind === 'wingmate' ? 'hire' : credits(s.cost), key: 's' + s.id }));
  else items = Object.values(O).filter(o => codexCat === 'Weapons' ? (o.eff.weapon || o.eff.ammo) : !(o.eff.weapon || o.eff.ammo)).sort((a, b) => a.cost - b.cost)
    .map(o => ({ img: o.icon ? 'assets/' + o.icon : '', name: o.name, sub: Object.entries(o.eff).map(([k, v]) => k === 'weapon' || k === 'ammo' ? (G.A.weapons[v] ? G.A.weapons[v].type : '') : `${k} ${v > 0 ? '+' : ''}${v}`).join(', '), cost: credits(o.cost), key: 'o' + o.id }));
  if (q) items = items.filter(i => (i.name + ' ' + i.sub).toLowerCase().includes(q));
  $('clist').innerHTML = items.map(i => `<div class="it" data-k="${i.key}">${i.img ? `<img src="${i.img}" alt="">` : '<span style="width:40px"></span>'}<div class="n"><div>${esc(i.name)}</div><div class="s">${esc(i.sub)}</div></div><span class="cr small">${i.cost}</span></div>`).join('');
  $('clist').querySelectorAll('.it').forEach(el => el.onclick = () => codexDetail(el.dataset.k));
}
function codexDetail(k) {
  const id = +k.slice(1);
  if (k[0] === 's') {
    const s = G.A.ships[id], where = s.kind === 'specialist' ? `Build at your Personal Station (Ops 3) with 40 blueprints. Loop: ${s.loop}` : s.kind === 'wingmate' ? 'Hire at Quantum Station (Ops 4)' :
      s.faction === 'exotic' ? 'Quantum Station shipyard (Ops 5)' : s.faction === 'umbral' ? 'Not for sale: Umbral only' :
      [735, 736].includes(id) ? 'Quantum Station shipyard' : 'Shipyards of: ' + (factionsSelling(id).join(', ') || 'none');
    $('clist').innerHTML = `<div style="padding:6px"><a href="#" id="cback" style="color:#d88">&lsaquo; back</a><div style="text-align:center"><img src="assets/${s.img}" style="max-width:100%;max-height:150px"></div>
      <b style="color:#fff;font-size:14px">${esc(s.name)}</b> <span class="cr" style="float:right">${s.kind === 'wingmate' ? 'hire' : credits(s.cost) + ' cr'}</span><div class="dim">${esc(s.sub)} · ${roleTag(s)}</div><div class="dim small">${esc((ROLES_INFO[s.role] || {}).desc || '')}</div>
      ${statLines(s)}<div class="sect">WHERE TO GET IT</div><div style="color:#bfe0ff">${esc(where)}</div>
      ${s.pilot ? `<div class="sect">PILOT</div><div style="white-space:pre-wrap;line-height:1.4">${esc(s.pilot)}</div>` : ''}<div class="sect">DESCRIPTION</div><div style="white-space:pre-wrap;line-height:1.4">${esc(s.desc)}</div></div>`;
  } else {
    const o = allOutfits(G.A)[id];
    $('clist').innerHTML = `<div style="padding:6px"><a href="#" id="cback" style="color:#d88">&lsaquo; back</a><div style="text-align:center">${o.icon ? `<img src="assets/${o.icon}">` : ''}</div>
      <b style="color:#fff;font-size:14px">${esc(o.name)}</b> <span class="cr" style="float:right">${credits(o.cost)} cr</span>
      <div class="kv"><span>Mass</span><span>${o.mass || 0} t</span></div><div class="kv"><span>Max</span><span>${o.max || 1}</span></div>${weaponLines(o)}
      <div class="sect">DESCRIPTION</div><div style="white-space:pre-wrap;line-height:1.4">${esc(o.desc)}</div></div>`;
  }
  $('cback').onclick = (e) => { e.preventDefault(); renderCodex(); };
}
const STATMAX = { shield: 4500, armor: 9000, speed: 900, accel: 1200, turn: 90, cargo: 1800, fuel: 4000, space: 320 };
function statLines(s, cmp) {   // 2.4: cmp = the hull you fly, to show the difference
  const fmt = (k, v) => k === 'fuel' ? Math.floor(v / 100) + 'j' : v;
  const delta = (k) => { if (!cmp || cmp === s) return ''; const a = k === 'fuel' ? Math.floor((s[k] || 0) / 100) - Math.floor((cmp[k] || 0) / 100) : Math.round((s[k] || 0) - (cmp[k] || 0)); return a ? `<span class="dlt ${a > 0 ? 'up' : 'dn'}">${a > 0 ? '+' : ''}${a}</span>` : '<span class="dlt">=</span>'; };
  return ['shield', 'armor', 'speed', 'accel', 'turn', 'cargo', 'fuel', 'space'].map(k => `<div class="stat"><span>${k[0].toUpperCase() + k.slice(1)}</span><div class="bar"><i style="width:${Math.min(100, 100 * Math.sqrt((s[k] || 0) / STATMAX[k]))}%"></i>${cmp && cmp !== s ? `<b class="was" style="left:${Math.min(100, 100 * Math.sqrt((cmp[k] || 0) / STATMAX[k]))}%"></b>` : ''}</div><span style="width:44px;text-align:right">${fmt(k, s[k])}</span>${cmp && cmp !== s ? delta(k) : ''}</div>`).join('')
    + (cmp && cmp !== s ? `<div class="dim small">Compared with your ${esc(cmp.name)} (the white tick on each bar).</div>` : '')
    + `<div class="kv"><span>Hardpoints</span><span>${s.guns} guns · ${s.turrets} turrets</span></div><div class="kv"><span>Armament</span><span style="text-align:right">${s.weapons.map(([w, n]) => `${G.A.weapons[w] ? G.A.weapons[w].name : w} ×${n}`).join(', ') || 'none'}</span></div>`;
}
function weaponLines(o) {
  const w = o.eff.weapon ? G.A.weapons[o.eff.weapon] : null; if (!w) return '';
  const p = weaponParams(w);
  return `<div class="kv"><span>Type</span><span>${w.type}</span></div><div class="kv"><span>Damage</span><span>${w.dmgS} shield · ${w.dmgA} armor${p.continuous ? ' per tick' : ''}</span></div><div class="kv"><span>Range</span><span>${Math.round(p.range)}</span></div>`;
}
// station dashboard
function unclaimedList() {
  const free = SITES.filter(s => !(G.sites && G.sites[s.id]));
  return free.length ? `<div class="sect">UNCLAIMED HULLS (${free.length})</div>` + free.map(s => `<div class="kv"><span>${esc(SYS[s.system].name)}</span><span class="dim">${esc(FACTIONS[SYS[s.system].faction].short)} space</span></div>`).join('') : '<p class="dim">Every hull has been claimed.</p>';
}
// the station screen: one button per department, like rooms of the station
const STATION_SECTIONS = [['ops', 'OPS', 0], ['docks', 'DOCKS', 0], ['refinery', 'REFINERY', 1], ['research', 'RESEARCH LAB', 2], ['hangar', 'SHUTTLES', 2],
                          ['defense', 'DEFENSE', 2], ['specialists', 'SPECIALISTS', 0]];   // 2.6: REFITS removed
function stationHtml(interactive) {
  const y = G.you, S = y.station, now = Date.now(), L = G.landed, here = L && L.site;
  if (!S.site) {
    const canClaim = here && !here.owner;
    return `<p>Derelict Concord station hulls drift in systems across the Rift. Land on one and claim it, and it becomes your Personal Station: build it up through five Ops levels for a refinery that works while you fly, a research lab, wingmates and Exotic ships.</p>
      ${S.claimed ? `<p style="color:var(--cr)">Your station progress (Ops ${S.ops}) is kept and moves to the hull you claim.</p>` : ''}
      ${canClaim ? '<button class="btn big" data-act="st" data-op="claim">CLAIM THIS HULL</button>' : '<p class="dim">Fly to an unclaimed hull (shown on your radar in grey-violet) and land on it.</p>'}${unclaimedList()}
      <div class="sect">SPECIALISTS</div>${specialistsHtml(G, false)}`;
  }
  interactive = interactive && here && here.own;
  const where = STELLARS[S.site], sec = G.stab = STATION_SECTIONS.some(([k]) => k === G.stab) ? G.stab : 'ops';
  let h = `<div class="stnav">${STATION_SECTIONS.map(([k, n, ops]) => `<button class="btn sm ${k === sec ? 'on' : ''}" data-act="stab" data-k="${k}" ${S.ops < ops ? 'disabled title="Opens at Ops ' + ops + '"' : ''}>${n}</button>`).join('')}</div>`;
  if (!interactive) h += `<div class="dim small" style="margin:4px 0">Your Personal Station is in ${esc(SYS[where.system].name)}. Land there to manage it.</div>`;
  const cap = REFINERY.silo + (researchBonus(S).silo || 0), per = REFINERY.minutes[S.ops] * 60000;
  switch (sec) {
    case 'ops': {
      const next = OPS[S.ops];
      h += `<div class="kv"><span>Location</span><span>${esc(SYS[where.system].name)}</span></div><div class="ops">${[1, 2, 3, 4, 5].map(k => `<div class="${S.ops >= k ? 'on' : ''}">OPS ${k}</div>`).join('')}</div>`;
      if (next) h += `<div class="kv"><span>Next: Ops ${next.lv}</span><span>${esc(next.title)}</span></div><div class="kv"><span>Cost</span><span>${credits(next.cost)} cr + ${next.mats.map(([m, g, n]) => `<span style="color:${y.mats[m][g] >= n ? '#8ff0ad' : '#ff9a8a'}">${m} ${GRADES[g]}</span>`).join(', ')}</span></div><div class="dim small">Unlocks: ${esc(next.unlock)}</div>`
        + (interactive ? `<button class="btn sm" data-act="st" data-op="upgrade">BUILD OPS ${next.lv}</button>` : '');
      else h += '<div class="kv"><span>Status</span><span style="color:var(--ok)">Fully built</span></div>';
      h += '<div class="sect">AT A GLANCE</div>';
      if (S.ops >= 1) h += `<div class="kv"><span>Refinery</span><span>${S.refUnits} / ${cap} units${S.refUnits >= cap ? ' · <b>full</b>' : ''}</span></div>`;
      if (S.ops >= 2) h += `<div class="kv"><span>Research</span><span>${S.active ? esc(RESEARCH.find(r => r.id === S.active.id).name) + ' · ' + Math.max(0, Math.ceil((S.active.ends - now) / 60000)) + ' min' : 'idle'}${S.queue && S.queue.length ? ` (+${S.queue.length} queued)` : ''}</span></div>`;
      if (y.shuttles.length) h += `<div class="kv"><span>Hangar</span><span>${y.shuttles.filter(x => x.state === 'out').length} of ${y.shuttles.length} shuttles out</span></div>`;
      if (S.ops >= 2) h += `<div class="kv"><span>Defense rating</span><span>${y.defense}</span></div>`;
      if (y.dock.length) h += `<div class="kv"><span>Docks</span><span>${y.docks ? `${y.docks.count} docks · ${y.dock.length} stored ship${y.dock.length === 1 ? '' : 's'}` : y.dock.length + ' stored'}</span></div>`;
      h += materialsHtml(G, false);
      if (interactive && S.site && here && here.own) {   // 2.6: warp the station to another hull
        const free = SITES.filter(s_ => !(G.sites && G.sites[s_.id]) && s_.id !== S.site), cost = relocateCost(S.ops), wait = (S.relocT || 0) + RELOCATE.cooldownH * 3600000 - now;
        h += `<div class="sect">RELOCATE STATION</div><div class="dim small">Warp your Personal Station to any unclaimed hull. Everything comes with it: Ops, research, refinery, docks and stored ships. The old hull is left for someone else to claim. Costs ${credits(cost)} cr + ${RELOCATE.mats.map(([m, g]) => m + ' ' + GRADES[g]).join(', ')}; once every ${RELOCATE.cooldownH} hours.</div>`;
        h += wait > 0 ? `<p class="dim small">Warp core recharging: ${Math.ceil(wait / 3600000)} h.</p>` : free.length ? `<div class="rrow"><select id="relsite">${free.map(s_ => `<option value="${s_.id}">${esc(SYS[s_.system].name)} · ${esc(FACTIONS[SYS[s_.system].faction].short)} space · danger ${SYS[s_.system].danger}</option>`).join('')}</select><button class="btn sm" data-act="relocate">WARP STATION</button></div>` : '<p class="dim small">No unclaimed hulls right now.</p>';
      }
      break;
    }
    case 'refinery': {
      const eta = S.refUnits < cap && per ? Math.max(0, Math.ceil((per - (now - S.refT)) / 60000)) : 0;
      h += `<div class="sect" style="margin-top:4px">REFINERY</div><div class="meter">${Array.from({ length: cap }, (_, i) => `<i class="${i < S.refUnits ? 'on' : ''}"></i>`).join('')}</div>
        <div class="kv"><span>${S.refUnits} of ${cap} units</span><span>${S.refUnits >= cap ? 'Silos full' : `next in ~${eta} min`}</span></div>${interactive && S.refUnits ? '<button class="btn sm" data-act="st" data-op="collect">COLLECT</button>' : ''}`;
      const g = Math.min(4, ORE_PROCESS.grade[S.ops] + (researchBonus(S).processGrade || 0));
      h += `<div class="sect">ORE PROCESSING</div><div class="dim small">${ORE_PROCESS.per} t of mined ore + ${credits(ORE_PROCESS.cost)} cr make one grade ${GRADES[g]} crate. Higher Ops levels refine better grades.</div>`;
      for (const [ore, mat] of Object.entries(ORE_PROCESS.to)) {
        const have = (y.cargo && y.cargo[ore]) || 0, n = Math.floor(have / ORE_PROCESS.per), nm = COMMODITIES.find(c => c.id === ore).name;
        h += `<div class="kv"><span>${esc(nm)} <span class="dim">(${have} t)</span> → ${mat} ${GRADES[g]}</span><span>${interactive && n ? `<button class="btn sm" data-act="st" data-op="process" data-id="${ore}">1 CRATE</button> <button class="btn sm" data-act="st" data-op="process" data-id="${ore}" data-all="1">ALL ${n}</button>` : `<span class="dim">${n ? n + ' ready' : 'need ' + ORE_PROCESS.per + ' t'}</span>`}</span></div>`;
      }
      h += materialsHtml(G, interactive);
      break;
    }
    case 'research': h += researchHtml(G, interactive); break;
    case 'docks': h += docksHtml(G, interactive); break;   // 2.1
    case 'hangar': h += hangarHtml(G, interactive); break;
    case 'defense': h += defenseHtml(G, interactive); break;
    case 'specialists': h += specialistsHtml(G, interactive); break;
  }
  return h;
}
function renderStationTab() { if (!G.you) return; $('stview').innerHTML = stationHtml(true); }
function renderLog() {
  const y = G.you; if (!y) return;
  $('llist').innerHTML = y.log.slice().reverse().map(e => `<div class="logentry"><div class="d">${new Date(e.t).toLocaleString()}</div>${esc(e.text)}</div>`).join('') || '<div class="dim small">Your log is empty.</div>';
}

// ------------------------------------------------------------------ landing screen
const TABS = [['overview', 'OVERVIEW'], ['community', 'COMMUNITY'], ['trade', 'TRADE'], ['yard', 'SHIPYARD'], ['outfit', 'OUTFITTER'], ['jobs', 'JOBS'], ['crew', 'CREW'], ['exchange', 'EXCHANGE'], ['colony', 'COLONY'], ['arena', 'ARENA'], ['station', 'STATION'], ['blackmarket', 'BLACK MARKET'], ['bank', 'BANK']];
export function showLanded() {
  const L = G.landed, p = STELLARS[L.stellar];
  $('land').classList.remove('hidden');
  const site = L.site;
  $('landname').textContent = site ? (site.owner ? `${site.owner}'s Personal Station` : 'Derelict Station Hull') : p.name;
  $('landfac').textContent = `${SYS[p.system].name} system · ${site ? (site.owner ? `Personal Station · Ops ${site.ops}` : 'unclaimed') : FACTIONS[SYS[p.system].faction].name}`;
  $('landdesc').textContent = site ? (site.own ? 'Your Personal Station. Build it up through Ops 1-5: refinery, research lab, drydock, wingmates and the station shipyard.' : site.owner ? `A Personal Station claimed and run by Captain ${site.owner}. Visitors may refuel and trade here.` : p.desc) : (p.desc || '');
  $('landpic').style.backgroundImage = site ? `url(assets/land/${10951 + Math.min(5, site.ops)}.jpg)` : p.land && p.land !== 'earth' ? `url(assets/land/${({ 10957: 'l_inalumen', 10958: 'l_threshold' })[p.land] || p.land}.jpg)` : `url(assets/land/${landScene(p)}.jpg), radial-gradient(circle at 40% 40%, ${p.color}, #000 75%)`;   // 2.5: rendered landing pictures
  const avail = TABS.filter(([k]) => (k === 'blackmarket' && L.blackmarket) || (k === 'bank' && L.bank) || k === 'overview' || (k === 'community' && L.community) || (k === 'trade' && (L.market || L.mats.length)) || (k === 'yard' && L.yard) || (k === 'outfit' && L.outfitter) || (k === 'jobs' && (L.offers.length || L.story || (L.arcs && L.arcs.length) || (G.you && (G.you.missions.length || (G.you.story && G.you.story.active))))) || (k === 'station' && site && (site.own || !site.owner)) || k === 'crew' || (!G.solo && (k === 'arena' || (k === 'exchange' && L.exchange))) ||   // 2.4: multiplayer tabs hidden in solo
       (k === 'colony' && L.colony));
  G.lastTab = G.lastTab || {}; if (G._landedAt !== L.stellar) { G._landedAt = L.stellar; if (G.lastTab[L.stellar] && avail.some(([k]) => k === G.lastTab[L.stellar])) G.ltab = G.lastTab[L.stellar]; }   // 2.0: each world remembers your last tab
  if (!avail.some(([k]) => k === G.ltab)) G.ltab = site && (site.own || !site.owner) ? 'station' : (L.community ? 'community' : 'overview');
  G.lastTab[L.stellar] = G.ltab; G._ltabs = avail.map(([k]) => k);
  $('ltabs').innerHTML = avail.map(([k, n], i) => `<button class="btn sm ${k === G.ltab ? 'on' : ''}" data-lt="${k}" title="${i < 9 ? 'Key ' + (i + 1) : ''}">${n}</button>`).join('');
  $('ltabs').querySelectorAll('button').forEach(b => b.onclick = () => { G.ltab = b.dataset.lt; G.sel = null; showLanded(); });
  renderLanded();
}
export function openStores() { if (!G.you) return; $('storein').innerHTML = storeMenuHtml(G, FACTIONS); $('storebox').classList.remove('hidden'); }
export function refreshStores() { if (!$('storebox').classList.contains('hidden')) $('storein').innerHTML = storeMenuHtml(G, FACTIONS); }
export function hideLanded() { $('land').classList.add('hidden'); }
export function renderLanded() {
  if (!G.landed || !G.you) return;
  const L = G.landed, y = G.you, p = STELLARS[L.stellar], body = $('landbody'), st = y.shipStats;
  $('dockchips').innerHTML = dockChips(G, !!(G.landed && G.landed.site && G.landed.site.own));   // 2.1
  $('landcr').textContent = credits(y.credits) + ' credits'; $('landcargo').textContent = y.shipless ? 'No active ship: choose one to depart' : `Cargo ${y.cargoUsed + (y.jobCargo || 0)}/${st.cargo} t${y.jobCargo ? ` (${y.jobCargo} t for jobs)` : ''} · Outfit space ${st.free} t free`;
  $('depart').disabled = !!y.shipless; $('depart').title = y.shipless ? 'Choose a ship first: a lead ship for your active dock (STATION, then DOCKS), or buy one at a shipyard' : '';
  let h = '';
  switch (G.ltab) {
    case 'overview': {
      const fac = SYS[p.system].faction;
      h += stateCard(p.system);   // 2.4
      h += barCard(L);   // 2.4: the contact at the bar, and what this world trades in
      if (L.news && L.news.length) h += `<div class="newsbox"><div class="sect" style="margin-top:0">SPACEPORT NEWS</div>${L.news.slice(0, 4).map(n => `<div class="newsit">${esc(n)}</div>`).join('')}</div>`;   // 1.1
      if (y.shipless) h += `<div class="noship"><b>NO ACTIVE SHIP</b><div>You can't depart until you choose a ship. ${y.dock && y.dock.length ? 'Open STATION, then DOCKS, and choose a lead ship for your active dock.' : 'Buy one at a SHIPYARD.'}</div><div>${y.dock && y.dock.length ? '<button class="btn sm" data-act="gotodock">OPEN DRYDOCK</button> ' : ''}${L.yard ? '<button class="btn sm" data-act="ltab" data-t="yard">SHIPYARD</button>' : ''}</div></div>`;
      if (!y.shipless) h += `<div class="detail"><img src="assets/${G.A.ships[y.ship.hull].img}"><div><div class="sect" style="margin-top:0">YOUR SHIP</div><b style="font-size:15px;color:#fff">${esc(st.name)}</b> <span class="dim">"${esc(y.ship.name)}"</span> ${roleTag(G.A.ships[y.ship.hull])}
        <div class="kv"><span>Shield / Armor</span><span>${st.shield} / ${st.armor}</span></div><div class="kv"><span>Speed</span><span>${Math.round(st.maxSpeed)}</span></div><div class="kv"><span>Fuel</span><span>${Math.floor(st.fuel / 100)} jumps (refuelled)</span></div>
        <div class="kv"><span>Cargo</span><span>${Object.entries(y.cargo).map(([c, n]) => `${n}t ${COMMODITIES.find(x => x.id === c).name}`).join(', ') || 'empty'}</span></div>
        ${masteryHtml(G)}${synBadge(y)}<div class="sect">STANDING</div>${Object.entries(FACTIONS).filter(([, F]) => !F.hidden && !F.region).map(([f, F]) => `<span class="small" style="display:inline-block;width:49%"><span style="color:${F.color}">${F.short}</span> <span class="dim">${repLabel(y.rep[f] || 0)} (${y.rep[f] || 0})</span></span>`).join('')}
        <div class="sect">RENAME SHIP</div><div class="rrow"><input id="rename" value="${esc(y.ship.name)}" maxlength="28"><button class="btn sm" data-act="rename">RENAME</button></div></div></div>`;
      break;
    }
    case 'trade': {
      if (L.market) h += `<table class="tbl"><tr><th>COMMODITY</th><th>PRICE</th><th>HOLD</th><th></th></tr>${L.market.map(c => { const base = COMMODITIES.find(x => x.id === c.id).base; return `<tr><td>${esc(c.name)}${c.flash ? ` <span class="flashtag ${c.price > base ? 'up' : 'dn'}">${c.price > base ? 'SHORTAGE' : 'GLUT'}</span>` : ''}</td><td class="${c.price < base * 0.9 ? 'lo' : c.price > base * 1.1 ? 'hi' : ''}">${credits(c.price)}${c.moved ? `<span class="mv ${c.moved > 0 ? 'up' : 'dn'}" title="Moved by this system's state and by what captains have traded here">${c.moved > 0 ? '▲' : '▼'}${Math.abs(c.moved)}%</span>` : ''}</td><td>${y.cargo[c.id] || 0}${y.cargo[c.id] && y.paid && y.paid[c.id] ? ` <span class="small ${c.price >= y.paid[c.id] ? 'pgain' : 'ploss'}" title="What you paid per ton, on average">paid ${credits(y.paid[c.id])}</span>` : ''}</td>
        <td style="text-align:right"><button class="btn sm" data-act="trade" data-c="${c.id}" data-q="1"${holdFree(y) > 0 ? '' : ' disabled title="Hold full"'}>BUY</button> <button class="btn sm" data-act="trade" data-c="${c.id}" data-q="10"${holdFree(y) > 0 ? '' : ' disabled title="Hold full"'}>+10</button> <button class="btn sm" data-act="trade" data-c="${c.id}" data-q="${Math.max(0, Math.min(holdFree(y), Math.floor(y.credits / c.price)))}" title="Fill your hold with what you can afford"${Math.min(holdFree(y), Math.floor(y.credits / c.price)) > 0 ? '' : ' disabled'}>MAX</button> <button class="btn sm" data-act="trade" data-c="${c.id}" data-q="-1">SELL</button> <button class="btn sm" data-act="trade" data-c="${c.id}" data-q="-999">ALL</button></td></tr>`; }).join('')}</table><div class="tradefoot"><span class="dim small">Green prices are cheap here, red are high. Prices drift through the day. Hold: ${y.cargoUsed + (y.jobCargo || 0)} / ${st.cargo} t${y.jobCargo ? ` (${y.jobCargo} t is job cargo)` : ''}.</span>${L.market.some(c => y.cargo[c.id]) ? `<button class="btn sm" data-act="sellall">SELL ALL CARGO</button>` : ''}</div>`;
      if (L.mats.length) h += `<div class="sect">STATION MATERIALS</div><table class="tbl"><tr><th>CRATE</th><th>PRICE</th><th>HELD</th><th></th></tr>${L.mats.map(m => `<tr><td>${m.mat} ${GRADES[m.grade]}</td><td>${credits(m.price)}</td><td>${y.mats[m.mat][m.grade]}</td><td style="text-align:right"><button class="btn sm" data-act="mat" data-m="${m.mat}" data-g="${m.grade}" data-q="1">BUY</button> <button class="btn sm" data-act="mat" data-m="${m.mat}" data-g="${m.grade}" data-q="-1">SELL</button></td></tr>`).join('')}</table>`;
      break;
    }
    case 'yard': {
      const sel = G.sel && L.yard.includes(G.sel) ? G.sel : L.yard[0];
      const s = G.A.ships[sel], trade = tradeIn(y);
      h = `<div class="detail"><img src="assets/${s.img}"><div><b style="font-size:16px;color:#fff">${esc(s.name)}</b> <span class="dim">${esc(s.sub)}</span> ${roleTag(s)}${s.cargo ? "" : " <span class=\"nocargo\">NO CARGO HOLD</span>"}${statLines(s, y.shipless ? null : G.A.ships[y.ship.hull])}
        <div class="kv"><span>Price</span><span class="cr">${credits(s.cost)}</span></div>${WING_ONLY.includes(s.id) || (!y.shipless && s.id === y.ship.hull) || y.shipless ? '' : `<div class="kv"><span>Trade-in of your ${esc(st.name)}</span><span>-${credits(trade)}</span></div>
        <div class="kv"><span>You pay to fly her</span><span class="cr">${credits(Math.max(0, s.cost - trade))}</span></div>`}${(() => { const D = y.docks, room = D && D.cap > D.stored.length, wo = WING_ONLY.includes(s.id);   // 2.1: buy to fly, or buy into your hangar
          const toH = y.station && y.station.site ? `<button class="btn" data-act="buyhangar" data-h="${s.id}"${room ? '' : ' disabled title="Your hangar is full"'}>BUY TO HANGAR${D ? ` (${D.stored.length}/${D.cap})` : ''}</button>` : '';
          if (wo) return `<p class="dim small">Flies only as a wingmate: it goes to your hangar, then assign it to a dock.</p>${toH}`;
          return (!y.shipless && s.id === y.ship.hull ? '<p class="dim">You fly this ship.</p>' : `<button class="btn" data-act="buyship" data-h="${s.id}">BUY AND FLY</button>`) + ' ' + toH; })()}
        <p style="white-space:pre-wrap;line-height:1.4;color:#ccc">${esc(s.desc)}</p></div></div><div class="ysort small">Sort by <select id="ysort">${[["cost", "price"], ["cargo", "cargo"], ["speed", "speed"], ["strength", "fighting strength"], ["shield", "shields"]].map(([k, n]) => `<option value="${k}"${(G.ysort || "cost") === k ? " selected" : ""}>${n}</option>`).join("")}</select></div><div class="cards">${yardSorted(L.yard).map(h_ => { const x = G.A.ships[h_]; return `<div class="card ${h_ === sel ? 'sel' : ''}" data-act="sel" data-h="${h_}"><img src="assets/${x.img}"><div class="t">${esc(x.name)}</div><div class="dim small">${esc(x.sub)}</div><div class="small">${roleTag(x)}${x.cargo ? "" : " <span class=\"nocargo\">NO CARGO HOLD</span>"}</div><div class="p">${credits(x.cost)}</div></div>`; }).join('')}</div>`;
      break;
    }
    case 'outfit': {
      const O = allOutfits(G.A);
      const cat = G.ocat || 'all', cats = [['all', 'ALL'], ['weapons', 'WEAPONS'], ['ammo', 'AMMO'], ['defense', 'DEFENSE'], ['engines', 'ENGINES'], ['utility', 'UTILITY']];   // 2.4: outfitter categories
      const fits = (o) => { if (o.eff.ammo) return !!(st.weapons && st.weapons[o.eff.ammo]) || Object.keys(y.ship.outfits).some(k => O[k] && O[k].eff.weapon === o.eff.ammo); if ((o.mass || 0) > st.free) return false; if (o.eff.weapon) return o.turret ? st.turrets < st.maxTurrets : st.guns < st.maxGuns; return true; };   // 2.5.2
      const list = L.outfitter.filter(id => (cat === 'all' || outfitCat(O[id]) === cat) && (!G.ofit || fits(O[id])));
      h = `<div class="ocats"><label class="small ofit"><input type="checkbox" id="ofit"${G.ofit ? ' checked' : ''}> only what fits</label>${cats.filter(([k]) => k === 'all' || L.outfitter.some(id => outfitCat(O[id]) === k)).map(([k, n]) => `<button class="btn sm${k === cat ? ' on' : ''}" data-act="ocat" data-k="${k}">${n}</button>`).join('')}</div><p class="dim small">Outfit space ${st.free} t free · guns ${st.guns}/${st.maxGuns} · turrets ${st.turrets}/${st.maxTurrets}</p><table class="tbl"><tr><th></th><th>OUTFIT</th><th>EFFECT</th><th>MASS</th><th>PRICE</th><th>OWNED</th><th></th></tr>${list.map(id => {
        const o = O[id], own = o.eff.ammo ? (G.ammo[o.eff.ammo] ?? (y.ship.ammo[o.eff.ammo] ?? 0)) : (y.ship.outfits[id] || 0);
        const W = o.eff.weapon && G.A.weapons[o.eff.weapon], wp = W ? weaponParams(W) : null;   // 1.0.3: guns show damage and range; ammo says if you have a launcher
        const hasLauncher = o.eff.ammo && ((st.weapons && st.weapons[o.eff.ammo]) || Object.keys(y.ship.outfits).some(k => O[k] && O[k].eff.weapon === o.eff.ammo));   // 2.0.3: fixed launchers count too
        const eff = W ? `${W.type}${o.turret ? ' turret' : ''} · ${Math.round((W.dmgA || 0) + (W.dmgS || 0))} dmg · ${Math.round(wp.range)} range` : o.eff.ammo ? (hasLauncher ? 'ammunition' : 'ammunition · needs its launcher') : Object.entries(o.eff).map(([k, v]) => `${k} ${v > 0 ? '+' : ''}${v}`).join(', ');
        const n1 = o.eff.ammo ? 10 : 1, why = o.eff.ammo && !hasLauncher ? 'You have nothing that fires this' : y.credits < o.cost * n1 ? 'Not enough credits' : !o.eff.ammo && (o.mass || 0) > st.free ? 'Not enough outfit space' : W && (o.turret ? st.turrets >= st.maxTurrets : st.guns >= st.maxGuns) ? `No free ${o.turret ? 'turret' : 'gun'} mounts` : '';
        return `<tr><td>${o.icon ? `<img src="assets/${o.icon}" style="width:32px;height:32px">` : ''}</td><td title="${esc(o.desc)}">${esc(o.name)}</td><td class="dim small">${esc(eff)}</td><td>${o.mass || 0}</td><td class="cr">${credits(o.cost)}</td><td>${own}</td>
          <td style="text-align:right"><button class="btn sm" data-act="outfit" data-id="${id}" data-n="${n1}"${why ? ` disabled title="${why}"` : ''}>BUY${o.eff.ammo ? ' 10' : ''}</button>${o.eff.ammo ? '' : ` <button class="btn sm" data-act="outfit" data-id="${id}" data-n="-1"${own ? '' : ' disabled'}>SELL</button>`}</td></tr>`; }).join('')}</table>`;
      const owned = Object.entries(y.ship.outfits).filter(([id]) => !L.outfitter.includes(+id));
      if (owned.length) h += `<div class="sect">FITTED ELSEWHERE</div>${owned.map(([id, n]) => `<div class="kv"><span>${esc(O[id].name)} ×${n}</span><span><button class="btn sm" data-act="outfit" data-id="${id}" data-n="-1">SELL</button></span></div>`).join('')}`;
      break;
    }
    case 'jobs': {
      const SO = L.story, SA = y.story && y.story.active; h = '';
      if (SO) h += `<div class="card story" style="cursor:default"><div class="storytag">MAIN STORY</div><div class="t">${esc(SO.title)}</div><div>${esc(SO.brief)}</div>${SO.locked ? `<div class="dim small">${esc(SO.locked)}</div>` : `<div><button class="btn sm" data-act="storyopen">READ</button></div>`}</div>`;
      h += arcCardsHtml(G);   // 1.2 faction arcs
      if (SA) h += `<div class="card story" style="cursor:default"><div class="storytag">MAIN STORY · IN PROGRESS</div><div class="t">${esc(SA.title)}</div><div>${esc(SA.brief)}</div>${SA.ready ? '<div style="color:var(--ok)">Done: return to collect.</div>' : SA.got ? `<div class="dim small">${SA.got} so far</div>` : ''}</div>`;
      h += `<div class="sect" style="margin-top:0">JOBS ON OFFER</div>` + (L.offers.length ? L.offers.map(o => { if (o.type === 'quest') return questCard(o); const j = jobInfo(o, y); return `<div class="card" style="cursor:default"><div class="t">${esc(o.title)}</div><div>${esc(o.text)}</div><div class="p">Pays ${credits(o.reward)} credits <span class="dim small">· ${j.where}</span></div>${j.warn ? `<div class="jwarn">${j.warn}</div>` : ''}${j.note ? `<div class="jwarn" style="color:#ffb070">⚠ ${esc(j.note)}</div>` : ''}<div><button class="btn sm" data-act="accept" data-id="${o.id}"${j.warn ? ' disabled' : ''}>ACCEPT</button>${o.sys && o.sys !== G.sys ? ` <button class="btn sm" data-plot="${o.sys}">PLOT</button>` : ''}</div></div>`; }).join('') : '<p class="dim">No jobs on offer here right now. New ones are posted every ten minutes.</p>');
      h += `<div class="sect">YOUR JOBS (${y.missions.length}/6)</div>` + (y.missions.length ? y.missions.map(m => `<div class="kv"><span>${m.quest ? `<span class="qtag">${esc(m.quest.name)} ${m.quest.step + 1}/${m.quest.of}</span> ` : ''}${esc(m.title)}${m.type === 'patrol' ? ` (${m.got}/${m.need})` : ''}${m.done ? ' <b style="color:var(--ok)">done: land to collect</b>' : ''}</span><span>${credits(m.reward)} <button class="btn sm" data-act="abandon" data-id="${m.id}">ABANDON</button></span></div>`).join('') : '<p class="dim">None.</p>');
      break;
    }
    case 'station': h = stationHtml(true); break;
    case 'crew': h = crewHtml(G); break;
    case 'blackmarket': h = blackMarketHtml(G); break;   // 1.2
    case 'bank': h = bankHtml(G); break;
    case 'colony': h = colonyHtml(G); break;
    case 'exchange': h = exchangeHtml(G); break;
    case 'arena': h = arenaHtml(G); break;
    case 'community': {
      if (!G.boards || !G.boards[G.boardCat || 'earned']) { G.boards = G.boards || {}; G.boards[G.boardCat || 'earned'] = null; send({ t: 'boards', cat: G.boardCat || 'earned' }); }
      const C = L.community;
      h = `<div class="detail" style="grid-template-columns:1fr 1fr"><div>${G.solo ? '' : `<div class="sect" style="margin-top:0">CAPTAINS ONLINE (${C.online.length})</div>`}${G.solo ? '' : C.online.map(o => `<div class="kv"><span>${esc(o.name)}${o.name !== G.myName ? ` <button class="btn sm" data-act="ainvite" data-n="${esc(o.name)}">INVITE</button>` : ''}${o.name !== G.myName && !(G.social && G.social.friends.some(f => f.name === o.name)) ? ` <button class="btn sm" data-act="addfriend" data-n="${esc(o.name)}">+ FRIEND</button>` : ''}</span><span>${esc(o.sys)}</span></div>`).join('')}
        ${G.solo ? '' : `<div class="sect">DOCKED HERE</div><div>${C.docked.map(n => `<span class="pill on">${esc(n)}</span>`).join('') || '<span class="dim">Nobody else right now.</span>'}</div>`}
        <div class="sect"${G.solo ? ' style="margin-top:0"' : ''}>STATION REGISTRY</div>${C.stations.map(s_ => `<div class="kv"><span>${esc(s_.system)}</span><span>${s_.owner ? `${esc(s_.owner)} · Ops ${s_.ops}` : '<span class="dim">unclaimed hull</span>'}</span></div>`).join('')}</div>
        <div><div class="sect" style="margin-top:0">TOP CAPTAINS (credits earned)</div><table class="tbl"><tr><th>#</th><th>CAPTAIN</th><th>SHIP</th><th>EARNED</th><th>KILLS</th></tr>${C.top.map((t, i) => `<tr><td>${i + 1}</td><td>${esc(t.name)}${t.ai ? ' <span class="aitag">captain</span>' : ''}</td><td class="dim">${esc(t.ship)}</td><td class="cr">${credits(t.earned)}</td><td>${t.kills}</td></tr>`).join('')}</table>
        ${boardsHtml(G)}<p class="dim">Quantum Station is the Rift's meeting place. Claim one of the derelict station hulls listed in the registry to build your Personal Station.</p></div></div>`;
      break;
    }
  }
  body.innerHTML = h;
}
// 2.4: a system's state as a line of text, and as a card
export function stateOfSys(sys) { const st = G.world && G.world.states && G.world.states[sys]; return st && st.until > Date.now() && STATES[st.k] ? st : null; }
function stateLine(sys) { const st = stateOfSys(sys); if (!st) return ''; const X = STATES[st.k]; return `<span style="color:${X.color}">${X.icon} ${X.name}${st.k === 'war' && st.enemy ? ` with the ${esc(FACTIONS[st.enemy].short)}` : ''}</span>${st.need ? ` <span class="dim">(${st.got}/${st.need})</span>` : ''}`; }
function stateCard(sys) {
  const st = stateOfSys(sys); if (!st) return ''; const X = STATES[st.k], left = Math.max(1, Math.round((st.until - Date.now()) / 60000));
  const prices = Object.entries(X.prices).map(([c, m]) => `${COMMODITIES.find(x => x.id === c).name} ${m >= 1 ? '▲' : '▼'}${Math.round(Math.abs(m - 1) * 100)}%`).join(' · ');
  const goal = X.need ? (X.need.cid ? `Sell ${X.need.qty} t of ${X.need.cid} at markets here (or deliver supply jobs) to end it.` : `Destroy ${X.need.qty} ${X.need.kills === 'pirate' ? 'raiders' : esc(FACTIONS[st.enemy].name) + ' ships'} here to end it.`) : '';
  return `<div class="statecard" style="border-color:${X.color}"><div><b style="color:${X.color}">${X.icon} ${X.name.toUpperCase()}</b> <span class="dim small">· about ${left} min left</span></div><div class="small">${esc(X.desc)}</div><div class="small dim">${prices}</div>${goal ? `<div class="small">${goal}${st.need ? ` <b>${st.got} / ${st.need}</b>` : ''}</div><div class="sbar"><i style="width:${Math.round(100 * st.got / Math.max(1, st.need))}%;background:${X.color}"></i></div>` : ''}</div>`;
}
// 1.0.3: how far a job is and whether its cargo fits your hold
function holdFree(y) { const mc = (y.missions || []).filter(m => m.type === 'cargo' || m.type === 'smuggle').reduce((a, m) => a + (m.qty || 0), 0); return y.shipStats.cargo - y.cargoUsed - mc; }
// 2.4: the bar contact's greeting and rumour, and the world's trade specialties
function barCard(L) {
  let h = '';
  if (L.contact) { const B = L.contact, story = (L.offers || []).find(o => o.type === 'quest');
    h += `<div class="barcard"><div class="sect" style="margin-top:0">AT THE BAR</div><div><b>${esc(B.name)}</b> <span class="dim">· ${esc(B.title)} · ${esc(B.standing)}</span></div><div class="qintro">${esc(B.hello)}</div><div class="rumor">${esc(B.rumor)}</div>${story ? `<div class="small" style="margin-top:4px">Has a story for you: <b style="color:#ffe2a0">${esc(story.title)}</b> <button class="btn sm" data-act="ltab" data-t="jobs">SEE JOBS</button></div>` : ''}</div>`; }
  if (L.market && L.market.length) {
    const r = L.market.map(c => ({ c, k: c.price / COMMODITIES.find(x => x.id === c.id).base })).sort((a, b) => a.k - b.k);
    const cheap = r.filter(x => x.k < 0.9).slice(0, 2), dear = r.filter(x => x.k > 1.12).slice(-2).reverse();
    if (cheap.length || dear.length) h += `<div class="small spec">${cheap.length ? `<span>Exports: <b style="color:var(--ok)">${cheap.map(x => esc(x.c.name)).join(', ')}</b> (cheap here)</span>` : ''}${cheap.length && dear.length ? ' · ' : ''}${dear.length ? `<span>Wants: <b style="color:#ffb070">${dear.map(x => esc(x.c.name)).join(', ')}</b> (pays well)</span>` : ''}</div>`;
  }
  return h;
}
// 2.5.2: warn when a story will ask for more hold space or bunks than the ship you fly
function questNeeds(o) {
  const y = G.you, N = o.needs; if (!N || y.shipless) return ''; const w = [];
  if (N.hold && (y.shipStats.cargo || 0) < N.hold) w.push(`one step needs ${N.hold} t of hold space and your ship has ${y.shipStats.cargo || 0} t`);
  if (N.pax && bunkInfo(G, { type: 'passenger', pax: N.pax })) w.push(`one step carries ${N.pax} passenger${N.pax > 1 ? 's' : ''}`);
  return w.length ? `<div class="jwarn" style="color:#ffb070">⚠ ${esc(w.join('; '))}. You can take it on and switch ships for that step.</div>` : '';
}
// 2.4: a contact's story or a side story on the job board
function questCard(o) {
  const n = o.sys === G.sys ? 0 : (route(SYS, G.sys, o.sys) || []).length;
  return `<div class="card story quest" style="cursor:default"><div class="storytag">${o.side ? 'SIDE STORY' : 'CONTACT'} · ${esc(o.giver)}${o.standing ? ` · <span class="dim">${esc(o.standing)}</span>` : ''}</div><div class="t">${esc(o.title)}</div><div class="qintro">${esc(o.text)}</div>
    <div class="p">${o.steps} steps, starting in ${SYS[o.sys] ? esc(SYS[o.sys].name) : 'nearby'}${n ? ` (${n} jump${n > 1 ? 's' : ''})` : ''} · each step pays, and finishing earns <span class="cr">${esc(o.rewardText)}</span></div>
    ${o.full ? '<div class="jwarn">You are already following three stories.</div>' : ''}${questNeeds(o)}<div><button class="btn sm" data-act="accept" data-id="${esc(o.id)}"${o.full ? ' disabled' : ''}>TAKE IT ON</button>${o.sys && o.sys !== G.sys ? ` <button class="btn sm" data-plot="${o.sys}">PLOT</button>` : ''}</div></div>`;
}
function yardSorted(list) { const k = G.ysort || 'cost', A = G.A.ships; return list.slice().sort((a, b) => k === 'cost' ? (A[a].cost || 0) - (A[b].cost || 0) : ((A[b][k] || 0) - (A[a][k] || 0))); }   // 2.5.2
function outfitCat(o) {
  if (!o) return 'utility'; const e = o.eff || {};
  if (e.weapon) return 'weapons'; if (e.ammo) return 'ammo';
  if (['shield', 'armor', 'shieldRe', 'armorRe', 'shieldPct', 'armorPct', 'pd'].some(k => k in e)) return 'defense';
  if (['speed', 'accel', 'turn', 'afterburner', 'fuel', 'fuelRe', 'jump', 'multiJump', 'jumpFast', 'jumpSpeed'].some(k => k in e)) return 'engines';
  return 'utility';
}
function jobInfo(o, y) {
  const n = o.sys === G.sys ? 0 : (route(SYS, G.sys, o.sys) || []).length;
  const where = `${SYS[o.sys] ? SYS[o.sys].name : ''}${n ? ` · ${n} jump${n > 1 ? 's' : ''}` : ' · this system'}`;
  let warn = bunkInfo(G, o), note = '';
  if (o.type === 'warband') { const A_ = y.armada, on = A_ && A_.members ? A_.members.filter(m => m.online).length : 0; if (on < 2) warn = 'Needs an Armada with at least 2 captains online (ALLIES tab).'; else note = `Taken for all ${on} captains online in your Armada; each gets an equal share.`; }   // 2.6
  if ((o.type === 'bounty' || o.type === 'assassinate') && o.hull && G.A.ships[o.hull] && !y.shipless) {   // 2.0.3: how the target compares with your ship
    const r = (G.A.ships[o.hull].strength || 10) / Math.max(1, G.A.ships[y.ship.hull].strength || 10);
    if (r > 1.6) note = `Target: ${G.A.ships[o.hull].name}, ${r > 4 ? 'far stronger than' : 'stronger than'} your ${G.A.ships[y.ship.hull].name}.`;
  }
  if (!note && !y.shipless && y.shipStats && n > Math.floor(y.shipStats.fuel / 100)) note = `${n} jumps away, but your tanks hold ${Math.floor(y.shipStats.fuel / 100)}. Plan a stop to land and refuel on the way.`;   // 2.4
  if (!note && o.type === 'supply' && !y.shipless && o.qty > (y.shipStats.cargo || 0)) note = `You buy and carry the ${o.qty} t yourself, and your hold takes ${y.shipStats.cargo || 0} t.`;   // 2.5.2
  if (!warn && (o.type === 'cargo' || o.type === 'smuggle') && o.qty > holdFree(y)) warn = `Needs ${o.qty} t of hold space; you have ${Math.max(0, holdFree(y))} t free.`;
  return { where, warn, note };
}
function tradeIn(y) { if (y.shipless) return 0; const O = allOutfits(G.A); let v = (G.A.ships[y.ship.hull].cost || 0) * 0.5; for (const [id, n] of Object.entries(y.ship.outfits)) v += (O[id] ? O[id].cost : 0) * n * 0.5; return Math.round(v); }
function onAct(e) {
  const el = e.target.closest('[data-act]'); if (!el) return; if (el.tagName === 'A') e.preventDefault();
  if (el.tagName === 'SELECT') return;
  const d = el.dataset;
  switch (d.act) {
    case 'trade': send({ t: 'trade', cid: d.c, qty: +d.q }); break;
    case 'addfriend': send({ t: 'social', op: 'add', name: d.n }); break;   // 2.6
    case 'relocate': { const sel = document.getElementById('relsite'); if (!sel) break; const id = sel.value; ask(`Warp your Personal Station to ${sel.selectedOptions[0].textContent.split(' · ')[0]}? It costs ${credits(relocateCost(G.you.station.ops))} credits and an alloy II crate, and the warp core then needs ${RELOCATE.cooldownH} hours to recharge.`, () => send({ t: 'station', op: 'relocate', site: id })); break; }
    case 'ainvite': send({ t: 'armada', op: 'invite', name: d.n }); break;
    case 'sellall': for (const c of G.landed.market || []) if (G.you.cargo[c.id]) send({ t: 'trade', cid: c.id, qty: -999 }); break;
    case 'mat': send({ t: 'buymat', mat: d.m, grade: +d.g, n: +d.q }); break;
    case 'sel': G.sel = +d.h; renderLanded(); break;
    case 'buyhangar': ask(`Buy the ${G.A.ships[d.h].name} for ${credits(G.A.ships[d.h].cost)} credits and send her to your Personal Station's hangar?`, () => send({ t: 'buyship', hull: +d.h, store: true })); break;
    case 'buyship': ask(`Buy the ${G.A.ships[d.h].name}?\n\n${G.you.shipless ? 'You have no active ship to trade in.' : `Your ${G.A.ships[G.you.ship.hull].name} and its outfits are traded in for ${credits(tradeIn(G.you))} credits. To keep her instead, store her in your Personal Station's drydock first.`}`, () => send({ t: 'buyship', hull: +d.h })); break;
    case 'outfit': send({ t: 'outfit', id: +d.id, n: +d.n }); break;
    case 'accept': send({ t: 'accept', id: d.id }); break;
    case 'abandon': { const mm = (G.you.missions || []).find(x => x.id === d.id); ask(mm && mm.quest ? `Abandon this step? That ends the story "${mm.quest.name}".` : 'Abandon this job? You will not be paid for it.', () => send({ t: 'abandon', id: d.id })); break; }
    case 'st': e.preventDefault(); send({ t: 'station', op: d.op, id: d.id, hull: d.hull ? +d.hull : undefined, i: d.i ? +d.i : undefined, all: d.all ? 1 : undefined, mat: d.mat, g: d.g ? +d.g : undefined, n: d.n ? +d.n : undefined }); break;
    case 'rename': send({ t: 'rename', name: $('rename').value }); break;
    case 'off': send({ t: 'officer', op: d.op, id: d.id, oid: d.oid ? (isNaN(+d.oid) ? d.oid : +d.oid) : undefined, slot: d.slot }); break;
    case 'bm': send({ t: 'bm', id: d.id }); break;                                   // 1.2
    case 'promote': send({ t: 'promote', id: isNaN(+d.id) ? d.id : +d.id }); break;
    case 'lower': { const sel = document.querySelector(`[data-lowersel="${d.i}"]`); send({ t: 'lower', op: d.op, i: +d.i, kind: sel ? sel.value : undefined }); break; }
    case 'bank': { const v = +((document.getElementById('bankamt') || {}).value || 0); send({ t: 'bank', op: d.op === 'payall' ? 'pay' : d.op, amt: d.op === 'payall' ? 1e12 : v }); break; }
    case 'arcopen': { const o = (G.landed.arcs || []).find(x => x.fac === d.f); if (o) window.dispatchEvent(new CustomEvent('rift-story', { detail: { arc: o.fac, id: o.fac, title: o.title, tag: `${FACTIONS[o.fac].name.toUpperCase()} · ${o.arc}`, text: o.text, acc: 'Accept', ref: 'Not now' } })); break; }
    case 'sh': { const m = { t: 'shuttle', op: d.op, sid: d.sid ? +d.sid : undefined, kind: d.kind, job: d.job };
      if (d.op === 'send') { const sel = document.querySelector(`select[data-job="${d.job}"]`); m.sid = sel ? +sel.value : undefined; }
      if (d.op === 'scrap') { ask('Scrap this shuttle for 30% of its price?', () => send(m)); break; } send(m); break; }
    case 'dock': if (d.op === 'sell') { const x = d.uid ? G.you.dock.find(z => z.ship.uid === d.uid) : G.you.dock[+d.i], O = allOutfits(G.A); let v = (G.A.ships[x.ship.hull].cost || 0) * 0.5; for (const [id, n] of Object.entries(x.ship.outfits || {})) v += (O[id] ? O[id].cost : 0) * n * 0.5; ask(`Sell the stored ${G.A.ships[x.ship.hull].name} and its outfits for ${credits(Math.round(v))} credits?`, () => send({ t: 'dock', op: d.op, i: +d.i, uid: d.uid || undefined })); break; } send({ t: 'dock', op: d.op, i: +d.i, uid: d.uid || undefined }); break;
    case 'goal': send({ t: 'goal', period: d.p, i: +d.i }); break;
    case 'plotto': plot(d.sys); break;
    case 'buystore': send({ t: 'store', id: d.id, fac: d.f }); break;
    case 'stores': openStores(); break;
    case 'storyopen': { const SO = G.landed.story; if (SO) window.dispatchEvent(new CustomEvent('rift-story', { detail: { id: SO.id, title: SO.title, text: SO.text, acc: SO.acc } })); break; }
    case 'holdout': ask('Start a Holdout? You launch to defend your station against ten waves.', () => send({ t: 'holdout' })); break;
    case 'sfac': G.storeFac = d.f; openStores(); break;
    case 'sclose': $('storebox').classList.add('hidden'); break;
    case 'col': { const go = () => send({ t: 'colony', op: d.op, kind: d.kind, i: d.i !== undefined ? +d.i : undefined }); if (d.op === 'abandon') ask('Abandon this colony and everything on it?', go); else go(); } break;
    case 'arena': send({ t: 'arena', op: d.op, mode: d.mode }); break;
    case 'xplace': { const [k, a, b] = $('xitem').value.split(':'); send({ t: 'exchange', op: 'place', side: $('xside').value, kind: k, mat: k === 'mat' ? a : undefined, grade: k === 'mat' ? +b : undefined, cid: k === 'com' ? a : undefined, qty: +$('xqty').value, price: +$('xprice').value }); break; }
    case 'xcancel': send({ t: 'exchange', op: 'cancel', id: +d.id }); break;
    case 'xcollect': send({ t: 'exchange', op: 'collect' }); break;
    case 'xsend': ask(`Send ${$('xamt').value} credits to ${$('xto').value}?`, () => send({ t: 'exchange', op: 'transfer', to: $('xto').value, n: +$('xamt').value })); break;
    case 'board': G.boardCat = d.cat; send({ t: 'boards', cat: d.cat }); renderLanded(); break;
    case 'prof': send({ t: 'profile', name: d.n }); break;
    case 'profgo': send({ t: 'profile', name: $('profq').value }); break;
    case 'stab': G.stab = d.k; renderLanded(); renderStationTab(); break;
    case 'gotodock': G.ltab = 'station'; G.stab = 'docks'; showLanded(); break;
    case 'dockgo': send({ t: 'docks', op: 'activate', k: +d.k }); break;   // 2.1
    case 'wingrep': send({ t: 'docks', op: 'repair', uid: d.uid }); break;   // 1.0.2: from the no-ship notice
    case 'ocat': G.ocat = d.k; renderLanded(); break;   // 2.4
    case 'ltab': G.ltab = d.t; G.sel = null; showLanded(); break;
    case 'spec': send({ t: 'spec', op: d.op, id: d.id ? +d.id : undefined, c: d.c }); break;
    case 'rtree': G.rtree = d.t; renderLanded(); renderStationTab(); break;
    case 'refineall': for (const m of MATERIALS) for (let g = 0; g < 4; g++) { const n = Math.floor(G.you.mats[m][g] / REFINE_UP.need); if (n) send({ t: 'station', op: 'refine', mat: m, g, n }); } break;
  }
}

// ------------------------------------------------------------------ galaxy map overlay and routes
export function openMap(focus) {
  window.dispatchEvent(new CustomEvent('rift-toast-sound', { detail: 'open' }));
  $('gmap').classList.remove('hidden'); const c = $('gcanvas'); c.width = c.clientWidth; c.height = c.clientHeight;
  if (!G.mapView) { G.mapView = { ...mapFit(c.width, c.height), W: c.width, H: c.height }; G.mapView.prevFit = G.mapView.fit; centerOn(focus || G.sys, 2.2); } else if (focus) { G.mapView.k = Math.max(G.mapView.k, G.mapView.fit * 2.2); centerOn(focus); } else drawGMap();
  requestAnimationFrame(() => { if (c.width !== c.clientWidth || c.height !== c.clientHeight) { c.width = c.clientWidth; c.height = c.clientHeight; drawGMap(); } });   // re-measure once layout has settled
}
function centerOn(id, zoom) { const s = SYS[id]; if (!s || !G.mapView) return; G.mapView.cx = s.x; G.mapView.cy = s.y; if (zoom) G.mapView.k = Math.max(G.mapView.k, G.mapView.fit * zoom); drawGMap(); }
function searchMap() {
  const q = $('gsearch').value.trim().toLowerCase(); if (!q) { $('gresults').innerHTML = ''; return; }
  const hits = [];
  for (const s of Object.values(SYS)) {
    if (s.name.toLowerCase().includes(q)) hits.push([s.id, s.name, FACTIONS[s.faction].short]);
    for (const p of s.stellars) if (p.name.toLowerCase().includes(q) && !p.site) hits.push([s.id, p.name, s.name]);
  }
  $('gresults').innerHTML = hits.slice(0, 8).map(([id, n, sub]) => `<div class="it" data-sys="${id}"><b>${esc(n)}</b> <span class="dim">${esc(sub)}</span></div>`).join('') || '<div class="dim">No match.</div>';
}
export function closeMap() { if (!$('gmap').classList.contains('hidden')) window.dispatchEvent(new CustomEvent('rift-toast-sound', { detail: 'close' })); $('gmap').classList.add('hidden'); }
// 1.2 map views
$('gcid').innerHTML = COMMODITIES.filter(c => !['ore', 'gas', 'shards'].includes(c.id)).map(c => `<option value="${c.id}">${c.name}</option>`).join('');
$('gcid').onchange = (e) => { G.mapCid = e.target.value; G.mapMode = 'trade'; syncModes(); drawGMap(); };
$('gmodes').addEventListener('click', (e) => { const b = e.target.closest('[data-mm]'); if (!b) return; G.mapMode = b.dataset.mm; syncModes(); drawGMap(); });
function syncModes() { $('gmodes').querySelectorAll('[data-mm]').forEach(b => b.classList.toggle('on', b.dataset.mm === (G.mapMode || 'factions'))); $('gcid').classList.toggle('dimsel', G.mapMode !== 'trade'); }
function drawGMap() {
  const c = $('gcanvas'); galaxy(G, c.getContext('2d'), { big: true });
  const s = SYS[G.hoverSys || (G.route && G.route[G.route.length - 1]) || G.sys];
  if (s) {
    const seen = !G.you || (G.you.explored || []).includes(s.id), fields = (s.fields || []).map(f => ({ ore: 'asteroid field', gas: 'gas cloud', shards: 'crystal field' }[f.ore])).join(', ');
    const law = s.danger >= 3 ? ' · <span style="color:#f77">lawless: PvP allowed</span>' : '';
    const jumps = G.route && G.route.includes(s.id) ? ` · ${G.route.indexOf(s.id) + 1} jump${G.route.indexOf(s.id) ? 's' : ''} away` : '';
    let extra = '';   // 1.2: what the current map view says about this system
    if (seen && G.mapMode === 'trade') { const cid = G.mapCid || 'food', C = COMMODITIES.find(c => c.id === cid), ps = s.stellars.filter(p => p.svc && p.svc.includes('T') && !p.site); extra = ps.length ? `<br><span>${esc(C.name)}: ${ps.map(p => { const v = price(p, cid); return v === null ? '' : `${esc(p.name)} <b class="${v < C.base * 0.92 ? 'lo' : v > C.base * 1.08 ? 'hi' : ''}">${v.toLocaleString()}</b>`; }).filter(Boolean).join(' · ')} <span class="dim">(average ${C.base})</span></span>` : '<br><span class="dim">No market here.</span>'; }
    if (seen && G.mapMode === 'services') extra = `<br><span>${s.stellars.filter(p => p.svc && /[YO]/.test(p.svc)).map(p => `${esc(p.name)}: ${[p.svc.includes('Y') ? 'shipyard' : '', p.svc.includes('O') ? 'outfitter' : ''].filter(Boolean).join(' + ')}`).join(' · ') || '<span class="dim">No shipyard or outfitter.</span>'}</span>`;
    if (G.mapMode === 'standing' && G.you) extra = `<br><span>Your standing with ${FACTIONS[s.faction].name}: <b>${G.you.rep[s.faction] || 0}</b></span>`;
    const myHome = G.you && G.you.station && G.you.station.claimed && STELLARS[G.you.station.site] && STELLARS[G.you.station.site].system === s.id;
    $('ginfo').innerHTML = `${myHome ? '<span style="color:#ffd27a">◎ YOUR STATION · </span>' : ''}<b style="color:${FACTIONS[s.faction].color}">${esc(s.name)}</b> · ${FACTIONS[s.faction].name}${stateOfSys(s.id) ? ' · ' + stateLine(s.id) : ''} · danger <span class="dgr">${Array.from({ length: 7 }, (_, i) => `<i class="${i < s.danger ? 'on' : ''}"></i>`).join('')}</span> ${s.danger}${law}${jumps}${seen ? '' : ' · <i>not yet visited</i>'}${extra}<br><span class="dim">${s.stellars.map(p => p.site ? `${p.name}${G.sites && G.sites[p.id] ? ' (' + esc(G.sites[p.id].owner) + ', Ops ' + G.sites[p.id].ops + ')' : ' (unclaimed)'}` : `${p.name} (${[p.svc.includes('Y') && 'shipyard', p.svc.includes('O') && 'outfitter', p.svc.includes('T') && 'market', p.svc.includes('B') && 'jobs'].filter(Boolean).join(', ') || 'no services'})`).join(' · ') || 'No inhabited worlds.'}${fields ? ' · Mining: ' + fields : ''}${(() => { const cg = Object.keys((G.you && G.you.cargo) || {}).filter(c => G.you.cargo[c] > 0), buys = cg.filter(c => s.stellars.some(sp => { const p = STELLARS[sp.id]; return p && !p.site && (p.svc || '').includes('T') && price(p, c) !== null; })); return buys.length ? ` · <span style="color:var(--ok)">buys your ${buys.map(c => COMMODITIES.find(x => x.id === c).name.toLowerCase()).join(', ')}</span>` : ''; })()}</span>`;   // 2.5.2
  }
}
export function plot(to) {
  if (to === G.sys) { G.route = []; drawGMap(); return; }
  const r = route(SYS, G.sys, to);
  G.route = r; drawGMap(); drawMini();
  toast(`Course plotted to ${SYS[to].name}: ${r.length} jump${r.length > 1 ? 's' : ''}. Fly clear of planets and press J.`);
}
export function showDead(m) { $('deadmsg').textContent = `Your ship was destroyed. The insurers rebuilt it at ${m.at} for ${credits(m.fee)} credits. Your cargo was lost; your wingmates flew home.`; $('deadbox').classList.remove('hidden'); }
export { esc };
