// Shared GLSL prepended to every visual's fragment shader.
// Visuals write `void main()` and set `fragColor`.

export const HEADER = /* glsl */ `#version 300 es
precision highp float;
precision highp int;

uniform vec2  uRes;        // render size in pixels
uniform float uSceneTime; // visible playback seconds since this visual was selected
uniform float uSceneBeat; // continuous integrated tempo, unaffected by seek/track change
uniform float uDelta;      // elapsed seconds, for feedback independent of refresh rate
uniform float uTime;       // seconds, always running
uniform float uSongTime;   // song position in seconds
uniform float uBeat;       // beat phase 0..1 (0 = on the beat)
uniform float uKick, uSnare, uHat, uEnergy, uLevel;
uniform float uDrop;       // 1.0 right after a track change, decays to 0
uniform float uBass;       // low-end level 0..1 (real in listening mode, simulated otherwise)
uniform float uPunch;      // bass hit 0..~1.3, sharp attack, scaled by the "Explosiviteit" setting
uniform float uBoom;       // 1.0 on a big drop, decays to 0 in ~1 s
uniform float uTravel;     // integrated speed (for fly-through visuals)
uniform float uSeed;       // per-track 0..999
uniform float uBands[32];  // spectrum 0..1, low → high
uniform float uPeaks[32];
uniform vec3  uPal[4];     // 0 dark, 1 mid, 2 hi, 3 hot (0..1)
uniform sampler2D uPrev;   // this visual's previous frame (feedback)
uniform sampler2D uArt;    // album art (or palette gradient)

out vec4 fragColor;

#define PI  3.14159265359
#define TAU 6.28318530718

vec2 P() { return (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.x, uRes.y); }
mat2 rot(float a) { float c = cos(a), s = sin(a); return mat2(c, -s, s, c); }
float smin(float a, float b, float k) { float h = max(k - abs(a - b), 0.0) / k; return min(a, b) - h * h * k * 0.25; }

float hash12(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec2  hash22(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * vec3(.1031, .1030, .0973)); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.xx + p3.yz) * p3.zy); }
float hash13(vec3 p3) { p3 = fract(p3 * .1031); p3 += dot(p3, p3.zyx + 31.32); return fract((p3.x + p3.y) * p3.z); }

float noise2(vec2 x) {
  vec2 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash12(i), hash12(i + vec2(1, 0)), f.x), mix(hash12(i + vec2(0, 1)), hash12(i + vec2(1, 1)), f.x), f.y);
}
float noise3(vec3 x) {
  vec3 i = floor(x), f = fract(x); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hash13(i), hash13(i + vec3(1,0,0)), f.x), mix(hash13(i + vec3(0,1,0)), hash13(i + vec3(1,1,0)), f.x), f.y),
             mix(mix(hash13(i + vec3(0,0,1)), hash13(i + vec3(1,0,1)), f.x), mix(hash13(i + vec3(0,1,1)), hash13(i + vec3(1,1,1)), f.x), f.y), f.z);
}
float fbm2(vec2 p) { float a = 0.5, s = 0.0; for (int i = 0; i < 5; i++) { s += a * noise2(p); p = p * 2.03 + 17.1; a *= 0.5; } return s; }

float band(float x) { float f = clamp(x, 0.0, 1.0) * 31.0; int i = int(floor(f)); int j = min(i + 1, 31); return mix(uBands[i], uBands[j], fract(f)); }
float peak(float x) { float f = clamp(x, 0.0, 1.0) * 31.0; int i = int(floor(f)); int j = min(i + 1, 31); return mix(uPeaks[i], uPeaks[j], fract(f)); }

// dark → mid → hi → hot
vec3 pal(float t) {
  t = clamp(t, 0.0, 1.0);
  if (t < 0.33) return mix(uPal[0], uPal[1], t / 0.33);
  if (t < 0.66) return mix(uPal[1], uPal[2], (t - 0.33) / 0.33);
  return mix(uPal[2], uPal[3], (t - 0.66) / 0.34);
}

// Same shape as rhythm.js wave(): x 0..1 → about -1..1
float wave(float x) {
  float s = uSeed, t = uSongTime;
  float f1 = 2.0 + mod(s, 3.0), f2 = 5.0 + mod(s, 5.0), f3 = 11.0 + mod(s, 7.0);
  return (sin((x * f1 + t * 0.9) * TAU) * (0.35 + uKick * 0.6)
        + sin((x * f2 - t * 1.7) * TAU) * (0.2 + uSnare * 0.4)
        + sin((x * f3 + t * 3.1) * TAU) * (0.08 + uHat * 0.35)) * max(uEnergy, 0.15);
}

// Anti-aliased thin line at integer values of x
float gridLine(float x, float width) { float f = abs(fract(x + 0.5) - 0.5); float w = fwidth(x) * 1.2 + 1e-4; return 1.0 - smoothstep(width, width + w, f); }
`;

export const VERT = /* glsl */ `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

// Post-processing shaders
export const MIX_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uA, uB; uniform float uMix; uniform vec2 uRes;
out vec4 fragColor;
void main() { vec2 uv = gl_FragCoord.xy / uRes; fragColor = vec4(mix(texture(uB, uv).rgb, texture(uA, uv).rgb, uMix), 1.0); }`;

export const BRIGHT_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uRes; uniform vec2 uTexel;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uSrc, uv + uTexel * vec2(-1, -1)).rgb + texture(uSrc, uv + uTexel * vec2(1, -1)).rgb
         + texture(uSrc, uv + uTexel * vec2(-1, 1)).rgb + texture(uSrc, uv + uTexel * vec2(1, 1)).rgb;
  c *= 0.25;
  float l = max(c.r, max(c.g, c.b));
  float k = smoothstep(0.35, 1.0, l);
  fragColor = vec4(c * k, 1.0);
}`;

export const BLUR_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uSrc; uniform vec2 uRes; uniform vec2 uDir;
out vec4 fragColor;
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uSrc, uv).rgb * 0.227027;
  c += (texture(uSrc, uv + uDir * 1.3846).rgb + texture(uSrc, uv - uDir * 1.3846).rgb) * 0.3162162;
  c += (texture(uSrc, uv + uDir * 3.2308).rgb + texture(uSrc, uv - uDir * 3.2308).rgb) * 0.0702703;
  fragColor = vec4(c, 1.0);
}`;

export const FINAL_FRAG = /* glsl */ `#version 300 es
precision highp float;
uniform sampler2D uScene, uBloom; uniform vec2 uRes; uniform float uBloomAmt, uTime, uGrain;
out vec4 fragColor;
float h(vec2 p) { vec3 p3 = fract(vec3(p.xyx) * .1031); p3 += dot(p3, p3.yzx + 33.33); return fract((p3.x + p3.y) * p3.z); }
vec3 aces(vec3 x) { return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); }
void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec3 c = texture(uScene, uv).rgb + texture(uBloom, uv).rgb * uBloomAmt;
  c = aces(c * 1.05);
  vec2 q = uv - 0.5; c *= 1.0 - dot(q, q) * 0.55;
  c += (h(gl_FragCoord.xy + fract(uTime * 13.7) * 311.0) - 0.5) * uGrain;
  fragColor = vec4(c, 1.0);
}`;
