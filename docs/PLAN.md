# Build prompt: Holo Play

Paste everything below the line into a fresh agent session in an empty folder.

---

## Goal

Build **Holo Play**: one Prism app that plays music, live radio, podcasts and audiobooks in the browser, from one search box and one queue. It aggregates the existing Hologram music engine, player and library into a single app made with the Prism SDK, then gets listed in the Prism registry and the Prism App Store.

The bar is a player that feels instant and effortless: type anything, results from every source stream in as they answer, one tap plays, and playback never stops while you browse. Every claim the app makes about quality or verification must be true.

## Read first, in this order

Do not write code until you have read these. They are the reference implementation; port behaviour from them rather than reinventing it.

1. `Hologram-Technologies/hologram-apps`, folder `apps/music/`
   - `index.html` (about 1,480 lines): the whole Holo Music app, UI and player.
   - `holo-subsonic.js`: the library data layer.
   - `holospace.json`: manifest. Note the licence is GPL-3.0-or-later.
   - `music/`, `feed/`: bundled CC0 library, its manifests and the chunked verified-audio feed.
2. `Hologram-Technologies/hologram-technologies.github.io`, folder `_shared/` (these are loaded by Holo Music but do not live in hologram-apps)
   - `holo-stations.js`: every internet source, normalised to one item shape.
   - `holo-audio.js`: the Holo Audio Engine (output DSP chain).
   - `usr/lib/holo/holo-vinyl.js`: the floating mini player and its persistent "now playing".
3. `Hologram-Technologies/hologram-apps`, folder `apps/library/`: Holo Library, the audiobook and book engine (`holo-book.mjs`, `holo-book-librivox.mjs`, `holo-book-gutenberg.mjs`, `holo-book-openlibrary.mjs`, `holo-read*.mjs`, `M1-RUNBOOK.md`).
4. `apps/tauri/cef-host/src/holo_sc.cc` and `handler.cc` in hologram-apps: how the native host handles YouTube and SoundCloud. Read this to understand the boundary described under "Source tiers" below.
5. The Prism skill written by `init` (`SKILL.md` and `references/lexlean-1.2.md`), `AGENTS.md`, `TEMPLATE-CONTRACT.md`.
6. `UOR-Foundation/prism-registry` README (how an app gets listed) and `prism-app-store` README (how the store admits and orders apps).
7. One shipped Prism app with a network-using page as a pattern, for example `Hologram-Technologies/holo-messenger` (`prism.toml`, `app/view/`, `client/`, `bootstrap/view.mjs`).

## What exists today (verified from source)

### Library
- A serverless library in Subsonic 1.16.1 / OpenSubsonic shape. Two interchangeable sources behind one item shape: the bundled content-addressed library, and any real Navidrome or Subsonic server (salted-token auth; ping, getArtists, getArtist, getAlbum, getAlbumList2, search3, getGenres, getPlaylists, stream, getCoverArt, star, setRating, scrobble).
- Views: Albums (recently added, most played, recently played, by name, by artist, random, starred), Artists (with bio, similar artists and top songs when a server provides them), Songs, Genres, Playlists, Favorites, Imported.
- Per-track rating (1 to 5), play counts, last played, favourites. State is kept client-side per source.
- Editable playlists; save queue as playlist; context menu (play, play next, add to queue, add to playlist, download, go to album or artist, favourite, share).
- Favourites unify local tracks, saved albums, stations, channels and podcasts. The saved collection is hashed (SHA-256) into one shareable address.

### Internet sources (all key-free and CORS-open, called straight from the browser)
- **Radio**: Radio Browser, about 50,000 stations, four mirrors with failover. Search by name, tag, country; top by clicks; twelve one-tap genre themes; "surprise me"; recently played. Reports clicks back to the directory. Shows codec and bitrate per station.
- **Curated channels**: SomaFM, with listener counts and live now-playing text. Hardcoded fallback list if the channel index is unreachable.
- **Podcasts**: iTunes Search for discovery, then the show's RSS feed parsed in the browser for episodes. Falls back to a host `/fetch` proxy when a feed blocks CORS; without it, such a feed cannot be read and the app says so.
- **Music on demand**: Internet Archive advanced search plus metadata API, scoped to music and excluding spoken-word collections. Includes a Live Music Archive lane.
- **Any link**: paste a URL anywhere. Direct audio files, HLS and playlist files, archive.org items and SoundCloud links are recognised and resolved to something playable.

### Universe search
One query fans out in parallel to the local library, Internet Archive, SoundCloud (when available), radio and podcasts. Each group renders as its source answers; a token discards stale results. A pasted URL is resolved in the same box.

### Player
- One queue for everything: a station, an episode and a local track sit in the same list. Previous and next on a station list is channel surfing.
- Shuffle, repeat off/all/one, seek, volume, queue panel, persistent bottom bar, full-screen Now Playing with large art and lyrics (lyrics only when a Subsonic server provides them).
- Media Session API: lock-screen and hardware-key metadata and controls.
- Keyboard: space, shift+arrows, `s`, `r`, `/`.
- Deep links (`?album=`, `?artist=`, `?song=`, `?radio=`, `?view=`), share links, light and dark theme, mobile layout.
- Embeddable: posts status to a parent frame and accepts play, pause, next, prev, seek, volume and track hand-off messages.

### Quality path
- **Best representation first.** For each Internet Archive track, all representations are grouped and ranked: FLAC 24-bit, FLAC, WAV, ALAC, then MP3, Ogg, AAC and Opus by bitrate. The lossless file is tried first; if it will not stream, playback falls back to the best MP3 for the session and the label changes to match.
- **Honest labels.** The player shows what is actually playing ("FLAC · lossless", "MP3 320k"), never an upgraded claim.
- **Two audio elements.** Cross-origin streams play on a plain element. Same-origin tracks play on a second element routed through the Holo Audio Engine. This split is required: routing a no-CORS stream through Web Audio silences it.
- **Holo Audio Engine.** Device-native sample rate, playback latency hint. Chain: loudness-normalisation gain (EBU R128, set per track), pre-gain, five-band parametric EQ (60, 250, 1k, 4k, 12k Hz), bass low shelf, "air" high shelf, optional headphone crossfeed, optional HRTF virtual-speaker stage with adjustable width, brick-wall limiter, optional early-reflection room send, output meter. Nine presets: Pure, Hi-Fi, Warm, Bright / Air, Bass Boost, Vocal, Voice, Headphones, Night. It adds no detail that is not in the source and says so.
- **Verified playback.** A local track is re-hashed on play and compared with its content address; a mismatch stops playback. Downloads are verified the same way before saving. A chunked feed verifies each chunk before decode.

### Audiobooks (Holo Library, a separate app today)
- Providers: LibriVox (audio, key-free JSON API, chapters hosted on archive.org), Project Gutenberg (text), Open Library (covers and metadata), Internet Archive.
- A work hub merges editions across providers by normalised main title, author surname and language, so a LibriVox narration meets its Gutenberg text.
- Read-along: audio aligned to text with in-browser speech recognition, chapter maps, listen or read and switch mid-sentence. Treat read-along as a later phase.

### YouTube and SoundCloud: how the working implementation does it
- **Both run through the streaming companion**, a host-side service the page calls on its own origin. yt-dlp resolves the best stream for a page URL and ffmpeg copy-muxes it; the page plays the result on an ordinary media element. yt-dlp covers about a thousand sites, so the same path serves Bandcamp, Vimeo and others.
- **The companion exists in two forms with the same routes.** The Node dev server (`tools/holo-serve-fhs.mjs`, named in `holo_sc.h`; find it, it is not in the two repositories listed above) and the native CEF host (`apps/tauri/cef-host/src/holo_sc.cc`, `holo_sc.h`, `handler.cc`).
- **Routes.** `/caps` (what the host can do: `fetch`, `ingestAudio`, `ytdlp`, `soundcloud`), `/sc/search`, `/sc/resolve`, `/sc/track`, `/sc/stream` (audio), `/sc/vstream` (video), `/ingest-audio` (download, transcode, content-address into the library; streams progress as JSON lines; dedups repeats), `/fetch` (CORS proxy for podcast feeds).
- **Codec rule that makes it work.** The host engine decodes VP9, AV1 and Opus but not H.264 or AAC. Audio is resolved to the best progressive stream and delivered as WebM/Opus written to a real file so it is seekable; repeat plays come from the on-disk cache.
- **Client side.** `holo-stations.js` (`soundcloud.search`, `resolve`, `track`, `resolveUrl`) and `usr/lib/holo/holo-media-route.mjs` plus `holo-youtube.mjs` (recognise a YouTube URL in any of its shapes and normalise it to one canonical watch URL, which is the cache key).
- **Gap to close.** Holo Music's Universe search has a SoundCloud lane but no YouTube lane; a pasted YouTube link is import-only there. Holo Play adds a YouTube lane by calling the same companion search and stream routes. Read the companion source to confirm how `/sc/search` selects the site before wiring it; do not guess the parameter.

## Sources for Holo Play

Port the working implementation as it is. Do not substitute embeds, third-party proxies or a different extractor.

- **Direct sources, called from the page.** Radio Browser, SomaFM, iTunes plus RSS, Internet Archive, LibriVox, Open Library, direct links, user-connected Subsonic server, bundled library.
- **Companion sources, called through the routes above.** YouTube, SoundCloud, and any other link yt-dlp resolves; "Own any link"; feeds that block CORS.
- **Capability probe.** Keep the `/caps` probe exactly as Holo Music does it: a companion feature appears only when the host reports it. Where there is no companion (a plain browser tab opened from the store), those lanes are absent, with no dead controls, and the direct sources still make a complete app.
- The app never bundles or downloads yt-dlp or ffmpeg; they belong to the host.

State in the README which sources need the companion and where the companion runs.

## Architecture

Start with:

```
npx prism-code@latest init holo-play
```

Every Prism app has two parts. Keep them apart.

**The model (LexLean, proved by Lean's kernel).** It holds the decisions, as total functions over bounded numbers, answered over a plain-text protocol. It does no I/O. Proposed capabilities; register each in `model/ids.toml` with a scenario in `features/suites/` before writing it:

- HP-01 Representation ranking: lossless outranks lossy; within a class higher bitrate wins; 24-bit FLAC outranks 16-bit. Prove the order is total and antisymmetric.
- HP-02 Fallback: when the chosen representation fails, the next choice is the best remaining one, and the chain terminates.
- HP-03 Output routing: a track is sent to the enhanced element only when it is same-origin or CORS-readable; otherwise direct. Prove a cross-origin no-CORS item is never routed to the engine.
- HP-04 Queue transitions: next, previous (restart if past three seconds), repeat off/all/one, remove-at-index. Prove the index stays in bounds for every queue length.
- HP-05 Link classification: by numeric kind code, to track, live stream, album, companion stream, companion import or external.
- HP-06 Resume: an episode or chapter resumes at its saved position unless within a threshold of the end, then it restarts and marks played.
- HP-07 Capability gate: a companion source is offered only when the host reports its capability.
- HP-08 Any other request is answered `invalid request`.

Every refusal is a typed answer with a `@rejects` scenario. The page asks the model for each of these decisions and does what it answers; it does not re-implement them in JavaScript.

**The page (`app/view/`).** UI, fetch calls, audio elements, Web Audio, Media Session, storage. Port the providers from `holo-stations.js`, the engine from `holo-audio.js`, the data layer from `holo-subsonic.js`, and the LibriVox and Open Library providers from `apps/library/` as ES modules. Keep the single normalised item shape; add `kind: "audiobook"` and `kind: "chapter"`.

Keep `prism.toml` deny by default. No keys, tokens or secrets in the repository; a user-supplied YouTube key lives in local storage only.

## Open questions: settle these first in Phase 1

Stop and report if any answer blocks the plan.

1. **Network from the page.** The store README says a Prism View has no network; holo-messenger's manifest says its page reaches the network as the holospace allows. Establish, by reading the template contract and running a one-fetch test page in the holospace and in the store's opener, exactly which origins, media elements and iframes a view may use. The whole app depends on this.
2. **Background audio.** Confirm audio keeps playing when the user navigates inside the holospace, and whether a top-level persistent player (as holo-vinyl does) is available to a Prism app.
3. **Licence.** Holo Music is GPL-3.0-or-later; the template is MIT or Apache. Porting its code makes Holo Play GPL unless the owner relicenses. Record the owner's decision.
4. **Companion reach.** Establish where a Prism app opened from the store can reach the companion routes: inside the Hologram host, with the dev server, or not at all in a plain tab. Report which, because it decides whether store visitors see YouTube and SoundCloud.
5. **Storage.** What persistent storage a view gets (local storage, IndexedDB, OPFS), for the library, positions and offline pins.

## Audio quality: a hard requirement

Every item must play at the highest quality its source offers that the browser can decode, by default, with no setting to find. Port the original's quality path whole and hold every source to it.

- **Pick the best representation, always.** Keep the Internet Archive ranking exactly (FLAC 24-bit, FLAC, WAV, ALAC, then lossy by bitrate) and its fallback to the best MP3 only when the lossless file will not stream. Apply the same rule to every source that offers a choice.
- **Radio.** Among streams of one station, and among duplicate listings of one station, prefer the highest bitrate and the better codec. Show codec and bitrate.
- **SomaFM.** The original hardcodes the 128k MP3 stream. Read `channels.json` for each channel's listed streams and choose the highest quality the browser decodes; keep 128k MP3 only as the fallback.
- **Podcasts and audiobooks.** Play the publisher's enclosure untouched. For LibriVox, prefer the highest-bitrate chapter files on archive.org, using the same ranking.
- **Companion sources.** Request the best audio stream yt-dlp offers. Where the source is already Opus in WebM, copy it without re-encoding. The original re-encodes other audio to Opus; when a re-encode is unavoidable, use a bitrate high enough to be transparent and never below the source. Never transcode a lossy stream to a larger lossy one and call it better.
- **No resampling you do not need.** Create the audio context at the device's native rate with the playback latency hint, as the original does.
- **Engine on by default wherever it can run.** Route every same-origin or CORS-readable item through the Holo Audio Engine with the Hi-Fi preset and loudness normalisation, including companion streams, which are same-origin. Cross-origin streams that cannot be read play direct, bit-for-bit as sent.
- **Never clip.** The limiter stays in the chain on every preset; boosts are compensated.
- **No fake detail.** No upsampling or "enhancement" presented as recovered quality. The "air" shelf is labelled as synthesis, as in the original.
- **Truthful label.** The quality chip shows the format, bit depth where known, and bitrate of what is actually playing, and changes the moment a fallback happens.
- **Verified bytes.** Keep hash-on-play for content-addressed tracks; refuse a mismatch.

Prove the selection rule in the model (HP-01, HP-02). Listening quality itself is not provable: test it by ear on headphones and speakers against the original Holo Music on the same tracks, and record the result as tested, not proved.

## Experience requirements

- One search box, focused with `/`. Results stream in by group: Your library, YouTube and SoundCloud (when the companion is present), Music, Radio, Podcasts, Audiobooks. First results on screen in under 300 ms from cache or local, with skeleton rows while sources answer.
- Home is not empty on first run: popular stations, SomaFM channels, a curated shelf of Internet Archive albums and LibriVox titles, and the bundled CC0 albums.
- Tap to play starts sound in under one second for direct sources. Preconnect to source origins; prefetch the next queue item's metadata.
- Gapless between same-origin tracks if achievable; if not, say so rather than fake it.
- Continue listening: podcasts and audiobooks resume per episode and chapter, with speed control (0.5x to 3x, pitch preserved), skip back 15 and forward 30, and a sleep timer.
- Persistent mini player, full Now Playing, queue with drag reorder, Media Session with artwork and seek.
- Quality chip always shows the true format of what is playing. The engine panel shows presets, EQ, crossfeed, spatial width, loudness normalisation and the live meter, and states plainly when the current item bypasses it.
- Every failure has a calm, specific message and a next action (try the MP3, try another station, open the show's site).
- Keyboard complete, screen-reader labelled, reduced-motion respected, works at phone width, light and dark.
- No emoji icons in the final UI; use the template's icon set and the Hologram brand kit tokens.

## The plan: three phases

Finish each phase's exit gate before starting the next. Stop and report at each gate.

### Phase 1: Foundation. A proved core that plays one track perfectly.

1. Answer the five open questions and write the answers into the README.
2. `npx prism-code@latest init holo-play`; set `prism.toml`, deny by default.
3. Model: register HP-01 to HP-08 in `model/ids.toml`, write scenarios, theorems and examples, including every refusal.
4. Player core in the page: one queue, two-element routing, Media Session, keyboard, wired to the model for every decision.
5. Holo Audio Engine ported whole, on by default, with the quality chip and engine panel.
6. Bundled CC0 library with hash-on-play, so there is real audio to play.

**Exit gate:** `npx prism-code check --json` is clean with every theorem proved. A bundled track and one Internet Archive lossless track play through the engine with a truthful label; the lossless-to-MP3 fallback is demonstrated. Open questions answered.

### Phase 2: Sources. The whole catalogue in one search box.

1. Direct sources ported from `holo-stations.js`: radio, SomaFM, podcasts, Internet Archive, pasted links.
2. Universe search with streamed groups and stale-result discard.
3. Audiobooks: LibriVox and Open Library providers and the work hub from `apps/library/`.
4. Continue listening: resume, speed, skip, sleep timer for podcasts and audiobooks.
5. Library: Subsonic connect, playlists, favourites, ratings, play counts.
6. Companion sources behind the `/caps` probe: SoundCloud as ported, then the YouTube lane, then "Own any link".
7. The audio quality rules applied to every source added.

**Exit gate:** every source searched and played in a real browser, each at its best available quality with the correct label. Companion sources demonstrated in the Hologram host and with the dev server. With no companion, no dead controls.

### Phase 3: Polish and ship. Exceptional, verified, listed.

1. Experience pass against every requirement above, on a real phone and a desktop: home screen, speed to first sound, mini player, Now Playing, queue reorder, error messages, accessibility, themes.
2. Listening test by ear against the original Holo Music on the same tracks, on headphones and speakers. Fix what falls short.
3. `npx prism-code build --json` and `npx prism-code verify --json` exit 0. README states what is proved, tested and neither.
4. With the owner's go-ahead: public repository, `prism-app` topic, confirm the registry lists it and the store shows it with a real cover.

**Exit gate:** the "Done means" list below is met and the app appears in the Prism App Store.

## Done means

- `npx prism-code build --json` and `npx prism-code verify --json` exit 0; every theorem proved, every vector passing, `CONFORMANCE.md` regenerated, not hand-edited.
- Each direct source demonstrated in a real browser: search, play, pause, seek where seekable, next, favourite. Record which were tested and on what.
- With the companion running: YouTube and SoundCloud search, stream, seek and "Own any link" demonstrated, in the Hologram host and with the dev server.
- With no companion, the app shows no broken or dead controls.
- README states what is proved (the model's decisions), what is tested (the vectors), and what is neither (network sources, audio quality, timings).

## Listing

- Push to a public GitHub repository that keeps the template's marks (`template.lock`, `prism.project`, `prism.toml` with `[model]`). Adding the `prism-app` topic lists it on the registry's next run. The registry rebuilds from source and replays every example; one wrong answer rejects the app.
- The store lists an app only when it declares at least one example and every one passes, and orders by stars, then by example count. Its cover is a screenshot taken automatically once the app draws, so the first paint must be the real home screen, not a blank or a consent wall.
- Ask before pushing, publishing, or adding the topic.

## Rules

- Say "proved" only for what Lean's kernel proved, "tested" only for what the vectors cover.
- No stubs, no placeholder data presented as real, no feature flags hiding unfinished work.
- Never weaken a gate to pass it.
- Stop and ask the owner on any conflict between these instructions and the repository's governance files.
