import { escapeHtml as esc } from './html.ts';
// Quantum Rift: interface: the CAPTAINS companion tab (friends and their status, messages, the Armada,
// trading between Personal Stations, duels), Armada ally detection for the HUD and radar, and follow-the-leader.
import { SYS, COMMODITIES, MATERIALS, GRADES } from '/shared/galaxy.js';
import { ARMADA, TRADE, DUEL } from '/shared/coop.js';
import { credits } from '/shared/rules.js';

/** @import { NetworkMessage } from '../server/message-registry.js' */
/** @import { ClientGameState } from './main.js' */
/** @import { RenderEntity } from './render.js' */

/**
 * @typedef {Object} CoopHelpers
 * @property {(msg: string) => void} toast Show toast notification function
 * @property {(msg: string, onYes: () => void) => void} ask Prompt confirmation modal function
 * @property {(sysId: string) => void} plot Plot course function
 */

/**
 * @typedef {Object} DirectMessage
 * @property {string} from Sender captain name
 * @property {string} msg Message text
 * @property {number} t Timestamp
 * @property {boolean} [off] Delivered while offline flag
 */

/**
 * @typedef {Object} FriendEntry
 * @property {string} name Friend captain name
 * @property {'online'|'away'|'offline'} status Online status
 * @property {number} [last] Last seen timestamp
 * @property {string} [sys] System display name
 * @property {string} [sysId] System ID
 */

/**
 * @typedef {Object} SocialState
 * @property {FriendEntry[]} friends List of friends
 * @property {string[]} inReq Inbound friend request captain names
 * @property {string[]} outReq Outbound friend request captain names
 * @property {string[]} blocks Blocked captain names
 * @property {boolean} [dmAll] Allow messages from non-friends
 * @property {boolean} [hideSys] Hide current location from friends
 */

/**
 * @typedef {Object} TradeOffer
 * @property {number} [credits] Credits offered
 * @property {Record<string, number>} [items] Items offered
 */

/**
 * @typedef {Object} TradeState
 * @property {string} with Other captain name
 * @property {TradeOffer} mine Current player offer
 * @property {TradeOffer} theirs Other captain offer
 * @property {{ me: boolean, them: boolean }} lock Offer lock states
 * @property {{ me: boolean, them: boolean }} ok Offer confirm states
 */

/**
 * Shorthand helper for document.getElementById.
 * @param {string} id Element ID
 * @returns {HTMLElement | null} DOM element or null
 */
const $ = (id) => document.getElementById(id);

/**
 * Formats past timestamp to relative time ago string.
 * @param {number} t Past timestamp in ms
 * @returns {string} Formatted relative time string
 */
const ago = (t) => {
  if (!t) return '';
  const m = Math.round((Date.now() - t) / 60000);
  return m < 1
    ? 'just now'
    : m < 60
      ? `${m}m ago`
      : m < 1440
        ? `${Math.floor(m / 60)}h ago`
        : `${Math.floor(m / 1440)}d ago`;
};
const DOT = {
  online: '<b style="color:var(--ok)">●</b>',
  away: '<b style="color:#e0b040">●</b>',
  offline: '<span class="dim">○</span>',
};
let G, send, toast, ask, plot;

/**
 * Initializes the Co-op subsystem, event listeners, and helper callbacks.
 * @param {ClientGameState} g Shared game state object
 * @param {(msg: NetworkMessage) => void} sender Network send message function
 * @param {CoopHelpers} helpers UI helper callbacks
 * @returns {void}
 */
export function initCoop(g, sender, helpers) {
  G = g;
  send = sender;
  ({ toast, ask, plot } = helpers);
  G.ctabSub = G.ctabSub || 'friends';
  G.dms = {};
  G.unread = {};
  G.isAlly = isAlly;
  $('capview').addEventListener('click', onClick);
  $('capview').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.id === 'dmin') {
      e.preventDefault();
      sendDm();
    }
    if (e.key === 'Enter' && e.target.id === 'fadd') {
      e.preventDefault();
      addFriend();
    }
  });
  $('capview').addEventListener('change', (e) => {
    if (e.target.id === 'pdmall' || e.target.id === 'phide')
      send({ t: 'social', op: 'prefs', dmAll: $('pdmall').checked, hideSys: $('phide').checked });
  });
}

/**
 * Loads direct messages for the current captain from localStorage.
 * @returns {void}
 */
function loadDms() {
  if (!G.myName || G._dmFor === G.myName) return;
  G._dmFor = G.myName;
  try {
    G.dms = JSON.parse(localStorage.getItem('rift.dms.' + G.myName.toLowerCase()) || '{}');
  } catch {
    G.dms = {};
  }
}

/**
 * Saves direct messages for the current captain to localStorage.
 * @returns {void}
 */
function saveDms() {
  try {
    localStorage.setItem('rift.dms.' + G.myName.toLowerCase(), JSON.stringify(G.dms));
  } catch {}
}

/**
 * Updates the unread notification badge count on the CAPTAINS tab button.
 * @returns {void}
 */
function badge() {
  const n =
    Object.values(G.unread).reduce((a, b) => a + b, 0) +
    ((G.social && G.social.inReq.length) || 0) +
    ((G.you && G.you.armada && G.you.armada.invites && G.you.armada.invites.length) || 0) +
    (G.you && G.you.duel && G.you.duel.invite ? 1 : 0);
  const b = document.querySelector('#ctabs button[data-tab="captains"]');
  if (b) b.dataset.n = n ? String(n) : '';
}

// ------------------------------------------------------------------ messages from the server

/**
 * Handles inbound real-time social messages from the server (friend changes, DMs, trades, rally calls, follow jumps).
 * @param {NetworkMessage} message Message payload received via WebSocket
 * @returns {void}
 */
export function onCoopMsg(message) {
  loadDms();
  switch (message.t) {
    case 'social': {
      // 2.6 QoL: a friend coming online gets a short note
      const before = new Map(((G.social && G.social.friends) || []).map((f) => [f.name, f.status]));
      if (message.social !== undefined) G.social = message.social;
      if (message.armada !== undefined && G.you) G.you.armada = message.armada;
      if (G.social && before.size)
        for (const f of G.social.friends)
          if (before.get(f.name) === 'offline' && f.status !== 'offline')
            toast(`● ${f.name} is online${f.sys ? ` (${f.sys})` : ''}.`);
      break;
    }
    case 'dm': {
      const other = message.sent ? message.to : message.from;
      (G.dms[other] = G.dms[other] || []).push({
        from: message.from,
        msg: message.msg,
        t: message.at || Date.now(),
        off: message.offline,
      });
      if (G.dms[other].length > 200) G.dms[other].splice(0, G.dms[other].length - 200);
      if (!message.sent) G.lastDmFrom = message.from;
      if (!message.sent && !(G.ctab === 'captains' && G.ctabSub === 'dm' && G.dmWith === other)) {
        G.unread[other] = (G.unread[other] || 0) + 1;
        toast(`✉ ${message.from}: ${message.msg.slice(0, 80)}`);
      }
      saveDms();
      break;
    }
    case 'dms':
      for (const x of message.list || []) {
        (G.dms[x.from] = G.dms[x.from] || []).push({
          from: x.from,
          msg: x.msg,
          t: x.at || Date.now(),
        });
        G.unread[x.from] = (G.unread[x.from] || 0) + 1;
      }
      saveDms();
      break;
    case 'trade2':
      G.trade = message.trade;
      if (message.trade && G.ctab !== 'captains')
        toast(`Trade open with ${message.trade.with}: see the ALLIES tab.`);
      if (message.trade) G.ctabSub = 'trade';
      break;
    case 'rally':
      if (SYS[message.sys]) {
        G.rally = { sys: message.sys, t: Date.now() };
        if (message.sys !== G.sys) plot(message.sys);
        toast(
          `📣 ${message.from} calls the Armada to ${SYS[message.sys].name}.${message.sys !== G.sys ? ' Course plotted.' : ' You are there.'}`,
        );
      }
      break;
    case 'follow':
      if (G.you && G.you.armada && G.you.armada.follow && G.view && SYS[message.to]) {
        plot(message.to);
        G.autoRoute = true;
        toast(`Following ${message.leader} to ${SYS[message.to].name}.`);
        if (G.startAutoJump) G.startAutoJump();
      }
      break;
  }
  badge();
  if (G.ctab === 'captains') renderCaptains();
}

/**
 * Synchronizes local social state and badges when the 'you' payload is received.
 * @returns {void}
 */
export function coopYou() {
  loadDms();
  if (G.you && G.you.social !== undefined) G.social = G.you.social;
  badge();
}

// ------------------------------------------------------------------ allies in space
// an Armada member's ship, or one of their wingmates (escorts and fighters follow their owner chain)

/**
 * Checks whether a space entity belongs to an allied Armada member or one of their wingmates.
 * @param {RenderEntity} e Space entity object
 * @returns {boolean} True if entity is an allied Armada captain or wingmate
 */
export function isAlly(e) {
  const A = G.you && G.you.armada;
  if (!A || !A.members || !e) return false;
  let r = e,
    k = 0;
  while (r && r.owner && k++ < 4) r = G.ents.get(r.owner) || null;
  if (!r || !(r.fl & 16) || r.id === G.myId) return false;
  const nm = String(r.name || '').replace(/^(Azure|Crimson) · /, '');
  return A.members.some((m) => m.name === nm && m.name !== G.myName);
}

// ------------------------------------------------------------------ the ALLIES tab

/**
 * Renders the CAPTAINS companion tab (friends, messages, Armada roster, player trading).
 * @returns {void}
 */
export function renderCaptains() {
  if (!G.you) return;
  loadDms();
  const v = $('capview');
  if (!v) return;
  if (G.solo) {
    v.innerHTML = '<p class="dim">Friends, the Armada and trading are for online games.</p>';
    return;
  }
  const subs = [
    ['friends', 'FRIENDS'],
    ['dm', 'MESSAGES'],
    ['armada', 'ARMADA'],
    ['trade', 'TRADE'],
  ];
  const un = Object.values(G.unread).reduce((a, b) => a + b, 0);
  let h = `<div class="itabs capsub">${subs.map(([k, n]) => `<button class="btn sm ${G.ctabSub === k ? 'on' : ''}" data-cs="${k}">${n}${k === 'dm' && un ? ` (${un})` : ''}${k === 'friends' && G.social && G.social.inReq.length ? ` (${G.social.inReq.length})` : ''}</button>`).join('')}</div>`;
  h += duelBox();
  h +=
    G.ctabSub === 'friends'
      ? friendsHtml()
      : G.ctabSub === 'dm'
        ? dmHtml()
        : G.ctabSub === 'armada'
          ? armadaHtml()
          : tradeHtml();
  const keep = $('dmin') ? $('dmin').value : null,
    focus = document.activeElement && document.activeElement.id;
  if (G.views) G.views.replace(v, h, 'captains:' + (G.ctabSub || 'online'));
  else v.innerHTML = h;
  if (keep !== null && $('dmin')) $('dmin').value = keep;
  if (focus && $(focus)) $(focus).focus();
  const log = $('dmlog');
  if (log) log.scrollTop = log.scrollHeight;
}

/**
 * Renders the active duel banner or incoming challenge acceptance box.
 * @returns {string} HTML markup
 */
function duelBox() {
  const D = G.you.duel;
  if (!D) return '';
  if (D.invite)
    return `<div class="evbox inv"><b>${esc(D.invite.from)}</b> challenges ${D.invite.armada ? 'your Armada to an <b>Armada Duel</b>' : 'you to a <b>duel</b>'}. A fight to disabled; nobody loses a ship.<div style="margin-top:4px"><button class="btn sm" data-cact="duelok">ACCEPT</button> <button class="btn sm" data-cact="duelno">DECLINE</button></div></div>`;
  return `<div class="evbox inv"><b>${D.armada ? 'ARMADA DUEL' : 'DUEL'}</b> ${D.on ? '· weapons free' : '· starting'} · against ${esc(D.foes.join(', '))}<div class="dim small">It ends at disabled, or as a draw after ${DUEL.minutes} minutes. Leaving the system or landing counts as yielding.</div><button class="btn sm" data-cact="yield">YIELD</button></div>`;
}

/**
 * Renders the FRIENDS sub-tab (targeted captain actions, friend requests, friends list, privacy).
 * @returns {string} HTML markup
 */
function friendsHtml() {
  const S = G.social;
  if (!S) return '<p class="dim">Loading...</p>';
  let h = '';
  const t = G.view && G.target && G.ents.get(G.target),
    tn = t && t.fl & 16 && !SYS[G.sys].arena ? String(t.name || '') : '';
  if (tn) {
    const fr = S.friends.some((f) => f.name === tn);
    h += `<div class="evbox"><div class="dim small">TARGETED CAPTAIN</div><b>${esc(tn)}</b><div class="frbtn" style="margin-left:0">${fr ? '' : `<button class="btn sm" data-cact="fadd2" data-n="${esc(tn)}">ADD FRIEND</button>`} <button class="btn sm" data-cact="ainv" data-n="${esc(tn)}">INVITE TO ARMADA</button> ${isAlly(t) ? '' : `<button class="btn sm" data-cact="duel" data-n="${esc(tn)}">DUEL</button>`} <button class="btn sm" data-cact="dm" data-n="${esc(tn)}">MESSAGE</button></div></div>`;
  }
  h += `<div class="rrow"><input id="fadd" placeholder="Captain name" maxlength="20"><button class="btn sm" data-cact="fadd">ADD FRIEND</button></div>`;
  if (S.inReq.length)
    h +=
      '<div class="sect">FRIEND REQUESTS</div>' +
      S.inReq
        .map(
          (n) =>
            `<div class="kv"><span>${esc(n)}</span><span><button class="btn sm" data-cact="facc" data-n="${esc(n)}">ACCEPT</button> <button class="btn sm" data-cact="fdec" data-n="${esc(n)}">DECLINE</button></span></div>`,
        )
        .join('');
  h += `<div class="sect">FRIENDS (${S.friends.length})</div>`;
  h += S.friends.length
    ? S.friends
        .map(
          (
            f,
          ) => `<div class="frow"><div class="kv"><span>${DOT[f.status]} <b>${esc(f.name)}</b></span><span class="dim small">${f.status === 'offline' ? (f.last ? 'seen ' + ago(f.last) : 'offline') : f.status === 'away' ? 'away' : ''}${f.sys ? ` · ${f.sysId ? `<a href="#" data-cact="plot" data-sys="${esc(f.sysId)}">${esc(f.sys)}</a>` : esc(f.sys)}` : ''}</span></div>
      <div class="frbtn"><button class="btn sm" data-cact="dm" data-n="${esc(f.name)}">MESSAGE</button>${f.status !== 'offline' ? ` <button class="btn sm" data-cact="ainv" data-n="${esc(f.name)}">INVITE</button>` : ''}${f.status !== 'offline' && G.landed && G.landed.site && G.landed.site.own ? ` <button class="btn sm" data-cact="topen" data-n="${esc(f.name)}">TRADE</button>` : ''}${f.status !== 'offline' && G.view ? ` <button class="btn sm" data-cact="duel" data-n="${esc(f.name)}">DUEL</button>` : ''} <button class="btn sm" data-cact="fdel" data-n="${esc(f.name)}">REMOVE</button></div></div>`,
        )
        .join('')
    : '<p class="dim small">No friends yet. Add a captain by name, or from the captains online list at Quantum Station.</p>';
  if (S.outReq.length)
    h +=
      '<div class="sect">SENT REQUESTS</div>' +
      S.outReq
        .map(
          (n) =>
            `<div class="kv"><span class="dim">${esc(n)}</span><span><button class="btn sm" data-cact="fcan" data-n="${esc(n)}">CANCEL</button></span></div>`,
        )
        .join('');
  h += `<div class="sect">PRIVACY</div><label class="small"><input type="checkbox" id="pdmall" ${S.dmAll ? 'checked' : ''}> Take messages from captains who are not my friends</label><br><label class="small"><input type="checkbox" id="phide" ${S.hideSys ? 'checked' : ''}> Hide my location from friends</label>`;
  if (S.blocks.length)
    h +=
      '<div class="sect">BLOCKED</div>' +
      S.blocks
        .map(
          (n) =>
            `<div class="kv"><span class="dim">${esc(n)}</span><span><button class="btn sm" data-cact="unblock" data-n="${esc(n)}">UNBLOCK</button></span></div>`,
        )
        .join('');
  return h;
}
function dmHtml() {
  const who = Object.keys(G.dms).sort(
    (a, b) => ((G.dms[b].at(-1) || {}).t || 0) - ((G.dms[a].at(-1) || {}).t || 0),
  );
  if (G.dmWith) {
    G.unread[G.dmWith] = 0;
    badge();
    const list = G.dms[G.dmWith] || [],
      f = G.social && G.social.friends.find((x) => x.name === G.dmWith);
    return `<div class="kv"><span><a href="#" data-cact="dmback" style="color:#d88">&lsaquo; all</a> &nbsp;${f ? DOT[f.status] : ''} <b>${esc(G.dmWith)}</b></span><span><button class="btn sm" data-cact="block" data-n="${esc(G.dmWith)}">BLOCK</button></span></div>
      <div class="dmlog" id="dmlog">${list.map((x) => `<div class="dm ${x.from === G.myName ? 'me' : ''}"><span class="dim small">${new Date(x.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${x.off ? ' · delivered when they log in' : ''}</span><div>${esc(x.msg)}</div></div>`).join('') || '<p class="dim small">No messages yet. Say hello.</p>'}</div>
      <div class="rrow"><input id="dmin" placeholder="Message ${esc(G.dmWith)} (Enter)" maxlength="400"><button class="btn sm" data-cact="dmsend">SEND</button></div>`;
  }
  return (
    `<div class="dim small" style="margin:4px 0">Message a friend from the FRIENDS list, or type <b>/w name message</b> in chat. Messages to offline captains are delivered when they log in.</div>` +
    (who.length
      ? who
          .map((n) => {
            const last = G.dms[n].at(-1) || {};
            return `<div class="it dmrow" data-cact="dm" data-n="${esc(n)}"><div class="n"><div><b>${esc(n)}</b>${G.unread[n] ? ` <span class="pill on">${G.unread[n]} new</span>` : ''}</div><div class="s">${esc((last.from === G.myName ? 'You: ' : '') + (last.msg || '')).slice(0, 70)}</div></div></div>`;
          })
          .join('')
      : '<p class="dim small">No conversations yet.</p>')
  );
}
function armadaHtml() {
  const A = G.you.armada,
    me = G.myName;
  let h = '';
  if (A && A.invites && A.invites.length)
    h +=
      '<div class="sect" style="margin-top:4px">INVITES</div>' +
      A.invites
        .map(
          (x) =>
            `<div class="kv"><span><b>${esc(x.name)}</b> <span class="dim small">led by ${esc(x.leader)} · ${x.n}/${ARMADA.max}</span></span><span><button class="btn sm" data-cact="aacc" data-id="${esc(x.id)}">JOIN</button> <button class="btn sm" data-cact="adec" data-id="${esc(x.id)}">DECLINE</button></span></div>`,
        )
        .join('');
  if (!A || A.none) {
    return (
      h +
      `<div class="sect">FORM AN ARMADA</div><div class="rrow"><input id="aname" placeholder="Armada name (optional)" maxlength="24"><button class="btn sm" data-cact="aform">FORM</button></div>
      <div class="rrow"><input id="ainv" placeholder="Captain online (creates Armada)" maxlength="20"><button class="btn sm" data-cact="ainv2">INVITE</button></div>
      <div class="dim small">An Armada is a short co-op group of up to ${ARMADA.max} captains, each with their own wingmates. Members and their wingmates can't hurt each other and show in green. You get a private chat (/a), +5% shield recharge and bounties while another member shares your system, a share of each other's bounties and kill credit, Armada contracts, co-op Holdouts, and a rescue window if your ship goes down. It disbands when everyone has been offline for ${ARMADA.idleMin} minutes.</div>`
    );
  }
  const lead = A.leader === me;
  h += `<div class="sect" style="margin-top:4px">${esc(A.name)} <span class="dim small">${A.members.length}/${A.max}</span></div>`;
  h += A.members
    .map((m) => {
      const live = liveMember(m.name);
      return `<div class="frow"><div class="kv"><span>${m.online ? DOT.online : DOT.offline} <b style="color:${m.name === me ? '#ddd' : '#7af0a0'}">${esc(m.name)}</b>${m.name === A.leader ? ' <span class="dim small">leader</span>' : ''}</span><span class="dim small">${esc(m.hull)}${m.sys ? ` · ${m.sysId ? `<a href="#" data-cact="plot" data-sys="${esc(m.sysId)}">${esc(m.sys)}</a>` : esc(m.sys)}` : ''}${m.landed ? ' · landed' : ''}</span></div>
      ${live ? `<div class="bars2"><div class="bar thin"><i style="width:${live.sh}%"></i></div><div class="bar thin"><i class="ar" style="width:${live.ar}%"></i></div></div>` : ''}
      ${m.name !== me ? `<div class="frbtn"><button class="btn sm" data-cact="dm" data-n="${esc(m.name)}">MESSAGE</button>${m.online && G.landed && G.landed.site && G.landed.site.own ? ` <button class="btn sm" data-cact="topen" data-n="${esc(m.name)}">TRADE</button>` : ''}${lead ? ` <button class="btn sm" data-cact="alead" data-n="${esc(m.name)}">MAKE LEADER</button> <button class="btn sm" data-cact="akick" data-n="${esc(m.name)}">REMOVE</button>` : ''}</div>` : ''}</div>`;
    })
    .join('');
  if (A.pending && A.pending.length)
    h += `<div class="dim small">Invited: ${A.pending.map(esc).join(', ')}</div>`;
  if (A.members.length + (A.pending || []).length < A.max)
    h += `<div class="rrow"><input id="ainv" placeholder="Invite any captain online, by name" maxlength="20"><button class="btn sm" data-cact="ainv2">INVITE</button></div>`;
  h += `<div class="rrow"><button class="btn sm" data-cact="rally" title="Plot a course to you for every member">📣 CALL THE ARMADA TO ME</button></div>`;
  h += lead
    ? '<div class="dim small">You lead this Armada. Other captains enable Follow the Leader here; you fly normally. Invite, JOIN, then Follow — no friend request needed.</div>'
    : `<label class="small"><input type="checkbox" id="afollow" data-cact="afollow" ${A.follow ? 'checked' : ''}> Follow the Leader (V formation + jumps)</label><div class="dim small">JOIN does not enable Follow: opt in here. Both ships must be in flight in the same system. Your ship needs its own jump fuel and route access. Manual flight or weapons input turns Follow off. Combat Assist takes priority. Re-enable after reconnecting or a leader change.</div>`;
  if (lead && G.view) {
    const t = G.target && G.ents.get(G.target),
      tn = t && t.fl & 16 ? String(t.name || '') : '';
    h += `<div class="sect">ARMADA DUEL</div><div class="dim small">Target another Armada's leader in this system to challenge their Armada: every member here fights for their side, to disabled, nothing lost.</div>${tn && !isAlly(t) ? `<button class="btn sm" data-cact="aduel" data-n="${esc(tn)}">CHALLENGE ${esc(tn)}'S ARMADA</button>` : '<p class="dim small">No captain targeted.</p>'}`;
  }
  h += `<div style="margin-top:8px">${lead ? '<button class="btn sm" data-cact="arename">RENAME</button> ' : ''}<button class="btn sm" data-cact="aleave">LEAVE ARMADA</button></div>`;
  return h;
}
function liveMember(name) {
  for (const e of G.ents.values())
    if (e.fl & 16 && e.name === name) return { sh: e.sh || 0, ar: e.ar || 0 };
  return null;
}
function tradeItems() {
  const y = G.you,
    out = [];
  for (const [cid, n] of Object.entries(y.cargo || {}))
    if (n > 0) {
      const C = COMMODITIES.find((c) => c.id === cid);
      out.push([`cargo:${cid}`, `${C ? C.name : cid} (hold)`, n]);
    }
  for (const m of MATERIALS)
    (y.mats[m] || []).forEach((n, g) => {
      if (n > 0) out.push([`mat:${m}:${g}`, `${m} crate ${GRADES[g]}`, n]);
    });
  for (const [id, n] of Object.entries(y.bp || {}))
    if (n > 0 && G.A.ships[id]) out.push([`bp:${id}`, `${G.A.ships[id].name} blueprints`, n]);
  for (const [id, n] of Object.entries(y.parts || {}))
    if (n > 0 && G.A.ships[id]) out.push([`parts:${id}`, `${G.A.ships[id].name} parts`, n]);
  return out;
}
function itemName(k) {
  const [kind, a, b] = k.split(':');
  if (kind === 'cargo') {
    const C = COMMODITIES.find((c) => c.id === a);
    return `t ${C ? C.name : a}`;
  }
  if (kind === 'mat') return `${a} crate ${GRADES[+b]}`;
  if (kind === 'bp') return `${G.A.ships[a] ? G.A.ships[a].name : a} blueprints`;
  if (kind === 'parts') return `${G.A.ships[a] ? G.A.ships[a].name : a} parts`;
  return k;
}
function offerList(g) {
  const rows = [];
  if (g && g.credits) rows.push(`${credits(g.credits)} credits`);
  for (const [k, n] of Object.entries((g && g.items) || {})) rows.push(`${n} ${itemName(k)}`);
  return rows.length
    ? rows.map((r) => `<div>${esc(r)}</div>`).join('')
    : '<div class="dim">nothing yet</div>';
}
function tradeHtml() {
  const T = G.trade,
    atHome = G.landed && G.landed.site && G.landed.site.own;
  if (!T) {
    return (
      `<div class="dim small" style="margin:6px 0">Trade credits, goods, crates, blueprints and parts with friends and Armada members. Both captains must be docked at their <b>own</b> Personal Station; nobody docks at anyone else's.</div>` +
      (atHome
        ? `<div class="rrow"><input id="tname" placeholder="Captain to trade with" maxlength="20"><button class="btn sm" data-cact="topen2">OPEN TRADE</button></div>`
        : '<p class="dim small">Dock at your own Personal Station to trade.</p>')
    );
  }
  const mine = G.tdraft || (G.tdraft = JSON.parse(JSON.stringify(T.mine || {})));
  const opts = tradeItems()
    .map(([k, n, max]) => `<option value="${esc(k)}">${esc(n)} · ${max}</option>`)
    .join('');
  return `<div class="sect" style="margin-top:4px">TRADE WITH ${esc(T.with).toUpperCase()}</div>
    <div class="tgrid"><div><div class="dim small">YOU GIVE ${T.lock.me ? '🔒' : ''}${T.ok.me ? ' ✓' : ''}</div>${offerList(T.mine)}</div><div><div class="dim small">THEY GIVE ${T.lock.them ? '🔒' : ''}${T.ok.them ? ' ✓' : ''}</div>${offerList(T.theirs)}</div></div>
    ${
      T.lock.me
        ? ''
        : `<div class="sect">YOUR OFFER</div>
      <div class="rrow"><input id="tcr" type="number" min="0" placeholder="credits" value="${mine.credits || ''}"><span class="dim small">${Math.round(TRADE.fee * 100)}% fee on credits</span></div>
      <div class="rrow"><select id="titem">${opts || '<option value="">(nothing to trade)</option>'}</select><input id="tqty" type="number" min="1" value="1" style="width:60px"><button class="btn sm" data-cact="tadd">ADD</button></div>
      ${Object.entries(mine.items || {})
        .map(
          ([k, n]) =>
            `<div class="kv"><span>${n} ${esc(itemName(k))}</span><span><button class="btn sm" data-cact="tdel" data-k="${esc(k)}">✕</button></span></div>`,
        )
        .join('')}
      <button class="btn sm" data-cact="tsend">UPDATE OFFER</button>`
    }
    <div style="margin-top:8px">${T.lock.me ? '<button class="btn sm" data-cact="tunlock">UNLOCK</button>' : '<button class="btn sm" data-cact="tlock">LOCK OFFER</button>'} ${T.lock.me && T.lock.them && !T.ok.me ? '<button class="btn sm" data-cact="tok">CONFIRM TRADE</button>' : ''} <button class="btn sm" data-cact="tcancel">CANCEL</button></div>
    <div class="dim small">Both sides lock their offer, then both confirm. Any change unlocks both. Goods you receive go into your hold, or exchange storage if it is full.</div>`;
}

// ------------------------------------------------------------------ clicks
function addFriend() {
  const n = $('fadd') && $('fadd').value.trim();
  if (n) send({ t: 'social', op: 'add', name: n });
}
function sendDm() {
  const v = $('dmin') && $('dmin').value.trim();
  if (!v || !G.dmWith) return;
  send({ t: 'social', op: 'dm', name: G.dmWith, msg: v });
  $('dmin').value = '';
}
export function openDm(name) {
  G.ctabSub = 'dm';
  G.dmWith = name;
  renderCaptains();
}
function onClick(e) {
  const cs = e.target.closest('[data-cs]');
  if (cs) {
    G.ctabSub = cs.dataset.cs;
    if (G.ctabSub !== 'dm') G.dmWith = null;
    renderCaptains();
    return;
  }
  const b = e.target.closest('[data-cact]');
  if (!b) return;
  if (b.tagName === 'A') e.preventDefault();
  const d = b.dataset,
    n = d.n;
  switch (d.cact) {
    case 'fadd':
      addFriend();
      break;
    case 'fadd2':
      send({ t: 'social', op: 'add', name: n });
      break;
    case 'facc':
      send({ t: 'social', op: 'accept', name: n });
      break;
    case 'fdec':
      send({ t: 'social', op: 'decline', name: n });
      break;
    case 'fcan':
      send({ t: 'social', op: 'cancel', name: n });
      break;
    case 'fdel':
      ask(`Remove ${n} from your friends?`, () => send({ t: 'social', op: 'remove', name: n }));
      break;
    case 'block':
      ask(`Block ${n}? You won't get their messages, requests, invites or chat.`, () => {
        send({ t: 'social', op: 'block', name: n });
        G.dmWith = null;
      });
      break;
    case 'unblock':
      send({ t: 'social', op: 'unblock', name: n });
      break;
    case 'dm':
      openDm(n);
      break;
    case 'dmback':
      G.dmWith = null;
      renderCaptains();
      break;
    case 'dmsend':
      sendDm();
      break;
    case 'plot':
      plot(d.sys);
      toast(`Course plotted to ${SYS[d.sys] ? SYS[d.sys].name : d.sys}.`);
      break;
    case 'aform':
      send({ t: 'armada', op: 'form', name: $('aname') ? $('aname').value.trim() : '' });
      break;
    case 'ainv':
      send({ t: 'armada', op: 'invite', name: n });
      break;
    case 'ainv2': {
      const v = $('ainv') && $('ainv').value.trim();
      if (v) send({ t: 'armada', op: 'invite', name: v });
      break;
    }
    case 'aacc':
      send({ t: 'armada', op: 'accept', id: d.id });
      break;
    case 'adec':
      send({ t: 'armada', op: 'decline', id: d.id });
      break;
    case 'aleave':
      ask('Leave your Armada?', () => send({ t: 'armada', op: 'leave' }));
      break;
    case 'akick':
      ask(`Remove ${n} from the Armada?`, () => send({ t: 'armada', op: 'kick', name: n }));
      break;
    case 'alead':
      send({ t: 'armada', op: 'lead', name: n });
      break;
    case 'arename': {
      const v = prompt('New name for the Armada (3-24 characters):', G.you.armada.name);
      if (v) send({ t: 'armada', op: 'rename', name: v.trim() });
      break;
    }
    case 'rally':
      send({ t: 'armada', op: 'rally' });
      break;
    case 'afollow':
      send({ t: 'armada', op: 'follow', on: b.checked });
      break;
    case 'aduel':
      ask(
        `Challenge ${n}'s Armada to an Armada Duel? Every member in this system fights, to disabled. Nobody loses a ship.`,
        () => send({ t: 'duel', op: 'challenge', name: n, armada: true }),
      );
      break;
    case 'duel':
      ask(`Challenge ${n} to a duel? A fight to disabled; nobody loses a ship.`, () =>
        send({ t: 'duel', op: 'challenge', name: n }),
      );
      break;
    case 'duelok':
      send({ t: 'duel', op: 'accept' });
      break;
    case 'duelno':
      send({ t: 'duel', op: 'decline' });
      break;
    case 'yield':
      send({ t: 'duel', op: 'yield' });
      break;
    case 'topen':
      send({ t: 'trade2', op: 'open', name: n });
      break;
    case 'topen2': {
      const v = $('tname') && $('tname').value.trim();
      if (v) send({ t: 'trade2', op: 'open', name: v });
      break;
    }
    case 'tadd': {
      const k = $('titem').value,
        q = Math.max(1, +$('tqty').value || 1);
      if (!k) break;
      const D = G.tdraft || (G.tdraft = {});
      D.items = D.items || {};
      D.items[k] = q;
      D.credits = Math.max(0, +$('tcr').value || 0);
      renderCaptains();
      break;
    }
    case 'tdel': {
      const D = G.tdraft;
      if (D && D.items) delete D.items[d.k];
      renderCaptains();
      break;
    }
    case 'tsend': {
      const D = G.tdraft || {};
      D.credits = Math.max(0, +$('tcr').value || 0);
      send({ t: 'trade2', op: 'offer', give: D });
      break;
    }
    case 'tlock': {
      const D = G.tdraft || {};
      D.credits = Math.max(0, +($('tcr') ? $('tcr').value : D.credits) || 0);
      send({ t: 'trade2', op: 'offer', give: D });
      send({ t: 'trade2', op: 'lock', on: true });
      break;
    }
    case 'tunlock':
      send({ t: 'trade2', op: 'lock', on: false });
      break;
    case 'tok':
      send({ t: 'trade2', op: 'confirm' });
      break;
    case 'tcancel':
      send({ t: 'trade2', op: 'cancel' });
      G.tdraft = null;
      break;
  }
}
export function tradeClosed() {
  G.tdraft = null;
}
