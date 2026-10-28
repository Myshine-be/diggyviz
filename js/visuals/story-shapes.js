// Small 2D SDF helpers shared by the two illustrated worlds. All coordinates use P().
export const STORY_SHAPES = /* glsl */ `
float strokeSeg(vec2 p, vec2 a, vec2 b, float r, float aa) {
  vec2 v = b - a;
  float d = length(p - a - v * clamp(dot(p-a,v) / max(dot(v,v), 0.00001),0.0,1.0));
  return 1.0 - smoothstep(r-aa, r+aa, d);
}
float disk(vec2 p, float r, float aa) { return 1.0-smoothstep(r-aa,r+aa,length(p)); }
float boxSDF(vec2 p, vec2 b, float r) {
  vec2 q=abs(p)-b+r;return min(max(q.x,q.y),0.0)+length(max(q,0.0))-r;
}
float boxMask(vec2 p, vec2 b, float r, float aa) {return 1.0-smoothstep(-aa,aa,boxSDF(p,b,r));}
float boxLine(vec2 p, vec2 b, float r, float width, float aa) {return 1.0-smoothstep(width-aa,width+aa,abs(boxSDF(p,b,r)));}
// Flying saucer (q relative to its centre, in saucer units). Small lights step along on the beat.
vec3 ufo(vec3 col, vec2 q, float aa) {
  if(abs(q.x)>.1||abs(q.y)>.07)return col;
  float saucer=boxMask(q,vec2(.075,.012),.012,aa);
  vec2 dq=(q-vec2(0,.016))*vec2(1,1.5);
  float dome=disk(dq,.034,aa)*step(.008,q.y);
  col=mix(col,uPal[0]*.25,max(saucer,dome));
  col+=uPal[2]*boxLine(q,vec2(.075,.012),.012,.0018,aa)*1.2;
  col+=uPal[1]*(disk(dq,.034,aa)-disk(dq,.028,aa))*step(.008,q.y);
  col+=vec3(1)*disk(dq-vec2(-.012,.012),.006,aa)*.35*step(.008,q.y);
  for(int k=0;k<5;k++){float on=step(.5,fract(uSceneBeat*.5+float(k)*.2));
    col+=mix(uPal[1],uPal[3],on)*disk(q-vec2((float(k)-2.0)*.03,-.002),.0045,aa)*(.5+.4*on);}
  return col;
}
// Glorp — DiggyViz's own alien species (shared by Bloop and Ruimtereis): a round glowing jelly with three eyes,
// a little crown antenna and two stubby feet. q relative to its feet, s = size (≈0.05), land 0..1 squashes it,
// look = eye direction (-1..1). Colour: warm yellow mixed with the cover's hot accent, so it fits every song.
vec3 glorpTint() { return mix(vec3(1.0, 0.84, 0.22), uPal[3], 0.18); }
vec3 glorp(vec3 col, vec2 q, float s, float land, float look, float aa) {
  q /= s; aa /= s;
  if (abs(q.x) > 1.6 || q.y < -0.3 || q.y > 2.6) return col;
  q *= vec2(1.0 - 0.18 * land, 1.0 + 0.22 * land);
  vec3 tint = glorpTint();
  // feet
  float feet = disk((q - vec2(-0.42, 0.08)) * vec2(1.0, 1.8), 0.22, aa) + disk((q - vec2(0.42, 0.08)) * vec2(1.0, 1.8), 0.22, aa);
  col = mix(col, tint * 0.55, clamp(feet, 0.0, 1.0));
  // body: a soft round jelly with a lighter belly
  vec2 b = q - vec2(0.0, 0.95);
  float body = disk(b * vec2(1.0, 1.08), 0.88, aa);
  vec3 jelly = mix(tint * 0.7, tint * 1.15, smoothstep(-0.8, 0.6, b.y)) + vec3(0.06) * disk(b - vec2(0.0, -0.3), 0.45, aa * 4.0);
  col = mix(col, jelly, body);
  col += vec3(1.0) * disk(b - vec2(-0.38, 0.42), 0.13, aa) * body * 0.45;                       // gloss
  col += tint * (disk(b, 0.9, aa) - disk(b, 0.86, aa)) * 0.6;                                     // rim
  // three eyes in a curve; they blink together every 8 beats
  float blink = step(0.06, fract(uSceneBeat / 8.0 + 0.3));
  for (int i = 0; i < 3; i++) {
    float fi = float(i) - 1.0;
    vec2 e = b - vec2(fi * 0.36, 0.18 + 0.08 * (1.0 - abs(fi)));
    float white = disk(e * vec2(1.0, 1.0 / max(blink, 0.12)), 0.15, aa);
    col = mix(col, vec3(0.97), white * body);
    col = mix(col, vec3(0.04, 0.03, 0.08), disk(e - vec2(0.05 * look, -0.01), 0.07, aa) * white * blink);
    col += vec3(1.0) * disk(e - vec2(0.03 * look - 0.03, 0.04), 0.025, aa) * white * blink * 0.8;
  }
  // smile
  col = mix(col, vec3(0.08, 0.04, 0.06), strokeSeg(b, vec2(-0.16, -0.22), vec2(0.0, -0.3), 0.04, aa) * body);
  col = mix(col, vec3(0.08, 0.04, 0.06), strokeSeg(b, vec2(0.0, -0.3), vec2(0.16, -0.22), 0.04, aa) * body);
  // antenna with a bulb that glows a little on the beat (local, not a screen flash)
  float sway = 0.12 * sin(uSceneBeat * TAU * 0.5);
  vec2 top = vec2(sway, 1.95);
  col = mix(col, tint * 0.8, strokeSeg(q, vec2(0.0, 1.7), top, 0.05, aa));
  float bulb = disk(q - top, 0.13, aa);
  col = mix(col, mix(uPal[1], vec3(1.0), 0.3) * (0.9 + 0.35 * uKick), bulb);
  return col;
}

// A little astronaut (white suit, cover-coloured visor). q relative to the feet, s ≈ 0.05.
// dance 0..1 = how much it dances (arms and hips follow the beat).
vec3 astronaut(vec3 col, vec2 q, float s, float dance, float aa) {
  q /= s; aa /= s;
  if (abs(q.x) > 2.0 || q.y < -0.2 || q.y > 3.4) return col;
  float ph = uSceneBeat * PI;                         // one swing per beat
  float sw = sin(ph) * dance, bob = abs(sin(ph)) * 0.12 * dance;
  q.y -= bob;
  vec3 suit = vec3(0.92, 0.93, 0.96), shade = vec3(0.55, 0.58, 0.66);
  // legs
  float legs = strokeSeg(q, vec2(-0.22, 0.0), vec2(-0.18 + 0.12 * sw, 1.0), 0.15, aa) + strokeSeg(q, vec2(0.22, 0.0), vec2(0.18 - 0.12 * sw, 1.0), 0.15, aa);
  col = mix(col, shade, clamp(legs, 0.0, 1.0));
  // body + backpack
  col = mix(col, shade * 0.8, boxMask(q - vec2(-0.42, 1.55), vec2(0.18, 0.4), 0.08, aa));
  float body = boxMask(q - vec2(0.0, 1.5), vec2(0.36, 0.55), 0.18, aa);
  col = mix(col, suit, body);
  col = mix(col, uPal[3], boxMask(q - vec2(0.12, 1.62), vec2(0.1, 0.07), 0.03, aa) * body);      // chest badge light
  // arms: up and down on the beat (disco)
  vec2 sh1 = vec2(-0.34, 1.9), sh2 = vec2(0.34, 1.9);
  vec2 h1 = sh1 + vec2(-0.45, 0.2 + 0.6 * sw), h2 = sh2 + vec2(0.45, 0.2 - 0.6 * sw);
  float arms = strokeSeg(q, sh1, h1, 0.13, aa) + strokeSeg(q, sh2, h2, 0.13, aa);
  col = mix(col, suit * 0.95, clamp(arms, 0.0, 1.0));
  // helmet with visor reflecting the cover colours
  vec2 h = q - vec2(0.0, 2.55);
  float helmet = disk(h, 0.5, aa);
  col = mix(col, suit, helmet);
  float visor = disk((h - vec2(0.08, -0.02)) * vec2(1.0, 1.25), 0.34, aa);
  col = mix(col, mix(uPal[0] * 0.6, uPal[2], smoothstep(-0.3, 0.3, h.y + h.x)), visor);
  col += vec3(1.0) * disk(h - vec2(-0.06, 0.16), 0.07, aa) * visor * 0.7;
  return col;
}

// First event starts exactly at 90 visible playback seconds, then every two minutes.
float surprise(float t) { float c=mod(t,120.0);return smoothstep(90.0,92.0,c)*(1.0-smoothstep(102.0,105.0,c)); }
`;
