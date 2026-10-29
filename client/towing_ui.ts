import type { MiningUIOptions } from './mining_ui.ts';
import type { TowRequest } from '../server/towing-contracts.ts';

import { STELLARS } from '../shared/galaxy.ts';
export function initTowingUI({
  G: clientGameState,
  send,
  bound,
  label,
  blocked,
  towAudio = () => {},
  root,
}: MiningUIOptions & { root: HTMLElement }) {
  const panel = document.createElement('div');
  panel.id = 'towcontrols';
  panel.style.maxWidth = 'min(700px,90vw)';
  panel.style.whiteSpace = 'normal';
  const status = document.createElement('div');
  status.id = 'towstatus';
  status.setAttribute('role', 'status');
  const select = document.createElement('select');
  select.id = 'towselect';
  select.setAttribute('aria-label', 'Motherlode selection');
  select.onchange = () => {
    clientGameState.towTarget = Number(select.value);
  };
  const toggle = document.createElement('button');
  toggle.id = 'towtoggle';
  toggle.className = 'btn sm';
  const port = document.createElement('select');
  port.id = 'towport';
  port.setAttribute('aria-label', 'Accepted delivery port');
  const deliver = document.createElement('button');
  deliver.id = 'towdeliver';
  deliver.className = 'btn sm';
  deliver.textContent = 'Deliver load';
  const recipient = document.createElement('input');
  recipient.id = 'towrecipient';
  recipient.placeholder = 'Nearby captain name';
  recipient.setAttribute('aria-label', 'Transfer recipient');
  recipient.style.width = '160px';
  const offer = document.createElement('button');
  offer.id = 'towoffer';
  offer.className = 'btn sm';
  offer.textContent = 'OFFER TRANSFER';
  const accept = document.createElement('button');
  accept.id = 'towaccept';
  accept.className = 'btn sm';
  accept.textContent = 'ACCEPT OFFER';
  const help = document.createElement('div');
  help.className = 'small';
  help.textContent =
    'Scan the deposit first. Towing needs a fitted Tow Rig and at least 60 t of hold capacity (built in on the Dredge). Towing limits speed to 60 on a Dredge or 30 on other ships. Bring the load to an ACCEPTS MOTHERLODE marker for automatic delivery at any towing speed. Keep enough hold space; a full hold leaves the load safely detached and reserved at the port. Deliver or detach before landing or jumping. A detached load stays reserved for its owner for 300 seconds of active game time. Delivery gives the material, not extra credits.';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Transfer & towing help';
  details.append(summary, recipient, offer, help);
  panel.append(status, select, toggle, port, deliver, accept, details);
  root.append(panel);
  const wire = () => clientGameState.towing || clientGameState.you?.towing;
  const object = () => {
    const wire2 = wire();
    return wire2?.objects.find(
      (options) => options!.id === (wire2.attached || clientGameState.towTarget),
    );
  };
  function request(operation: TowRequest['op'], extra: Partial<TowRequest> = {}) {
    const object2 = object();
    if (!object2 || blocked() || clientGameState.paused || clientGameState.landed) return false;
    send({ t: 'towing', op: operation, id: object2.id, revision: object2.revision, ...extra });
    return true;
  }
  function invoke(action = 'towToggle') {
    const wire2 = wire();
    if (action === 'towDeliver')
      return wire2?.attached ? request('deliver', { port: port.value }) : false;
    if (action === 'towOffer')
      return wire2?.attached && recipient.value.trim()
        ? request('offer', { to: recipient.value.trim() })
        : false;
    if (action === 'towAccept') {
      const offer = wire2?.offers[0];
      if (
        !offer ||
        blocked() ||
        clientGameState.paused ||
        clientGameState.landed ||
        !clientGameState.view
      )
        return false;
      send({ t: 'towing', op: 'accept', id: offer.id, revision: offer.revision });
      return true;
    }
    return request(wire2?.attached ? 'detach' : 'attach');
  }
  toggle.onclick = () => invoke();
  deliver.onclick = () => invoke('towDeliver');
  offer.onclick = () => invoke('towOffer');
  accept.onclick = () => invoke('towAccept');
  let signature = '',
    portSignature = '';
  function refresh() {
    const wire2 = wire();
    panel.hidden = (!clientGameState.you ||
      clientGameState.landed ||
      !clientGameState.view ||
      !(wire2?.rig || wire2?.attached || wire2?.offers?.length)) as boolean;
    if (!wire2 || panel.hidden) {
      towAudio(false, 0);
      return;
    }
    const load = wire2.objects.find((options) => options!.id === wire2.attached);
    towAudio(
      !!load && !clientGameState.paused,
      load
        ? Math.hypot(load.x - clientGameState.view!.x, load.y - clientGameState.view!.y) / 320
        : 0,
    );
    const visible = wire2.objects.filter(
      (options) => !['delivered', 'destroyed'].includes(options!.status),
    );
    const join2 = visible.map((options) => options!.id + ':' + options!.status).join();
    if (signature !== join2) {
      signature = join2;
      select.replaceChildren(
        ...visible.map((options) => {
          const htmlOptionElement = document.createElement('option');
          htmlOptionElement.value = String(options!.id);
          htmlOptionElement.textContent = `MOTHERLODE ${options!.id} · ${options!.ore} · ${options!.status.toUpperCase()}`;
          return htmlOptionElement;
        }),
      );
    }
    if (!visible.some((options) => options!.id === clientGameState.towTarget))
      clientGameState.towTarget = visible.reduce<(typeof visible)[number] | null>(
        (best, options) =>
          !best ||
          Math.hypot(options!.x - clientGameState.view!.x, options!.y - clientGameState.view!.y) <
            Math.hypot(best.x - clientGameState.view!.x, best.y - clientGameState.view!.y)
            ? options
            : best,
        null,
      )?.id;
    select.value = String(wire2.attached || clientGameState.towTarget || '');
    const object2 = object(),
      ports = object2?.ports || [],
      join3 = ports.join();
    if (join3 !== portSignature) {
      portSignature = join3;
      port.replaceChildren(
        ...ports.map((identifier) => {
          const htmlOptionElement = document.createElement('option');
          htmlOptionElement.value = identifier;
          htmlOptionElement.textContent = STELLARS[identifier]?.name || identifier;
          return htmlOptionElement;
        }),
      );
    }
    status.textContent = object2
      ? `${object2.ore} motherlode · ${object2.mass ?? '?'} t. ${object2.status === 'detached' ? `Reserved for ${object2.owner || 'owner'}: ${Math.max(0, Math.ceil(object2.graceUntil - wire2.now))}s remaining. ` : ''}${wire2.attached ? `Towing · speed limit ${wire2.cap}. Approach an ACCEPTS MOTHERLODE marker for automatic delivery.` : object2.revealed ? 'Approach the deposit to attach.' : 'Scan to reveal its yield and delivery ports.'}`
      : 'No large deposits nearby. Scan in another field.';
    deliver.textContent = `Deliver now · ${label(bound('towDeliver'))} (also automatic)`;
    offer.textContent = `OFFER TRANSFER · ${label(bound('towOffer'))}`;
    toggle.textContent = `${wire2.attached ? 'DETACH' : 'ATTACH'} · ${label(bound('towToggle'))}`;
    toggle.disabled = (!object2 || blocked() || clientGameState.paused) as boolean;
    deliver.disabled = (!wire2.attached ||
      !ports.length ||
      blocked() ||
      clientGameState.paused) as boolean;
    offer.disabled = (!wire2.attached || blocked() || clientGameState.paused) as boolean;
    toggle.title = clientGameState.paused
      ? 'Resume Solo to use towing.'
      : !object2
        ? 'Scan a deposit to find a tow load.'
        : blocked()
          ? 'Close the open menu or text field first.'
          : '';
    deliver.title = !wire2.attached
      ? 'Attach a load first.'
      : !ports.length
        ? 'Scan the load to find a delivery port.'
        : clientGameState.paused
          ? 'Resume Solo to deliver.'
          : '';
    offer.title = !wire2.attached
      ? 'Attach a load before offering it.'
      : 'The other captain must accept; nothing transfers automatically.';
    accept.hidden = !wire2.offers.length;
    if (wire2.offers.length)
      accept.textContent = `ACCEPT ${wire2.offers[0].from}'S TRANSFER · ${label(bound('towAccept'))}`;
  }
  return { invoke, refresh };
}
