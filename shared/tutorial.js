// The career guide (1.0): twenty goals from first flight to your first capital ship. The first five are the original
// first-flight tutorial (event goals); the rest are checked against your progress. The client shows the current one.
const outfits = (d) => Object.values(d.ship.outfits || {}).reduce((a, b) => a + b, 0);
export const TUTORIAL = [
  { ev: 'target', title: 'Pick a target', text: 'Undock (DEPART), then click any ship, or press Tab, to target it.', reward: 1500 },
  { ev: 'land2', title: 'Your first jump', text: 'Open the map (M), click a neighbouring system, fly clear of planets and press J. Land anywhere there (double-click or L).', reward: 4000 },
  { ev: 'sell', title: 'Make a trade', text: 'Buy cargo in a Trade tab and sell it at another market. Prices differ from world to world.', reward: 3000 },
  { ev: 'kill', title: 'Clear a raider', text: 'Destroy a pirate or bounty target. Hollow raiders haunt Gloam and other dangerous systems; R targets the nearest hostile.', reward: 6000 },
  { ev: 'site', title: 'Find a station hull', text: 'Land on a derelict station hull (the purple diamonds on the map).', reward: 5000, mat: ['alloy', 0, 1] },
  { check: (d) => d.station.claimed && !!d.station.site, title: 'Claim it', text: 'In the STATION tab of a derelict hull, claim it. It becomes your Personal Station.', reward: 5000 },
  { check: (d) => outfits(d) >= 3, title: 'Kit out your ship', text: 'Buy two more outfits at an outfitter: weapons, shields, armor or cargo pods.', reward: 6000 },
  { check: (d) => d.station.ops >= 1, title: 'Restore docking (Ops 1)', text: 'At your station, build Ops 1. It needs credits and an Alloy I crate.', reward: 10000 },
  { ev: 'job', title: 'Do a job', text: 'Take any job from a job board and finish it.', reward: 8000 },
  { check: (d) => !!(d.quests && (Object.keys(d.quests.active || {}).length || (d.quests.done || []).length)), title: 'Meet a contact', text: 'Every spaceport bar has a contact (see AT THE BAR on the landing overview). Take on their story from the JOBS tab.', reward: 8000 },
  { check: (d) => (d.stats.stateHelp || 0) >= 1, title: 'Help a troubled system', text: 'The OPS tab lists famines, wars and other troubles near you. Sell what a troubled system needs there, take one of its jobs, or fight its raiders.', reward: 10000 },
  { check: (d) => (d.stats.mined || 0) >= 10, title: 'Mine 10 tons', text: 'Buy a Mining Laser and break rocks in an asteroid field. Fly over the ore to scoop it.', reward: 8000 },
  { check: (d, A) => (A.ships[d.ship.hull].strength || 0) >= 80, title: 'A real warship', text: 'Buy a fighting ship: a Cutlass Interceptor or better.', reward: 15000 },
  { check: (d) => (d.officers || []).length >= 1, title: 'Hire an officer', text: 'Visit the CREW tab on an inhabited world and hire an officer for your bridge.', reward: 10000 },
  { check: (d) => d.station.ops >= 2, title: 'Market and refinery (Ops 2)', text: 'Build Ops 2 at your station: it opens the research lab and the hangar.', reward: 20000 },
  { check: (d) => (d.shuttles || []).some(s => s.runs > 0 || s.state === 'out'), title: 'Launch a shuttle', text: 'Build a shuttle in your station HANGAR and send it on a job from the hangar board.', reward: 15000 },
  { check: (d) => d.station.done.length > 0 || !!d.station.active, title: 'Start research', text: 'Open the RESEARCH LAB at your station and start a project.', reward: 15000 },
  { ev: 'chest', title: 'Open a loot chest', text: 'Hostiles sometimes drop glowing pink loot chests. Destroy pirates or the Swarm and fly over one.', reward: 15000 },
  { check: (d) => !!(d.quests && (d.quests.done || []).length), title: 'Finish a story', text: 'See a contact\'s story through to its end. Your progress is on the CAREER page of the ship and captain panel (I).', reward: 20000 },
  { check: (d) => !!(d.story && d.story.done && d.story.done.includes('qv1')), title: 'The Threshold Spire', text: 'Someone is waiting at the Threshold Spire in Far Mouth. Land there.', reward: 20000 },
  { check: (d) => d.station.ops >= 3, title: 'Shipyard and lab (Ops 3)', text: 'Build Ops 3: refits, the drydock and specialist building.', reward: 40000, mat: ['crystal', 1, 1] },
  { check: (d) => (d.holdout && d.holdout.best >= 3) || (d.stats.armadas || 0) >= 1, title: 'Hold the line', text: 'Clear three waves of a Station Holdout (station DEFENSE), or destroy an armada summoned with a directive.', reward: 50000 },
  { check: (d, A) => (A.ships[d.ship.hull].cost || 0) >= 1000000 || A.ships[d.ship.hull].kind === 'specialist', title: 'Captain of a capital', text: 'Fly a ship worth a million credits or more, or build a specialist.', reward: 100000, mat: ['alloy', 3, 1] },
];
// 2.5: three steps were added; saves from before move to the same goal in the longer list
export const TUT_VERSION = 2;
export function tutMigrate(d) { if ((d.tutV || 1) >= TUT_VERSION) return; if (d.tut != null) d.tut = d.tut <= 8 ? d.tut : d.tut <= 15 ? d.tut + 2 : d.tut + 3; d.tutV = TUT_VERSION; }
