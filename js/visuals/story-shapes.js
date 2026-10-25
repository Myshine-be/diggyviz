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
// First event starts exactly at 90 visible playback seconds, then every two minutes.
float surprise(float t) { float c=mod(t,120.0);return smoothstep(90.0,92.0,c)*(1.0-smoothstep(102.0,105.0,c)); }
`;
