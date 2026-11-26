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

  // ---- catalogue
  const IT = 'https://itunes.apple.com';
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
    songs: async () => (await json(`${IT}/lookup?id=${r.collectionId}&entity=song&limit=200`)).results.filter((x) => x.wrapperType === 'track' && x.kind === 'song').map(song)
      .sort((a, b) => (a.track || 999) - (b.track || 999)),
  });
  const artist = (r) => ({
    id: `it-artist:${r.artistId}`, source: 'catalogue', kind: 'Artist', name: r.artistName, artist: r.primaryGenreName || 'Artist', year: null, genre: r.primaryGenreName || '',
    cover: async () => { const top = (await json(`${IT}/lookup?id=${r.artistId}&entity=album&limit=1`)).results.find((x) => x.wrapperType === 'collection'); return top ? art(top.artworkUrl100, 600) : ''; },
    songs: async () => (await json(`${IT}/lookup?id=${r.artistId}&entity=song&limit=30`)).results.filter((x) => x.wrapperType === 'track' && x.kind === 'song').map(song),
    albums: async () => (await json(`${IT}/lookup?id=${r.artistId}&entity=album&limit=24`)).results.filter((x) => x.wrapperType === 'collection').map(album),
  });
  const find = async (entity, term, limit) => (await json(`${IT}/search?media=music&entity=${entity}&limit=${limit}&term=${encodeURIComponent(term)}`)).results;
  const catalogue = {
    songs: async (term, limit = 20) => (await find('song', term, limit)).filter((r) => r.kind === 'song').map(song),
    albums: async (term, limit = 8) => (await find('album', term, limit)).map(album),
    artists: async (term, limit = 6) => (await find('musicArtist', term, limit)).map(artist),
    /** The store's chart of top songs, read through the same lookup so each is a full catalogue song. */
    async chart(limit = 12) {
      const feed = await json(`${IT}/us/rss/topsongs/limit=${limit}/json`);
      const ids = ((feed.feed && feed.feed.entry) || []).map((e) => e.id && e.id.attributes && e.id.attributes['im:id']).filter(Boolean);
      if (!ids.length) return [];
      const found = (await json(`${IT}/lookup?id=${ids.join(',')}`)).results.filter((r) => r.kind === 'song');
      const order = new Map(ids.map((id, i) => [String(id), i]));
      return found.sort((a, b) => order.get(String(a.trackId)) - order.get(String(b.trackId))).map(song);
    },
  };

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
      // A station's own server rarely lets a page read its samples, so it plays direct, exactly as sent.
      reps: [{ url: s.url_resolved || s.url, type: '', lossless: 1, bits: 0, kbps: s.bitrate || 0, label: [codec, s.bitrate ? `${s.bitrate}k` : ''].filter(Boolean).join(' ') || 'Live stream', unreadable: true }],
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
    // The publisher's own file, untouched. It is served through redirects that do not let a page read it.
    reps: [{ url: e.enclosure, type: e.content_type || 'audio/mpeg', lossless: 1, bits: 0, kbps: 0, label: 'Publisher’s file', unreadable: true }],
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

  globalThis.HoloSources = { catalogue, audius, companion, preview, radio, soma, podcasts, big };
})();
