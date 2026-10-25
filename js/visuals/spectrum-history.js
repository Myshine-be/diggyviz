// Shared GLSL for the line visuals (Landscape, Halo, Vanish, Orbit).
// The line visuals draw the sound itself: histAt(f, secondsAgo) and waveAt(x) from js/glsl.js read the
// spectrum history and waveform (real sound in listening mode, simulated otherwise; see js/audio-data.js).
// beatNow(): continuous beat count locked to the song's beat phase (uBeat), for things that step on the beat.
export const SPECTRUM_HISTORY = /* glsl */ `
float beatNow() {
  float d = uBeat - fract(uSceneBeat);
  d -= floor(d + 0.5);
  return uSceneBeat + d;
}
// spectrum with more contrast, so quiet bands stay low and only real peaks stand up (no flat plateaus)
float histShape(float f, float age) { float v = histAt(f, age); return v * v * (1.6 - 0.6 * v); }
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
