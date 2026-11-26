// sources.js: search and streaming sources that answer a page in a holospace (https, open CORS). No rule lives
// here: which source a song plays from is the model's answer to `picks`. Hands its work to app.js on globalThis.
//
//   audius     the Audius open API: full-length tracks, artists and playlists published for open streaming. It
//              answers any page, a sandboxed one included, so it is the source a holospace can always search.
//   catalogue  the iTunes Search API: every commercial song, artist and album, with artwork and a 30-second
//              preview. Key-free, the same service Holo Music uses to find podcasts. It sends no CORS header to
//              a page with an opaque origin, so in a holospace it does not answer and its shelves stay hidden;
//              it answers where the page has an origin of its own, as in the Hologram host.
//   companion  the Hologram streaming companion (/caps, /sc/search, /sc/stream), ported from Holo Music's
//              holo-stations.js. It exists only inside the Hologram host; in a holospace the probe finds nothing.
(() => {
  const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const plain = (s) => String(s || '').toLowerCase().replace(/\(.*?\)|\[.*?\]/g, ' ').replace(/\b(feat|ft|featuring)\b.*$/, ' ').replace(/[^a-z0-9]+/g, ' ').trim();
  const lead = (artist) => plain(String(artist || '').split(/,|&| x | and /i)[0]);

  // ---- the holospace. A page here has no origin and loads no frame, so two things are asked of the page that holds
  // it: a read of the catalogue (iTunes refuses a page with no origin), and a YouTube or SoundCloud player, which the
  // holospace builds and holds itself. A holospace that offers neither does not answer, and the app goes without.
  const held = globalThis.parent && globalThis.parent !== globalThis ? globalThis.parent : null;
  let asked = 0;
  const waiting = new Map();
  const hearers = new Set();
  globalThis.addEventListener('message', (event) => {
    if (!held || event.source !== held || event.data === null || typeof event.data !== 'object') return;
    const d = event.data;
    if (d.holospacePlayerState && typeof d.holospacePlayerState === 'object') { for (const hear of hearers) hear(d.holospacePlayerState); return; }
    if (!('ok' in d)) return;
    for (const kind of ['holospacePlayer', 'holospaceCatalogue']) {
      const wait = Number.isSafeInteger(d[kind]) ? waiting.get(`${kind}:${d[kind]}`) : null;
      if (!wait) continue;
      waiting.delete(`${kind}:${d[kind]}`);
      if (d.ok) wait.done(d.value); else wait.fail(new Error(String(d.error || 'refused')));
    }
  });
  const shellAsk = (kind, fields, ms = 9000) => new Promise((done, fail) => {
    if (!held) { fail(new Error('no holospace')); return; }
    const id = ++asked;
    waiting.set(`${kind}:${id}`, { done, fail });
    held.postMessage({ [kind]: id, ...fields }, '*');
    setTimeout(() => { if (waiting.delete(`${kind}:${id}`)) fail(new Error('no answer')); }, ms);
  });
  const offered = shellAsk('holospacePlayer', { op: 'offer' }, 700).then((v) => (v && Array.isArray(v.providers) ? v.providers : []), () => []);
  const shell = {
    /** The players this holospace holds: 'youtube', 'soundcloud', or none. */
    players: offered,
    player: (op, fields = {}) => shellAsk('holospacePlayer', { op, ...fields }),
    hear: (hearer) => { hearers.add(hearer); return () => hearers.delete(hearer); },
  };

  // ---- catalogue
  const IT = 'https://itunes.apple.com';
  /** A catalogue read: through the holospace where it offers one, since iTunes refuses a page with no origin. */
  const read = async (url) => ((await offered).length ? JSON.parse(await shellAsk('holospaceCatalogue', { url })) : json(url));
  const readKept = new Map();
  const it = (url) => {
    if (!readKept.has(url)) {
      const answer = read(url);
      readKept.set(url, answer);
      answer.catch(() => readKept.delete(url)); // a failure is not an answer, and is asked again
      if (readKept.size > 300) readKept.delete(readKept.keys().next().value);
    }
    return readKept.get(url);
  };
  const art = (url, size) => String(url || '').replace(/\/\d+x\d+bb\./, `/${size}x${size}bb.`);
  const song = (r) => ({
    id: `it:${r.trackId}`, source: 'catalogue', title: r.trackName, artist: r.artistName, album: r.collectionName || '',
    artistId: r.artistId, albumId: r.collectionId, track: r.trackNumber || null, duration: Math.round((r.trackTimeMillis || 0) / 1000),
    year: r.releaseDate ? Number(String(r.releaseDate).slice(0, 4)) : null, genre: r.primaryGenreName || '',
    cover: (pixels) => Promise.resolve(art(r.artworkUrl100, pixels > 300 ? 1000 : 600)), thumb: art(r.artworkUrl100, 200), preview: r.previewUrl || '', kappa: '', reps: [], unresolved: true,
  });
  const album = (r) => ({
    id: `it-album:${r.collectionId}`, source: 'catalogue', kind: 'Album', name: r.collectionName, artist: r.artistName,
    year: r.releaseDate ? Number(String(r.releaseDate).slice(0, 4)) : null, genre: r.primaryGenreName || '',
    cover: () => Promise.resolve(art(r.artworkUrl100, 600)),
    songs: async () => (await it(`${IT}/lookup?id=${r.collectionId}&entity=song&limit=200`)).results.filter((x) => x.wrapperType === 'track' && x.kind === 'song').map(song)
      .sort((a, b) => (a.track || 999) - (b.track || 999)),
  });
  const artist = (r) => ({
    id: `it-artist:${r.artistId}`, source: 'catalogue', kind: 'Artist', name: r.artistName, artist: r.primaryGenreName || 'Artist', year: null, genre: r.primaryGenreName || '',
    cover: async () => { const top = (await it(`${IT}/lookup?id=${r.artistId}&entity=album&limit=1`)).results.find((x) => x.wrapperType === 'collection'); return top ? art(top.artworkUrl100, 600) : ''; },
    songs: async () => (await it(`${IT}/lookup?id=${r.artistId}&entity=song&limit=30`)).results.filter((x) => x.wrapperType === 'track' && x.kind === 'song').map(song),
    albums: async () => (await it(`${IT}/lookup?id=${r.artistId}&entity=album&limit=24`)).results.filter((x) => x.wrapperType === 'collection').map(album),
  });
  const find = async (entity, term, limit) => (await it(`${IT}/search?media=music&entity=${entity}&limit=${limit}&term=${encodeURIComponent(term)}`)).results;
  const catalogue = {
    songs: async (term, limit = 20) => (await find('song', term, limit)).filter((r) => r.kind === 'song').map(song),
    albums: async (term, limit = 8) => (await find('album', term, limit)).map(album),
    artists: async (term, limit = 6) => (await find('musicArtist', term, limit)).map(artist),
    /** The store's chart of top songs, read through the same lookup so each is a full catalogue song. */
    async chart(limit = 12) {
      const feed = await it(`${IT}/us/rss/topsongs/limit=${limit}/json`);
      const ids = ((feed.feed && feed.feed.entry) || []).map((e) => e.id && e.id.attributes && e.id.attributes['im:id']).filter(Boolean);
      if (!ids.length) return [];
      const found = (await it(`${IT}/lookup?id=${ids.join(',')}`)).results.filter((r) => r.kind === 'song');
      const order = new Map(ids.map((id, i) => [String(id), i]));
      return found.sort((a, b) => order.get(String(a.trackId)) - order.get(String(b.trackId))).map(song);
    },
  };

  // ---- the video for a song. A player needs YouTube's identifier for it. Piped is an open index of YouTube Music:
  // a search for the artist and title, songs only, and the one nearest in length wins, an official "Topic" upload
  // first. This is how Holo Music on Hologram OS finds one. Its public hosts come and go, so each is tried in turn,
  // the one that last answered first. An answer is remembered.
  const PIPED = ['api.piped.private.coffee', 'pipedapi.kavin.rocks', 'pipedapi.adminforge.de', 'pipedapi.leptons.xyz', 'pipedapi.r4fo.com', 'pipedapi.darkness.services', 'pipedapi.phoenix.link'];
  let videos = {};
  try { videos = JSON.parse(localStorage.getItem('holoplay.videos')) || {}; } catch { videos = {}; }
  let pipedFirst = String(videos['piped-host'] || '');
  const timed = async (url, ms) => { const stop = new AbortController(); const t = setTimeout(() => stop.abort(), ms); try { return await json2(url, stop.signal); } finally { clearTimeout(t); } };
  const json2 = async (url, signal) => { const r = await fetch(url, { signal }); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  async function piped(path) {
    const hosts = [pipedFirst, ...PIPED.filter((h) => h !== pipedFirst)].filter(Boolean);
    let last = new Error('no index');
    for (const host of hosts) {
      try {
        const found = await timed(`https://${host}${path}`, 4500);
        if (host !== pipedFirst) { pipedFirst = host; videos['piped-host'] = host; }
        return found;
      } catch (error) { last = error; }
    }
    throw last;
  }
  const idOf = (url) => { const m = /[?&]v=([A-Za-z0-9_-]{11})(?:&|$)/.exec(String(url || '')); return m ? m[1] : ''; };
  const looking = new Map();
  /** YouTube's identifier for a song, or '' when none was found. */
  function video(item) {
    if (videos[item.id]) return Promise.resolve(videos[item.id]);
    if (!looking.has(item.id)) looking.set(item.id, (async () => {
      const term = encodeURIComponent(`${lead(item.artist) ? item.artist : ''} ${item.title}`.trim());
      let items = [];
      try { items = (await piped(`/search?q=${term}&filter=music_songs`)).items || []; } catch { items = []; }
      if (!items.length) { try { items = (await piped(`/search?q=${term}&filter=videos`)).items || []; } catch { items = []; } }
      const want = plain(item.title);
      const who = lead(item.artist);
      let best = ''; let least = Infinity;
      for (const [i, v] of items.entries()) {
        const id = idOf(v.url);
        if (!id || v.isShort) continue;
        const name = plain(v.title);
        let cost = i; // the index's own order counts a little
        if (item.duration && v.duration > 0) cost += Math.abs(v.duration - item.duration) > 600 ? 1000 : Math.abs(v.duration - item.duration) / 2;
        if (!(name.includes(want) || want.includes(name))) cost += 60;
        if (who && !plain(v.uploaderName).includes(who) && !name.includes(who)) cost += 40;
        if (/ - topic$/i.test(String(v.uploaderName || ''))) cost -= 3;
        if (cost < least) { least = cost; best = id; }
      }
      if (best && least < 500) { videos[item.id] = best; try { localStorage.setItem('holoplay.videos', JSON.stringify(videos)); } catch { /* a convenience */ } }
      looking.delete(item.id);
      return least < 500 ? best : '';
    })());
    return looking.get(item.id);
  }

  // ---- audius
  const AU = 'https://api.audius.co/v1';
  const APP = 'app_name=holoplay';
  // An Audius picture lives on several hosts. The page is given every address, the listed one first, so a host that
  // is slow or gone does not leave a tile empty.
  const pictures = (set, size) => {
    const first = set && (set[size] || set['480x480'] || set['150x150']);
    if (!first) return '';
    const path = first.replace(/^https?:\/\/[^/]+/, '');
    return [first, ...((set.mirrors || []).map((host) => host.replace(/\/$/, '') + path))];
  };
  const sized = (set) => (pixels) => Promise.resolve(pictures(set, pixels > 300 ? '1000x1000' : '480x480'));
  const open = (t) => ({
    id: `au:${t.id}`, source: 'audius', title: t.title, artist: (t.user && t.user.name) || '', album: 'Audius', duration: t.duration || 0, genre: t.genre || '',
    cover: sized(t.artwork), thumb: pictures(t.artwork, '150x150'), kappa: '', full: true,
    reps: [{ url: `${AU}/tracks/${t.id}/stream?${APP}`, type: 'audio/mpeg', lossless: 1, bits: 0, kbps: 0, label: 'MP3 · full track' }],
  });
  const playable = (t) => t && t.is_streamable && !t.is_stream_gated && !t.is_delete;
  const tracks = async (path) => ((await json(`${AU}${path}${path.includes('?') ? '&' : '?'}${APP}`)).data || []).filter(playable).map(open);
  const person = (u) => ({
    id: `au-artist:${u.id}`, source: 'audius', kind: 'Artist', name: u.name, artist: u.is_verified ? 'Verified artist' : 'Artist', year: null, genre: 'Audius',
    cover: sized(u.profile_picture),
    songs: () => tracks(`/users/${u.id}/tracks?limit=40&sort=plays`),
  });
  const list = (p) => ({
    id: `au-list:${p.id}`, source: 'audius', kind: p.is_album ? 'Album' : 'Playlist', name: p.playlist_name, artist: (p.user && p.user.name) || '', year: null, genre: 'Audius',
    cover: sized(p.artwork),
    songs: () => tracks(`/playlists/${p.id}/tracks`),
  });
  const entries = async (path, make) => ((await json(`${AU}${path}&${APP}`)).data || []).map(make);
  const audius = {
    artists: (term, limit = 6) => entries(`/users/search?query=${encodeURIComponent(term)}&limit=${limit}`, person),
    playlists: (term, limit = 6) => entries(`/playlists/search?query=${encodeURIComponent(term)}&limit=${limit}`, list),
    hot: (limit = 6) => entries(`/playlists/trending?limit=${limit}`, list),
    search: async (term, limit = 12) => ((await json(`${AU}/tracks/search?query=${encodeURIComponent(term)}&limit=${limit}&${APP}`)).data || []).filter(playable).map(open),
    trending: async (limit = 12) => ((await json(`${AU}/tracks/trending?limit=${limit}&${APP}`)).data || []).filter(playable).map(open),
    /** A full-length copy of a catalogue song, accepted only when title, lead artist and length all agree. */
    async match(item) {
      try {
        const found = (await json(`${AU}/tracks/search?query=${encodeURIComponent(`${lead(item.artist)} ${plain(item.title)}`)}&limit=8&${APP}`)).data || [];
        const hit = found.filter(playable).find((t) => plain(t.title) === plain(item.title)
          && (plain(t.user && t.user.name).includes(lead(item.artist)) && lead(item.artist).length > 1)
          && Math.abs((t.duration || 0) - item.duration) <= 8);
        return hit ? open(hit).reps[0] : null;
      } catch { return null; }
    },
  };

  // ---- companion
  let caps = null;
  const companion = {
    /** What the host can do. A holospace has no host to ask, so the answer there is nothing. */
    async probe() {
      if (caps) return caps;
      try { const r = await fetch('/caps', { cache: 'no-store' }); caps = r.ok ? await r.json() : {}; } catch { caps = {}; }
      return caps;
    },
    present: () => Boolean(caps && caps.soundcloud),
    async match(item) {
      if (!companion.present()) return null;
      try {
        const r = await fetch(`/sc/search?q=${encodeURIComponent(`${item.artist} ${item.title}`)}&n=5`);
        const found = await r.json();
        const entries = ((found && found.entries) || []).filter((e) => e.webpage_url || e.url);
        const hit = entries.find((e) => !item.duration || Math.abs(Math.round(e.duration || 0) - item.duration) <= 8);
        if (!hit) return null;
        const page = hit.webpage_url || hit.url;
        return companion.stream(page);
      } catch { return null; }
    },
    /** Any page the host's resolver can open, as one representation. It is the page's own origin there, so readable. */
    stream: (page) => ({ url: `/sc/stream?url=${encodeURIComponent(page)}`, type: 'audio/webm', lossless: 1, bits: 0, kbps: 0, label: 'Hologram host · full track' }),
    async search(term, limit = 12) {
      const found = await (await fetch(`/sc/search?q=${encodeURIComponent(term)}&n=${limit}`)).json();
      return ((found && found.entries) || []).filter((e) => e.webpage_url || e.url).map((e) => {
        const page = e.webpage_url || e.url;
        const pictures = e.thumbnails || [];
        const picture = (pictures[pictures.length - 1] || {}).url || e.thumbnail || '';
        return { id: `sc:${page}`, source: 'soundcloud', title: e.title || 'Track', artist: (e.artists && e.artists[0]) || e.uploader || '', album: 'SoundCloud', duration: Math.round(e.duration || 0),
          cover: () => Promise.resolve(picture), thumb: picture, kappa: '', full: true, reps: [companion.stream(page)] };
      });
    },
  };

  // ---- radio: the Radio Browser directory, ported from holo-stations.js. Only https streams a browser plays itself.
  const RB = ['https://de1.api.radio-browser.info', 'https://nl1.api.radio-browser.info', 'https://at1.api.radio-browser.info', 'https://fi1.api.radio-browser.info'];
  let rbHost = '';
  async function rb(path) {
    let error;
    for (const host of rbHost ? [rbHost, ...RB.filter((h) => h !== rbHost)] : RB) {
      try { const found = await json(host + path); rbHost = host; return found; } catch (e) { error = e; }
    }
    throw error || new Error('radio directory unreachable');
  }
  const secure = (url) => (/^https:\/\//i.test(url || '') ? url : '');
  const station = (s) => {
    const codec = String(s.codec || '').toUpperCase();
    const tags = String(s.tags || '').split(',').map((t) => t.trim()).filter(Boolean).slice(0, 3).join(' · ');
    return {
      id: `radio:${s.stationuuid}`, source: 'radio', station: s.stationuuid, title: String(s.name || '').trim() || 'Unnamed station', artist: s.country || 'Radio', album: tags, duration: 0, live: true,
      cover: () => Promise.resolve(secure(s.favicon)), thumb: secure(s.favicon), kappa: '',
      // The engine is tried first, so a station that lets the page read its samples can be heard through it and
      // seen. One that refuses plays direct, exactly as sent.
      reps: [{ url: s.url_resolved || s.url, type: '', lossless: 1, bits: 0, kbps: s.bitrate || 0, label: [codec, s.bitrate ? `${s.bitrate}k` : ''].filter(Boolean).join(' ') || 'Live stream' }],
    };
  };
  const playableStation = (s) => secure(s.url_resolved || s.url) && !s.hls;
  const stationsOf = async (query, limit) => (await rb(`/json/stations/search?hidebroken=true&is_https=true&order=clickcount&reverse=true&limit=${limit}&${query}`)).filter(playableStation).map(station);
  const radio = {
    top: (limit = 40) => stationsOf('', limit),
    search: (term, limit = 30) => stationsOf(`name=${encodeURIComponent(term)}`, limit),
    byTag: (tag, limit = 40) => stationsOf(`tagList=${encodeURIComponent(tag)}`, limit),
    /** Tell the directory a station was played, as it asks of the apps that use it. */
    click: (uuid) => rb(`/json/url/${uuid}`).catch(() => null),
  };

  // ---- curated channels: SomaFM. Its streams let a page read them, so they can reach the engine.
  const somaRep = (id, rate) => ({ url: `https://ice1.somafm.com/${id}-${rate}-mp3`, type: 'audio/mpeg', lossless: 1, bits: 0, kbps: rate, label: `MP3 ${rate}k` });
  const channel = (c) => ({
    id: `soma:${c.id}`, source: 'soma', channel: c.id, title: c.title, artist: 'SomaFM', album: c.genre || c.description || '', duration: 0, live: true,
    cover: () => Promise.resolve(c.xlimage || c.largeimage || c.image || ''), thumb: c.image || c.largeimage || '', kappa: '',
    reps: [somaRep(c.id, 128), somaRep(c.id, 256)], // the model ranks them: 256 first, 128 if that one will not stream
  });
  const soma = {
    channels: async () => ((await json('https://somafm.com/channels.json')).channels || []).map(channel),
    async nowPlaying(id) {
      try { const song = ((await json(`https://somafm.com/songs/${id}.json`)).songs || [])[0]; return song ? [song.artist, song.title].filter(Boolean).join(' · ') : ''; } catch { return ''; }
    },
  };

  // ---- podcasts: the fyyd directory answers a sandboxed page and lists each show's episodes itself, so no feed has
  // to be read across origins. (Holo Music uses iTunes for this, which does not answer here.)
  const FY = 'https://api.fyyd.de/0.2';
  // A show's picture is its publisher's original, often 3000 pixels square. It is marked `big:` so the page redraws
  // it at the size it is shown, sharp but small in memory, instead of holding dozens of originals at once.
  const big = (url) => (url ? `big:${url}` : '');
  const episode = (show, art) => (e) => ({
    id: `ep:${e.id}`, source: 'podcast', title: e.title || 'Episode', artist: show, album: String(e.pubdate || '').slice(0, 10), duration: Number(e.duration) || 0, resumable: true,
    cover: () => Promise.resolve(big(art)), art, thumb: '', kappa: '',
    // The publisher's own file. The engine is tried first; a host that refuses plays it direct, untouched.
    reps: [{ url: e.enclosure, type: e.content_type || 'audio/mpeg', lossless: 1, bits: 0, kbps: 0, label: 'Publisher’s file' }],
  });
  const showOf = (p) => {
    const art = secure(p.imgURL) || ''; // the publisher's own picture; the directory's copies refuse other sites
    return {
      id: `pod:${p.id}`, source: 'podcast', kind: 'Podcast', name: p.title, artist: p.author || '', year: null, genre: '',
      cover: () => Promise.resolve(big(art)),
      songs: async () => (((await json(`${FY}/podcast/episodes?podcast_id=${p.id}&count=50`)).data || {}).episodes || []).filter((e) => secure(e.enclosure)).map(episode(p.title, art)),
    };
  };
  const podcasts = {
    search: async (term, limit = 12) => ((await json(`${FY}/search/podcast?title=${encodeURIComponent(term)}&count=${limit}`)).data || []).map(showOf),
    hot: async (limit = 18) => ((await json(`${FY}/feature/podcast/hot?count=${limit}&language=en`)).data || []).map(showOf),
  };

  const preview = (item) => (item.preview ? { url: item.preview, type: 'audio/mp4', lossless: 1, bits: 0, kbps: 0, label: 'Preview · AAC · 30 seconds', preview: true } : null);

  // ---- charts: what is popular now, shown the moment the app opens.
  //   world   ListenBrainz, an open record of what its listeners played: the week's most played songs and albums
  //           across all music. Names only; a song plays where a source has it. Covers come from the Cover Art
  //           Archive, and an album's tracks from MusicBrainz.
  //   audius  what is trending there this week and of all time. These play in full.
  // Apple's and Deezer's charts send no CORS header to any page, so they cannot be read here.
  // Each chart keeps its last answer, so the next visit draws at once and then refreshes.
  const kept = (key, fetchRows, make) => ({
    make,
    now: () => { try { return JSON.parse(localStorage.getItem(`holoplay.chart.${key}`)) || []; } catch { return []; } },
    fresh: async () => { const rows = await fetchRows(); try { localStorage.setItem(`holoplay.chart.${key}`, JSON.stringify(rows)); } catch { /* a convenience */ } return rows; },
  });
  const LB = 'https://api.listenbrainz.org/1/stats/sitewide';
  // ---- pictures for chart entries. Two sources, so one being out of reach does not leave a shelf of icons:
  //   the Cover Art Archive   the release's own cover. It is kept on archive.org, which some networks cannot reach.
  //   TheAudioDB              the album's cover by its MusicBrainz id, or failing that a picture of the artist.
  // Every answer is remembered, and once the archive has failed it is skipped for six hours, so tiles fill at once.
  const ADB = 'https://www.theaudiodb.com/api/v1/json/123';
  let pictures1 = {};
  try { pictures1 = JSON.parse(localStorage.getItem('holoplay.pictures')) || {}; } catch { pictures1 = {}; }
  let archiveDown = Number(pictures1['archive-down'] || 0) > Date.now() - 6 * 3600000;
  const remember = (key, value) => { pictures1[key] = value; try { localStorage.setItem('holoplay.pictures', JSON.stringify(pictures1)); } catch { /* a convenience */ } };
  const lanes1 = [Promise.resolve(), Promise.resolve(), Promise.resolve()];
  let lane1 = 0;
  const lookedUp = new Map();
  /** Three lookups at a time, each answer remembered: the service allows only so many a minute. */
  function lookup(key, path, pick) {
    if (pictures1[key]) return Promise.resolve(pictures1[key]);
    if (!lookedUp.has(key)) {
      const mine = lane1++ % lanes1.length;
      const made = lanes1[mine].then(async () => {
        try {
          const found = pick(await json(`${ADB}/${path}`));
          if (found) remember(key, found);
          return found || '';
        } catch { return ''; }
      });
      lanes1[mine] = made;
      lookedUp.set(key, made);
    }
    return lookedUp.get(key);
  }
  const fitted = (url, pixels) => (url && pixels <= 300 ? `${url}/medium` : url);
  const albumPicture = (group, pixels) => () => (group ? lookup(`album:${group}`, `album-mb.php?i=${group}`, (d) => ((d.album || [])[0] || {}).strAlbumThumb).then((url) => fitted(url, pixels)) : Promise.resolve(''));
  const artistPicture = (artistId, pixels) => () => (artistId ? lookup(`artist:${artistId}`, `artist-mb.php?i=${artistId}`, (d) => ((d.artists || [])[0] || {}).strArtistThumb).then((url) => fitted(url, pixels)) : Promise.resolve(''));
  const leadName = (artist) => String(artist || '').split(/,| feat\.? | ft\.? | & | x | with /i)[0].trim();
  const namedPicture = (artist, pixels) => () => { const name = leadName(artist); return name ? lookup(`name:${name.toLowerCase()}`, `search.php?s=${encodeURIComponent(name)}`, (d) => ((d.artists || [])[0] || {}).strArtistThumb).then((url) => fitted(url, pixels)) : Promise.resolve(''); };
  /** A chart entry's picture: each place to look, in order. The page tries them in turn. */
  const coverOf = (r) => (pixels) => Promise.resolve([
    !archiveDown && r.release ? `https://coverartarchive.org/release/${r.release}/front-${pixels > 300 ? 500 : 250}` : '',
    albumPicture(r.group, pixels),
    artistPicture(r.artistId, pixels),
    namedPicture(r.artist, pixels),
  ].filter(Boolean));
  /** The page reports a picture that would not load; an archive failure is remembered. */
  const missed = (url) => { if (typeof url === 'string' && url.includes('coverartarchive.org') && !archiveDown) { archiveDown = true; remember('archive-down', Date.now()); } };
  const worldSong = (r) => ({
    id: `chart:${r.id}`, source: 'chart', title: r.title, artist: r.artist, album: r.album || '', duration: r.seconds || 0, track: r.track || null,
    cover: coverOf(r), thumb: '', kappa: '', preview: '', reps: [], unresolved: true,
  });
  const worldAlbum = (r) => ({
    id: `chart-album:${r.id}`, source: 'chart', kind: 'Album', name: r.title, artist: r.artist, year: null, genre: '',
    cover: coverOf(r),
    songs: async () => {
      const found = await json(`https://musicbrainz.org/ws/2/release/${r.release}?inc=recordings&fmt=json`);
      return (found.media || []).flatMap((disc) => disc.tracks || []).map((t, i) => worldSong({
        id: (t.recording && t.recording.id) || `${r.release}:${i}`, title: t.title, artist: r.artist, album: r.title, release: r.release, group: r.id, artistId: r.artistId, seconds: Math.round((t.length || 0) / 1000), track: i + 1 }));
    },
  });
  const spread = (rows, each) => { // a chart is truthful, but a shelf of one artist is dull: at most two entries each
    const seen = new Map();
    return rows.filter((row) => { const n = (seen.get(row.artist) || 0) + 1; seen.set(row.artist, n); return n <= each; });
  };
  const slim = (t) => ({ id: t.id, title: t.title, user: { name: t.user && t.user.name }, duration: t.duration, genre: t.genre, artwork: t.artwork, is_streamable: true });
  const charts = {
    trending: kept('trending', async () => ((await json(`${AU}/tracks/trending?time=week&limit=18&${APP}`)).data || []).filter(playable).slice(0, 12).map(slim), open),
    classics: kept('classics', async () => ((await json(`${AU}/tracks/trending?time=allTime&limit=18&${APP}`)).data || []).filter(playable).slice(0, 12).map(slim), open),
    songs: kept('songs2', async () => spread((((await json(`${LB}/recordings?range=week&count=60`)).payload || {}).recordings || [])
      .map((r) => ({ id: r.recording_mbid || `${r.artist_name}:${r.track_name}`, title: r.track_name, artist: r.artist_name, album: r.release_name, release: r.caa_release_mbid || r.release_mbid || '', artistId: (r.artist_mbids || [])[0] || '' })), 2).slice(0, 12), worldSong),
    albums: kept('albums2', async () => {
      const seen = new Set();
      return spread((((await json(`${LB}/release-groups?range=week&count=60`)).payload || {}).release_groups || [])
        .filter((r) => r.caa_release_mbid && !seen.has(r.release_group_mbid) && seen.add(r.release_group_mbid))
        .map((r) => ({ id: r.release_group_mbid, group: r.release_group_mbid, title: r.release_group_name, artist: r.artist_name, release: r.caa_release_mbid, artistId: (r.artist_mbids || [])[0] || '' })), 2).slice(0, 12);
    }, worldAlbum),
  };

  // ---- the whole catalogue: MusicBrainz, the open record of released music. It answers a sandboxed page, so a
  // search here covers what iTunes covers in Holo Music: every song, artist and album. It names recordings; a
  // song then plays where a source has it. It asks for no more than about one request a second, so requests wait
  // their turn and a refusal is tried once more.
  const MB = 'https://musicbrainz.org/ws/2';
  const pause = (ms) => new Promise((done) => setTimeout(done, ms));
  let mbTurn = Promise.resolve();
  let mbLast = 0;
  function mb(path) {
    const run = mbTurn.then(async () => {
      for (let attempt = 0; attempt < 3; attempt++) {
        const wait = 420 - (Date.now() - mbLast);
        if (wait > 0) await pause(wait);
        mbLast = Date.now();
        const r = await fetch(`${MB}/${path}`);
        if (r.status === 503 || r.status === 429) { await pause(1100); continue; }
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      }
      throw new Error('busy');
    });
    mbTurn = run.catch(() => {});
    return run;
  }
  const credit = (r) => (r['artist-credit'] || []).map((c) => (c.name || '') + (c.joinphrase || '')).join('') || '';
  const recorded = (r, artistId) => {
    const release = (r.releases || [])[0] || {};
    return worldSong({ id: r.id, title: r.title, artist: credit(r), album: release.title || '', release: release.id || '',
      group: (release['release-group'] || {}).id || '', artistId: artistId || (((r['artist-credit'] || [])[0] || {}).artist || {}).id || '', seconds: Math.round((r.length || 0) / 1000) });
  };
  const unique = (songs) => { const seen = new Set(); return songs.filter((s) => { const k = `${s.title.toLowerCase()}|${s.artist.toLowerCase()}`; return !seen.has(k) && seen.add(k); }); };
  const songsBy = async (artistId) => unique(((await mb(`recording?query=${encodeURIComponent(`arid:${artistId} AND video:false AND status:official`)}&limit=60&fmt=json`)).recordings || []).map((r) => recorded(r, artistId)));
  const albumOf = (g, artistName, artistId) => ({
    id: `mb-album:${g.id}`, source: 'chart', kind: g['primary-type'] || 'Album', name: g.title, artist: artistName, year: Number(String(g['first-release-date'] || '').slice(0, 4)) || null, genre: '',
    cover: coverOf({ group: g.id, artistId, artist: artistName, release: '' }),
    songs: async () => {
      const release = ((await mb(`release-group/${g.id}?inc=releases&fmt=json`)).releases || []).find((x) => x.status === 'Official') || {};
      if (!release.id) return [];
      const found = await mb(`release/${release.id}?inc=recordings&fmt=json`);
      return (found.media || []).flatMap((disc) => disc.tracks || []).map((t, i) => worldSong({
        id: (t.recording && t.recording.id) || `${release.id}:${i}`, title: t.title, artist: artistName, album: g.title, release: release.id, group: g.id, artistId, seconds: Math.round((t.length || 0) / 1000), track: i + 1 }));
    },
  });
  const kindRank = (g) => ['Album', 'EP', 'Single'].indexOf(g['primary-type']); // albums first, then EPs, then singles
  const later = (song) => (/\b(live|remix|mix|edit|version)\b/i.test(`${song.title} ${song.album}`) ? 1 : 0); // studio takes before live sets and remixes
  const albumsBy = async (artistId, artistName) => ((await mb(`release-group?artist=${artistId}&limit=100&fmt=json`))['release-groups'] || [])
    .filter((g) => ['Album', 'EP', 'Single'].includes(g['primary-type']) && !(g['secondary-types'] || []).length)
    .sort((a, b) => kindRank(a) - kindRank(b) || String(b['first-release-date'] || '').localeCompare(String(a['first-release-date'] || '')))
    .filter((g, i, all) => all.findIndex((x) => x.title.toLowerCase() === g.title.toLowerCase()) === i) // one tile a title
    .map((g) => albumOf(g, artistName, artistId));
  const artistOf = (a) => ({
    id: `mb-artist:${a.id}`, source: 'chart', kind: 'Artist', name: a.name, artist: a.disambiguation || (a.area && a.area.name) || 'Artist', year: null, genre: '',
    cover: coverOf({ artistId: a.id, artist: a.name, release: '', group: '' }),
    songs: () => songsBy(a.id), albums: () => albumsBy(a.id, a.name),
  });
  const world = {
    /** One search: the artists it names, and the songs and albums of the one it names best, or songs by title. */
    async search(term) {
      const artists = ((await mb(`artist?query=${encodeURIComponent(term)}&limit=6&fmt=json`)).artists || []);
      const lead = artists[0] && artists[0].score >= 90 ? artists[0] : null;
      return {
        artists: artists.filter((a) => a.score >= 60).map(artistOf),
        songs: lead ? songsBy(lead.id).then((list) => list.sort((x, y) => later(x) - later(y)).slice(0, 24))
          : mb(`recording?query=${encodeURIComponent(`recording:"${term}" AND video:false`)}&limit=24&fmt=json`).then((d) => unique((d.recordings || []).map((r) => recorded(r)))),
        albums: lead ? albumsBy(lead.id, lead.name).then((list) => list.slice(0, 12)) : Promise.resolve([]),
      };
    },
  };

  // ---- categories: a mood or a genre, as what is trending in it this week on Audius. These play in full.
  const MOODS = [
    ['Focus', 'target', ['Lo-Fi', 'Ambient', 'Downtempo']],
    ['Energy', 'zap', ['Drum & Bass', 'House', 'Techno']],
    ['Chill', 'coffee', ['Downtempo', 'Lo-Fi', 'Acoustic']],
    ['Night', 'moon', ['Deep House', 'Ambient', 'Jazz']],
    ['Discover', 'sparkles', []],
  ];
  const GENRES = ['Pop', 'Hip-Hop/Rap', 'Rock', 'Electronic', 'House', 'Techno', 'R&B/Soul', 'Alternative', 'Lo-Fi', 'Ambient', 'Jazz', 'Latin', 'Country', 'Classical', 'Reggae', 'Drum & Bass', 'Dubstep', 'Folk'];
  const ofGenre = (genre, limit) => tracks(`/tracks/trending?genre=${encodeURIComponent(genre)}&time=week&limit=${limit}`);
  function category(name, kind, load) {
    let found = null;
    const songs = () => (found = found || load().catch((error) => { found = null; throw error; }));
    return { id: `mix:${name}`, source: 'audius', kind, name, artist: 'Trending this week', year: null, genre: '',
      cover: (pixels) => songs().then((list) => (list[0] ? list[0].cover(pixels) : '')).catch(() => ''), songs };
  }
  const categories = {
    moods: MOODS.map(([name, icon, genres]) => ({ name, icon, entry: category(name, 'Mood', async () => {
      if (!genres.length) return tracks('/tracks/trending/underground?limit=40');
      const lists = await Promise.all(genres.map((g) => ofGenre(g, 14).catch(() => [])));
      const mixed = []; // one from each genre in turn, so the mood is a blend and not three blocks
      for (let i = 0; i < 14; i++) for (const list of lists) if (list[i]) mixed.push(list[i]);
      return mixed;
    }) })),
    genres: GENRES.map((name) => ({ name, entry: category(name, 'Genre', () => ofGenre(name, 40)) })),
  };

  globalThis.HoloSources = { catalogue, audius, companion, preview, radio, soma, podcasts, big, charts, missed, categories, world, shell, video };
})();
