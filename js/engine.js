// WebGL2 render engine: visual → (crossfade) → bloom → tonemap/grain → screen.
// Visuals are plain objects from js/visuals/*.js: { id, name, frag, bloom?, feedback?, caption? }.

import { HEADER, VERT, MIX_FRAG, BRIGHT_FRAG, BLUR_FRAG, FINAL_FRAG } from "./glsl.js";

import { SceneClock } from "./scene-clock.js";
import { buildSmoothHistory, HIST_RATE } from "./audio-data.js";

export class Engine {
  constructor(canvas, visuals, { onError, fadeDuration = 1.6 } = {}) {
    this.canvas = canvas;
    this.visuals = visuals;
    this.onError = onError || ((m) => console.error(m));
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 wordt niet ondersteund door deze browser.");
    this.gl = gl;
    // Render at the screen's full native resolution (up to 3 device pixels per CSS pixel).
    // If the GPU can't keep up, step down at most to 2 device px per CSS px: still sharp, never pixelated.
    this.scale = 1.0;
    this.maxScale = 1.0;
    this.minScale = 0.67;
    this.fadeDur = fadeDuration;
    this.travel = 0;
    this.frameMs = 16; this.lastAdapt = 0;
    this.art = null;
    this.#initResources();
    canvas.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      this.onError("De beeldweergave wordt hersteld…");
    });
    canvas.addEventListener("webglcontextrestored", () => {
      const id = this.cur?.vis.id || this.visuals[0].id;
      const clock = this.cur?.clock;
      try {
        this.#initResources();
        if (this.art) this.setArt(this.art.img, this.art.pal);
        this.setVisual(id, { instant: true });
        if (clock && this.cur) this.cur.clock = clock;
        this.onError("");
      } catch (e) { this.onError("Herstellen mislukt. Herlaad de pagina: " + e.message); }
    });
  }

  #initResources() {
    const gl = this.gl;
    this.hdr = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");
    this.vao = gl.createVertexArray();
    this.programs = new Map();
    this.post = {
      mix: this.#program(MIX_FRAG, "mix"),
      bright: this.#program(BRIGHT_FRAG, "bright"),
      blur: this.#program(BLUR_FRAG, "blur"),
      final: this.#program(FINAL_FRAG, "final"),
    };
    this.cur = null; this.old = null; this.fade = 1;
    this.mixT = this.bloomA = this.bloomB = null;
    this.artTex = this.#texture(2, 2);
    // lyrics layer (js/lyrics-layer.js): canvas atlas, uploaded only when its lines change; texture unit 6 in the final pass
    this.lyrTex = gl.createTexture(); this.lyrVersion = -1; this.lyrCanvas = null; this.lyrOn = 0;
    gl.bindTexture(gl.TEXTURE_2D, this.lyrTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array(4));
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    // sound data for the shaders (js/audio-data.js): 128 x 65 bytes, exact texel reads
    this.audioTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.audioTex);
    gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 128, 65, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(128 * 65));
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.NEAREST], [gl.TEXTURE_MAG_FILTER, gl.NEAREST], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    // smooth spectrum history: 64 bands x 64 rows, row 0 = newest, linear filtering (see buildSmoothHistory)
    this.histTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.histTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.R8, 64, 64, 0, gl.RED, gl.UNSIGNED_BYTE, new Uint8Array(64 * 64));
    for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
    this.histBytes = new Uint8Array(64 * 64);
    // stand-in for uPrev on visuals without feedback (a texture can't be read while it is the render target)
    this.blankTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.blankTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 1, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, new Uint8Array([0, 0, 0, 255]));
    this.W = 0; this.H = 0;
    this.#resize();
  }

  // ---------- public ----------

  /** Switch to a visual; crossfades from the current one. */
  setVisual(id, { instant = false } = {}) {
    if (this.gl.isContextLost()) return this.cur?.vis;
    const vis = this.visuals.find((v) => v.id === id) || this.visuals[0];
    if (this.cur && this.cur.vis.id === vis.id) return vis;
    if (!this.#ensure(vis)) return this.cur?.vis;
    const slot = { vis, clock: new SceneClock(), t: vis.feedback ? [this.#target(this.RW, this.RH), this.#target(this.RW, this.RH)] : [this.#target(this.RW, this.RH)], i: 0 };
    let previous = this.cur;
    if (!instant && this.old && this.fade < 1) {
      // Rapid swipes continue from the actual composite on screen, not the
      // partly hidden target of the interrupted transition.
      const snapshot = this.#target(this.RW, this.RH);
      this.#copy(this.mixT, snapshot);
      const ease = this.fade * this.fade * (3 - 2 * this.fade);
      const bloom = (this.cur.vis.bloom ?? 0.9) * ease + (this.old.vis.bloom ?? 0.9) * (1 - ease);
      previous = { vis: { ...this.cur.vis, bloom }, t: [snapshot], i: 0, frozen: true };
      this.#freeSlot(this.cur);
    }
    if (this.old) this.#freeSlot(this.old);
    this.old = instant ? null : previous;
    if (instant && this.cur) this.#freeSlot(this.cur);
    this.cur = slot;
    this.fade = this.old ? 0 : 1;
    return vis;
  }

  /** Compile remaining visuals a few at a time so the first frame is not blocked. */
  warmUp() {
    const todo = this.visuals.filter((v) => !this.programs.has(v.id));
    const step = () => { if (this.gl.isContextLost()) return; const v = todo.shift(); if (!v) return; this.#ensure(v); setTimeout(step, 60); };
    setTimeout(step, 400);
  }

  setArt(img, pal) {
    this.art = { img, pal };
    const gl = this.gl;
    if (gl.isContextLost()) return;
    gl.bindTexture(gl.TEXTURE_2D, this.artTex);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    try {
      if (img) {
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, img);
      } else {
        // no album art: soft studio gradient built from the palette
        const cv = document.createElement("canvas"); cv.width = cv.height = 128;
        const x = cv.getContext("2d");
        const rgb = (c, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`;
        x.fillStyle = rgb(pal.dark); x.fillRect(0, 0, 128, 128);
        for (const [cx, cy, r, col] of [[30, 40, 70, pal.mid], [100, 30, 50, pal.hi], [80, 105, 60, pal.mid]]) {
          const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
          g.addColorStop(0, rgb(col, 0.9)); g.addColorStop(1, rgb(col, 0));
          x.fillStyle = g; x.fillRect(0, 0, 128, 128);
        }
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, cv);
      }
    } catch { /* tainted image: keep old texture */ }
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  }

  /**
   * Draw one frame.
   * f = { time, dt, songTime, audio, pal: {dark,mid,hi,hot} (0..255), drop, seed }
   */
  render(f) {
    const gl = this.gl;
    if (!this.cur || gl.isContextLost()) return;
    this.#resize();
    const sceneDt = f.sceneDt ?? f.dt;
    for (const slot of [this.cur, this.old]) if (slot?.clock) slot.clock.advance(sceneDt, f.bpm, f.beatPhase);
    this.#adapt(f.dt, f.time);
    this.travel += f.dt * 0.8; // steady camera speed; audio only changes local details
    if (this.fade < 1) this.fade = Math.min(1, this.fade + f.dt / this.fadeDur);
    if (this.fade >= 1 && this.old) { this.#freeSlot(this.old); this.old = null; }

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);
    if (f.sound) {
      gl.bindTexture(gl.TEXTURE_2D, this.audioTex);
      gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 128, 65, gl.RED, gl.UNSIGNED_BYTE, f.sound.bytes);
      buildSmoothHistory(f.sound, this.histBytes);
      gl.bindTexture(gl.TEXTURE_2D, this.histTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, 64, 64, gl.RED, gl.UNSIGNED_BYTE, this.histBytes);
    }
    this.sound = f.sound;

    const a = this.#drawVisual(this.cur, f);
    const b = this.old ? this.#drawVisual(this.old, f) : a;
    const ease = this.fade * this.fade * (3 - 2 * this.fade);

    // mix
    this.#pass(this.post.mix, this.mixT, (u) => { u.tex("uA", a, 0); u.tex("uB", b, 1); u.f("uMix", ease); });
    // bloom
    this.#pass(this.post.bright, this.bloomA, (u) => { u.tex("uSrc", this.mixT.tex, 0); u.v2("uTexel", 1 / this.RW, 1 / this.RH); });
    this.#pass(this.post.blur, this.bloomB, (u) => { u.tex("uSrc", this.bloomA.tex, 0); u.v2("uDir", 1 / this.BW, 0); });
    this.#pass(this.post.blur, this.bloomA, (u) => { u.tex("uSrc", this.bloomB.tex, 0); u.v2("uDir", 0, 1 / this.BH); });
    this.#pass(this.post.blur, this.bloomB, (u) => { u.tex("uSrc", this.bloomA.tex, 0); u.v2("uDir", 2 / this.BW, 0); });
    this.#pass(this.post.blur, this.bloomA, (u) => { u.tex("uSrc", this.bloomB.tex, 0); u.v2("uDir", 0, 2 / this.BH); });
    // lyrics layer: removed at once (track change, no lyrics), fades in softly when lines appear
    // a new song / no lyrics: the old text leaves within 0.2 s (a soft fade, so nothing jumps), never longer
    let ly = f.lyricLayer;
    if (!ly && this.lyrLast && this.lyrOn > 0) { ly = this.lyrLast; this.lyrOn = Math.max(0, this.lyrOn - f.dt / 0.2); if (this.lyrOn === 0) this.lyrLast = null; }
    else if (ly) this.lyrLast = ly;
    if (ly && ly === f.lyricLayer) {
      if (ly.version !== this.lyrVersion || ly.canvas !== this.lyrCanvas) {
        this.lyrVersion = ly.version; this.lyrCanvas = ly.canvas;
        gl.activeTexture(gl.TEXTURE6); gl.bindTexture(gl.TEXTURE_2D, this.lyrTex);
        gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false); gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE, ly.canvas);
      }
      if (this.lyrVis !== this.cur.vis.id) { this.lyrVis = this.cur.vis.id; this.lyrOn = 0; }   // new visual: new placement, fade in
      this.lyrOn = Math.min(1, this.lyrOn + f.dt / 0.35);
    } else if (!ly) this.lyrOn = 0;
    const P = f.pal, c01 = (a) => a.map((v) => v / 255);
    const lift = (a, k) => a.map((v) => v + (1 - v) * k);
    const ink = ly?.ink || lift(c01(P?.mid || [200, 200, 200]), 0.78);
    const accent = ly?.accent || ink.map((v, i) => v * 0.5 + lift(c01(P?.hi || [255, 200, 120]), 0.3)[i] * 0.5);   // a muted cover tint
    // final
    const bloomAmt = (this.cur.vis.bloom ?? 0.9) * ease + (this.old ? (this.old.vis.bloom ?? 0.9) * (1 - ease) : 0);
    this.#pass(this.post.final, null, (u) => {
      u.tex("uScene", this.mixT.tex, 0); u.tex("uBloom", this.bloomA.tex, 1);
      u.f("uBloomAmt", bloomAmt); u.f("uTime", f.time); u.f("uGrain", 0.035);
      u.f("uGrade", (this.cur.vis.grade ?? 1) * ease + (this.old ? (this.old.vis.grade ?? 1) * (1 - ease) : 0));
      u.f("uRest", f.audio.rest ?? 0);
      u.f("uLyrOn", ly ? this.lyrOn : 0);
      if (ly) {
        u.tex("uLyr", this.lyrTex, 6);
        u.f("uLyrOcc", ly.occlude); u.f("uLyrSlotPx", ly.slotPx);
        u.v4("uLyrBox", ...ly.box);
        u.v4a("uLyrSlots", ly.slots);
        u.v3("uLyrInk", ...ink); u.v3("uLyrAccent", ...accent);
      }
    });
  }

  get currentVisual() { return this.cur?.vis; }

  // ---------- internals ----------

  #drawVisual(slot, f) {
    if (slot.frozen) return slot.t[0].tex;
    const p = this.programs.get(slot.vis.id);
    const single = slot.t.length === 1;
    const src = slot.t[slot.i], dst = single ? src : slot.t[1 - slot.i];
    if (!p) return src.tex;
    const gl = this.gl, L = p.loc;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(p.prog);
    const A = f.audio, pal = f.pal;
    const set1 = (n, v) => { if (L[n]) gl.uniform1f(L[n], v); };
    if (L.uRes) gl.uniform2f(L.uRes, dst.w, dst.h);
    set1("uSceneTime", slot.clock.seconds); set1("uSceneBeat", slot.clock.beats);
    set1("uDelta", f.dt); set1("uTime", f.time); set1("uSongTime", f.songTime); set1("uBeat", A.beat);
    set1("uKick", A.kick); set1("uSnare", A.snare); set1("uHat", A.hat); set1("uEnergy", A.energy); set1("uLevel", A.level);
    set1("uDrop", f.drop); set1("uTravel", this.travel); set1("uSeed", f.seed);
    if (L.uBands) gl.uniform1fv(L.uBands, A.bands);
    if (L.uPeaks) gl.uniform1fv(L.uPeaks, A.peaks);
    if (L.uFlux && A.flux) gl.uniform1fv(L.uFlux, A.flux);
    set1("uHit", A.hit ?? Math.max(A.kick, A.snare)); set1("uRest", A.rest ?? 0); set1("uKickN", A.beatIdx ?? 0); set1("uSnareN", A.snareN ?? 0);
    if (L.uPal) gl.uniform3fv(L.uPal, [...pal.dark, ...pal.mid, ...pal.hi, ...pal.hot].map((v) => v / 255));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, single ? this.blankTex : src.tex); if (L.uPrev) gl.uniform1i(L.uPrev, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.artTex); if (L.uArt) gl.uniform1i(L.uArt, 1);
    gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.audioTex); if (L.uAudio) gl.uniform1i(L.uAudio, 2);
    gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.histTex); if (L.uHistS) gl.uniform1i(L.uHistS, 3);
    set1("uHistHead", this.sound?.head ?? 0); set1("uLive", this.sound?.live ? 1 : 0);
    set1("uHistFrac", Math.min(0.999, (this.sound?.acc ?? 0) * HIST_RATE));
    // visuals with their own data (e.g. Snake's board) upload it here; texture units ≥ 4 are theirs
    if (slot.vis.uniforms) { try { slot.vis.uniforms({ gl, loc: L, frame: f, slot, width: dst.w, height: dst.h }); } catch (e) { console.error(e); } }
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (!single) slot.i = 1 - slot.i;
    return dst.tex;
  }

  #pass(p, target, setup) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, target ? target.fb : null);
    const w = target ? target.w : this.W, h = target ? target.h : this.H;
    gl.viewport(0, 0, w, h);
    gl.useProgram(p.prog);
    const L = p.loc;
    const u = {
      f: (n, v) => L[n] && gl.uniform1f(L[n], v),
      v2: (n, x, y) => L[n] && gl.uniform2f(L[n], x, y),
      v3: (n, x, y, z) => L[n] && gl.uniform3f(L[n], x, y, z),
      v4: (n, x, y, z, w) => L[n] && gl.uniform4f(L[n], x, y, z, w),
      v4a: (n, arr) => L[n] && gl.uniform4fv(L[n], arr),
      tex: (n, t, unit) => { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, t); if (L[n]) gl.uniform1i(L[n], unit); },
    };
    if (L.uRes) gl.uniform2f(L.uRes, w, h);
    setup(u);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  }

  #ensure(vis) {
    if (this.programs.has(vis.id)) return !!this.programs.get(vis.id);
    let p = null;
    try { p = this.#program(HEADER + "\n" + vis.frag, vis.id); }
    catch (e) { this.onError(`Visual "${vis.name}" kon niet laden: ${e.message}`); }
    this.programs.set(vis.id, p);
    return !!p;
  }

  #program(frag, label) {
    const gl = this.gl;
    const sh = (type, src) => {
      const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { const log = gl.getShaderInfoLog(s); gl.deleteShader(s); throw new Error(`[${label}] ${log}`); }
      return s;
    };
    const prog = gl.createProgram();
    const shaders = [];
    try {
      shaders.push(sh(gl.VERTEX_SHADER, VERT));
      shaders.push(sh(gl.FRAGMENT_SHADER, frag));
      shaders.forEach((shader) => gl.attachShader(prog, shader));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`[${label}] ${gl.getProgramInfoLog(prog)}`);
    } catch (e) { gl.deleteProgram(prog); throw e; }
    finally { shaders.forEach((shader) => gl.deleteShader(shader)); }
    const loc = {};
    const n = gl.getProgramParameter(prog, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(prog, i); const name = info.name.replace(/\[0\]$/, ""); loc[name] = gl.getUniformLocation(prog, info.name); }
    return { prog, loc };
  }

  #texture(w, h) {
    const gl = this.gl, t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, w, h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  #target(w, h) {
    const gl = this.gl;
    const tex = this.#texture(w, h);
    const fb = gl.createFramebuffer();
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE && this.hdr) {
      // half-float not renderable after all: fall back to 8-bit everywhere
      this.hdr = false; gl.deleteFramebuffer(fb); gl.deleteTexture(tex); return this.#target(w, h);
    }
    gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT);
    return { tex, fb, w, h };
  }

  #copy(src, dst) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.READ_FRAMEBUFFER, src.fb);
    gl.bindFramebuffer(gl.DRAW_FRAMEBUFFER, dst.fb);
    gl.blitFramebuffer(0, 0, src.w, src.h, 0, 0, dst.w, dst.h, gl.COLOR_BUFFER_BIT, gl.LINEAR);
  }

  #free(t) { if (!t) return; this.gl.deleteFramebuffer(t.fb); this.gl.deleteTexture(t.tex); }
  #freeSlot(s) { s.t.forEach((t) => this.#free(t)); }

  #resize(force = false) {
    const dpr = Math.min(3, window.devicePixelRatio || 1);
    const r = this.canvas.getBoundingClientRect();
    const W = Math.max(2, Math.round(r.width * dpr)), H = Math.max(2, Math.round(r.height * dpr));
    const RW = Math.max(2, Math.round(W * this.scale)), RH = Math.max(2, Math.round(H * this.scale));
    if (!force && W === this.W && H === this.H && RW === this.RW && RH === this.RH) return;
    this.W = W; this.H = H; this.canvas.width = W; this.canvas.height = H;
    this.RW = RW; this.RH = RH;
    this.BW = Math.max(2, RW >> 2); this.BH = Math.max(2, RH >> 2);
    [this.mixT, this.bloomA, this.bloomB].forEach((t) => this.#free(t));
    this.mixT = this.#target(RW, RH);
    this.bloomA = this.#target(this.BW, this.BH);
    this.bloomB = this.#target(this.BW, this.BH);
    for (const s of [this.cur, this.old]) if (s) {
      const previous = s.t[s.i];
      const targets = (s.frozen || !s.vis.feedback) ? [this.#target(RW, RH)] : [this.#target(RW, RH), this.#target(RW, RH)];
      targets.forEach((target) => this.#copy(previous, target));
      this.#freeSlot(s); s.t = targets; s.i = 0;
    }
  }

  #adapt(dt, time) {
    this.frameMs = this.frameMs * 0.92 + dt * 1000 * 0.08;
    if (time - this.lastAdapt < 1.5) return;
    this.lastAdapt = time;
    let s = this.scale;
    const floor = Math.min(this.minScale ?? 0.67, this.maxScale);
    if (this.frameMs > 22 && s > floor) s = Math.max(floor, s - 0.11);
    else if (this.frameMs < 14 && s < this.maxScale) s = Math.min(this.maxScale, s + 0.11);
    if (s !== this.scale) { this.scale = s; this.#resize(true); }
  }
}
