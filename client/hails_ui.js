// Incoming calls only update a badge. A player action opens a conversation; flight never pauses.
export function initHails({ G, send, toast, cam }) {
  const $ = (id) => document.getElementById(id);
  let entries = [],
    active = null,
    allow = true,
    marker = null;
  const button = (text, fn, target = $('hailopts')) => {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.textContent = text;
    b.onclick = fn;
    target.append(b);
    return b;
  };
  const close = () => {
    $('hailbox').classList.add('hidden');
    active = null;
  };
  function inbox() {
    active = null;
    $('hailwho').textContent = 'Incoming hails';
    $('hailsub').textContent = '· communications';
    $('hailtext').textContent = entries.length
      ? 'Choose a sender. Unavailable calls remain readable as archived transmissions until you leave or dismiss them.'
      : 'No pending hails.';
    $('hailopts').replaceChildren();
    for (const q of entries) {
      button(
        `${q.unread ? '● ' : ''}${q.who} · ${q.archived ? 'archived' : q.kind === 'player' ? 'captain' : 'NPC'}`,
        () => send({ t: 'hailin', op: 'open', key: q.key }),
      );
      button(`Dismiss ${q.who}`, () => send({ t: 'hailin', op: 'dismiss', key: q.key }));
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
    $('hailopts').append(label);
    button('CLOSE', close);
    $('hailbox').classList.remove('hidden');
  }
  function show(m) {
    active = m;
    $('hailwho').textContent = m.who || '';
    $('hailsub').textContent = m.sub ? `· ${m.sub}` : '';
    $('hailtext').textContent = m.text || '';
    const opts = $('hailopts');
    opts.replaceChildren();
    if (m.player) {
      const input = document.createElement('input');
      input.id = 'hailcompose';
      input.type = 'text';
      input.placeholder = 'Short private hail (100 characters)';
      input.setAttribute('aria-label', 'Hail message');
      const count = document.createElement('span');
      count.className = 'small dim';
      count.textContent = '0/100';
      input.oninput = () => {
        input.value = [...input.value].slice(0, 100).join('');
        count.textContent = `${[...input.value].length}/100`;
      };
      const submit = () => {
        const text = input.value.trim();
        if (!text) return;
        send({ t: 'hailin', op: 'send', id: m.player, text });
        input.value = '';
        count.textContent = '0/100';
      };
      input.onkeydown = (e) => {
        e.stopPropagation();
        if (e.key === 'Enter') {
          e.preventDefault();
          submit();
        }
        if (e.key === 'Escape') close();
      };
      opts.append(input, count);
      button('SEND', submit);
    }
    for (const o of m.opts || [])
      button(o.label, () =>
        send(
          m.key
            ? { t: 'hailin', op: 'answer', key: m.key, k: o.k }
            : { t: 'hailopt', ...(m.stellar ? { stellar: m.stellar } : { id: m.id }), k: o.k },
        ),
      );
    button('INBOX', inbox);
    button('CLOSE', close);
    $('hailbox').classList.remove('hidden');
  }
  $('hailindicator').onclick = () => {
    send({ t: 'hailin', op: 'list' });
    inbox();
  };
  function onMessage(m) {
    if (m.t === 'hailinbox') {
      entries = m.entries || [];
      allow = m.allow !== false;
      const unread = entries.filter((q) => q.unread).length;
      $('hailindicator').classList.toggle('hidden', !G.you || !!G.landed || !entries.length);
      $('hailcount').textContent = String(unread || entries.length);
      $('hailindicator').setAttribute(
        'aria-label',
        `${entries.filter((q) => !q.archived).length} pending hails, ${entries.filter((q) => q.archived).length} archived, ${unread} unread. Open communications inbox.`,
      );
      if (!$('hailbox').classList.contains('hidden') && !active) inbox();
      const current = active?.key && entries.find((q) => q.key === active.key);
      if (current?.archived) {
        $('hailopts').replaceChildren();
        button('INBOX', inbox);
        button('CLOSE', close);
      }
      if (active?.key && !current) {
        $('hailtext').textContent = 'This hail has ended or expired.';
        $('hailopts').replaceChildren();
        button('INBOX', inbox);
        button('CLOSE', close);
      }
      return true;
    }
    if (m.t === 'hailmark') {
      marker = m.until > Date.now() ? { ...m, sys: G.sys } : null;
      return true;
    }
    return false;
  }
  function frame() {
    const mark = $('hailmarker');
    if (!marker || marker.until < Date.now() || marker.sys !== G.sys || G.landed || !G.view) {
      mark.classList.add('hidden');
      if (marker && (marker.until < Date.now() || marker.sys !== G.sys)) marker = null;
    } else {
      const target = marker.id && G.ents.get(marker.id),
        x = target ? target.rx : marker.x,
        y = target ? target.ry : marker.y;
      if (marker.id && !target) {
        marker = null;
        mark.classList.add('hidden');
      } else {
        const view = $('view').getBoundingClientRect();
        const px = ((x - cam.cx) * cam.z * view.width) / cam.W + view.width / 2,
          py = ((y - cam.cy) * cam.z * view.height) / cam.H + view.height / 2;
        let body = mark.querySelector('.hail-marker-body');
        if (!body) {
          body = document.createElement('div');
          body.className = 'hail-marker-body';
          mark.replaceChildren(body);
        }
        body.textContent = `◇ ${marker.label} (${Math.round(x)}, ${Math.round(y)})`;
        mark.classList.remove('hidden');
        const frame = mark.getBoundingClientRect();
        mark.style.left = `${Math.max(8, Math.min(view.width - frame.width - 8, px - frame.width / 2))}px`;
        mark.style.top = `${Math.max(8, Math.min(view.height - frame.height - 8, py - frame.height - 20))}px`;
      }
    }
    $('hailindicator').style.visibility =
      !G.you || G.landed || ($('login') && !$('login').classList.contains('hidden'))
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
      $('hailindicator').classList.add('hidden');
      $('hailmarker').classList.add('hidden');
    },
  };
}
