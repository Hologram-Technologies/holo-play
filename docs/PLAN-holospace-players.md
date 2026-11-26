# Plan: embedded players and catalogue search for apps in a holospace

Status: built on a local holospace-shell branch, `feat/player-channel`, with catalogue option A. Not pushed, not
reviewed, not released. The video for a song is found through Piped, as Holo TV's Music does.

## What this is for

Hologram OS Music plays almost any song by showing the service's own player: a SoundCloud widget or a YouTube
embed. Holo Play cannot, because a holospace lets an app load no frame, and because iTunes refuses a sandboxed
page. Both limits are in holospace-shell (`view.mjs`, `index.html`), read from the local checkout on 2026-11-26.

## What was found in the shell

- An app's page is one inlined document in `<iframe sandbox="allow-scripts allow-forms">`, with an opaque origin.
- Its policy is `VIEW_POLICY`: `default-src 'none'`, no `frame-src`. So no frame loads.
- The app already talks to the shell over `postMessage` for four things, each with a narrow, checked message:
  intents, storage, opening a link (`serveOpens`), and reporting its height (`serveHeight`).
- The shell's own page policy is `default-src 'self'` with no `frame-src`, so the shell cannot load those players
  either today.
- `test/view.test.mjs` asserts the policy text, so any change to it is deliberate and tested.

## The option that looks simplest, and why it must not be done

Adding `frame-src https://www.youtube.com https://w.soundcloud.com` to `VIEW_POLICY` would not work safely.

A frame inside a sandboxed frame inherits the sandbox. The players need their own origin to run (storage, sign-in
state, their script API), which means `allow-same-origin`. That flag cannot be given to the inner frame alone: it
would have to be on the app's frame, and an app's page with `allow-same-origin` runs with the shell's origin and
can read the shell's storage and every other app's data. That removes the isolation the holospace exists to give.

## The proposed design: the shell holds the player, the app asks

A fifth channel, built like the four that exist.

1. **The app reserves a place and asks.** It posts `{ holospacePlayer: id, op, ... }` where `op` is one of
   `load`, `play`, `pause`, `seek`, `volume`, `place`, `close`. `load` names a provider (`youtube` or
   `soundcloud`) and an identifier in that provider's own form: a video id of eleven characters, or a
   `soundcloud.com` track address. `place` gives the rectangle, in the app's own coordinates, where the player
   should sit.
2. **The shell validates and builds the frame itself.** It never takes a frame address from the app. It builds
   `https://www.youtube-nocookie.com/embed/<id>?enablejsapi=1…` or `https://w.soundcloud.com/player/?url=…` from
   the checked identifier, in a frame of its own beside the app's:
   `sandbox="allow-scripts allow-same-origin allow-presentation"`, `allow="autoplay; encrypted-media"`,
   `referrerpolicy="strict-origin"`. Here `allow-same-origin` gives the player its own origin, not the shell's,
   because its address is another site's.
3. **The shell lays the player over the app's rectangle**, clipped to the app's frame, and moves it when the app
   reports a new place or scrolls. The player stays visible at no less than 200 by 200 pixels, as YouTube's terms
   for embedded players require. The app cannot hide it, cover it or shrink it below that.
4. **The shell relays state back**: ready, playing, paused, ended, position, duration, error. It speaks each
   provider's `postMessage` protocol directly, so no script from either service is loaded into the shell.
5. **The shell's own policy gains** `frame-src https://www.youtube-nocookie.com https://w.soundcloud.com` and
   nothing wider.

What stays true: the app's frame and `VIEW_POLICY` are unchanged. The app still loads no frame and no outside
script. It can only ask for one of two named players by identifier.

### Consent and declaration

- An app must declare the players it uses, so a reader can see it before opening the app. Where that declaration
  lives (the holo's manifest, `prism.toml`, or `app.json`) needs the shell's and prism-code's owners to agree.
- The first time an app asks for a player, the shell says so in its own chrome, once: these players are other
  companies' pages and can set their own cookies.
- A player is closed when the app is closed.

## Catalogue search (iTunes) from a holospace

iTunes answers a named origin and refuses `Origin: null`. Two ways, in order of preference:

- **A. A shell-run fetch for a fixed list of open catalogue hosts.** The app posts
  `{ holospaceCatalogue: id, url }`. The shell checks the address against a short list it carries
  (`itunes.apple.com`, `rss.marketingtools.apple.com`), fetches it with `GET`, `credentials: "omit"`,
  `referrerPolicy: "no-referrer"`, a size limit and a time limit, and returns the text. The shell's `connect-src`
  gains those two hosts. Never a general proxy: no other host, no other method, no headers from the app.
- **B. Leave it out.** Keep ListenBrainz and Audius for charts and search, as Holo Play does now, and use the
  players only for what those name.

A is what makes "search any song" real. It is also the larger decision, since it puts requests on the shell's
origin on an app's behalf.

## What this does not solve

- **Finding the video for a song.** A player needs an identifier. Hologram OS Music gets one somehow; its code for
  that was not found on the public site or in the public repositories. Without it, the honest choices are the
  YouTube Data API with a key the listener supplies (about a hundred searches a day on the free allowance), or the
  owner's own method once its source is shared.
- **The visual and the audio engine.** An embedded player's sound cannot be read by the page. For those items the
  model's truth rule (VZ-01) answers `still`: artwork, no reactive picture, no EQ. That is correct, and it is a
  real loss next to tracks Holo Play streams itself.
- **Terms.** The players must stay visible and unaltered. No background-only playback, no hiding the video.

## Work, in order

1. Owner decides: players yes or no; catalogue A or B; where an app declares players.
2. holospace-shell: register the capability and its refusals in the model first, with scenarios; then
   `servePlayer` in `view.mjs` beside `serveOpens`; the frame, its placement and clipping; the two provider
   protocols; the policy line; tests for every refusal (wrong provider, malformed id, a place outside the app,
   a size under the minimum, an undeclared app).
3. holospace-shell release, and whatever serves the holospace in prism-code and the Foundry store taking it up.
4. Holo Play: a new source that plays through the channel when the shell offers it, and is absent when it does
   not. The model gains a rule for it (a player item is never routed to the engine, and is offered only when the
   shell reports the channel), and `picks` gains the player as a source.
5. Review by someone other than the author before release: this is a change to what every app in a holospace can
   do.

## Risks to weigh

- Every app gains the ability to show a YouTube or SoundCloud player. An app could play unwanted sound; the shell
  should require a click inside the app before the first `play`, as browsers do.
- Third-party frames mean third-party cookies and tracking for the listener. `youtube-nocookie.com` reduces but
  does not remove it.
- The overlay must not let an app place the player over the shell's own controls: clip to the app's frame.
- Two more hosts in the shell's policy is small; a general fetch would not be, and is not proposed.
