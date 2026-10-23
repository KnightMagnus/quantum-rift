interface HailEntry {
  key: string;
  who: string;
  unread?: boolean;
  archived?: boolean;
  kind: string;
}
interface HailConversation {
  who?: string;
  sub?: string;
  text?: string;
  player?: number;
  key?: string;
  stellar?: string;
  id?: number;
  opts?: Array<{ label: string; k: string }>;
}
interface HailMarker {
  until: number;
  sys: string | null;
  id?: number;
  x: number;
  y: number;
  label: string;
}
interface HailMessage {
  t: string;
  entries?: HailEntry[];
  allow?: boolean;
  until: number;
  id?: number;
  x: number;
  y: number;
  label: string;
}
interface HailState {
  you?: unknown;
  landed?: unknown;
  sys: string | null;
  view?: unknown;
  ents: Map<number, { rx: number; ry: number }>;
}
interface HailCapabilities {
  G: HailState;
  send: (message: object) => void;
  toast: (message: string) => void;
  cam: { cx: number; cy: number; z: number; W: number; H: number };
}
// Incoming calls only update a badge. A player action opens a conversation; flight never pauses.
export function initHails({ G: hailState, send, toast: _toast, cam: camera }: HailCapabilities) {
  const elementById = (identifier: string) => document.getElementById(identifier)!;
  let entries: HailEntry[] = [],
    active: HailConversation | null = null,
    allow = true,
    marker: HailMarker | null = null;
  const button = (text: string, callback: () => void, target = elementById('hailopts')) => {
    const htmlButtonElement = document.createElement('button');
    htmlButtonElement.className = 'btn sm';
    htmlButtonElement.textContent = text;
    htmlButtonElement.onclick = callback;
    target.append(htmlButtonElement);
    return htmlButtonElement;
  };
  const close = () => {
    elementById('hailbox').classList.add('hidden');
    active = null;
  };
  function inbox() {
    active = null;
    elementById('hailwho').textContent = 'Incoming hails';
    elementById('hailsub').textContent = '· communications';
    elementById('hailtext').textContent = entries.length
      ? 'Choose a sender. Unavailable calls remain readable as archived transmissions until you leave or dismiss them.'
      : 'No pending hails.';
    elementById('hailopts').replaceChildren();
    for (const hailEntry of entries) {
      button(
        `${hailEntry.unread ? '● ' : ''}${hailEntry.who} · ${hailEntry.archived ? 'archived' : hailEntry.kind === 'player' ? 'captain' : 'NPC'}`,
        () => send({ t: 'hailin', op: 'open', key: hailEntry.key }),
      );
      button(`Dismiss ${hailEntry.who}`, () =>
        send({ t: 'hailin', op: 'dismiss', key: hailEntry.key }),
      );
    }
    const label = document.createElement('label'),
      check = document.createElement('input');
    check.type = 'checkbox';
    check.checked = allow;
    check.onchange = () => send({ t: 'hailin', op: 'prefs', allow: check.checked });
    label.append(
      check,
      document.createTextNode(
        ' Allow player hails (existing friend / Armada / message privacy still applies)',
      ),
    );
    elementById('hailopts').append(label);
    button('CLOSE', close);
    elementById('hailbox').classList.remove('hidden');
  }
  function show(hailConversation: HailConversation) {
    active = hailConversation;
    elementById('hailwho').textContent = hailConversation.who || '';
    elementById('hailsub').textContent = hailConversation.sub ? `· ${hailConversation.sub}` : '';
    elementById('hailtext').textContent = hailConversation.text || '';
    const htmlElement = elementById('hailopts');
    htmlElement.replaceChildren();
    if (hailConversation.player) {
      const input = document.createElement('input');
      input.id = 'hailcompose';
      input.type = 'text';
      input.placeholder = 'Short private hail (100 characters)';
      input.setAttribute('aria-label', 'Hail message');
      const count = document.createElement('span');
      count.className = 'small dim';
      count.textContent = '0/100';
      input.oninput = () => {
        input.value = Array.from(input.value).slice(0, 100).join('');
        count.textContent = `${Array.from(input.value).length}/100`;
      };
      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        send({ t: 'hailin', op: 'send', id: hailConversation.player, text });
        input.value = '';
        count.textContent = '0/100';
      };
      input.onkeydown = (keyboardEvent) => {
        keyboardEvent.stopPropagation();
        if (keyboardEvent.key === 'Enter') {
          keyboardEvent.preventDefault();
          submit();
        }
        if (keyboardEvent.key === 'Escape') close();
      };
      htmlElement.append(input, count);
      button('SEND', submit);
    }
    for (const options of hailConversation.opts || [])
      button(options.label, () =>
        send(
          hailConversation.key
            ? { t: 'hailin', op: 'answer', key: hailConversation.key, k: options.k }
            : {
                t: 'hailopt',
                ...(hailConversation.stellar
                  ? { stellar: hailConversation.stellar }
                  : { id: hailConversation.id }),
                k: options.k,
              },
        ),
      );
    button('INBOX', inbox);
    button('CLOSE', close);
    elementById('hailbox').classList.remove('hidden');
  }
  elementById('hailindicator').onclick = () => {
    send({ t: 'hailin', op: 'list' });
    inbox();
  };
  function onMessage(message: { t: string }) {
    const message2 = message as Partial<HailMessage>;
    if (message2.t === 'hailinbox') {
      entries = message2.entries || [];
      allow = message2.allow !== false;
      const unread = entries.filter((hailEntry) => hailEntry.unread).length;
      elementById('hailindicator').classList.toggle(
        'hidden',
        !hailState.you || !!hailState.landed || !entries.length,
      );
      elementById('hailcount').textContent = String(unread || entries.length);
      elementById('hailindicator').setAttribute(
        'aria-label',
        `${entries.filter((hailEntry) => !hailEntry.archived).length} pending hails, ${entries.filter((hailEntry) => hailEntry.archived).length} archived, ${unread} unread. Open communications inbox.`,
      );
      if (!elementById('hailbox').classList.contains('hidden') && !active) inbox();
      const current = active?.key && entries.find((hailEntry) => hailEntry.key === active!.key);
      if ((current as HailEntry | undefined)?.archived) {
        elementById('hailopts').replaceChildren();
        button('INBOX', inbox);
        button('CLOSE', close);
      }
      if (active?.key && !current) {
        elementById('hailtext').textContent = 'This hail has ended or expired.';
        elementById('hailopts').replaceChildren();
        button('INBOX', inbox);
        button('CLOSE', close);
      }
      return true;
    }
    if (message2.t === 'hailmark') {
      marker =
        message2.until! > Date.now() ? { ...(message2 as HailMessage), sys: hailState.sys } : null;
      return true;
    }
    return false;
  }
  function frame() {
    const mark = elementById('hailmarker');
    if (
      !marker ||
      marker.until < Date.now() ||
      marker.sys !== hailState.sys ||
      hailState.landed ||
      !hailState.view
    ) {
      mark.classList.add('hidden');
      if (marker && (marker.until < Date.now() || marker.sys !== hailState.sys)) marker = null;
    } else {
      const target = marker.id && hailState.ents.get(marker.id),
        positionX = target ? target.rx : marker.x,
        positionY = target ? target.ry : marker.y;
      if (marker.id && !target) {
        marker = null;
        mark.classList.add('hidden');
      } else {
        const view = elementById('view').getBoundingClientRect();
        const pixelX =
            ((positionX - camera.cx) * camera.z * view.width) / camera.W + view.width / 2,
          pixelY = ((positionY - camera.cy) * camera.z * view.height) / camera.H + view.height / 2;
        let body = mark.querySelector<HTMLElement>('.hail-marker-body');
        if (!body) {
          body = document.createElement('div');
          body.className = 'hail-marker-body';
          mark.replaceChildren(body);
        }
        body.textContent = `◇ ${marker.label} (${Math.round(positionX)}, ${Math.round(positionY)})`;
        mark.classList.remove('hidden');
        const frame = mark.getBoundingClientRect();
        mark.style.left = `${Math.max(8, Math.min(view.width - frame.width - 8, pixelX - frame.width / 2))}px`;
        mark.style.top = `${Math.max(8, Math.min(view.height - frame.height - 8, pixelY - frame.height - 20))}px`;
      }
    }
    elementById('hailindicator').style.visibility =
      !hailState.you ||
      hailState.landed ||
      (elementById('login') && !elementById('login').classList.contains('hidden'))
        ? 'hidden'
        : 'visible';
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    onMessage,
    show,
    inbox,
    close,
    reset() {
      entries = [];
      active = marker = null;
      allow = true;
      close();
      elementById('hailindicator').classList.add('hidden');
      elementById('hailmarker').classList.add('hidden');
    },
  };
}
