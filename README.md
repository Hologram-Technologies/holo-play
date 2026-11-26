# Holo Play

Music, radio, podcasts and audiobooks in one player, built as a Prism app. It brings the Hologram music engine,
player and library into one app whose playback decisions are proved.

Built with `npx prism-code@latest init`, from the canonical [UOR Prism template](https://github.com/UOR-Foundation/template).

Status: Phase 3 of 3 (Polish and ship). Published at https://github.com/Hologram-Technologies/holo-play. The plan is in [docs/PLAN.md](docs/PLAN.md).

## What is proved, what is tested, what is neither

**Proved.** The model is `app/src/App.lex.tex`. Lean's kernel proves 25 theorems about it. The claims are registered
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

**Tested.** 58 acceptance vectors, replayed by `build` and `verify`. Playback in a browser, recorded in
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
anything else                                      -> invalid request
```

## What runs today

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
