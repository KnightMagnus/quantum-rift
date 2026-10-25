# Quantum Rift

**A space trading and combat game in your browser.**

Fly a ship through a living galaxy of more than 200 star systems. Trade between worlds, take jobs and bounties, mine asteroids, fight pirates, build up a Personal Station, and lead a fleet of crewed wingmates. Play alone, or host a server where friends team up in an Armada.

**Quantum Rift is currently in beta and under ongoing development. All features are subject to change.**

## [Download Quantum Rift](https://github.com/KnightMagnus/quantum-rift/releases/latest/download/Quantum-Rift-latest.zip)

Download the latest release, extract it, and follow the launch instructions below.

## Features

### Explore the galaxy

- Travel between distinctive star systems, rendered planets and stations, from busy trade routes to the remote Eventide frontier.
- Meet traders, convoys, patrols, pirates and rival captains with their own personalities and careers.
- Visit illustrated worlds and see colonies grow through three settlement stages.
- Cross the Gateway near Quantum Station into Farside, recover ancient data cores, and follow faction stories and spaceport questlines. The main story follows your captain through choices, rival peoples and different endings.
- Hail passing ships for conversation, assistance and encounters. Incoming calls wait until you choose to answer.

### Trade, mine and take jobs

- Trade on markets shaped by shortages, local events and what captains buy and sell.
- Earn your way through deliveries, passenger runs, bounties, patrols, rescues and smuggling. Compare travel, room needed, danger and your payout before choosing a job.
- Mine asteroid, gas and crystal fields; survey deposits, refine your haul and tow large finds home with specialized equipment.
- Follow faction and Syndicate careers, develop colonies, earn combat ratings and climb the leaderboards.

### Fly and fight

- Choose from a wide range of ships, including specialty vessels, with guns, beams, missiles, point defense and drones.
- Master momentum-based flight or use optional combat assist. Autopilot handles landing and plotted jump routes.
- Face enemies that retreat, call for help or bring capital-ship firepower. Friendly fire has consequences.

### Build a station and crew

- Turn a derelict hull into your own **Personal Station**, with refining, research, shipbuilding and defenses. Upgrade it or relocate to another hull.
- Store ships in your hangar and organize docks around a lead ship and crewed wingmates that fly in formation and follow orders.
- Hire and promote officers for your bridge and fleet, then defend your station in Holdout battles.

### Play with friends

- Form an **Armada** to travel together, share bounties and take on co-op contracts and station defenses. Review team-contract shares and choose Ready before joining.
- Keep in touch through friends lists, private messages, local chat and player hails, with privacy and blocking controls.
- Trade credits, cargo and crafting supplies between captains.
- Choose your PvP: consensual duels or rated team matches in the **Crucible** arena, rather than open-world player hunting.

### Play your way

- Solo mode includes pause, save slots and save-file import and export. A newcomer truce limits ambient hostility while you establish your station; missions and deliberate aggression can still lead to combat.
- Remap controls, adjust interface scale, use a colour-blind palette, or play with a gamepad or touch controls.
- Choose a captain portrait under **Captain → Profile** while flying or landed. Your face appears in public profiles and player hails.
- Resize the Tray, minimap and tabbed menu to suit your screen. Keep browsing positions and filters, and pin one next objective without hiding your other missions.
- Discover radio stations through exploration and special jobs.

## Start playing

You need a modern browser. The computer running a downloaded game also needs the [supported runtime](docs/TYPESCRIPT-RUNTIME.md#install-the-local-runtime); the setup guide lists compatible systems. Friends joining your game only need a browser.

After completing that one-time setup, open the extracted game folder:

- **Windows:** double-click **`Start Solo Game.bat`** for a private game, or **`Start Friend Game.bat`** to host friends.
- **macOS / Linux:** open a terminal in the extracted folder and run `sh start-solo.command` for a private game, or `sh start-friends.command` to host friends.

Open **http://localhost:8080** if the browser does not open automatically. Keep the server window open while playing. Solo games accept connections only from your computer; for multiplayer on the same network, friends open `http://<host-computer-address>:8080`. Each player uses a different captain name and their own password. See the [friend-host guide](docs/HOSTING.md) for inviting players and keeping backups.

When updating, close the old game server window first. Preserve your `data/`, `solo-data/` and `friend-data/` save folders; do not replace them with empty folders from a new copy. Solo and friend games keep separate progress; saves do not automatically transfer between modes. Save imports remain Solo-only.

## Guides

- [Runtime requirements and building from source](docs/TYPESCRIPT-RUNTIME.md)
- [Hosting a game for friends](docs/HOSTING.md)
- [Dedicated server setup](docs/NAKAMA.md)
- [Beta Solo save generator](test/Save%20Generator/README.md)
- [Development tools](docs/DEVELOPMENT-TOOLS.md) and [code navigation](docs/CODE-NAVIGATION.md)
- [Release notes](docs/RELEASE-3.4.2.md)

## Screenshots

**The Gateway in Concordia**

![Flying past the Gateway near Quantum Station](docs/screenshots/concordia-gateway.png)

**Farside exploration**

![The silent hulk north of Aureole Research Ring](docs/screenshots/aureole-hulk.png)

**Story encounters**

![Sel’ani’s character portrait in a main-story dialogue](docs/screenshots/main-story-portrait.png)

**Beyond the Rift**

![A captain flying beside the far-side rift under the arrival sky](docs/screenshots/beyond-rift.png)

**Login traffic**

![A capital ship and its escorts crossing the login observation window](docs/screenshots/login-formation.png)

**Flight cockpit**

![Responsive flight cockpit in Meridian with the sidebar closed](docs/screenshots/responsive-flight.png)

**Expanded chat projection**

![Chat history projected upward from the flight console](docs/screenshots/responsive-chat.png)

**System radar and sidebar**

![Expanded sidebar with square system radar](docs/screenshots/responsive-sidebar.png)

**Landed services**

![Ultrawide landed shipyard inside the flight window, clear of the sidebar and console](docs/screenshots/responsive-landed.png)

**Growing colonies**

![A level-five colony on Far Prime with its settlement-stage illustration](docs/screenshots/colony-stage3.png)

**Captain portraits**

![Captain profile with selectable portrait cards and the saved portrait preview](docs/screenshots/profile-chooser.png)

**Hails and caller portraits**

![Docking-control hail displaying the caller portrait over the landed colony view](docs/screenshots/docking-hail.png)

**Index transmissions**

![An Index machine's ship artwork in its incoming hail](docs/screenshots/index-ship-hail.png)

**Index worksites**

![Large Index machines keeping separate berths around a Glasswake worksite](docs/screenshots/index-fleet-spacing.png)

**Controls reference**

![Two-column flight and menu controls with paired key bindings](docs/screenshots/controls-reference.png)

**Galaxy map**

![In-game galaxy map menu](docs/screenshots/responsive-map.png)

**Settings and key bindings**

![Horizontal flight, sound and key-binding control bays](docs/screenshots/cockpit-settings.png)

**Discoverable radio stations**

![Playing the owner-supplied Super-Idol album with all five stations unlocked](docs/screenshots/radio-discovery-draft.png)

**Local faction store**

![The local Concord store with live faction standing while landed in Concord space](docs/screenshots/faction-store-local.png)

**Friend-hosted universe**

![Friend-hosted universe login with separate captain name and password fields](docs/screenshots/friend-host-login.png)
