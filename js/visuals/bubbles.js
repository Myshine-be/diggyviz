// Bubbles — a swarm of soft bokeh bubbles drifting in a slowly turning, wobbling ring,
// like looking up through water. Three depth layers (small and sharp → large and blurred).
// Calm by design: the ring size follows the slow section energy, not the beat, and the
// average brightness stays constant; hats only make a few single bubbles twinkle.

export default {
  id: "bubbles",
  name: "Bubbles",
  bloom: 0.8,
  frag: /* glsl */ `
vec3 lift(vec3 c, float lo) { float m = max(c.r, max(c.g, c.b)); return c / max(m, 0.05) * max(m, lo); }

// where the swarm is dense: a wobbling ring with one brighter arc travelling around it
float density(vec2 p, float t) {
  vec2 c = vec2(sin(t * 0.13), cos(t * 0.11)) * 0.07;
  vec2 q = p - c;
  float r = length(q), ang = atan(q.y, q.x);
  float R = 0.2 + 0.06 * uEnergy + 0.05 * (fbm2(vec2(ang * 1.2, t * 0.15)) - 0.5);
  float w = 0.07 + 0.04 * noise2(vec2(ang * 2.0, t * 0.25));
  float ring = exp(-pow((r - R) / w, 2.0));
  float arc = pow(0.5 + 0.5 * cos(ang - t * 0.5), 3.0);
  return ring * (0.3 + 0.9 * arc) + 0.06;
}

void main() {
  vec2 p = P();
  float t = uTime;
  float px = 1.0 / min(uRes.x, uRes.y);

  vec3 deep = uPal[0] * 0.5;
  vec3 haze = lift(uPal[1], 0.35) * 0.32;
  vec3 col = mix(deep, haze, smoothstep(-0.7, 0.7, p.y) * 0.8);
  col += haze * 0.35 * (fbm2(p * 2.5 + vec2(t * 0.03, -t * 0.02)) - 0.4);

  float dens = density(p, t);
  vec3 bc = lift(mix(uPal[2], uPal[1], 0.3), 0.75);
  col += bc * dens * 0.07;

  for (int L = 0; L < 3; L++) {
    float fl = float(L);
    float cs = 0.016 + fl * 0.016;                     // cell size per depth layer
    float gain = 0.85 - fl * 0.2;
    vec2 c = vec2(sin(t * 0.13), cos(t * 0.11)) * 0.07;
    vec2 pr = rot(t * 0.12 / (1.0 + fl * 0.5)) * (p - c) + c;   // the swarm turns slowly
    vec2 gp = (pr + vec2(0.0, t * 0.012 * (1.0 + fl))) / cs;    // and drifts upwards
    vec2 base = floor(gp);
    for (int j = -1; j <= 1; j++) for (int i = -1; i <= 1; i++) {
      vec2 id = base + vec2(i, j) + fl * 101.0;
      if (hash12(id + 7.0) < 0.35) continue;
      vec2 h = hash22(id);
      vec2 pos = base + vec2(i, j) + 0.15 + 0.7 * h;
      float d = length(gp - pos) * cs;
      float rad = cs * (0.16 + 0.24 * hash12(id + 3.0));
      float soft = max(rad * (0.25 + fl * 0.45), px);
      float b = 1.0 - smoothstep(rad - soft, rad + soft, d);
      b *= 0.7 + 0.4 * smoothstep(rad * 0.4, rad, d);  // bokeh rim
      float tw = 0.8 + 0.2 * sin(t * (1.5 + 2.0 * h.x) + h.y * 40.0) + uHat * 0.25 * step(0.9, h.y);
      col += bc * b * dens * tw * gain;
    }
  }
  fragColor = vec4(col, 1.0);
}
`,
};
