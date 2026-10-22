import { legacyHtml } from './eta-runtime.ts';
import {
  renderCoopUiViewFragment001,
  renderCoopUiViewFragment002,
  renderCoopUiViewFragment003,
  renderCoopUiRenderCaptainsFragment004,
  renderCoopUiRenderCaptainsFragment005,
  renderCoopUiRenderCaptainsFragment006,
  renderCoopUiDuelBoxFragment007,
  renderCoopUiDuelBoxFragment008,
  renderCoopUiDuelBoxFragment009,
  renderCoopUiDuelBoxFragment010,
  renderCoopUiFriendsHtmlFragment011,
  renderCoopUiFriendsHtmlFragment012,
  renderCoopUiFriendsHtmlFragment013,
  renderCoopUiFriendsHtmlFragment014,
  renderCoopUiFriendsHtmlFragment015,
  renderCoopUiFriendsHtmlFragment016,
  renderCoopUiFriendsHtmlFragment017,
  renderCoopUiFriendsHtmlFragment018,
  renderCoopUiFriendsHtmlFragment019,
  renderCoopUiFriendsHtmlFragment020,
  renderCoopUiFriendsHtmlFragment021,
  renderCoopUiFriendsHtmlFragment022,
  renderCoopUiFriendsHtmlFragment023,
  renderCoopUiFriendsHtmlFragment024,
  renderCoopUiFriendsHtmlFragment025,
  renderCoopUiFriendsHtmlFragment026,
  renderCoopUiFriendsHtmlFragment027,
  renderCoopUiFriendsHtmlFragment028,
  renderCoopUiFriendsHtmlFragment029,
  renderCoopUiDmHtmlFragment030,
  renderCoopUiDmHtmlFragment031,
  renderCoopUiDmHtmlFragment032,
  renderCoopUiDmHtmlFragment033,
  renderCoopUiDmHtmlFragment034,
  renderCoopUiDmHtmlFragment035,
  renderCoopUiDmHtmlFragment036,
  renderCoopUiArmadaHtmlFragment037,
  renderCoopUiArmadaHtmlFragment038,
  renderCoopUiArmadaHtmlFragment039,
  renderCoopUiArmadaHtmlFragment040,
  renderCoopUiArmadaHtmlFragment041,
  renderCoopUiArmadaHtmlFragment042,
  renderCoopUiArmadaHtmlFragment043,
  renderCoopUiArmadaHtmlFragment044,
  renderCoopUiArmadaHtmlFragment045,
  renderCoopUiArmadaHtmlFragment046,
  renderCoopUiArmadaHtmlFragment047,
  renderCoopUiArmadaHtmlFragment048,
  renderCoopUiArmadaHtmlFragment049,
  renderCoopUiArmadaHtmlFragment050,
  renderCoopUiArmadaHtmlFragment051,
  renderCoopUiArmadaHtmlFragment052,
  renderCoopUiArmadaHtmlFragment053,
  renderCoopUiArmadaHtmlFragment054,
  renderCoopUiArmadaHtmlFragment055,
  renderCoopUiArmadaHtmlFragment056,
  renderCoopUiArmadaHtmlFragment057,
  renderCoopUiOfferListFragment058,
  renderCoopUiOfferListFragment059,
  renderCoopUiTradeHtmlFragment060,
  renderCoopUiTradeHtmlFragment061,
  renderCoopUiTradeHtmlFragment062,
  renderCoopUiTradeHtmlFragment063,
  renderCoopUiTradeHtmlFragment064,
  renderCoopUiTradeHtmlFragment065,
  renderCoopUiTradeHtmlFragment066,
  renderCoopUiTradeHtmlFragment067,
  renderCoopUiTradeHtmlFragment068,
  renderCoopUiTradeHtmlFragment069,
  renderCoopUiTradeHtmlFragment070,
} from './eta-templates.ts';
import type { SocialMessage } from './protocol.ts';
import { elementById } from './dom.ts';
import type { NetworkMessage } from '../server/message-registry.ts';
import type { ClientGameState } from './main.ts';
import type { RenderShip } from './render.ts';
export type CoopHelpers = {
  /** Show toast notification function */
  toast: (message: string) => void;

  /** Prompt confirmation modal function */
  ask: (message: string, onYes: () => void) => void;

  /** Plot course function */
  plot: (systemId: string) => void;
};
export type DirectMessage = {
  /** Sender captain name */
  from: string;
  /** Message text */
  msg: string;
  /** Timestamp */
  t: number;
  /** Delivered while offline flag */
  off?: boolean;
};
export type FriendEntry = {
  /** Friend captain name */
  name: string;

  /** Online status */
  status: 'online' | 'away' | 'offline';

  /** Last seen timestamp */
  last?: number;

  /** System display name */
  sys?: string;

  /** System ID */
  sysId?: string | null;
};
export type SocialState = {
  /** List of friends */
  friends: FriendEntry[];

  /** Inbound friend request captain names */
  inReq: string[];

  /** Outbound friend request captain names */
  outReq: string[];

  /** Blocked captain names */
  blocks: string[];

  /** Allow messages from non-friends */
  dmAll?: boolean;

  /** Hide current location from friends */
  hideSys?: boolean;
};
export type TradeOffer = {
  /** Credits offered */
  credits?: number;
  /** Items offered */
  items?: Record<string, number>;
};
export type TradeState = {
  /** Other captain name */
  with: string;

  /** Current player offer */
  mine: TradeOffer;

  /** Other captain offer */
  theirs: TradeOffer;

  /** Offer lock states */
  lock: { me: boolean; them: boolean };

  /** Offer confirm states */
  ok: { me: boolean; them: boolean };
};

import { escapeHtml as escapeHtml2 } from './html.ts';
// Quantum Rift: interface: the CAPTAINS companion tab (friends and their status, messages, the Armada,
// trading between Personal Stations, duels), Armada ally detection for the HUD and radar, and follow-the-leader.
import { SYS as systemsById, COMMODITIES, MATERIALS, GRADES } from '../shared/galaxy.ts';
import { ARMADA, TRADE, DUEL } from '../shared/coop.ts';
import { credits } from '../shared/rules.ts';

/**
 * Shorthand helper for document.getElementById.
 * @param id Element ID
 * @returns DOM element or null
 */
const elementById2 = elementById;

/**
 * Formats past timestamp to relative time ago string.
 * @param time Past timestamp in ms
 * @returns Formatted relative time string
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
  online: renderCoopUiViewFragment001(),
  away: renderCoopUiViewFragment002(),
  offline: renderCoopUiViewFragment003(),
};
let clientGameState: ClientGameState;
let send: (message: NetworkMessage) => void;
let toast: CoopHelpers['toast'];
let showConfirmation: CoopHelpers['ask'];
let plot: CoopHelpers['plot'];

/**
 * Initializes the Co-op subsystem, event listeners, and helper callbacks.
 * @param clientGameState2 Shared game state object
 * @param sender Network send message function
 * @param helpers UI helper callbacks
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
 * @param message Message payload received via WebSocket
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
 * @param event Space entity object
 * @returns True if entity is an allied Armada captain or wingmate
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
 */
export function renderCaptains(): void {
  if (!clientGameState.you) return;
  loadDms();
  const cachedElement = elementById2('capview');
  if (!cachedElement) return;
  if (clientGameState.solo) {
    cachedElement.innerHTML = renderCoopUiRenderCaptainsFragment004();
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
  let height = renderCoopUiRenderCaptainsFragment005({
    subscriptionsMap: legacyHtml(
      subscriptions
        .map(([entryKey, count]) =>
          renderCoopUiRenderCaptainsFragment006({
            clientGameStateCtabSub: legacyHtml(clientGameState.ctabSub === entryKey ? 'on' : ''),
            entryKey: legacyHtml(entryKey),
            count: legacyHtml(count),
            entryKey2: legacyHtml(entryKey === 'dm' && unreadCount ? ` (${unreadCount})` : ''),
            entryKey3: legacyHtml(
              entryKey === 'friends' &&
                clientGameState.social &&
                clientGameState.social.inReq.length
                ? ` (${clientGameState.social.inReq.length})`
                : '',
            ),
          }),
        )
        .join(''),
    ),
  });
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
 * @returns HTML markup
 */
function duelBox(): string {
  const duel2 = clientGameState.you!.duel;
  if (!duel2) return '';
  if (duel2.invite)
    return renderCoopUiDuelBoxFragment007({
      duel2InviteFrom: duel2.invite.from,
      duel2InviteArmada: legacyHtml(
        duel2.invite.armada ? renderCoopUiDuelBoxFragment008() : renderCoopUiDuelBoxFragment009(),
      ),
    });
  return renderCoopUiDuelBoxFragment010({
    duel2Armada: legacyHtml(duel2.armada ? 'ARMADA DUEL' : 'DUEL'),
    duel2On: legacyHtml(duel2.on ? '· weapons free' : '· starting'),
    duel2FoesJoin: duel2.foes.join(', '),
    DUELMinutes: legacyHtml(DUEL.minutes),
  });
}

/**
 * Renders the FRIENDS sub-tab (targeted captain actions, friend requests, friends list, privacy).
 * @returns HTML markup
 */
function friendsHtml(): string {
  const socialState = clientGameState.social;
  if (!socialState) return renderCoopUiFriendsHtmlFragment011();
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
    height += renderCoopUiFriendsHtmlFragment012({
      targetName: targetName,
      fraction: legacyHtml(
        fraction ? '' : renderCoopUiFriendsHtmlFragment013({ targetName: targetName }),
      ),
      targetName2: targetName,
      isAlly: legacyHtml(
        isAlly(time) ? '' : renderCoopUiFriendsHtmlFragment014({ targetName: targetName }),
      ),
      targetName3: targetName,
    });
  }
  height += renderCoopUiFriendsHtmlFragment015();
  if (socialState.inReq.length)
    height +=
      renderCoopUiFriendsHtmlFragment016() +
      socialState.inReq
        .map((count) =>
          renderCoopUiFriendsHtmlFragment017({ count: count, count2: count, count3: count }),
        )
        .join('');
  height += renderCoopUiFriendsHtmlFragment018({
    socialStateFriendsLength: legacyHtml(socialState.friends.length),
  });
  height += socialState.friends.length
    ? socialState.friends
        .map((friendEntry) =>
          renderCoopUiFriendsHtmlFragment019({
            presenceIndicators: legacyHtml(presenceIndicators[friendEntry.status]),
            friendEntryName: friendEntry.name,
            friendEntryStatus: legacyHtml(
              friendEntry.status === 'offline'
                ? friendEntry.last
                  ? 'seen ' + elapsedTime(friendEntry.last)
                  : 'offline'
                : friendEntry.status === 'away'
                  ? 'away'
                  : '',
            ),
            friendEntrySys: legacyHtml(
              friendEntry.sys
                ? ` · ${friendEntry.sysId ? renderCoopUiFriendsHtmlFragment020({ friendEntrySysId: friendEntry.sysId, friendEntrySys: friendEntry.sys }) : escapeHtml2(friendEntry.sys)}`
                : '',
            ),
            friendEntryName2: friendEntry.name,
            friendEntryStatus2: legacyHtml(
              friendEntry.status !== 'offline'
                ? renderCoopUiFriendsHtmlFragment021({ friendEntryName: friendEntry.name })
                : '',
            ),
            friendEntryStatus3: legacyHtml(
              friendEntry.status !== 'offline' &&
                clientGameState.landed &&
                clientGameState.landed!.site &&
                clientGameState.landed!.site.own
                ? renderCoopUiFriendsHtmlFragment022({ friendEntryName: friendEntry.name })
                : '',
            ),
            friendEntryStatus4: legacyHtml(
              friendEntry.status !== 'offline' && clientGameState.view
                ? renderCoopUiFriendsHtmlFragment023({ friendEntryName: friendEntry.name })
                : '',
            ),
            friendEntryName3: friendEntry.name,
          }),
        )
        .join('')
    : renderCoopUiFriendsHtmlFragment024();
  if (socialState.outReq.length)
    height +=
      renderCoopUiFriendsHtmlFragment025() +
      socialState.outReq
        .map((count) => renderCoopUiFriendsHtmlFragment026({ count: count, count2: count }))
        .join('');
  height += renderCoopUiFriendsHtmlFragment027({
    socialStateDmAll: legacyHtml(socialState.dmAll ? 'checked' : ''),
    socialStateHideSys: legacyHtml(socialState.hideSys ? 'checked' : ''),
  });
  if (socialState.blocks.length)
    height +=
      renderCoopUiFriendsHtmlFragment028() +
      socialState.blocks
        .map((count) => renderCoopUiFriendsHtmlFragment029({ count: count, count2: count }))
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
    return renderCoopUiDmHtmlFragment030({
      friendEntry: legacyHtml(friendEntry ? presenceIndicators[friendEntry.status] : ''),
      clientGameStateDmWith: clientGameState.dmWith,
      clientGameStateDmWith2: clientGameState.dmWith,
      listMap: legacyHtml(
        list
          .map((directMessage) =>
            renderCoopUiDmHtmlFragment031({
              directMessageFrom: legacyHtml(
                directMessage.from === clientGameState.myName ? 'me' : '',
              ),
              Date: legacyHtml(
                new Date(directMessage.t).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                }),
              ),
              directMessageOff: legacyHtml(
                directMessage.off ? ' · delivered when they log in' : '',
              ),
              directMessageMsg: directMessage.msg,
            }),
          )
          .join('') || renderCoopUiDmHtmlFragment032(),
      ),
      clientGameStateDmWith3: clientGameState.dmWith,
    });
  }
  return (
    renderCoopUiDmHtmlFragment033() +
    (sort2.length
      ? sort2
          .map((count) => {
            const last: Partial<DirectMessage> = clientGameState.dms[count].at(-1) || {};
            return renderCoopUiDmHtmlFragment034({
              count: count,
              count2: count,
              clientGameStateUnread: legacyHtml(
                clientGameState.unread[count]
                  ? renderCoopUiDmHtmlFragment035({
                      clientGameStateUnread: legacyHtml(clientGameState.unread[count]),
                    })
                  : '',
              ),
              lastFrom: legacyHtml(
                escapeHtml2(
                  (last.from === clientGameState.myName ? 'You: ' : '') + (last.msg || ''),
                ).slice(0, 70),
              ),
            });
          })
          .join('')
      : renderCoopUiDmHtmlFragment036())
  );
}
function armadaHtml() {
  const armada2 = clientGameState.you!.armada,
    myName2 = clientGameState.myName;
  let height = '';
  if (armada2 && armada2.invites && armada2.invites.length)
    height +=
      renderCoopUiArmadaHtmlFragment037() +
      armada2.invites
        .map((positionX) =>
          renderCoopUiArmadaHtmlFragment038({
            positionXName: positionX.name,
            positionXLeader: positionX.leader,
            positionXN: legacyHtml(positionX.n),
            ARMADAMax: legacyHtml(ARMADA.max),
            positionXId: positionX.id,
            positionXId2: positionX.id,
          }),
        )
        .join('');
  if (!armada2 || armada2.none) {
    return (
      height +
      renderCoopUiArmadaHtmlFragment039({
        ARMADAMax: legacyHtml(ARMADA.max),
        ARMADAIdleMin: legacyHtml(ARMADA.idleMin),
      })
    );
  }
  const lead = armada2.leader === myName2;
  height += renderCoopUiArmadaHtmlFragment040({
    armada2Name: armada2.name,
    armada2Members: legacyHtml(armada2.members!.length),
    armada2Max: legacyHtml(armada2.max),
  });
  height += armada2
    .members!.map((message) => {
      const live = liveMember(message.name);
      return renderCoopUiArmadaHtmlFragment041({
        messageOnline: legacyHtml(
          message.online ? presenceIndicators.online : presenceIndicators.offline,
        ),
        messageName: legacyHtml(message.name === myName2 ? '#ddd' : '#7af0a0'),
        messageName2: message.name,
        messageName3: legacyHtml(
          message.name === armada2.leader ? renderCoopUiArmadaHtmlFragment042() : '',
        ),
        messageHull: message.hull,
        messageSys: legacyHtml(
          message.sys
            ? ` · ${message.sysId ? renderCoopUiArmadaHtmlFragment043({ messageSysId: message.sysId, messageSys: message.sys }) : escapeHtml2(message.sys)}`
            : '',
        ),
        messageLanded: legacyHtml(message.landed ? ' · landed' : ''),
        live: legacyHtml(
          live
            ? renderCoopUiArmadaHtmlFragment044({
                liveSh: legacyHtml(live.sh),
                liveAr: legacyHtml(live.ar),
              })
            : '',
        ),
        messageName4: legacyHtml(
          message.name !== myName2
            ? renderCoopUiArmadaHtmlFragment045({
                messageName: message.name,
                messageOnline: legacyHtml(
                  message.online &&
                    clientGameState.landed &&
                    clientGameState.landed!.site &&
                    clientGameState.landed!.site.own
                    ? renderCoopUiArmadaHtmlFragment046({ messageName: message.name })
                    : '',
                ),
                lead: legacyHtml(
                  lead
                    ? renderCoopUiArmadaHtmlFragment047({
                        messageName: message.name,
                        messageName2: message.name,
                      })
                    : '',
                ),
              })
            : '',
        ),
      });
    })
    .join('');
  if (armada2.pending && armada2.pending.length)
    height += renderCoopUiArmadaHtmlFragment048({
      armada2PendingMap: legacyHtml(armada2.pending.map(escapeHtml2).join(', ')),
    });
  if (armada2.members!.length + (armada2.pending || []).length < armada2.max!)
    height += renderCoopUiArmadaHtmlFragment049();
  height += renderCoopUiArmadaHtmlFragment050();
  height += lead
    ? renderCoopUiArmadaHtmlFragment051()
    : renderCoopUiArmadaHtmlFragment052({
        armada2Follow: legacyHtml(armada2.follow ? 'checked' : ''),
      });
  if (lead && clientGameState.view) {
    const time = clientGameState.target && clientGameState.ents.get(clientGameState.target),
      targetName = time && time.fl & 16 ? String(time.name || '') : '';
    height += renderCoopUiArmadaHtmlFragment053({
      targetName: legacyHtml(
        targetName && !isAlly(time)
          ? renderCoopUiArmadaHtmlFragment054({ targetName: targetName, targetName2: targetName })
          : renderCoopUiArmadaHtmlFragment055(),
      ),
    });
  }
  height += renderCoopUiArmadaHtmlFragment056({
    lead: legacyHtml(lead ? renderCoopUiArmadaHtmlFragment057() : ''),
  });
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
    ? rows.map((radius) => renderCoopUiOfferListFragment058({ radius: radius })).join('')
    : renderCoopUiOfferListFragment059();
}
function tradeHtml() {
  const tradeState = clientGameState.trade,
    atHome =
      clientGameState.landed && clientGameState.landed!.site && clientGameState.landed!.site.own;
  if (!tradeState) {
    return (
      renderCoopUiTradeHtmlFragment060() +
      (atHome ? renderCoopUiTradeHtmlFragment061() : renderCoopUiTradeHtmlFragment062())
    );
  }
  const mine =
    clientGameState.tdraft ||
    (clientGameState.tdraft = JSON.parse(JSON.stringify(tradeState.mine || {})));
  const join2 = tradeItems()
    .map(([entryKey, count, maximum]) =>
      renderCoopUiTradeHtmlFragment063({
        entryKey: entryKey,
        count: count,
        maximum: legacyHtml(maximum),
      }),
    )
    .join('');
  return renderCoopUiTradeHtmlFragment064({
    tradeStateWith: legacyHtml(escapeHtml2(tradeState.with).toUpperCase()),
    tradeStateLockMe: legacyHtml(tradeState.lock.me ? '🔒' : ''),
    tradeStateOkMe: legacyHtml(tradeState.ok.me ? ' ✓' : ''),
    offerList: legacyHtml(offerList(tradeState.mine)),
    tradeStateLockThem: legacyHtml(tradeState.lock.them ? '🔒' : ''),
    tradeStateOkThem: legacyHtml(tradeState.ok.them ? ' ✓' : ''),
    offerList2: legacyHtml(offerList(tradeState.theirs)),
    tradeStateLockMe2: legacyHtml(
      tradeState.lock.me
        ? ''
        : renderCoopUiTradeHtmlFragment065({
            mineCredits: legacyHtml(mine.credits || ''),
            MathRound: legacyHtml(Math.round(TRADE.fee * 100)),
            join2: legacyHtml(join2 || renderCoopUiTradeHtmlFragment066()),
            ObjectEntries: legacyHtml(
              Object.entries(mine.items || {})
                .map(([entryKey, count]) =>
                  renderCoopUiTradeHtmlFragment067({
                    count: legacyHtml(String(count)),
                    itemName: itemName(entryKey),
                    entryKey: entryKey,
                  }),
                )
                .join(''),
            ),
          }),
    ),
    tradeStateLockMe3: legacyHtml(
      tradeState.lock.me ? renderCoopUiTradeHtmlFragment068() : renderCoopUiTradeHtmlFragment069(),
    ),
    tradeStateLockMe4: legacyHtml(
      tradeState.lock.me && tradeState.lock.them && !tradeState.ok.me
        ? renderCoopUiTradeHtmlFragment070()
        : '',
    ),
  });
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
