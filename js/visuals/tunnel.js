// Tunnel — an endless tunnel of flowing, glowing walls in the cover colours, travelled at a calm, steady pace.
// Built analytically (depth = k / radius), not with feedback: the old version grew its walls out of a morphing
// polygon in the centre, so the centre shapes WERE the walls. Now the middle is simply the far end: the walls narrow
// and fade into a dark open passage, no object, no spot, no disc. The music deforms the wall contours per direction
// (each direction its own pitch; near walls show the newest sound, deeper walls slightly older) and adds detail on
// the ribs; it never changes the speed, never spins, never flashes.
export default {
  id: "tunnel",
  name: "Tunnel",
  lyrics: { y: 0.5, font: "light" },     // in the dark open passage, behind the walls
  bloom: 0.55,
  frag: /* glsl */ `
void main() {
  vec2 p = P();
  float px = 1.0 / min(uRes.x, uRes.y);
  float r = max(length(p), 1e-4), a = atan(p.y, p.x);
  // every direction listens to its own pitch (mirrored, so there is no seam): lows at the bottom, highs at the top
  float fa = clamp(0.06 + 0.82 * (0.5 + 0.5 * sin(a)) , 0.0, 1.0);
  float z0 = 0.33 / r;                                            // depth before the music bends the wall
  float age = clamp((z0 - 0.6) * 0.09, 0.0, 1.1);                 // near = now, deeper = a little older
  float lv = histSmooth(fa, age);
  float def = (0.22 * lv + 0.10 * flux(fa) * exp(-age * 5.0)) * (1.0 - 0.6 * uRest);
  def *= (0.85 + 0.1 * sin(a * 2.0 + z0 * 0.7 + uTime * 0.3) + 0.05 * sin(a * 5.0 - uTime * 0.2)) * smoothstep(12.0, 3.0, z0);   // soft lobes; the far end stays round
  float z = z0 * (1.0 + def);
  float travel = uTime * 1.1;                                     // calm, constant forward motion
  float v = z + travel;
  float twist = a + z * 0.06 + uTime * 0.03;                      // a slow, constant twist of the flow lines

  // walls: dark, with glowing contour rings receding into depth (bent by the music) and faint flowing streaks
  float fw = fwidth(v) + 1e-4;
  float detail = 1.0 - smoothstep(0.15, 0.7, fw);                 // patterns melt away before they could alias
  float ringD = abs(fract(v * 0.75) - 0.5) * 2.0;                 // 1 on a ring, 0 between rings
  float ring = smoothstep(1.0 - (0.07 + fw * 1.6), 1.0, ringD);
  float ring2 = smoothstep(1.0 - (0.05 + fw * 1.6), 1.0, abs(fract(v * 0.75 + 0.5) - 0.5) * 2.0) * 0.35;
  float glow = pow(ringD, 6.0) * 0.35;                           // soft light around each ring
  float flow = 0.5 + 0.5 * sin(twist * 7.0 + v * 1.3 + sin(v * 0.6) * 1.5);   // spiral streaks, never radial rays
  float hiDet = histSmooth(0.75, age) * (0.5 + 0.5 * sin(twist * 19.0 - v * 3.0));
  vec3 c1 = pal(fract(0.3 + v * 0.035));                          // the hue flows with depth, like before
  vec3 c2 = pal(fract(0.6 + v * 0.035 + 0.15 * sin(twist * 2.0)));
  vec3 wall = mix(c1, c2, flow) * (0.05 + 0.02 * flow * detail);
  wall += mix(c1, c2, 0.5 + 0.5 * sin(twist * 3.0 + v)) * ((ring + ring2) * (0.7 + 0.4 * lv) + glow) * detail;
  wall += c2 * hiDet * 0.08 * detail;

  // depth fade: the walls narrow and fade into a dark open passage (no disc, no spot)
  float fog = exp(-z * 0.26);
  vec3 col = uPal[0] * 0.06;
  col += wall * fog * smoothstep(0.35, 1.6, z);                  // rings fade out before they reach you: no passing glare
  // the passage keeps a faint glow of the walls far away, so it reads as depth, not as a black hole
  col += mix(uPal[0], pal(0.5), 0.3) * 0.05 * smoothstep(0.0, 0.25, r) * (1.0 - fog);
  col *= 1.0 - 0.18 * dot(p, p);
  fragColor = vec4(col, 1.0);
}`,
};
