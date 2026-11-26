// Holo Play's page. The model (app/src/App.lex.tex) decides; this file fetches, plays and draws.
//
// What the page asks the model, one line each way, every number six digits:
//   ranks <class> <bits> <kbps> <class> <bits> <kbps>  -> first | second | tie     which representation is better
//   retry <tried> <count>                              -> advance | exhausted      what follows a failed one
//   route <readable> <enhance>                         -> engine | direct          whether an item reaches the engine
//   ahead <index> <length> <repeat> <auto>             -> play <n> | replay | stop next, and the end of a track
//   prior <index> <seconds>                            -> play <n> | restart       previous
//   strip <index> <length> <at>                        -> play <n> | keep <n> | empty   remove from the queue
//   plays <companion> <open> <player> <preview>        -> companion | open | player | preview | none   where a song plays from
//   ytids <eleven characters>                          -> valid | not an identifier   a YouTube identifier, before it is asked for
//   place <wide> <tall> <left> <top> <frameWide> <frameTall> -> show | too small | outside   where a held player may sit
//   seeks <position> <seconds>                         -> resume | finished | restart         a saved position
//   links <extension> <host> <companion>               -> track | stream | album | companion | import | external
//   offer <kind> <companion>                           -> offer | hide                        a companion source
//   shows <engine> <samples> <playing>                 -> react | rest | still                may the picture react
//   moods <energy> <tempo>                             -> mood <n>                            how hard the sound may push it
//   scene <seconds> <beat> <boundary> <hold>           -> stay | blend | cut                  when the scene changes
//   flash <count> <calm>                               -> allow | damp                        whether a flash is safe
//   depth <step> <millis>                              -> scale <n>                           how much detail to draw
//   heeds <held> <bass> <mid> <treble>                 -> heed <n>                            what the picture leans toward
// prism.js gives globalThis.prism, prism-ui.js gives globalThis.ui, engine.js gives HoloAudio, library.js gives
// HoloLibrary, sources.js gives HoloSources. Scripts never import each other.
const { invoke } = globalThis.prism;
const { h } = globalThis.ui;
const $ = (id) => document.getElementById(id);

// ---- asking the model: one request at a time, each answered before the next is sent
const six = (n) => String(Math.max(0, Math.min(999999, Math.floor(Number(n)) || 0))).padStart(6, '0');
let asking = Promise.resolve();
function ask(verb, ...numbers) {
  const run = asking.then(() => invoke(`${verb} ${numbers.map(six).join(' ')}`));
  asking = run.catch(() => {});
  return run;
}
/** A request that is words, not numbers: the model reads it as it is. */
function askText(text) {
  const run = asking.then(() => invoke(text));
  asking = run.catch(() => {});
  return run;
}
const numberOf = (answer) => Number(answer.slice(answer.indexOf(' ') + 1));

// ---- what the page remembers between visits: settings only, never a rule
const kept = (key, fallback) => { try { const v = JSON.parse(localStorage.getItem(`holoplay.${key}`)); return v ?? fallback; } catch { return fallback; } };
const keep = (key, value) => { try { localStorage.setItem(`holoplay.${key}`, JSON.stringify(value)); } catch { /* storage is a convenience */ } };

const clock = (s) => {
  const t = Math.max(0, Math.round(s || 0)), m = Math.floor(t / 60), hours = Math.floor(m / 60);
  const ss = String(t % 60).padStart(2, '0');
  return hours ? `${hours}:${String(m % 60).padStart(2, '0')}:${ss}` : `${m}:${ss}`;
};
const hex = (buffer) => Array.from(new Uint8Array(buffer), (b) => b.toString(16).padStart(2, '0')).join('');

// ---- the two elements. `enhanced` is the only one the engine ever taps: a stream the page cannot read would be
// silenced by Web Audio, so it plays on `direct`, untouched. Which one an item gets is the model's answer to `route`.
const direct = new Audio();
const enhanced = new Audio();
direct.preload = enhanced.preload = 'metadata';
let audio = direct;

// ---- a song played by YouTube's or SoundCloud's own player. The holospace holds the player and lays it over the
// dock; this page only asks (play, pause, seek) and is told its state. It wears the face of an audio element, so
// the transport, the queue and the keys work as they do for a stream. Nothing here can read its sound, so the
// engine and the visual stay out of it (the model's shows answers still).
const shell = globalThis.HoloSources.shell;
const remote = Object.assign(new EventTarget(), { paused: true, duration: 0, error: null, active: false, position: 0, getAttribute: () => 'held', removeAttribute() {}, load() {}, playbackRate: 1 });
Object.defineProperty(remote, 'currentTime', { get: () => remote.position, set: (v) => { remote.position = Math.max(0, Number(v) || 0); if (remote.active) shell.player('seek', { seconds: remote.position }).catch(() => {}); } });
Object.defineProperty(remote, 'volume', { get: () => volume / 100, set: (v) => { if (remote.active) shell.player('volume', { level: Math.round(v * 100) }).catch(() => {}); } });
remote.play = () => (remote.active ? shell.player('play') : Promise.resolve());
remote.pause = () => { if (remote.active) shell.player('pause').catch(() => {}); };
const dockPlace = () => { const box = $('dock').getBoundingClientRect(); return { left: Math.round(box.left), top: Math.round(box.top), wide: Math.round(box.width), tall: Math.round(box.height) }; };
function closeRemote() {
  if (!remote.active) return;
  remote.active = false; remote.paused = true; remote.position = 0; remote.duration = 0; remote.error = null;
  $('dock').hidden = true;
  shell.player('close').catch(() => {});
}
shell.hear((told) => {
  if (!remote.active || audio !== remote) return;
  if (Number.isFinite(told.position)) remote.position = told.position;
  if (Number.isFinite(told.duration) && told.duration > 0) remote.duration = told.duration;
  if (told.state === 'ready') { remote.volume = volume / 100; shell.player('play').catch(() => {}); }
  else if (told.state === 'playing') { remote.paused = false; remote.dispatchEvent(new Event('play')); }
  else if (told.state === 'paused') { remote.paused = true; remote.dispatchEvent(new Event('pause')); }
  else if (told.state === 'ended') { remote.paused = true; remote.dispatchEvent(new Event('ended')); }
  else if (told.state === 'error') { remote.error = true; remote.dispatchEvent(new Event('error')); }
  remote.dispatchEvent(new Event('timeupdate'));
});
addEventListener('resize', () => { if (remote.active) shell.player('place', { place: dockPlace() }).catch(() => {}); });

let queue = [];
let at = -1;                 // the playing index, as the model last answered it
let current = null;          // queue[at]
let tried = 0;               // how many of current's representations have failed
let routed = 'direct';       // the model's last answer to route
let verified = null;         // true once the playing bytes matched their address
let turn = 0;                // a newer start cancels an older one still loading
let blobUrl = '';
let repeat = kept('repeat', 0);          // 0 off, 1 all, 2 one
let shuffle = kept('shuffle', false);
let volume = kept('volume', 100);
let enhance = kept('enhance', true);
let preset = kept('preset', 'Hi-Fi');
let bands = kept('bands', null);
let crossfeed = kept('crossfeed', null);
let spatial = kept('spatial', false);
let engine = null;
let taps = null;   // two analysers at the end of the engine, left and right
let visual = null; // the picture, once the Now Playing view has been opened
let speed = kept('speed', 1);
let positions = kept('positions', {}); // where each episode and chapter was left, in seconds
let nowLine = '';                      // what a curated channel says it is playing
let sleeper = 0;

function ensureEngine() {
  if (engine) return engine.ok;
  if (!globalThis.HoloAudio) return false;
  engine = globalThis.HoloAudio.create(enhanced);
  if (!engine.ok) return false;
  engine.setEnabled(true);
  engine.setPreset(preset);
  if (Array.isArray(bands)) bands.forEach((gain, i) => engine.setBand(i, gain));
  if (crossfeed !== null) engine.setCrossfeed(crossfeed ? 0.6 : 0);
  engine.setSpatial(spatial);
  // The picture is fed from the very end of the chain, after the limiter: the samples that reach the speakers,
  // left and right apart.
  const split = engine.ctx.createChannelSplitter(2);
  engine.analyser.connect(split);
  taps = [0, 1].map((channel) => { const node = engine.ctx.createAnalyser(); node.fftSize = 2048; node.smoothingTimeConstant = 0.55; split.connect(node, channel); return node; });
  if (visual) visual.setTaps(taps[0], taps[1]);
  return true;
}

function fail(title, text) {
  for (const el of [direct, enhanced]) el.pause();
  globalThis.ui.toast(title, { variant: 'destructive' }); // the alert below may be scrolled out of sight
  $('error-title').textContent = title;
  $('error-text').textContent = text;
  $('error').hidden = false;
}
const clearFailure = () => { $('error').hidden = true; };

// ---- ranking: the model orders an item's representations, best first, once
async function ranked(item) {
  if (item.ranked) return item.reps;
  const sorted = [];
  for (const rep of item.reps) {
    let place = sorted.length;
    for (let i = 0; i < sorted.length; i++) {
      const other = sorted[i];
      if (await ask('ranks', rep.lossless, rep.bits, rep.kbps, other.lossless, other.bits, other.kbps) === 'first') { place = i; break; }
    }
    sorted.splice(place, 0, rep);
  }
  item.reps = sorted;
  item.ranked = true;
  return sorted;
}

// ---- a catalogue song names a recording, not a file. The page looks for the sources that have it, and the model
// picks: the companion, an open full-length source, or the preview.
let previewSaid = false;
async function prepare(item) {
  if (!item.unresolved) return;
  const sources = globalThis.HoloSources;
  await sources.companion.probe();
  // The third place is YouTube's own player, held by the holospace. It is looked for only where one is offered, and
  // alongside the others, so the wait is the slowest of them and not their sum. The model checks the identifier
  // (PL-02) and then says which source plays (PL-01).
  const offered = await shell.players;
  const [host, open, found] = await Promise.all([sources.companion.match(item), sources.audius.match(item),
    offered.includes('youtube') ? sources.video(item).catch(() => '') : '']);
  const sample = sources.preview(item);
  const id = found && (await askText(`ytids ${found}`)) === 'valid' ? found : '';
  const answer = await ask('plays', host ? 1 : 0, open ? 1 : 0, id ? 1 : 0, sample ? 1 : 0);
  const player = id ? { held: 'youtube', ref: id, url: '', type: '', lossless: 0, bits: 0, kbps: 0, label: 'YouTube · full track', unreadable: true } : null;
  const chosen = { companion: host, open, player, preview: sample }[answer];
  item.reps = chosen ? [chosen] : [];
  item.ranked = false;
  item.unresolved = false;
  if (answer === 'preview' && !previewSaid) {
    previewSaid = true;
    globalThis.ui.toast('Playing a 30-second preview. Full tracks play where an open source has the song, or in the Hologram host.');
  }
}

function silence() {
  closeRemote();
  for (const el of [direct, enhanced]) { el.pause(); el.removeAttribute('src'); el.load(); }
  if (blobUrl) { URL.revokeObjectURL(blobUrl); blobUrl = ''; }
}

/** Start the queue's item at `index`: rank its representations, then try the best. */
async function start(index) {
  const mine = ++turn;
  at = index;
  current = queue[at];
  tried = 0;
  verified = null;
  nowLine = '';
  $('time-now').textContent = current.live ? 'Live' : '0:00';
  $('time-total').textContent = current.live || !current.duration ? '' : clock(current.duration);
  $('seek').value = '0';
  clearFailure();
  silence();
  draw();
  try {
    await prepare(current);
    if (mine !== turn) return;
    if (!current.reps.length && current.source === 'chart') { lookFor(current); return; }
    if (!current.reps.length) { draw(); fail('No source has this song', `Nothing playable was found for “${current.title}”. Try another version of it.`); return; }
    await ranked(current);
    if (mine === turn) await attempt(mine);
  } catch (error) {
    if (mine === turn) fail('The model did not answer', error.message);
  }
}

/** Play current's representation number `tried`, through whichever element the model routes it to. */
async function attempt(mine) {
  const item = current;
  const rep = item.reps[tried];
  let url = rep.url;
  let readable = rep.unreadable ? 0 : 1;
  silence();
  draw();
  if (rep.held) {
    // The holospace's player. The model says whether the dock is a place a player may be shown (PL-03).
    $('dock').hidden = false;
    const place = dockPlace();
    const fits = await ask('place', place.wide, place.tall, place.left, place.top, globalThis.innerWidth, globalThis.innerHeight);
    if (mine !== turn) return;
    if (fits !== 'show') { $('dock').hidden = true; fail('The player does not fit', 'This window is too small to show the player. Make it larger and play the song again.'); return; }
    routed = 'direct';
    audio = remote;
    remote.active = true; remote.paused = true; remote.position = 0; remote.duration = item.duration || 0; remote.error = null;
    try { await shell.player('load', { provider: rep.held, ref: rep.ref, place }); }
    catch { if (mine === turn) { closeRemote(); await failed(mine); } return; }
    draw();
    session();
    remember(item);
    faceOf(item);
    return;
  }
  if (item.kappa) {
    // A content-addressed track: fetch the bytes, re-derive their address, and play only what matched.
    let bytes;
    try {
      const response = await fetch(rep.url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      bytes = await response.arrayBuffer();
    } catch { if (mine === turn) await failed(mine); return; }
    if (mine !== turn) return;
    const address = `sha256:${hex(await crypto.subtle.digest('SHA-256', bytes))}`;
    if (mine !== turn) return;
    if (address !== item.kappa) {
      verified = false;
      draw();
      fail('Playback refused', `The bytes fetched for “${item.title}” do not match its address. Expected ${item.kappa}, got ${address}.`);
      return;
    }
    verified = true;
    blobUrl = URL.createObjectURL(new Blob([bytes], { type: rep.type }));
    url = blobUrl;
    readable = 1;
  }
  if (readable && enhance && !ensureEngine()) readable = 0; // no Web Audio here: nothing can read the item
  routed = await ask('route', readable, enhance ? 1 : 0);
  if (mine !== turn) return;
  audio = routed === 'engine' ? enhanced : direct;
  // The engine reads samples, so a file from another origin must be fetched with CORS; a blob is the page's own.
  if (routed === 'engine' && !blobUrl) audio.crossOrigin = 'anonymous'; else audio.removeAttribute('crossorigin');
  audio.volume = volume / 100;
  audio.src = url;
  draw();
  try { await audio.play(); } catch { /* the browser wants a click first; the play button gives it */ }
  if (routed === 'engine') engine.resume();
  session();
  remember(item);
  faceOf(item);
  if (item.station) globalThis.HoloSources.radio.click(item.station);
  if (item.channel) channelLine();
  await resume(mine);
}

/** An episode or a chapter left part-way: the model says whether to pick it up, and the page seeks there. */
async function resume(mine) {
  const item = current;
  direct.playbackRate = enhanced.playbackRate = item.resumable ? speed : 1;
  const left = positions[item.id];
  if (!item.resumable || !left) return;
  const answer = await ask('seeks', left, item.duration || 999999);
  if (mine !== turn) return;
  if (answer !== 'resume') { delete positions[item.id]; keep('positions', positions); return; }
  const go = () => { if (mine === turn) audio.currentTime = left; };
  if (audio.readyState >= 1) go(); else audio.addEventListener('loadedmetadata', go, { once: true });
}

async function channelLine() {
  const item = current;
  if (!item || !item.channel) return;
  const line = await globalThis.HoloSources.soma.nowPlaying(item.channel);
  if (current === item && line && line !== nowLine) { nowLine = line; draw(); }
}
setInterval(channelLine, 20000);

/** The playing representation gave an error. */
async function failed(mine) {
  const item = current;
  const rep = item.reps[tried];
  if (routed === 'engine' && !item.kappa && !rep.unreadable) {
    // Its host would not let the page read it. It may still play untouched, so the model is asked again.
    rep.unreadable = true;
    return attempt(mine);
  }
  tried += 1;
  const answer = await ask('retry', tried, item.reps.length);
  if (mine !== turn) return;
  if (answer === 'advance') {
    globalThis.ui.toast(`${rep.label} would not stream here. Playing ${item.reps[tried].label}.`);
    return attempt(mine);
  }
  tried = item.reps.length - 1;
  draw();
  fail('This track could not be played', `Every representation of “${item.title}” was tried. Check the connection, or pick another track.`);
}

async function move(answer) {
  if (answer.startsWith('play ')) return start(numberOf(answer));
  if (answer === 'replay' || answer === 'restart') { audio.currentTime = 0; try { await audio.play(); } catch { /* as above */ } return; }
  if (answer === 'stop') { audio.pause(); drawTransport(); }
}
const next = async (auto) => { if (current) await move(await ask('ahead', at, queue.length, repeat, auto ? 1 : 0)); };
const previous = async () => { if (current) await move(await ask('prior', at, audio.currentTime)); };

async function removeAt(index) {
  if (!queue.length) return;
  const answer = await ask('strip', Math.max(0, at), queue.length, index);
  if (answer === 'empty') { queue = []; at = -1; current = null; turn += 1; silence(); draw(); return; }
  queue.splice(index, 1);
  if (answer.startsWith('play ')) return start(numberOf(answer));
  at = numberOf(answer);
  draw();
}

function shuffled(list) {
  const a = list.slice();
  for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
  return a;
}
async function playList(songs, index) {
  if (!songs.length) return;
  // A catalogue song is looked up before anything is stopped: one that no source has leaves the music playing.
  const chosen1 = songs[index];
  if (chosen1 && chosen1.unresolved && (chosen1.source === 'chart' || chosen1.source === 'catalogue') && current) {
    try { await prepare(chosen1); } catch { return; }
    if (!chosen1.reps.length && chosen1.source === 'catalogue') { chosen1.unresolved = true; globalThis.ui.toast(`No source can play “${chosen1.title}” here.`); return; }
    if (!chosen1.reps.length && !$('search').value.trim()) chosen1.unresolved = true;
    else if (!chosen1.reps.length) { chosen1.unresolved = true; globalThis.ui.toast(`No source can play “${chosen1.title}” in full here yet.`); return; }
  }
  if (shuffle) { const chosen = songs[index]; queue = [chosen, ...shuffled(songs.filter((s) => s !== chosen))]; return start(0); }
  queue = songs.slice();
  return start(index);
}

// ---- drawing
const SEEKING = { label: 'Finding the best source' };
const playingRep = () => (current && current.reps.length ? current.reps[Math.min(tried, current.reps.length - 1)] : SEEKING);
const REPEAT = ['Off', 'All', 'One'];

function drawTransport() {
  const paused = audio.paused;
  $('play-icon').hidden = !paused;
  $('pause-icon').hidden = paused;
  $('now-play-icon').hidden = !paused;
  $('now-pause-icon').hidden = paused;
  $('play').setAttribute('aria-label', paused ? 'Play' : 'Pause');
  $('repeat-word').textContent = repeat === 2 ? '1' : '';
  $('repeat').setAttribute('aria-label', `Repeat: ${REPEAT[repeat].toLowerCase()}`);
  $('repeat').setAttribute('aria-pressed', String(repeat !== 0));
  $('repeat').setAttribute('data-state', repeat !== 0 ? 'on' : 'off');
  $('shuffle').setAttribute('aria-pressed', String(shuffle));
  $('shuffle').setAttribute('data-state', shuffle ? 'on' : 'off');
  const kept1 = Boolean(current && saved[current.id]);
  $('fav').setAttribute('aria-pressed', String(kept1));
  $('fav').setAttribute('data-state', kept1 ? 'on' : 'off');
  $('fav').setAttribute('aria-label', kept1 ? 'Remove from saved' : 'Save');
  const steps = Boolean(current && current.resumable);
  $('skip-back').hidden = $('skip-on').hidden = !steps;
  $('seek').disabled = Boolean(current && current.live);
  if ('mediaSession' in navigator) navigator.mediaSession.playbackState = paused ? 'paused' : 'playing';
}

// ---- artwork. Every picture sits in a holder that is never left broken or blank: it shows the picture, sharp at
// the size it is drawn, or the icon of what it stands for.
const iconOf = (thing) => (!thing ? 'music' : thing.source === 'radio' || thing.source === 'soma' ? 'wifi' : thing.source === 'podcast' ? 'mic' : thing.kind === 'Audiobook' ? 'book-open' : 'music');
const sharp = () => Math.min(2, globalThis.devicePixelRatio || 1);

// A `big:` picture is decoded once, one at a time, and kept at 1200 pixels; each place it shows draws it from that.
const originals = new Map();
const lanes = [Promise.resolve(), Promise.resolve(), Promise.resolve()]; // three at a time: quick, and light on memory
let lane = 0;
function original(url) {
  if (!originals.has(url)) {
    const mine = lane++ % lanes.length;
    const made = lanes[mine].then(async () => {
      try {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        await image.decode();
        const bitmap = await createImageBitmap(image, { resizeWidth: Math.min(1200, image.naturalWidth), resizeQuality: 'high' });
        image.removeAttribute('src');
        return bitmap;
      } catch { return null; }
    });
    lanes[mine] = made;
    originals.set(url, made);
  }
  return originals.get(url);
}

async function fill(holder, source, pixels, icon) {
  const mine = (holder.filling = (holder.filling || 0) + 1);
  const blank = () => { if (holder.filling === mine) holder.replaceChildren(h('span', { slot: 'icon', 'data-icon': icon, 'aria-hidden': 'true', class: 'text-2xl text-muted-foreground' })); };
  let src = '';
  try { src = (await source) || ''; } catch { src = ''; }
  if (holder.filling !== mine) return;
  if (!holder.firstChild) blank(); // the icon stands in until the picture has arrived
  if (!src || !src.length) return blank();
  if (typeof src === 'string' && src.startsWith('big:')) {
    const bitmap = await original(src.slice(4));
    if (holder.filling !== mine) return;
    if (!bitmap) return blank();
    const side = Math.min(bitmap.width, Math.round(pixels * sharp()));
    const canvas = h('canvas', { class: 'block w-full h-full object-cover', width: String(side), height: String(Math.round((side * bitmap.height) / bitmap.width)) });
    const pen = canvas.getContext('2d');
    pen.imageSmoothingQuality = 'high';
    pen.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    holder.replaceChildren(canvas);
    return;
  }
  // One address or several: each is tried in turn, and the picture replaces the icon only once it has loaded.
  const attempt = async (addresses) => {
    if (holder.filling !== mine) return;
    if (!addresses.length) return blank();
    const [first, ...rest] = addresses;
    let address = first;
    if (typeof first === 'function') { try { address = await first(); } catch { address = ''; } } // a place that must be looked up first
    if (holder.filling !== mine) return;
    if (!address) return attempt(rest);
    const img = h('img', { class: 'block w-full h-full object-cover', alt: '', decoding: 'async',
      onload: () => { if (holder.filling === mine) holder.replaceChildren(img); },
      onerror: () => { globalThis.HoloSources.missed(address); attempt(rest); } });
    img.src = address;
  };
  attempt(Array.isArray(src) ? src : [src]);
}
/** One address out of what a cover gave: a plain one if there is one, else the first that a lookup answers. */
async function firstAddress(found) {
  for (const place of Array.isArray(found) ? found : [found]) {
    const address = typeof place === 'function' ? await place().catch(() => '') : place;
    if (address) return address;
  }
  return '';
}
const drawCover = (holder, item, pixels) => fill(holder, item ? item.cover(pixels) : '', pixels, iconOf(item));

function draw() {
  $('player').hidden = !current;
  $('sound-chip').textContent = enhance ? preset : 'Off';
  drawQueue();
  markPlaying();
  drawSound();
  if (!current) return;
  const rep = playingRep();
  $('now-title').textContent = current.title;
  $('now-artist').textContent = nowLine || [current.artist, current.album].filter(Boolean).join(' · ');
  const route = routed === 'engine' ? `Engine · ${preset}` : 'Direct';
  $('now-quality').textContent = current.reps.length ? `${rep.label} · ${route}` : rep.label;
  $('now-verified').hidden = verified !== true;
  if (verified === true) $('now-verified').setAttribute('data-tooltip', `These bytes re-derive to ${current.kappa}`);
  $('now-line').textContent = `${rep.label} · ${route}${verified === true ? ' · verified' : ''}`;
  drawCover($('now-cover'), current, 48);
  drawNow();
  drawTransport();
}

function drawQueue() {
  $('queue-line').textContent = queue.length ? `${queue.length} ${queue.length === 1 ? 'track' : 'tracks'}` : 'Nothing is queued.';
  $('queue-list').replaceChildren(...queue.map((item, i) => h('li', { class: 'flex items-center gap-1 min-w-0 w-full' },
    h('button', { slot: 'item', size: 'sm', type: 'button', class: 'flex-1 min-w-0 overflow-hidden', 'aria-current': i === at ? 'true' : false, onclick: () => start(i) },
      h('span', { slot: 'item-content', class: 'min-w-0 flex-1 overflow-hidden' },
        h('span', { slot: 'item-title', class: 'block w-full truncate' }, item.title),
        h('span', { slot: 'item-description', class: 'block w-full truncate' }, item.artist))),
    h('button', { slot: 'button', variant: 'ghost', size: 'icon-sm', type: 'button', 'aria-label': `Remove ${item.title}`, onclick: () => removeAt(i) },
      h('span', { slot: 'icon', 'data-icon': 'x', 'aria-hidden': 'true' })))));
}

// ---- the library, the catalogue and search
let opened = null;   // the collection on screen: { entry, songs, behind }
let section = 'home'; // the tab on screen
const VIEWS = ['home', 'radio', 'podcasts', 'books', 'saved', 'results', 'album'];

function show(view) {
  for (const id of VIEWS) $(id).hidden = id !== view;
  $('page').scrollTop = 0; // a new view starts at its top
  if (view !== 'results' && view !== 'album') section = view;
  for (const tab of document.querySelectorAll('[data-tab]')) {
    const on = tab.getAttribute('data-tab') === section;
    tab.setAttribute('data-variant', on ? 'secondary' : 'ghost');
    if (on) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
  }
}

function picture(source, classes, pixels, icon) {
  const holder = h('span', { class: `flex items-center justify-center overflow-hidden ${classes}` });
  fill(holder, Promise.resolve(source), pixels, icon);
  return holder;
}

/** A square tile: an album, artist or show that opens, or a song or channel that plays. */
function tile(title, line, cover, run, id, icon) {
  return h('button', { slot: 'item', type: 'button', class: 'flex-col items-stretch gap-3 text-left', 'data-song': id || false, onclick: run },
    picture(cover, 'w-full aspect-square rounded-xl bg-muted shadow-md', 260, icon),
    h('span', { slot: 'item-content', class: 'min-w-0 w-full overflow-hidden' },
      h('span', { slot: 'item-title', class: 'block w-full truncate' }, title),
      h('span', { slot: 'item-description', class: 'block w-full truncate' }, line)));
}
const entryTile = (entry) => tile(entry.name, [entry.artist, entry.year].filter(Boolean).join(' · '), entry.cover(260), () => openAlbum(entry), '', iconOf(entry));
const songTile = (song, list, i) => tile(song.title, song.live ? song.album || song.artist : song.artist, song.cover(260), () => playList(list, i), song.id, iconOf(song));

function songRow(song, list, i, numbered) {
  return h('li', null,
    h('button', { slot: 'item', size: 'sm', type: 'button', class: 'w-full', 'data-song': song.id, onclick: () => playList(list, i) },
      numbered
        ? h('span', { slot: 'item-media', class: 'w-6 text-sm text-muted-foreground tabular-nums' }, String(song.track || i + 1))
        : h('span', { slot: 'item-media' }, picture(song.thumb && song.thumb.length ? song.thumb : song.cover(40), 'size-10 rounded-md bg-muted', 40, iconOf(song))),
      h('span', { slot: 'item-content', class: 'min-w-0 flex-1 overflow-hidden' },
        h('span', { slot: 'item-title', class: 'block w-full truncate' }, song.title),
        h('span', { slot: 'item-description', class: 'block w-full truncate' }, [song.artist, numbered ? '' : song.album].filter(Boolean).join(' · '))),
      h('span', { slot: 'item-actions', class: 'gap-3 shrink-0' },
        song.full ? h('span', { slot: 'badge', variant: 'outline', class: 'hidden md:inline-flex' }, 'Full track') : null,
        song.live ? h('span', { slot: 'badge', variant: 'outline', class: 'hidden md:inline-flex' }, song.reps[0].label) : null,
        h('span', { class: 'text-sm text-muted-foreground tabular-nums' }, song.live ? 'Live' : song.duration ? clock(song.duration) : ''))));
}

function markPlaying() {
  for (const el of document.querySelectorAll('[data-song]')) {
    if (current && el.getAttribute('data-song') === current.id) el.setAttribute('aria-current', 'true'); else el.removeAttribute('aria-current');
  }
}

const note = (text) => h('li', { class: 'text-sm text-muted-foreground px-3 py-2' }, text);
const rows = (box, songs, numbered) => { $(box).replaceChildren(...songs.map((s, i) => songRow(s, songs, i, numbered))); markPlaying(); };

async function openAlbum(entry) {
  const behind = !$('album').hidden && opened ? opened.behind : !$('results').hidden ? 'results' : section;
  show('album');
  const artist = entry.kind === 'Artist';
  const kind = entry.source === 'bundled' ? `Album · ${entry.genre}` : [entry.kind, entry.genre].filter(Boolean).join(' · ');
  $('album-kind').textContent = kind;
  $('album-title').textContent = entry.name;
  $('album-line').textContent = [entry.artist, entry.year].filter(Boolean).join(' · ');
  $('album-tracks').replaceChildren(note('Loading'));
  $('album-albums-box').hidden = true;
  $('album-own').hidden = !entry.own;
  drawCover($('album-cover'), entry, 320);
  opened = { entry, songs: [], behind };
  const mine = opened;
  try {
    const songs = await entry.songs();
    if (opened !== mine) return;
    mine.songs = songs;
    const word = artist ? 'top songs' : entry.kind === 'Podcast' ? 'episodes' : entry.kind === 'Audiobook' ? 'chapters' : 'tracks';
    $('album-line').textContent = [entry.artist, entry.year, `${songs.length} ${word}`].filter(Boolean).join(' · ');
    const numbered = entry.source === 'bundled' || entry.source === 'archive' || (entry.source === 'catalogue' && !artist);
    if (songs.length) rows('album-tracks', songs, numbered); else $('album-tracks').replaceChildren(note('Nothing playable was found here.'));
  } catch {
    if (opened === mine) $('album-tracks').replaceChildren(note('This could not be loaded. Check the connection and open it again.'));
  }
  if (entry.albums) {
    try {
      const albums = await entry.albums();
      if (opened !== mine || !albums.length) return;
      $('album-albums').replaceChildren(...albums.map(entryTile));
      $('album-albums-box').hidden = false;
    } catch { /* the songs above still stand */ }
  }
}

// ---- a pasted link. The page reads what kind of address it is; the model says what to do with it.
async function openLink(text, mine) {
  const { companion } = globalThis.HoloSources;
  let url;
  try { url = new URL(text); } catch { return; }
  const path = url.pathname.toLowerCase();
  const host = url.hostname.toLowerCase();
  const extension = /\.(m3u8|m3u|pls)$/.test(path) ? 2 : /\.(mp3|m4a|aac|ogg|oga|opus|flac|wav)$/.test(path) ? 1 : 0;
  const where = /(^|\.)archive\.org$/.test(host) ? 1 : /(^|\.)(soundcloud\.com|snd\.sc)$/.test(host) ? 2 : /(^|\.)youtube\.com$|^youtu\.be$/.test(host) ? 3 : 0;
  await companion.probe();
  const answer = await ask('links', extension, where, companion.present() ? 1 : 0);
  if (mine !== searching) return;
  const name = decodeURIComponent(url.pathname.split('/').pop() || host);
  const single = (rep, live) => ({ id: `link:${text}`, source: 'link', title: name || host, artist: host, album: '', duration: 0, live, cover: () => Promise.resolve(''), thumb: '', kappa: '', reps: [rep] });
  const said = (line) => { $('r-link').textContent = line; $('r-link').hidden = false; };
  if (answer === 'track') { playList([single({ url: text, type: '', lossless: 1, bits: 0, kbps: 0, label: 'Linked file' }, false)], 0); return said('Playing the linked file.'); }
  if (answer === 'stream') { playList([single({ url: text, type: '', lossless: 1, bits: 0, kbps: 0, label: 'Linked stream', unreadable: true }, true)], 0); return said('Playing the linked stream. A playlist file some browsers cannot open will say so below the player.'); }
  if (answer === 'album') {
    const found = /\/(details|download|embed)\/([^/?#]+)/.exec(url.pathname);
    if (found) return openAlbum(globalThis.HoloLibrary.item(decodeURIComponent(found[2])));
    return said('That Internet Archive link names no item.');
  }
  if (answer === 'companion' || answer === 'import') { playList([single(companion.stream(text), false)], 0); return said('Playing through the Hologram host.'); }
  said('This link cannot be played here. YouTube, SoundCloud and other page links play when Holo Play runs in the Hologram host.');
}

// One query, every source at once; each group draws as its source answers, and a newer query discards an older one.
let searching = 0;
let searchTimer = 0;
const RESULT_BOXES = ['r-artists', 'r-albums', 'r-open', 'r-radio', 'r-pods', 'r-books', 'r-sc'];
function search() {
  const term = $('search').value.trim();
  const mine = ++searching;
  opened = null;
  if (!term) { show(section); return; }
  const { audius, radio, podcasts, companion } = globalThis.HoloSources;
  show('results');
  $('results-title').textContent = term.length > 60 ? `${term.slice(0, 60)}…` : `“${term}”`;
  for (const id of RESULT_BOXES) { $(id).replaceChildren(); $(`${id}-box`).hidden = true; }
  $('r-link').hidden = true;
  if (/^https?:\/\/\S+$/i.test(term)) { $('r-songs-box').hidden = true; openLink(term, mine); return; }
  $('r-songs-box').hidden = false;
  $('r-songs').replaceChildren(note('Searching'));
  const list = (box) => (songs) => { if (mine !== searching || !songs.length) return; rows(box, songs, false); $(`${box}-box`).hidden = false; };
  const tiles = (box) => (found) => { if (mine !== searching || !found.length) return; $(box).append(...found.map(entryTile)); $(`${box}-box`).hidden = false; };
  // The catalogue names every song, artist and album. Where the holospace reads iTunes for the page, that is the
  // catalogue: one quick answer with covers. Where it does not, MusicBrainz is, more slowly.
  shell.players.then((offered) => {
    if (mine !== searching) return;
    if (offered.length) {
      const { catalogue } = globalThis.HoloSources;
      catalogue.songs(term, 24).then((songs) => {
        if (mine !== searching) return;
        if (songs.length) rows('r-songs', songs, false); else $('r-songs').replaceChildren(note('No songs were found.'));
      }).catch(() => { if (mine === searching) $('r-songs').replaceChildren(note('The catalogue could not be reached. Check the connection.')); });
      catalogue.artists(term, 6).then(tiles('r-artists')).catch(() => {});
      catalogue.albums(term, 12).then(tiles('r-albums')).catch(() => {});
      return;
    }
    globalThis.HoloSources.world.search(term).then((found) => {
      if (mine !== searching) return;
      tiles('r-artists')(found.artists);
      found.songs.then((songs) => {
        if (mine !== searching) return;
        if (songs.length) rows('r-songs', songs, false); else $('r-songs').replaceChildren(note('No songs were found.'));
      }).catch(() => { if (mine === searching) $('r-songs').replaceChildren(note('The catalogue is busy. Try again in a moment.')); });
      found.albums.then(tiles('r-albums')).catch(() => {});
    }).catch(() => { if (mine === searching) $('r-songs').replaceChildren(note('The catalogue could not be reached. Check the connection.')); });
  });
  audius.search(term, 12).then(list('r-open')).catch(() => {});
  audius.artists(term, 6).then(tiles('r-artists')).catch(() => {});
  audius.playlists(term, 6).then(tiles('r-albums')).catch(() => {});
  radio.search(term, 8).then(list('r-radio')).catch(() => {});
  podcasts.search(term, 6).then(tiles('r-pods')).catch(() => {});
  globalThis.HoloLibrary.books(term, 6).then(tiles('r-books')).catch(() => {});
  // SoundCloud is a companion source: the model says whether it is offered at all.
  companion.probe().then(() => ask('offer', 1, companion.present() ? 1 : 0)).then((answer) => (answer === 'offer' ? companion.search(term, 12) : [])).then(list('r-sc')).catch(() => {});
}

/** A chart song no source has in full: say so, and show what can be played for it instead. */
function lookFor(item) {
  queue = []; at = -1; current = null; turn += 1;
  silence();
  draw();
  if ($('search').value.trim()) { globalThis.ui.toast(`No source can play “${item.title}” in full here yet.`); return; } // already among search results
  globalThis.ui.toast(`No full source has “${item.title}” here. Showing what can be played.`);
  $('search').value = `${item.artist} ${item.title}`;
  search();
}

/** A chart shelf: drawn at once from the last visit, then again when the fresh answer arrives. */
function chartShelf(id, chart, drawOne) {
  const box = $(id);
  const put = (rows) => {
    const items = rows.map(chart.make);
    box.replaceChildren(...items.map((item, i) => drawOne(item, items, i)));
    box.removeAttribute('aria-busy');
    markPlaying();
  };
  const had = chart.now();
  if (had.length) put(had);
  chart.fresh().then((rows) => { if (rows.length) put(rows); else if (!had.length) $(`${id}-box`).hidden = true; })
    .catch(() => { if (!had.length) $(`${id}-box`).hidden = true; });
}

async function shelf(id, load, drawOne, failed) {
  const box = $(id);
  try {
    const items = await load();
    if (!items.length) throw new Error('empty');
    box.replaceChildren(...items.map((item, i) => drawOne(item, items, i)));
    markPlaying();
  } catch {
    if (failed) { box.replaceChildren(); $(`${id}-note`).textContent = failed; $(`${id}-note`).hidden = false; } else $(`${id}-box`).hidden = true;
  }
  box.removeAttribute('aria-busy');
}

const THEMES = ['Lo-Fi', 'Jazz', 'Ambient', 'Electronic', 'Classical', 'News', 'Rock', 'Hip Hop', 'Reggae', 'Latin', 'House', 'Metal'];
const loaded = new Set();
function load(view) {
  if (loaded.has(view)) return;
  loaded.add(view);
  const { catalogue, audius, radio, soma, podcasts } = globalThis.HoloSources;
  if (view === 'home') {
    shelf('chart', () => catalogue.chart(12), songTile);
    const { charts, categories } = globalThis.HoloSources;
    $('moods').replaceChildren(...categories.moods.map((mood) => h('button', { slot: 'button', variant: 'outline', size: 'sm', class: 'rounded-full', type: 'button', onclick: () => openAlbum(mood.entry) },
      h('span', { slot: 'icon', 'data-icon': mood.icon, 'aria-hidden': 'true' }), mood.name)));
    $('genres').replaceChildren(...categories.genres.map((genre) => h('button', { slot: 'button', variant: 'secondary', size: 'sm', class: 'rounded-full', type: 'button', onclick: () => openAlbum(genre.entry) }, genre.name)));
    chartShelf('trending', charts.trending, songTile);
    chartShelf('world-songs', charts.songs, songTile);
    chartShelf('world-albums', charts.albums, entryTile);
    chartShelf('classics', charts.classics, songTile);
    shelf('hot', () => audius.hot(6), entryTile);
    shelf('concerts', () => globalThis.HoloLibrary.concerts(6), entryTile); // out of reach, the shelf steps aside
  } else if (view === 'radio') {
    $('themes').replaceChildren(...THEMES.map((name) => h('button', { slot: 'button', variant: 'outline', size: 'sm', type: 'button', onclick: () => stations(name, () => radio.byTag(name.toLowerCase(), 40)) }, name)));
    stations('Popular now', () => radio.top(40));
    shelf('soma', () => soma.channels(), songTile);
  } else if (view === 'podcasts') {
    shelf('pod-hot', () => podcasts.hot(18), entryTile, 'The podcast directory could not be reached. Search still tries.');
  } else if (view === 'books') {
    shelf('books-shelf', () => globalThis.HoloLibrary.books('', 18), entryTile, 'Audiobooks come from the Internet Archive, which could not be reached from here.');
  }
}

let tuning = 0;
async function stations(heading, find) {
  const mine = ++tuning;
  $('radio-title').textContent = heading;
  $('radio-list').replaceChildren(note('Tuning'));
  try {
    const found = await find();
    if (mine !== tuning) return;
    if (found.length) rows('radio-list', found, false); else $('radio-list').replaceChildren(note('No stations were found.'));
  } catch { if (mine === tuning) $('radio-list').replaceChildren(note('The radio directory could not be reached. Check the connection.')); }
}

// ---- saved items, playlists and what was played: kept by the holospace for this app, as plain records
let saved = kept('saved', {});
let lists = kept('lists', []);    // [{ id, name, items: [record] }]
let recent = kept('recent', []);  // [record], newest first
const record = async (item) => ({
  id: item.id, source: item.source, title: item.title, artist: item.artist, album: item.album, duration: item.duration, thumb: item.thumb || '',
  // A redrawn picture is a blob that does not outlive the page, so its original address is what is kept.
  art: item.art || await item.cover(600).then(firstAddress).then((url) => (url && !url.startsWith('blob:') ? url.replace(/^big:/, '') : '')).catch(() => ''),
  thumb: Array.isArray(item.thumb) ? item.thumb[0] || '' : item.thumb || '',
  kappa: item.kappa || '', live: Boolean(item.live), resumable: Boolean(item.resumable), full: Boolean(item.full), station: item.station || '', channel: item.channel || '',
  preview: item.preview || '', unresolved: Boolean(item.unresolved),
  reps: item.unresolved ? [] : item.reps.map(({ url, type, lossless, bits, kbps, label, unreadable }) => ({ url, type, lossless, bits, kbps, label, unreadable: Boolean(unreadable) })),
});
const revive = (r) => ({
  ...r, reps: r.reps.map((rep) => ({ ...rep })),
  cover: () => Promise.resolve(r.source === 'podcast' ? globalThis.HoloSources.big(r.art) : r.art || r.thumb || ''),
});
// A signed address on the listener's own server is for this session only; it is never written down.
const keepable = (item) => item.source !== 'subsonic';

async function toggleSaved() {
  if (!current) return;
  if (!keepable(current)) { globalThis.ui.toast('Tracks from your server are not kept here: their addresses are signed for this session.'); return; }
  if (saved[current.id]) delete saved[current.id]; else saved[current.id] = await record(current);
  keep('saved', saved);
  drawSaved();
  drawTransport();
}

async function remember(item) {
  if (!keepable(item)) return;
  const made = await record(item);
  recent = [made, ...recent.filter((r) => r.id !== made.id)].slice(0, 30);
  keep('recent', recent);
  drawSaved();
}

async function saveQueue() {
  const name = $('list-name').value.trim();
  const items = queue.filter(keepable);
  if (!name) { globalThis.ui.toast('Give the playlist a name.'); return; }
  if (!items.length) { globalThis.ui.toast('There is nothing in the queue to save.'); return; }
  lists = [...lists, { id: `list:${Date.now().toString(36)}`, name, items: await Promise.all(items.map(record)) }];
  keep('lists', lists);
  $('list-name').value = '';
  drawSaved();
  globalThis.ui.toast(`Saved “${name}”, ${items.length} ${items.length === 1 ? 'track' : 'tracks'}.`, { variant: 'success' });
}
function dropList(id) {
  lists = lists.filter((list) => list.id !== id);
  keep('lists', lists);
  drawSaved();
}
const listEntry = (list) => ({
  id: list.id, own: list.id, source: 'list', kind: 'Playlist', name: list.name, artist: `${list.items.length} ${list.items.length === 1 ? 'track' : 'tracks'}`, year: null, genre: 'Yours',
  cover: () => (list.items[0] ? revive(list.items[0]).cover() : Promise.resolve('')),
  songs: () => Promise.resolve(list.items.map(revive)),
});

function drawSaved() {
  const items = Object.values(saved).map(revive);
  if (items.length) rows('saved-list', items, false); else $('saved-list').replaceChildren(note('Nothing saved yet. Press the heart in the player to keep a song, a station or an episode here.'));
  $('lists').replaceChildren(...lists.map((list) => entryTile(listEntry(list))));
  $('lists-box').hidden = !lists.length;
  if (recent.length) rows('recent', recent.map(revive), false);
  $('recent-box').hidden = !recent.length;
}

// ---- the listener's own Navidrome or Subsonic server, through Holo Music's data layer
let server = null;
const LOSSLESS = /^(flac|wav|alac|aiff)$/i;
function serverSong(song) {
  const lossless = LOSSLESS.test(song.suffix || '');
  const name = String(song.suffix || 'audio').toUpperCase();
  return {
    id: `sub:${song.id}`, source: 'subsonic', title: song.title, artist: song.artist || '', album: song.album || '', track: song.track || null, duration: song.duration || 0,
    cover: () => Promise.resolve(server.coverArtUrl(song.coverArtId, 600)), thumb: server.coverArtUrl(song.coverArtId, 100), kappa: '',
    reps: [{ url: server.streamUrl(song), type: song.contentType || '', lossless: lossless ? 2 : 1, bits: lossless ? 16 : 0, kbps: song.bitRate || 0,
      label: lossless ? `${name} · lossless` : `${name}${song.bitRate ? ` ${song.bitRate}k` : ''}` }],
  };
}
const serverAlbum = (album) => ({
  id: `sub-album:${album.id}`, source: 'subsonic', kind: 'Album', name: album.name, artist: album.artist || '', year: album.year || null, genre: album.genre || '',
  cover: () => Promise.resolve(server.coverArtUrl(album.coverArtId, 600)),
  songs: async () => ((await server.getAlbum(album.id)).songs || []).map(serverSong),
});
async function connect() {
  const said = (line) => { $('server-error').textContent = line; $('server-error').hidden = !line; };
  said('');
  const address = $('server-url').value.trim();
  if (!/^https:\/\//i.test(address)) return said('The address must start with https://. A page in a holospace cannot reach an http server.');
  try {
    server = await globalThis.HoloSubsonic.server(address, $('server-user').value, $('server-pass').value);
    const albums = await server.getAlbumList2('newest', 60);
    $('server-pass').value = '';
    $('server').close();
    $('server-line').textContent = `Connected to ${server.name || address}.`;
    $('server-albums').replaceChildren(...albums.map((album) => entryTile(serverAlbum(album))));
  } catch (error) {
    server = null;
    said(`Could not connect: ${error.message}. Check the address and the sign-in, and that the server allows other sites to read it.`);
  }
}

// ---- the sound sheet
const presetOf = (name) => (globalThis.HoloAudio ? globalThis.HoloAudio.PRESETS[name] : null) || { eq: [0, 0, 0, 0, 0], crossfeed: 0, note: '' };
const hertz = (f) => (f >= 1000 ? `${f / 1000} kHz` : `${f} Hz`);
const signed = (g) => `${g > 0 ? '+' : ''}${g} dB`;

function buildSound() {
  const names = globalThis.HoloAudio ? Object.keys(globalThis.HoloAudio.PRESETS) : [];
  $('preset').replaceChildren(...names.map((name) => h('option', { value: name, selected: name === preset }, name)));
  const freqs = globalThis.HoloAudio ? globalThis.HoloAudio.EQ_FREQS : [];
  $('bands').replaceChildren(...freqs.map((f, i) => h('label', { slot: 'label', class: 'grid grid-cols-4 items-center gap-3' },
    h('span', { class: 'text-sm tabular-nums' }, hertz(f)),
    h('input', { slot: 'slider', class: 'col-span-2', type: 'range', min: '-12', max: '12', step: '1', 'data-band': String(i), 'aria-label': `${hertz(f)} gain`, oninput: (event) => {
      const gain = Number(event.target.value);
      if (ensureEngine()) { engine.setBand(i, gain); bands = engine.bands(); keep('bands', bands); }
      drawSound();
    } }),
    h('span', { class: 'text-sm text-muted-foreground tabular-nums text-right', id: `band-${i}` }, signed(0)))));
}

function drawSound() {
  $('enhance').checked = enhance;
  const live = engine && engine.ok;
  const gains = Array.isArray(bands) ? bands : presetOf(preset).eq;
  for (const slider of $('bands').querySelectorAll('[data-band]')) {
    const i = Number(slider.getAttribute('data-band'));
    if (document.activeElement !== slider) slider.value = String(gains[i] || 0);
    $(`band-${i}`).textContent = signed(Number(slider.value));
  }
  $('preset-note').textContent = presetOf(preset).note || '';
  $('crossfeed').checked = crossfeed === null ? presetOf(preset).crossfeed > 0 : crossfeed;
  $('spatial').checked = spatial;
  $('engine-line').textContent = live ? `The engine runs at ${(engine.sampleRate / 1000).toFixed(1)} kHz, this device's own output rate.` : 'The engine starts with the first track you play.';
  $('route-line').textContent = !current ? '' : routed === 'engine'
    ? 'This track is playing through the engine.'
    : enhance ? 'This track is playing direct: its host does not let the page read it, so it is passed through untouched.' : 'Enhance is off: everything plays direct, untouched.';
}

let metering = 0;
function meter() {
  metering = $('sound').open ? requestAnimationFrame(meter) : 0;
  const level = engine && engine.ok && audio === enhanced && !audio.paused ? engine.level() : 0;
  $('level').value = Math.min(100, Math.round(level * 240));
}

// ---- the lock screen and hardware keys
function session() {
  if (!('mediaSession' in navigator) || !current) return;
  current.cover(512).then(firstAddress).then((art) => {
    navigator.mediaSession.metadata = new MediaMetadata({ title: current.title, artist: current.artist, album: current.album, artwork: art && !art.startsWith('blob:') ? [{ src: art.replace(/^big:/, '') }] : [] });
  });
  const on = (action, run) => { try { navigator.mediaSession.setActionHandler(action, run); } catch { /* not every browser has every action */ } };
  on('play', () => audio.play());
  on('pause', () => audio.pause());
  on('previoustrack', () => previous());
  on('nexttrack', () => next(false));
  on('seekto', (details) => { if (details.seekTime != null) audio.currentTime = details.seekTime; });
}

// ---- wiring
for (const el of [direct, enhanced, remote]) {
  el.addEventListener('play', () => { if (el === audio) drawTransport(); });
  el.addEventListener('pause', () => { if (el === audio) drawTransport(); });
  el.addEventListener('ended', () => {
    if (el !== audio) return;
    if (current && positions[current.id]) { delete positions[current.id]; keep('positions', positions); }
    next(true);
  });
  // An element reset for the next item can still deliver the last one's error; a live failure has el.error set.
  el.addEventListener('error', () => { if (el === audio && current && el.error && el.getAttribute('src')) failed(turn); });
  el.addEventListener('timeupdate', () => {
    if (el !== audio || !current) return;
    const total = Number.isFinite(audio.duration) && audio.duration ? audio.duration : current.duration || 0;
    $('time-now').textContent = current.live ? 'Live' : clock(audio.currentTime);
    $('time-total').textContent = current.live ? '' : clock(total);
    if (current.resumable && Math.abs((positions[current.id] || 0) - audio.currentTime) >= 5) { positions[current.id] = Math.floor(audio.currentTime); keep('positions', positions); }
    if (document.activeElement !== $('seek')) $('seek').value = total ? String(Math.round((audio.currentTime / total) * 1000)) : '0';
  });
}

$('play').addEventListener('click', () => { if (!current) return; if (audio.paused) audio.play().catch(() => {}); else audio.pause(); });
$('next').addEventListener('click', () => next(false));
$('prev').addEventListener('click', () => previous());
$('repeat').addEventListener('click', () => { repeat = (repeat + 1) % 3; keep('repeat', repeat); drawTransport(); });
$('shuffle').addEventListener('click', () => {
  shuffle = !shuffle;
  keep('shuffle', shuffle);
  if (shuffle && current && queue.length > 1) { queue = [current, ...shuffled(queue.filter((_, i) => i !== at))]; at = 0; }
  draw();
});
$('seek').addEventListener('change', () => {
  const total = Number.isFinite(audio.duration) && audio.duration ? audio.duration : 0;
  if (total) audio.currentTime = (Number($('seek').value) / 1000) * total;
  $('seek').blur();
});
$('volume').value = String(volume);
$('volume').addEventListener('input', () => { volume = Number($('volume').value); direct.volume = enhanced.volume = remote.volume = volume / 100; keep('volume', volume); });

$('error-close').addEventListener('click', clearFailure);
$('album-back').addEventListener('click', () => { const to = opened ? opened.behind : 'home'; opened = null; show(to); });
$('search').addEventListener('input', () => { clearTimeout(searchTimer); searchTimer = setTimeout(search, 140); });
for (const tab of document.querySelectorAll('[data-tab]')) tab.addEventListener('click', () => { const view = tab.getAttribute('data-tab'); $('search').value = ''; searching += 1; opened = null; show(view); load(view); });
$('fav').addEventListener('click', () => toggleSaved());
$('list-form').addEventListener('submit', (event) => { event.preventDefault(); saveQueue(); });
$('album-delete').addEventListener('click', () => { if (opened && opened.entry.own) { dropList(opened.entry.own); opened = null; show('saved'); } });
$('server-form').addEventListener('submit', (event) => { event.preventDefault(); connect(); });
$('skip-back').addEventListener('click', () => { audio.currentTime = Math.max(0, audio.currentTime - 15); });
$('skip-on').addEventListener('click', () => { audio.currentTime = audio.currentTime + 30; });
$('speed').value = String(speed);
$('speed').addEventListener('change', () => { speed = Number($('speed').value); keep('speed', speed); if (current && current.resumable) direct.playbackRate = enhanced.playbackRate = speed; });
$('sleep').addEventListener('change', () => {
  clearTimeout(sleeper);
  const minutes = Number($('sleep').value);
  $('sleep-line').textContent = minutes ? `Playback pauses in ${minutes} minutes.` : '';
  if (minutes) sleeper = setTimeout(() => { audio.pause(); $('sleep').value = '0'; $('sleep-line').textContent = 'The sleep timer paused playback.'; }, minutes * 60000);
});
$('album-play').addEventListener('click', () => { if (opened) playList(opened.songs, 0); });
$('album-shuffle').addEventListener('click', () => { if (opened && opened.songs.length) playList(shuffled(opened.songs), 0); });

$('enhance').addEventListener('change', () => {
  enhance = $('enhance').checked;
  keep('enhance', enhance);
  draw();
  if (current) { const resume = audio.currentTime; start(at).then(() => { audio.currentTime = resume; }); } // the route is the model's to answer again
});
$('preset').addEventListener('change', () => {
  preset = $('preset').value;
  bands = null;
  crossfeed = null;
  keep('preset', preset); keep('bands', null); keep('crossfeed', null);
  if (ensureEngine()) engine.setPreset(preset);
  draw();
});
$('crossfeed').addEventListener('change', () => { crossfeed = $('crossfeed').checked; keep('crossfeed', crossfeed); if (ensureEngine()) engine.setCrossfeed(crossfeed ? 0.6 : 0); });
$('spatial').addEventListener('change', () => { spatial = $('spatial').checked; keep('spatial', spatial); if (ensureEngine()) engine.setSpatial(spatial); });
new MutationObserver(() => { if ($('sound').open && !metering) { drawSound(); meter(); } }).observe($('sound'), { attributes: true, attributeFilter: ['open'] });

addEventListener('keydown', (event) => {
  if (/^(INPUT|TEXTAREA|SELECT)$/.test(event.target.tagName) || event.ctrlKey || event.metaKey || event.altKey) return;
  if (event.key === ' ') { event.preventDefault(); $('play').click(); }
  else if (event.key === 'ArrowRight' && event.shiftKey) next(false);
  else if (event.key === 'ArrowLeft' && event.shiftKey) previous();
  else if (event.key === 's') $('shuffle').click();
  else if (event.key === 'r') $('repeat').click();
  else if (event.key === '/') { event.preventDefault(); $('search').focus(); }
  else if (event.key === 'v') { if ($('now').hidden) openNow(); else closeNow(); }
  else if (event.key === 'Escape' && !$('now').hidden) closeNow();
});

// ---- seeing the music. visuals.js draws; the model decides whether it may react, how hard, when the scene changes,
// whether a flash is safe and how much detail the device can afford. This part asks, and passes the answers on.
let showing = 'still';
let detailStep = 2;
let heeding = 0;
let motion = kept('motion', true); // the listener's own switch: with it off the cover is shown and nothing is drawn
let drawn = '';        // the picture's own size in pixels, as last measured
let sceneSince = 0;
let sceneLocked = false;
let flashes = [];      // when each flash of the last second happened
let watching = 0;
let idle = 0;
const calm = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

async function faceOf(item) {
  if (!visual) return;
  let picture = '';
  try { picture = (await firstAddress(await item.cover(600))).replace(/^big:/, ''); } catch { picture = ''; }
  visual.setTrack(item.id, picture);
  sceneSince = performance.now();
}

function drawNow() {
  if ($('now').hidden || !current) return;
  const rep = playingRep();
  $('now-big-title').textContent = current.title;
  $('now-big-artist').textContent = nowLine || [current.artist, current.album].filter(Boolean).join(' · ');
  const sound = current.reps.length ? `${rep.label} · ${routed === 'engine' ? `Engine · ${preset}` : 'Direct'}` : rep.label;
  $('now-big-line').textContent = motion && showing !== 'still' && drawn ? `${sound} · drawn at ${drawn}` : sound;
  const quiet = !motion || showing === 'still';
  $('stage').hidden = quiet;
  $('now-still').hidden = !quiet;
  $('now-space').hidden = quiet;
  $('now-why').hidden = !motion; // the reason is given only when the app, not the listener, holds the picture back
  $('now-lock').hidden = !motion;
  $('now-motion').setAttribute('aria-pressed', String(motion));
  $('now-motion').setAttribute('data-state', motion ? 'on' : 'off');
  $('now-motion').setAttribute('aria-label', motion ? 'Animation: on' : 'Animation: off');
  $('motion-on').hidden = !motion;
  $('motion-off').hidden = motion;
  if (quiet) drawCover($('now-art'), current, 320);
}

/** Once a second: may the picture react, how hard, and at what detail. */
async function watch() {
  if ($('now').hidden || !visual || !motion) return;
  const seen = visual.stats();
  const answer = await ask('shows', routed === 'engine' ? 1 : 0, seen.live ? 1 : 0, current && !audio.paused ? 1 : 0);
  if (answer !== showing) { showing = answer; visual.setMode(showing); drawNow(); }
  detailStep = numberOf(await ask('depth', detailStep, seen.millis));
  visual.setStep(detailStep);
  const size = `${seen.width} × ${seen.height}`;
  if (size !== drawn) { drawn = size; drawNow(); }
  if (showing !== 'react') return;
  visual.setMood(numberOf(await ask('moods', seen.energy, seen.tempo)));
  heeding = numberOf(await ask('heeds', heeding, seen.bass, seen.mid, seen.treble));
  visual.setHeed(heeding);
  await turn1(0);
}

/** Ask whether the scene changes now. A cut is also a flash, so it is put to the flash rule before it is made. */
async function turn1(beat) {
  const seen = visual.stats();
  let answer = await ask('scene', (performance.now() - sceneSince) / 1000, beat, seen.boundary ? 1 : 0, sceneLocked ? 1 : calm() ? 2 : 0);
  if (answer === 'stay') return;
  if (answer === 'cut' && !(await mayFlash())) answer = 'blend';
  visual.next(answer);
  sceneSince = performance.now();
}

async function mayFlash() {
  const now = performance.now();
  flashes = flashes.filter((at1) => now - at1 < 1000);
  if (await ask('flash', flashes.length, calm() ? 1 : 0) !== 'allow') return false;
  flashes.push(performance.now());
  return true;
}

function openNow() {
  if (!current) return;
  if (!visual && globalThis.HoloVisuals) {
    visual = globalThis.HoloVisuals.create($('stage'));
    if (visual) {
      if (taps) visual.setTaps(taps[0], taps[1]);
      visual.onbeat = async () => { if (showing !== 'react') return; if (await mayFlash()) visual.pulse(); turn1(1); };
    }
  }
  $('now').hidden = false;
  showing = 'still';
  if (visual) { visual.setMode('still'); faceOf(current); if (motion) visual.start(); }
  drawNow();
  watch();
  watching = setInterval(watch, 1000);
  stir();
}
function closeNow() {
  $('now').hidden = true;
  clearInterval(watching);
  clearTimeout(idle);
  if (visual) visual.stop();
}
// The words and buttons step back when the pointer rests, and return when it moves.
function stir() {
  for (const id of ['now-top', 'now-bottom']) $(id).classList.remove('opacity-0');
  clearTimeout(idle);
  idle = setTimeout(() => { if (motion && showing === 'react') for (const id of ['now-top', 'now-bottom']) $(id).classList.add('opacity-0'); }, 3500);
}
$('now').addEventListener('pointermove', stir);
$('now').addEventListener('pointerdown', stir);
$('now-open').addEventListener('click', openNow);
$('now-close').addEventListener('click', closeNow);
$('now-prev').addEventListener('click', () => previous());
$('now-next').addEventListener('click', () => next(false));
$('now-play').addEventListener('click', () => $('play').click());
$('now-motion').addEventListener('click', () => {
  motion = !motion;
  keep('motion', motion);
  if (visual) { if (motion) { showing = 'still'; visual.setMode('still'); visual.start(); } else visual.stop(); }
  drawNow();
  stir();
  if (motion) watch();
});
$('now-lock').addEventListener('click', () => {
  sceneLocked = !sceneLocked;
  $('now-lock').setAttribute('aria-pressed', String(sceneLocked));
  $('now-lock').setAttribute('data-state', sceneLocked ? 'on' : 'off');
});

buildSound();
drawSaved();
draw();
show('home');
load('home');
