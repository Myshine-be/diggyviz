// Bloop — an original DiggyViz character: a jelly creature that hops to the next neon platform
// on every beat, collects spinning records and is chased by three pixel critters ("Glitchies").
// After 90 visible seconds the stage turns into a disco: Bloop grows and dances centre stage,
// the Glitchies orbit and the collected records form a ring under a spinning mirror ball.
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

vec3 bloopChar(vec3 col, vec2 q, float land, float scale, float aa) {
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
    col = mix(col, vec3(0.03), disk(eq - vec2(0.004, -0.001), 0.0055, aa) * m);
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

void main() {
  vec2 p = P();
  float tall = clamp(uRes.y / uRes.x - 1.0, 0.0, 1.3);
  float zoom = 1.0 - 0.27 * tall;
  p = p * zoom + vec2(0.0, 0.06 * tall);
  float aa = 1.2 * zoom / min(uRes.x, uRes.y);
  BX = -0.12 + 0.19 * tall;
  float t = uSceneTime, b = uSceneBeat, egg = surprise(t);
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
    col = mix(col, mix(uPal[0] * 0.55, uPal[0] * 0.3 + uPal[1] * 0.06, fl), bar * (1.0 - egg * 0.7));
    col += uPal[1] * exp(-abs(p.y - h) * 300.0) * step(0.1, fract(sx / cw)) * step(fract(sx / cw), 0.9) * 0.06 * (1.0 - egg);   // glowing bar tops
  }

  // disco rays + mirror ball for the reward
  if (egg > 0.0) {
    vec2 mb = p - vec2(0.0, 0.33);
    float a = atan(mb.y, mb.x);
    float rays = pow(abs(sin(a * 9.0 + t * 0.8)), 24.0) * smoothstep(0.03, 0.3, length(mb));
    col += pal(fract(a / TAU + t * 0.05)) * rays * egg * 0.35;
    float ball = disk(mb, 0.055, aa);
    vec2 tiles = floor((rot(t * 0.6) * mb) * 90.0);
    col = mix(col, mix(vec3(0.35), vec3(1.0), step(0.6, hash12(tiles + floor(t * 6.0)))) * (0.6 + 0.4 * uKick), ball * egg);
    col = mix(col, vec3(0.6), strokeSeg(p, vec2(0.0, 0.385), vec2(0.0, 0.6), 0.0015, aa) * egg);
  }

  // platforms
  float pi0 = floor(wx / SP + 0.5);
  for (int k = -1; k <= 1; k++) {
    float i = pi0 + float(k);
    vec2 q = vec2(wx - i * SP, p.y - platH(i));
    float since = b - (i - 1.0);                         // beats since Bloop landed here
    float flash = since >= 1.0 ? exp(-(since - 1.0) * 3.0) : 0.0;
    float top = boxMask(q - vec2(0.0, -0.012), vec2(0.07, 0.012), 0.008, aa);
    col = mix(col, mix(uPal[0], uPal[1], 0.35) + 0.02, top * (1.0 - egg));
    float edge = 1.0 - smoothstep(0.0012 - aa, 0.0012 + aa, abs(boxSDF(q - vec2(0.0, -0.012), vec2(0.07, 0.012), 0.008)));
    col += mix(uPal[1], uPal[3], flash) * edge * (0.55 + 1.2 * flash) * (1.0 - egg);
    col += uPal[1] * exp(-max(-q.y, 0.0) * 30.0) * step(abs(q.x), 0.07) * step(q.y, -0.024) * 0.08 * (1.0 - egg);  // underglow
    // record above the platform: collected when Bloop passes
    float taken = smoothstep(i - 0.1, i + 0.05, b);
    vec2 rq = q - vec2(0.0, 0.085 + sin(t * 2.0 + i) * 0.006);
    col = mix(col, record(col, rq, t * 3.0 + i, aa), (1.0 - taken) * (1.0 - egg));
    // sparkle burst where it was collected
    float pop = (b - i) * step(i, b);
    float burst = exp(-pop * 4.0) * step(0.0, pop);
    for (int s = 0; s < 6; s++) {
      float a = float(s) * TAU / 6.0 + i;
      vec2 sp = rq - vec2(cos(a), sin(a)) * pop * 0.12;
      col += uPal[2] * disk(sp, 0.004, aa) * burst * (1.0 - egg);
    }
  }

  // Glitchies follow Bloop's path at a distance (orbit during the reward)
  for (int g = 2; g >= 0; g--) {
    float fg = float(g);
    vec2 w = hopPath(b - 1.15 - fg * 0.8);
    vec2 pos = vec2(w.x - scroll + BX, w.y + 0.026);
    float a = fg * TAU / 3.0 + t * 1.2;
    pos = mix(pos, vec2(cos(a) * 0.17, -0.02 + sin(a) * 0.07), egg);
    vec3 tint = g == 0 ? uPal[3] : g == 1 ? uPal[2] : mix(uPal[1], vec3(1.0), 0.4);
    col = glitchy(col, p - pos, fg, mix(0.013, 0.015, egg), tint);
  }

  // records orbit as a ring during the reward
  if (egg > 0.0) {
    for (int r = 0; r < 10; r++) {
      float a = float(r) * TAU / 10.0 - t * 0.7;
      vec2 c = vec2(cos(a) * 0.3, -0.02 + sin(a) * 0.12 + sin(b * PI + float(r)) * 0.01);
      col = mix(col, record(col, p - c, t * 4.0 + float(r), aa), egg);
    }
  }

  // Bloop
  vec2 feet = hopPath(b);
  vec2 bp = vec2(BX, feet.y);
  float f = fract(b);
  float land = exp(-f * 9.0) - 0.6 * sin(PI * f) * step(f, 0.5) * 0.3;
  vec2 dance = vec2(sin(b * PI * 0.5) * 0.04, -0.07 + abs(sin(b * PI)) * 0.05);
  bp = mix(bp, dance, egg);
  float scale = mix(1.3, 2.4, egg);
  // contact shadow on the platform
  float shadowY = mix(platH(floor(b + 0.5)), -0.07, egg);
  col *= 1.0 - 0.5 * exp(-dot((p - vec2(bp.x, shadowY)) * vec2(14.0, 60.0) / scale, (p - vec2(bp.x, shadowY)) * vec2(14.0, 60.0) / scale)) * (1.0 - smoothstep(0.0, 0.15, bp.y - shadowY));
  col = bloopChar(col, p - bp, max(land, 0.0), scale, aa);

  fragColor = vec4(max(col, vec3(0.0)), 1.0);
}`,
};
