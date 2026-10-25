// Bloop — an original DiggyViz character: a jelly creature that hops to the next neon platform
// on every beat, collects spinning records and is chased by three pixel critters ("Glitchies").
// After 90 visible seconds a flying saucer arrives, beams down an alien and the alien chases Bloop,
// hopping on every beat and slowly closing in. The alien stays until the viewer changes visual.
import { STORY_SHAPES } from "./story-shapes.js";

export default {
  id: "bloop", name: "Bloop", story: true, duration: 120, bloom: 0.5,
  frag: STORY_SHAPES + /* glsl */ `
const float SP = 0.22;      // platform spacing (world units per beat)
float BX = -0.12;           // Bloop's fixed screen x while the world scrolls (moved right in portrait)

float platH(float i) { return -0.17 + (hash12(vec2(i, 7.3)) - 0.5) * 0.16; }

// Feet position (world space) after b beats: one hop per beat, landing on platform floor(b)+1.
vec2 hopPath(float b) {
  float i = floor(b), f = fract(b);
  float y = mix(platH(i), platH(i + 1.0), smoothstep(0.0, 1.0, f));
  y += sin(PI * f) * (0.11 + 0.03 * uEnergy);
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

  // sky + stars
  vec3 col = mix(uPal[0] * 0.25, uPal[0] * 0.08 + uPal[1] * 0.05, smoothstep(-0.4, 0.5, p.y));
  vec2 st = p * 60.0 + vec2(scroll * 6.0, 0.0);
  col += uPal[2] * exp(-dot(fract(st) - 0.5, fract(st) - 0.5) * 140.0) * step(0.97, hash12(floor(st))) * 0.35;

  // parallax equalizer hills (two layers)
  for (int l = 0; l < 2; l++) {
    float fl = float(l);
    float sx = p.x + scroll * (0.25 + 0.25 * fl);
    float cw = 0.035 + 0.02 * fl;
    float ci = floor(sx / cw);
    float h = -0.12 - 0.06 * fl + band(fract(ci * 0.137 + fl * 0.5)) * (0.12 - 0.04 * fl) + hash12(vec2(ci, fl)) * 0.035;
    float bar = step(p.y, h) * step(0.1, fract(sx / cw)) * step(fract(sx / cw), 0.9);
    col = mix(col, mix(uPal[0] * 0.55, uPal[0] * 0.3 + uPal[1] * 0.06, fl), bar);
    col += uPal[1] * exp(-abs(p.y - h) * 300.0) * step(0.1, fract(sx / cw)) * step(fract(sx / cw), 0.9) * 0.06;   // glowing bar tops
  }

  // platforms
  float pi0 = floor(wx / SP + 0.5);
  for (int k = -1; k <= 1; k++) {
    float i = pi0 + float(k);
    vec2 q = vec2(wx - i * SP, p.y - platH(i));
    float since = b - (i - 1.0);                         // beats since Bloop landed here
    float flash = since >= 1.0 ? exp(-(since - 1.0) * 3.0) : 0.0;
    float top = boxMask(q - vec2(0.0, -0.012), vec2(0.07, 0.012), 0.008, aa);
    col = mix(col, mix(uPal[0], uPal[1], 0.35) + 0.02, top);
    float edge = 1.0 - smoothstep(0.0012 - aa, 0.0012 + aa, abs(boxSDF(q - vec2(0.0, -0.012), vec2(0.07, 0.012), 0.008)));
    col += mix(uPal[1], uPal[3], flash) * edge * (0.55 + 1.2 * flash);
    col += uPal[1] * exp(-max(-q.y, 0.0) * 30.0) * step(abs(q.x), 0.07) * step(q.y, -0.024) * 0.08;  // underglow
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
  col = bloopChar(col, p - bp, max(land, 0.0), scale, aa, look);

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}`,
};
