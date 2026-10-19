# Radio content and discovery (draft)

This work is a draft for a future radio release, not part of public 3.2.1. No station recordings have been supplied yet. The existing login theme and its file remain unchanged.

## Stations

| ID                       | Display name               | How to acquire                                                      | Playback            |
| ------------------------ | -------------------------- | ------------------------------------------------------------------- | ------------------- |
| `wave-function-collapse` | Wave Function Collapse     | Available to every captain from the start                           | Shuffle             |
| `qvri`                   | QVRI Que'vari Radio        | Enter any system whose faction is `quevari`                         | Shuffle             |
| `interdimensional`       | Interdimensional Radio     | Finish **The Sideways Apology**, a Story Job at Ninefold Prime      | Shuffle             |
| `signal-superposition`   | Signal Superposition Radio | Enter Lost Signal                                                   | Shuffle             |
| `super-idol`             | Super-Idol Radio           | Finish the very rare **Spacepop: the five-stop tour** passenger job | Album order, repeat |

The server saves unlocked IDs per captain. Discoveries use the existing warning/toast and log, once per station. No purchase or manual device-installation step is required. Login in a qualifying current system also recognizes its signal; old explored-system history is not mined for retroactive rewards. Favorites cannot reveal or unlock an unearned station, and are stored separately for each captain.

The former Free Harbor/Quietude station unlock plan is superseded. Quietude remains a repair-material stop in the scientist story, not a radio discovery location.

## Story Job

At Ninefold Prime, Professor Ivo Kett and his nervous grandson Jem need help repairing their bizarre ship. Ivo's drinking has become a problem; the story ends with him setting the flask aside. Recover a phase coupler from a marked salvage cache in Northmark, then thermal filament from one in Quietude. Return the sealed two-tonne repair kit to Ninefold Prime. These use the normal salvage, mission cargo and Story Job screens. Each cache belongs to the accepting captain; a different captain cannot take the materials.

The last delivery awards the small receiver and automatically adds Interdimensional Radio. The dialogue tells the captain to attach it to the radio console; the crew handles that automatically. Normal step-job payments remain. Starting requires two tonnes of free hold, and the final reward cannot be repeated after completion.

## Rare passenger tour

The initial rarity setting is **one in 1,000 eligible arrival boards**, deterministically keyed to captain, port and completed jump count. Reopening the same board or reconnecting does not reroll it. A new arrival after another jump offers another opportunity; this is an arrival-board chance, not an hourly guarantee or measured balance claim.

Three original super-idols, Lyra, Miri and Solenne, occupy three passenger seats and one ordinary job slot throughout five shows in five different systems. The origin is excluded; each next stop is chosen within three jumps of the previous stop, at a normal landable port with a bar. Arena, Farside, Umbral and story-gated Deep routes, outlaw ports, personal station sites and destinations openly hostile to the captain are excluded.

The board shows all five stops, the three-seat requirement and the final reward. Each correct landing advances one stop; wrong or out-of-order landings pay nothing. After the fifth show, the ordinary passenger completion pays **60,000 credits**, frees the seats and adds their digital album as Super-Idol Radio. Intermediate stops do not pay or release the passengers. Abandoning gives no album. Save/reload preserves the current stop. Once the album is earned, the offer no longer appears.

## Adding the owner's MP3s later

The authoritative content registry is [`shared/radio-stations.js`](../shared/radio-stations.js). The five `tracks` arrays are deliberately empty. Empty stations display **No recordings available yet** and do not attempt playback. No generated substitute tracks, music generator or rejected soundtrack files are included.

When recordings arrive, put approved MP3s under `client/assets/radio/<station-id>/` and add metadata to the matching station:

```js
tracks: [
  { title: 'The supplied track title', url: '/assets/radio/super-idol/01-track.mp3' },
  { title: 'The next supplied title', url: '/assets/radio/super-idol/02-track.mp3' },
];
```

The array order defines the Super-Idol album order. It plays from the first track on tuning, advances on natural `ended`, and wraps to the first after the last. Other stations shuffle through every track before refilling, without an immediate boundary repeat. Existing mixer, radio slider and mute controls still apply. Do not change the login theme without separately supplied replacement audio and approval. The existing MP3 LFS rule applies; hydrate and verify assets in a candidate package before a future release.

Tests use fake metadata and tiny silent WAV responses in isolated browser fixtures to verify ordering/decoding/ended behavior. They are not owner recordings, musical-quality evidence, or production station content. The screenshot shows a seeded all-unlocked review captain and the actual empty-audio HUD; normal captains must earn their unlocks.
