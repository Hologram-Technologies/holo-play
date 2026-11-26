# Holo Play: verification record

Project-owned evidence. The universal rules are in `VERIFICATION.md`.

## Phase 1, 2026-11-26, prism-code 0.11.5

### Gates

| Command | Result |
| --- | --- |
| `check` | 21 theorems declared, 21 proved, 0 contract violations, 0 design violations |
| `build` | 53 of 53 acceptance vectors passed |
| `verify` | exit 0: 21 of 21 theorems, identities verified, 53 of 53 vectors, level P0 |

### Planted defect

- Defect: in `App.route`, the readable test was removed, so an unreadable item would reach the engine.
- Command: `npx prism-code@0.11.5 check --json`
- Result: exit 1. `contract.theorem-unproved` for HP-03 and `proof.rejected` for
  `unreadable_never_reaches_engine` ("no proof found").
- Restored: the model was put back and `check` passed again, 21 of 21.

### Tested in a browser

Chromium, in the Claude desktop app's browser pane, on Windows 11. The app was opened in its holospace from
`prism-code run`.

| What | Result |
| --- | --- |
| Home screen draws with the three bundled covers | passed |
| A bundled track is fetched over https, its SHA-256 matches, and it plays | passed |
| Label reads "WAV · lossless 16-bit", "Engine · Hi-Fi", "Verified" | passed |
| Track 3 of 4 ends and track 4 starts (`ahead` answered `play`) | passed |
| Track 4 of 4 ends and playback stops with repeat off (`ahead` answered `stop`) | passed |
| Sound panel: presets, EQ, live output meter, engine rate shown | passed |
| Enhance off: the track is routed direct; on again: through the engine | passed |
| Opened at `/` outside the holospace: every fetch is blocked by the page policy | as expected |

### Not tested

- **Internet Archive.** `archive.org` could not be reached from this machine: the browser pane refused the
  navigation and `curl` failed its TLS handshake. The shelf showed its "could not be reached" line. So no Archive
  lossless track was played, and the lossless-to-MP3 fallback was not seen in a browser. The rule behind it is
  proved (HP-01, HP-02) and its vectors pass.
- A mismatched hash in a browser. The refusal path is written; no tampered file was served to it.
- Listening quality by ear, phones, Firefox and Safari.
- Shuffle, repeat one, remove from queue and the keyboard keys were not exercised in the browser.

## Search and streaming, 2026-11-26, prism-code 0.11.5

### Gates

| Command | Result |
| --- | --- |
| `build` | 25 theorems proved, 58 of 58 vectors passed, 0 design violations |
| `verify` | exit 0: 25 of 25 theorems, identities verified, 58 of 58 vectors, level P0 |

### Tested in a browser, in the holospace

| What | Result |
| --- | --- |
| Home shows Audius trending tracks with artwork | passed |
| Typing "deadmau5" lists full tracks, then artists, then albums and playlists | passed |
| A search result plays as a full track (5:41), labelled "MP3 · full track", "Engine · Hi-Fi" | passed |
| An artist page opens with its top songs while the track keeps playing | passed |

### Measured, not asserted

- `itunes.apple.com` search, lookup and chart answer `Access-Control-Allow-Origin: *` to a request with a named
  origin or none, and send no such header to `Origin: null`. A holospace page has that origin, so the catalogue
  shelves stay hidden there. Seen with `curl` on 2026-11-26.
- Audius search, trending, artist, playlist and stream endpoints answered `Origin: null` with open CORS.

### Not tested

- The catalogue path (iTunes songs, the `picks` choice between an open match and a preview) in a browser: it has
  never answered in the holospace. Its rule is proved (HP-09) and its vectors pass.
- The companion path (`/caps`, `/sc/search`, `/sc/stream`): no Hologram host was running here.
- Playlist pages, hot playlists shelf clicks, phones, Firefox and Safari.

## Radio, podcasts, resume and saved items, 2026-11-26, prism-code 0.11.5

### Gates

| Command | Result |
| --- | --- |
| `build` | 25 theorems proved, 58 of 58 vectors passed, 0 design violations |
| `verify` | exit 0: 25 of 25 theorems, identities verified True, 58 of 58 vectors, level P0 |

### Tested in a browser, in the holospace

| What | Result |
| --- | --- |
| Radio lists popular stations with codec and bitrate; one plays, labelled "MP3 320k", "Direct", "Live" | passed |
| SomaFM channels list with artwork; the now-playing line appears | passed |
| Podcasts list popular shows; a show opens with 50 episodes; an episode plays as "Publisher’s file", "Direct" | passed |
| Forward 30 seconds moves the episode on | passed |
| The heart saves the episode and it appears under Saved | passed |
| After another track, the saved episode resumes near where it was left (`seeks` answered `resume`) | passed |

### Defects found and fixed in this pass

- A media element reset for the next item could deliver the previous item's error, which was counted as a new
  failure. Errors are now counted only while the element reports one.
- Podcast artwork is the publisher's original, often 3000 pixels square. A page of them made the page stop answering
  clicks. Each is now fetched once, one at a time, and redrawn at 320 pixels; a host that refuses leaves a plain tile.
- Long station lines widened the page. Fixed.

### Measured, not asserted

- SomaFM's stream servers answered this browser pane with 403, while the same request with a desktop Chrome
  identity succeeded from `curl` (200, `audio/mpeg`, open CORS). So no SomaFM stream was heard here, and whether it
  reaches the engine in a normal browser is not established.
- `librivox.org` sends no CORS header, and the fyyd image host refuses other sites, so neither is used.

### Not tested

- Audiobooks: they come from the Internet Archive, unreachable from this machine.
- Speed, the sleep timer, skip back, a pasted link, radio and podcast groups in search results, genre shortcuts.
- A saved item's picture shows as a broken image when its artwork was a redrawn copy. Not fixed.
- Phones, Firefox, Safari, and listening quality by ear.

## Artwork, playlists, links and the Phase 2 gate, 2026-11-26, prism-code 0.11.5

### Gates

| Command | Result |
| --- | --- |
| `build` | 25 theorems proved, 58 of 58 vectors passed, 0 design violations |
| `verify` | exit 0: 25 of 25 theorems, identities verified, 58 of 58 vectors, level P0 |

### Tested in a browser, in the holospace

| What | Result |
| --- | --- |
| Podcast artwork: all twelve tiles on screen drew, sharp, with the page still answering | passed |
| Music artwork: tiles draw; a picture whose hosts all fail shows the music icon, never a broken image | passed |
| Search "jazz" lists full tracks, radio stations and podcasts as separate groups | passed |
| A station from search plays; the Queue panel lists the eight stations | passed |
| Removing a queued station keeps the playing one (`strip` answered `keep`) | passed |
| "Save the queue as a playlist" saved seven stations and confirmed it | passed |
| A pasted YouTube link is answered `external` and says where such links play | passed |
| A pasted link to a WAV file is answered `track` and plays through the engine | passed |
| Recently played lists what was played | passed |

### A fault in the test, not the app

For part of this session clicks stopped reaching the app. The cause was the test pane's emulated window size: with
it cleared, every click, key and scroll arrived. The app opened on its own at `/` answered clicks throughout. An
earlier note in this file blamed large podcast pictures for the same symptom; that was not established.

### Changed after the last browser check, so not seen in a browser

- Queue rows now cut long titles short. The time label resets when a new item starts. A linked file keeps the
  capitals in its name.

### Phase 2 exit gate: not met

Met: every source that this machine can reach was searched and played in a browser, with a truthful label.
Not met:

- Audiobooks and Internet Archive music: `archive.org` is unreachable here. Never loaded.
- SomaFM streams: refused to this test pane with 403. Never heard.
- The Hologram host sources (SoundCloud, pasted page links, the iTunes catalogue): no host was running.
- A Subsonic server connection: written from Holo Music's data layer; no server was available to connect.
- Speed, the sleep timer, skip back, genre shortcuts, opening and deleting a saved playlist: built, not exercised.
- Playlists hold a saved queue only. Adding one track to a playlist, ratings and play counts are not built.

## The look, 2026-11-26

Aligned with Prism Foundry: the `hologram` preset, recorded in `app/DESIGN.md`. Section descriptions, eyebrow lines,
the toolbar badge, tile borders and button words were removed; the play button carries the one accent.
`verify` exit 0, 25 theorems, 58 vectors, 0 design violations. Seen in the holospace: the Music home, the player
bar while a track played, and Radio. Not seen after the change: Podcasts, Audiobooks, Saved, search results, the
album page, the Sound and Queue panels, light mode and phone width.

## Phase 3 review, 2026-11-26

Seen at desktop width in the holospace, dark: Music home, search results with thumbnails, Podcasts, a podcast page,
Saved with a playlist, Radio, the Sound panel, the player bar. Seen at phone width and in light mode, opened on its
own at `/` (no network there): Radio, the player bar, the Sound panel. No horizontal overflow at 375 pixels.

Fixed from the review: each view now opens at its top; podcast pictures draw three at a time; the phone player
drops shuffle and repeat so the title has room; the app name gives way to the search box on a phone; a shelf whose
source is out of reach steps aside.

Not done in Phase 3:

- Listening by ear against the original Holo Music. It needs a person and speakers.
- Light mode and phone width with real content, and any real phone, Firefox or Safari.
- Genre shortcuts, speed, skip back, and opening and deleting a playlist were not exercised.
- Not published. No repository, registry entry or store listing exists yet.

## Seeing the music, 2026-11-26, prism-code 0.11.5

### Gates

| Command | Result |
| --- | --- |
| `build` | 41 theorems proved, 87 of 87 vectors passed, 0 design violations |
| `verify` | exit 0: 41 of 41 theorems, identities verified, 87 of 87 vectors |

### Planted defect

- Defect: in `App.show`, the engine test was removed, so a source the page cannot read could be drawn as sound.
- Result: `check` exit 1, `contract.theorem-unproved` for VZ-01, `direct_is_never_drawn_as_sound` not proved.
- Restored: 41 of 41.

### Tested in a browser, in the holospace

| What | Result |
| --- | --- |
| The view opens over the app from the player; the picture draws and moves while a track plays through the engine | passed |
| A wide stereo mix draws as two lines, apart | passed |
| The scene changed during play, and the colour moved | passed |
| The title and controls fade while the picture reacts | passed |
| Bright areas no longer pile up into white (seen before the fix, not after) | passed |

### Not tested

- That a flash and its drum hit arrive together: the picture is not yet delayed by the output latency.
- `still` for a direct source, `rest` when paused or silent, the lock, touch, the cover laid into the picture,
  reduced motion, the detail ladder under load, and radio or podcasts now trying the engine first.
- Whether tempo, key, brightness and width are measured correctly. They are computed from the samples; no known
  test signal was played to check the numbers.
- Frame rate, phones, Firefox and Safari. Nothing here was heard by a person: the test pane has no speakers I can use.

## Resolution, attention and more of the sound, 2026-11-26

`build` and `verify`: 44 theorems proved, 96 of 96 vectors, 0 design violations (see the run below this section's
commit). Added: VZ-06 attention; the detail ladder now has six steps, the top three drawing more pixels than the
screen has, capped at 7680 by 4320; sixteen-bit float colour where available; attack and noisiness measured from
the spectrum.

Seen in the holospace: the picture drew and reacted, and the on-screen line read "drawn at 1669 × 573", the test
pane's own pixel count. About ten seconds later it read "drawn at 668 × 229": the model had stepped the detail down
to its lowest step because frames in the test pane took longer than 22 ms.

Measured, not asserted: that step-down. Whether it came from the picture's cost or from the pane limiting frames
was not established. A display that refreshes 30 times a second would be held at the lowest step by this rule;
that is a known weakness.

Not tested: any step above the screen's own pixels, an 8K or 4K display, whether float colour was in use, the
attention rule's effect by eye, attack and noisiness against a known signal, and everything listed as untested in
the section above.
