# Build prompt: Holo Play Visuals (projectM)

Paste everything below the line into a fresh agent session opened in the `holo-play` repository.

---

## Goal

Let people see the music in Holo Play. Bring projectM, the open-source MilkDrop-compatible visualizer, into the
player so that what is on screen is driven, sample for sample, by what is in the listener's ears.

The bar: someone presses play, opens the visual, and forgets the app is there. The picture moves with the kick, opens
with the chorus and rests when the song rests. It should feel alive because it is honest: nothing on screen moves
unless the sound moved it.

## Read first

1. This repository: `README.md`, `AGENTS.md`, `app/DESIGN.md`, `docs/VERIFICATION-holo-play.md`, then
   `app/view/app.js`, `app/view/engine.js` and `app/src/App.lex.tex`. Learn how the page asks the model, how the two
   audio elements are routed, and why.
2. `projectM-visualizer/projectm`: `README.md`, `docs/emscripten.rst`, `docs/building.rst`, and the C API under
   `src/api/include/projectM-4/` (`core.h`, `audio.h`, `parameters.h`, `render_opengl.h`, `touch.h`,
   `callbacks.h`, `user_sprites.h`) and `src/playlist/api/projectM-4/`.
3. `projectM-visualizer/examples-emscripten`: the reference for a browser build.
4. The preset repositories in the same organisation: `presets-cream-of-the-crop`, `presets-milkdrop-original`,
   `presets-community`, `presets-en-d`, and `presets-milkdrop-texture-pack`.
5. The Prism skill in `.claude/skills/prism/`, including `references/design.md` and `references/lexlean-1.2.md`.
6. holospace-shell `view.mjs` (`VIEW_POLICY` and the sandbox attributes of the frame).

## What projectM is (verified from its repository on 2026-11-26)

- A C++ library with a C API, licensed LGPL-2.1. Latest release v4.1.8 (October 2026); `master` is ahead of it.
- It renders with OpenGL ES 3 and compiles to WebAssembly with Emscripten, drawing through WebGL 2. Its own build
  notes ask for SDL2, `MIN_WEBGL_VERSION=2`, `FULL_ES3`, memory growth, and the `OES_texture_float` extension.
  Its CI builds with emsdk 3.1.53.
- Sound goes in as PCM: `projectm_pcm_add_float`, `_int16`, `_uint8`, mono or stereo. It does its own spectrum and
  beat analysis from those samples.
- A preset is a text file (`.milk`). `projectm_load_preset_data` loads one from a string, so no file system is
  needed. A separate playlist library orders and shuffles presets.
- Controls: beat sensitivity, hard-cut enable, sensitivity and minimum time, soft-cut (blend) duration, preset
  duration, preset lock, mesh size, target fps, window size, aspect correction.
- `projectm_touch`, `projectm_touch_drag` and `projectm_touch_destroy` draw waveforms where a finger lands.
- A callback lets the host supply textures a preset asks for by name.
- **Only on `master`, not in v4.1.8:** `projectm_set_frame_time` (the host owns the clock, so frames are
  reproducible), `projectm_opengl_burn_texture` (paint an image into the running picture),
  `projectm_opengl_render_frame_fbo`, and user sprites.
- The preset repositories declare no licence in their metadata. Read each pack's own licence text before using it.

## What a holospace allows (verified from holospace-shell and this app)

- Scripts: only what the app carries, or `blob:` and WebAssembly built from bytes the app fetched and checked.
  No remote script. Workers from `blob:` only.
- Network: `https` and `wss`, from an opaque origin, so a host must send open CORS headers to be read.
- No `SharedArrayBuffer` (no cross-origin isolation). No frames.
- The frame is granted `clipboard-write` and nothing else. Assume the Fullscreen API is refused inside it until
  tested. The holospace has its own full-screen control and an `immersive` theme.
- The page is checked by the design gate: catalogue components, token utilities, no inline styles, no colours
  written as values. A `<canvas>` is in use already and passes.
- Prism's rule: no outside compiler in this repository. projectM cannot be compiled here.

## The integration, in one paragraph

Build projectM to WebAssembly in a **separate public repository**, pinned to an exact projectM commit, and publish
the module and its loader as release files with their SHA-256. Holo Play fetches them over https, re-derives the
hashes, refuses a mismatch, and starts the module from a `blob:` inside a Worker that owns an `OffscreenCanvas`.
A small AudioWorklet taps the samples at the very end of the Holo Audio Engine, after the limiter, and posts them
to the Worker, which hands them to `projectm_pcm_add_float`. The model decides everything that is a rule: whether
the picture may react at all, when a preset may change, how hard it may flash, and how much detail the device can
afford. The page never decides those.

## Truth to the audio: the rule the whole feature rests on

1. **Same samples.** The visualizer is fed the exact stream that goes to the speakers, tapped after the engine's
   last node. No second decode, no separate fetch, no analysis of a different copy.
2. **Same moment.** Delay the picture by the audio context's output latency so that a drum hit and its flash arrive
   together. Measure the offset; record it as measured, not proved.
3. **No sound, no reaction.** An item that plays on the direct element cannot be read, so there are no samples.
   The model must answer `still` for it: artwork and a calm, non-reactive backdrop, with one quiet line saying the
   source does not share its sound. Never drive the picture from a timer, from random numbers, or from the artwork
   and present it as the music.
4. **Widen what can be read.** Today radio and podcasts are marked unreadable up front. Change that: try each one
   through the engine first, and fall back to direct only when the host refuses. The model's `route` and `retry`
   rules already cover this; add the vectors. Many Icecast servers do send open CORS headers.
5. **Silence is rest.** MilkDrop presets keep moving with time even in silence. When the level stays under a
   threshold, ease the picture down. When sound returns, wake it.
6. **Paused is paused.** No frames are drawn while the player is paused or the page is hidden.

## What the model proves

Register each ID in `model/ids.toml` with its scenario in `features/suites/` before writing it. Every number is a
bounded natural. The model is asked on events and about once a second, never per frame: a request takes
milliseconds and is far too slow for a render loop. Per-sample work belongs to projectM and the Worker.

- **VZ-01 Truth gate.** `shows <route> <samples> <playing>` answers `react`, `rest` or `still`. Prove it never
  answers `react` unless the item is routed through the engine, samples arrived in the last second and the player
  is playing.
- **VZ-02 Flash safety.** The page counts large, fast brightness swings in the last second and proposes a hard cut;
  the model answers `cut`, `blend` or `hold`. Prove that no sequence of answers permits more than three flashes in
  any one second. Cite WCAG 2.2 success criterion 2.3.1 in `model/authorities.toml` as the imported limit; do not
  restate it as a local theorem.
- **VZ-03 Preset change.** Given seconds on the current preset, whether a beat just landed, whether a section
  boundary was detected, and the lock: answer `stay`, `blend` or `cut`. Prove a preset is never left before its
  minimum dwell, is always left by its maximum, never changes while locked, and cuts only on a beat.
- **VZ-04 Detail ladder.** Given the average frame time and the current step: answer the next render scale and mesh
  step. Prove the step stays inside its bounds, never rises while frames are over budget, and cannot oscillate
  between two neighbours (a hysteresis band).
- **VZ-05 Calm.** When the system asks for reduced motion, prove the answer is never `cut` and the blend time is at
  its longest.
- **VZ-06 Integrity gate.** The module may start only when every fetched part matched its pinned hash. Prove that
  one mismatch refuses the start. Register the refusal with its exact text and a rejecting vector.
- **VZ-07 Sync bound.** The picture's delay is the output latency clamped to a stated range. Prove the clamp.
- Extend **HP-08**: the new verbs join the accepted lengths; anything else is still `invalid request`.

Plant a defect for at least VZ-01, VZ-02 and VZ-06, confirm `check` rejects each, restore, and record it in
`docs/VERIFICATION-holo-play.md`.

## What makes it feel alive (each one grounded in a real projectM capability)

- **A song has a face.** Seed the preset order from the track's identity, so the same song opens with the same
  visual every time and becomes recognisable. With `projectm_set_frame_time` the host owns the clock, so a track
  can be reproduced frame for frame.
- **The cover melts into the picture.** Use `projectm_opengl_burn_texture` to paint the album art into the running
  visual at the start of a track and at its section changes, so the music grows out of its own artwork. Supply the
  cover as a texture when a preset asks for one. The image must be CORS-readable to be uploaded to WebGL; when it
  is not, skip this and say nothing.
- **It listens for the shape of the song.** Compute a simple energy-novelty curve in the Worker to find section
  boundaries (verse to chorus). Pass the boundary to the model (VZ-03), so the picture changes where the music
  changes, on the beat, not on a timer.
- **You can touch it.** Map pointer and touch to `projectm_touch` and `projectm_touch_drag`, so a finger on the
  picture draws a waveform made of the sound playing at that instant.
- **It breathes.** In quiet passages and between tracks the picture settles (rule 5 above) and wakes with the
  next downbeat.
- **Live radio shows its pulse.** For a readable station, the same engine drives the picture with no changes.
- **The room goes dark.** An immersive Now Playing view: the canvas fills the app, the title and one quiet quality
  line sit over it, and the controls fade until the pointer moves. Use the holospace's `immersive` theme. Add a
  small live tile in the player bar that opens it.

Do not add: fake spectrum bars driven by anything but samples, particle effects that ignore the sound, or text
claiming the picture "understands" the music. The feeling comes from fidelity.

## Architecture

**Repository A, new: `holo-visuals`** (not a Prism app, so it may use a compiler).
- CMake plus Emscripten, pinned emsdk, projectM as a submodule at an exact commit.
  **Decided by the owner, 2026-11-26: a pinned `master` commit**, for the face, cover and reproducibility
  features. Start from `9e26f5b5bf89b015f197a16a61bcb21f4946d985` (master on 2026-11-20), with its
  `vendor/projectm-eval` submodule at `22fb0cfd8f2dfbcd2b68f2443e7f44e19b32c09a`. `master` is unreleased: its API
  may change, so move the pin only on purpose, and record each move with the reason.
- A thin C wrapper exporting only what the page uses. Prefer a build that does not need SDL: create the WebGL 2
  context on the `OffscreenCanvas` and enable `OES_texture_float` and `EXT_color_buffer_float` yourself.
- Output: `visuals.wasm`, its loader, a `manifest.json` listing each file's SHA-256 and the projectM commit, and
  the licence texts. Published as a GitHub release and on Pages with open CORS.
- A curated preset set of 100 to 200 presets, each with its SHA-256, its author and its licence, in a manifest.
  Include only presets whose licence allows it. Textures the same way.

**Repository B: `holo-play`.**
- `model/authorities.toml`: projectM, the preset packs and WCAG 2.3.1 as imported authorities, each with its
  pinned checksum. Claims about them are `some-true`, never `build`.
- `app/view/visuals.js`: fetch, hash, start the Worker from a `blob:`, own the canvas, forward pointer input, ask
  the model, apply its answers.
- `app/view/engine.js`: add one tap node at the end of the chain. An AudioWorklet loaded from a `blob:` that posts
  stereo Float32 blocks through a `MessagePort`. Nothing else in the engine changes.
- The Worker: owns projectM, a small ring buffer, the novelty curve, the frame loop and frame timing.

## Licence duties (LGPL-2.1)

- Keep projectM a separately fetched, replaceable module. Do not merge its code into the app.
- Publish repository A with the exact source commit, the build scripts and the licence text.
- Add an About line in the Sound panel naming projectM, its licence and where its source is.
- Record the decision and its owner in the README. Ask the owner before publishing.

## Settle these first, and stop if one blocks

1. Does WebGL 2 with float render targets work on an `OffscreenCanvas` in a Worker inside the sandboxed frame?
2. Does `audioWorklet.addModule` accept a `blob:` URL under the view policy?
3. Is the Fullscreen API available to the frame? If not, the immersive view fills the app and the holospace's own
   control does the rest.
4. Does the pinned `master` commit build with Emscripten? Its CI covers the release line; confirm for this commit.
5. Which presets may legally be redistributed?
6. Module size and start time on a phone. Set a budget and measure against it.
7. Can the page read a station's samples? Count how many of the top 100 stations allow it.

## Phases

1. **Proof of life.** Repository A builds; the module starts in a holospace from verified bytes; one preset reacts
   to a bundled track. Gate: VZ-01 and VZ-06 proved, and a bass note visibly moves the picture.
2. **True and safe.** Sync, silence, flash safety, the detail ladder, reduced motion, radio through the engine.
   Gate: every VZ theorem proved; a click track and its flashes land together within the measured tolerance.
3. **Alive.** The song's face, the cover, section-aware changes, touch, the immersive view. Gate: reviewed on a
   desktop and a real phone, with sound, by a person.

## Done means

- `check`, `build` and `verify` exit 0, with every new theorem proved and every vector passing.
- A table of what was tested in a browser, on what, and what was not.
- Stated as measured, never proved: frame rate, sync offset, start time, how many stations are readable.
- Stated plainly: which sources show `still` and why.
- Nothing published without the owner's go-ahead.

## Rules

- Say "proved" only for what Lean's kernel proved, "tested" only for what was seen.
- Do not add a compiler, container or build step to `holo-play`.
- No stubs, no fake data shown as real, no flags hiding unfinished work.
- Emulated window sizes in a test pane can stop clicks reaching the frame. Test at the pane's real size.
