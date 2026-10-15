// Quantum Rift 0.9 "Hostile Space" server feature operations: loot chests (2.6: directives and solo armadas removed),
// Station Holdout, and Umbral Eclipse cells. Hostile levels are computed in Space (e.pw) and shown by the client.
import { SYS, STELLARS, FACTIONS, MATERIALS, GRADES } from '../shared/galaxy.js';
import { CHESTS, CHEST_CHANCE, HOLDOUT, ECLIPSE, levelOf, playerPower } from '../shared/hostile.js';
import { SPECIALISTS, SPEC_BY_KEY, BP_NEED } from '../shared/specialty.js';
import { credits } from '../shared/rules.js';
import { COOP_HOLDOUT } from '../shared/coop.js';

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const pick = (a) => a[Math.floor(Math.random() * a.length)];

export const HostileOperations = {
  hostInit(d) { d.holdout = d.holdout || { best: 0, lastT: 0 }; },
  myPower(d) { return playerPower(this.A, d.ship.hull, this.bonus(d), this.wingHulls ? this.wingHulls(d) : []); },

  // ------------------------------------------------------------------ chests (called from Space.kill)
  maybeChest(space, s, by) {
    const C = CHESTS[s.faction]; if (!C || !by || !by.player) return;
    const always = s.boss || s.holdoutBoss || s.kingpin;
    if (!always && Math.random() > CHEST_CHANCE * (space.m ? space.m.chest : 1)) return;
    space.loot.push({ id: space.nextLootId(), x: s.x, y: s.y, vx: s.vx * 0.2, vy: s.vy * 0.2, it: { chest: s.faction, lvl: levelOf(s.pw || s.strength || 10) }, t: space.t, kind: 5 });
  },
  openChest(s, it) {
    const d = s.data, C = CHESTS[it.chest], lvl = it.lvl || 1, got = [], m = this.mods(d.sys); this.hostInit(d); this.specInit(d); this.tut(s, 'chest');
    const cr = Math.round((200 + lvl * lvl * 40) * (0.7 + Math.random() * 0.6)); d.credits += cr; d.stats.earned += cr; got.push(`${credits(cr)} cr`);
    const g = clamp(Math.floor(lvl / 9), 0, 4), mt = pick(C.mats); d.mats[mt][g]++; got.push(`${mt} ${GRADES[g]}`);
    if (Math.random() < 0.5) { const sp = SPEC_BY_KEY[C.bp], n = 1 + Math.floor(Math.random() * 3); d.bp[sp.id] = (d.bp[sp.id] || 0) + n; got.push(`${n} ${sp.name} blueprint${n > 1 ? 's' : ''}`); }
    if (SPEC_BY_KEY[C.bp] && d.ship.hull === SPEC_BY_KEY[C.bp].id) { d.spec[C.res] = (d.spec[C.res] || 0) + 2; got.push(`2 ${C.res}`); }
    this.toast(s, `${C.name} (Lv ${lvl}): ${got.join(', ')}.`);
    this.you(s); return true;
  },

  // ------------------------------------------------------------------ Station Holdout (solo wave defense at your own station)
  holdoutStart(s) {
    const d = s.data, p = STELLARS[d.stellar]; this.hostInit(d);
    if (!p || s.ent || !this.ownSite(d, p)) return this.toast(s, 'Start a Holdout from your Personal Station.');
    if (d.station.ops < 2) return this.toast(s, 'Holdouts need Ops 2.');
    const wait = d.holdout.lastT + HOLDOUT.cooldownH * 3600000 - Date.now(); if (wait > 0) return this.toast(s, `The defenders are still resupplying: ${Math.ceil(wait / 60000)} minutes.`);
    d.holdout.active = { wave: 0, nextT: Date.now() + 4000, ids: [], platforms: [], cleared: 0 };
    this.depart(s);
    this.toast(s, 'HOLDOUT: ten waves are inbound. Your defense platforms are deploying. Hold the station!');
    if (this.holdoutAnnounce) this.holdoutAnnounce(s);   // 2.6: the Armada is told and can fly in to help
    this.db.touch(); this.you(s);
  },
  holdoutTick(s) {
    const d = s.data; this.hostInit(d); const H = d.holdout.active; if (!H) return;
    const site = STELLARS[d.station.site], here = s.ent && d.sys === site.system;
    if (!here) return this.holdoutEnd(s, false, 'You left the station.');
    const sp = this.spaces[site.system];
    if (!H.platforms.length) {   // deploy the platforms around the station
      const n = HOLDOUT.platforms(d.station.defense);
      for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, x = site.x + Math.cos(a) * 220, y = site.y + Math.sin(a) * 220;
        const p = sp.makeShip({ hull: 711, faction: 'quantum', x, y, ai: 'guard', owner: s.ent.id, name: 'Defense Platform', bonus: { armorPct: 150, shieldPct: 150, damagePct: 60 } });
        p.home = { x, y }; p.life = 1e9; p.noDisable = true; p.platform = true; H.platforms.push(p.id); }
    }
    const alive = H.ids.filter(id => sp.ships.has(id));
    if (H.wave && !alive.length) { H.cleared = H.wave; if (H.wave >= HOLDOUT.waves) return this.holdoutEnd(s, true); if (!H.nextT) { H.nextT = Date.now() + HOLDOUT.waveGap * 1000; this.toast(s, `Wave ${H.wave} cleared. Next wave in ${HOLDOUT.waveGap} seconds.`); } }
    if (H.wave && alive.length && Date.now() - H.waveT > HOLDOUT.timeoutMin * 60000) return this.holdoutEnd(s, false, `Wave ${H.wave} overran the defenses.`);
    if (H.nextT && Date.now() >= H.nextT && !alive.length) {
      H.wave++; H.nextT = 0; H.waveT = Date.now(); H.ids = [];
      const helpers = this.holdoutHelpers ? this.holdoutHelpers(d, site) : [];   // 2.6: co-op Holdout
      H.helpers = [...new Set([...(H.helpers || []), ...helpers.map(o => o.data.name)])];
      const base = HOLDOUT.wave(H.wave), hulls = base.concat(Array.from({ length: helpers.length * COOP_HOLDOUT.extraPerHelper }, (_, i) => base[i % base.length]));
      const ang = Math.random() * Math.PI * 2, scale = clamp(this.myPower(d) / 400, 0.6, 6), pct = (scale - 1) * 60 + H.wave * 8 + helpers.length * COOP_HOLDOUT.pctPerHelper;
      const defenders = [s.ent, ...helpers.map(o => o.ent)];
      hulls.forEach((h, i) => { const a = ang + (i - hulls.length / 2) * 0.25, x = site.x + Math.cos(a) * 1600, y = site.y + Math.sin(a) * 1600;
        const fac = h >= 760 ? 'umbral' : 'hollow', e = sp.makeShip({ hull: h, faction: fac, x, y, a: a + Math.PI, ai: 'raid', bonus: { shieldPct: pct, armorPct: pct } });
        e.life = 1e9; e.holdout = d.name; e.target = defenders[i % defenders.length]; if (H.wave === 10 && i === 0) { e.holdoutBoss = true; e.name = 'Holdout Warlord'; e.noDisable = true; } H.ids.push(e.id);
        sp.events.push(['flash', Math.round(x), Math.round(y)]); });
      this.toast(s, `Wave ${H.wave} of ${HOLDOUT.waves}: ${hulls.length} hostiles inbound.`);
      this.you(s);
    }
  },
  holdoutEnd(s, won, why) {
    const d = s.data, H = d.holdout.active; if (!H) return; d.holdout.active = null; d.holdout.lastT = Date.now();
    const site = STELLARS[d.station.site], sp = this.live[site.system];
    if (sp) for (const id of [...H.platforms, ...H.ids]) { const e = sp.ships.get(id); if (e) sp.remove(e, 'jump'); }
    const n = H.cleared; d.holdout.best = Math.max(d.holdout.best || 0, n); this.specInit(d);
    if (!n) { this.toast(s, `Holdout over. ${why || ''} No waves cleared.`); this.you(s); return; }
    const R = HOLDOUT.reward(n), got = [`${credits(R.credits)} cr`]; d.credits += R.credits; d.stats.earned += R.credits;
    for (let i = 0; i < Math.ceil(n / 3); i++) { const mt = MATERIALS[i % 3]; d.mats[mt][R.grade]++; got.push(`${mt} ${GRADES[R.grade]}`); }
    const bw = SPEC_BY_KEY.bulwark; d.bp[bw.id] = (d.bp[bw.id] || 0) + n; got.push(`${n} Bulwark blueprints`);
    if (d.ship.hull === bw.id) { d.spec.insignia = (d.spec.insignia || 0) + R.insignia * 2; got.push(`${R.insignia * 2} Raider Insignia`); }
    if (won) { d.mats[MATERIALS[Math.floor(Math.random() * 3)]][4]++; d.bp[bw.id] += 5; got.push('a grade V crate', '5 more Bulwark blueprints'); }   // 2.6: was an Umbral Directive
    const msg = `${won ? 'HOLDOUT WON: all ten waves beaten!' : `Holdout over after ${n} wave${n > 1 ? 's' : ''}. ${why || ''}`} Rewards: ${got.join(', ')}.`;
    this.toast(s, msg); this.log(d, msg); this.notify(s, won ? 'Holdout won' : 'Holdout over', got.join(', '));
    if (this.holdoutReward) this.holdoutReward(d, H, n, won, R);   // 2.6: Armada helpers share the rewards
    this.db.touch(); this.you(s);
  },
  onHoldoutKill(e) {},   // waves are tracked by id each tick

  // ------------------------------------------------------------------ the Umbral Eclipse (spawned by Space.spawnTraffic)
  eclipseChance(S, m) {
    if (S.farside) return 0;
    let c = S.danger >= 3 && ['umbral', 'deep', 'frontier'].includes(S.faction) ? ECLIPSE.chance : 0;
    if ((m && m.eclipse > 1) && S.danger >= 1 && S.faction !== 'quantum') c += 0.08 * m.eclipse;
    return c;
  },
};
