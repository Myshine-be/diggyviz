// Shared GLSL for the line visuals (Landscape, Halo, Vanish, Orbit).
// beatNow(): continuous beat count locked to the song's beat phase (uBeat), so history lines land on the beat.
// specAt(f, b): the spectrum at frequency f (0 low … 1 high) at beat position b. It uses the same rhythm
// model as js/rhythm.js (kick on every beat, snare on 2 and 4, hats on the off-beats), so lines drawn
// for earlier beats match what the bars showed then. Rows at the present use the live bands.
export const SPECTRUM_HISTORY = /* glsl */ `
float beatNow() {
  float d = uBeat - fract(uSceneBeat);
  d -= floor(d + 0.5);
  return uSceneBeat + d;
}
float specAt(float f, float b) {
  b += 0.09;                       // the ramp starts just before the beat so the peak lands on it
  float ph = fract(b);
  // short attack ramps keep the lines continuous (no vertical streaks)
  float atk = smoothstep(0.0, 0.12, ph);
  float kick = exp(-ph * 6.5) * atk;
  float snare = mod(floor(b), 2.0) > 0.5 ? exp(-ph * 9.0) * atk : 0.0;
  float hph = fract(b * 2.0);
  float hat = exp(-hph * 16.0) * smoothstep(0.0, 0.1, hph) * (0.5 + 0.5 * noise2(vec2(floor(b * 2.0), uSeed)));
  float base = noise2(vec2(f * 7.0 + uSeed * 0.37, b * 1.3)) * (1.0 - f * 0.55);
  float v = base * 0.55 + kick * pow(1.0 - f, 2.2) * 1.15
          + snare * exp(-pow((f - 0.45) / 0.18, 2.0)) * 0.8 + hat * pow(f, 1.4) * 0.75;
  return clamp(v * max(uEnergy, 0.2) * 0.95, 0.0, 1.0);
}
// album colour for frequency f, lifted so lines stay visible on dark covers
vec3 lineCol(float f) {
  vec3 c = pal(0.4 + 0.58 * f);
  float m = max(c.r, max(c.g, c.b));
  return c / max(m, 0.05) * 0.95;
}
// distance-based line for an ellipse x²/a² + y²/b² = 1 (smooth everywhere, also at the sides)
float ellipseLine(vec2 q, float a, float b, float px) {
  float E = q.x * q.x / (a * a) + q.y * q.y / (b * b) - 1.0;
  vec2 g = vec2(2.0 * q.x / (a * a), 2.0 * q.y / (b * b));
  float d = abs(E) / max(length(g), 1e-4);
  return exp(-d / (px * 1.1)) + exp(-d * 70.0) * 0.05;
}
// thin anti-aliased line + soft glow from a vertical distance and the curve's screen slope
float lineAt(float dy, float slope, float px) {
  float d = abs(dy) / sqrt(1.0 + min(slope * slope, 36.0));
  return exp(-d / (px * 1.1)) + exp(-d * 70.0) * 0.05;
}
`;
