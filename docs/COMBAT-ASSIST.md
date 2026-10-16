# Combat assist

Combat assist is off by default and transient: saves, reconnects, departures and system transitions never rearm it. It reuses `Space.fight`/`steer` without enabling NPC career, fleeing or navigation AI for a player.

## Controls

- **Combat Assist** arms your own lead ship and immediately adopts your currently selected legal hostile. You can select a hostile first and then click the button; a previous Attack order or incoming fire is not required. With no valid selected target, it waits for an actual attacker. Selecting another hostile while armed changes the focus. Newcomer/jump protection does not prohibit your explicitly selected attack; it still prevents unprovoked NPC initiation. It steers and fires normal primaries only. Secondary ordnance and fighter bays stay manual; point defense keeps its existing autonomy.
- **Stop**, boarding, travel and positional/stop fleet orders cancel the controller. Manual movement or weapon input immediately takes over. A manually flying Armada leader may retain follower coordination while their own assist yields.
- **Allow Follow Leader combat** grants a transient delegation to the current Armada leader, only while Follow Leader is enabled. **Coordinate consenting followers** lets that leader distribute a target and automate consenting, co-located followers. Other members stay independent. Leader changes, leaving, kicks, disconnects, system separation and local stops revoke delegation and require explicit rearming.
- The PC HUD reports OFF, READY, ENGAGING or SUSPENDED, active combat target ID and suspension reason. The regular target panel still represents manual selection; this may differ from the active combat target.

Attack orders against legal hostiles enable focused fleet targeting. Every offensive wingmate shares its local lead's resolved target, including synchronized handoff. Existing manual attacks against neutral NPCs retain their prior behavior and do not arm automated combat.

## Target and odds policy

A valid target is live, flying, enabled, legally hostile and unprotected, within 2,200 simulation units of the command lead. Player ships, their escorts and arena combat are excluded. Reacquisition only considers enemies currently targeting a participating fleet or directly damaging one within the last eight simulation seconds. A faction relationship or old aggression flag alone is insufficient.

A positive hit by your lead or wingmate authorizes retaliation by that NPC faction for the current system visit, including later arrivals. This is transient session state: landing in the same system is not a pardon, but leaving and returning restores the usual newcomer/jump protections. Normal faction standing penalties remain; unrelated factions do not gain this retaliation permission.

Keep the current valid target. On invalidation choose the lowest estimated win odds, then nearest distance, then stable entity ID. No attackers means READY; no searching or automatic route resumption. Already-fired projectiles retain ordinary collision and damage behavior.

The HUD and handoff ranking both use the same server-side live aggregation. Count each participating lead once, plus 60% of every available subordinate's bonus-adjusted effective strength. Exclude absent, dead, disabled, recalled and non-flying ships; stopped wingmates do not contribute offense. Only consenting, co-located, delegated fleets join Armada power. Independent Armada members do not count. The legacy stored-fleet helper remains unchanged for encounter/Holdout scaling.

These remain heuristic odds, not calibrated probabilities: current armor/shield depletion, weapon matchups and the enemy's whole fleet are not modeled.

## Verification

`node test/combat-assist.js` verifies deterministic power, targeting, authority and actual weapon-step invariants. `node test/combat-network.js [ws-url]` verifies three real WebSocket clients against a disposable local server. Existing regression/feature/type checks and the normal two-client network bot are unchanged. Desktop browser checks cover arming, takeover, stop, rearm and 1024/1440/1920-wide viewports; extended pursuit feel, high-latency play and large-Armada balance still need human playtesting.
