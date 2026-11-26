# Holo Play

Music, radio, podcasts and audiobooks in one player, built as a Prism app. It brings the Hologram music engine,
player and library into one app whose playback decisions are proved.

Built with `npx prism-code@latest init`, from the canonical [UOR Prism template](https://github.com/UOR-Foundation/template).

Status: Phase 3 of 3 (Polish and ship). Published at https://github.com/Hologram-Technologies/holo-play. The plan is in [docs/PLAN.md](docs/PLAN.md).

## What is proved, what is tested, what is neither

**Proved.** The model is `app/src/App.lex.tex`. Lean's kernel proves 44 theorems about it. The claims are registered
in `model/ids.toml` and listed in the generated `CONFORMANCE.md`.

| ID | Claim |
| --- | --- |
| HP-01 | A lossless representation outranks a lossy one, a deeper one a shallower one, a higher bitrate a lower one; the order is antisymmetric and ties only equal scores |
| HP-02 | After a failure the player advances only to a representation that remains, and stops once all were tried |
| HP-03 | An item reaches the audio engine exactly when its bytes are readable and enhancement is on |
| HP-04 | Next, previous and remove keep the playing index inside the queue |
| HP-05 | A pasted link is classed correctly, and a companion class is answered only when the companion is present |
| HP-06 | A saved position is resumed only when it lies at least thirty seconds inside the item |
| HP-07 | A companion source is offered only when the host reports the companion |
| HP-08 | Any other request is answered `invalid request` |
| HP-09 | A song plays from the companion when present, else an open full-length source, else a preview; never a preview while a full source exists |
| VZ-01 | The picture reacts only while the item plays through the engine and its samples are arriving; a source the page cannot read is never drawn as sound |
| VZ-02 | A flash is allowed only while fewer than three happened in the last second, and never when calm is asked for |
| VZ-03 | A scene lasts at least eight seconds and at most forty-five, never changes while locked, and cuts only on a beat |
| VZ-04 | The detail step stays between zero and five, never rises while frames are slow, and holds inside a band |
| VZ-05 | The mood is calm when the sound is quiet and never calmer for more energy or a faster tempo |
| VZ-06 | The picture leans toward one of bass, mid and treble, keeps it unless another is clearly stronger, and moves only to the strongest |

**Tested.** 96 acceptance vectors, replayed by `build` and `verify`. Playback in a browser, recorded in
[docs/VERIFICATION-holo-play.md](docs/VERIFICATION-holo-play.md).

**Neither.** The page (`app/view/`) is authored, not proved. Network sources, how a track sounds, and timings are
outside the model. The page asks the model for each decision above and does what it answers.

The protocol is plain text, every number six digits:

```
ranks <class> <bits> <kbps> <class> <bits> <kbps>  -> first | second | tie
retry <tried> <count>                              -> advance | exhausted
route <readable> <enhance>                         -> engine | direct
ahead <index> <length> <repeat> <auto>             -> play <n> | replay | stop
prior <index> <seconds>                            -> play <n> | restart
strip <index> <length> <at>                        -> play <n> | keep <n> | empty
links <extension> <host> <companion>               -> track | stream | album | companion | import | external
offer <kind> <companion>                           -> offer | hide
seeks <position> <duration>                        -> resume | finished | restart
picks <companion> <open> <preview>                 -> companion | open | preview | none
shows <engine> <samples> <playing>                 -> react | rest | still
moods <energy> <tempo>                             -> mood <n>
scene <seconds> <beat> <boundary> <hold>           -> stay | blend | cut
flash <count> <calm>                               -> allow | damp
depth <step> <millis>                              -> scale <n>
heeds <held> <bass> <mid> <treble>                 -> heed <n>
anything else                                      -> invalid request
```

## What runs today

- Seeing the music. `app/view/visuals.js` is Holo Play's own picture of the sound, written for this app in WebGL 2;
  nothing is compiled or fetched. It draws the way MilkDrop and projectM do, each frame the last one warped and
  dimmed with the waveform laid on top, but it does not run their presets. It is fed from the end of the audio
  engine, left and right apart, and measures loudness and energy, three bands, brightness, stereo width, key, tempo
  and section changes. The model decides whether it may react, how hard, when the scene changes, whether a flash is
  safe and how much detail to draw. A source the page cannot read shows its artwork and says so. The three-a-second
  flash limit follows WCAG 2.2 success criterion 2.3.1; that standard is cited here, not proved.
- Resolution. The picture is drawn at every pixel the screen has, in sixteen-bit float colour where the graphics
  card allows, and the model's detail ladder lets it climb to twice that in each direction while frames stay fast,
  up to 7680 by 4320 (8K). It steps down when frames are slow. The size actually being drawn is shown on screen.
  A screen shows no more pixels than it has: 8K on screen needs an 8K display.
- Verdant Engine (`afflom/verdant-engine`, MIT or Apache-2.0) was studied for this. It is a 3D game engine whose
  153 KB WebAssembly module is published with open CORS and could be fetched and checked by a holospace page. Its
  176 exported functions have no entry for outside sound and none for drawing geometry it did not make, so it
  cannot draw this music today. What was taken from it is an idea, its attention loop: VZ-06 is Holo Play's own
  proved rule for what the picture attends to. Using the engine itself needs new exports from its author.

- Five sections: Music, Radio, Podcasts, Audiobooks, Saved. One search box covers all of them and accepts a pasted link.
- Radio: about 50,000 stations from Radio Browser (https streams only), twelve genre shortcuts, and SomaFM channels
  with their live now-playing line. Stations play exactly as sent.
- Podcasts: search and popular shows from the fyyd directory, which lists episodes itself, so no feed is read across
  origins. Episodes resume where they were left (the model's `seeks`), with skip back 15, forward 30 and a speed control.
- Audiobooks: LibriVox recordings through the Internet Archive, resumable by chapter.
- Saved: any song, station or episode, kept by the holospace for this app. A sleep timer is in the Sound panel.
- Playlists made from the queue, a recently played list, and a connection to your own Navidrome or Subsonic server.
- Artwork always shows something: the picture, drawn sharp at the size it is shown, or the icon of what it stands for.

- Search and streaming of full-length tracks, artists and playlists from Audius, an open service whose artists
  publish for open streaming. It answers a sandboxed page, so it works in a holospace and from the store.
- A home screen of trending tracks and hot playlists; artist and playlist pages; playback continues while browsing.
- The commercial catalogue (the iTunes Search API: every released song, with a 30-second preview) is wired in but
  does not answer in a holospace. See "Searching any song" below.

- A verified library: the three Hologram CC0 albums. Each track is fetched, its SHA-256 is re-derived, and it plays
  only if that matches the address in the library's catalogue. A mismatch is refused.
- The Holo Audio Engine, ported unchanged: five-band EQ, bass and air shelves, crossfeed, a speaker stage for
  headphones, a limiter and a live output meter. Nine presets. On by default.
- One queue, shuffle, repeat, seek, volume, keyboard keys, lock-screen controls.
- A truthful quality label: the format playing, and whether it goes through the engine or direct.
- An Internet Archive shelf of lossless concerts, with every representation ranked by the model and a fallback
  to the next one when a file will not stream.

## How it runs: the five questions settled first

1. **Network from the page.** Read from the runtime, then seen in a browser.
   - Opened in a holospace (how the store opens an app), the page may fetch over `https` and `wss`, and load images
     and media over `https`. It runs in a sandboxed frame with an opaque origin, so a host must answer with
     `Access-Control-Allow-Origin: *` for the page to read its bytes. No `http`, no frames, no workers but `blob:`.
     Source: `VIEW_POLICY` in holospace-shell `view.mjs`.
   - Served on its own by `prism-code run` at `/`, the page reaches nothing but its own server
     (`connect-src 'self'`). Holo Play needs the holospace.
2. **Background audio.** The page is a frame inside the holospace. It plays for as long as the app is open. A
   player that outlives the app, as Holo Vinyl does in Hologram OS, is not available to a Prism app.
3. **Licence.** Decided by the owner, 2026-11-26: MIT or Apache-2.0, as the template. `app/view/engine.js` and
   `app/view/subsonic.js` are ported unchanged, and `app/view/sources.js` and `app/view/library.js` adapted, from
   Hologram code published as GPL-3.0-or-later (Holo Music and its shared modules). They are offered here under
   MIT or Apache-2.0 on the owner's instruction as that code's copyright holder. This record does not verify that
   holding: if anyone else contributed to those files, their agreement is needed too.
4. **Companion reach.** YouTube and SoundCloud go through the Hologram streaming companion (`/caps`, `/sc/*`,
   `/ingest-audio`). In a holospace the page has no origin to resolve those paths against and may only reach
   `https`, so the companion is unreachable there and those sources will be absent. They need the Hologram host,
   or a companion served over `https` with open CORS. Not built in this phase.
   **Decided by the owner, 2026-11-26: Hologram host only.** YouTube and SoundCloud appear when Holo Play runs in
   the Hologram host, behind the `/caps` probe. In a holospace or from the store they are absent, with no dead
   controls. No https companion is built.
5. **Storage.** `localStorage`, kept per app by the holospace, and `holospace.store` for values the browser can
   clone. No IndexedDB or OPFS: the frame has no origin.

## Searching any song: what is possible where

Assessed from hologram-apps. Holo Music finds a song three ways: the Internet Archive from the page; SoundCloud
through the host companion, which runs yt-dlp (`scsearch`); and any pasted link through the same companion.
There is no YouTube search route, and nothing in it streams commercial songs without the companion.

| Where Holo Play runs | Full-length songs from | Mainstream catalogue |
| --- | --- | --- |
| A holospace, the store | Audius, the Internet Archive, the verified library | Not available: iTunes sends no CORS header to a page with an opaque origin (seen with `Origin: null`), and Deezer sends none at all |
| The Hologram host | The above, plus SoundCloud and pasted links through the companion | iTunes search and previews, when the page has an origin of its own |

So a store visitor gets a Spotify-like player over an open catalogue, not over every commercial song. That limit
is the services', not the app's.

## Open owner actions

- Confirm that Hologram Technologies holds all the copyright in the ported files (question 3).
- `GOVERNANCE.md` roles, review and amendment policy are NOT_ESTABLISHED.
- The `qortara` command is not installed on this machine, so its checks were not run.

## Commands

Name the version: an older `prism-code` is installed in the home folder and a bare `npx prism-code` would run it.

```
npx prism-code@0.11.5 check --json
npx prism-code@0.11.5 build --json
npx prism-code@0.11.5 verify --json
npx prism-code@0.11.5 run
```

`run` prints an `open:` line with the holospace address. Open that one, not `/`.
