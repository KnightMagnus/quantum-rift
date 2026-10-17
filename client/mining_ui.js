// One action entry point for keyboard and contextual cockpit button.
export function initMiningUI({ G, send, bound, label, blocked }) {
  const root = document.getElementById('miningcontrols'),
    button = document.getElementById('miningsurvey'),
    meter = document.getElementById('miningmeter');
  function invokeMiningAction(action) {
    if (action !== 'surveyPulse' || blocked() || !G.you || !G.view || G.landed || G.paused)
      return false;
    const m = G.mining;
    if (m && m.cooldownUntil > m.now) return false;
    send({ t: 'mining', op: 'survey' });
    return true;
  }
  function refresh() {
    const fly = !!G.you && !G.landed && !!G.view;
    root.classList.toggle('hidden', !fly);
    if (!fly) return;
    const m = G.mining,
      remaining = Math.max(0, (m?.cooldownUntil || 0) - (m?.now || 0));
    button.textContent = `SURVEY · ${label(bound('surveyPulse'))}${remaining ? ` · ${Math.ceil(remaining)}s` : ''}`;
    button.disabled = blocked() || !!G.paused || remaining > 0;
    const record = G.miningRocks?.rocks.find((r) => r.id === G.miningTarget);
    meter.textContent = record?.down
      ? `${(record.lastCut || 'ordinary').toUpperCase()} ${record.gas ? 'VENT' : 'FRACTURE'} · graded material released`
      : record && !record.down
        ? `${record.gas ? 'VENT / PRESSURE' : 'CUT / HEAT'} · Stage ${record.stage + 1}/${record.stages} · ${Math.round(record.heat)}/100 · ${record.work.toFixed(1)}s · ${record.ready ? 'READY — release at 60–80' : record.acquired ? 'SEAM ACQUIRED' : 'hold contact 0.6s'}`
        : 'Aim a mining tool · select a rock for heat / work · clean release 60–80';
  }
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
