// Original, bundled station playlists: no external player or network provider.
import { RADIO_STATIONS } from '../shared/radio-stations.js';
export { RADIO_STATIONS };

// A station-local shuffle bag plays every track before reshuffling. Remember the
// previous selection across stop/tune changes to avoid boundary repeats.
export function createShuffle(tracks, random = Math.random) {
  if (!tracks.length) return () => null;
  let bag = [],
    last = null;
  return () => {
    if (!bag.length) {
      bag = [...tracks];
      for (let i = bag.length - 1; i > 0; i--) {
        const j = Math.floor(random() * (i + 1));
        [bag[i], bag[j]] = [bag[j], bag[i]];
      }
      if (bag.length > 1 && bag[bag.length - 1] === last)
        [bag[0], bag[bag.length - 1]] = [bag[bag.length - 1], bag[0]];
    }
    last = bag.pop();
    return last;
  };
}
export function createStationQueue(station, random = Math.random) {
  if (station.playback !== 'album') return createShuffle(station.tracks, random);
  let index = 0;
  return () => (station.tracks.length ? station.tracks[index++ % station.tracks.length] : null);
}
let unlocked = new Set([RADIO_STATIONS[0].id]);
export function setUnlockedStations(ids) {
  unlocked = new Set(Array.isArray(ids) ? ids : [RADIO_STATIONS[0].id]);
  if (cur && !unlocked.has(cur.id)) stopRadio();
}
const queues = new Map();
let el = null,
  level = 0.8,
  shown = 0.8,
  token = 0,
  box = null,
  cur = null;
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c],
  );
export function setRadioLevel(v, show = v) {
  level = Math.max(0, Math.min(1, v));
  shown = show;
  if (el) el.volume = level;
  const r = box?.querySelector('#rvol');
  if (r && document.activeElement !== r) r.value = shown;
}
export function radioOn() {
  return !!cur;
}
function panel(state, track, message = '') {
  if (!box) return;
  box.innerHTML =
    '<div class="onair ' +
    state +
    '"><div class="oa-top"><span class="oa-led"></span>' +
    (state === 'live'
      ? cur?.playback === 'album'
        ? 'ON AIR · ALBUM LOOP'
        : 'ON AIR · SHUFFLE'
      : state === 'tune'
        ? 'TUNING'
        : state === 'empty'
          ? 'STATION DISCOVERED'
          : 'SIGNAL INTERRUPTED') +
    '</div><div class="oa-name">' +
    esc(cur?.name) +
    '</div><div class="oa-sub">' +
    esc(cur?.sub) +
    '</div><div class="oa-track" id="rtrack">♪ <b>' +
    esc(cur?.id === 'super-idol' || state === 'empty' ? track.title : 'Broadcast') +
    '</b>' +
    (message ? '<br>' + esc(message) : '') +
    '</div><div class="oa-ctrl"><label>VOL <input aria-label="Radio volume" type="range" id="rvol" min="0" max="1" step="0.05" value="' +
    shown +
    '"></label></div></div>';
  const r = box.querySelector('#rvol');
  r.oninput = () => window.dispatchEvent(new CustomEvent('rift-radio-vol', { detail: +r.value }));
}
function stopAudio() {
  if (!el) return;
  el.onended = el.onerror = null;
  el.pause();
  el.removeAttribute('src');
  el.load();
  el = null;
}
async function nextTrack() {
  if (!cur) return;
  const my = ++token;
  stopAudio();
  const track = queues.get(cur.id)();
  if (!track) {
    panel('empty', { title: 'No recordings available yet' });
    cur = null;
    return;
  }
  const a = new Audio(track.url);
  el = a;
  a.preload = 'auto';
  a.volume = level;
  a.onended = () => {
    if (my === token) void nextTrack();
  };
  a.onerror = () => {
    if (my !== token) return;
    panel('nosig', track, 'Select the station to retry.');
    stopAudio();
    cur = null;
  };
  panel('tune', track);
  try {
    await a.play();
    if (my === token && cur) panel('live', track);
  } catch {
    if (my !== token || !cur) return;
    panel('nosig', track, 'Select the station to retry playback.');
    stopAudio();
    cur = null;
  }
}
export async function playStation(s, target) {
  const station = RADIO_STATIONS.find((x) => x.id === s.id);
  if (!station || !unlocked.has(station.id)) return;
  box = target;
  if (cur?.id === station.id && el && !el.paused) return;
  cur = station;
  if (!cur.tracks.length) {
    token++;
    stopAudio();
    panel('empty', { title: 'No recordings available yet' });
    cur = null;
    return;
  }
  if (cur.playback === 'album' || !queues.has(cur.id)) queues.set(cur.id, createStationQueue(cur));
  await nextTrack();
}
export function stopRadio(target) {
  token++;
  cur = null;
  stopAudio();
  box = target || box;
  if (box)
    box.innerHTML =
      '<div class="nosig"><b>RADIO OFF</b><span class="dim">Pick a station to tune in</span></div>';
}
