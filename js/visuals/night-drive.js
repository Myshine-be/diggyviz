// Ruimtereis (id stays "nightdrive" so saved choices keep working) — an original little starship glides through
// deep space between planets, asteroids, satellites and a space station. Everything listens to the music:
// the rings of the big ringed planet are the spectrum (inner ring = bass … outer ring = highs) and vibrate on the
// beat, the engines pulse with the bass, satellites blink on the beat, an asteroid shoots by on kicks.
// Easter egg (90 s, then every 2 minutes): the ship descends to a planet, lands, an astronaut steps out and dances
// with the Glorps (DiggyViz's own aliens, the same species as Bloop); then the ship takes off again.
// No screen-wide flashes: only details react. Colours follow the album cover.
import { STORY_SHAPES } from "./story-shapes.js";
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  id: "nightdrive", name: "Ruimtereis", story: true, duration: 120, bloom: 0.5,
  frag: STORY_SHAPES + SPECTRUM_HISTORY + /* glsl */ `
float HW;                       // half screen width in P() units
vec2 LIGHT = vec2(-0.8, 0.45);  // a far sun, top left

// ---------- deep space ----------
vec3 stars(vec2 p, float scroll, float scale, float seed, float bright) {
  vec2 g = (p + vec2(scroll, 0.0)) * scale;
  vec2 id = floor(g), f = fract(g) - 0.5;
  float h = hash12(id + seed);
  if (h < 0.82) return vec3(0.0);
  vec2 o = (hash22(id + seed * 1.7) - 0.5) * 0.7;
  float d = length(f - o);
  float tw = 0.75 + 0.25 * sin(uTime * (1.0 + 3.0 * h) + h * 40.0);
  float s = (0.012 + 0.02 * (h - 0.82) * 5.0) / scale * 40.0;
  vec3 tint = mix(vec3(1.0), mix(uPal[2], uPal[3], h), 0.35);
  return tint * smoothstep(s, 0.0, d) * tw * bright;
}

vec3 nebula(vec2 p, float scroll) {
  vec2 q = p * 1.4 + vec2(scroll * 0.3, 0.0);
  float n = fbm2(q + vec2(0.0, uTime * 0.01)), m = fbm2(q * 1.7 - 3.1);
  vec3 c = mix(uPal[1], uPal[3], smoothstep(0.35, 0.75, m));
  return c * smoothstep(0.45, 0.85, n) * 0.16 + uPal[2] * smoothstep(0.6, 0.95, n * m * 1.6) * 0.06;
}

vec3 galaxy(vec3 col, vec2 q) {                         // a small far spiral galaxy
  q = rot(0.5) * q; q.y *= 2.6;
  float r = length(q), a = atan(q.y, q.x);
  float arm = pow(0.5 + 0.5 * cos(2.0 * a - log(r + 1e-3) * 5.0 + uTime * 0.02), 3.0);
  float g = exp(-r * 22.0) * (0.35 + arm * 0.65) + exp(-r * 70.0);
  return col + mix(uPal[2], vec3(1.0), 0.3) * g * 0.35;
}

// ---------- planets ----------
// lit sphere with drifting cloud bands and an atmosphere rim
vec3 planet(vec3 col, vec2 q, float R, float seed, vec3 c1, vec3 c2, float aa) {
  float d = length(q);
  float atm = exp(-max(d - R, 0.0) * 60.0 / max(R, 0.05) * 0.2) * step(R, d);
  col += mix(c1, vec3(1.0), 0.3) * atm * 0.22 * smoothstep(-0.2, 0.6, dot(normalize(q + 1e-5), normalize(LIGHT)));
  if (d > R + aa) return col;
  vec3 n = vec3(q / R, sqrt(max(0.0, 1.0 - dot(q, q) / (R * R))));
  float lat = n.y, lon = atan(n.x, n.z);
  float bands = fbm2(vec2(lon * 1.2 + uTime * 0.02 + seed, lat * 7.0 + seed * 3.0));
  bands += 0.35 * sin(lat * 18.0 + bands * 4.0 + seed);
  vec3 surf = mix(c1, c2, smoothstep(0.3, 0.9, bands));
  surf = mix(surf, mix(c2, vec3(1.0), 0.5), smoothstep(0.82, 0.95, abs(lat)) * 0.6);          // polar caps
  float dif = clamp(dot(n, normalize(vec3(LIGHT, 0.6))), 0.0, 1.0);
  vec3 lit = surf * (0.06 + 0.94 * dif) + c1 * pow(1.0 - n.z, 3.0) * 0.35;                   // rim scatter
  return mix(col, lit, 1.0 - smoothstep(R - aa, R + aa, d));
}

// The ringed planet: the rings are the spectrum. 7 ringlets, bass inside, highs outside. Each one vibrates
// (radius wobble) and glows with its own band; ringlets in front of the planet cover it, behind are hidden.
vec3 ringedPlanet(vec3 col, vec2 q, float R, float aa) {
  float tilt = 0.28, spin = uTime * 0.04;
  vec2 rq = rot(-0.32) * q;
  // rings behind the planet (upper half of the ellipse)
  vec3 ringCol = vec3(0.0); float ringA = 0.0;
  float e = length(rq / vec2(1.0, tilt));               // elliptic radius in the ring plane
  for (int i = 0; i < 7; i++) {
    float fi = float(i), f = fi / 6.0;
    float lvl = histSmooth(0.04 + f * 0.8, 0.0);
    float ang = atan(rq.y / tilt, rq.x);
    float rr = R * (1.35 + fi * 0.12) + 0.004 * lvl * sin(ang * (6.0 + fi * 2.0) - uTime * 3.0 + fi);
    float w = R * (0.035 + 0.025 * lvl);
    float band = 1.0 - smoothstep(w - aa * 2.0, w + aa * 2.0, abs(e - rr));
    float grain = 0.75 + 0.25 * sin(e * 900.0 + spin * 20.0);
    vec3 c = mix(pal(0.25 + f * 0.6), vec3(1.0), 0.15 * lvl) * (0.35 + 0.95 * lvl) * grain;
    ringCol += c * band; ringA = max(ringA, band * (0.55 + 0.4 * lvl));
  }
  float front = step(0.0, -rq.y);                       // lower half of the ellipse is in front
  col = mix(col, ringCol, ringA * (1.0 - front));
  col = planet(col, q, R, 4.0, mix(uPal[1], uPal[3], 0.25), mix(uPal[2], uPal[0] * 2.0, 0.3), aa);
  // ring shadow on the planet
  float onPlanet = 1.0 - smoothstep(R - aa, R + aa, length(q));
  col *= 1.0 - 0.35 * onPlanet * smoothstep(0.02, 0.0, abs(rq.y + 0.05 * R)) ;
  col = mix(col, ringCol, ringA * front);
  return col;
}

// ---------- small things ----------
vec3 asteroid(vec3 col, vec2 q, float r, float seed, float aa) {
  float a = atan(q.y, q.x), d = length(q);
  float shape = r * (1.0 + 0.22 * (noise2(vec2(a * 1.6 + seed, seed)) - 0.5) * 2.0 + 0.08 * sin(a * 5.0 + seed));
  if (d > shape * 1.3) return col;
  float m = 1.0 - smoothstep(shape - aa, shape + aa, d);
  vec3 rock = mix(uPal[0] * 1.6 + 0.05, mix(uPal[1], vec3(0.6), 0.6) * 0.5, noise2(q / r * 3.0 + seed));
  float lit = clamp(dot(normalize(q + 1e-5), normalize(LIGHT)) * 0.5 + 0.5, 0.0, 1.0);
  rock *= 0.35 + 0.8 * lit * smoothstep(shape, shape * 0.4, d * 0.9);
  for (int k = 0; k < 3; k++) {                         // craters
    vec2 c = (hash22(vec2(seed, float(k))) - 0.5) * r * 1.1;
    float cr = r * (0.16 + 0.12 * hash12(vec2(seed, float(k) + 9.0)));
    rock *= 1.0 - 0.45 * disk(q - c, cr, aa) + 0.25 * (disk(q - c - vec2(0.2, -0.2) * cr, cr, aa) - disk(q - c, cr, aa));
  }
  return mix(col, rock, m);
}

vec3 satellite(vec3 col, vec2 q, float s, float phase, float aa) {
  q = rot(0.3 * sin(uTime * 0.2 + phase)) * q / s; aa /= s;
  if (abs(q.x) > 3.2 || abs(q.y) > 1.2) return col;
  // solar panels with a cell grid
  for (int side = 0; side < 2; side++) {
    float sx = side == 0 ? -1.75 : 1.75;
    vec2 pq = q - vec2(sx, 0.0);
    float panel = boxMask(pq, vec2(1.15, 0.42), 0.04, aa);
    vec3 pc = mix(uPal[0] * 2.0 + vec3(0.02, 0.04, 0.12), uPal[1] * 0.6, 0.35);
    pc += uPal[2] * (gridLine(pq.x * 4.0, 0.06) + gridLine(pq.y * 3.0, 0.06)) * 0.25;
    col = mix(col, pc, panel);
  }
  col = mix(col, vec3(0.55), strokeSeg(q, vec2(-0.6, 0.0), vec2(0.6, 0.0), 0.05, aa));
  float body = boxMask(q, vec2(0.45, 0.38), 0.1, aa);
  col = mix(col, mix(vec3(0.75, 0.7, 0.55), uPal[2], 0.2), body);
  col = mix(col, vec3(0.3), strokeSeg(q, vec2(0.0, 0.38), vec2(0.15, 0.95), 0.04, aa));          // antenna
  // beacon: on for the first part of every beat (a small local light)
  float on = 1.0 - smoothstep(0.1, 0.25, fract(uSceneBeat + phase));
  col += uPal[3] * disk(q - vec2(0.15, 0.95), 0.1, aa) * (0.4 + 1.2 * on);
  col += uPal[3] * exp(-length(q - vec2(0.15, 0.95)) * 5.0) * 0.25 * on;
  return col;
}

vec3 station(vec3 col, vec2 q, float s, float aa) {     // a slowly turning wheel station
  q /= s; aa /= s;
  if (length(q) > 1.4) return col;
  float a = uTime * 0.08;
  vec2 rq = rot(a) * q;
  float ring = 1.0 - smoothstep(0.1 - aa, 0.1 + aa, abs(length(q) - 1.0));
  col = mix(col, vec3(0.62, 0.64, 0.7), ring);
  for (int i = 0; i < 4; i++) {                         // spokes
    vec2 dir = vec2(cos(float(i) * PI * 0.5), sin(float(i) * PI * 0.5));
    col = mix(col, vec3(0.45), strokeSeg(rq, vec2(0.0), dir * 0.95, 0.04, aa));
  }
  for (int i = 0; i < 12; i++) {                        // windows along the ring, lit in the cover colour
    float wa = float(i) * TAU / 12.0 + a;
    col += uPal[2] * disk(q - vec2(cos(wa), sin(wa)), 0.045, aa) * 0.9;
  }
  col = mix(col, vec3(0.75), disk(q, 0.22, aa));
  col += uPal[1] * disk(q, 0.1, aa) * 0.6;
  return col;
}

// ---------- the ship: an original design (wedge hull, bubble cockpit, twin engine pods) ----------
vec3 ship(vec3 col, vec2 q, float s, float roll, float thrust, float aa) {
  q /= s; aa /= s;
  if (abs(q.x) > 2.6 || abs(q.y) > 1.2) return col;
  float sq = max(abs(cos(roll)), 0.18);
  q.y /= sq;                                            // barrel roll squashes the ship vertically
  // engine flames behind the pods (pulse with the bass)
  for (int k = 0; k < 2; k++) {
    float py = k == 0 ? 0.32 : -0.32;
    vec2 f = q - vec2(-1.05, py);
    float len = 0.35 + 0.9 * thrust;
    float along = clamp(-f.x / len, 0.0, 1.0);              // 0 at the nozzle → 1 at the tip
    float flame = (1.0 - smoothstep(0.55, 1.0, along)) * step(-len, f.x) * (1.0 - smoothstep(0.015, 0.11 * (1.0 - along) + 0.01, abs(f.y)));
    flame *= 0.7 + 0.3 * noise2(vec2(f.x * 9.0 - uTime * 30.0, float(k) * 7.0));
    col += mix(uPal[3], vec3(1.0, 0.95, 0.85), 1.0 - smoothstep(0.0, 0.35, along)) * flame * step(f.x, 0.0) * 0.9;
  }
  // wings (swept back)
  vec2 w = vec2(q.x + 0.15, abs(q.y));
  float wing = step(0.0, w.y - 0.05) * step(w.y, 0.75) * step(-0.75 + w.y * 0.9, w.x) * step(w.x, 0.15 - w.y * 0.55);
  vec3 hullC = mix(vec3(0.82, 0.84, 0.9), uPal[2], 0.15);
  col = mix(col, hullC * 0.7, wing);
  col += uPal[1] * wing * smoothstep(0.03, 0.0, abs(w.x - (0.15 - w.y * 0.55) + 0.05)) * 0.8;     // wing edge light
  // engine pods
  for (int k = 0; k < 2; k++) {
    float py = k == 0 ? 0.32 : -0.32;
    float pod = boxMask(q - vec2(-0.6, py), vec2(0.45, 0.11), 0.1, aa);
    col = mix(col, hullC * 0.85, pod);
    col += uPal[3] * disk((q - vec2(-1.04, py)) * vec2(2.0, 1.0), 0.11, aa) * (0.5 + thrust);
  }
  // hull: pointed wedge
  float hx = clamp((q.x + 1.0) / 2.6, 0.0, 1.0);
  float half_ = 0.3 * (1.0 - pow(hx, 2.2)) + 0.03;
  float hull = step(-1.0, q.x) * step(q.x, 1.6) * (1.0 - smoothstep(half_ - aa, half_ + aa, abs(q.y)));
  vec3 hc = hullC * (0.75 + 0.35 * smoothstep(-0.3, 0.3, q.y));
  hc = mix(hc, uPal[3] * 0.9, (1.0 - smoothstep(0.035, 0.05, abs(q.y + 0.06))) * step(-0.6, q.x) * step(q.x, 1.1)); // racing stripe
  col = mix(col, hc, hull);
  // cockpit bubble
  vec2 cq = (q - vec2(0.45, 0.12)) * vec2(1.0, 1.6);
  float glass = disk(cq, 0.3, aa) * step(0.0, q.y - 0.02);
  col = mix(col, mix(uPal[0] * 0.8, uPal[2], smoothstep(-0.2, 0.25, cq.y + cq.x * 0.3)), glass);
  col += vec3(1.0) * disk(cq - vec2(-0.08, 0.12), 0.06, aa) * glass * 0.7;
  col *= mix(1.0, 0.75, 1.0 - sq);                       // darker while edge-on
  return col;
}

// ---------- the landing planet surface for the easter egg ----------
vec3 alienGround(vec3 col, vec2 p, float top, float aa) {
  float R = 1.6;
  vec2 c = vec2(0.0, top - R);
  float d = length(p - c);
  col += mix(uPal[1], vec3(1.0), 0.2) * exp(-max(d - R, 0.0) * 18.0) * 0.25 * step(R, d);        // atmosphere glow
  if (d > R + aa) return col;
  vec2 g = p - c;
  float ang = atan(g.x, g.y);
  float n = fbm2(g * 7.0) + 0.35 * noise2(g * 40.0);
  vec3 soil = mix(uPal[0] * 2.2 + vec3(0.03), mix(uPal[1], uPal[0], 0.55), smoothstep(0.35, 1.0, n));
  soil *= 0.75 + 0.35 * smoothstep(0.0, 0.25, R - d) * 0.0 + 0.25 * smoothstep(0.25, 0.0, R - d);   // lighter near the horizon
  soil += uPal[2] * 0.12 * smoothstep(0.03, 0.0, R - d);                                          // lit edge
  for (int k = 0; k < 6; k++) {                          // craters along the horizon
    float ca = (float(k) - 2.5) * 0.12 + 0.03 * hash12(vec2(float(k), 3.0));
    vec2 cp = c + vec2(sin(ca), cos(ca)) * (R - 0.04 - 0.05 * hash12(vec2(float(k), 5.0)));
    float cr = 0.018 + 0.02 * hash12(vec2(float(k), 8.0));
    soil *= 1.0 - 0.4 * disk((p - cp) * vec2(1.0, 2.6), cr, aa);
  }
  return mix(col, soil, 1.0 - smoothstep(R - aa, R + aa, d));
}

void main() {
  vec2 p = P();
  float aa = 1.5 / min(uRes.x, uRes.y);
  HW = 0.5 * uRes.x / min(uRes.x, uRes.y);
  float tall = clamp(uRes.y / uRes.x - 1.0, 0.0, 1.3);
  float T = uSceneTime;                                   // story time: pauses with the music
  float travel = T * 0.03;
  float low = histSmooth(0.05, 0.0), mid = histSmooth(0.35, 0.0);

  // easter egg timeline (90 s, then every 2 minutes): descend 90–93, landed 93–101, take off 101–105
  float c = mod(T, 120.0);
  float egg = surprise(T);                                // 0 → 1 → 0
  float landed = smoothstep(92.5, 93.5, c) * (1.0 - smoothstep(100.5, 101.5, c));
  float danceOn = smoothstep(93.5, 94.5, c) * (1.0 - smoothstep(100.0, 100.8, c));

  // ---- background ----
  vec3 col = mix(uPal[0] * 0.35, uPal[0] * 0.08, smoothstep(-0.7, 0.7, p.y)) + vec3(0.004, 0.004, 0.012);
  col += nebula(p, travel * 0.3);
  col += stars(p, travel * 0.15, 46.0, 1.0, 0.55);
  col += stars(p, travel * 0.35, 28.0, 7.0, 0.8);
  col = galaxy(col, p - vec2(HW * 0.55, 0.3 + 0.1 * tall));

  // ---- far planets drift by slowly (wrap around) ----
  for (int k = 0; k < 2; k++) {
    float fk = float(k);
    float span = 2.0 * HW + 0.8;
    float x = HW + 0.4 - mod(travel * (0.45 + 0.2 * fk) + fk * span * 0.55, span);
    float y = (k == 0 ? 0.24 : -0.22) * (1.0 + 0.4 * tall);
    float R = k == 0 ? 0.07 : 0.045;
    col = planet(col, p - vec2(x, y), R, 11.0 + fk * 5.0, mix(uPal[2], uPal[0] * 3.0, 0.35 + 0.3 * fk), mix(uPal[3], uPal[1], fk), aa);
  }
  // ---- the ringed planet with an orbiting moon ----
  {
    float span = 2.0 * HW + 1.4;
    float x = HW + 0.7 - mod(travel * 0.3 + span * 0.25, span);
    vec2 rp = vec2(x, 0.12 + 0.05 * tall);
    float R = 0.13;
    float ma = uTime * 0.12;
    vec2 moon = rp + vec2(cos(ma) * 0.29, sin(ma) * 0.07);
    if (sin(ma) > 0.0) col = planet(col, p - moon, 0.018, 21.0, mix(vec3(0.7), uPal[2], 0.2), vec3(0.45), aa);
    col = ringedPlanet(col, p - rp, R, aa);
    if (sin(ma) <= 0.0) col = planet(col, p - moon, 0.018, 21.0, mix(vec3(0.7), uPal[2], 0.2), vec3(0.45), aa);
  }
  // ---- station and satellites ----
  {
    float span = 2.0 * HW + 0.6;
    float x = HW + 0.3 - mod(travel * 0.8 + span * 0.7, span);
    col = station(col, p - vec2(x, -0.3 - 0.08 * tall), 0.05, aa);
    float x2 = HW + 0.3 - mod(travel * 1.1 + span * 0.15, span);
    col = satellite(col, p - vec2(x2, 0.36 + 0.12 * tall), 0.022, 0.0, aa);
    float x3 = HW + 0.3 - mod(travel * 1.3 + span * 0.62, span);
    col = satellite(col, p - vec2(x3, -0.12), 0.016, 0.5, aa);
  }
  // ---- asteroid belt in the midground ----
  for (int k = 0; k < 6; k++) {
    float fk = float(k);
    float span = 2.0 * HW + 0.5;
    float sp = 1.6 + 0.8 * hash12(vec2(fk, 2.0));
    float x = HW + 0.25 - mod(travel * sp + fk * span / 6.0, span);
    float y = (hash12(vec2(fk, 4.0)) - 0.5) * (0.8 + 0.5 * tall);
    if (abs(y + 0.0) < 0.06) y += 0.14;                   // keep the ship's lane free
    vec2 q = rot(uTime * (0.2 + 0.4 * hash12(vec2(fk, 6.0))) + fk) * (p - vec2(x, y));
    col = asteroid(col, q, 0.014 + 0.016 * hash12(vec2(fk, 9.0)), fk * 3.7, aa);
  }
  // ---- a fast asteroid on every kick (crosses in a moment, a little motion blur) ----
  {
    float go = 1.0 - clamp(uKick, 0.0, 1.0);
    float hy = (hash12(vec2(uKickN, 3.3)) - 0.5) * 0.7;
    vec2 a0 = vec2(HW + 0.1, hy + 0.2), a1 = vec2(-HW - 0.1, hy - 0.15);
    vec2 ap = mix(a0, a1, go);
    vec2 dir = normalize(a1 - a0);
    float trail = strokeSeg(p, ap, ap - dir * 0.08, 0.004, aa) * step(0.02, uKick);
    col += mix(uPal[3], vec3(1.0), 0.3) * trail * 0.25 * smoothstep(0.0, 0.3, uKick);
    col = asteroid(col, rot(uTime * 2.0) * (p - ap), 0.012, uKickN, aa);
  }

  // ---- the landing planet (easter egg) rises from below the screen ----
  float bottomY = -0.5 * uRes.y / min(uRes.x, uRes.y);
  float groundTop = mix(bottomY - 0.08, -0.08, egg);
  col = alienGround(col, p, groundTop, aa);

  // ---- the ship ----
  float shipX = -HW * 0.3;
  float bob = 0.012 * sin(T * 0.9) + 0.006 * sin(T * 2.3) + 0.004 * low;
  float rollPhase = mod(uSceneBeat, 64.0);               // a barrel roll every 64 beats
  float roll = smoothstep(56.0, 60.0, rollPhase) * TAU;
  vec2 sp = vec2(shipX, 0.02 + bob);
  // landing: descend onto the planet surface, slight tilt
  float groundY = groundTop;                              // top of the landing planet at x = 0
  sp = mix(sp, vec2(shipX * 0.4, groundY + 0.045), egg);
  float thrust = mix(0.35 + 0.65 * low, 0.15, landed);
  vec2 q = p - sp;
  q = rot(-0.06 * egg + 0.03 * sin(T * 0.7)) * q;
  // the astronaut and the Glorps dance next to the ship while it has landed
  if (danceOn > 0.001) {
    float gy = groundY + 0.004;
    float dx = sp.x + 0.16;
    float out_ = smoothstep(93.5, 95.0, c);               // the astronaut walks out of the hatch
    col = astronaut(col, p - vec2(sp.x + 0.04 + 0.13 * out_, gy), 0.036 * danceOn, danceOn * out_, aa);
    for (int k = 0; k < 3; k++) {
      float fk = float(k);
      float arrive = smoothstep(93.8 + fk * 0.6, 95.2 + fk * 0.6, c);
      float hop = abs(sin((uSceneBeat + fk * 0.33) * PI)) * 0.04 * arrive;
      float gx = mix(HW + 0.1, dx + 0.13 + fk * 0.1, arrive);
      float land = 1.0 - smoothstep(0.0, 0.2, fract(uSceneBeat + fk * 0.33));
      col = glorp(col, p - vec2(gx, gy + hop), 0.03 * danceOn, land * arrive, -1.0, aa);
    }
  }
  col = ship(col, q, 0.075, roll * (1.0 - egg), thrust, aa);

  // ---- a soft light from the sun, upper left ----
  col += mix(vec3(1.0, 0.9, 0.7), uPal[2], 0.3) * exp(-length(p - vec2(-HW - 0.2, 0.55)) * 2.5) * 0.08;
  fragColor = vec4(col, 1.0);
}`,
};
