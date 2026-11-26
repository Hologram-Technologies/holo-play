// library.js: where audio comes from. No rule of the app lives here: which representation plays, and through what,
// is the model's answer. Scripts never import each other, so this file hands its work to app.js on globalThis.
//
// Two sources in this phase:
//   bundled   the Hologram CC0 library (apps/music/music in Hologram-Technologies/hologram-apps). Each track is named
//             by the SHA-256 of its bytes, taken from that library's own catalogue (library.json), so the player can
//             check the bytes it fetched before it plays them. The location is not trusted; the address is.
//   archive   the Internet Archive's open search and metadata API, ported from Holo Music's holo-stations.js. Every
//             playable representation of a track is kept, so the model can rank them.
(() => {
  const BUNDLED = 'https://raw.githubusercontent.com/Hologram-Technologies/hologram-apps/main/apps/music/';
  const ALBUMS = [
    { name: 'Kappa Sessions', artist: 'Hologram Collective', year: 2025, genre: 'Chiptune', tracks: [
      ['Boot Chime', 'music/Hologram Collective/Kappa Sessions/01 - Boot Chime.wav', '758a2ad5cd9512ae347efdb1ec0bb3f67d9a9071d193e64f6125ad0541afee7f', 11],
      ['Kappa Groove', 'music/Hologram Collective/Kappa Sessions/02 - Kappa Groove.wav', '3f7ef97d8f16bc5231ccddf6ec7c7fdc12b85377752c2fe1478656150586173c', 11],
      ['Content Address', 'music/Hologram Collective/Kappa Sessions/03 - Content Address.wav', 'b2e5bef4fdb398147c9e36af427cbe385c14153f755ee9f113416c065ed55fb2', 13],
      ['Merkle Dance', 'music/Hologram Collective/Kappa Sessions/04 - Merkle Dance.wav', '9a68453f141d66fe138ef33d709e8cf359bcf896070049d8b5834832704a92a6', 11]] },
    { name: 'Law L5', artist: 'The Content Address', year: 2025, genre: 'Synthwave', tracks: [
      ['Re-derive', 'music/The Content Address/Law L5/01 - Re-derive.wav', '8be5cb42d0e06fde21b80eef06a4f96e0b3f8635d396ce41f02cc2de2d41b1ed', 9],
      ['Sealed Bytes', 'music/The Content Address/Law L5/02 - Sealed Bytes.wav', 'd89bee015342dd878c68a4f65ee2040b940ec79ba42a3ec58768b5070e9c9a14', 9],
      ['Verified at Rest', 'music/The Content Address/Law L5/03 - Verified at Rest.wav', 'a8b7da68912b5330139c5abd74b69fd4b03e42a42a4e5efdd34adf69381aba3f', 11],
      ['Forge Refused', 'music/The Content Address/Law L5/04 - Forge Refused.wav', '5fefbce6cccb9e1856cc7838e7e931a930a52ab8ed56c1eca5b7ceea05ec6a20', 9]] },
    { name: 'Verifiable Dawn', artist: 'Merkle Forest', year: 2025, genre: 'Ambient', tracks: [
      ['Quiet Root', 'music/Merkle Forest/Verifiable Dawn/01 - Quiet Root.wav', '72815ca36307aba3ea0b427b2a17780238f71cf73db6e59087c112f162974df3', 14],
      ['Branch & Leaf', 'music/Merkle Forest/Verifiable Dawn/02 - Branch & Leaf.wav', '431c5bcf205bbbaa41f733844a859314a8689df515ba67b3c4395753ec460349', 11],
      ['Proof of Light', 'music/Merkle Forest/Verifiable Dawn/03 - Proof of Light.wav', '0c139113742d13b894b0ea370c1ef8150bd0a58f9133aa1f29b11e2396b06e66', 11]] },
  ];
  const folder = (path) => path.slice(0, path.lastIndexOf('/'));

  // The cover is an SVG kept beside the tracks. It is fetched and handed to the page as a blob, since the host that
  // serves it does not label it as an image.
  const covers = new Map();
  function bundledCover(album) {
    const url = BUNDLED + encodeURI(`${folder(album.tracks[0][1])}/cover.svg`);
    if (!covers.has(url)) {
      covers.set(url, fetch(url).then((r) => (r.ok ? r.text() : Promise.reject(new Error('no cover'))))
        .then((svg) => URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))).catch(() => ''));
    }
    return covers.get(url);
  }

  function bundled() {
    return ALBUMS.map((album) => ({
      id: `bundled:${album.name}`, source: 'bundled', name: album.name, artist: album.artist, year: album.year, genre: album.genre,
      cover: () => bundledCover(album),
      songs: () => Promise.resolve(album.tracks.map(([title, path, hash, seconds], i) => ({
        id: `bundled:${hash}`, source: 'bundled', title, artist: album.artist, album: album.name, track: i + 1, duration: seconds,
        cover: () => bundledCover(album), kappa: `sha256:${hash}`,
        reps: [{ url: BUNDLED + encodeURI(path), type: 'audio/wav', lossless: 2, bits: 16, kbps: 706, label: 'WAV · lossless 16-bit' }],
      }))),
    }));
  }

  // ---- Internet Archive
  const IA = 'https://archive.org';
  const json = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`HTTP ${r.status}`); return r.json(); };
  const image = (id) => `${IA}/services/img/${encodeURIComponent(id)}`;
  const first = (v) => (Array.isArray(v) ? v[0] : v) || '';
  const year = (v) => { const n = parseInt(String(v || '').slice(0, 4), 10); return Number.isFinite(n) ? n : null; };
  const seconds = (v) => {
    if (v == null) return 0;
    const s = String(v).trim();
    if (/^[\d.]+$/.test(s)) return Math.round(Number(s));
    return s.includes(':') ? s.split(':').map(Number).reduce((a, b) => a * 60 + (b || 0), 0) : 0;
  };
  const ext = (name) => (String(name).split('.').pop() || '').toLowerCase();
  const PLAYABLE = /^(flac|mp3|m4a|aac|ogg|oga|opus|wav)$/;
  const TYPES = { flac: 'audio/flac', mp3: 'audio/mpeg', m4a: 'audio/mp4', aac: 'audio/aac', ogg: 'audio/ogg', oga: 'audio/ogg', opus: 'audio/ogg', wav: 'audio/wav' };

  /** One file of an item as a representation the model can rank: its class, bit depth and bitrate, and a true label. */
  function representation(identifier, file) {
    const e = ext(file.name);
    const format = String(file.format || '');
    const rate = parseInt(file.bitrate, 10) || 0;
    const lossless = e === 'flac' || e === 'wav' || (e === 'm4a' && /lossless|alac/i.test(format));
    const bits = lossless ? (/24/.test(format) ? 24 : 16) : 0;
    const name = e === 'm4a' && lossless ? 'ALAC' : e.toUpperCase();
    const label = lossless ? `${name} · lossless ${bits}-bit` : `${name}${rate ? ` ${rate}k` : ''}`;
    const path = file.name.split('/').map(encodeURIComponent).join('/');
    return { url: `${IA}/download/${encodeURIComponent(identifier)}/${path}`, type: TYPES[e] || 'audio/mpeg', lossless: lossless ? 2 : 1, bits, kbps: rate, label };
  }

  const album = (doc, kind = 'Concert') => ({
    id: `ia:${doc.identifier}`, source: 'archive', kind, identifier: doc.identifier, name: doc.title || doc.identifier,
    artist: first(doc.creator) || (kind === 'Item' ? '' : 'Unknown'), year: year(doc.year), genre: 'Internet Archive',
    cover: () => Promise.resolve(image(doc.identifier)),
    songs: () => songs(doc.identifier, kind === 'Audiobook'),
  });

  async function search(query, rows, kind) {
    const fields = ['identifier', 'title', 'creator', 'year'].map((f) => `fl[]=${f}`).join('&');
    const found = await json(`${IA}/advancedsearch.php?q=${encodeURIComponent(query)}&${fields}&sort[]=downloads+desc&rows=${rows}&output=json`);
    return ((found.response && found.response.docs) || []).map((doc) => album(doc, kind));
  }

  /** LibriVox recordings, public-domain audiobooks read by volunteers, as the Internet Archive keeps them. */
  const books = (term, rows = 12) => search(`collection:(librivoxaudio)${term ? ` AND (title:(${term}) OR creator:(${term}))` : ''}`, rows, 'Audiobook');
  const item = (identifier) => album({ identifier }, 'Item');

  /** The Live Music Archive's most played lossless concerts: recordings the bands allow to be shared. */
  const concerts = (rows = 8) => search('collection:(etree) AND format:(Flac) AND mediatype:(etree)', rows, 'Concert');

  async function songs(identifier, resumable) {
    const item = await json(`${IA}/metadata/${encodeURIComponent(identifier)}`);
    const meta = item.metadata || {};
    const groups = new Map(); // a track's key, then every playable file made from it
    for (const file of item.files || []) {
      if (!file.name || !PLAYABLE.test(ext(file.name))) continue;
      const key = (file.original || file.name).replace(/\.[^.]+$/, '').toLowerCase();
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(file);
    }
    const cover = () => Promise.resolve(image(identifier));
    return [...groups.values()].map((files) => {
      const named = files.find((f) => f.title) || files[0];
      return {
        id: `ia:${identifier}/${named.name}`, source: 'archive',
        title: named.title || named.name.replace(/\.[^.]+$/, '').replace(/^\d+\s*[-.]\s*/, ''),
        artist: named.artist || first(meta.creator) || 'Unknown', album: first(meta.title) || identifier,
        track: parseInt(named.track, 10) || null, duration: Math.max(...files.map((f) => seconds(f.length))),
        cover, kappa: '', resumable: Boolean(resumable), reps: files.map((f) => representation(identifier, f)),
      };
    }).sort((a, b) => (a.track || 999) - (b.track || 999) || a.title.localeCompare(b.title));
  }

  globalThis.HoloLibrary = { bundled, concerts, books, item };
})();
