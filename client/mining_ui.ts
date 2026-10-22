import type { ClientGameState } from './main.ts';
import type { NetworkMessage } from '../server/message-registry.ts';
import type { MiningMessage } from './protocol.ts';
import { elementById } from './dom.ts';
export interface MiningUIOptions {
  G: ClientGameState;
  send: (message: NetworkMessage) => void;
  bound: (action: string) => string | null;
  label: (code: string | null) => string;
  blocked: () => boolean;
  contextBlocked?: () => boolean;
  industrialAudio?: (enabled: boolean, heat: number) => void;
  towAudio?: (enabled: boolean, tension: number) => void;
}

import { miningPanelState } from './mining-panel-state.ts';
import { initTowingUI } from './towing_ui.ts';
// One action entry point for keyboard and contextual cockpit button.
export function initMiningUI({
  G: clientGameState,
  send,
  bound,
  label,
  blocked,
  contextBlocked = blocked,
  industrialAudio = () => {},
  towAudio = () => {},
}: MiningUIOptions) {
  const root = elementById('miningcontrols'),
    button = elementById('miningsurvey'),
    meter = elementById('miningmeter');
  const indicator = elementById('miningindicator');
  const close = elementById('miningclose');
  const cargo = elementById('miningcargo');
  let open = false,
    identity: string | null = null;
  const currentIdentity = () =>
    clientGameState.you
      ? clientGameState.you!.name +
        ':' +
        clientGameState.you!.ship?.hull +
        ':' +
        clientGameState.myId
      : null;
  function setOpen(value: boolean) {
    open = value;
    if (open) identity = currentIdentity();
    root.classList.toggle('hidden', !open);
    indicator.setAttribute('aria-expanded', String(open));
  }
  indicator.onclick = () => {
    setOpen(!open);
    if (open) close.focus();
  };
  close.onclick = () => {
    setOpen(false);
    indicator.focus();
  };
  // Native button activation must not become Enter-to-chat or Space-to-fire.
  const buttonKeys = (keyboardEvent: KeyboardEvent) => {
    if (
      ['Enter', ' '].includes(keyboardEvent.key) &&
      ['BUTTON', 'SUMMARY'].includes((keyboardEvent.target as HTMLInputElement).tagName)
    )
      keyboardEvent.stopPropagation();
  };
  indicator.addEventListener('keydown', buttonKeys);
  root.addEventListener('keydown', buttonKeys);
  root.addEventListener('keydown', (keyboardEvent) => {
    if (keyboardEvent.key === 'Escape') {
      keyboardEvent.stopPropagation();
      close.click();
    }
  });
  const initTowingUI2 = initTowingUI({
    G: clientGameState,
    send,
    bound,
    label,
    blocked: contextBlocked,
    towAudio,
    root,
  });
  function invokeMiningAction(action: string) {
    if (
      blocked() ||
      clientGameState.paused ||
      clientGameState.landed ||
      !clientGameState.you ||
      !clientGameState.view ||
      !miningPanelState(clientGameState).visible
    )
      return false;
    if (action === 'miningPanel') {
      setOpen(!open);
      return true;
    }
    if (['towToggle', 'towDeliver', 'towOffer', 'towAccept'].includes(action))
      return initTowingUI2.invoke(action);
    if (action === 'miningGroup') {
      send({
        t: 'miningPressure',
        op: clientGameState.miningPressure?.groupConsent ? 'leave' : 'join',
      });
      return true;
    }
    if (action === 'dredgeInput' || action === 'dredgeOff') {
      if (clientGameState.you!.ship?.hull !== 815) return false;
      send(
        action === 'dredgeOff'
          ? { t: 'industrial', op: 'off' }
          : { t: 'industrial', op: 'recipe', recipe: recipes.value, grade: grade.value },
      );
      return true;
    }
    if (['dredgeSweep', 'dredgeHarvest', 'dredgeSmelter'].includes(action)) {
      if (clientGameState.you!.ship?.hull !== 815) return false;
      send({
        t: 'industrial',
        op: (
          { dredgeSweep: 'sweep', dredgeHarvest: 'harvest', dredgeSmelter: 'smelter' } as Record<
            string,
            string
          >
        )[action],
      });
      return true;
    }
    if (
      action !== 'surveyPulse' ||
      blocked() ||
      !clientGameState.you ||
      !clientGameState.view ||
      clientGameState.landed ||
      clientGameState.paused
    )
      return false;
    const miningPrivateWire = clientGameState.mining;
    if (miningPrivateWire && miningPrivateWire.cooldownUntil > miningPrivateWire.now) return false;
    send({ t: 'mining', op: 'survey' });
    return true;
  }
  function refresh() {
    initTowingUI2.refresh();
    const state = miningPanelState(clientGameState);
    const flightVisible = state.visible && elementById('login').classList.contains('hidden');
    const nextIdentity = currentIdentity();
    if (!flightVisible || nextIdentity !== identity) setOpen(false);
    identity = nextIdentity;
    indicator.classList.toggle(
      'hidden',
      !clientGameState.you || !elementById('login').classList.contains('hidden'),
    );
    indicator.disabled = !flightVisible;
    indicator.setAttribute('aria-disabled', String(!flightVisible));
    root.classList.toggle('hidden', !flightVisible || !open);
    indicator.title = state.active
      ? 'Mining operations active — open controls'
      : 'Open mining controls';
    indicator.classList.toggle('active', state.active);
    indicator.setAttribute(
      'aria-label',
      clientGameState.miningPressure?.warn
        ? 'Mining controls — high mining noise'
        : state.active
          ? 'Mining controls — operations active'
          : 'Mining controls',
    );
    if (!flightVisible)
      indicator.title = 'Mining unavailable — requires a mining ship or tow rig in flight';
    indicator.title += ` · ${label(bound('miningPanel'))}`;
    consent.textContent = `${clientGameState.miningPressure?.groupConsent ? 'Leave' : 'Join'} group mining · ${label(bound('miningGroup'))}`;
    choose.textContent = `SET INPUT · ${label(bound('dredgeInput'))}`;
    htmlButtonElement2.textContent = `ALL OFF · ${label(bound('dredgeOff'))}`;
    const danger = clientGameState.miningPressure?.warn;
    indicator.classList.toggle('warning', !!danger);
    cargo.textContent =
      state.free > 0
        ? state.free + ' / ' + state.capacity + ' t free'
        : 'Hold full — unload cargo to collect more';
    if (danger) cargo.textContent += ' · Mining noise is high — danger may follow';
    if (!flightVisible) {
      industrialAudio(false, 0);
      return;
    }
    industrial.hidden = clientGameState.you?.ship?.hull !== 815;
    const image = clientGameState.industrial || clientGameState.you?.industrial;
    if (image) {
      industrialAudio(!!image.inputs.sweep, image.heat);
      heat.textContent = `SHIP HEAT ${image.heat.toFixed(0)}/100 · ${image.heat >= 150 ? 'CRITICAL HULL DAMAGE' : image.heat >= 120 ? 'SHIELD DRAIN' : image.heat >= 70 ? 'WARNING' : 'SAFE'} · ${image.reason} · ${image.safeSeconds.toFixed(0)}s to cutoff`;
      for (const [action, htmlButtonElement] of industrialButtons) {
        const mode = (
          { dredgeSweep: 'sweep', dredgeHarvest: 'harvest', dredgeSmelter: 'smelter' } as const
        )[action as 'dredgeSweep' | 'dredgeHarvest' | 'dredgeSmelter'];
        htmlButtonElement.textContent = `${mode.toUpperCase()} ${image[mode] ? 'ON' : 'OFF'} · ${label(bound(action))}`;
        htmlButtonElement.disabled = (blocked() || clientGameState.paused) as boolean;
      }
      property.textContent = `Heat sources: SWEEP ${image.inputs.sweep.toFixed(1)} / SMELTER ${image.inputs.smelter.toFixed(1)} / CORONA ${image.inputs.corona.toFixed(1)}. Mobile: ${image.workMs / 1000}/10s per input tonne · ${Object.entries(
        image.outputs,
      )
        .map(([entryKey, value]) => entryKey + ' ' + value + '/300')
        .join(
          ' ',
        )}. 70% recovery, 6 input t/min, no offline work. ${image.stock} ${(image.bands || []).map((secondValue) => 'ENTRY ' + secondValue.entry.x + ',' + secondValue.entry.y + ' → EAST').join(' ')}`;
    }
    const miningPrivateWire = clientGameState.mining,
      remaining = Math.max(
        0,
        (miningPrivateWire?.cooldownUntil || 0) - (miningPrivateWire?.now || 0),
      );
    button.textContent = `Scan nearby rocks · ${label(bound('surveyPulse'))}${remaining ? ` · ${Math.ceil(remaining)}s` : ''}`;
    button.disabled = blocked() || !!clientGameState.paused || remaining > 0;
    const record = clientGameState.miningRocks?.rocks.find(
      (miningRockWire) => miningRockWire.id === clientGameState.miningTarget,
    );
    meter.textContent = record?.down
      ? `${record.lastCut === 'clean' ? 'Clean cut' : 'Rock opened'} — collect the released material`
      : record && !record.down
        ? `${record.gas ? 'Gas pressure' : 'Rock heat'} ${Math.round(record.heat)}/100 · Cut ${record.stage + 1}/${record.stages}. ${record.ready ? 'READY — release at 60–80 for a clean cut' : record.acquired ? 'Keep cutting the seam' : 'Aim at the seam and hold fire'}`
        : 'Scan to reveal nearby deposits, then aim your mining tool at a rock.';
  }
  const industrial = document.createElement('div');
  industrial.id = 'industrialcontrols';
  industrial.style.maxWidth = 'min(700px, 90vw)';
  industrial.style.whiteSpace = 'normal';
  const heat = document.createElement('div');
  heat.id = 'industrialheat';
  heat.setAttribute('role', 'status');
  const property = document.createElement('div');
  property.className = 'small';
  property.id = 'industrialproperty';
  const industrialDetails = document.createElement('details');
  const industrialSummary = document.createElement('summary');
  industrialSummary.textContent = 'Processing details';
  industrialDetails.append(industrialSummary, property);
  industrial.append(heat);
  const industrialButtons: Array<[string, HTMLButtonElement]> = [];
  for (const action of ['dredgeSweep', 'dredgeHarvest', 'dredgeSmelter']) {
    const htmlButtonElement = document.createElement('button');
    htmlButtonElement.title = (
      {
        dredgeSweep: 'Collect loose field material',
        dredgeHarvest: 'Collect plasma in a stellar corona',
        dredgeSmelter: 'Process carried material aboard the ship',
      } as Record<string, string>
    )[action];
    htmlButtonElement.className = 'btn sm';
    htmlButtonElement.id = action;
    htmlButtonElement.onclick = () => invokeMiningAction(action);
    industrialButtons.push([action, htmlButtonElement]);
    industrial.append(htmlButtonElement);
  }
  const recipes = document.createElement('select');
  recipes.id = 'mobilerecipe';
  recipes.setAttribute('aria-label', 'Material to process');
  for (const [identifier, name] of [
    ['alloy', 'Ore → Alloy'],
    ['cells', 'Gas → Cells'],
    ['cut', 'Shards → Crystal'],
  ]) {
    const htmlOptionElement = document.createElement('option');
    htmlOptionElement.value = identifier;
    htmlOptionElement.textContent = name;
    recipes.append(htmlOptionElement);
  }
  const grade = document.createElement('select');
  grade.id = 'mobilegrade';
  grade.setAttribute('aria-label', 'Input material quality');
  for (const identifier of ['common', 'rich', 'pure']) {
    const htmlOptionElement = document.createElement('option');
    htmlOptionElement.value = identifier;
    htmlOptionElement.textContent = identifier;
    grade.append(htmlOptionElement);
  }
  const choose = document.createElement('button');
  choose.className = 'btn sm';
  choose.textContent = 'SET INPUT';
  choose.onclick = () => invokeMiningAction('dredgeInput');
  const htmlButtonElement2 = document.createElement('button');
  htmlButtonElement2.className = 'btn sm';
  htmlButtonElement2.id = 'industrialoff';
  htmlButtonElement2.textContent = 'ALL OFF';
  htmlButtonElement2.onclick = () => invokeMiningAction('dredgeOff');
  industrial.append(recipes, grade, choose, htmlButtonElement2);
  industrial.append(industrialDetails);
  root.append(industrial);
  const consent = document.createElement('button');
  consent.className = 'btn sm';
  consent.textContent = 'GROUP MINING: OPT IN';
  consent.id = 'miningconsent';
  const details = document.createElement('details');
  const summary = document.createElement('summary');
  summary.textContent = 'Group mining & help';
  const help = document.createElement('p');
  help.textContent =
    'A scan briefly reveals seams and material quality. Hold your mining beam on a seam; when READY, release at 60–80 heat for better-quality material. Mining noise can attract danger. Group mining is optional consent for this flight, separate from Armada membership.';
  details.append(summary, help, consent);
  root.append(details);
  consent.onclick = () => invokeMiningAction('miningGroup');
  button.onclick = () => invokeMiningAction('surveyPulse');
  return { invokeMiningAction, refresh };
}
export function receiveMining(clientGameState: ClientGameState, message: MiningMessage) {
  if (Object.hasOwn(message, 'towing')) clientGameState.towing = message.towing;
  if (Object.hasOwn(message, 'industrial')) clientGameState.industrial = message.industrial;
  if (message.miningPressure) clientGameState.miningPressure = message.miningPressure;
  if (message.miningHazards) clientGameState.miningHazards = message.miningHazards;
  const wire = message.miningRocks;
  if (!wire || wire.version !== 1 || !Array.isArray(wire.rocks) || !Number.isFinite(wire.now))
    return;
  if (clientGameState.miningRocks && wire.now < clientGameState.miningRocks.now) return;
  const miningRockWire2 = clientGameState.miningRocks?.rocks.find(
    (miningRockWire) => miningRockWire.id === clientGameState.miningTarget,
  );
  clientGameState.miningRocks = wire;
  clientGameState.mining = message.mining?.version === 1 ? message.mining : null;
  const selected = wire.rocks.find(
    (miningRockWire) => miningRockWire.id === clientGameState.miningTarget,
  );
  if (!selected || (miningRockWire2 && miningRockWire2.generation !== selected.generation))
    clientGameState.miningTarget = 0;
  clientGameState.rocks = wire.rocks.map((miningRockWire) => ({
    id: miningRockWire.id,
    x: miningRockWire.x,
    y: miningRockWire.y,
    r: miningRockWire.r,
    ore: miningRockWire.ore,
    hp: miningRockWire.down ? 0 : Math.max(1, miningRockWire.hp),
  }));
  clientGameState.rockById = new Map(clientGameState.rocks.map((radius) => [radius.id, radius]));
}
