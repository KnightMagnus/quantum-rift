// 1.0.3: the in-HUD radio plays a station's own audio stream in an <audio> element, so the game's mixer controls its
// volume and a click starts it straight away. The display is an in-game "on air" panel with the current song.
// If a station only offers streams this browser can't play, it falls back to the iHeart embed (whose volume is its own).

/**
 * @typedef {Object} RadioStation
 * @property {string|number} id Unique radio station identifier
 * @property {string} name Radio station name
 * @property {string} [sub] Station tagline or frequency callsign
 * @property {string} [img] Station logo or artwork URL
 */

/**
 * @typedef {'live' | 'tune' | 'embed' | 'nosig'} RadioState
 */

/**
 * @typedef {Object} RadioMeta
 * @property {string} [title] Track title
 * @property {string} [artist] Artist name
 */

/**
 * HTML-escapes a string safely for insertion into template strings.
 * @param {any} s Input value
 * @returns {string} Escaped HTML string
 */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );
let el = null,
  hls = null,
  level = 0.8,
  shown = 0.8,
  metaTimer = null,
  token = 0,
  box = null,
  cur = null;

/**
 * Returns or lazily creates the singleton HTMLAudioElement for radio playback.
 * @returns {HTMLAudioElement}
 */
const audio = () => {
  if (!el) {
    el = new Audio();
    el.preload = 'none';
    el.volume = level;
  }
  return el;
};

/**
 * Sets radio playback volume and updates the UI slider.
 * @param {number} v Effective volume (master x radio, 0 when muted)
 * @param {number} [show=v] Slider position value
 * @returns {void}
 */
export function setRadioLevel(v, show = v) {
  level = Math.max(0, Math.min(1, v));
  shown = show;
  if (el) el.volume = level;
  const r = box && box.querySelector('#rvol');
  if (r && document.activeElement !== r) r.value = shown;
} // v: effective (master x radio, 0 when muted); show: the radio slider

/**
 * Returns whether a radio station is currently playing or tuned in.
 * @returns {boolean}
 */
export function radioOn() {
  return !!cur;
}

/**
 * Renders the radio status and controls panel into the current box element.
 * @param {RadioState} state Current tuner state
 * @param {RadioStation|null} s Active station metadata
 * @param {string} [extra=''] Status or song information HTML
 * @returns {void}
 */
function panel(state, s, extra = '') {
  if (!box) return;
  box.innerHTML = `<div class="onair ${state}"><div class="oa-top"><span class="oa-led"></span>${state === 'live' ? 'ON AIR' : state === 'tune' ? 'TUNING' : state === 'embed' ? 'ON AIR · EXTERNAL PLAYER' : 'NO SIGNAL'}</div>
    <div class="oa-name">${esc(s ? s.name : '')}</div><div class="oa-sub">${esc(s ? s.sub : '')}</div><div class="oa-track" id="rtrack">${extra}</div>
    ${state === 'live' ? `<div class="oa-ctrl"><span class="dim small">VOL</span><input type="range" id="rvol" min="0" max="1" step="0.05" value="${shown}"></div>` : ''}</div>`;
  const r = box.querySelector('#rvol');
  const paint = () => {
    if (r) {
      const p = r.value * 100;
      r.style.background = `linear-gradient(90deg,#e0362a ${p}%,#3a0808 ${p}%)`;
    }
  }; // 2.1: red fill
  if (r) {
    paint();
    r.oninput = () => {
      paint();
      window.dispatchEvent(new CustomEvent('rift-radio-vol', { detail: +r.value }));
    };
  }
}

/**
 * Fetches and updates the currently playing track metadata for the active station.
 * @param {string|number} id Station identifier
 * @param {number} my Playback session token to discard stale responses
 * @returns {Promise<void>}
 */
async function nowPlaying(id, my) {
  try {
    const m = await (await fetch('/api/radio/meta?id=' + encodeURIComponent(id))).json();
    if (my !== token) return;
    const t = box && box.querySelector('#rtrack');
    if (t)
      t.innerHTML = m.title
        ? `♪ <b>${esc(m.title)}</b>${m.artist ? ` <span class="dim">·</span> ${esc(m.artist)}` : ''}`
        : '<span class="dim">Live</span>';
  } catch {}
}

/**
 * Asynchronously loads the Hls.js library if not already present on window.
 * @returns {Promise<any>}
 */
function loadHls() {
  if (window.Hls) return Promise.resolve(window.Hls);
  return new Promise((ok, no) => {
    const sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/hls.js/1.5.13/hls.min.js';
    sc.onload = () => ok(window.Hls);
    sc.onerror = no;
    document.head.appendChild(sc);
  });
}

/**
 * Attempts to play an audio stream URL via native Audio or Hls.js.
 * @param {string} url Stream URL
 * @param {boolean} isHls Whether the URL is an HLS m3u8 playlist
 * @returns {Promise<void>}
 */
function tryPlay(url, isHls) {
  const a = audio();
  return new Promise(async (ok, no) => {
    const done = (f) => {
      clearTimeout(to);
      a.onplaying = a.onerror = null;
      f();
    };
    const to = setTimeout(() => done(no), 8000);
    a.onplaying = () => done(ok);
    a.onerror = () => done(no);
    try {
      if (hls) {
        hls.destroy();
        hls = null;
      }
      if (isHls && !a.canPlayType('application/vnd.apple.mpegurl')) {
        const H = await loadHls();
        if (!H || !H.isSupported()) return done(no);
        hls = new H();
        hls.loadSource(url);
        hls.attachMedia(a);
        hls.on(H.Events.ERROR, (_, d) => {
          if (d.fatal) done(no);
        });
      } else a.src = url;
      a.volume = level;
      await a.play();
    } catch {
      done(no);
    }
  });
}

/**
 * Tunes into and begins playback for a given radio station, trying stream URLs and falling back to iHeart embed.
 * @param {RadioStation} s Station object
 * @param {HTMLElement} target Container element for radio panel
 * @param {string} slug Station URL slug for fallback iframe
 * @returns {Promise<void>}
 */
export async function playStation(s, target, slug) {
  box = target;
  cur = s;
  const my = ++token;
  clearInterval(metaTimer);
  panel('tune', s, '<span class="dim">Finding the signal…</span>');
  let streams = {};
  try {
    const j = await (await fetch('/api/radio/station?id=' + encodeURIComponent(s.id))).json();
    streams = j.streams || {};
  } catch {}
  if (my !== token) return;
  const urls = Object.entries(streams).filter(
    ([k, u]) => typeof u === 'string' && /^https?:/.test(u) && !/pls|m3u(?!8)|rtmp/i.test(k + u),
  );
  const rank = (k) =>
    /secure_shoutcast/.test(k)
      ? 0
      : /shoutcast/.test(k)
        ? 1
        : /secure_hls/.test(k)
          ? 2
          : /hls/.test(k)
            ? 3
            : 4;
  urls.sort((a, b) => rank(a[0]) - rank(b[0]));
  for (const [k, u] of urls) {
    try {
      await tryPlay(u, /hls|m3u8/i.test(k + u));
      if (my !== token) return;
      panel('live', s, '<span class="dim">Live</span>');
      nowPlaying(s.id, my);
      metaTimer = setInterval(() => nowPlaying(s.id, my), 20000);
      return;
    } catch {}
    if (my !== token) return;
  }
  // last resort: the iHeart embed (its volume is set in its own player)
  stopAudio();
  box.innerHTML = '';
  const f = document.createElement('iframe');
  f.allow = 'autoplay; encrypted-media';
  f.src = `https://www.iheart.com/live/${slug}-${s.id}/?embed=true&autoplay=true`;
  f.className = 'rembed';
  box.appendChild(f);
  const note = document.createElement('div');
  note.className = 'rembed-note';
  note.textContent = 'This station plays in its own player: use its volume control.';
  box.appendChild(note);
}

/**
 * Tears down active Hls.js instance and stops native Audio playback.
 * @returns {void}
 */
function stopAudio() {
  if (hls) {
    hls.destroy();
    hls = null;
  }
  if (el) {
    el.pause();
    el.removeAttribute('src');
    el.load();
  }
}

/**
 * Stops radio stream playback and resets the UI container to "RADIO OFF".
 * @param {HTMLElement} [target] Optional container DOM element to clear
 * @returns {void}
 */
export function stopRadio(target) {
  token++;
  clearInterval(metaTimer);
  cur = null;
  stopAudio();
  box = target || box;
  if (box)
    box.innerHTML =
      '<div class="nosig"><b>RADIO OFF</b><span class="dim">Pick a station to tune in</span></div>';
}
