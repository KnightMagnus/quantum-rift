import { STELLARS } from '/shared/galaxy.js';
export function initTowingUI({ G, send, bound, label, blocked, towAudio = () => {}, root }) {
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
  deliver.textContent = 'DELIVER ONCE';
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
    'Survey first. Tow Rig / ≥60t hold required. Hard cap 60 Dredge / 30 others. No jump/Gateway; deliver or detach before landing. Detached owner grace 300 simulation seconds (offline/paused freezes). No extra credit or fragments.';
  panel.append(status, select, toggle, port, deliver, recipient, offer, accept, help);
  root.append(panel);
  const wire = () => G.towing || G.you?.towing;
  const object = () => {
    const w = wire();
    return w?.objects.find((o) => o.id === (w.attached || G.towTarget));
  };
  function request(op, extra = {}) {
    const o = object();
    if (!o || blocked() || G.paused || G.landed) return false;
    send({ t: 'towing', op, id: o.id, revision: o.revision, ...extra });
    return true;
  }
  function invoke() {
    const w = wire();
    return request(w?.attached ? 'detach' : 'attach');
  }
  toggle.onclick = invoke;
  deliver.onclick = () => request('deliver', { port: port.value });
  offer.onclick = () => request('offer', { to: recipient.value.trim() });
  accept.onclick = () => {
    const x = wire()?.offers[0];
    if (x && !blocked() && !G.paused && !G.landed)
      send({ t: 'towing', op: 'accept', id: x.id, revision: x.revision });
  };
  let signature = '',
    portSignature = '';
  function refresh() {
    const w = wire();
    panel.hidden = !G.you || G.landed || !G.view;
    if (!w || panel.hidden) {
      towAudio(false, 0);
      return;
    }
    const load = w.objects.find((o) => o.id === w.attached);
    towAudio(
      !!load && !G.paused,
      load ? Math.hypot(load.x - G.view.x, load.y - G.view.y) / 320 : 0,
    );
    const visible = w.objects.filter((o) => !['delivered', 'destroyed'].includes(o.status));
    const sig = visible.map((o) => o.id + ':' + o.status).join();
    if (signature !== sig) {
      signature = sig;
      select.replaceChildren(
        ...visible.map((o) => {
          const v = document.createElement('option');
          v.value = o.id;
          v.textContent = `MOTHERLODE ${o.id} · ${o.ore} · ${o.status.toUpperCase()}`;
          return v;
        }),
      );
    }
    if (!visible.some((o) => o.id === G.towTarget))
      G.towTarget = visible.reduce(
        (best, o) =>
          !best ||
          Math.hypot(o.x - G.view.x, o.y - G.view.y) <
            Math.hypot(best.x - G.view.x, best.y - G.view.y)
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
    const speed = G.view ? Math.hypot(G.view.vx, G.view.vy) : 0;
    status.textContent = o
      ? `${o.status.toUpperCase()} · MOTHERLODE ${o.id} · ${o.ore.toUpperCase()} · ${o.mass ?? 'SURVEY FOR'}t · ${o.field.label} · ${o.owner ? 'OWNER ' + o.owner : 'UNCLAIMED'} · ${o.status === 'detached' ? Math.max(0, Math.ceil(o.graceUntil - w.now)) + 's GRACE · ' : ''}${w.attached ? `HARD TOW CAP ${w.cap} · SPEED ${speed.toFixed(0)} · NO TRANSIT` : 'MANUAL FLIGHT'} · ${w.rig ? 'RIG READY' : 'FIT TOW RIG'}${o.revealed ? '' : ' · SURVEY TO REVEAL PORTS/YIELD'}`
      : 'No motherlodes in this system. Fields recover in simulation time.';
    toggle.textContent = `${w.attached ? 'DETACH' : 'ATTACH'} · ${label(bound('towToggle'))}`;
    toggle.disabled = !o || blocked() || G.paused;
    deliver.disabled = !w.attached || !ports.length || blocked() || G.paused;
    offer.disabled = !w.attached || blocked() || G.paused;
    accept.hidden = !w.offers.length;
    if (w.offers.length)
      accept.textContent = `ACCEPT ${w.offers[0].from}'S TRANSFER (explicit consent)`;
  }
  return { invoke, refresh };
}
