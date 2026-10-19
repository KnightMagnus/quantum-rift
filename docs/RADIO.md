# Radio content and discovery (draft)

This is the3.3.0 release candidate, not yet merged or released. It includes32 owner-supplied station recordings and a separate new login theme. The owner confirms commercial rights to every recording and its lyrics. Public3.2.1 remains unchanged.

## Stations

| ID                       | Display name               | How to acquire                                                      | Playback            |
| ------------------------ | -------------------------- | ------------------------------------------------------------------- | ------------------- |
| `wave-function-collapse` | Wave Function Collapse     | Available to every captain from the start                           | Shuffle             |
| `qvri`                   | QVRI Que'vari Radio        | Enter any system whose faction is `quevari`                         | Shuffle             |
| `interdimensional`       | Interdimensional Radio     | Finish **The Sideways Apology**, a Story Job at Ninefold Prime      | Shuffle             |
| `signal-superposition`   | Signal Superposition Radio | Enter Lost Signal                                                   | Shuffle             |
| `super-idol`             | Super-Idol Radio           | Finish the very rare **Spacepop: the five-stop tour** passenger job | Album order, repeat |

The server saves unlocked IDs per captain. Discoveries use the existing warning/toast and log, once per station. No purchase or manual device-installation step is required. Login in a qualifying current system also recognizes its signal; old explored-system history is not mined for retroactive rewards. Favorites cannot reveal or unlock an unearned station, and are stored separately for each captain. Knight (case-insensitive account name) automatically has all five stations without needing discovery or mission progress; this does not grant other captains access.

The former Free Harbor/Quietude station unlock plan is superseded. Quietude remains a repair-material stop in the scientist story, not a radio discovery location.

## Story Job

At Ninefold Prime, Professor Ivo Kett and his nervous grandson Jem need help repairing their bizarre ship. Ivo's drinking has become a problem; the story ends with him setting the flask aside. Recover a phase coupler from a marked salvage cache in Northmark, then thermal filament from one in Quietude. Return the sealed two-tonne repair kit to Ninefold Prime. These use the normal salvage, mission cargo and Story Job screens. Each cache belongs to the accepting captain; a different captain cannot take the materials.

The last delivery awards the small receiver and automatically adds Interdimensional Radio. The dialogue tells the captain to attach it to the radio console; the crew handles that automatically. Normal step-job payments remain. Starting requires two tonnes of free hold, and the final reward cannot be repeated after completion.

## Rare passenger tour

The initial rarity setting is **one in 1,000 eligible arrival boards**, deterministically keyed to captain, port and completed jump count. Reopening the same board or reconnecting does not reroll it. A new arrival after another jump offers another opportunity; this is an arrival-board chance, not an hourly guarantee or measured balance claim.

Three original super-idols, Lyra, Miri and Solenne, occupy three passenger seats and one ordinary job slot throughout five shows in five different systems. The origin is excluded; each next stop is chosen within three jumps of the previous stop, at a normal landable port with a bar. Arena, Farside, Umbral and story-gated Deep routes, outlaw ports, personal station sites and destinations openly hostile to the captain are excluded.

The board shows all five stops, the three-seat requirement and the final reward. Each correct landing advances one stop; wrong or out-of-order landings pay nothing. After the fifth show, the ordinary passenger completion pays **60,000 credits**, frees the seats and adds their digital album as Super-Idol Radio. Intermediate stops do not pay or release the passengers. Abandoning gives no album. Save/reload preserves the current stop. Once the album is earned, the offer no longer appears.

## Supplied audio and later updates

The authoritative content registry is [`shared/radio-stations.js`](../shared/radio-stations.js). Station track counts are **7,4,7,6,8**, respectively. The eight-track Super-Idol sequence was checked against the [supplied published album](https://music.youtube.com/playlist?list=OLAK5uy_lkakAvDQ-FvwPtZQ6gkHf62lgkzycp-iI) and the FLAC masters' track numbers. The published album titles are shown only for station5. Stations1–4 have no titles in the shipped registry or MP3 metadata; the HUD simply says **Broadcast**.

[`RADIO-AUDIO.json`](RADIO-AUDIO.json) records the source archive hash, source-to-game mapping, output hashes, lengths and conversion settings. All33 supplied files (32 station songs plus one theme) were converted to128kbps stereo44.1kHz MP3 with no trimming, stretching, gain changes or generated audio. Source files total305,931,023bytes; delivery copies total100,729,569bytes, about67% smaller. The original supplied song lengths are retained.

The separate Login Theme recording, **Station spatiale**, is active as `client/assets/sfx/music_login33.mp3`. The previous `music_login31.mp3` remains byte-for-byte intact but is no longer the active theme.

The reproducible developer import uses `ffmpeg`, `ffprobe` and Python3:

```sh
python3 tools/import_radio.py --archive /path/to/Songs.zip --album-order /path/to/album-order.json
npm run format
```

The album-order JSON is an array of the published `position`/`title` records; it is checked against the source FLAC track numbers. No audio is fetched from YouTube: the only recordings used are the supplied ZIP. The source archive was retrieved from the owner's Filebin link and its SHA256 verified before extraction. Do not put source masters or the whole ZIP in the game package.

The Super-Idol array order defines its album order. Tuning starts at the first track, natural `ended` advances, and the final track wraps to the first. Other stations shuffle through every track before refilling, without an immediate boundary repeat. Existing mixer, radio slider and mute controls still apply. MP3s use the repository's existing Git LFS rule; hydrate and verify all assets in a candidate package before release.

Tests hash-check all33 shipped recordings and actually decode them in a browser, also exercising actual station playback and title hiding. Separate tiny silent WAV fixtures prove natural album-ended ordering without waiting through the full album. The screenshot shows Knight's real automatic all-station access and actual owner-supplied album playback; other captains must earn unlocks. These are bounded behavioral checks, not subjective listening approval.
