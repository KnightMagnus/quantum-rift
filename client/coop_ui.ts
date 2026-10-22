import type { SocialMessage } from './protocol.ts';
import { elementById } from './dom.ts';
import type { NetworkMessage } from '../server/message-registry.ts';
import type { ClientGameState } from './main.ts';
import type { RenderShip } from './render.ts';
export type CoopHelpers = {
  toast: (message: string) => void;
  ask: (message: string, onYes: () => void) => void;
  plot: (systemId: string) => void;
};
export type DirectMessage = { from: string; msg: string; t: number; off?: boolean };
export type FriendEntry = {
  name: string;
  status: 'online' | 'away' | 'offline';
  last?: number;
  sys?: string;
  sysId?: string | null;
};
export type SocialState = {
  friends: FriendEntry[];
  inReq: string[];
  outReq: string[];
  blocks: string[];
  dmAll?: boolean;
  hideSys?: boolean;
};
export type TradeOffer = { credits?: number; items?: Record<string, number> };
export type TradeState = {
  with: string;
  mine: TradeOffer;
  theirs: TradeOffer;
  lock: { me: boolean; them: boolean };
  ok: { me: boolean; them: boolean };
};

import { escapeHtml as escapeHtml2 } from './html.ts';
// Quantum Rift: interface: the CAPTAINS companion tab (friends and their status, messages, the Armada,
// trading between Personal Stations, duels), Armada ally detection for the HUD and radar, and follow-the-leader.
import { SYS as systemsById, COMMODITIES, MATERIALS, GRADES } from '../shared/galaxy.ts';
import { ARMADA, TRADE, DUEL } from '../shared/coop.ts';
import { credits } from '../shared/rules.ts';

/** @import { NetworkMessage } from '../server/message-registry.ts' */
/** @import { ClientGameState } from './main.ts' */
/** @import { RenderEntity } from './render.ts' */

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
const elementById2 = elementById;

/**
 * Formats past timestamp to relative time ago string.
 * @param {number} time Past timestamp in ms
 * @returns {string} Formatted relative time string
 */
const elapsedTime = (time: number): string => {
  if (!time) return '';
  const message = Math.round((Date.now() - time) / 60000);
  return message < 1
    ? 'just now'
    : message < 60
      ? `${message}m ago`
      : message < 1440
        ? `${Math.floor(message / 60)}h ago`
        : `${Math.floor(message / 1440)}d ago`;
};
const presenceIndicators = {
  online: '<b style="color:var(--ok)">●</b>',
  away: '<b style="color:#e0b040">●</b>',
  offline: '<span class="dim">○</span>',
};
let clientGameState: ClientGameState;
let send: (message: NetworkMessage) => void;
let toast: CoopHelpers['toast'];
let showConfirmation: CoopHelpers['ask'];
let plot: CoopHelpers['plot'];

/**
 * Initializes the Co-op subsystem, event listeners, and helper callbacks.
 * @param {ClientGameState} clientGameState2 Shared game state object
 * @param {(msg: NetworkMessage) => void} sender Network send message function
 * @param {CoopHelpers} helpers UI helper callbacks
 * @returns {void}
 */
export function initCoop(
  clientGameState2: ClientGameState,
  sender: (networkMessage: NetworkMessage) => void,
  helpers: CoopHelpers,
): void {
  clientGameState = clientGameState2;
  send = sender;
  ({ toast, ask: showConfirmation, plot } = helpers);
  clientGameState.ctabSub = clientGameState.ctabSub || 'friends';
  clientGameState.dms = {};
  clientGameState.unread = {};
  clientGameState.isAlly = isAlly;
  elementById2('capview').addEventListener('click', onClick);
  elementById2('capview').addEventListener('keydown', (keyboardEvent) => {
    if (keyboardEvent.key === 'Enter' && (keyboardEvent.target as HTMLInputElement).id === 'dmin') {
      keyboardEvent.preventDefault();
      sendDm();
    }
    if (keyboardEvent.key === 'Enter' && (keyboardEvent.target as HTMLInputElement).id === 'fadd') {
      keyboardEvent.preventDefault();
      addFriend();
    }
  });
  elementById2('capview').addEventListener('change', (event) => {
    if (
      (event.target as HTMLInputElement).id === 'pdmall' ||
      (event.target as HTMLInputElement).id === 'phide'
    )
      send({
        t: 'social',
        op: 'prefs',
        dmAll: elementById2('pdmall').checked,
        hideSys: elementById2('phide').checked,
      });
  });
}

/**
 * Loads direct messages for the current captain from localStorage.
 * @returns {void}
 */
function loadDms(): void {
  if (!clientGameState.myName || clientGameState._dmFor === clientGameState.myName) return;
  clientGameState._dmFor = clientGameState.myName;
  try {
    clientGameState.dms = JSON.parse(
      localStorage.getItem('rift.dms.' + clientGameState.myName.toLowerCase()) || '{}',
    );
  } catch {
    clientGameState.dms = {};
  }
}

/**
 * Saves direct messages for the current captain to localStorage.
 * @returns {void}
 */
function saveDms(): void {
  try {
    localStorage.setItem(
      'rift.dms.' + clientGameState.myName!.toLowerCase(),
      JSON.stringify(clientGameState.dms),
    );
  } catch {}
}

/**
 * Updates the unread notification badge count on the CAPTAINS tab button.
 * @returns {void}
 */
function badge(): void {
  const count =
    Object.values(clientGameState.unread).reduce(
      (firstValue, secondValue) => firstValue + secondValue,
      0,
    ) +
    ((clientGameState.social && clientGameState.social.inReq.length) || 0) +
    ((clientGameState.you &&
      clientGameState.you!.armada &&
      clientGameState.you!.armada.invites &&
      clientGameState.you!.armada.invites.length) ||
      0) +
    (clientGameState.you && clientGameState.you!.duel && clientGameState.you!.duel.invite ? 1 : 0);
  const htmlElement = document.querySelector<HTMLElement>('#ctabs button[data-tab="captains"]');
  if (htmlElement) htmlElement.dataset.n = count ? String(count) : '';
}

// ------------------------------------------------------------------ messages from the server

/**
 * Handles inbound real-time social messages from the server (friend changes, DMs, trades, rally calls, follow jumps).
 * @param {NetworkMessage} message Message payload received via WebSocket
 * @returns {void}
 */
export function onCoopMsg(message: SocialMessage): void {
  loadDms();
  switch (message.t) {
    case 'social': {
      // 2.6 QoL: a friend coming online gets a short note
      const before = new Map(
        ((clientGameState.social && clientGameState.social.friends) || []).map((friendEntry) => [
          friendEntry.name,
          friendEntry.status,
        ]),
      );
      if (message.social !== undefined) clientGameState.social = message.social;
      if (message.armada !== undefined && clientGameState.you)
        clientGameState.you!.armada = message.armada;
      if (clientGameState.social && before.size)
        for (const friendEntry of clientGameState.social.friends)
          if (before.get(friendEntry.name) === 'offline' && friendEntry.status !== 'offline')
            toast(
              `● ${friendEntry.name} is online${friendEntry.sys ? ` (${friendEntry.sys})` : ''}.`,
            );
      break;
    }
    case 'dm': {
      const other = message.sent ? message.to : message.from;
      (clientGameState.dms[other] = clientGameState.dms[other] || []).push({
        from: message.from,
        msg: message.msg,
        t: message.at || Date.now(),
        off: message.offline,
      });
      if (clientGameState.dms[other].length > 200)
        clientGameState.dms[other].splice(0, clientGameState.dms[other].length - 200);
      if (!message.sent) clientGameState.lastDmFrom = message.from;
      if (
        !message.sent &&
        !(
          clientGameState.ctab === 'captains' &&
          clientGameState.ctabSub === 'dm' &&
          clientGameState.dmWith === other
        )
      ) {
        clientGameState.unread[other] = (clientGameState.unread[other] || 0) + 1;
        toast(`✉ ${message.from}: ${message.msg.slice(0, 80)}`);
      }
      saveDms();
      break;
    }
    case 'dms':
      for (const positionX of message.list || []) {
        (clientGameState.dms[positionX.from] = clientGameState.dms[positionX.from] || []).push({
          from: positionX.from,
          msg: positionX.msg,
          t: positionX.at || Date.now(),
        });
        clientGameState.unread[positionX.from] = (clientGameState.unread[positionX.from] || 0) + 1;
      }
      saveDms();
      break;
    case 'trade2':
      clientGameState.trade = message.trade;
      if (message.trade && clientGameState.ctab !== 'captains')
        toast(`Trade open with ${message.trade.with}: see the ALLIES tab.`);
      if (message.trade) clientGameState.ctabSub = 'trade';
      break;
    case 'rally':
      if (systemsById[message.sys]) {
        clientGameState.rally = { sys: message.sys, t: Date.now() };
        if (message.sys !== clientGameState.sys) plot(message.sys);
        toast(
          `📣 ${message.from} calls the Armada to ${systemsById[message.sys].name}.${message.sys !== clientGameState.sys ? ' Course plotted.' : ' You are there.'}`,
        );
      }
      break;
    case 'follow':
      if (
        clientGameState.you &&
        clientGameState.you!.armada &&
        clientGameState.you!.armada.follow &&
        clientGameState.view &&
        systemsById[message.to]
      ) {
        plot(message.to);
        clientGameState.autoRoute = true;
        toast(`Following ${message.leader} to ${systemsById[message.to].name}.`);
        if (clientGameState.startAutoJump) clientGameState.startAutoJump();
      }
      break;
  }
  badge();
  if (clientGameState.ctab === 'captains') renderCaptains();
}

/**
 * Synchronizes local social state and badges when the 'you' payload is received.
 * @returns {void}
 */
export function coopYou(): void {
  loadDms();
  if (clientGameState.you && clientGameState.you!.social !== undefined)
    clientGameState.social = clientGameState.you!.social;
  badge();
}

// ------------------------------------------------------------------ allies in space
// an Armada member's ship, or one of their wingmates (escorts and fighters follow their owner chain)

/**
 * Checks whether a space entity belongs to an allied Armada member or one of their wingmates.
 * @param {RenderEntity} event Space entity object
 * @returns {boolean} True if entity is an allied Armada captain or wingmate
 */
export function isAlly(event: RenderShip | null | undefined | 0): boolean {
  const firstValue = clientGameState.you && clientGameState.you!.armada;
  if (!firstValue || !firstValue.members || !event) return false;
  let renderShip: RenderShip | null = event,
    entryKey = 0;
  while (renderShip && renderShip.owner && entryKey++ < 4)
    renderShip = clientGameState.ents.get(renderShip.owner) || null;
  if (!renderShip || !(renderShip.fl & 16) || renderShip.id === clientGameState.myId) return false;
  const replace2 = String(renderShip.name || '').replace(/^(Azure|Crimson) · /, '');
  return firstValue.members.some(
    (message) => message.name === replace2 && message.name !== clientGameState.myName,
  );
}

// ------------------------------------------------------------------ the ALLIES tab

/**
 * Renders the CAPTAINS companion tab (friends, messages, Armada roster, player trading).
 * @returns {void}
 */
export function renderCaptains(): void {
  if (!clientGameState.you) return;
  loadDms();
  const cachedElement = elementById2('capview');
  if (!cachedElement) return;
  if (clientGameState.solo) {
    cachedElement.innerHTML =
      '<p class="dim">Friends, the Armada and trading are for online games.</p>';
    return;
  }
  const subscriptions = [
    ['friends', 'FRIENDS'],
    ['dm', 'MESSAGES'],
    ['armada', 'ARMADA'],
    ['trade', 'TRADE'],
  ];
  const unreadCount = Object.values(clientGameState.unread).reduce(
    (firstValue, secondValue) => firstValue + secondValue,
    0,
  );
  let height = `<div class="itabs capsub">${subscriptions.map(([entryKey, count]) => `<button class="btn sm ${clientGameState.ctabSub === entryKey ? 'on' : ''}" data-cs="${entryKey}">${count}${entryKey === 'dm' && unreadCount ? ` (${unreadCount})` : ''}${entryKey === 'friends' && clientGameState.social && clientGameState.social.inReq.length ? ` (${clientGameState.social.inReq.length})` : ''}</button>`).join('')}</div>`;
  height += duelBox();
  height +=
    clientGameState.ctabSub === 'friends'
      ? friendsHtml()
      : clientGameState.ctabSub === 'dm'
        ? dmHtml()
        : clientGameState.ctabSub === 'armada'
          ? armadaHtml()
          : tradeHtml();
  const keep = elementById2('dmin') ? elementById2('dmin').value : null,
    focus = document.activeElement && document.activeElement.id;
  if (clientGameState.views)
    clientGameState.views.replace(
      cachedElement,
      height,
      'captains:' + (clientGameState.ctabSub || 'online'),
    );
  else cachedElement.innerHTML = height;
  if (keep !== null && elementById2('dmin')) elementById2('dmin').value = keep;
  if (focus && elementById2(focus)) elementById2(focus).focus();
  const cachedElement2 = elementById2('dmlog');
  if (cachedElement2) cachedElement2.scrollTop = cachedElement2.scrollHeight;
}

/**
 * Renders the active duel banner or incoming challenge acceptance box.
 * @returns {string} HTML markup
 */
function duelBox(): string {
  const duel2 = clientGameState.you!.duel;
  if (!duel2) return '';
  if (duel2.invite)
    return `<div class="evbox inv"><b>${escapeHtml2(duel2.invite.from)}</b> challenges ${duel2.invite.armada ? 'your Armada to an <b>Armada Duel</b>' : 'you to a <b>duel</b>'}. A fight to disabled; nobody loses a ship.<div style="margin-top:4px"><button class="btn sm" data-cact="duelok">ACCEPT</button> <button class="btn sm" data-cact="duelno">DECLINE</button></div></div>`;
  return `<div class="evbox inv"><b>${duel2.armada ? 'ARMADA DUEL' : 'DUEL'}</b> ${duel2.on ? '· weapons free' : '· starting'} · against ${escapeHtml2(duel2.foes.join(', '))}<div class="dim small">It ends at disabled, or as a draw after ${DUEL.minutes} minutes. Leaving the system or landing counts as yielding.</div><button class="btn sm" data-cact="yield">YIELD</button></div>`;
}

/**
 * Renders the FRIENDS sub-tab (targeted captain actions, friend requests, friends list, privacy).
 * @returns {string} HTML markup
 */
function friendsHtml(): string {
  const socialState = clientGameState.social;
  if (!socialState) return '<p class="dim">Loading...</p>';
  let height = '';
  const time =
      clientGameState.view &&
      clientGameState.target &&
      clientGameState.ents.get(clientGameState.target),
    targetName =
      time && time.fl & 16 && !systemsById[clientGameState.sys!].arena
        ? String(time.name || '')
        : '';
  if (targetName) {
    const fraction = socialState.friends.some((friendEntry) => friendEntry.name === targetName);
    height += `<div class="evbox"><div class="dim small">TARGETED CAPTAIN</div><b>${escapeHtml2(targetName)}</b><div class="frbtn" style="margin-left:0">${fraction ? '' : `<button class="btn sm" data-cact="fadd2" data-n="${escapeHtml2(targetName)}">ADD FRIEND</button>`} <button class="btn sm" data-cact="ainv" data-n="${escapeHtml2(targetName)}">INVITE TO ARMADA</button> ${isAlly(time) ? '' : `<button class="btn sm" data-cact="duel" data-n="${escapeHtml2(targetName)}">DUEL</button>`} <button class="btn sm" data-cact="dm" data-n="${escapeHtml2(targetName)}">MESSAGE</button></div></div>`;
  }
  height += `<div class="rrow"><input id="fadd" placeholder="Captain name" maxlength="20"><button class="btn sm" data-cact="fadd">ADD FRIEND</button></div>`;
  if (socialState.inReq.length)
    height +=
      '<div class="sect">FRIEND REQUESTS</div>' +
      socialState.inReq
        .map(
          (count) =>
            `<div class="kv"><span>${escapeHtml2(count)}</span><span><button class="btn sm" data-cact="facc" data-n="${escapeHtml2(count)}">ACCEPT</button> <button class="btn sm" data-cact="fdec" data-n="${escapeHtml2(count)}">DECLINE</button></span></div>`,
        )
        .join('');
  height += `<div class="sect">FRIENDS (${socialState.friends.length})</div>`;
  height += socialState.friends.length
    ? socialState.friends
        .map(
          (
            friendEntry,
          ) => `<div class="frow"><div class="kv"><span>${presenceIndicators[friendEntry.status]} <b>${escapeHtml2(friendEntry.name)}</b></span><span class="dim small">${friendEntry.status === 'offline' ? (friendEntry.last ? 'seen ' + elapsedTime(friendEntry.last) : 'offline') : friendEntry.status === 'away' ? 'away' : ''}${friendEntry.sys ? ` · ${friendEntry.sysId ? `<a href="#" data-cact="plot" data-sys="${escapeHtml2(friendEntry.sysId)}">${escapeHtml2(friendEntry.sys)}</a>` : escapeHtml2(friendEntry.sys)}` : ''}</span></div>
      <div class="frbtn"><button class="btn sm" data-cact="dm" data-n="${escapeHtml2(friendEntry.name)}">MESSAGE</button>${friendEntry.status !== 'offline' ? ` <button class="btn sm" data-cact="ainv" data-n="${escapeHtml2(friendEntry.name)}">INVITE</button>` : ''}${friendEntry.status !== 'offline' && clientGameState.landed && clientGameState.landed!.site && clientGameState.landed!.site.own ? ` <button class="btn sm" data-cact="topen" data-n="${escapeHtml2(friendEntry.name)}">TRADE</button>` : ''}${friendEntry.status !== 'offline' && clientGameState.view ? ` <button class="btn sm" data-cact="duel" data-n="${escapeHtml2(friendEntry.name)}">DUEL</button>` : ''} <button class="btn sm" data-cact="fdel" data-n="${escapeHtml2(friendEntry.name)}">REMOVE</button></div></div>`,
        )
        .join('')
    : '<p class="dim small">No friends yet. Add a captain by name, or from the captains online list at Quantum Station.</p>';
  if (socialState.outReq.length)
    height +=
      '<div class="sect">SENT REQUESTS</div>' +
      socialState.outReq
        .map(
          (count) =>
            `<div class="kv"><span class="dim">${escapeHtml2(count)}</span><span><button class="btn sm" data-cact="fcan" data-n="${escapeHtml2(count)}">CANCEL</button></span></div>`,
        )
        .join('');
  height += `<div class="sect">PRIVACY</div><label class="small"><input type="checkbox" id="pdmall" ${socialState.dmAll ? 'checked' : ''}> Take messages from captains who are not my friends</label><br><label class="small"><input type="checkbox" id="phide" ${socialState.hideSys ? 'checked' : ''}> Hide my location from friends</label>`;
  if (socialState.blocks.length)
    height +=
      '<div class="sect">BLOCKED</div>' +
      socialState.blocks
        .map(
          (count) =>
            `<div class="kv"><span class="dim">${escapeHtml2(count)}</span><span><button class="btn sm" data-cact="unblock" data-n="${escapeHtml2(count)}">UNBLOCK</button></span></div>`,
        )
        .join('');
  return height;
}
function dmHtml() {
  const sort2 = Object.keys(clientGameState.dms).sort(
    (firstValue, secondValue) =>
      ((clientGameState.dms[secondValue].at(-1) || {}).t || 0) -
      ((clientGameState.dms[firstValue].at(-1) || {}).t || 0),
  );
  if (clientGameState.dmWith) {
    clientGameState.unread[clientGameState.dmWith] = 0;
    badge();
    const list = clientGameState.dms[clientGameState.dmWith] || [],
      friendEntry =
        clientGameState.social &&
        clientGameState.social.friends.find(
          (friendEntry) => friendEntry.name === clientGameState.dmWith,
        );
    return `<div class="kv"><span><a href="#" data-cact="dmback" style="color:#d88">&lsaquo; all</a> &nbsp;${friendEntry ? presenceIndicators[friendEntry.status] : ''} <b>${escapeHtml2(clientGameState.dmWith)}</b></span><span><button class="btn sm" data-cact="block" data-n="${escapeHtml2(clientGameState.dmWith)}">BLOCK</button></span></div>
      <div class="dmlog" id="dmlog">${list.map((directMessage) => `<div class="dm ${directMessage.from === clientGameState.myName ? 'me' : ''}"><span class="dim small">${new Date(directMessage.t).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}${directMessage.off ? ' · delivered when they log in' : ''}</span><div>${escapeHtml2(directMessage.msg)}</div></div>`).join('') || '<p class="dim small">No messages yet. Say hello.</p>'}</div>
      <div class="rrow"><input id="dmin" placeholder="Message ${escapeHtml2(clientGameState.dmWith)} (Enter)" maxlength="400"><button class="btn sm" data-cact="dmsend">SEND</button></div>`;
  }
  return (
    `<div class="dim small" style="margin:4px 0">Message a friend from the FRIENDS list, or type <b>/w name message</b> in chat. Messages to offline captains are delivered when they log in.</div>` +
    (sort2.length
      ? sort2
          .map((count) => {
            const last: Partial<DirectMessage> = clientGameState.dms[count].at(-1) || {};
            return `<div class="it dmrow" data-cact="dm" data-n="${escapeHtml2(count)}"><div class="n"><div><b>${escapeHtml2(count)}</b>${clientGameState.unread[count] ? ` <span class="pill on">${clientGameState.unread[count]} new</span>` : ''}</div><div class="s">${escapeHtml2((last.from === clientGameState.myName ? 'You: ' : '') + (last.msg || '')).slice(0, 70)}</div></div></div>`;
          })
          .join('')
      : '<p class="dim small">No conversations yet.</p>')
  );
}
function armadaHtml() {
  const armada2 = clientGameState.you!.armada,
    myName2 = clientGameState.myName;
  let height = '';
  if (armada2 && armada2.invites && armada2.invites.length)
    height +=
      '<div class="sect" style="margin-top:4px">INVITES</div>' +
      armada2.invites
        .map(
          (positionX) =>
            `<div class="kv"><span><b>${escapeHtml2(positionX.name)}</b> <span class="dim small">led by ${escapeHtml2(positionX.leader)} · ${positionX.n}/${ARMADA.max}</span></span><span><button class="btn sm" data-cact="aacc" data-id="${escapeHtml2(positionX.id)}">JOIN</button> <button class="btn sm" data-cact="adec" data-id="${escapeHtml2(positionX.id)}">DECLINE</button></span></div>`,
        )
        .join('');
  if (!armada2 || armada2.none) {
    return (
      height +
      `<div class="sect">FORM AN ARMADA</div><div class="rrow"><input id="aname" placeholder="Armada name (optional)" maxlength="24"><button class="btn sm" data-cact="aform">FORM</button></div>
      <div class="rrow"><input id="ainv" placeholder="Captain online (creates Armada)" maxlength="20"><button class="btn sm" data-cact="ainv2">INVITE</button></div>
      <div class="dim small">An Armada is a short co-op group of up to ${ARMADA.max} captains, each with their own wingmates. Members and their wingmates can't hurt each other and show in green. You get a private chat (/a), +5% shield recharge and bounties while another member shares your system, a share of each other's bounties and kill credit, Armada contracts, co-op Holdouts, and a rescue window if your ship goes down. It disbands when everyone has been offline for ${ARMADA.idleMin} minutes.</div>`
    );
  }
  const lead = armada2.leader === myName2;
  height += `<div class="sect" style="margin-top:4px">${escapeHtml2(armada2.name)} <span class="dim small">${armada2.members!.length}/${armada2.max}</span></div>`;
  height += armada2
    .members!.map((message) => {
      const live = liveMember(message.name);
      return `<div class="frow"><div class="kv"><span>${message.online ? presenceIndicators.online : presenceIndicators.offline} <b style="color:${message.name === myName2 ? '#ddd' : '#7af0a0'}">${escapeHtml2(message.name)}</b>${message.name === armada2.leader ? ' <span class="dim small">leader</span>' : ''}</span><span class="dim small">${escapeHtml2(message.hull)}${message.sys ? ` · ${message.sysId ? `<a href="#" data-cact="plot" data-sys="${escapeHtml2(message.sysId)}">${escapeHtml2(message.sys)}</a>` : escapeHtml2(message.sys)}` : ''}${message.landed ? ' · landed' : ''}</span></div>
      ${live ? `<div class="bars2"><div class="bar thin"><i style="width:${live.sh}%"></i></div><div class="bar thin"><i class="ar" style="width:${live.ar}%"></i></div></div>` : ''}
      ${message.name !== myName2 ? `<div class="frbtn"><button class="btn sm" data-cact="dm" data-n="${escapeHtml2(message.name)}">MESSAGE</button>${message.online && clientGameState.landed && clientGameState.landed!.site && clientGameState.landed!.site.own ? ` <button class="btn sm" data-cact="topen" data-n="${escapeHtml2(message.name)}">TRADE</button>` : ''}${lead ? ` <button class="btn sm" data-cact="alead" data-n="${escapeHtml2(message.name)}">MAKE LEADER</button> <button class="btn sm" data-cact="akick" data-n="${escapeHtml2(message.name)}">REMOVE</button>` : ''}</div>` : ''}</div>`;
    })
    .join('');
  if (armada2.pending && armada2.pending.length)
    height += `<div class="dim small">Invited: ${armada2.pending.map(escapeHtml2).join(', ')}</div>`;
  if (armada2.members!.length + (armada2.pending || []).length < armada2.max!)
    height += `<div class="rrow"><input id="ainv" placeholder="Invite any captain online, by name" maxlength="20"><button class="btn sm" data-cact="ainv2">INVITE</button></div>`;
  height += `<div class="rrow"><button class="btn sm" data-cact="rally" title="Plot a course to you for every member">📣 CALL THE ARMADA TO ME</button></div>`;
  height += lead
    ? '<div class="dim small">You lead this Armada. Other captains enable Follow the Leader here; you fly normally. Invite, JOIN, then Follow — no friend request needed.</div>'
    : `<label class="small"><input type="checkbox" id="afollow" data-cact="afollow" ${armada2.follow ? 'checked' : ''}> Follow the Leader (V formation + jumps)</label><div class="dim small">JOIN does not enable Follow: opt in here. Both ships must be in flight in the same system. Your ship needs its own jump fuel and route access. Manual flight or weapons input turns Follow off. Combat Assist takes priority. Re-enable after reconnecting or a leader change.</div>`;
  if (lead && clientGameState.view) {
    const time = clientGameState.target && clientGameState.ents.get(clientGameState.target),
      targetName = time && time.fl & 16 ? String(time.name || '') : '';
    height += `<div class="sect">ARMADA DUEL</div><div class="dim small">Target another Armada's leader in this system to challenge their Armada: every member here fights for their side, to disabled, nothing lost.</div>${targetName && !isAlly(time) ? `<button class="btn sm" data-cact="aduel" data-n="${escapeHtml2(targetName)}">CHALLENGE ${escapeHtml2(targetName)}'S ARMADA</button>` : '<p class="dim small">No captain targeted.</p>'}`;
  }
  height += `<div style="margin-top:8px">${lead ? '<button class="btn sm" data-cact="arename">RENAME</button> ' : ''}<button class="btn sm" data-cact="aleave">LEAVE ARMADA</button></div>`;
  return height;
}
function liveMember(name: string) {
  for (const renderEntity of clientGameState.ents.values())
    if (renderEntity.fl & 16 && renderEntity.name === name)
      return { sh: renderEntity.sh || 0, ar: renderEntity.ar || 0 };
  return null;
}
function tradeItems() {
  const playerPayload = clientGameState.you!,
    result = [];
  for (const [captainId, count] of Object.entries(playerPayload.cargo || {}))
    if (count > 0) {
      const commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === captainId);
      result.push([
        `cargo:${captainId}`,
        `${commodityDef ? commodityDef.name : captainId} (hold)`,
        count,
      ]);
    }
  for (const mATERIALS of MATERIALS)
    (playerPayload.mats[mATERIALS] || []).forEach((count, game) => {
      if (count > 0)
        result.push([`mat:${mATERIALS}:${game}`, `${mATERIALS} crate ${GRADES[game]}`, count]);
    });
  for (const [identifier, count] of Object.entries(playerPayload.bp || {}))
    if (count > 0 && clientGameState.A!.ships[identifier])
      result.push([
        `bp:${identifier}`,
        `${clientGameState.A!.ships[identifier].name} blueprints`,
        count,
      ]);
  for (const [identifier, count] of Object.entries(playerPayload.parts || {}))
    if (count > 0 && clientGameState.A!.ships[identifier])
      result.push([
        `parts:${identifier}`,
        `${clientGameState.A!.ships[identifier].name} parts`,
        count,
      ]);
  return result;
}
function itemName(entryKey: string) {
  const [kind, firstValue, secondValue] = entryKey.split(':');
  if (kind === 'cargo') {
    const commodityDef = COMMODITIES.find((commodityDef) => commodityDef.id === firstValue);
    return `t ${commodityDef ? commodityDef.name : firstValue}`;
  }
  if (kind === 'mat') return `${firstValue} crate ${GRADES[+secondValue]}`;
  if (kind === 'bp')
    return `${clientGameState.A!.ships[firstValue] ? clientGameState.A!.ships[firstValue].name : firstValue} blueprints`;
  if (kind === 'parts')
    return `${clientGameState.A!.ships[firstValue] ? clientGameState.A!.ships[firstValue].name : firstValue} parts`;
  return entryKey;
}
function offerList(tradeOffer: TradeOffer | null | undefined) {
  const rows = [];
  if (tradeOffer && tradeOffer.credits) rows.push(`${credits(tradeOffer.credits)} credits`);
  for (const [entryKey, count] of Object.entries((tradeOffer && tradeOffer.items) || {}))
    rows.push(`${count} ${itemName(entryKey)}`);
  return rows.length
    ? rows.map((radius) => `<div>${escapeHtml2(radius)}</div>`).join('')
    : '<div class="dim">nothing yet</div>';
}
function tradeHtml() {
  const tradeState = clientGameState.trade,
    atHome =
      clientGameState.landed && clientGameState.landed!.site && clientGameState.landed!.site.own;
  if (!tradeState) {
    return (
      `<div class="dim small" style="margin:6px 0">Trade credits, goods, crates, blueprints and parts with friends and Armada members. Both captains must be docked at their <b>own</b> Personal Station; nobody docks at anyone else's.</div>` +
      (atHome
        ? `<div class="rrow"><input id="tname" placeholder="Captain to trade with" maxlength="20"><button class="btn sm" data-cact="topen2">OPEN TRADE</button></div>`
        : '<p class="dim small">Dock at your own Personal Station to trade.</p>')
    );
  }
  const mine =
    clientGameState.tdraft ||
    (clientGameState.tdraft = JSON.parse(JSON.stringify(tradeState.mine || {})));
  const join2 = tradeItems()
    .map(
      ([entryKey, count, maximum]) =>
        `<option value="${escapeHtml2(entryKey)}">${escapeHtml2(count)} · ${maximum}</option>`,
    )
    .join('');
  return `<div class="sect" style="margin-top:4px">TRADE WITH ${escapeHtml2(tradeState.with).toUpperCase()}</div>
    <div class="tgrid"><div><div class="dim small">YOU GIVE ${tradeState.lock.me ? '🔒' : ''}${tradeState.ok.me ? ' ✓' : ''}</div>${offerList(tradeState.mine)}</div><div><div class="dim small">THEY GIVE ${tradeState.lock.them ? '🔒' : ''}${tradeState.ok.them ? ' ✓' : ''}</div>${offerList(tradeState.theirs)}</div></div>
    ${
      tradeState.lock.me
        ? ''
        : `<div class="sect">YOUR OFFER</div>
      <div class="rrow"><input id="tcr" type="number" min="0" placeholder="credits" value="${mine.credits || ''}"><span class="dim small">${Math.round(TRADE.fee * 100)}% fee on credits</span></div>
      <div class="rrow"><select id="titem">${join2 || '<option value="">(nothing to trade)</option>'}</select><input id="tqty" type="number" min="1" value="1" style="width:60px"><button class="btn sm" data-cact="tadd">ADD</button></div>
      ${Object.entries(mine.items || {})
        .map(
          ([entryKey, count]) =>
            `<div class="kv"><span>${String(count)} ${escapeHtml2(itemName(entryKey))}</span><span><button class="btn sm" data-cact="tdel" data-k="${escapeHtml2(entryKey)}">✕</button></span></div>`,
        )
        .join('')}
      <button class="btn sm" data-cact="tsend">UPDATE OFFER</button>`
    }
    <div style="margin-top:8px">${tradeState.lock.me ? '<button class="btn sm" data-cact="tunlock">UNLOCK</button>' : '<button class="btn sm" data-cact="tlock">LOCK OFFER</button>'} ${tradeState.lock.me && tradeState.lock.them && !tradeState.ok.me ? '<button class="btn sm" data-cact="tok">CONFIRM TRADE</button>' : ''} <button class="btn sm" data-cact="tcancel">CANCEL</button></div>
    <div class="dim small">Both sides lock their offer, then both confirm. Any change unlocks both. Goods you receive go into your hold, or exchange storage if it is full.</div>`;
}

// ------------------------------------------------------------------ clicks
function addFriend() {
  const count = elementById2('fadd') && elementById2('fadd').value.trim();
  if (count) send({ t: 'social', op: 'add', name: count });
}
function sendDm() {
  const value2 = elementById2('dmin') && elementById2('dmin').value.trim();
  if (!value2 || !clientGameState.dmWith) return;
  send({ t: 'social', op: 'dm', name: clientGameState.dmWith, msg: value2 });
  elementById2('dmin').value = '';
}
export function openDm(name: string) {
  clientGameState.ctabSub = 'dm';
  clientGameState.dmWith = name;
  renderCaptains();
}
function onClick(mouseEvent: MouseEvent) {
  const htmlElement = (mouseEvent.target as HTMLInputElement).closest<HTMLElement>('[data-cs]');
  if (htmlElement) {
    clientGameState.ctabSub = htmlElement.dataset.cs!;
    if (clientGameState.ctabSub !== 'dm') clientGameState.dmWith = null;
    renderCaptains();
    return;
  }
  const htmlElement2 = (mouseEvent.target as HTMLInputElement).closest<HTMLElement>('[data-cact]');
  if (!htmlElement2) return;
  if (htmlElement2.tagName === 'A') mouseEvent.preventDefault();
  const domStringMap = htmlElement2.dataset,
    count = domStringMap.n;
  switch (domStringMap.cact) {
    case 'fadd':
      addFriend();
      break;
    case 'fadd2':
      send({ t: 'social', op: 'add', name: count });
      break;
    case 'facc':
      send({ t: 'social', op: 'accept', name: count });
      break;
    case 'fdec':
      send({ t: 'social', op: 'decline', name: count });
      break;
    case 'fcan':
      send({ t: 'social', op: 'cancel', name: count });
      break;
    case 'fdel':
      showConfirmation(`Remove ${count} from your friends?`, () =>
        send({ t: 'social', op: 'remove', name: count }),
      );
      break;
    case 'block':
      showConfirmation(
        `Block ${count}? You won't get their messages, requests, invites or chat.`,
        () => {
          send({ t: 'social', op: 'block', name: count });
          clientGameState.dmWith = null;
        },
      );
      break;
    case 'unblock':
      send({ t: 'social', op: 'unblock', name: count });
      break;
    case 'dm':
      openDm(count!);
      break;
    case 'dmback':
      clientGameState.dmWith = null;
      renderCaptains();
      break;
    case 'dmsend':
      sendDm();
      break;
    case 'plot':
      plot(domStringMap.sys!);
      toast(
        `Course plotted to ${systemsById[domStringMap.sys!] ? systemsById[domStringMap.sys!].name : domStringMap.sys}.`,
      );
      break;
    case 'aform':
      send({
        t: 'armada',
        op: 'form',
        name: elementById2('aname') ? elementById2('aname').value.trim() : '',
      });
      break;
    case 'ainv':
      send({ t: 'armada', op: 'invite', name: count });
      break;
    case 'ainv2': {
      const value2 = elementById2('ainv') && elementById2('ainv').value.trim();
      if (value2) send({ t: 'armada', op: 'invite', name: value2 });
      break;
    }
    case 'aacc':
      send({ t: 'armada', op: 'accept', id: domStringMap.id });
      break;
    case 'adec':
      send({ t: 'armada', op: 'decline', id: domStringMap.id });
      break;
    case 'aleave':
      showConfirmation('Leave your Armada?', () => send({ t: 'armada', op: 'leave' }));
      break;
    case 'akick':
      showConfirmation(`Remove ${count} from the Armada?`, () =>
        send({ t: 'armada', op: 'kick', name: count }),
      );
      break;
    case 'alead':
      send({ t: 'armada', op: 'lead', name: count });
      break;
    case 'arename': {
      const prompt2 = prompt(
        'New name for the Armada (3-24 characters):',
        clientGameState.you!.armada!.name,
      );
      if (prompt2) send({ t: 'armada', op: 'rename', name: prompt2.trim() });
      break;
    }
    case 'rally':
      send({ t: 'armada', op: 'rally' });
      break;
    case 'afollow':
      send({ t: 'armada', op: 'follow', on: (htmlElement2 as HTMLInputElement).checked });
      break;
    case 'aduel':
      showConfirmation(
        `Challenge ${count}'s Armada to an Armada Duel? Every member in this system fights, to disabled. Nobody loses a ship.`,
        () => send({ t: 'duel', op: 'challenge', name: count, armada: true }),
      );
      break;
    case 'duel':
      showConfirmation(
        `Challenge ${count} to a duel? A fight to disabled; nobody loses a ship.`,
        () => send({ t: 'duel', op: 'challenge', name: count }),
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
      send({ t: 'trade2', op: 'open', name: count });
      break;
    case 'topen2': {
      const value3 = elementById2('tname') && elementById2('tname').value.trim();
      if (value3) send({ t: 'trade2', op: 'open', name: value3 });
      break;
    }
    case 'tadd': {
      const value4 = elementById2('titem').value,
        quantity = Math.max(1, +elementById2('tqty').value || 1);
      if (!value4) break;
      const tradeOffer = clientGameState.tdraft || (clientGameState.tdraft = {});
      tradeOffer.items = tradeOffer.items || {};
      tradeOffer.items[value4] = quantity;
      tradeOffer.credits = Math.max(0, +elementById2('tcr').value || 0);
      renderCaptains();
      break;
    }
    case 'tdel': {
      const tradeOffer = clientGameState.tdraft;
      if (tradeOffer && tradeOffer.items) delete tradeOffer.items[domStringMap.k!];
      renderCaptains();
      break;
    }
    case 'tsend': {
      const tradeOffer = clientGameState.tdraft || {};
      tradeOffer.credits = Math.max(0, +elementById2('tcr').value || 0);
      send({ t: 'trade2', op: 'offer', give: tradeOffer });
      break;
    }
    case 'tlock': {
      const tradeOffer = clientGameState.tdraft || {};
      tradeOffer.credits = Math.max(
        0,
        +(elementById2('tcr') ? elementById2('tcr').value : tradeOffer.credits!) || 0,
      );
      send({ t: 'trade2', op: 'offer', give: tradeOffer });
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
      clientGameState.tdraft = null;
      break;
  }
}
export function tradeClosed() {
  clientGameState.tdraft = null;
}
