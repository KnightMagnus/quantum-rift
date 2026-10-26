# Radio content and discovery

The radio includes 34 owner-supplied station recordings and a separate login theme. The owner confirms commercial rights to every recording and its lyrics.

## Stations

| ID                       | Display name               | How to acquire                                                      | Playback            |
| ------------------------ | -------------------------- | ------------------------------------------------------------------- | ------------------- |
| `wave-function-collapse` | Wave Function Collapse     | Available to every captain from the start                           | Shuffle             |
| `qvri`                   | QVRI Que'vari Radio        | Enter any system whose faction is `quevari`                         | Shuffle             |
| `interdimensional`       | Interdimensional Radio     | Finish **The Sideways Apology**, a Story Job at Ninefold Prime      | Shuffle             |
| `signal-superposition`   | Signal Superposition Radio | Enter Lost Signal                                                   | Shuffle             |
| `super-idol`             | Super-Idol Radio           | Finish the very rare **Spacepop: the five-stop tour** passenger job | Album order, repeat |

The server saves unlocked IDs per captain. Discoveries use the existing warning/toast and log, once per station. No purchase or manual device-installation step is required. Login in a qualifying current system also recognizes its signal; old explored-system history is not mined for retroactive rewards. Favorites cannot reveal or unlock an unearned station, and are stored separately for each captain. All captains use the same discovery rules; saved unlocks are preserved.

Quietude is a repair-material stop in the scientist story, not a radio discovery location.

## Story Job

At Ninefold Prime, Professor Ivo Kett and his nervous grandson Jem need help repairing their bizarre ship. Ivo's drinking has become a problem; the story ends with him setting the flask aside. Recover a phase coupler from a marked salvage cache in Northmark, then thermal filament from one in Quietude. Return the sealed two-tonne repair kit to Ninefold Prime. These use the normal salvage, mission cargo and Story Job screens. Each cache belongs to the accepting captain; a different captain cannot take the materials.

The last delivery awards the small receiver and automatically adds Interdimensional Radio. The dialogue tells the captain to attach it to the radio console; the crew handles that automatically. Normal step-job payments remain. Starting requires two tonnes of free hold, and the final reward cannot be repeated after completion.

## Rare passenger tour

The initial rarity setting is **one in 1,000 eligible arrival boards**, deterministically keyed to captain, port and completed jump count. Reopening the same board or reconnecting does not reroll it. A new arrival after another jump offers another opportunity; this is an arrival-board chance, not an hourly guarantee or measured balance claim.

Three original super-idols, Lyra, Miri and Solenne, occupy three passenger seats and one ordinary job slot throughout five shows in five different systems. The origin is excluded; each next stop is chosen within three jumps of the previous stop, at a normal landable port with a bar. Arena, Farside, Umbral and story-gated Deep routes, outlaw ports, personal station sites and destinations openly hostile to the captain are excluded.

The board shows all five stops, the three-seat requirement and the final reward. Each correct landing advances one stop; wrong or out-of-order landings pay nothing. After the fifth show, the ordinary passenger completion pays **60,000 credits**, frees the seats and adds their digital album as Super-Idol Radio. Intermediate stops do not pay or release the passengers. Abandoning gives no album. Save/reload preserves the current stop. Once the album is earned, the offer no longer appears.

## Supplied audio and later updates

The authoritative content registry is [`shared/radio-stations.ts`](../shared/radio-stations.ts). Station track counts are **9,4,7,6,8**, respectively. The eight-track Super-Idol sequence was checked against the [supplied published album](https://music.youtube.com/playlist?list=OLAK5uy_lkakAvDQ-FvwPtZQ6gkHf62lgkzycp-iI) and the FLAC masters' track numbers. The published album titles are shown only for station 5. Stations 1–4 have no titles in the shipped registry or MP3 metadata; the HUD simply says **Broadcast**.

[`RADIO-AUDIO.json`](RADIO-AUDIO.json) records the source archive hash, source-to-game mapping, output hashes, lengths and conversion settings. All 35 supplied files (34 station songs plus one theme) were converted to 128 kbps stereo 44.1 kHz MP3 with no trimming, stretching, gain changes or generated audio. Source files total 312,240,243 bytes; delivery copies total 104,856,585 bytes, about 66% smaller. The original supplied song lengths are retained.

The separate Login Theme recording, **Station spatiale**, is active as `client/assets/sfx/music_login33.mp3`. The previous `music_login31.mp3` remains byte-for-byte intact but is no longer the active theme.

The reproducible developer import uses `ffmpeg`, `ffprobe` and Python 3:

```sh
python3 tools/import_radio.py --archive /path/to/Songs.zip --album-order /path/to/album-order.json
npm run format
```

The album-order JSON is an array of the published `position`/`title` records; it is checked against the source FLAC track numbers. No audio is fetched from YouTube: the only recordings used are the supplied ZIP. The source archive SHA256 is verified before extraction. Do not put source masters or the whole ZIP in the game package.

Wave Function Collapse tracks 08 and 09 were supplied separately as MP3 files, after the archive import. They use the same conversion settings and are recorded in the manifest with an `Owner upload/` source. The archive importer preserves these later uploads from the existing manifest after checking their file sizes and hashes. Missing or changed uploads stop the import before conversion.

The Super-Idol array order defines its album order. Tuning starts at the first track, natural `ended` advances, and the final track wraps to the first. Other stations shuffle through every track before refilling, without an immediate boundary repeat. Existing mixer, radio slider and mute controls still apply. MP3s use the repository's existing Git LFS rule; hydrate and verify all assets in a candidate package before release.

Tests hash-check all 35 shipped recordings and actually decode them in a browser, also exercising actual station playback and title hiding. Separate tiny silent WAV fixtures prove natural album-ended ordering without waiting through the full album. The screenshot shows a test captain with saved station unlocks playing the owner-supplied album; new captains must earn unlocks. These are bounded behavioral checks, not subjective listening approval.
