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
// First event starts exactly at 90 visible playback seconds, then every two minutes.
float surprise(float t) { float c=mod(t,120.0);return smoothstep(90.0,92.0,c)*(1.0-smoothstep(102.0,105.0,c)); }
`;
