// WebGL2 render engine: visual → (crossfade) → bloom → tonemap/grain → screen.
// Visuals are plain objects from js/visuals/*.js: { id, name, frag, bloom?, feedback?, caption? }.

import { HEADER, VERT, MIX_FRAG, BRIGHT_FRAG, BLUR_FRAG, FINAL_FRAG } from "./glsl.js";

export class Engine {
  constructor(canvas, visuals, { onError } = {}) {
    this.canvas = canvas;
    this.visuals = visuals;
    this.onError = onError || ((m) => console.error(m));
    const gl = canvas.getContext("webgl2", { antialias: false, alpha: false, depth: false, stencil: false, premultipliedAlpha: false, powerPreference: "high-performance" });
    if (!gl) throw new Error("WebGL2 wordt niet ondersteund door deze browser.");
    this.gl = gl;
    this.hdr = !!gl.getExtension("EXT_color_buffer_float") || !!gl.getExtension("EXT_color_buffer_half_float");
    gl.getExtension("KHR_parallel_shader_compile");
    this.vao = gl.createVertexArray();
    this.programs = new Map();      // visual id → { prog, loc } | null when broken
    this.post = {
      mix: this.#program(MIX_FRAG, "mix"),
      bright: this.#program(BRIGHT_FRAG, "bright"),
      blur: this.#program(BLUR_FRAG, "blur"),
      final: this.#program(FINAL_FRAG, "final"),
    };
    this.scale = 0.62;               // render scale vs canvas pixels (adaptive)
    this.maxScale = 0.85;
    this.cur = null; this.old = null; this.fade = 1; this.fadeDur = 1.6;
    this.travel = 0;
    this.frameMs = 16; this.lastAdapt = 0;
    this.artTex = this.#texture(2, 2);
    this.W = 0; this.H = 0;
    this.#resize();
  }

  // ---------- public ----------

  /** Switch to a visual; crossfades from the current one. */
  setVisual(id, { instant = false } = {}) {
    const vis = this.visuals.find((v) => v.id === id) || this.visuals[0];
    if (this.cur && this.cur.vis.id === vis.id) return vis;
    if (!this.#ensure(vis)) return this.cur?.vis;
    const slot = { vis, t: [this.#target(this.RW, this.RH), this.#target(this.RW, this.RH)], i: 0 };
    if (this.old) this.#freeSlot(this.old);
    this.old = instant ? null : this.cur;
    if (instant && this.cur) this.#freeSlot(this.cur);
    this.cur = slot;
    this.fade = this.old ? 0 : 1;
    return vis;
  }

  /** Compile remaining visuals a few at a time so the first frame is not blocked. */
  warmUp() {
    const todo = this.visuals.filter((v) => !this.programs.has(v.id));
    const step = () => { const v = todo.shift(); if (!v) return; this.#ensure(v); setTimeout(step, 60); };
    setTimeout(step, 400);
  }

  setArt(img, pal) {
    const gl = this.gl;
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
    this.#adapt(f.dt, f.time);
    this.travel += f.dt * (0.35 + f.audio.energy * 0.9 + f.audio.kick * 0.9 + f.drop * 6.0);
    if (this.fade < 1) this.fade = Math.min(1, this.fade + f.dt / this.fadeDur);
    if (this.fade >= 1 && this.old) { this.#freeSlot(this.old); this.old = null; }

    gl.bindVertexArray(this.vao);
    gl.disable(gl.BLEND); gl.disable(gl.DEPTH_TEST);

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
    // final
    const bloomAmt = (this.cur.vis.bloom ?? 0.9) * ease + (this.old ? (this.old.vis.bloom ?? 0.9) * (1 - ease) : 0);
    this.#pass(this.post.final, null, (u) => {
      u.tex("uScene", this.mixT.tex, 0); u.tex("uBloom", this.bloomA.tex, 1);
      u.f("uBloomAmt", bloomAmt); u.f("uTime", f.time); u.f("uGrain", 0.035);
    });
  }

  get currentVisual() { return this.cur?.vis; }

  // ---------- internals ----------

  #drawVisual(slot, f) {
    const p = this.programs.get(slot.vis.id);
    const src = slot.t[slot.i], dst = slot.t[1 - slot.i];
    if (!p) return src.tex;
    const gl = this.gl, L = p.loc;
    gl.bindFramebuffer(gl.FRAMEBUFFER, dst.fb);
    gl.viewport(0, 0, dst.w, dst.h);
    gl.useProgram(p.prog);
    const A = f.audio, pal = f.pal;
    const set1 = (n, v) => { if (L[n]) gl.uniform1f(L[n], v); };
    if (L.uRes) gl.uniform2f(L.uRes, dst.w, dst.h);
    set1("uTime", f.time); set1("uSongTime", f.songTime); set1("uBeat", A.beat);
    set1("uKick", A.kick); set1("uSnare", A.snare); set1("uHat", A.hat); set1("uEnergy", A.energy); set1("uLevel", A.level);
    set1("uDrop", f.drop); set1("uTravel", this.travel); set1("uSeed", f.seed);
    if (L.uBands) gl.uniform1fv(L.uBands, A.bands);
    if (L.uPeaks) gl.uniform1fv(L.uPeaks, A.peaks);
    if (L.uPal) gl.uniform3fv(L.uPal, [...pal.dark, ...pal.mid, ...pal.hi, ...pal.hot].map((v) => v / 255));
    gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, src.tex); if (L.uPrev) gl.uniform1i(L.uPrev, 0);
    gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.artTex); if (L.uArt) gl.uniform1i(L.uArt, 1);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    slot.i = 1 - slot.i;
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
    gl.attachShader(prog, sh(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, frag));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(`[${label}] ${gl.getProgramInfoLog(prog)}`);
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

  #free(t) { if (!t) return; this.gl.deleteFramebuffer(t.fb); this.gl.deleteTexture(t.tex); }
  #freeSlot(s) { s.t.forEach((t) => this.#free(t)); }

  #resize(force = false) {
    const dpr = Math.min(2, window.devicePixelRatio || 1);
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
    for (const s of [this.cur, this.old]) if (s) { this.#freeSlot(s); s.t = [this.#target(RW, RH), this.#target(RW, RH)]; s.i = 0; }
  }

  #adapt(dt, time) {
    this.frameMs = this.frameMs * 0.92 + dt * 1000 * 0.08;
    if (time - this.lastAdapt < 1.5) return;
    this.lastAdapt = time;
    let s = this.scale;
    if (this.frameMs > 24 && s > 0.34) s = Math.max(0.34, s - 0.08);
    else if (this.frameMs < 15 && s < this.maxScale) s = Math.min(this.maxScale, s + 0.04);
    if (s !== this.scale) { this.scale = s; this.#resize(true); }
  }
}
