// Open passage: continuous wall coordinates, never a central emitter or feedback polygon.
export default {
  id:"tunnel",name:"Tunnel",bloom:.28,
  lyrics:{y:{land:.79,port:.82},font:"light"},
  frag: /* glsl */ `
void main() {
  vec2 p=P();float r=length(p),a=atan(p.y,p.x);
  float safeR=max(r,.024),z=.30/safeR;
  float travel=uTime*.22; // fixed speed, no kick acceleration
  float pitch=.5+.45*sin(a);
  float wall=histSmooth(pitch,0.0);
  float bend=.07*wall*sin(a*3.0+z*.7)+.045*flux(pitch)*sin(a*5.0-z);
  float depth=z+travel+bend;
  float ringCoord=depth*2.1;
  float fw=max(fwidth(ringCoord),.001);
  float dist=abs(fract(ringCoord)-.5);
  float rings=(1.0-smoothstep(.025,.025+fw*1.4,dist));
  rings*=1.0-smoothstep(.2,.7,fw); // distant rings resolve into haze, not aliasing
  float angle=a+.10*sin(z*.35+uTime*.035);
  float seam=pow(.5+.5*cos(angle*12.0),18.0);
  float grain=noise2(vec2(a*5.0,depth*3.0));
  // Fog is continuous and fades distant detail before the open centre. No black overlay disc.
  float fog=exp(-max(z-1.0,0.0)*.46);
  float aperture=smoothstep(.025,.17,r);
  vec3 base=uPal[0]*.2;
  vec3 walls=pal(.4+.18*sin(a+depth*.13))*(.07+.06*grain+.36*rings+.09*seam);
  walls+=pal(.8)*pow(.5+.5*sin(a*4.0-z),5.0)*flux(pitch)*.08;
  fragColor=vec4(base+walls*fog*aperture,1);
}`,
};
