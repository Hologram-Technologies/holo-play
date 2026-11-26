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

## Animation switch, 2026-11-26

An eye button in the visual view switches the animation off and on; the choice is kept. Off shows the cover and
draws nothing. Seen in the holospace: off showed the cover with the crossed eye, on resumed the picture. `verify`
exit 0, 44 theorems, 96 vectors. Not seen: the choice surviving a reload, and the final tooltip wording.

## Live charts on the home screen, 2026-11-26

Sources tested with the headers a sandboxed page sends (`Origin: null`):

| Source | Result |
| --- | --- |
| ListenBrainz sitewide recordings, release groups, artists (week) | open CORS, used |
| Audius trending by week, month, all time and genre; trending playlists | open CORS, used |
| MusicBrainz release lookup | open CORS, used for an album's tracks |
| Hype Machine popular | open CORS, not used |
| Apple most-played charts (`rss.marketingtools.apple.com`) | no CORS header for any origin, unusable |
| Deezer chart | no CORS header, unusable |
| TheAudioDB | no artwork for the albums tried, not used |
| Wikipedia and Wikidata | answered 429 to this machine, not established |

Seen in the holospace: two seconds after opening, Trending now and Top songs this week were already drawn from
the last visit. Top songs this week, Top albums this week and All-time favourites all filled. The Verified
originals shelf is gone from the home screen. `verify` exit 0, 44 theorems, 96 vectors.

Known gap: chart covers come from the Cover Art Archive, which is kept on archive.org. That host is unreachable
from this machine, so every chart tile here showed its icon instead of a cover. No second artwork source was found.

Not tested: playing a chart song (the match on Audius, and the fall to search when nothing has it), opening a
chart album and its MusicBrainz track list, and the first visit with nothing remembered.

## Chart artwork, second source, 2026-11-26

Chart tiles showed only icons on this machine, because the Cover Art Archive is kept on archive.org and that host
is unreachable here. Added TheAudioDB as a second source, looked up by MusicBrainz id: the album's cover, then the
artist's picture, then the artist by name. Lookups run three at a time and every answer is remembered; once the
archive has failed it is skipped for six hours so tiles do not wait on it.

Seen in the holospace on this machine: all 12 album tiles showed their real covers, and 11 of 12 song tiles showed
a picture, within about eight seconds of opening on a visit that had answers remembered. `verify` exit 0,
44 theorems, 96 vectors.

Known limits:

- A chart song with no album id shows a picture of its artist, not the single's cover.
- TheAudioDB's free access allows about thirty lookups a minute. A first visit makes up to about forty, so a few
  tiles can stay as icons until the next visit. One tile did here.
- Not seen: a first visit with nothing remembered, timed; and a network that reaches archive.org, where the
  release's own cover should be used first.

## Hologram OS Music compared, and categories, 2026-11-26

Studied on the published site `hologram-technologies.github.io/hologram-os/`, as a guest:

- Pressing Music started "Begin Again" at once. The page then held two frames: a SoundCloud widget
  (`w.soundcloud.com/player/?url=…begin-again&auto_play=true`) and a YouTube embed with its script API
  (`youtube.com/iframe_api`, `youtube.com/embed/…?enablejsapi=1`). So that site plays through the services' own
  embedded players.
- Its "Open full Holo Music" opens the Holo Music app already ported here.
- The home screen in the owner's screenshots (decades, moments, "Top songs today", song search) was not found in the
  site's 440 scripts and pages that could be fetched, nor in the public repositories. Its chart matches Apple's
  top-songs feed and its search results read like the iTunes Search API, but its code was not seen, so how it finds
  the recording to play for a searched song is not established.

Why Holo Play cannot do the same inside a holospace today, both checked earlier in this file:

- The holospace page policy names no `frame-src`, so no frame may load: no YouTube or SoundCloud player.
- iTunes and Apple's charts send no CORS header to a page with an opaque origin.

Both are limits of the holospace an app runs in, not of the app. Lifting them means a change to holospace-shell.

Added in Holo Play: five moods (Focus, Energy, Chill, Night, Discover) and eighteen genres, each what is trending in
it this week on Audius, playing in full. Seen in the holospace: the mood chips on the home screen; Chill opened with
41 tracks and one played through the engine. `verify` exit 0, 44 theorems, 96 vectors. Not seen: the genre chips at
the foot of the home screen, and the other four moods.

## Catalogue search and the player rules, 2026-11-26

### Gates

`prism-code@0.11.5 build` and `verify`: 51 theorems proved, 113 of 113 vectors, identities verified, no design
violations, 18 IDs with 18 scenarios.

### Added

- PL-01 `plays`, PL-02 `ytids`, PL-03 `place` in the model, with failure rows for `not an identifier` and
  `too small`. These specify playing through an embedded YouTube or SoundCloud player.
- Search fills Songs, Artists and Albums from MusicBrainz. Audius results sit beside them as "Plays in full".
- Albums before EPs before singles, one tile a title; studio takes before live sets and remixes.
- A catalogue song with no source no longer stops what is playing; it says so in a toast.

### Tested in a browser, in the holospace

- "ben bohmer": 24 songs, the artist, and his albums (Bloom, Begin Again, Breathing and on) appear in about four
  seconds. Hologram OS Music answers the same search faster; MusicBrainz allows about one request a second.
- Clicking a catalogue song Audius does not have: toast "No source can play ... in full here yet", and the track
  that was playing carried on.
- Home shelves, moods, genres and an Audius track still load and play.

### Not tested, or not true yet

- No YouTube or SoundCloud player runs. The page always sends `plays` with the player as 0. Most mainstream songs
  found by search therefore do not play in a holospace.
- Album covers: the Cover Art Archive is out of reach from this machine, so most tiles showed the artist's picture
  from TheAudioDB instead of the album's cover. Not seen on a network that reaches the archive.
- Opening an album or artist tile from the catalogue and listing its songs was not clicked through.
- A song-title search (no artist named) was not tried.
- The results list moved under the pointer once while it was still filling; cause not found.
- Search ordering has no popularity signal: MusicBrainz gives none without a key.

## Held players and the fast catalogue, 2026-11-26

### What changed

- holospace-shell, local branch `feat/player-channel` (not pushed): `player.mjs` adds `servePlayer` (the page holds a
  YouTube or SoundCloud player for a View) and `serveCatalogue` (the page reads iTunes for a View); `space.mjs`
  serves both. An app's own policy is unchanged: it still loads no frame.
- Holo Play: asks the holospace what it holds. Where it holds players, search and the "Top songs" shelf read iTunes
  through it, a song's video is found through Piped (as Holo TV's Music does), and the song plays in YouTube's own
  player, laid over a dock at the lower right. Where it holds none, everything behaves as before.
- The model is asked for real now: `ytids` before an identifier is used, `plays` with the player as 1, `place`
  before the dock is used.

### Gates

Holo Play `build` and `verify` on prism-code 0.11.5: 51 theorems, 113 of 113 vectors, identities verified.
holospace-shell: `test/player.test.mjs` 6 of 6; with view, embed and frame tests, 37 of 37. The shell's full suite
and its browser tests were not run.

### Tested in a browser

Against a local copy of the published shell release with the two channels added, served on port 4318:

- "Top songs" (iTunes chart) loads with covers.
- Clicking a top song: the right "Topic" upload loads in the dock and plays; the bar shows time moving, pause and
  the next song work by click.
- "ben bohmer": the same songs Holo TV lists (Breathing, Rust, Hiding ...), in about a second. "Rust" played.

### Not tested, or not true yet

- Nobody outside this machine has this: it needs the shell change merged and released, and prism-code and the
  store serving that release. The published holospace still offers no player.
- Sound was not heard; the test pane gives no audio. Only the player's reported state was seen.
- Seek, volume, end-of-song advance, repeat and the media keys were not exercised on a held player.
- SoundCloud: the shell holds its player and the tests cover it, but Holo Play does not ask for it yet.
- A held player's sound cannot be read, so the engine, the EQ and the visual do not act on these songs.
- Video lookup rests on public Piped hosts. One of seven answered today. If none answers, catalogue songs fall
  back to Audius or a preview.
- The dock covers the lower right of the page, 384 by 216. A window too small for it refuses the song.
- Artist and album pages from the fast catalogue were not opened.


## Cover tile and the search box, 2026-11-26

- Owner's decision: the YouTube player is not hidden (its terms forbid that); it is shown as a 200 by 200 cover at
  the lower left, the least size PL-03 allows.
- Search: results stay on the page while typing and each group is replaced when its answer comes; catalogue
  answers are kept for the session; the sources are asked 70 ms after the last key (180 ms under three letters);
  Enter asks at once, Escape clears, focus selects, `/` and Ctrl+K reach the box.
- Gates: `build` and `verify`, 51 theorems, 113 of 113 vectors.
- Seen in the patched holospace: "ben" then " bohmer" typed a second apart; the first list stayed until the second
  replaced it; "Rust" played in the 200-pixel tile.
- Not measured: the time from key to results in milliseconds. Not seen: the tile on a narrow window, where it
  covers the start of list rows.
- Sound quality on a YouTube song is YouTube's: the embedded player gives no control over the audio stream. Holo
  Play's own rule (HP-01, PL-01) already prefers a lossless or full stream it can play itself over the player.

## The player as the cover, 2026-11-26

- In the immersive view a held player takes the cover's own place: centred, up to 448 pixels square, with the
  cover's colours spread behind it (the cover drawn eight pixels wide and stretched; it is artwork, not a picture
  of the sound). Outside that view it is the 200-pixel tile. The model is asked `place` before each move.
- The shell takes `plain: true` on `load` and asks YouTube for no control bar; Holo Play's own transport drives it.
- Gates: Holo Play `build` and `verify`, 51 theorems, 113 of 113 vectors. Shell `test/player.test.mjs` 6 of 6.
- Seen in the patched holospace: a top song playing in the tile, then `v`: the player moved to the centre over the
  coloured backdrop, title and transport below.
- Not seen: closing the view (the move back to the tile), a window resize, a small window. YouTube still draws its
  own title and "More videos" strip on hover and when paused; that is YouTube's and is not covered.

## The player in the bar, 2026-11-26

- The 200 by 200 player now stands in the player bar where the cover is: its left on the cover's left, its foot on
  the cover row's line, the title beside it in a slot the bar keeps for it. The bar's small cover is hidden while
  it shows. 200 by 200 is the least YouTube's terms and PL-03 allow; the bar is shorter, so the player rises above it.
- Gates: `build` and `verify`, 51 theorems, 113 of 113 vectors.
- Seen in the patched holospace: a chart song playing with the player in the bar's slot and the title beside it.
- Not seen: a narrow window, where the slot takes most of the bar's width; the move to and from the immersive view
  after this change.

## The glass bar, 2026-11-26

- Owner's direction: no fuzzy coloured backdrop in the bar; translucent glass instead. The player bar now lies over
  the page (`bg-card/60`, `backdrop-blur`), and the page keeps room at its foot so its last rows scroll clear.
- While a held player shows, the bar grows to hold the 200 by 200 player whole, with a large title, the artist and
  the transport beside it. For every other source the bar is its usual height, also glass.
- Gates: `build` and `verify`, 51 theorems, 113 of 113 vectors.
- Seen in the patched holospace: a chart song in the tall bar, shelves showing blurred through it while scrolling.
- Not seen: the light theme, a narrow window, the queue and sound sheets over the glass bar.

## Published, and an ambient picture for held songs, 2026-11-26

### Published

- PR #1 merged into `main` (9bda951). The registry and the store rebuild from the default branch on their own.
- IPFS: the build of that commit, `blake3:1b9906a5…`, is pinned on the owner's own node as
  `bafybeic5f4nzeixmgrigqqih7uffyqfz7hekdz4u4p3m7bubqmkyf22w5e`. The network names that node as its provider.
  A fetch through public gateways was refused with 429 (rate limit), so an outside fetch was not confirmed.
  It is reachable only while that machine and its node are running. The node's control port was moved from 5001 to
  5002, because 5001 could not be bound on this machine.

### After the merge, not on `main`

- VZ-07 `drift`: a held player's song may show a drifting picture only while it plays and animation is on; it is
  never drawn as reacting. 54 theorems, 118 of 118 vectors, `verify` passes.
- The immersive view drifts for a held song and says "ambient, not reading the sound". Seen in the patched
  holospace: slow coloured lights behind the centred player. The cover was not laid into the picture there.
- The bar has the animation switch and its own small stage. Seen: the switch. Not seen: any picture on the bar's
  stage; it may be too faint or not drawing. The last strengthening of the drift lights was not looked at.
- Chart tiles gain the store's cover as one more place to look. Not looked at after the change.
- Fixed after the entry above: the bar's stage did not draw because it was held back wherever the system asks
  for reduced motion; the immersive view never applied that check, so the bar no longer does either. Seen in the
  patched holospace: coloured light moving behind the bar across two looks six seconds apart, for a held song.
  Not seen: the bar's picture for a song the engine reads (Audius), and whether reduced-motion listeners should
  have both pictures off by default, which is an open design question.

## Source tags, 2026-11-26

- Every song row and tile carries a small tag naming its source: Audius, YouTube, Radio, SomaFM, Podcast, Archive,
  Library, Server, SoundCloud, Preview. A catalogue song says where it will most likely play until it is looked up,
  then where it does play.
- Seen in the patched holospace: "YouTube" on the chart tiles and on the rows of a search. Not seen: the other
  names, the tag changing after a lookup that lands on Audius, and narrow tiles, where the tag shortens the artist.
- Gates: `build` and `verify`, 54 theorems, 118 of 118 vectors.

## Tags of the listener's own, 2026-11-26

- A plus after the mood chips becomes a box; a word and Enter make a chip, kept on this device (up to twelve), and
  open its mix at once: what the catalogue and Audius have for those words, a song from each in turn, led by what is
  trending when the word names a genre Audius knows. A tag is removed from its own page.
- Seen in the patched holospace: "rainy jazz" typed and entered, a 54-track mix opened with YouTube and Audius
  songs and a "Remove tag" button, and the chip present on the home view afterwards.
- Not seen: removing a tag, the twelve-tag limit, a tag with no results, the published holospace (no catalogue
  there, so a tag's mix is Audius only), and whether the chip survives a reload.
- Gates: `build` and `verify`, 54 theorems, 118 of 118 vectors.

## More sources, 2026-11-26

Each was first checked to answer a page with no origin (`Origin: null`).

- **SoundCloud and YouTube links.** A new rule, PL-04 `holds`: a pasted YouTube or SoundCloud link plays in a held
  player only when the holospace holds that service's own player. SoundCloud's own description names the track.
- **Funkwhale.** Open community libraries; full tracks streamed by the pod, 320k MP3 on the one seen, lossless where
  a pod has it. One pod is named (`tanukitunes.com`); three others tried did not answer that address. Its songs join
  Audius under "Plays in full".
- **Radio Paradise.** Four lossless FLAC streams with a 320k AAC fallback, first on the radio page's curated shelf.
  The streams answer a sandboxed page, so the engine can read them.
- Tried and left out: SoundCloud search (its API needs a key that is not ours), Mixcloud (searchable, but plays only
  in its own widget, which the holospace does not hold), Jamendo (needs a key), Bandcamp and ccMixter (no answer to a
  sandboxed page), Hype Machine (lists songs, gives no stream).
- Gates: `build` and `verify`, 57 theorems, 124 of 124 vectors.
- Seen in the patched holospace: a pasted SoundCloud link playing in SoundCloud's own player in the bar, time
  moving, named "Begin Again · Ben Böhmer". A tag made earlier was still there after a reload.
- Not seen (the test pane stopped scrolling): Funkwhale rows in a search, a Funkwhale song playing, the Radio
  Paradise tiles, a lossless stream playing, a pasted YouTube link.
