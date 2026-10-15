// Quantum Rift 2.4: questlines. Contacts at spaceport bars offer multi-step jobs that tell a small story, and six
// handcrafted side stories wait at particular worlds. Each step is an ordinary job tagged with `m.quest`; finishing it
// tells the next part of the story and posts the next step. Mixed into Game.
import { SYSTEMS, SYS, STELLARS, FACTIONS, COMMODITIES, MATERIALS, GRADES, TRAFFIC } from '../shared/galaxy.js';
import { CHAINS, SIDE_STORIES, CONTACT_TITLES } from '../shared/quests.js';
import { OFFICER_NAMES, RACE_ROLES, ROLES } from '../shared/hangar.js';
import { SPECIALISTS } from '../shared/specialty.js';
import { credits } from '../shared/rules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const hash = (str) => { let h = 2166136261; for (const c of String(str)) h = Math.imul(h ^ c.charCodeAt(0), 16777619); return h >>> 0; };
const rng = (seed) => () => { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
const pick = (r, a) => a[Math.floor(r() * a.length)];
export const QUEST_MAX = 3;                    // quests in progress at once
export const CONTACT_COOL_MIN = 15;            // a contact needs this long before offering the next story
export const STANDING = ['Stranger', 'Acquaintance', 'Trusted', 'Friend', 'Old Friend'];
const SHIP_NAMES = ['Marigold', 'Fair Exchange', 'Iron Psalm', 'Tessaly', 'Quiet Harbour', 'Penny Royal', 'Lark Ascending', 'Ninefold', 'Brass Hope', 'Westering', 'Small Mercy', 'Old Reliable'];
const VILLAINS = ['"Grin" Haskell', 'Vessa the Hook', 'Captain Ashmore', 'the Tallow Knight', 'Corvin Blackwake', 'Mother Ninegraves', 'Sallow Jack', 'the Widow Fenn'];
const portsOf = (sys) => SYS[sys].stellars.filter(x => x.svc.includes('L') && !x.site);
const JCACHE = {};
const jumpsFrom = (a) => JCACHE[a] || (JCACHE[a] = (() => { const d = { [a]: 0 }, q = [a]; while (q.length) { const x = q.shift(); for (const l of SYS[x].links) if (d[l] === undefined) { d[l] = d[x] + 1; q.push(l); } } return d; })());
const raceOf = (fac) => RACE_ROLES[fac] ? fac : 'quantum';

// 2.5.2: the most hold space and bunks any step of a story will ask for, so the job board can warn before you take it on
export const needsOf = (steps) => ({ hold: Math.max(0, ...steps.map(st => st.type === 'cargo' ? st.qty || 4 : st.type === 'smuggle' ? st.qty || 3 : st.type === 'supply' ? st.qty || 0 : 0)),
  pax: Math.max(0, ...steps.map(st => st.type === 'passenger' ? st.pax || 1 : 0)) });
export const QuestOperations = {
  questInit(d) { const q = d.quests = d.quests || {}; q.active = q.active || {}; q.done = q.done || []; q.contacts = q.contacts || {}; q.sides = q.sides || {}; return q; },
  // every bar has a contact; who they are depends only on the world
  contactAt(p) {
    if (!p || p.site || !p.svc.includes('B')) return null;
    const r = rng(hash('contact:' + p.id)), S = SYS[p.system], F = FACTIONS[S.faction] || {};
    const kind = p.outlaw || F.pirate ? 'shady' : (S.danger >= 3 || S.farside || F.region) ? 'wild' : 'lawful';
    const race = raceOf(r() < 0.75 ? S.faction : pick(r, Object.keys(RACE_ROLES))), N = OFFICER_NAMES[race];
    return { id: 'c:' + p.id, at: p.id, kind, race, name: pick(r, N[0]) + ' ' + pick(r, N[1]), title: pick(r, CONTACT_TITLES[kind]) };
  },
  questsPayload(d) {
    const q = this.questInit(d);
    return { active: Object.values(q.active).map(a => ({ qid: a.qid, name: a.name, giver: a.giver, at: a.at, step: a.step, of: a.steps.length, side: !!a.side })),
      done: q.done.slice(-30), contacts: Object.fromEntries(Object.entries(q.contacts).map(([k, c]) => [k, { n: c.n || 0 }])) };
  },
  // ---- what a bar offers you: a side story that starts here, or this contact's next story
  questOffers(p, d) {
    const q = this.questInit(d), out = []; if (!p || !p.svc.includes('B') || p.site) return out;
    const full = Object.keys(q.active).length >= QUEST_MAX;
    for (const X of SIDE_STORIES) if (X.at === p.id && !q.sides[X.id] && !q.active['s:' + X.id])
      out.push({ id: 'q:s:' + X.id, type: 'quest', side: X.id, title: `★ ${X.name}`, giver: X.giver, sys: STELLARS[X.steps[0].sys] ? STELLARS[X.steps[0].sys].system : X.steps[0].sys,
        steps: X.steps.length, reward: X.reward.credits, full, text: X.intro, rewardText: this.questRewardText(X.reward), needs: needsOf(X.steps) });
    const C = this.contactAt(p); if (!C) return out;
    const cs = q.contacts[C.id] || {}, busy = Object.values(q.active).some(a => a.contact === C.id);
    if (busy || (cs.cool || 0) > Date.now()) return out;
    const cur = this.contactStory(p, d, C); if (!cur) return out; const { X, plan } = cur;
    const lvl = Math.min(STANDING.length - 1, cs.n || 0), reward = this.chainReward(X, lvl);
    out.push({ id: 'q:c:' + C.id + ':' + X.id + ':' + (cs.n || 0), type: 'quest', story: X.id, title: `✦ ${X.name}`, giver: `${C.name}, ${C.title}`, standing: STANDING[lvl],
      sys: plan.A, steps: X.steps.length, reward: reward.credits, full, text: this.fill(X.intro, plan), rewardText: this.questRewardText(reward), needs: needsOf(X.steps) });
    return out;
  },
  // which story this contact has for you next, and where it happens (the same every time you ask, until you finish one)
  contactStory(p, d, C) {
    const cs = this.questInit(d).contacts[C.id] || {}, pool = CHAINS.filter(X => X.kind === 'any' || X.kind === C.kind);
    const r = rng(hash(d.name + C.id + (cs.n || 0))), fresh = pool.filter(x => !(cs.last || []).includes(x.id));
    const X = (fresh.length ? fresh : pool)[Math.floor(r() * (fresh.length || pool.length))], plan = this.questPlan(p, d, X, C, r);
    return plan ? { X, plan } : null;
  },
  chainReward(X, lvl) { const n = X.steps.length; return { credits: Math.round((14000 + n * 7000) * (1 + 0.2 * lvl)), crate: [null, Math.min(4, 1 + Math.floor(lvl / 2) + (n >= 4 ? 1 : 0))], officer: lvl >= 2 && lvl % 2 === 0 ? 'any' : null, bp: lvl >= 3 ? 3 + lvl : 0 }; },
  questRewardText(R) {
    const a = [`${credits(R.credits)} credits`]; if (R.crate) a.push(`a ${R.crate[0] || 'material'} ${GRADES[R.crate[1]]} crate`);
    if (R.officer) a.push('a new officer'); if (R.bp) a.push(`${R.bp} specialist blueprints`); return a.join(', ');
  },
  // the places a generated story happens: A is close (1-2 jumps), B a little further and different from A
  questPlan(p, d, X, C, r) {
    const all = Object.entries(jumpsFrom(p.system)).filter(([s, n]) => n >= 1 && n <= 4 && portsOf(s).length && SYS[s].faction !== 'umbral' && !SYS[s].arena);
    const cap = Math.max(2, (SYS[p.system].danger || 0) + 1), calm = all.filter(([s]) => (SYS[s].danger || 0) <= cap);   // stories stay about as dangerous as where they start
    const near = calm.filter(([, n]) => n <= 2).length ? calm : all;
    const A_ = near.filter(([, n]) => n <= 2), B_ = near.filter(([s, n]) => n >= 2);
    if (!A_.length) return null;
    const A = pick(r, A_)[0], Bp = B_.filter(([s]) => s !== A), B = Bp.length ? pick(r, Bp)[0] : (near.find(([s]) => s !== A) || [A])[0];
    const X1 = pick(r, portsOf(A)), Y1 = pick(r, portsOf(B));
    return { W: p.id, Wsys: p.system, A, B, X: X1.id, Y: Y1.id, ship: pick(r, SHIP_NAMES), target: pick(r, VILLAINS), contact: C ? C.name : '' };
  },
  fill(t, P) {
    const nm = (id) => STELLARS[id] ? STELLARS[id].name : id;
    return String(t).replace(/\{(\w+)\}/g, (m, k) => k === 'W' || k === 'X' || k === 'Y' ? nm(P[k]) : k === 'Wsys' || k === 'A' || k === 'B' ? (SYS[P[k]] ? SYS[P[k]].name : '') : P[k] != null ? P[k] : m);
  },
  // ---- accepting
  questStart(s, o) {
    const d = s.data, q = this.questInit(d), p = STELLARS[d.stellar];
    if (Object.keys(q.active).length >= QUEST_MAX) return this.toast(s, `You can follow at most ${QUEST_MAX} stories at once. Finish or abandon one first.`);
    if (d.missions.length >= 6) return this.toast(s, 'You already have six jobs.');
    let Q;
    if (o.side) {
      const X = SIDE_STORIES.find(x => x.id === o.side); if (!X) return;
      Q = { qid: 's:' + X.id, side: X.id, name: X.name, giver: X.giver, at: X.at, plan: { W: X.at, Wsys: STELLARS[X.at].system, contact: X.giver }, steps: X.steps.map(st => ({ ...st })), step: 0, started: Date.now(), tries: 0 };
    } else {
      const C = this.contactAt(p), cur = C && this.contactStory(p, d, C); if (!cur || cur.X.id !== o.story) return;
      const cs = q.contacts[C.id] || {}, X = cur.X, plan = cur.plan;
      Q = { qid: 'c:' + C.id.slice(2) + ':' + X.id, chain: X.id, contact: C.id, name: X.name, giver: `${C.name}, ${C.title}`, at: p.id, plan, steps: X.steps.map(st => ({ ...st })), step: 0, started: Date.now(), tries: 0,
            lvl: Math.min(STANDING.length - 1, cs.n || 0) };
    }
    q.active[Q.qid] = Q;
    this.log(d, `Story begun: ${Q.name} (${Q.giver}).`);
    this.questPush(s, Q, true);
    this.db.touch(); this.you(s); this.landed(s);
  },
  // turn a step into a concrete job
  questStepJob(d, Q, i) {
    const st = Q.steps[i], P = Q.plan, r = rng(hash(Q.qid + i + Q.started));
    const sys = st.sys || (st.where === 'W' ? P.Wsys : st.where === 'B' ? P.B : P.A);
    const port = st.sys ? portsOf(st.sys)[0].id : st.where === 'W' ? P.W : st.where === 'B' ? P.Y : P.X;
    const S = SYS[sys], jumps = 2, dz = S.danger || 1;
    const F = (t) => this.fill(t, { ...P, target: st.target || P.target });
    const m = { id: `${Q.qid}#${i}`, quest: { qid: Q.qid, step: i, of: Q.steps.length, name: Q.name }, type: st.type, sys, title: F(st.title), text: F(st.brief), taken: Date.now(), owner: null };
    switch (st.type) {
      case 'cargo': Object.assign(m, { dest: port, cid: st.cid || 'equipment', qty: st.qty || 4, reward: Math.round(1500 + jumps * 1200 + (st.qty || 4) * 90) }); if (st.rush) { m.rush = st.rush; m.deadline = Date.now() + st.rush * 60000; } break;
      case 'smuggle': Object.assign(m, { dest: port, qty: st.qty || 3, reward: Math.round(8000 + (st.qty || 3) * 600) }); break;
      case 'passenger': Object.assign(m, { dest: port, pax: st.pax || 1, reward: Math.round(2500 + (st.pax || 1) * 1200) }); break;
      case 'supply': Object.assign(m, { dest: port, cid: st.cid, qty: st.qty, reward: Math.round((COMMODITIES.find(c => c.id === st.cid) || { base: 100 }).base * st.qty * 1.5 + 3000) }); break;
      case 'survey': { const pts = S.stellars.slice(0, 3).map(x => [x.x, x.y]); while (pts.length < 3) { const a = r() * 6.28, dd = 900 + r() * 1100; pts.push([Math.round(Math.cos(a) * dd), Math.round(Math.sin(a) * dd)]); }
        Object.assign(m, { points: pts, reward: Math.round(4000 + dz * 1200) }); break; }
      case 'salvage': { const a = r() * 6.28, dd = 1200 + r() * 900; Object.assign(m, { point: [Math.round(Math.cos(a) * dd), Math.round(Math.sin(a) * dd)], reward: Math.round(4500 + dz * 1200) }); break; }
      case 'rescue': Object.assign(m, { hull: pick(r, [704, 705, 707]), faction: 'spacer', wreckName: P.ship || pick(r, SHIP_NAMES), reward: Math.round(5000 + dz * 1500) }); break;
      case 'bounty': { const fac = st.hostile || 'hollow', pool = TRAFFIC[fac].war.filter(h => this.A.ships[h]).sort((a, b) => (this.A.ships[a].strength || 0) - (this.A.ships[b].strength || 0));
        const hull = pool[Math.min(pool.length - 1, Math.floor(pool.length * (0.25 + 0.15 * Math.min(4, dz))))], nm = st.target || P.target;
        Object.assign(m, { hull, faction: fac, targetName: nm, reward: Math.round(5000 + (this.A.ships[hull].strength || 20) * 60) }); break; }
      case 'assassinate': { const ff = st.hostile || 'hollow'; Object.assign(m, { hull: ff === 'umbral' ? 763 : 717, guard: ff === 'umbral' ? 761 : 711, faction: ff, targetName: st.target || P.target, reward: Math.round(22000 + dz * 5000) }); break; }
      case 'convoy': { const dest = pick(r, portsOf(sys)); Object.assign(m, { dest: dest.id, hull: pick(r, [704, 706, 712]), faction: 'spacer', convoyName: Q.side === 'caravan' ? 'Clockwork' : pick(r, SHIP_NAMES), raiders: 2 + Math.min(2, dz >> 1), raiderHull: pick(r, [705, 708, 711]), reward: Math.round(6000 + dz * 2500) });
        m.text = `${m.text} She is bound for ${dest.name}.`; break; }
      case 'patrol': Object.assign(m, { need: st.need || 3, got: 0, reward: Math.round(3000 + (st.need || 3) * 2000 + dz * 1500) }); break;
    }
    if (Q.side) m.reward = Math.round(m.reward * 1.25);
    return m;
  },
  questPush(s, Q, first) {
    const d = s.data, m = this.questStepJob(d, Q, Q.step); m.owner = s.id;
    d.missions = d.missions.filter(x => x.id !== m.id); d.missions.push(m);
    if (m.type === 'cargo' || m.type === 'smuggle') { const free = this.stats(d).cargo - this.holdUsed(d); if (free < 0) this.toast(s, `${Q.name}: this step needs ${m.qty} t of hold space. Clear some room.`); }
    if (!first) this.toast(s, `${Q.name}, step ${Q.step + 1} of ${Q.steps.length}: ${m.title}.`);
  },
  // a step was paid (called from completeOnLanding)
  questAdvance(s, m) {
    const d = s.data, q = this.questInit(d), Q = q.active[m.quest.qid]; if (!Q || Q.step !== m.quest.step) return;
    const st = Q.steps[Q.step], P = { ...Q.plan, target: st.target || Q.plan.target };
    Q.step++; Q.tries = 0;
    if (Q.step >= Q.steps.length) return this.questFinish(s, Q);
    const next = this.questStepJob(d, Q, Q.step);
    this.send(s, { t: 'story', tag: `${Q.side ? 'SIDE STORY' : 'QUEST'} · ${Q.name.toUpperCase()}`, title: m.title, done: true,
      text: `${this.fill(st.beat || '', P)}\n\nNext (step ${Q.step + 1} of ${Q.steps.length}): ${next.title}. ${next.text}` });
    this.questPush(s, Q, true); this.db.touch();
  },
  questFinish(s, Q) {
    const d = s.data, q = this.questInit(d); delete q.active[Q.qid];
    let R, endText, X;
    if (Q.side) { X = SIDE_STORIES.find(x => x.id === Q.side); R = X.reward; q.sides[Q.side] = Date.now(); endText = X.end; }
    else {
      X = CHAINS.find(x => x.id === Q.chain); R = this.chainReward(X, Q.lvl || 0); endText = this.fill(X.end, Q.plan);
      const cs = q.contacts[Q.contact] = q.contacts[Q.contact] || {}; cs.n = (cs.n || 0) + 1; cs.cool = Date.now() + CONTACT_COOL_MIN * 60000; cs.last = [Q.chain, ...(cs.last || [])].slice(0, 3);
    }
    const got = [`${credits(R.credits)} credits`]; d.credits += R.credits; d.stats.earned += R.credits;
    if (R.crate) { const mt = R.crate[0] || MATERIALS[Math.floor(Math.random() * MATERIALS.length)], g = R.crate[1]; d.mats[mt][g] = (d.mats[mt][g] || 0) + 1; got.push(`a ${mt} ${GRADES[g]} crate`); }
    if (R.bp) { const sp = SPECIALISTS[Math.abs(hash(Q.qid)) % SPECIALISTS.length]; d.bp = d.bp || {}; d.bp[sp.id] = (d.bp[sp.id] || 0) + R.bp; got.push(`${R.bp} ${sp.name} blueprints`); }
    if (R.officer) {
      d.officers = d.officers || [];
      if (d.officers.length < 24) {
        const race = R.officer === 'any' ? raceOf(SYS[STELLARS[Q.at].system].faction) : R.officer, roles = RACE_ROLES[race] || ['engineer'], N = OFFICER_NAMES[race];
        const o = { id: this.uid(d), name: N[0][Math.floor(Math.random() * N[0].length)] + ' ' + N[1][Math.floor(Math.random() * N[1].length)], race, role: roles[Math.floor(Math.random() * roles.length)], rarity: 2, lv: 3, xp: 0 };
        d.officers.push(o); got.push(`${o.name} joins your crew (Rare ${ROLES[o.role] ? ROLES[o.role].name.toLowerCase() : o.role})`);
      } else got.push('(no room on your roster for the officer who offered to join)');
    }
    const fac = SYS[STELLARS[Q.at].system].faction; if (FACTIONS[fac] && !FACTIONS[fac].pirate) d.rep[fac] = clamp((d.rep[fac] || 0) + (Q.side ? 8 : 4), -100, 100);
    q.done.push({ id: Q.qid, name: Q.name, giver: Q.giver, side: !!Q.side, t: Date.now() });
    this.log(d, `Story complete: ${Q.name}.`);
    this.send(s, { t: 'story', tag: `${Q.side ? 'SIDE STORY' : 'QUEST'} COMPLETE · ${Q.name.toUpperCase()}`, title: Q.name, done: true, text: `${endText}\n\nRewards: ${got.join(', ')}.` });
    this.db.touch(); this.you(s);
  },
  questFail(s, qid, why) {
    const d = s.data, q = this.questInit(d), Q = q.active[qid]; if (!Q) return;
    delete q.active[qid]; d.missions = d.missions.filter(m => !(m.quest && m.quest.qid === qid));
    if (Q.contact) { const cs = q.contacts[Q.contact] = q.contacts[Q.contact] || {}; cs.cool = Date.now() + CONTACT_COOL_MIN * 60000; }
    this.toast(s, `Story ended: ${Q.name} (${why}).${Q.side ? ' You can start it again where it began.' : ''}`); this.log(d, `Story ended: ${Q.name} (${why}).`); this.db.touch();
  },
  // every two seconds: a step lost with your ship, a missed deadline or a destroyed convoy gets one more chance
  questSweep(s) {
    const d = s.data, q = d.quests; if (!q || !q.active) return;
    for (const Q of Object.values(q.active)) {
      if (d.missions.some(m => m.quest && m.quest.qid === Q.qid)) continue;
      if (Q.tries >= 1) { this.questFail(s, Q.qid, 'the job failed twice'); this.you(s); continue; }
      Q.tries++; this.questPush(s, Q, true); this.toast(s, `${Q.name}: the step failed, but the story isn't over. Try again: ${Q.steps[Q.step] ? this.fill(Q.steps[Q.step].title, Q.plan) : ''}.`); this.db.touch(); this.you(s);
    }
  },
  // ---- the contact's talk at the bar: a greeting that knows you, and a rumour worth acting on
  barTalk(p, d) {
    const C = this.contactAt(p); if (!C) return null;
    const q = this.questInit(d), n = (q.contacts[C.id] || {}).n || 0, lvl = Math.min(STANDING.length - 1, n), win = Math.floor(Date.now() / 600000), r = rng(hash(C.id + win));
    const hello = [
      [`"Haven't seen you in here before, Captain."`, `"New face. Pull up a stool."`, `"Buy a drink and I might have work for you."`],
      [`"Back again? Good. I remember a reliable pilot."`, `"Captain ${d.name}. Your usual?"`],
      [`"There's my favourite captain. Sit, sit."`, `"I was hoping you'd come by."`],
      [`"${d.name}! The drinks are on me tonight."`, `"I tell everyone about you, you know."`],
      [`"Old friend. Whatever you need, it's yours."`],
    ][lvl];
    const rumors = [], near = Object.entries(jumpsFrom(p.system)).filter(([, j]) => j >= 1 && j <= 4);
    for (const [sys, j] of near) { const st = this.stateOf(sys); if (!st) continue; const S = SYS[sys];
      const want = { famine: 'food', refugees: 'food', plague: 'medical', rush: 'ore', war: 'equipment', boom: 'luxury', festival: 'luxury' }[st.kind];
      rumors.push(`"Word is ${S.name} has troubles: ${{ famine: 'a famine', plague: 'a fever', boom: 'a boom on', war: 'a war on', pirates: 'pirates thick as flies', festival: 'a festival on', rush: 'a mining rush', refugees: 'refugees everywhere' }[st.kind]}. ${j} jump${j > 1 ? 's' : ''} from here.${want ? ` A hold full of ${COMMODITIES.find(c => c.id === want).name.toLowerCase()} would sell for a fortune.` : st.kind === 'pirates' ? ' The bounties there pay extra.' : ''}"`); }
    const mk = this.market(p); let tip = null;
    if (mk) { const ports = near.filter(([, j]) => j <= 2).flatMap(([sys]) => portsOf(sys).filter(x => x.svc.includes('T')).map(x => STELLARS[x.id]));
      let best = null; for (const c of mk) for (const o of ports) { const om = this.market(o); const oc = om && om.find(x => x.id === c.id); if (oc && oc.price - c.price > (best ? best.gain : c.price * 0.15)) best = { c, o, gain: oc.price - c.price }; }
      if (best) tip = (`"Smart money buys ${best.c.name.toLowerCase()} here and sells at ${best.o.name}. ${credits(best.gain)} a ton, last I heard."`); }
    const flavour = { lawful: [`"The Concord Watch has been busier than usual. Keep your papers in order."`, `"Insurance rates are up again. Fly careful."`],
      shady: [`"Patrols scan less in the outer lanes. Just saying."`, `"Everybody's selling something. The trick is knowing who's buying."`],
      wild: [`"Out here, the only law is fuel and nerve."`, `"Found a rock last week with shards in it the size of my fist. Gone now, of course."`] }[C.kind];
    const roll = r(), rumor = tip && roll < 0.4 ? tip : rumors.length && roll < 0.85 ? pick(r, rumors) : tip || pick(r, flavour);
    return { name: C.name, title: C.title, race: C.race, standing: STANDING[lvl], hello: pick(r, hello), rumor };
  },
  // ---- salvage steps: a crate appears at the marked point when you come close
  questSalvageIdle(s) {
    const d = s.data, e = s.ent; if (!e) return; const sp = this.spaces[d.sys]; if (!sp) return;
    for (const m of d.missions) {
      if (m.type !== 'salvage' || m.sys !== d.sys || m.done || !m.point) continue;
      if (Math.hypot(m.point[0] - e.x, m.point[1] - e.y) > 1500) continue;
      if (sp.loot.some(l => !l.taken && l.it.salvage === m.id)) continue;
      sp.loot.push({ id: sp.nextLootId(), x: m.point[0], y: m.point[1], vx: 0, vy: 0, it: { salvage: m.id, owner: s.id }, t: sp.t + 600, kind: 5 });
      this.toast(s, 'Salvage on your scanner: fly over the marked crate to scoop it up.');
    }
  },
  questLoot(s, it) {
    const d = s.data, m = d.missions.find(x => x.id === it.salvage && !x.done); if (!m) return false;
    m.done = true; this.toast(s, `Recovered: ${m.title}. Land anywhere to continue.`); this.db.touch(); this.you(s); return true;
  },
};
