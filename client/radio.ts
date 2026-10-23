interface RadioTrack {
  url: string;
  title?: string;
}
interface RadioStation {
  id: string;
  name: string;
  sub: string;
  playback: string;
  tracks: RadioTrack[];
}
import { escapeHtml as escapeHtml2 } from './html.ts';
// Original, bundled station playlists: no external player or network provider.
import { RADIO_STATIONS } from '../shared/radio-stations.ts';
export { RADIO_STATIONS };

// A station-local shuffle bag plays every track before reshuffling. Remember the
// previous selection across stop/tune changes to avoid boundary repeats.
export function createShuffle<ValueType>(tracks: readonly ValueType[], random = Math.random) {
  if (!tracks.length) return () => null;
  let inventoryBag: ValueType[] = [],
    last: ValueType | null | undefined = null;
  return () => {
    if (!inventoryBag.length) {
      inventoryBag = [...tracks];
      for (let index = inventoryBag.length - 1; index > 0; index--) {
        const innerIndex = Math.floor(random() * (index + 1));
        [inventoryBag[index], inventoryBag[innerIndex]] = [
          inventoryBag[innerIndex],
          inventoryBag[index],
        ];
      }
      if (inventoryBag.length > 1 && inventoryBag[inventoryBag.length - 1] === last)
        [inventoryBag[0], inventoryBag[inventoryBag.length - 1]] = [
          inventoryBag[inventoryBag.length - 1],
          inventoryBag[0],
        ];
    }
    last = inventoryBag.pop();
    return last;
  };
}
export function createStationQueue<Track>(
  station: { playback?: RadioStation['playback']; tracks: readonly Track[] },
  random = Math.random,
) {
  if (station.playback !== 'album') return createShuffle(station.tracks, random);
  let index = 0;
  return () => (station.tracks.length ? station.tracks[index++ % station.tracks.length] : null);
}
let unlocked = new Set([RADIO_STATIONS[0].id]);
export function setUnlockedStations(identifiers: readonly string[] | null | undefined) {
  unlocked = new Set(Array.isArray(identifiers) ? identifiers : [RADIO_STATIONS[0].id]);
  if (radioStation && !unlocked.has(radioStation.id)) stopRadio();
}
const queues = new Map<string, () => RadioTrack | null | undefined>();
let htmlAudioElement: HTMLAudioElement | null = null,
  level = 0.8,
  shown = 0.8,
  token = 0,
  htmlElement: HTMLElement | null = null,
  radioStation: RadioStation | null = null;

export function setRadioLevel(value2: number, show = value2) {
  level = Math.max(0, Math.min(1, value2));
  shown = show;
  if (htmlAudioElement) htmlAudioElement.volume = level;
  const htmlInputElement = htmlElement?.querySelector<HTMLInputElement>('#rvol');
  if (htmlInputElement && document.activeElement !== htmlInputElement)
    htmlInputElement.value = String(shown);
}
export function radioOn() {
  return !!radioStation;
}
function panel(state: string, track: { title?: string }, message = '') {
  if (!htmlElement) return;
  htmlElement.innerHTML =
    '<div class="onair ' +
    state +
    '"><div class="oa-top"><span class="oa-led"></span>' +
    (state === 'live'
      ? 'ON AIR'
      : state === 'tune'
        ? 'TUNING'
        : state === 'empty'
          ? 'STATION DISCOVERED'
          : 'SIGNAL INTERRUPTED') +
    '</div><div class="oa-name">' +
    escapeHtml2(radioStation?.name) +
    '</div><div class="oa-sub">' +
    escapeHtml2(radioStation?.sub) +
    '</div><div class="oa-track" id="rtrack">♪ <b>' +
    escapeHtml2(
      radioStation?.id === 'super-idol' || state === 'empty' ? track.title : 'Broadcast',
    ) +
    '</b>' +
    (message ? '<br>' + escapeHtml2(message) : '') +
    '</div><div class="oa-ctrl"><label>VOL <input aria-label="Radio volume" type="range" id="rvol" min="0" max="1" step="0.05" value="' +
    shown +
    '"></label></div></div>';
  const htmlInputElement = htmlElement.querySelector<HTMLInputElement>('#rvol')!;
  htmlInputElement.oninput = () =>
    window.dispatchEvent(new CustomEvent('rift-radio-vol', { detail: +htmlInputElement.value }));
}
function stopAudio() {
  if (!htmlAudioElement) return;
  htmlAudioElement.onended = htmlAudioElement.onerror = null;
  htmlAudioElement.pause();
  htmlAudioElement.removeAttribute('src');
  htmlAudioElement.load();
  htmlAudioElement = null;
}
async function nextTrack() {
  if (!radioStation) return;
  const mouseY = ++token;
  stopAudio();
  const track = queues.get(radioStation.id)!();
  if (!track) {
    panel('empty', { title: 'No recordings available yet' });
    radioStation = null;
    return;
  }
  const htmlAudioElement2 = new Audio(track.url);
  htmlAudioElement = htmlAudioElement2;
  htmlAudioElement2.preload = 'auto';
  htmlAudioElement2.volume = level;
  htmlAudioElement2.onended = () => {
    if (mouseY === token) void nextTrack();
  };
  htmlAudioElement2.onerror = () => {
    if (mouseY !== token) return;
    panel('nosig', track, 'Select the station to retry.');
    stopAudio();
    radioStation = null;
  };
  panel('tune', track);
  try {
    await htmlAudioElement2.play();
    if (mouseY === token && radioStation) panel('live', track);
  } catch {
    if (mouseY !== token || !radioStation) return;
    panel('nosig', track, 'Select the station to retry playback.');
    stopAudio();
    radioStation = null;
  }
}
export async function playStation(state: { id: string }, target: HTMLElement) {
  const station = RADIO_STATIONS.find((positionX) => positionX.id === state.id);
  if (!station || !unlocked.has(station.id)) return;
  htmlElement = target;
  if (radioStation?.id === station.id && htmlAudioElement && !htmlAudioElement.paused) return;
  radioStation = station;
  if (!radioStation.tracks.length) {
    token++;
    stopAudio();
    panel('empty', { title: 'No recordings available yet' });
    radioStation = null;
    return;
  }
  if (radioStation.playback === 'album' || !queues.has(radioStation.id))
    queues.set(radioStation.id, createStationQueue(radioStation));
  await nextTrack();
}
export function stopRadio(target?: HTMLElement) {
  token++;
  radioStation = null;
  stopAudio();
  htmlElement = target || htmlElement;
  if (htmlElement)
    htmlElement.innerHTML =
      '<div class="nosig"><b>RADIO OFF</b><span class="dim">Pick a station to tune in</span></div>';
}
