// 1.2: faction story arcs (three missions per power, offered at its capital) and Farside expeditions (procedural
// survey -> derelict -> data-core chains beyond the Sol Gateway that hint at the region's purpose).
import { SYS, SYSTEMS, STELLARS, FACTIONS, GRADES } from '../shared/galaxy.js';
import { ARCS } from '../shared/arcs.js';
import { EXPEDITION_LORE } from '../shared/expeditions.js';
import { TRAITS } from '../shared/syndicate.js';
import { credits } from '../shared/rules.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

export const ArcsOperations = {
  arcsInit(d) {
    d.arcs = d.arcs || {};
    return d.arcs;
  },
  arcState(d, f) {
    const A = this.arcsInit(d);
    if (!Object.prototype.hasOwnProperty.call(ARCS, f))
      return { step: 0, active: null, done: true };
    return (A[f] = A[f] || { step: 0, active: null, done: false });
  }, // unknown arcs never touch the save
  // the arc step on offer at this world, if any
  arcOffer(d, p, f) {
    const X = ARCS[f],
      S = this.arcState(d, f),
      st = X && X.steps[S.step];
    if (!st || S.active || S.done || st.at !== p.id) return null;
    if ((d.rep[f] || 0) < st.minRep)
      return {
        ...st,
        fac: f,
        locked: `The ${FACTIONS[f].name} will ask more of you when your standing reaches ${st.minRep} (it is ${d.rep[f] || 0}).`,
      };
    return { ...st, fac: f };
  },
  arcOffersAt(d, p) {
    return Object.keys(ARCS)
      .map((f) => this.arcOffer(d, p, f))
      .filter(Boolean);
  },
  arcsPayload(d) {
    this.arcsInit(d);
    return Object.keys(ARCS).map((f) => {
      const X = ARCS[f],
        S = this.arcState(d, f),
        st = X.steps[S.step];
      return {
        fac: f,
        name: X.name,
        step: S.step,
        total: X.steps.length,
        done: S.done,
        active: S.active
          ? {
              ...S.active,
              title: X.steps[S.step].title,
              brief: X.steps[S.step].brief,
              type: X.steps[S.step].type,
              sys: X.steps[S.step].sys,
              dest: X.steps[S.step].dest,
              back: X.steps[S.step].back,
              count: X.steps[S.step].count,
            }
          : null,
        next: !S.done && !S.active && st ? { title: st.title, at: st.at, minRep: st.minRep } : null,
      };
    });
  },
  arcOnLand(s, p) {
    const d = s.data;
    for (const f of Object.keys(ARCS)) {
      const S = this.arcState(d, f),
        a = S.active;
      if (!a) continue;
      const st = ARCS[f].steps[S.step];
      if ((st.type === 'carry' && p.id === st.dest) || (a.ready && p.id === st.back))
        this.arcComplete(s, f);
    }
    for (const o of this.arcOffersAt(d, p))
      if (!o.locked)
        this.send(s, {
          t: 'story',
          arc: o.fac,
          id: `${o.fac}:${o.i}`,
          title: o.title,
          tag: `${FACTIONS[o.fac].name.toUpperCase()} · ${ARCS[o.fac].name}`,
          text: o.text,
          acc: 'Accept',
          ref: 'Not now',
        });
  },
  arcAccept(s, f) {
    if (typeof f !== 'string' || !Object.prototype.hasOwnProperty.call(ARCS, f)) return;
    const d = s.data,
      p = STELLARS[d.stellar],
      o = p && this.arcOffer(d, p, f);
    if (!o || o.locked) return;
    const S = this.arcState(d, f);
    S.active = { got: 0, ready: false };
    this.log(d, `${ARCS[f].name}: ${o.title}. ${o.brief}`);
    this.toast(s, `Accepted: ${o.brief}`);
    this.db.touch();
    this.you(s);
    this.landed(s);
  },
  arcComplete(s, f) {
    const d = s.data,
      X = ARCS[f],
      S = this.arcState(d, f),
      st = X.steps[S.step];
    S.active = null;
    S.step++;
    d.credits += st.pay;
    d.stats.earned += st.pay;
    d.rep[f] = clamp((d.rep[f] || 0) + 6, -100, 100);
    const got = [`${credits(st.pay)} credits`, `+6 ${FACTIONS[f].short} standing`];
    if (S.step >= X.steps.length) {
      // the finale: a unique Epic officer and specialist blueprints
      S.done = true;
      d.bp = d.bp || {};
      d.bp[X.spec] = (d.bp[X.spec] || 0) + 10;
      got.push(`10 ${this.A.ships[X.spec].name} blueprints`);
      const traits = Object.keys(TRAITS),
        o = {
          id: 'arc-' + f,
          name: X.officer[0],
          race: f,
          role: X.officer[1],
          rarity: 3,
          lv: 5,
          xp: 0,
          rank: 1,
          traits: [
            traits[Math.abs([...f].reduce((a, c) => a * 31 + c.charCodeAt(0), 7)) % traits.length],
          ],
        };
      d.officers = d.officers || [];
      if (!d.officers.some((x) => x.id === o.id)) {
        d.officers.push(o);
        got.push(`${o.name} joins your crew (Epic ${o.role}, Lieutenant)`);
      }
      this.log(d, `Completed ${X.name} for the ${FACTIONS[f].name}.`);
    }
    this.send(s, {
      t: 'story',
      arc: f,
      id: `${f}:${st.i}`,
      title: st.title,
      tag: `${FACTIONS[f].name.toUpperCase()} · ${X.name}`,
      text: st.done + `\n\nRewards: ${got.join(', ')}.`,
      done: true,
    });
    this.db.touch();
    this.you(s);
  },
  // arriving in an arc system spawns what the step needs
  arcArrive(s, sp) {
    const d = s.data,
      e = s.ent;
    for (const f of Object.keys(ARCS)) {
      const S = this.arcState(d, f),
        a = S.active;
      if (!a || a.ready) continue;
      const st = ARCS[f].steps[S.step];
      if (
        st.type === 'carry' ||
        st.sys !== d.sys ||
        [...sp.ships.values()].some((x) => x.arcOf && x.arcOf.sid === s.id && x.arcOf.fac === f)
      )
        continue;
      const left = (st.count || 1) - a.got;
      for (let i = 0; i < left; i++) {
        const ang = Math.random() * 6.283,
          dist = st.type === 'board' ? 800 + i * 300 : 1400;
        const x = sp.makeShip({
          hull: st.hull,
          faction: st.faction,
          x: Math.cos(ang) * dist,
          y: Math.sin(ang) * dist,
          ai: st.type === 'board' ? null : st.type === 'boss' ? 'guard' : 'raid',
          name: st.type === 'boss' ? st.bossName : null,
          bonus: st.type === 'boss' ? { shieldPct: 80, armorPct: 80, damagePct: 30 } : {},
        });
        x.arcOf = { sid: s.id, fac: f };
        x.life = 1e9;
        if (st.type === 'board') {
          x.disabled = true;
          x.armor = x.st.armor * 0.1;
          x.wreckT = 1e9;
          x.rescueOf = { id: 'arc', owner: s.id };
          x.name = 'Drifting ' + this.A.ships[st.hull].name;
        } else {
          x.target = e;
          if (st.type === 'boss') {
            x.home = { x: x.x, y: x.y };
            x.noDisable = true;
          }
        }
      }
      this.toast(
        s,
        st.type === 'board'
          ? `${left} drifting ship${left > 1 ? 's' : ''} here: board each one and choose Rescue.`
          : st.type === 'boss'
            ? `${st.bossName} is in this system.`
            : `${left} target${left > 1 ? 's' : ''} in this system.`,
      );
    }
  },
  arcProgress(s, x) {
    if (!x.arcOf || x.arcOf.sid !== s.id) return;
    const d = s.data,
      f = x.arcOf.fac,
      S = this.arcState(d, f),
      a = S.active;
    if (!a) return;
    const st = ARCS[f].steps[S.step];
    a.got++;
    x.arcOf = null;
    this.toast(s, st.progress + (st.count && a.got < st.count ? ` (${a.got}/${st.count})` : ''));
    if (a.got >= (st.count || 1)) {
      a.ready = true;
      this.toast(s, `Return to ${STELLARS[st.back].name}.`);
    }
    this.db.touch();
    this.you(s);
  },

  // ------------------------------------------------------------------ Farside expeditions
  // Offered on Farside job boards: survey a system, board the derelict the survey finds, bring its data core back.
  expeditionOffer(p, d) {
    if (!SYS[p.system].farside || !p.svc.includes('B')) return null;
    d.expd = d.expd || { n: 0 };
    if (d.missions.some((m) => m.exp)) return null;
    const n = d.expd.n,
      fs = SYSTEMS.filter((S) => S.farside),
      a = fs[(n * 3 + 1) % fs.length],
      b = fs[(n * 5 + 4) % fs.length];
    const pts = [];
    for (let i = 0; i < 3; i++) {
      const ang = (i / 3) * 6.283 + n,
        r = 900 + 500 * ((n + i) % 3);
      pts.push([Math.round(Math.cos(ang) * r), Math.round(Math.sin(ang) * r)]);
    }
    return {
      id: `exp-${n}`,
      type: 'survey',
      exp: { n, stage: 1, b: b.id, home: p.id },
      title: `EXPEDITION ${n + 1}: Survey ${a.name}`,
      sys: a.id,
      points: pts,
      reward: 12000 + n * 6000,
      text: `The Farside Settlers' survey office wants readings from ${a.name}: pass close to three marked points. Every survey out here turns up something.`,
    };
  },
  // a finished expedition stage becomes the next one
  expeditionNext(s, m) {
    const d = s.data,
      E = m.exp;
    if (!E) return;
    if (E.stage === 1) {
      d.missions.push({
        id: `exp-${E.n}-2`,
        type: 'rescue',
        exp: { ...E, stage: 2 },
        title: `EXPEDITION ${E.n + 1}: The derelict in ${SYS[E.b].name}`,
        sys: E.b,
        hull: [735, 707, 704][E.n % 3],
        faction: 'farside',
        wreckName: `derelict of unknown make`,
        reward: 15000 + E.n * 7000,
        text: `Your survey picked up a derelict in ${SYS[E.b].name}, older than any hull on record. Board it and recover what you can.`,
        owner: s.id,
        taken: Date.now(),
      });
      this.toast(s, `Expedition: the survey found a derelict in ${SYS[E.b].name}.`);
    } else if (E.stage === 2) {
      if (d.stellar === E.home) {
        // already home: hand the core straight over
        const pay = 25000 + E.n * 9000;
        d.credits += pay;
        d.stats.earned += pay;
        this.toast(s, `You hand the data core to the survey office. +${credits(pay)} credits.`);
        return this.expeditionNext(s, { exp: { ...E, stage: 3 } });
      }
      d.missions.push({
        id: `exp-${E.n}-3`,
        type: 'expret',
        exp: { ...E, stage: 3 },
        title: `EXPEDITION ${E.n + 1}: Bring the data core home`,
        sys: STELLARS[E.home].system,
        dest: E.home,
        reward: 25000 + E.n * 9000,
        text: `You recovered a data core from the derelict. Take it to ${STELLARS[E.home].name} for the survey office to read.`,
        owner: s.id,
        taken: Date.now(),
      });
      this.toast(s, `Expedition: data core recovered. Take it to ${STELLARS[E.home].name}.`);
    } else {
      d.expd = d.expd || { n: 0 };
      const lore = EXPEDITION_LORE[E.n % EXPEDITION_LORE.length];
      d.expd.n = E.n + 1;
      d.expd.lore = d.expd.lore || [];
      if (!d.expd.lore.includes(E.n % EXPEDITION_LORE.length))
        d.expd.lore.push(E.n % EXPEDITION_LORE.length);
      const g = Math.min(4, 1 + Math.floor(E.n / 2));
      d.mats.crystal[g]++;
      this.send(s, {
        t: 'story',
        id: `exp:${E.n}`,
        title: lore.title,
        tag: 'FARSIDE EXPEDITION',
        text: `${lore.text}\n\nRewards: a crystal ${GRADES[g]} crate, and the next expedition is on the board.`,
        done: true,
      });
      this.log(d, `Expedition ${E.n + 1} decoded: ${lore.title}.`);
    }
    this.db.touch();
    this.you(s);
  },
};
