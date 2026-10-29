// Bloop — a Glorp (DiggyViz's own alien species, see story-shapes.js) on his home planet. He hops over rocks,
// mushroom houses and crystals on every beat (a big leap every eighth beat), collects spinning records and is
// chased by three pixel critters ("Glitchies"). Behind him: an alien sky with two moons and the ringed planet
// from Ruimtereis, crystal mountains and glowing alien plants; the ground breathes softly with the bass.
// After 90 visible seconds a flying saucer arrives, beams down an alien and the alien chases Bloop,
// hopping on every beat and slowly closing in. The alien stays until the viewer changes visual.
import { STORY_SHAPES } from "./story-shapes.js";

export default {
  id: "bloop", name: "Bloop", story: true, duration: 120, bloom: 0.5,
  lyrics: { y: 0.85, big: 0.2 },          // the sung line in the alien sky; the wall fills the background
  frag: STORY_SHAPES + /* glsl */ `
const float SP = 0.22;      // platform spacing (world units per beat)
float BX = -0.12;           // Bloop's fixed screen x while the world scrolls (moved right in portrait)

float platH(float i) { return -0.17 + (hash12(vec2(i, 7.3)) - 0.5) * 0.16; }

// Feet position (world space) after b beats: one hop per beat, landing on platform floor(b)+1.
vec2 hopPath(float b) {
  float i = floor(b), f = fract(b);
  float y = mix(platH(i), platH(i + 1.0), smoothstep(0.0, 1.0, f));
  float big = step(7.0, mod(i, 8.0));                 // every eighth beat: a big leap
  y += sin(PI * f) * (0.11 + 0.03 * uEnergy + 0.09 * big);
  return vec2(b * SP, y + 0.012);
}

vec3 record(vec3 col, vec2 q, float spin, float aa) {
  float r = length(q);
  float body = disk(q, 0.026, aa);
  col = mix(col, vec3(0.02), body);
  float grooves = gridLine(r * 220.0, 0.12) * body * step(0.009, r);
  col += uPal[1] * grooves * 0.25;
  vec2 rq = rot(spin) * q;
  col += vec3(1.0) * body * smoothstep(0.6, 1.0, rq.x / max(r, 1e-4)) * 0.25;   // spinning sheen
  col = mix(col, uPal[3], disk(q, 0.008, aa));                                // label
  return col;
}

// 4x4 pixel critter, pattern chosen per id; one blinking eye pixel.
vec3 glitchy(vec3 col, vec2 q, float id, float s, vec3 tint) {
  vec2 g = q / s + 2.0;
  if (g.x < 0.0 || g.y < 0.0 || g.x >= 4.0 || g.y >= 4.0) return col;
  vec2 c = floor(g);
  float bits = id < 0.5 ? 26214.0 : id < 1.5 ? 63903.0 : 47975.0;     // 16-bit shapes
  float bit = mod(floor(bits / exp2(c.y * 4.0 + c.x)), 2.0);
  bit = max(bit, step(0.5, c.y) * step(c.y, 2.5) * step(0.5, c.x) * step(c.x, 2.5)); // solid core
  vec2 f = fract(g);
  float inset = step(0.08, f.x) * step(f.x, 0.92) * step(0.08, f.y) * step(f.y, 0.92);
  col = mix(col, tint * (0.9 + 0.3 * uKick), bit * inset);
  float blink = step(0.12, fract(uSceneBeat * 0.25 + id * 0.37));
  float eye = step(1.0, c.x) * step(c.x, 1.0) * step(2.0, c.y) * step(c.y, 2.0);
  col = mix(col, vec3(1.0), eye * inset * blink);
  return col;
}

vec3 bloopChar(vec3 col, vec2 q, float land, float scale, float aa, float look) {
  q /= scale; aa /= scale;
  // squash on landing, stretch while rising
  q *= vec2(1.0 - 0.22 * land, 1.0 + 0.25 * land);
  float body = boxSDF(q - vec2(0.0, 0.038), vec2(0.036, 0.03), 0.032);
  body = smin(body, length(q - vec2(0.0, 0.074)) - 0.024, 0.03);              // soft crown
  float m = 1.0 - smoothstep(-aa, aa, body);
  vec3 jelly = mix(uPal[1] * 0.75, uPal[1] * 1.15 + 0.05, smoothstep(0.0, 0.09, q.y));
  col = mix(col, jelly, m);
  col += uPal[2] * (1.0 - smoothstep(0.0015 - aa, 0.0015 + aa, abs(body))) * 0.9;  // rim light
  col += vec3(1.0) * disk(q - vec2(-0.022, 0.07), 0.007, aa) * m * 0.55;          // gloss
  // eyes (look forward, blink every 8 beats)
  float blink = 1.0 - 0.9 * step(0.94, fract(uSceneBeat / 8.0));
  for (int e = 0; e < 2; e++) {
    vec2 eq = (q - vec2(float(e) * 0.026 - 0.006, 0.046)) * vec2(1.0, 1.0 / max(blink, 0.1));
    col = mix(col, vec3(1.0), disk(eq * vec2(1.25, 1.0), 0.011, aa) * m);
    col = mix(col, vec3(0.03), disk(eq - vec2(0.004 * look, -0.001), 0.0055, aa) * m);
  }
  col = mix(col, uPal[3] * 0.9, disk((q - vec2(0.03, 0.03)) * vec2(1.0, 1.8), 0.006, aa) * m * 0.7); // cheek
  // antenna with a bulb that flashes on the kick
  float stalk = strokeSeg(q, vec2(0.004, 0.096), vec2(0.016, 0.125), 0.0022, aa);
  col = mix(col, uPal[1] * 0.8, stalk);
  vec2 bulb = q - vec2(0.016, 0.13);
  col = mix(col, mix(uPal[2], vec3(1.0), uKick), disk(bulb, 0.008, aa));
  col += uPal[2] * exp(-length(bulb) * 60.0) * (0.25 + uKick * 0.9);
  return col;
}

// Original alien: big head, large dark eyes, two antennae, small body and legs. Squashes on landing.
vec3 alienChar(vec3 col, vec2 q, float land, float scale, float aa) {
  q /= scale; aa /= scale;
  if (abs(q.x) > 0.08 || q.y < -0.01 || q.y > 0.16) return col;
  q *= vec2(1.0 - 0.2 * land, 1.0 + 0.22 * land);
  vec3 skin = mix(uPal[3], vec3(0.55, 1.0, 0.6), 0.45);
  float legs = max(strokeSeg(q, vec2(-0.01, 0.022), vec2(-0.016, 0.002), 0.004, aa), strokeSeg(q, vec2(0.01, 0.022), vec2(0.016, 0.002), 0.004, aa));
  col = mix(col, skin * 0.6, legs);
  float body = 1.0 - smoothstep(-aa, aa, boxSDF(q - vec2(0.0, 0.034), vec2(0.016, 0.016), 0.012));
  col = mix(col, skin * 0.8, body);
  vec2 hq = (q - vec2(0.0, 0.08)) / vec2(0.042, 0.034);
  hq.y += 0.25 * hq.x * hq.x * step(hq.y, 0.0);                     // narrower chin
  float head = 1.0 - smoothstep(1.0 - aa * 30.0, 1.0 + aa * 30.0, length(hq));
  col = mix(col, mix(skin * 0.85, skin * 1.1, smoothstep(-1.0, 1.0, hq.y)), head);
  col += uPal[2] * (1.0 - smoothstep(0.0, aa * 40.0, abs(length(hq) - 1.0))) * 0.6 * step(0.0, hq.y + 1.2);
  for (int e = 0; e < 2; e++) {
    float sx = e == 0 ? -1.0 : 1.0;
    vec2 eq = rot(sx * 0.45) * (q - vec2(sx * 0.017, 0.078));
    float eye = disk(eq / vec2(1.0, 0.55), 0.0135, aa);
    col = mix(col, vec3(0.02), eye * head);
    col += vec3(1.0) * disk(eq - vec2(-0.004, 0.003), 0.0025, aa) * 0.8 * head;
  }
  for (int a = 0; a < 2; a++) {
    float sx = a == 0 ? -1.0 : 1.0;
    col = mix(col, skin * 0.7, strokeSeg(q, vec2(sx * 0.012, 0.11), vec2(sx * 0.024, 0.135), 0.0018, aa));
    col = mix(col, uPal[2], disk(q - vec2(sx * 0.024, 0.137), 0.005, aa));
  }
  return col;
}
// soft tractor beam from the saucer (top) to the ground (bottom); no flicker
vec3 beam(vec3 col, vec2 p, vec2 top, vec2 bottom, float on) {
  if (on <= 0.0) return col;
  float span = top.y - bottom.y;
  float u = clamp((top.y - p.y) / max(span, 1e-3), 0.0, 1.0);
  float x = p.x - mix(top.x, bottom.x, u);
  float w = 0.025 + u * 0.05;
  float m = (1.0 - smoothstep(w * 0.7, w, abs(x))) * step(p.y, top.y) * step(bottom.y - 0.02, p.y);
  float rings = 0.85 + 0.15 * sin((p.y - uTime * 0.15) * 70.0);
  return col + uPal[2] * m * on * 0.22 * rings;
}

void main() {
  vec2 p = P();
  float tall = clamp(uRes.y / uRes.x - 1.0, 0.0, 1.3);
  float zoom = 1.0 - 0.27 * tall;
  p = p * zoom + vec2(0.0, 0.06 * tall);
  float aa = 1.2 * zoom / min(uRes.x, uRes.y);
  BX = -0.12 + 0.19 * tall;
  float t = uSceneTime, b = uSceneBeat;
  float scroll = b * SP;
  float wx = p.x - BX + scroll;                        // world x of this pixel

  // alien sky: cover colours, stars, two moons and the ringed planet from Ruimtereis
  vec3 col = mix(uPal[0] * 0.3 + uPal[1] * 0.06, uPal[0] * 0.07, smoothstep(-0.3, 0.55, p.y));
  vec2 st = p * 60.0 + vec2(scroll * 1.5, 0.0);
  col += mix(vec3(1.0), uPal[2], 0.4) * exp(-dot(fract(st) - 0.5, fract(st) - 0.5) * 140.0) * step(0.975, hash12(floor(st))) * 0.4 * smoothstep(-0.1, 0.3, p.y);
  {
    vec2 m1 = p - vec2(0.33 - scroll * 0.01, 0.31);
    col = mix(col, mix(uPal[2], vec3(1.0), 0.5) * (0.6 + 0.4 * smoothstep(0.05, -0.05, m1.x + m1.y)), disk(m1, 0.045, aa));
    col += mix(uPal[2], vec3(1.0), 0.5) * exp(-length(m1) * 18.0) * 0.12;
    vec2 m2 = p - vec2(-0.05 - scroll * 0.006, 0.38);
    col = mix(col, mix(uPal[3], vec3(1.0), 0.3) * 0.9, disk(m2, 0.018, aa));
    // ringed planet: its ringlets glow with bass → highs, like in Ruimtereis
    vec2 rp = p - vec2(-0.32 - scroll * 0.004, 0.26);
    vec2 rr = rot(-0.3) * rp;
    float e = length(rr / vec2(1.0, 0.27));
    vec3 ringC = vec3(0.0); float ra = 0.0;
    for (int i = 0; i < 4; i++) { float fi = float(i); float lv = histSmooth(0.05 + fi * 0.25, 0.0);
      float bnd = 1.0 - smoothstep(0.002, 0.0045, abs(e - 0.075 - fi * 0.011));
      ringC += pal(0.3 + fi * 0.2) * bnd * (0.4 + lv); ra = max(ra, bnd * 0.8); }
    col = mix(col, ringC, ra * step(0.0, rr.y));
    float pd = disk(rp, 0.045, aa);
    col = mix(col, mix(uPal[1], uPal[3], 0.3) * (0.35 + 0.65 * smoothstep(0.04, -0.03, rp.x - rp.y)) + 0.02 * sin(rp.y * 120.0), pd);
    col = mix(col, ringC, ra * step(rr.y, 0.0));
  }
  // crystal mountains far away, then hills with glowing alien plants (parallax)
  {
    float sx = p.x + scroll * 0.12;
    float h = -0.02 + 0.09 * abs(fract(sx * 2.2) - 0.5) * 2.0 * (0.6 + 0.4 * hash12(vec2(floor(sx * 2.2), 1.0))) + 0.04 * fbm2(vec2(sx * 3.0, 0.0));
    float mtn = step(p.y, h);
    col = mix(col, mix(uPal[0] * 0.6, uPal[1] * 0.25, 0.3), mtn);
    col += uPal[2] * exp(-abs(p.y - h) * 260.0) * 0.12 * (1.0 - mtn * 0.5);                 // icy ridge light
  }
  {
    float sx = p.x + scroll * 0.35;
    float h = -0.13 + 0.035 * sin(sx * 7.0) + 0.02 * sin(sx * 17.0 + 1.0);
    col = mix(col, uPal[0] * 0.45 + uPal[1] * 0.05, step(p.y, h));
    float ci = floor(sx / 0.09);
    float px_ = sx - (ci + 0.5) * 0.09;
    if (hash12(vec2(ci, 3.0)) > 0.45) {                   // an alien plant: curved stalk with a glowing bulb
      float ph = 0.04 + 0.04 * hash12(vec2(ci, 5.0));
      float sway = 0.006 * sin(uSceneBeat * PI + ci);
      vec2 base = vec2(0.0, h + 0.035 * sin((sx - px_) * 7.0) * 0.0);
      vec2 tip = base + vec2(sway, ph);
      col = mix(col, uPal[1] * 0.5, strokeSeg(vec2(px_, p.y), base, tip, 0.0018, aa));
      float glow = 0.5 + 0.5 * histSmooth(fract(ci * 0.37), 0.0);
      col = mix(col, mix(pal(fract(ci * 0.29)), vec3(1.0), 0.2), disk(vec2(px_, p.y) - tip, 0.006, aa));
      col += pal(fract(ci * 0.29)) * exp(-length(vec2(px_, p.y) - tip) * 70.0) * 0.25 * glow;
    }
  }
  col *= 1.0 - 0.45 * smoothstep(-0.14, -0.5, p.y);          // deeper ground fades into shadow
  // the ground breathes softly with the bass
  col += uPal[1] * exp(-max(p.y + 0.26, 0.0) * 9.0) * 0.07 * (0.6 + 0.6 * histSmooth(0.05, 0.0)) * step(p.y, -0.1);

  // platforms
  float pi0 = floor(wx / SP + 0.5);
  for (int k = -1; k <= 1; k++) {
    float i = pi0 + float(k);
    vec2 q = vec2(wx - i * SP, p.y - platH(i));
    float since = b - (i - 1.0);                         // beats since Bloop landed here
    float flash = since >= 1.0 ? exp(-(since - 1.0) * 3.0) : 0.0;
    // what Bloop lands on: a boulder, a mushroom house or a crystal (chosen per spot)
    float kind = hash12(vec2(i, 11.0));
    if (kind < 0.4) {                                    // boulder with moss
      float rock = disk((q - vec2(0.0, -0.05)) * vec2(0.85, 1.25), 0.07, aa);
      col = mix(col, mix(uPal[0] * 1.6 + 0.04, vec3(0.35), 0.4) * (0.7 + 0.5 * smoothstep(-0.1, 0.0, q.y - q.x)), rock);
    } else if (kind < 0.72) {                            // mushroom house: stalk with a door and window, round cap
      col = mix(col, vec3(0.85, 0.8, 0.7) * 0.75, boxMask(q - vec2(0.0, -0.07), vec2(0.03, 0.06), 0.01, aa));
      col = mix(col, uPal[0] * 0.8, boxMask(q - vec2(0.0, -0.105), vec2(0.009, 0.02), 0.008, aa));
      col += uPal[2] * disk(q - vec2(0.016, -0.06), 0.006, aa) * 0.9;
      float cap = disk((q - vec2(0.0, -0.012)) * vec2(0.8, 1.9), 0.07, aa) * step(-0.024, q.y);
      col = mix(col, mix(uPal[3], uPal[1], 0.25) * (0.7 + 0.4 * smoothstep(-0.02, 0.02, q.y)), cap);
      for (int d = 0; d < 3; d++) col = mix(col, vec3(0.95), disk(q - vec2(float(d - 1) * 0.03, -0.003 + 0.004 * float(d % 2)), 0.006, aa) * cap);
    } else {                                             // crystal cluster
      for (int c = 0; c < 3; c++) {
        float fc = float(c) - 1.0;
        vec2 cq = q - vec2(fc * 0.035, -0.11);
        cq = rot(fc * 0.25) * cq;
        float hgt = c == 1 ? 0.11 : 0.07;
        float wdt = c == 1 ? 0.022 : 0.016;
        float cry = step(abs(cq.x), wdt) * step(0.0, cq.y) * step(cq.y, hgt - abs(cq.x) * 1.6);
        vec3 cc = mix(uPal[2], uPal[1], 0.35 + 0.2 * fc) * (0.5 + 0.7 * step(0.0, cq.x));      // two facets
        col = mix(col, cc, cry);
        col += vec3(1.0) * cry * (1.0 - smoothstep(0.0, 0.0025, abs(cq.x))) * 0.35;
      }
    }
    // a soft glow where Bloop just landed (local, fades in a moment)
    col += mix(uPal[1], uPal[3], 0.5) * exp(-dot(q * vec2(9.0, 40.0), q * vec2(9.0, 40.0))) * 0.35 * flash;
    // record above the platform: collected when Bloop passes
    float taken = smoothstep(i - 0.1, i + 0.05, b);
    vec2 rq = q - vec2(0.0, 0.085 + sin(t * 2.0 + i) * 0.006);
    col = mix(col, record(col, rq, t * 3.0 + i, aa), 1.0 - taken);
    // sparkle burst where it was collected
    float pop = (b - i) * step(i, b);
    float burst = exp(-pop * 4.0) * step(0.0, pop);
    for (int s = 0; s < 6; s++) {
      float a = float(s) * TAU / 6.0 + i;
      vec2 sp = rq - vec2(cos(a), sin(a)) * pop * 0.12;
      col += uPal[2] * disk(sp, 0.004, aa) * burst;
    }
  }

  // One arrival per visit. The alien keeps chasing beyond 120 s (Auto off).
  // Exactly one beat behind: both characters land on the same musical beats.
  float alienOn = step(94.0, t), lag = 1.0;
  vec2 aw = hopPath(b - lag);
  vec2 chase = vec2(aw.x - scroll + BX, aw.y);
  vec2 hover = vec2(BX - lag * SP, 0.27);
  float arrival = smoothstep(90.0, 94.0, t), departure = smoothstep(97.0, 101.0, t);
  vec2 ufoPos = mix(vec2(0.75, 0.7), hover, arrival) + vec2(0.9, 0.6) * departure;
  float ufoOn = step(90.0, t) * (1.0 - step(101.0, t));
  float down = smoothstep(94.0, 96.0, t);
  vec2 alienPos = mix(ufoPos - vec2(0.0, 0.03), chase, down);
  float alienScale = 1.3 * mix(0.35, 1.0, down);
  float beamOn = smoothstep(93.6, 94.2, t) * (1.0 - smoothstep(96.0, 96.6, t));
  col = beam(col, p, ufoPos - vec2(0.0, 0.01), alienPos, beamOn);
  float chasing = step(96.0, t);

  // Glitchies follow Bloop's path at a distance (they hang back while the alien chases)
  for (int g = 2; g >= 0; g--) {
    float fg = float(g);
    vec2 w = hopPath(b - 1.15 - fg * 0.8 - alienOn * 1.2);
    vec2 pos = vec2(w.x - scroll + BX, w.y + 0.026);
    vec3 tint = g == 0 ? uPal[3] : g == 1 ? uPal[2] : mix(uPal[1], vec3(1.0), 0.4);
    col = glitchy(col, p - pos, fg, 0.013, tint);
  }

  // the alien (behind Bloop) and the saucer
  if (alienOn > 0.0) {
    float fa = fract(b - lag);
    float landA = chasing * max(exp(-fa * 9.0), 0.0);
    col = alienChar(col, p - alienPos, landA, alienScale, aa);
  }
  if (ufoOn > 0.0) col = ufo(col, (p - ufoPos) / 1.6, aa / 1.6);

  // Bloop
  vec2 feet = hopPath(b);
  vec2 bp = vec2(BX, feet.y);
  float f = fract(b);
  float land = exp(-f * 9.0) - 0.6 * sin(PI * f) * step(f, 0.5) * 0.3;
  float scale = 1.3;
  // contact shadow on the platform
  float shadowY = platH(floor(b + 0.5));
  col *= 1.0 - 0.5 * exp(-dot((p - vec2(bp.x, shadowY)) * vec2(14.0, 60.0) / scale, (p - vec2(bp.x, shadowY)) * vec2(14.0, 60.0) / scale)) * (1.0 - smoothstep(0.0, 0.15, bp.y - shadowY));
  // while being chased Bloop glances back every fourth beat
  float look = chasing > 0.0 && fract(b / 4.0) > 0.7 ? -1.0 : 1.0;
  col = glorp(col, p - bp, 0.05, max(land, 0.0), look, aa);

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}`,
};
