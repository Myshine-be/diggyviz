// Ink suspended in glass. Independent Chrome-inspired Lissajous paths; no centre spring or shared centroid.
const centres=new Float32Array(28);
export default {
  id:"soulbeat", name:"Soul Beat", caption:true, bloom:0.18, grade:0.25,
  lyrics:{y:{land:0.12,port:0.15},font:"light"},
  uniforms({gl,loc,frame}) {
    const a=frame.audio,t=frame.time*.24;
    for(let i=0;i<7;i++) {
      const x=Math.sin(t*(.7+i*.13)+i*1.9),y=Math.cos(t*(.6+i*.11)+i*2.7),z=Math.sin(t*(.5+i*.17)+i*.8);
      const length=Math.hypot(x,y,z)||1, r=.38+.22*(.5+.5*Math.sin(t*.31+i*1.7));
      const level=a.bands?.[Math.round(i/7*31)]||0, onset=a.flux?.[Math.round(i/7*31)]||0;
      centres.set([x/length*r,y/length*r,z/length*r,.125+.055*level+.035*onset],i*4);
    }
    if(loc.uInk)gl.uniform4fv(loc.uInk,centres);
  },
  frag: /* glsl */ `
uniform vec4 uInk[7];
float inkField(vec3 p) {
  float d=10.0;
  for(int i=0;i<7;i++) {
    float fi=float(i),fq=(fi+.5)/7.0;
    vec3 q=p-uInk[i].xyz;
    q+=sin(q.yzx*9.0+vec3(fi,uTime*.12,fi*2.0))*sin(q.zxy*6.0+fi)*(.022+.022*band(fq));
    float selected=1.0-step(.5,abs(fi-mod(uKickN,7.0)));
    float strike=selected*uKick;
    float stretch=1.0+band(fq)*.35+strike*.75;
    q.xy=rot(fi*1.7+uTime*.065)*q.xy;
    vec3 axes=vec3(.87/stretch,stretch,1.0);
    float blob=(length(q/axes)-uInk[i].w)*min(axes.x,1.0);
    // Soft corrugations follow local pitch; no ferrofluid needles or metallic centre.
    blob+=sin(q.x*25.0+fi)*sin(q.y*21.0-fi)*sin(q.z*19.0)*(.002+.012*flux(fq));
    d=smin(d,blob,.065);
    float sn=1.0-step(.5,abs(fi-mod(uSnareN+3.0,7.0)));
    // A daughter droplet separates next to THIS mass, never a collective centroid.
    vec3 dir=normalize(vec3(sin(fi*2.1),cos(fi*1.3),.35));
    vec3 dc=uInk[i].xyz+dir*(uInk[i].w+.025+sn*uSnare*.15);
    d=smin(d,length(p-dc)-(.027+.016*sn*uSnare),.025);
  }
  return max(d,length(p)-.89);
}
vec3 inkNormal(vec3 p) {
  vec2 e=vec2(.002,-.002);
  return normalize(e.xyy*inkField(p+e.xyy)+e.yyx*inkField(p+e.yyx)+e.yxy*inkField(p+e.yxy)+e.xxx*inkField(p+e.xxx));
}
void main() {
  vec2 p=P()-vec2(0,-.025),q=p/.375;
  float r=length(q),px=1.5/min(uRes.x,uRes.y)/.375;
  vec3 col=uPal[0]*.25+pal(.45)*.018;
  if(r<1.0+px) {
    float front=sqrt(max(0.0,1.0-r*r));
    vec3 glass=mix(vec3(.09,.12,.13),vec3(.27,.32,.30),smoothstep(-1.0,1.0,q.y));
    glass=mix(glass,glass*(.5+pal(.55)),.18);
    glass*=.45+.55*front; // transparent-looking edge rather than a uniformly lit moon disc
    // Very mild refraction; the masses remain spread throughout the bowl.
    vec3 ro=vec3(q*(1.0-.035*front),front),rd=vec3(0,0,-1);
    float t=.015;bool hit=false;float d=1.0;
    for(int i=0;i<72;i++) {
      d=inkField(ro+rd*t);
      if(d<.0018){hit=true;break;}
      t+=max(.003,d*.67);
      if(t>2.0*front)break;
    }
    if(hit) {
      vec3 pos=ro+rd*t,n=inkNormal(pos);
      float dif=max(dot(n,normalize(vec3(-.5,.8,1.0))),0.0);
      float rim=pow(1.0-max(n.z,0.0),2.0);
      vec3 ink=vec3(.012,.017,.022)+uPal[0]*.2;
      ink+=pal(.55)*(.028*dif+.12*rim);
      // Restrained translucent edges, no bright chrome highlights.
      glass=mix(glass,ink,.94-.18*rim);
    }
    float edge=pow(1.0-front,5.0);
    glass=mix(glass,uPal[1]*.35+vec3(.16),edge*.35);
    vec3 nGlass=vec3(q,front);
    float softbox=pow(max(dot(nGlass,normalize(vec3(-.55,.65,.6))),0.0),75.0);
    glass+=vec3(.18,.19,.18)*softbox;
    glass+=pal(.65)*edge*max(dot(q,normalize(vec2(.7,.5))),0.0)*.14;
    col=mix(col,glass,1.0-smoothstep(1.0-px,1.0+px,r));
  }
  col+=pal(.6)*exp(-abs(r-1.0)*160.0)*.08;
  fragColor=vec4(col,1);
}`,
};
