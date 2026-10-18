import {
  missionFactsHtml,
  filterMissions,
  missionFiltersHtml,
  contractPlanHtml,
} from './mission-details.js';
import { refineryJobsHtml } from './refinery_ui.js';
// 1.0.1: active mission tracking. Works out where each mission (and the main story) wants you to go, for the MISSIONS
// companion tab and the gold target markers on the galaxy map.
import { SYS, STELLARS } from '/shared/galaxy.js';
import { STORY } from '/shared/story.js';
import { route } from '/shared/rules.js';
import { TUTORIAL } from '/shared/tutorial.js';

/**
 * @typedef {'story' | 'career' | 'arc' | 'job'} MissionKind
 */

/**
 * @typedef {Object} MissionTarget
 * @property {string} key Mission unique key or ID
 * @property {MissionKind} kind Category of mission
 * @property {string} title Headline or mission name
 * @property {string} text Mission description or briefing
 * @property {string} status Progress or destination instructions
 * @property {string|null} sys System ID to fly to (or null if anywhere)
 * @property {string|null} [stellar] Destination stellar body ID
 * @property {string|null} [tag] Mission card tag or category badge
 * @property {number} [reward] Credit reward
 * @property {boolean} [urgent] Whether mission has a deadline
 * @property {boolean} [quest] Whether mission is part of a quest line
 */

/**
 * HTML-escapes a string safely for insertion into template strings.
 * @param {string | number | boolean | null | undefined} s Input value
 * @returns {string} Escaped HTML string
 */
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"]/g,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c],
  );

/**
 * Resolves the parent system ID for a given stellar body.
 * @param {string} stellar Stellar body ID
 * @returns {string|null} System ID or null
 */
const sysOf = (stellar) => (STELLARS[stellar] ? STELLARS[stellar].system : null);

/**
 * Returns formatted location string "StellarName (SystemName)".
 * @param {string} stellar Stellar body ID
 * @returns {string} Location display string
 */
const placeName = (stellar) =>
  STELLARS[stellar] ? `${STELLARS[stellar].name} (${SYS[sysOf(stellar)].name})` : '';

/**
 * Computes active mission target entries including career steps, main story, faction arcs, and job board contracts.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @returns {MissionTarget[]} Array of mission target objectives
 */
export function missionTargets(G) {
  const y = G.you;
  if (!y) return [];
  const out = [],
    S = y.story;
  const ti = y.tut ?? TUTORIAL.length,
    T = TUTORIAL[ti]; // 1.0.3: the current career step leads the list
  if (T)
    out.push({
      key: 'career',
      kind: 'career',
      title: T.title,
      text: T.text,
      status: `Career step ${ti + 1} of ${TUTORIAL.length} · reward ${T.reward.toLocaleString()} cr${T.mat ? ' + a crate' : ''}`,
      sys: null,
    });
  if (S && !S.pass) {
    if (S.active) {
      const st = STORY.find((x) => x.id === S.active.id);
      if (st) {
        let sys,
          status,
          stl = null;
        if (st.type === 'carry') {
          sys = sysOf(st.dest);
          status = `Land at ${placeName(st.dest)}.`;
          stl = st.dest;
        } else if (S.active.ready) {
          sys = sysOf(st.back);
          status = `Return to ${placeName(st.back)}.`;
          stl = st.back;
        } else {
          sys = st.sys;
          status =
            `Go to the ${SYS[st.sys].name} system.` +
            (st.count ? ` ${S.active.got || 0} / ${st.count} done.` : '');
        }
        out.push({
          key: 'story',
          kind: 'story',
          title: st.title,
          text: st.brief,
          status,
          sys,
          stellar: stl,
        });
      }
    } else if (STORY[S.step]) {
      const st = STORY[S.step];
      out.push({
        key: 'story',
        kind: 'story',
        title: st.title,
        text: 'The next part of the main story is waiting.',
        status: `Land at ${placeName(st.at)}.`,
        sys: sysOf(st.at),
        stellar: st.at,
      });
    }
  }
  for (const X of y.arcs || [])
    if (X.active) {
      // 1.2 faction arcs
      const a = X.active,
        sys = a.type === 'carry' ? sysOf(a.dest) : a.ready ? sysOf(a.back) : a.sys;
      const status =
        a.type === 'carry'
          ? `Land at ${placeName(a.dest)}.`
          : a.ready
            ? `Return to ${placeName(a.back)}.`
            : `Go to the ${SYS[a.sys].name} system.${a.count ? ` ${a.got || 0} / ${a.count} done.` : ''}`;
      out.push({
        key: 'arc-' + X.fac,
        kind: 'arc',
        title: a.title,
        text: a.brief,
        status,
        sys,
        tag: X.name,
        stellar: a.type === 'carry' ? a.dest : a.ready ? a.back : null,
      });
    }
  for (const m of y.missions || []) {
    const there = m.sys && SYS[m.sys] ? SYS[m.sys].name : '';
    let status,
      sys = m.sys || null;
    if (m.done) {
      status = 'Complete: land anywhere to collect the reward.';
      sys = null;
    } else if (m.dest && STELLARS[m.dest]) {
      status = `Land at ${placeName(m.dest)}.`;
      sys = sysOf(m.dest);
    } else if (m.type === 'patrol') status = `${m.got || 0} / ${m.need} kills in ${there}.`;
    else if (m.type === 'survey')
      status = `${(m.seen || []).length} / ${m.points ? m.points.length : 3} points in ${there}, then land anywhere.`;
    else if (m.type === 'bounty' || m.type === 'assassinate')
      status = `Destroy ${m.targetName} in ${there}.`;
    else if (m.type === 'warband')
      status = `Armada contract: destroy ${m.targetName} in ${there}, together.`; // 2.6
    else if (m.type === 'salvage')
      status = `Recover the salvage at the marked point in ${there}, then land anywhere.`;
    else if (m.type === 'rescue') status = `Find and board the ${m.wreckName} in ${there}.`;
    else status = there ? `Go to ${there}.` : '';
    if (
      !m.done &&
      m.quest &&
      !y.shipless &&
      y.shipStats &&
      (m.type === 'cargo' || m.type === 'smuggle' || m.type === 'supply') &&
      m.qty > (y.shipStats.cargo || 0)
    )
      status = `⚠ Needs ${m.qty} t of hold: switch ships for this step. ${status}`; // 2.5.2: the step waits for a ship that can do it
    if (m.deadline) {
      const left = Math.max(0, Math.ceil((m.deadline - Date.now()) / 60000));
      status = `⏱ ${left} min left · ${status}`;
    }
    out.push({
      type: m.type,
      qty: m.qty,
      pax: m.pax,
      dest: m.dest,
      done: m.done,
      team: m.team,
      stellar: m.done ? null : m.dest || null,
      key: m.id,
      kind: m.exp || m.quest ? 'arc' : 'job',
      quest: !!m.quest,
      tag: m.exp
        ? 'FARSIDE EXPEDITION'
        : m.quest
          ? `${m.quest.qid.startsWith('s:') ? 'SIDE STORY' : 'QUEST'} · ${m.quest.name.toUpperCase()} · STEP ${m.quest.step + 1}/${m.quest.of}`
          : null,
      title: m.title,
      text: m.text,
      status,
      sys,
      reward: m.reward,
      urgent: !!m.deadline,
    });
  }
  for (const q of y.quests?.active || []) {
    const waiting = q.awaitingSeats;
    if (!waiting) continue;
    out.push({
      key: 'waiting:' + q.qid,
      kind: 'arc',
      pendingQuest: q.qid,
      tag: `${q.side ? 'SIDE STORY' : 'QUEST'} · ${q.name.toUpperCase()} · STEP ${q.step + 1}/${q.of}`,
      title: waiting.title,
      text: waiting.text,
      status: `Awaiting boarding: free ${waiting.pax} passenger seats and a mission slot, then land at ${placeName(waiting.at)}. No passengers have boarded yet.`,
      sys: sysOf(waiting.at),
      stellar: waiting.at,
    });
  }
  return out;
}

// 2.4: the story journal under the active missions

/**
 * Renders the completed quests and stories journal section.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
function journalHtml(G) {
  const Q = G.you.quests;
  if (!Q || !Q.done || !Q.done.length) return '';
  return `<details class="journal"><summary>STORY JOURNAL · ${Q.done.length} finished</summary>${Q.done
    .slice()
    .reverse()
    .map(
      (x) =>
        `<div class="kv small"><span>${x.side ? '★' : '✦'} ${esc(x.name)}</span><span class="dim">${esc(x.giver)}</span></div>`,
    )
    .join('')}</details>`;
}

/**
 * Renders the MISSIONS companion tab showing active missions, plot course buttons, and journal.
 * @param {import("./main.js").ClientGameState} G Game state object
 * @returns {string} HTML markup
 */
export function missionsHtml(G) {
  const T = missionTargets(G),
    shown = filterMissions(G, T, 'mission', true),
    refinery = contractPlanHtml(G) + missionFiltersHtml(G, 'mission') + refineryJobsHtml(G);
  if (!T.length)
    return (
      refinery +
      '<div class="dim small" style="padding:6px">No active missions. Mission boards (the JOBS tab when landed) post new work every ten minutes, and the contact at each spaceport bar has a story for you.</div>' +
      journalHtml(G)
    );
  return (
    refinery +
    (!shown.length
      ? '<p class="dim small">No missions match these filters. Your other objectives are still tracked.</p>'
      : '') +
    shown
      .map((t) => {
        let jumps = '';
        if (t.sys && G.sys) {
          if (t.sys === G.sys) jumps = '<span style="color:var(--ok)">in this system</span>';
          else {
            const r = route(SYS, G.sys, t.sys);
            jumps = r && r.length ? `${r.length} jump${r.length > 1 ? 's' : ''}` : 'no known route';
          }
        }
        return `<div data-mission-key="${esc(t.key)}" class="mcard${t.kind === 'story' || t.kind === 'arc' ? ' story' : t.kind === 'career' ? ' career' : ''}${t.urgent ? ' urgent' : ''}">
      ${t.kind === 'story' ? '<div class="storytag">MAIN STORY</div>' : t.kind === 'career' ? '<div class="careertag">CAREER</div>' : t.kind === 'arc' ? `<div class="storytag">${esc(t.tag || 'FACTION STORY')}</div>` : ''}
      <div class="t">${esc(t.title)}</div>
      <div class="mstat">${esc(t.status)}</div>${missionFactsHtml(G, t, true)}
      ${t.kind === 'story' && T.some((x) => x.kind === 'career') ? `<details class="small dim"><summary>The story can wait until you know the ropes. Read more</summary>${esc(t.text)}</details>` : `<div class="dim small">${esc(t.text)}</div>`}
      <div class="mfoot"><button class="btn sm" data-pin="${esc(t.key)}" aria-pressed="${G.pinnedObjective === t.key}">${G.pinnedObjective === t.key ? 'UNPIN' : 'PIN'}</button><span class="dim small">${jumps}</span>${t.sys && t.sys !== G.sys ? `<button class="btn sm" data-plot="${esc(t.sys)}">PLOT COURSE</button>` : ''}${t.pendingQuest ? `<button class="btn sm mab" data-questdrop="${esc(t.pendingQuest)}" title="Abandon this story">✕</button>` : t.kind === 'job' || t.quest || (t.kind === 'arc' && t.tag === 'FARSIDE EXPEDITION') ? `<button class="btn sm mab" data-abandon="${esc(t.key)}" title="Drop this job">✕</button>` : ''}</div>
    </div>`;
      })
      .join('') +
    journalHtml(G)
  );
}

// One deliberate next step, inside the existing Tray; all other tracking stays visible.
export function pinnedObjectiveHtml(G) {
  const t = missionTargets(G).find((t) => t.key === G.pinnedObjective);
  if (!t) return '';
  return `<b class="small">PINNED · ${esc(t.title)}</b><div class="small">${esc(t.status)}</div><div class="mfoot">${t.sys && t.sys !== G.sys ? `<button class="btn sm" data-plot="${esc(t.sys)}">PLOT COURSE</button>` : ''}<button class="btn sm" data-pin="${esc(t.key)}" aria-label="Unpin objective">UNPIN</button></div>`;
}
