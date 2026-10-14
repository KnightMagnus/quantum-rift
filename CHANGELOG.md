# Quantum Rift changelog

Every release, newest first. The main story is left out on purpose.

### 2.5 "Rendered Rift"
An art update in the spirit of EV Nova's pre-rendered look, plus a polish pass.
- **Rendered planets:** 56 worlds ray-traced in the old 3D style: continents and biomes, mountains with bump lighting, oceans with a sun glint, cloud layers with shadows, city lights on the night side, lava glow, craters, gas bands and storms, atmospheres and rings. Each world picks the render of its type closest to its own colour. Background worlds use them too.
- **Rendered space stations:** the 78 station worlds were flat drawn rings. Now there are twelve 3D designs, chosen by who built them: ring, spindle, cross-dock, asteroid base, twin ring, shipyard frame, saucer, Vashari hive, Ylith crystal, Thalassi reef, Korrund forge and outlaw junk.
- **Landing pictures for every world:** about 180 worlds showed only a colour blur. Now 41 Bryce-style scenes cover them all: terrain with water reflections and haze, rendered cities, domes, arcologies, foundries, crystals and cloud platforms, and skies with suns, clouds, aurorae and neighbouring planets. Stations get an exterior view of their own design. Earth and the Que'vari worlds have their own scenes.
- **Combat effects:** rendered fireball animations (and a bigger one for capital ships), tumbling hull fragments, a lens flare on hits, glowing bolts with trails, and damage numbers that add up instead of piling on top of each other.
- **Asteroids and loot:** rendered rocks and crystal-studded rocks, and real-looking credits, salvage crates, ore, gas canisters, crystals and loot chests.
- **Outfitter pictures** for the 19 outfits that had none: blasters, turrets, the pulse laser, railguns, missiles, mining tools and the alien guns.
- **Login screen:** a rendered backdrop (a city-lit world, its moon, nebulae and a Quantum patrol) with a slow drift, and a captain's log-in panel.
- **Interface touches:** framed landing pictures, red indicator lights on section headings.
- **Polish:**
  - Styled confirmation dialogs replace the browser's plain pop-ups (Enter confirms, Esc cancels).
  - A narrower sidebar on small screens (1024x640 and below), and chat lines no longer show through the landing screen.
  - Market depth: a big load moves the price as you trade it, so huge haulers earn less per ton than small ones. A balance simulation showed 400-ton freighters making over 4 million credits an hour before; now about 1.4 million, while small and medium holds earn 90,000 to 130,000 an hour.
  - Three new career steps: meet a contact, help a troubled system, finish a story. Existing captains keep their place.
  - New sounds: a sting for story beats and a beacon when trouble starts nearby, with a line of news.
- **Tools:** `rift_planets.py`, `rift_stations.py`, `rift_landscapes.py`, `rift_fx.py`, `rift_objects.py`, `rift_icons.py`, `rift_login.py`, `rift_audio25.py`, with `rift_render3d.py` (the hull pipeline's renderer) and `rift_noise.py`.

### 2.4 "Living Galaxy"
- **Questlines:**
  - Every spaceport bar has a **contact**, a named character who remembers you. Each offers multi-step stories: a missing freighter, a fever run, an informant to hide, a ghost signal, a prospector's claim, a dignitary escort and an old debt.
  - Each step is a job (deliveries, surveys, rescues, bounties, escorts, supply runs, patrols, and the new **salvage** step), and finishing one tells the next part of the story.
  - Contacts warm to you as you finish their stories, from Stranger to Old Friend. Their rewards grow, and include material crates, new officers and specialist blueprints.
  - **Six handcrafted side stories** start at particular worlds across the Rift, each with its own characters and a bigger reward.
  - A lost step gets one more chance. The MISSIONS tab tags each step, and keeps a story journal.
- **A living galaxy:**
  - Systems pass through **states** that come and go: famine, plague, a boom, a border war, a pirate scourge, a festival, a mining rush, refugees.
  - States move prices and traffic, post their own supply, patrol and passenger jobs, and make the news.
  - Captains can end a state early by delivering what it needs or destroying the ships behind it, for a reward.
  - **Markets remember what you trade:** selling a load lowers the local price, buying raises it, and the effect fades over a few minutes.
  - The OPS tab lists "The Rift today", the galaxy map rings troubled systems, and the landing screen shows the local state.
  - Cargo runs pay about a third more.
- **More varied skies:** background worlds are now drawn from the procedural planet renderer in many types, sizes, colours and ring styles, so neighbouring systems no longer share the same gas giant.
- **Combat AI:**
  - NPC captains have personalities. Cautious and steady ones break off and run for the jump point when badly hurt; reckless ones fight on. Bounty, story and named targets always fight to the end.
  - A ship under attack calls nearby ships of its side to help.
  - Capital ships with turrets circle their target and fire broadsides instead of charging.
  - Damaged ships trail smoke, and badly damaged ones burn.
- **At the bar:** the contact greets you by standing and passes on a rumour: a troubled system nearby, or a trade run that pays. Each market shows what the world exports cheaply and what it pays well for.
- **CAREER page** in the ship and captain panel (I): net worth, ships and docks, station, colonies, officers, blueprints, and your progress across every questline.
- **Shipyard comparison:** every stat shows the difference from the ship you fly, with a tick on each bar.
- **Outfitter categories:** weapons, ammo, defense, engines and utility.
- **Solo games hide multiplayer screens:** fleets, the arena, the exchange, online lists and chat. In solo, the chat line writes notes in your log.
- **Quality of life:**
  - Auto-reconnect after a dropped connection.
  - Jobs warn when they are further than your fuel range, and offer a PLOT button.
  - The trade screen shows what you paid for the cargo in your hold.
  - A warning two minutes before a rush deadline.
  - Salvage points get edge arrows and map markers.
  - The galaxy map legend can be hidden (LEGEND).
  - The main story card stays folded while you work through the career steps.
- **Fixes:** a comment that had swallowed the solo note code, and the missing "invasion" entry in the map legend.

### 2.3 "Busy Lanes"
- **Ten new Quantum hulls** in the Concord yards, filling the gaps in the common lineup:

  | Hull | Price | What it is |
  |---|---|---|
  | Wasp Skirmisher | 30k | A cheap starter fighter |
  | Swift Courier | 110k | A fast blockade runner with a quick-spooling drive |
  | Pelican Salvage Tug | 170k | Grapple arms ahead, a towing frame behind |
  | Sabre Corvette | 380k | The yards' all-rounder |
  | Caravel Trader | 430k | An armed merchantman racked with containers |
  | Talon Strike Fighter | 780k | A heavy fighter with rocket pods |
  | Lighthouse Survey Cruiser | 950k | Huge fuel range and a fast drive |
  | Monarch Executive Yacht | 1.9M | White and gold, very fast |
  | Aegis Escort Cruiser | 2.2M | Studded with flak turrets |
  | Vigil Heavy Cruiser | 5.2M | A spinal fusion cannon and broadside turrets, between the Tempest and the Bastion |

  - The Wasp, Swift and Pelican are sold in common yards everywhere.
  - All ten fly in NPC traffic.
- **60 new moons** circling planets across the Rift. They are airless, and nobody lives there.
- **More asteroids:** existing fields hold more rocks, and about half the systems gain an extra asteroid field, gas cloud or crystal field.
- **Busier space:**
  - Roughly twice the traffic in every system.
  - Some traders run in small convoys.
  - Traders only head for worlds they can land on.
  - Pirate havens cap their raider packs and see visiting smugglers and free traders instead.

### 2.2 "Living Skies"
- **Every system has its own scenery**, seeded from the system, so each one always looks the same and no two look alike.
  - **Far away:**
    - the system's star with a lens flare
    - distant spiral, barred, edge-on and elliptical galaxies
    - ringed and banded gas giants
    - now and then, a black hole with its accretion disc, or a sweeping pulsar
    - fragments of an ancient megastructure ring
  - **In between:**
    - gas clouds in the local power's colours
    - drifts of distant asteroids
    - ion storms crackling with lightning
    - the odd shooting star
  - **In the system itself:**
    - massive ancient wrecks: capital hulls broken in two, scorched, a few lights still burning, trailing debris
    - abandoned station platforms
    - broken ring ruins
    - glowing crystal formations
    - battle debris fields with hot fragments
    - comets with streaming tails
    - relay satellites orbiting planets
    - drifting cargo pods
    - blinking nav beacons by the spaceports
  - Wild space (the Frontier, the Deep, Umbral space and the Farside) gets more wrecks, ruins, crystals and black holes.
  - The scenery is decoration: you fly past it, and it never blocks you.
- **Look ahead.** Hold the right mouse button and move the mouse to slide your view up to about 3,000 units that way, without zooming out. An arrow shows where your ship is, and the view eases back when you let go. A quick right-click still clears your target.
- **Four docks.** Docks are A to D: one at Ops 0–1, two at Ops 2, three at Ops 3–4 and four at Ops 5. Saves with a fifth dock fold it in, and you keep flying your ship.
- **K sends your wingmates in.** The attack order now sends wingmates out to weapons range of whatever you've targeted, including a ship that isn't hostile, now that your guns can hit anyone.
- **Drones on F.** Tap F to launch every drone in your bays at once, and tap again to call them all home. Drones stay out until recalled, and any still out when you land or jump go back into the bays.

### 2.1 "Docks"
- **Docks.** Your Personal Station has lettered docks (A to D since 2.2).
  - Each dock holds a **lead ship** and up to **two wingmate ships**, all picked from your stored ships. A Herald in the lead slot commands a third wingmate.
  - You fly the lead of your **active** dock, and its wingmates fly in formation with their own outfits.
  - Switch docks with the DOCK buttons beside DEPART, or on the new STATION → DOCKS screen, where you assign every slot.
  - The sidebar shows your active dock and how its wingmates are doing.
- **Wingmates are ships now.** Hiring wingmates at the station is gone.
  - The wingmate hulls are sold at your station shipyard (Ops 4, Armada hulls at Ops 5) and go straight to your hangar. They fly only as wingmates.
  - Any ship can be a wingmate.
  - A wingmate knocked out in a fight is towed home and repaired in ten minutes, or at once for a fee. Wingmates are no longer lost when you die.
- **Officers crew wingmates.** Each wingmate has a captain and a crew slot, and the officers there boost that ship. An officer serves one post at a time. The roster grows from 12 to 24.
- **More stored ships.** The hangar holds 3 / 5 / 8 / 11 / 14 ships at Ops 1–5, plus the Drydock Annex research.
  - Every shipyard has **BUY TO HANGAR**, which skips the trade-in.
  - Stored ships sell for half the hull plus half the outfits.
  - Saves from 2.0.x are upgraded: hired escorts become stored ships flying as Dock A's wingmates.
- **Fire at will.** Your own guns now hit any ship, as in EV Nova, not just hostile ones.
  - A ship you hit turns on you, and its faction holds it against you.
  - Your wingmates are never hit, and other players only in lawless space as before.
- **New hyperspace jump.**
  - Rings of energy close in as the drive spools, the stars smear into streaks along your heading, and you leave in a white bloom with a lens streak.
  - Arrival plays it in reverse with a shockwave.
  - Other ships leave a blue ghost trail as they jump, and flash as they go.
  - New synthesized jump, arrival and distant-jump sounds replace the old sweep. Ships with the fast hyperdrive get their own short version.
- **Quieter, with an easy volume control.**
  - Default levels are lower, and older saved settings are turned down once.
  - A speaker button in the command bar opens a master volume slider with MUTE, and **N** mutes from anywhere.
  - Volume sliders (options, quick volume, radio) are red to match the interface.
- **Interface:** the station's ACADEMY section is replaced by DOCKS; HANGAR is now SHUTTLES and DRYDOCK is now REFITS. Assigning ships no longer floods the screen with messages.

### 2.0.3
- **Newcomer protection.**
  - Until your Personal Station reaches Ops 3, pirates, raiders, swarms and other always-hostile ships in inner space (danger 0 to 2) won't start a fight with you.
  - Shooting first ends the truce for that fight, and a job's own targets still attack.
  - A badge in the sidebar shows when you're protected. You're warned the first time you enter lawless space, where protection doesn't apply.
- **A moment to get your bearings.** Nobody targets you for the first six seconds after a jump, anywhere.
- **Calmer inner space.**
  - Raider groups no longer pile up in a system while traders come and go: before, Far Mouth on the main story's path could hold four raider packs at once.
  - The heaviest raider hulls (Tempest Destroyers) stay out of inner space.
- **Fixes:**
  - Cargo carried for jobs now takes up real hold space, and the hold readout shows it.
  - Escorts no longer linger in space after you are destroyed.
  - Abandoning a bounty sends its target away. Jobs can now be abandoned from the MISSIONS panel too, with a confirmation.
  - Renaming a ship "Tender" no longer gets it deleted on a drydock swap.
  - Buying a ship or swapping at the drydock checks that your job cargo and passengers fit.
  - Pausing a solo game stops the clock on rush deadlines and loan payments.
  - A rival flying alongside you goes back to their own business when you land, instead of vanishing.
  - Stored ships sell like a trade-in, for half the hull plus half the outfits.
  - Outfits can only be sold at an outfitter. Blank ship names fall back to the hull name.
  - Bounty boards never list two targets with the same name.
  - Clearer messages for skip-jump fuel and for jumping while your ship is booked for a tier-up.
  - Server-side checks for escort and lower-deck slots, and safer save imports.
- **Interface:**
  - Bounties warn when the target outguns your ship.
  - The speed readout is labelled.
  - Ammunition can't be bought without a launcher.
  - The buy-ship and sell-ship confirmations show what you'll get.
  - Messages no longer cover the world's name when landed.
  - The galaxy map toolbar stays inside its frame.
  - Arrow keys can't be bound to other actions.

### 2.0.2
- **KNIGHT retired.** The showcase account is gone, and on first start any existing KNIGHT save is removed and his Ops 5
  station hull at Quantum Gate becomes an unclaimed derelict again.
- **Crash-proofing.** A fuzzer (`test/fuzz.js`) sent tens of thousands of random and malformed messages from many clients.
  Fixes:
  - captain names like `__proto__` are refused, and saves can no longer be corrupted through them
  - profile and leaderboard lookups with odd names no longer error
  - bogus faction-arc requests no longer write junk into saves
  - the game loop and each system now recover from errors instead of stopping the server
- **UI crawler** (`test/crawl.py`). It visits every kind of world and clicks every tab, station section, overlay and map
  view, checking for errors and for content spilling out of frames. It came back clean.

### 2.0.1
- **NPC ships land properly.** Traders heading for a planet or station now slow down, settle over it and land. Before,
  they circled it forever. The fix is new arrival steering that plans a speed falling to zero at the target.
  - Escorts and wingmates use the same steering, now matching their leader's speed in formation.
  - Rival captains who land stay docked for a minute or so, then take off again from the same world.

### 2.0 "Polish"
- **A full audio pass.** Every new sound is original, synthesized by `tools/rift_audio.py`.
  - **Interface sounds:**
    - button clicks and hovers, tabs, opening and closing windows
    - buying and selling, accepting jobs and completing them
    - level-ups and promotions, alerts, errors
    - target lock, low-shield warning, hails, chat, loot pickup
    - docking, undocking, the hyperspace jump and arrival
  - **Ambience:** a deep-space drone with faint distant pings, a station interior (machinery, air handling, distant
    clanks and murmurs), and an engine hum that opens up as you thrust and roars on the afterburner.
  - **Login theme:** a slow, spacious original piece. It plays only on the login screen, starting at your first click,
    and fades out when you enter the Rift (in the game, your radio is the music). The ♪ button turns it off.
  - **Mixer:** new Interface sounds, Ambience and Login music sliders join Master, Effects and Radio.
- **HUD.**
  - Shield and armor show their numbers on the bars, and a speed readout sits beside your credits.
  - Your credits float a green +amount or red −amount whenever they change.
  - Arrows at the screen edge point to your target, your nav point and mission objectives in this system, with distances.
- **Feedback.**
  - The screen edges flash red when your hull is hit and pulse while armour is low.
  - Stars streak past during a jump, with a flash on arrival.
- **Toasts** are colour-coded: errors red, completions gold, level-ups violet, alerts flashing red.
- **Docked.** Number keys 1 to 9 switch landing tabs, and each world remembers the tab you used last.
- **Smoother screens.** Windows fade in.
- **Career panel.** Click its header to fold it away.

### 1.2 "Syndicate and Officers"
- **The Syndicate.** A crime path with tiers from Unknown to Kingpin. Smuggling, plunder, capture and Syndicate contracts
  raise it. Outlaw worlds post Syndicate smuggling runs and hits.
- **The black market.** Found on outlaw worlds, and in any spaceport bar once you are a Lieutenant. It sells:
  - forged papers (which wipe your worst grudge)
  - officer commendations
  - Wraith and Corsair blueprints and parts
  - directives and unmarked crates
  Stock unlocks by tier.
- **Officer ranks and traits.** Promote officers from Ensign to Captain with commendations and credits. Each rank adds 12%
  to their stats and teaches a trait: Sharpshooter, Ironclad, Ace Pilot, Haggler, Ghost and more.
- **Lower deck.** Two crew berths for small passives: medic, mechanic, cargo rigger, cook, lookout, fuel tech, gunner's mate,
  fixer.
- **The bank** (inspired by Endless Sky). Borrow against your credit rating. Payments are taken every 15 minutes of play.
  Paying on time raises your rating, and missing a payment adds interest.
- **Galaxy map views** (from Endless Sky): POWERS, TRADE (colour systems by one commodity's price, with prices on hover),
  SERVICES (shipyards and outfitters), STANDING and DANGER.
- **Passenger and rush jobs.** Passenger jobs need bunks. Rush deliveries pay much more but fail past their deadline, with a
  countdown in MISSIONS.
- **Faction story arcs.** Three missions for each of seven powers (the Concord, Spacers, Vashari, Korrund, Ylith, Sarn and
  Thalassi). Each is offered at the power's capital once your standing is high enough, and ends in a unique Epic officer
  and 10 specialist blueprints.
- **Farside expeditions.** Survey chains beyond the Sol Gateway: survey a system, board the derelict it finds, and bring
  its data core home. Each one decodes a fragment about the region.
- MISSIONS shows faction arcs, expeditions and rush timers, and the I panel shows your Syndicate standing, credit and story
  progress.

### 1.1 "Living Rift"
- **Rival captains.** Thirty named AI captains (including Madcow Soul and Six Flash) with careers of their own. They
  trade, hunt, mine, explore and raid, buy better ships, and fly through the systems you visit with gold name tags.
  - They remember you: compliments and help in a fight win friends, while taunts and stray shots make rivals.
  - Allies fight beside you and will fly with you. Nemeses send hired guns after you.
  - They appear on the leaderboards and in the news.
- **Hailing** (T, from Endless Sky):
  - bribe pirates, or tell them to run if you outgun them
  - ask traders for fuel or emergency repairs when stranded
  - buy landing clearance from planets that refuse you
  - talk to rival captains
- **Fleet orders** for escorts, wingmates and fighters: form up, attack my target, hold position, hold fire, collect loot.
- **Flight conveniences:** J flies a whole multi-jump route; hold E to face your target; Q brings you to a full stop.
- **Ship and captain panel** (I): ship stats, cargo with jettison (raiders often go for dumped cargo), combat rating, fleet
  orders, and every rival captain with their mood toward you.
- **Combat rating** from Harmless to Elite. Bounties pay more as you rise. Wanted contracts need Competent, and elite
  contracts appear for Dangerous captains.
- **Spaceport news and market flashes.** Headlines about rivals, shortages and gluts. A shortage or glut moves one world's
  price for twenty minutes, tagged in the trade screen.

### 1.0.3 "Quality of Life"
- **Autopilot.** Double-click any planet or station (or press L when you are far away) and your ship flies there, turns,
  brakes and lands. Pressing J near a planet flies you clear, then jumps. Any steering key hands control back.
  An AUTOPILOT badge shows while it flies.
- **Radio.** Stations now play in the game itself:
  - a click starts the music straight away
  - a Radio slider in the options mixer and in the radio panel; mute covers it too
  - an in-game ON AIR panel shows the station and the song playing
  - stations that only offer streams your browser can't play fall back to iHeart's own player
- **Jobs.**
  - Each job shows its destination and jump count.
  - Cargo jobs that won't fit your hold say so, and their ACCEPT button is greyed out.
  - Deliveries no longer go to empty derelict hulls.
- **Trade.** MAX fills your hold with what you can afford. SELL ALL CARGO empties it in one click.
- **Outfitter.**
  - Guns show damage and range.
  - Ammo says when you need its launcher.
  - BUY greys out (with the reason on hover) when you can't afford an item, lack outfit space or have no free mounts.
- **Missions tab.** Your current career step sits at the top, and MISSIONS is the tab you see first when you log in.
- **Fuel warning.** The NAV line turns amber when your plotted route is longer than your fuel.
- **Docked controls.**
  - L departs while landed.
  - The command bar (chat, options, keys, ?) stays usable while docked.
  - "Free space" on the landing footer is now labelled "Outfit space".
- **Login.** A failed login no longer leaves "Loading the galaxy..." stuck on the login screen.
- **Packaging.** The zip now unpacks into its own "Quantum Rift vX.X.X" folder.

### 1.0.2
- **No free Gnat Skiffs.** Storing your current ship in the drydock now leaves you with no active ship.
  - DEPART is greyed out, and the overview explains how to choose a ship (FLY THIS in the drydock, or the shipyard).
  - Outfitting, refits and renaming wait until you have a ship.
- **Personal Station.** "Station section" is now called your **Personal Station** everywhere.

### 1.0.1 "Fixes"
- **New planets.** Every planet and moon is now generated from its type and colour:
  - ocean and terran worlds with continents, ice caps, drifting clouds and city lights on the night side
  - deserts with dunes, cracked ice worlds, and lava worlds with glowing fissures
  - banded gas giants with storms, some with rings
  - toxic, crystal and cratered barren worlds
  Planets turn slowly, are lit from one side, and have atmosphere glow.
- **Respawn.** A destroyed ship is rebuilt at your own station hull, or at Quantum Station if you don't have one. It no
  longer turns up wherever you last landed, which could be another player's base.
- **Missions tab.** MISSIONS replaces the MAP tab in the sidebar. It lists each active job and the main story with what to
  do next, how many jumps away it is, and a PLOT COURSE button. Mission target systems have a gold marker on the galaxy
  map. M still opens the map.
- **Command bar.** A brushed steel bar along the bottom holds chat with channel buttons, MAP, KEYS (key bindings),
  options and **?** (a card of every control, also opened with ? or F1). It replaces the line of hints.
- **Station screen.** The landing and station frame now keeps its content inside on smaller screens, scrolling instead.
- **Drydock.** Storing the station's free Gnat Skiff again and again no longer fills your berths with Gnats to sell
  (replaced in 1.0.2 by having no active ship).
- **Cursor.** The neutral targeting cursor is larger.
- **Galaxy map zoom.** The map keeps its zoom when the window size changes.

### 1.0 "Launch"
- **The main story.** Somewhere in the Rift, someone has been waiting a very long time for a visitor.
  - Main-story missions are marked in gold. They arrive as pop-ups when you land in the right place.
  - They lead through a five-part chain with its own rewards, ending in something unique.
  - The Deep is now charted only by those who have earned it.
- **Career guide.** The old tutorial is now a 20-step career that walks you from your first trade through your station,
  crew, research, specialists, armadas and a Holdout, with a reward at each step. Steps that you have already done
  complete themselves.
- **Solo mode.** A separate launcher runs a private single-player server: no passwords, pause (P), save slots on the login
  screen, and export and import of captains.
- **Backups.** Every server keeps a rolling backup of all saves every 30 minutes.
- **Balance pass.** A new balance report (`test/balance.js`) checks every shipyard ladder, value for money and the time
  each milestone takes to afford.
  - Specialists now cost 30% fewer credits, since blueprints already gate them.
- **Accessibility and options.**
  - Remap every flight and command key; the arrow keys always steer.
  - A colour-blind palette: blue friends, orange hostiles, with hostiles drawn as diamonds on the radar.
  - Interface size from 80% to 140%.
  - Master and effects volume, and a mute switch.
- **Loading bar.** The login screen shows a loading bar while ship art loads.
- **Story fix.** A story step that is waiting where you logged off now pops up when you log back in.

### 0.9 "Hostile Space"
- **Hostile levels and the "can I win?" scan.** Every ship has a level based on its effective strength. The target box
  shows the level and your odds in a straight fight, coloured green, amber or red, next to the class-triangle hint.
- **Loot chests.** Each hostile type drops its own chest: Hollow Caches, Umbral Reliquaries, Swarm Nodules and Eclipse
  Shard Caches.
  - Chests hold credits, a crate graded by the enemy's level, specialist blueprints (Vanguard, Nightglass or
    Swarmbreaker), the specialist's resource if you fly her, and sometimes a directive.
  - Bosses and armadas always drop one.
- **Solo armadas.** Hollow, Umbral and Eclipse **directives** each summon a flagship and its escorts, scaled to your
  ship.
  - You have ten minutes to destroy it, for credits, crates and specialist blueprints.
  - Directives come from chests, weekly goal claims, Holdouts and faction stores (Friendly and Honored standing).
  - Summon them from the OPS tab while in space. They are not allowed in the Concord core.
- **Station Holdout.** From your station's Defense section, launch into ten escalating waves.
  - You fight alongside defense platforms: one, plus one per turret level.
  - Rewards grow with every wave you clear: credits, crates, Bulwark blueprints (Raider Insignia in a Bulwark), and an
    Umbral Directive for beating all ten.
  - You can start one every 2 hours.
- **A weekly rhythm.** Events now follow the day of the week (UTC):
  - Mon: Prospector's Rush. Tue: Hangar Days. Wed: Bounty Week. Thu: Umbral Eclipse. Fri: Armada Night.
    Sat: Clean Sweep. Sun: Swarm Sunday.
  - The first weekend of each month is a Gold Vein weekend.
  - The OPS tab shows the coming week.
- **The Umbral Eclipse.** Violet-lit Umbral cells roam dangerous Frontier, Umbral and Deep space. On Thursdays they
  appear across the galaxy.

### 0.8 "Specialists"
- **The Sol Gateway.**
  - **Sol** is a new system near the centre of the map, with **Earth** (full services and its own landing picture)
    and **Luna Station**.
  - Sol's wormhole, the animated vortex from EV Quantum 3.6, leads to **Farside**: ten new systems off the
    north-west edge of the galaxy, reachable only through the Gateway.
  - Farside is flown by common hulls only, with no racial ships.
  - Crossing is free: just fly into the wormhole. Routes plot straight through it, and J tells you when the next leg
    is the wormhole.
- **Ship roles and the class triangle.** Every hull is now an Interceptor, Explorer, Battleship, Survey or Carrier.
  - Interceptors beat Battleships, Battleships beat Explorers, and Explorers beat Interceptors: +15% damage dealt
    when you counter the target, 10% less when it counters you.
  - Survey ships mine 50% better but fight 20% worse.
  - Roles show in the shipyard, the codex, your overview, and the target box ("YOU COUNTER IT" or "IT COUNTERS YOU").
- **Ten specialty ships,** newly designed and rendered:
  - Lodestar (mining)
  - Swarmbreaker (Feral Swarm)
  - Nightglass (the Umbral)
  - Corsair (boarding)
  - Herald (escorts)
  - Tidecaller (salvage)
  - Pathfinder (two-system jumps and anomalies)
  - Bulwark (station defense)
  - Wraith (smuggling, stealth)
  - Vanguard (bounties)
- **How a specialist works:**
  - Each job drops that specialist's **blueprints**, whatever you fly. Forty blueprints let you build her at your
    station (Ops 3).
  - Flying her earns her unique resource, which the refinery turns into **parts**.
  - Parts upgrade five components (weapons, shields, hull, drive and specialty).
  - A full set unlocks a timed **tier-up** in the drydock, up to Tier 5. She cannot fly until it is done.
- **The Feral Swarm.** Wild Vashari drone clusters now roam Vashari and Frontier space and attack everyone.
- **Station rework.** Your station screen now has its own buttons: Ops, Refinery, Research Lab, Academy, Hangar,
  Drydock, Defense and Specialists. The Hangar tab is folded in.
- **Faction stores are their own menu.** Open them with the button on any landing screen or from the OPS tab, and
  browse every power's quartermaster. Purchases are delivered wherever you are landed.
- **A new title screen,** in the game's metal style.
- **Removed:**
  - The How to Play guide. A new one will come when the game is finished.
  - Its options panel moves to the gear button (or the O key).
- **Version and port warnings.** The login screen shows the version number, and the server explains clearly if
  another copy is already using the port.

### 0.7 "Frontier Life"
- **Planetary colonies.** Settle unclaimed planets in Frontier space and the Deep. You can run two colonies, or three
  at Ops 5.
  - Colony levels 1 to 5 bring more building slots and higher production.
  - Production buildings: farms, deep mines, gas extractors, crystal works, habitat domes (credits) and orbital
    foundries. Each stockpiles a day's output for you to collect.
  - Buff buildings give permanent bonuses on every ship you fly, with a cap per stat: Shield Array, Hull Yards,
    Gunnery Range and Nav Beacon.
  - Colonies are labelled in space.
- **Station defense.** Raiders hit Personal Stations from Ops 2, every 8 hours.
  - If you are in the station's system, the raid is a live wave that you can fight off for double salvage.
  - Otherwise your defense rating decides the raid. The rating comes from Ops level, the Defense Grid and
    upgradeable turrets (levels 1-5).
  - A lost raid loots the refinery and part of your low-grade crates.
- **Ship mastery.** Each hull gains experience from kills, jumps, jobs and mining. Tiers 2 to 5 add shields,
  armor, damage, speed and turn. Tier 5 also gives the ship a gold trim that every captain can see.
- **The Crucible (arena).** Instanced, rated 1v1, 2v2 and 4v4 matches, queued from any landing.
  - Teams are drafted by rating. You fly your own ship without escorts.
  - There is no insurance fee and repairs are free.
  - The last team flying wins; if time runs out, the team with the most hull and shields left wins.
  - Results adjust an Elo rating and pay credits.
- **The Exchange.** Player buy and sell orders for every crate grade and commodity, shared across all markets.
  - Orders are escrowed and filled at the resting price, with a 2% seller fee.
  - Bought commodities wait in exchange storage. You can also send credits to any captain.
- **Leaderboards and profiles.** Seven boards on the community screen: credits earned, kills, mining, arena
  rating, station Ops, colonies and mastery. Click a name, or look one up, to see that captain's ship, station,
  colonies, record, arena rating and best mastery.
- **Notifications.** Optional desktop notifications for shuttles coming home, raids, invasions and exchange fills
  while the game is in the background.
- **Gamepad and touch controls.**

### 0.6 "Fleets and Fronts"
- **Fleets.** Found a fleet (50,000 credits) with a 2-4 letter tag that shows on members' names in space, or join
  one: open fleets take anyone, closed ones take requests.
  - Fleets have a shared bank, their own chat (`/f`), and up to 30 members.
  - Fleetmates never fight each other.
  - Fleetmates in the same system get a 25% share of each other's bounties, paid on top of the killer's.
- **Territory and Dreadnoughts.** A fleet leader can anchor a Dreadnought in an unclaimed Frontier system, paid
  from the fleet bank. Four models are available, from 6M to 11M credits. A fleet can hold up to three systems.
  - In a held system, members get +8% damage and shields.
  - Outsiders' trades there pay 5% into the holding fleet's bank.
  - Rivals can only damage a Dreadnought during the daily front window (19:00-21:00 UTC by default). Destroying it
    frees the system for the victors.
  - Dreadnoughts defend themselves, never attack their own fleet, and repair slowly when left alone.
- **Invasions.** Every two hours an Umbral Leviathan or a Hollow Dreadfort, with escorts, appears in a dangerous
  system for 45 minutes. Everyone who damages it shares a 1.5M to 2.5M credit pool by damage share, plus crates
  and Rift scrip. Invasions are announced in chat and pulse on the map.
- **Galactic anomalies.** Nine systems carry a modifier that rotates every 6 hours: ion storm, dense nebula (radar
  range halved), solar maximum, gravity shear (double jump fuel), rich veins, and quantum echo. They show on the map,
  and you get a notice when you arrive.
- **Server events.** A calendar rotates every two days through Festival Market, Hollow Surge, Prospector's Rush,
  Academy Week and Hangar Days, each with game-wide modifiers.
- **Daily and weekly goals.** Three of each, covering kills, jumps, trading, mining, shuttle runs, jobs, charting
  and boarding. Each pays credits and Rift scrip, with a bonus crate when you clear the set. They live in the new
  OPS companion tab, along with the event, the invasion, local anomalies, your fleet and the event calendar.
- **Faction stores.** Every market world in a power's space has a quartermaster. Jobs finished in that space and
  commissions earn the power's tokens, and Rift scrip covers any shortfall. Store items unlock with standing:
  crates, Rare and Epic officer contracts, bridge training manuals, and free-passage writs.
- **New jobs:**
  - Convoy escort: keep a freighter alive to its landing while Hollow raiders hunt it.
  - Smuggling: big pay, but patrols in lawful space can scan you, fine you and seize the cargo.
  - Rescue: board a stranded ship and choose Rescue.
  - Survey: fly over three marked points, shown in space and on radar.
  - Wanted kingpins: a raider capital with two bodyguards.
  - Commissions: a three-step job chain for each power, ending in +12 standing and 10 tokens.
- **Fix:** the Umbral now attack on sight, as they always should have. Destroying them pays a bounty instead of
  costing standing.
- The danger meter on the map is drawn rather than typed, so it shows correctly on every system font.

### 0.5 "Hangar Deck"
- **Shuttles.** The hangar opens at Ops 2, with one bay per Ops level from 2 to 5 and two more from research.
  - Five types: Courier, Survey, Salvage Tender, Envoy Yacht and Prospector Hauler.
  - The hangar job board posts six jobs every three hours: deliveries, surveys, salvage, diplomatic visits and
    prospecting, to systems 1 to 7 jumps away.
  - Each job takes 15 minutes to 8 hours of real time and keeps running while you are offline.
  - The odds depend on the job, the system's danger, matching the right shuttle to the job, a crew officer
    (scouts are best) and research.
  - Rewards: credits, material crates, standing, newly charted systems and rare finds.
  - Shuttles can come back damaged (repair at your station) or be lost in dangerous space.
  - Shuttles visibly launch from and return to your Personal Station.
- **Officers.** Every inhabited world with a job board has a bar where three officers of the local race look for
  a berth each hour.
  - Six roles: Captain, Engineer, Gunner, Navigator, Quartermaster and Scout.
  - Four rarities, from Common to Epic, and levels 1 to 10.
  - Bridge slots: a captain (x1.25) and two bridge officers.
  - Two officers of the same race on the bridge unlock a race synergy bonus.
  - Officers gain experience from kills, jumps, jobs and shuttle runs.
  - Their bonuses are shields, armor, damage, shield recharge, speed, turn, acceleration, fuel, cargo, salvage pay,
    mining yield and shuttle odds.
- **Research trees.** Four trees (Combat, Station, Galaxy and Shuttles) with 28 projects.
  - Queueing a project queues its unfinished prerequisites first. Up to six projects can be queued.
  - The queue starts the next project on its own when the lab is free and you can pay.
  - New effects include deeper silos, faster refining, better crate grades, drydock berths, fuel scoops,
    compressed holds, mining and salvage bonuses, more hangar bays, and shuttle speed, armor, yield and crew
    training.
- **Refining.** Three crates refine into one crate of the next grade, with "Refine all".
- **Drydock.** There are berths from Ops 3, plus two more from research. Stored ships keep their escorts and
  bridge crew, so each berth works as a fleet preset. You can swap ships or sell stored ones.
- **Boarding.** Press B next to a disabled ship, then choose one:
  - Plunder: take credits, cargo and maybe a crate.
  - Capture: needs an officer on the bridge. The ship goes to your drydock, or is sold if no berth is free.
  - Rescue (lawful ships) or arrest (pirates): earns standing or a Concord reward.
  Lawful factions remember plunder and capture.

### 0.4 "The Wide Rift"
- The galaxy grows from 30 to 200 systems. It is generated from a fixed seed around the 30 hand-made systems,
  so it is the same for everyone and survives restarts.
  - Each power holds a territory: 14 systems for most powers, 13 Lamplighter, 12 Hollow, 9 Umbral, and 6 for the
    Que'vari, who keep to a small domain.
  - About 48 Frontier systems are unclaimed and lawless, and 14 systems in the Deep are very dangerous.
  - Each race has its own system names, planet colours, descriptions and trade goods. Danger rises toward the rim.
- New galaxy map: drag to pan, wheel to zoom, HERE and WHOLE GALAXY buttons, and search by system or world.
  Unvisited systems show as hollow rings until you chart them by visiting.
- Multi-jump routes: click any system and the shortest safe route is plotted. J jumps along it, one leg at a time.
- Sleeping systems: a system is only simulated while someone is in it. It wakes with fresh traffic on arrival.
- Frontier traffic flies real flags (Spacers, Hollow and Umbral raiders), and region traffic matches the territory.
- Mining: asteroid fields, gas clouds and crystal formations. Buy a Mining Laser (gun) or Heavy Mining Laser
  (turret) at an outfitter, then break rocks to scoop Raw Ore, Gas or Crystal Shards. Rocks regrow. Mining
  weapons are six times as effective on rock.
- Ore processing at your Personal Station: 12 t of ore makes one material crate (Alloy, Isotope or Crystal). The
  crate grade improves with your Ops level.
- 27 claimable station hulls, up from 17: 10 new ones sit in Frontier space.

### 0.3 "Clean Fire"
- Fixed black lasers: 30 projectile weapons were exported with colour #000000, which overrode the palette.
- Every weapon class now looks different: bolts, railgun streaks, plasma pulses, missiles and rockets with smoke
  trails, glowing torpedoes, the Singularity Torpedo, blinking mines, flak, Ylith prism shards, venom and magma.
- Mouse control: click ships or radar blips to target, click planets for nav, double-click to land, wheel zoom,
  optional mouse aim. L now lands on the nav point you clicked.
- A custom brushed-steel cursor set (target, friendly, neutral, land, plot course, resize, aim, busy).
- Combat feedback: fireball explosions with smoke and debris, shield shimmer where hits land, floating damage
  numbers for your hits and hits on you, blast rings, light screen shake.
- How to Play: the seven intro cards as an in-game guide (first login, the ? button or H) with options.
- First-flight tutorial: five goals with rewards (target, jump and land, trade, clear a raider, find a hull).
- Escorts keep separate formation slots; disabled wrecks are towed away after 75 s.
- Security: failed-login throttle (6 misses per name or address per 10 minutes) and a size cap on fragmented
  WebSocket messages.
