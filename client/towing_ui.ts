import type { MiningUIOptions } from './mining_ui.ts';
import type { TowRequest } from '../server/towing-contracts.ts';

import { STELLARS } from '../shared/galaxy.ts';
export function initTowingUI({
  G,
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
    G.towTarget = Number(select.value);
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
  recipient.setAttribute('aria-label', 'Consensual transfer recipient');
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
    'Scan the deposit first. Towing needs a fitted Tow Rig and at least 60 t of hold capacity (built in on the Dredge). Towing limits speed to 60 on a Dredge or 30 on other ships. Bring the load to an ACCEPTS MOTHERLODE marker for automatic delivery at any towing speed. Keep enough hold space; a full hold leaves the load safely detached and reserved at the port. Deliver or detach before landing or jumping. A detached load stays reserved for its owner for 300 seconds of active simulation. Delivery gives the material, not extra credits.';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Transfer & towing help';
  details.append(summary, recipient, offer, help);
  panel.append(status, select, toggle, port, deliver, accept, details);
  root.append(panel);
  const wire = () => G.towing || G.you?.towing;
  const object = () => {
    const w = wire();
    return w?.objects.find((o) => o!.id === (w.attached || G.towTarget));
  };
  function request(op: TowRequest['op'], extra: Partial<TowRequest> = {}) {
    const o = object();
    if (!o || blocked() || G.paused || G.landed) return false;
    send({ t: 'towing', op, id: o.id, revision: o.revision, ...extra });
    return true;
  }
  function invoke(action = 'towToggle') {
    const w = wire();
    if (action === 'towDeliver')
      return w?.attached ? request('deliver', { port: port.value }) : false;
    if (action === 'towOffer')
      return w?.attached && recipient.value.trim()
        ? request('offer', { to: recipient.value.trim() })
        : false;
    if (action === 'towAccept') {
      const x = w?.offers[0];
      if (!x || blocked() || G.paused || G.landed || !G.view) return false;
      send({ t: 'towing', op: 'accept', id: x.id, revision: x.revision });
      return true;
    }
    return request(w?.attached ? 'detach' : 'attach');
  }
  toggle.onclick = () => invoke();
  deliver.onclick = () => invoke('towDeliver');
  offer.onclick = () => invoke('towOffer');
  accept.onclick = () => invoke('towAccept');
  let signature = '',
    portSignature = '';
  function refresh() {
    const w = wire();
    panel.hidden = (!G.you ||
      G.landed ||
      !G.view ||
      !(w?.rig || w?.attached || w?.offers?.length)) as boolean;
    if (!w || panel.hidden) {
      towAudio(false, 0);
      return;
    }
    const load = w.objects.find((o) => o!.id === w.attached);
    towAudio(
      !!load && !G.paused,
      load ? Math.hypot(load.x - G.view!.x, load.y - G.view!.y) / 320 : 0,
    );
    const visible = w.objects.filter((o) => !['delivered', 'destroyed'].includes(o!.status));
    const sig = visible.map((o) => o!.id + ':' + o!.status).join();
    if (signature !== sig) {
      signature = sig;
      select.replaceChildren(
        ...visible.map((o) => {
          const v = document.createElement('option');
          v.value = String(o!.id);
          v.textContent = `MOTHERLODE ${o!.id} · ${o!.ore} · ${o!.status.toUpperCase()}`;
          return v;
        }),
      );
    }
    if (!visible.some((o) => o!.id === G.towTarget))
      G.towTarget = visible.reduce<(typeof visible)[number] | null>(
        (best, o) =>
          !best ||
          Math.hypot(o!.x - G.view!.x, o!.y - G.view!.y) <
            Math.hypot(best.x - G.view!.x, best.y - G.view!.y)
            ? o
            : best,
        null,
      )?.id;
    select.value = String(w.attached || G.towTarget || '');
    const o = object(),
      ports = o?.ports || [],
      ps = ports.join();
    if (ps !== portSignature) {
      portSignature = ps;
      port.replaceChildren(
        ...ports.map((id) => {
          const x = document.createElement('option');
          x.value = id;
          x.textContent = STELLARS[id]?.name || id;
          return x;
        }),
      );
    }
    status.textContent = o
      ? `${o.ore} motherlode · ${o.mass ?? '?'} t. ${o.status === 'detached' ? `Reserved for ${o.owner || 'owner'}: ${Math.max(0, Math.ceil(o.graceUntil - w.now))}s remaining. ` : ''}${w.attached ? `Towing · speed limit ${w.cap}. Approach an ACCEPTS MOTHERLODE marker for automatic delivery.` : o.revealed ? 'Approach the deposit to attach.' : 'Scan to reveal its yield and delivery ports.'}`
      : 'No large deposits nearby. Scan in another field.';
    deliver.textContent = `Deliver now · ${label(bound('towDeliver'))} (also automatic)`;
    offer.textContent = `OFFER TRANSFER · ${label(bound('towOffer'))}`;
    toggle.textContent = `${w.attached ? 'DETACH' : 'ATTACH'} · ${label(bound('towToggle'))}`;
    toggle.disabled = (!o || blocked() || G.paused) as boolean;
    deliver.disabled = (!w.attached || !ports.length || blocked() || G.paused) as boolean;
    offer.disabled = (!w.attached || blocked() || G.paused) as boolean;
    toggle.title = G.paused
      ? 'Resume Solo to use towing.'
      : !o
        ? 'Scan a deposit to find a tow load.'
        : blocked()
          ? 'Close the open menu or text field first.'
          : '';
    deliver.title = !w.attached
      ? 'Attach a load first.'
      : !ports.length
        ? 'Scan the load to find a delivery port.'
        : G.paused
          ? 'Resume Solo to deliver.'
          : '';
    offer.title = !w.attached
      ? 'Attach a load before offering it.'
      : 'The other captain must accept; nothing transfers automatically.';
    accept.hidden = !w.offers.length;
    if (w.offers.length)
      accept.textContent = `ACCEPT ${w.offers[0].from}'S TRANSFER · ${label(bound('towAccept'))} (explicit consent)`;
  }
  return { invoke, refresh };
}
