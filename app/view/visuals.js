// visuals.js: Holo Play's own picture of the sound. It is written for this app, in the page, with WebGL 2: nothing
// is compiled and nothing is fetched. It follows the way MilkDrop and projectM draw: each frame is the last frame,
// warped a little and dimmed a little, with the waveform of the sound drawn on top, so motion is the sound's own
// trail. It does not run MilkDrop presets.
//
// It holds no rule of the app. Whether it may react at all, when a scene may change, whether a flash is allowed and
// how much detail to draw are the model's answers (shows, scene, flash, depth); app.js asks and tells this file.
// Everything that moves here is driven by the samples it is handed: the same ones that reach the speakers.
(() => {
  const QUAD = `#version 300 es
in vec2 corner; out vec2 uv;
void main() { uv = corner * 0.5 + 0.5; gl_Position = vec4(corner, 0.0, 1.0); }`;

  // The last frame, pulled toward the centre, turned and rippled by the sound, and dimmed.
  const WARP = `#version 300 es
precision highp float;
in vec2 uv; out vec4 colour;
uniform sampler2D last;
uniform float time, zoom, turn, ripple, grain, fade, bass, treble, aspect, drift;
vec3 turned(vec3 c, float angle) {
  vec3 axis = vec3(0.57735);
  float s = sin(angle), k = cos(angle);
  return c * k + cross(axis, c) * s + axis * dot(axis, c) * (1.0 - k);
}
void main() {
  vec2 p = uv - 0.5;
  p.x *= aspect;
  float reach = length(p);
  float angle = turn + ripple * 0.06 * sin(time * 0.6 + reach * grain * 6.2831) * (0.4 + treble);
  float s = sin(angle), k = cos(angle);
  p = mat2(k, -s, s, k) * p;
  p *= zoom - bass * 0.014 + ripple * 0.012 * sin(time * 0.8 + p.x * grain * 5.0) * cos(time * 0.7 + p.y * grain * 5.0);
  p += ripple * 0.003 * vec2(sin(time + uv.y * grain * 9.0), cos(time * 1.1 + uv.x * grain * 9.0));
  p.x /= aspect;
  vec3 c = turned(texture(last, p + 0.5).rgb, drift) * fade;
  float glare = max(c.r, max(c.g, c.b));
  c *= 1.0 - 0.16 * smoothstep(0.45, 1.0, glare); // bright areas dim faster, so light never piles up into white
  colour = vec4(clamp(c, 0.0, 0.94), 1.0);
}`;

  // The waveform, as a ribbon.
  const LINE_V = `#version 300 es
in vec2 at;
void main() { gl_Position = vec4(at, 0.0, 1.0); }`;
  const LINE_F = `#version 300 es
precision highp float;
uniform vec3 ink; out vec4 colour;
void main() { colour = vec4(ink, 1.0); }`;

  // A soft light at one place: a beat at the centre, or a finger.
  const GLOW = `#version 300 es
precision highp float;
in vec2 uv; out vec4 colour;
uniform vec2 where; uniform float size, aspect; uniform vec3 ink;
void main() {
  vec2 d = uv - where; d.x *= aspect;
  colour = vec4(ink * exp(-dot(d, d) / (size * size)), 1.0);
}`;

  // The cover, laid into the picture so the sound grows out of it.
  const COVER = `#version 300 es
precision highp float;
in vec2 uv; out vec4 colour;
uniform sampler2D art; uniform float aspect, strength;
void main() {
  vec2 p = (uv - 0.5) * vec2(aspect, 1.0) / 0.62 + 0.5;
  float inside = step(0.0, p.x) * step(p.x, 1.0) * step(0.0, p.y) * step(p.y, 1.0);
  vec2 edge = smoothstep(0.0, 0.08, p) * smoothstep(0.0, 0.08, 1.0 - p);
  colour = vec4(texture(art, vec2(p.x, 1.0 - p.y)).rgb, inside * edge.x * edge.y * strength);
}`;

  const SHOW = `#version 300 es
precision highp float;
in vec2 uv; out vec4 colour;
uniform sampler2D frame;
void main() {
  vec3 c = texture(frame, uv).rgb;
  vec2 d = uv - 0.5;
  colour = vec4(pow(c, vec3(0.92)) * (1.0 - 0.55 * dot(d, d)), 1.0);
}`;

  // A scene is a handful of numbers. zoom under one pulls the picture inward; over one pushes it out.
  const SCENES = [
    { zoom: 0.984, turn: 0.004, ripple: 0.6, grain: 1.0, fade: 0.972, wave: 0, hue: 0.58, drift: 0.004 },
    { zoom: 1.012, turn: -0.006, ripple: 1.2, grain: 1.6, fade: 0.962, wave: 1, hue: 0.92, drift: 0.006 },
    { zoom: 0.992, turn: 0.014, ripple: 0.3, grain: 0.7, fade: 0.978, wave: 2, hue: 0.08, drift: 0.003 },
    { zoom: 0.975, turn: 0.0, ripple: 1.8, grain: 2.4, fade: 0.958, wave: 0, hue: 0.42, drift: 0.008 },
    { zoom: 1.02, turn: 0.01, ripple: 0.9, grain: 1.2, fade: 0.955, wave: 3, hue: 0.74, drift: 0.005 },
    { zoom: 0.99, turn: -0.018, ripple: 0.5, grain: 3.0, fade: 0.97, wave: 1, hue: 0.16, drift: 0.01 },
    { zoom: 0.968, turn: 0.007, ripple: 1.4, grain: 0.9, fade: 0.975, wave: 3, hue: 0.66, drift: 0.002 },
    { zoom: 1.006, turn: 0.003, ripple: 2.2, grain: 1.9, fade: 0.964, wave: 2, hue: 0.3, drift: 0.007 },
  ];
  // The share of the screen's own pixels drawn, by the model's detail step. Step 2 is every pixel the screen has.
  // Steps above it draw more than that and let the browser scale down, which smooths every edge. The picture never
  // exceeds 7680 by 4320, which is 8K, or what the graphics card can hold.
  const STEPS = [0.5, 0.75, 1.0, 1.25, 1.5, 2.0];
  const WIDEST = 7680, TALLEST = 4320;
  const POINTS = 512;

  function ink(hue, light) { // a hue as red, green and blue, each 0 to 1
    const f = (n) => { const k = (n + hue * 6) % 6; return light * (1 - 0.82 * Math.max(0, Math.min(k, 4 - k, 1))); };
    return [f(5), f(3), f(1)];
  }
  function seeded(text) { // the same song gives the same numbers, so it opens the same way every time
    let a = 2166136261;
    for (let i = 0; i < text.length; i++) { a ^= text.charCodeAt(i); a = Math.imul(a, 16777619); }
    return () => { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  function create(canvas) {
    const gl = canvas.getContext('webgl2', { alpha: false, antialias: false, powerPreference: 'high-performance' });
    if (!gl) return null;
    const program = (vertex, fragment) => {
      const made = gl.createProgram();
      for (const [kind, source] of [[gl.VERTEX_SHADER, vertex], [gl.FRAGMENT_SHADER, fragment]]) {
        const shader = gl.createShader(kind);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        gl.attachShader(made, shader);
      }
      gl.linkProgram(made);
      if (!gl.getProgramParameter(made, gl.LINK_STATUS)) return null;
      const names = {};
      for (let i = 0; i < gl.getProgramParameter(made, gl.ACTIVE_UNIFORMS); i++) { const u = gl.getActiveUniform(made, i); names[u.name] = gl.getUniformLocation(made, u.name); }
      return { made, names };
    };
    const warp = program(QUAD, WARP), line = program(LINE_V, LINE_F), glow = program(QUAD, GLOW), cover = program(QUAD, COVER), show = program(QUAD, SHOW);
    if (!warp || !line || !glow || !cover || !show) return null;

    const quad = gl.createVertexArray();
    gl.bindVertexArray(quad);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    for (const p of [warp, glow, cover, show]) gl.bindAttribLocation(p.made, 0, 'corner');

    const ribbon = gl.createVertexArray();
    const ribbonData = new Float32Array(POINTS * 4);
    const ribbonBuffer = gl.createBuffer();
    gl.bindVertexArray(ribbon);
    gl.bindBuffer(gl.ARRAY_BUFFER, ribbonBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, ribbonData.byteLength, gl.DYNAMIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // Sixteen-bit float colour where the card can draw to it: slow fades stay smooth instead of stepping.
    const deep = Boolean(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('EXT_color_buffer_half_float'));
    const largest = gl.getParameter(gl.MAX_TEXTURE_SIZE);
    let frames = [], width = 0, height = 0, step = 2;
    function surface() {
      const texture = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, texture);
      if (deep) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, width, height, 0, gl.RGBA, gl.HALF_FLOAT, null);
      else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.MIRRORED_REPEAT);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.MIRRORED_REPEAT);
      const target = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, target);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
      return { texture, target };
    }
    function fit() {
      const sharp = (globalThis.devicePixelRatio || 1) * STEPS[step];
      let w = Math.max(64, Math.round(canvas.clientWidth * sharp)), h = Math.max(64, Math.round(canvas.clientHeight * sharp));
      const fitIn = Math.min(1, WIDEST / w, TALLEST / h, largest / w, largest / h);
      w = Math.floor(w * fitIn); h = Math.floor(h * fitIn);
      if (w === width && h === height) return;
      for (const f of frames) { gl.deleteTexture(f.texture); gl.deleteFramebuffer(f.target); }
      width = w; height = h;
      canvas.width = w; canvas.height = h;
      frames = [surface(), surface()];
    }

    // ---- what the sound is doing, from the samples. Each of these is measured, never guessed:
    //   loudness            how hard the sound is, and against the song's own range, its energy
    //   bass, mid, treble   three bands, each against its own running average, so a quiet song still moves
    //   brightness          where the weight of the spectrum sits, low to high
    //   width               how far left and right differ: one voice in the middle, or a wide room
    //   key                 the pitch class that carries most weight, as one of twelve
    //   tempo               beats a minute, from the gaps between the beats found
    //   section             a lasting change in energy: a verse giving way to a chorus
    let left = null, right = null;
    const wave = new Float32Array(2048), waveLeft = new Float32Array(2048), waveRight = new Float32Array(2048);
    let spectrum = new Uint8Array(1024);
    const level = { bass: 0, mid: 0, treble: 0 };
    const usual = { bass: 0.1, mid: 0.1, treble: 0.1 };
    const chroma = new Float32Array(12);
    const gaps = [];
    let loud = 0, heard = 0, lastBeat = 0, shortEnergy = 0, longEnergy = 0, boundary = false, lastBoundary = 0;
    let floor = 0.02, ceiling = 0.2, energy = 0, bright = 0.3, wide = 0, key = 0, keyHue = 0, keySure = 0, tempo = 0;
    let attack = 0, noisy = 0, before = new Uint8Array(1024);
    function listen(now) {
      if (!left) return;
      left.getFloatTimeDomainData(waveLeft);
      if (right) right.getFloatTimeDomainData(waveRight); else waveRight.set(waveLeft);
      left.getByteFrequencyData(spectrum);
      let sum = 0, side = 0;
      for (let i = 0; i < wave.length; i++) {
        const m = (waveLeft[i] + waveRight[i]) * 0.5, d = (waveLeft[i] - waveRight[i]) * 0.5;
        wave[i] = m; sum += m * m; side += d * d;
      }
      loud = Math.sqrt(sum / wave.length);
      if (loud > 0.0015) heard = now;
      wide += (Math.min(1, Math.sqrt(side / (sum + 1e-9))) - wide) * 0.05;
      // Energy is loudness placed inside the range this song has shown so far.
      ceiling = Math.max(loud, ceiling - 0.00002);
      floor = Math.min(loud + 0.001, floor + 0.00001);
      energy += (Math.max(0, Math.min(1, (loud - floor) / (ceiling - floor + 1e-6))) - energy) * 0.03;
      const hertz = left.context.sampleRate / left.fftSize; // the width of one bin
      const band = (from, to) => { let total = 0, n = 0; for (let i = Math.max(1, Math.floor(from / hertz)); i < Math.min(spectrum.length, Math.ceil(to / hertz)); i++) { total += spectrum[i]; n++; } return n ? total / n / 255 : 0; };
      const bands = { bass: band(30, 160), mid: band(160, 2200), treble: band(2200, 12000) };
      for (const name of ['bass', 'mid', 'treble']) {
        usual[name] += (bands[name] - usual[name]) * 0.012;
        level[name] = bands[name] / (usual[name] + 0.02);
      }
      // Attack: how much the spectrum grew since the last frame. A struck note jumps; a held one does not.
      // Noisiness: how flat the spectrum is. A cymbal or a breath is flat; a sung note is peaks and valleys.
      if (before.length !== spectrum.length) before = new Uint8Array(spectrum.length);
      let grew = 0, logs = 0, plain = 0, counted = 0;
      for (let i = 2; i < Math.min(spectrum.length, Math.ceil(12000 / hertz)); i++) {
        const now1 = spectrum[i];
        if (now1 > before[i]) grew += now1 - before[i];
        before[i] = now1;
        logs += Math.log(now1 + 1); plain += now1 + 1; counted++;
      }
      attack += (Math.min(1, grew / (counted * 24 + 1)) - attack) * 0.35;
      if (counted) noisy += (Math.exp(logs / counted) / (plain / counted) - noisy) * 0.05;
      // Brightness: the centre of the spectrum's weight, on a scale of octaves from 100 Hz to 10 kHz.
      let weight = 0, centre = 0;
      const top = Math.min(spectrum.length, Math.ceil(12000 / hertz));
      for (let i = 2; i < top; i++) { weight += spectrum[i]; centre += spectrum[i] * i * hertz; }
      if (weight > 0) bright += (Math.max(0, Math.min(1, Math.log2(centre / weight / 100) / 6.64)) - bright) * 0.05;
      // Key: each bin between 110 Hz and 1760 Hz adds its weight to the pitch class it falls in.
      for (let c = 0; c < 12; c++) chroma[c] *= 0.985;
      for (let i = Math.ceil(110 / hertz); i < Math.min(spectrum.length, Math.floor(1760 / hertz)); i++) {
        if (spectrum[i] < 40) continue;
        const note = Math.round(12 * Math.log2((i * hertz) / 440)) + 69;
        chroma[((note % 12) + 12) % 12] += spectrum[i] / 255;
      }
      let best = 0, total = 0;
      for (let c = 0; c < 12; c++) { total += chroma[c]; if (chroma[c] > chroma[best]) best = c; }
      key = best;
      keySure = total > 0 ? Math.min(1, (chroma[best] / total) * 6 - 0.5) : 0;
      let turnTo = best / 12 - keyHue; // the colour turns toward the key the short way round the circle
      if (turnTo > 0.5) turnTo -= 1; else if (turnTo < -0.5) turnTo += 1;
      keyHue = (keyHue + turnTo * 0.01 + 1) % 1;
      if (level.bass > 1.38 && bands.bass > 0.18 && now - lastBeat > 220) {
        if (lastBeat && now - lastBeat < 2000) { gaps.push(now - lastBeat); if (gaps.length > 12) gaps.shift(); }
        lastBeat = now;
        if (gaps.length >= 4) { const sorted = gaps.slice().sort((x, y) => x - y); let bpm = 60000 / sorted[sorted.length >> 1]; while (bpm < 70) bpm *= 2; while (bpm > 180) bpm /= 2; tempo = Math.round(bpm); }
        if (api.onbeat) api.onbeat();
      }
      // A section change: the last few seconds are much louder or much quieter than the stretch before them.
      shortEnergy += (loud - shortEnergy) * 0.01;
      longEnergy += (loud - longEnergy) * 0.0015;
      const ratio = shortEnergy / (longEnergy + 0.0005);
      if ((ratio > 1.45 || ratio < 0.62) && now - lastBoundary > 6000) { boundary = true; lastBoundary = now; longEnergy = shortEnergy; }
    }

    // ---- the scene, and moving between scenes
    let order = SCENES.map((_, i) => i), place = 0, tint = 0;
    let scene = { ...SCENES[0] }, from = null, to = null, blendStart = 0, blendFor = 0;
    function next(kind, now) {
      place = (place + 1) % order.length;
      const target = { ...SCENES[order[place]] };
      target.hue = (target.hue + tint) % 1;
      boundary = false;
      if (kind === 'cut') { scene = target; from = to = null; return; }
      from = { ...scene }; to = target; blendStart = now; blendFor = 2600;
    }
    function settle(now) {
      if (!to) return;
      const t = Math.min(1, (now - blendStart) / blendFor), ease = t * t * (3 - 2 * t);
      for (const key of Object.keys(to)) if (key !== 'wave') scene[key] = from[key] + (to[key] - from[key]) * ease;
      if (t > 0.5) scene.wave = to.wave;
      if (t >= 1) from = to = null;
    }

    let mode = 'still', mood = 1, bloom = 0, clock = 0, last = 0, took = 16, art = null, artDue = 0;
    const FORCE = [0.45, 1.0, 1.45, 1.9]; // how far the model's mood lets the sound push the picture: calm, flow, drive, storm
    let heeded = 0; // the part of the sound the model says the picture leans toward: bass, mid or treble
    const lean = (part) => (heeded === part ? 1.6 : 0.8);
    const tone = () => (scene.hue * (1 - 0.7 * keySure) + keyHue * 0.7 * keySure + 1) % 1; // the scene's colour, turned toward the key
    const pace = () => (tempo ? Math.max(0.6, Math.min(1.6, tempo / 120)) : 1);
    const touches = new Map();
    function ribbonOf(samples, lift, colour) { // one waveform as a ribbon of triangles
      const thick = 0.003 + 0.006 * bright; // a bright sound draws a finer, sharper line; a dark one a soft, broad one
      const gain = 0.55;
      let px = 0, py = 0;
      for (let i = 0; i < POINTS; i++) {
        const t = i / (POINTS - 1), sample = samples[Math.floor(t * (samples.length - 1))] * gain;
        let x, y;
        if (scene.wave === 0 || scene.wave === 3) {
          const angle = t * 6.2831853 + clock * 0.1;
          const reach = scene.wave === 0 ? 0.42 + sample + lift : 0.2 + lift + 0.5 * (spectrum[Math.floor(t * 300) + 2] / 255);
          x = Math.cos(angle) * reach * (height / width); y = Math.sin(angle) * reach;
        } else {
          x = t * 2 - 1; y = sample * 1.4 + lift + (scene.wave === 2 ? 0.35 * Math.sin(clock * 0.3) : 0);
        }
        let nx = -(y - py), ny = x - px;
        const length = Math.hypot(nx, ny) || 1;
        nx = (nx / length) * thick; ny = (ny / length) * thick;
        ribbonData.set([x + nx, y + ny, x - nx, y - ny], i * 4);
        px = x; py = y;
      }
      gl.bindVertexArray(ribbon);
      gl.bindBuffer(gl.ARRAY_BUFFER, ribbonBuffer);
      gl.bufferSubData(gl.ARRAY_BUFFER, 0, ribbonData);
      gl.useProgram(line.made);
      gl.uniform3fv(line.names.ink, colour);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, POINTS * 2);
    }
    function trace() {
      // Left and right are drawn apart by exactly as much as they differ: a centred voice is one line, a wide mix two.
      const apart = 0.22 * wide;
      const light1 = Math.min(0.55, 0.16 + 0.26 * energy + 0.1 * level.treble);
      if (apart < 0.01) { ribbonOf(wave, 0, ink(tone(), light1)); return; }
      ribbonOf(waveLeft, apart, ink(tone(), light1));
      ribbonOf(waveRight, -apart, ink((tone() + 0.08) % 1, light1));
    }
    function light(x, y, size, colour) {
      gl.bindVertexArray(quad);
      gl.useProgram(glow.made);
      gl.uniform2f(glow.names.where, x, y);
      gl.uniform1f(glow.names.size, size);
      gl.uniform1f(glow.names.aspect, width / height);
      gl.uniform3fv(glow.names.ink, colour);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    let running = 0;
    function frame(now) {
      running = requestAnimationFrame(frame);
      const passed = last ? Math.min(100, now - last) : 16;
      last = now;
      took += (passed - took) * 0.08;
      fit();
      listen(now);
      settle(now);
      const reacting = mode === 'react';
      clock += (passed / 1000) * (reacting ? pace() : 0.2); // the tempo sets the pace; at rest the picture slows and dims
      const force = FORCE[mood];
      const [back, front] = frames;
      gl.viewport(0, 0, width, height);
      gl.bindFramebuffer(gl.FRAMEBUFFER, front.target);
      gl.disable(gl.BLEND);
      gl.bindVertexArray(quad);
      gl.useProgram(warp.made);
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, back.texture);
      gl.uniform1i(warp.names.last, 0);
      gl.uniform1f(warp.names.time, clock);
      gl.uniform1f(warp.names.zoom, scene.zoom);
      gl.uniform1f(warp.names.turn, scene.turn * (reacting ? 1 : 0.3));
      gl.uniform1f(warp.names.ripple, scene.ripple * force * (1 + 1.5 * attack) * lean(1));
      gl.uniform1f(warp.names.grain, scene.grain * (0.6 + 0.8 * bright) * (1 + 1.2 * noisy));
      gl.uniform1f(warp.names.fade, reacting ? scene.fade : 0.94);
      gl.uniform1f(warp.names.bass, reacting ? (Math.min(2.5, level.bass) - 1) * force * lean(0) : 0);
      gl.uniform1f(warp.names.treble, reacting ? Math.min(2, level.treble) * lean(2) : 0);
      gl.uniform1f(warp.names.aspect, width / height);
      gl.uniform1f(warp.names.drift, scene.drift);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);

      if (reacting) {
        if (art && now >= artDue) {
          gl.enable(gl.BLEND);
          gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
          gl.useProgram(cover.made);
          gl.bindTexture(gl.TEXTURE_2D, art);
          gl.uniform1i(cover.names.art, 0);
          gl.uniform1f(cover.names.aspect, width / height);
          gl.uniform1f(cover.names.strength, 0.9);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
          artDue = Infinity; // once for a track; a section change lays it in again
        }
        gl.enable(gl.BLEND);
        gl.blendFunc(gl.ONE, gl.ONE);
        trace();
        if (bloom > 0.01) { light(0.5, 0.5, 0.05 + 0.08 * bloom, ink(tone(), 0.22 * bloom)); bloom *= 0.86; }
        for (const [, spot] of touches) light(spot.x, spot.y, 0.03 + 0.03 * Math.min(2, level.bass), ink((tone() + 0.5) % 1, 0.12 + 0.2 * energy));
      }
      gl.disable(gl.BLEND);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, width, height);
      gl.bindVertexArray(quad);
      gl.useProgram(show.made);
      gl.bindTexture(gl.TEXTURE_2D, front.texture);
      gl.uniform1i(show.names.frame, 0);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      frames = [front, back];
    }

    const spot = (event) => { const box = canvas.getBoundingClientRect(); return { x: (event.clientX - box.left) / box.width, y: 1 - (event.clientY - box.top) / box.height }; };
    canvas.addEventListener('pointerdown', (event) => touches.set(event.pointerId, spot(event)));
    canvas.addEventListener('pointermove', (event) => { if (touches.has(event.pointerId)) touches.set(event.pointerId, spot(event)); });
    for (const name of ['pointerup', 'pointercancel', 'pointerleave']) canvas.addEventListener(name, (event) => touches.delete(event.pointerId));

    const api = {
      onbeat: null,
      setTaps(leftNode, rightNode) { left = leftNode; right = rightNode; if (leftNode) spectrum = new Uint8Array(leftNode.frequencyBinCount); },
      setMood(n) { mood = Math.max(0, Math.min(FORCE.length - 1, n)); },
      setHeed(n) { heeded = n; },
      /** A new track: its own order of scenes and its own tint, from its name; and its cover, when the page may read it. */
      setTrack(id, picture) {
        const random = seeded(String(id));
        order = SCENES.map((_, i) => i);
        for (let i = order.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [order[i], order[j]] = [order[j], order[i]]; }
        tint = random();
        place = 0;
        scene = { ...SCENES[order[0]] };
        scene.hue = (scene.hue + tint) % 1;
        from = to = null;
        boundary = false;
        if (art) { gl.deleteTexture(art); art = null; }
        if (!picture) return;
        const image = new Image();
        image.crossOrigin = 'anonymous';
        image.onload = () => {
          try {
            const texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            art = texture;
            artDue = 0;
          } catch { art = null; } // a picture the page may not read is left out, and nothing stands in for it
        };
        image.src = picture;
      },
      setMode(next1) { mode = next1; },
      setStep(n) { step = Math.max(0, Math.min(STEPS.length - 1, n)); },
      pulse() { bloom = 1; },
      next(kind) { next(kind, performance.now()); if (art) artDue = performance.now() + 400; },
      stats: () => ({ millis: Math.round(took), live: performance.now() - heard < 1000, boundary, energy: Math.round(energy * 100), bright: Math.round(bright * 100), wide: Math.round(wide * 100), tempo, key, keySure: Math.round(keySure * 100),
        attack: Math.round(attack * 100), noisy: Math.round(noisy * 100), width, height, deep,
        bass: Math.round(Math.min(2, level.bass) * 50), mid: Math.round(Math.min(2, level.mid) * 50), treble: Math.round(Math.min(2, level.treble) * 50) }),
      start() { if (!running) { last = 0; running = requestAnimationFrame(frame); } },
      stop() { cancelAnimationFrame(running); running = 0; },
    };
    return api;
  }

  globalThis.HoloVisuals = { create };
})();
