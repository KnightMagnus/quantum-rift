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
  const towUI = initTowingUI({ G, send, bound, label, blocked: contextBlocked, towAudio, root });
  function invokeMiningAction(action) {
    if (action === 'towToggle') return towUI.invoke();
    if (['dredgeSweep', 'dredgeHarvest', 'dredgeSmelter'].includes(action)) {
      if (blocked() || G.paused || G.landed || !G.view) return false;
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
    const fly = !!G.you && !G.landed && !!G.view;
    root.classList.toggle('hidden', !fly);
    if (!fly) {
      industrialAudio(false, 0);
      return;
    }
    industrial.hidden = G.you?.ship?.hull !== 815;
    const im = G.industrial || G.you?.industrial;
    if (im) {
      industrialAudio(!!im.inputs.sweep, im.heat);
      heat.textContent = `SHIP HEAT ${im.heat.toFixed(0)}/100 · ${im.heat >= 150 ? 'CRITICAL HULL DAMAGE' : im.heat >= 120 ? 'SHIELD DRAIN' : im.heat >= 70 ? 'WARNING' : 'SAFE'} · ${im.reason} · sources SWEEP ${im.inputs.sweep.toFixed(1)} / SMELTER ${im.inputs.smelter.toFixed(1)} / CORONA ${im.inputs.corona.toFixed(1)} · ${im.safeSeconds.toFixed(0)}s to cutoff`;
      for (const [action, b] of industrialButtons) {
        const mode = { dredgeSweep: 'sweep', dredgeHarvest: 'harvest', dredgeSmelter: 'smelter' }[
          action
        ];
        b.textContent = `${mode.toUpperCase()} ${im[mode] ? 'ON' : 'OFF'} · ${label(bound(action))}`;
        b.disabled = blocked() || G.paused;
      }
      property.textContent = `Mobile: ${im.workMs / 1000}/10s per input tonne · ${Object.entries(
        im.outputs,
      )
        .map(([k, v]) => k + ' ' + v + '/300')
        .join(
          ' ',
        )}. 70% recovery, 6 input t/min, no offline work. ${im.stock} ${(im.bands || []).map((b) => 'ENTRY ' + b.entry.x + ',' + b.entry.y + ' → EAST').join(' ')}`;
    }
    const m = G.mining,
      remaining = Math.max(0, (m?.cooldownUntil || 0) - (m?.now || 0));
    button.textContent = `SURVEY · ${label(bound('surveyPulse'))}${remaining ? ` · ${Math.ceil(remaining)}s` : ''}`;
    button.disabled = blocked() || !!G.paused || remaining > 0;
    const record = G.miningRocks?.rocks.find((r) => r.id === G.miningTarget);
    meter.textContent = record?.down
      ? `${(record.lastCut || 'ordinary').toUpperCase()} ${record.gas ? 'VENT' : 'FRACTURE'} · graded material released`
      : record && !record.down
        ? `${record.gas ? 'ROCK HEAT · VENT / PRESSURE' : 'ROCK HEAT / CUT'} · Stage ${record.stage + 1}/${record.stages} · ${Math.round(record.heat)}/100 · ${record.work.toFixed(1)}s · ${record.ready ? 'READY — release at 60–80' : record.acquired ? 'SEAM ACQUIRED' : 'hold contact 0.6s'}`
        : 'Aim a mining tool · select a rock for heat / work · clean release 60–80';
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
  industrial.append(heat, property);
  const industrialButtons = [];
  for (const action of ['dredgeSweep', 'dredgeHarvest', 'dredgeSmelter']) {
    const b = document.createElement('button');
    b.className = 'btn sm';
    b.id = action;
    b.onclick = () => invokeMiningAction(action);
    industrialButtons.push([action, b]);
    industrial.append(b);
  }
  const recipes = document.createElement('select');
  recipes.id = 'mobilerecipe';
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
  for (const id of ['common', 'rich', 'pure']) {
    const o = document.createElement('option');
    o.value = id;
    o.textContent = id;
    grade.append(o);
  }
  const choose = document.createElement('button');
  choose.className = 'btn sm';
  choose.textContent = 'SET INPUT';
  choose.onclick = () =>
    send({ t: 'industrial', op: 'recipe', recipe: recipes.value, grade: grade.value });
  const off = document.createElement('button');
  off.className = 'btn sm';
  off.id = 'industrialoff';
  off.textContent = 'ALL OFF';
  off.onclick = () => send({ t: 'industrial', op: 'off' });
  industrial.append(recipes, grade, choose, off);
  root.append(industrial);
  const consent = document.createElement('button');
  consent.className = 'btn sm';
  consent.textContent = 'GROUP MINING: OPT IN';
  consent.id = 'miningconsent';
  root.append(consent);
  consent.onclick = () =>
    send({ t: 'miningPressure', op: G.miningPressure?.groupConsent ? 'leave' : 'join' });
  setInterval(() => {
    consent.textContent = `${G.miningPressure?.groupConsent ? 'LEAVE' : 'OPT IN'} GROUP MINING · ${G.miningPressure?.warn ? 'WARNING ' : ''}NOISE ${Math.round(G.miningPressure?.noise || 0)}/100`;
    consent.title = 'Separate consent for current flight; Armada membership alone is not consent.';
  }, 500);
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
