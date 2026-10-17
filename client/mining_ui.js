import { miningPanelState } from './mining-panel-state.js';
import { initTowingUI } from './towing_ui.js';
// One action entry point for keyboard and contextual cockpit button.
export function initMiningUI({
  G,
  send,
  bound,
  label,
  blocked,
  contextBlocked = blocked,
  industrialAudio = () => {},
  towAudio = () => {},
}) {
  const root = document.getElementById('miningcontrols'),
    button = document.getElementById('miningsurvey'),
    meter = document.getElementById('miningmeter');
  const indicator = document.getElementById('miningindicator');
  const close = document.getElementById('miningclose');
  const cargo = document.getElementById('miningcargo');
  let open = false,
    identity = null;
  const currentIdentity = () => (G.you ? G.you.name + ':' + G.you.ship?.hull + ':' + G.myId : null);
  function setOpen(value) {
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
  const buttonKeys = (e) => {
    if (['Enter', ' '].includes(e.key) && ['BUTTON', 'SUMMARY'].includes(e.target.tagName))
      e.stopPropagation();
  };
  indicator.addEventListener('keydown', buttonKeys);
  root.addEventListener('keydown', buttonKeys);
  root.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.stopPropagation();
      close.click();
    }
  });
  const towUI = initTowingUI({ G, send, bound, label, blocked: contextBlocked, towAudio, root });
  function invokeMiningAction(action) {
    if (blocked() || G.paused || G.landed || !G.you || !G.view || !miningPanelState(G).visible)
      return false;
    if (action === 'miningPanel') {
      setOpen(!open);
      return true;
    }
    if (['towToggle', 'towDeliver', 'towOffer', 'towAccept'].includes(action))
      return towUI.invoke(action);
    if (action === 'miningGroup') {
      send({ t: 'miningPressure', op: G.miningPressure?.groupConsent ? 'leave' : 'join' });
      return true;
    }
    if (action === 'dredgeInput' || action === 'dredgeOff') {
      if (G.you.ship?.hull !== 815) return false;
      send(
        action === 'dredgeOff'
          ? { t: 'industrial', op: 'off' }
          : { t: 'industrial', op: 'recipe', recipe: recipes.value, grade: grade.value },
      );
      return true;
    }
    if (['dredgeSweep', 'dredgeHarvest', 'dredgeSmelter'].includes(action)) {
      if (G.you.ship?.hull !== 815) return false;
      send({
        t: 'industrial',
        op: { dredgeSweep: 'sweep', dredgeHarvest: 'harvest', dredgeSmelter: 'smelter' }[action],
      });
      return true;
    }
    if (action !== 'surveyPulse' || blocked() || !G.you || !G.view || G.landed || G.paused)
      return false;
    const m = G.mining;
    if (m && m.cooldownUntil > m.now) return false;
    send({ t: 'mining', op: 'survey' });
    return true;
  }
  function refresh() {
    towUI.refresh();
    const state = miningPanelState(G);
    const fly = state.visible && document.getElementById('login').classList.contains('hidden');
    const nextIdentity = currentIdentity();
    if (!fly || nextIdentity !== identity) setOpen(false);
    identity = nextIdentity;
    indicator.classList.toggle('hidden', !fly);
    root.classList.toggle('hidden', !fly || !open);
    indicator.title = state.active
      ? 'Mining operations active — open controls'
      : 'Open mining controls';
    indicator.classList.toggle('active', state.active);
    indicator.setAttribute(
      'aria-label',
      G.miningPressure?.warn
        ? 'Mining controls — high mining noise'
        : state.active
          ? 'Mining controls — operations active'
          : 'Mining controls',
    );
    indicator.title += ` · ${label(bound('miningPanel'))}`;
    consent.textContent = `${G.miningPressure?.groupConsent ? 'Leave' : 'Join'} group mining · ${label(bound('miningGroup'))}`;
    choose.textContent = `SET INPUT · ${label(bound('dredgeInput'))}`;
    off.textContent = `ALL OFF · ${label(bound('dredgeOff'))}`;
    const danger = G.miningPressure?.warn;
    indicator.classList.toggle('warning', !!danger);
    cargo.textContent =
      state.free > 0
        ? state.free + ' / ' + state.capacity + ' t free'
        : 'Hold full — unload cargo to collect more';
    if (danger) cargo.textContent += ' · Mining noise is high — danger may follow';
    if (!fly) {
      industrialAudio(false, 0);
      return;
    }
    industrial.hidden = G.you?.ship?.hull !== 815;
    const im = G.industrial || G.you?.industrial;
    if (im) {
      industrialAudio(!!im.inputs.sweep, im.heat);
      heat.textContent = `SHIP HEAT ${im.heat.toFixed(0)}/100 · ${im.heat >= 150 ? 'CRITICAL HULL DAMAGE' : im.heat >= 120 ? 'SHIELD DRAIN' : im.heat >= 70 ? 'WARNING' : 'SAFE'} · ${im.reason} · ${im.safeSeconds.toFixed(0)}s to cutoff`;
      for (const [action, b] of industrialButtons) {
        const mode = { dredgeSweep: 'sweep', dredgeHarvest: 'harvest', dredgeSmelter: 'smelter' }[
          action
        ];
        b.textContent = `${mode.toUpperCase()} ${im[mode] ? 'ON' : 'OFF'} · ${label(bound(action))}`;
        b.disabled = blocked() || G.paused;
      }
      property.textContent = `Heat sources: SWEEP ${im.inputs.sweep.toFixed(1)} / SMELTER ${im.inputs.smelter.toFixed(1)} / CORONA ${im.inputs.corona.toFixed(1)}. Mobile: ${im.workMs / 1000}/10s per input tonne · ${Object.entries(
        im.outputs,
      )
        .map(([k, v]) => k + ' ' + v + '/300')
        .join(
          ' ',
        )}. 70% recovery, 6 input t/min, no offline work. ${im.stock} ${(im.bands || []).map((b) => 'ENTRY ' + b.entry.x + ',' + b.entry.y + ' → EAST').join(' ')}`;
    }
    const m = G.mining,
      remaining = Math.max(0, (m?.cooldownUntil || 0) - (m?.now || 0));
    button.textContent = `Scan nearby rocks · ${label(bound('surveyPulse'))}${remaining ? ` · ${Math.ceil(remaining)}s` : ''}`;
    button.disabled = blocked() || !!G.paused || remaining > 0;
    const record = G.miningRocks?.rocks.find((r) => r.id === G.miningTarget);
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
  const industrialButtons = [];
  for (const action of ['dredgeSweep', 'dredgeHarvest', 'dredgeSmelter']) {
    const b = document.createElement('button');
    b.title = {
      dredgeSweep: 'Collect loose field material',
      dredgeHarvest: 'Collect plasma in a stellar corona',
      dredgeSmelter: 'Process carried material aboard the ship',
    }[action];
    b.className = 'btn sm';
    b.id = action;
    b.onclick = () => invokeMiningAction(action);
    industrialButtons.push([action, b]);
    industrial.append(b);
  }
  const recipes = document.createElement('select');
  recipes.id = 'mobilerecipe';
  recipes.setAttribute('aria-label', 'Material to process');
  for (const [id, name] of [
    ['alloy', 'Ore → Alloy'],
    ['cells', 'Gas → Cells'],
    ['cut', 'Shards → Crystal'],
  ]) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = name;
    recipes.append(o);
  }
  const grade = document.createElement('select');
  grade.id = 'mobilegrade';
  grade.setAttribute('aria-label', 'Input material quality');
  for (const id of ['common', 'rich', 'pure']) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    grade.append(o);
  }
  const choose = document.createElement('button');
  choose.className = 'btn sm';
  choose.textContent = 'SET INPUT';
  choose.onclick = () => invokeMiningAction('dredgeInput');
  const off = document.createElement('button');
  off.className = 'btn sm';
  off.id = 'industrialoff';
  off.textContent = 'ALL OFF';
  off.onclick = () => invokeMiningAction('dredgeOff');
  industrial.append(recipes, grade, choose, off);
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
export function receiveMining(G, message) {
  if (Object.hasOwn(message, 'towing')) G.towing = message.towing;
  if (Object.hasOwn(message, 'industrial')) G.industrial = message.industrial;
  if (message.miningPressure) G.miningPressure = message.miningPressure;
  if (message.miningHazards) G.miningHazards = message.miningHazards;
  const wire = message.miningRocks;
  if (!wire || wire.version !== 1 || !Array.isArray(wire.rocks) || !Number.isFinite(wire.now))
    return;
  if (G.miningRocks && wire.now < G.miningRocks.now) return;
  const old = G.miningRocks?.rocks.find((r) => r.id === G.miningTarget);
  G.miningRocks = wire;
  G.mining = message.mining?.version === 1 ? message.mining : null;
  const selected = wire.rocks.find((r) => r.id === G.miningTarget);
  if (!selected || (old && old.generation !== selected.generation)) G.miningTarget = 0;
  G.rocks = wire.rocks.map((r) => ({
    id: r.id,
    x: r.x,
    y: r.y,
    r: r.r,
    ore: r.ore,
    hp: r.down ? 0 : Math.max(1, r.hp),
  }));
  G.rockById = new Map(G.rocks.map((r) => [r.id, r]));
}
