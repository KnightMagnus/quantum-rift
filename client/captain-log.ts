import type { ClientGameState } from './main.ts';
import { missionTargets } from './missions.ts';
import { escapeDoubleQuotedHtml as escapeHtml } from './html.ts';

/** Show disclosed objectives and saved events without looking ahead in story content. */
export function captainLogHtml(state: ClientGameState): string {
  if (!state.you) return '';
  const objectives = missionTargets(state);
  const current = objectives.find((objective) => objective.kind === 'story');
  const optional = objectives.filter((objective) => objective !== current);
  const card = (objective: (typeof objectives)[number]) =>
    `<article class="mcard"><h3>${escapeHtml(objective.title)}</h3><p>${escapeHtml(objective.status)}</p><p>${escapeHtml(objective.text)}</p></article>`;
  const history = [...state.you.log].reverse();
  return `<section aria-label="Current objective"><h2>CURRENT OBJECTIVE</h2>${current ? card(current) : '<p>No main objective is active. Check the Jobs board at a spaceport.</p>'}</section>
    <section aria-label="Preparation"><h2>PREPARATION</h2><p>Repair and refuel before departure. Check ammunition, available hold and passenger seats against the briefing. Strength estimates compare equipment, not the outcome of a fight; range, support and piloting matter.</p></section>
    <section aria-label="Other objectives"><h2>OTHER OBJECTIVES</h2>${optional.map(card).join('') || '<p>No other objectives are tracked.</p>'}</section>
    <section aria-label="Captain history"><h2>HISTORY</h2><p class="dim small">Recent saved events, including insurance charges after ship loss.</p>${history.map((event) => `<article class="logentry"><div class="d">${escapeHtml(new Date(event.t).toLocaleString())}</div>${escapeHtml(event.text)}</article>`).join('') || '<p>No events recorded yet.</p>'}</section>`;
}
