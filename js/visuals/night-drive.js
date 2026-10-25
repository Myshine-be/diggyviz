import { STORY_SHAPES } from "./story-shapes.js";

export default {
  id: "nightdrive", name: "Night Drive", story: true, duration: 120, bloom: 0.48,
  frag: STORY_SHAPES + /* glsl */ `
float bend(float z,float t) {return sin(t*0.13+z*0.05)*0.065*z/(1.0+z*0.12);}

vec3 palm(vec3 col,vec2 q,float aa,float phase) {
  if(abs(q.x)>0.27 || q.y<-.03 || q.y>.7)return col;
  float sway=sin(uSceneBeat*TAU*.25+phase)*(.018+.025*uEnergy);
  vec2 tip=vec2(sway,.44);
  float trunk=strokeSeg(q,vec2(0),tip,.009,aa);
  col=mix(col,uPal[1]*.45,trunk);
  col+=uPal[2]*strokeSeg(q,vec2(-.007,0),tip-vec2(.007,0),.002,aa)*.4;
  for(int i=0;i<6;i++) {
    float a=float(i)*TAU/6.0+.2;
    vec2 end=tip+vec2(cos(a)*.19,sin(a)*.09-.04);
    vec2 mid=mix(tip,end,.5)+vec2(0,.06+.02*uKick);
    float leaf=max(strokeSeg(q,tip,mid,.011,aa),strokeSeg(q,mid,end,.006,aa));
    col=mix(col,mix(uPal[1],uPal[2],.3)*(.65+.6*uKick),leaf);
  }
  return col;
}
vec3 speaker(vec3 col,vec2 q,float aa) {
  if(abs(q.x)>.15||q.y<-.02||q.y>.4)return col;
  q.x-=sin(uSceneBeat*TAU*.5)*.025*q.y;
  float body=boxMask(q-vec2(0,.15),vec2(.095,.15),.014,aa);
  col=mix(col,uPal[0]*.4,body);
  col+=uPal[3]*boxLine(q-vec2(0,.15),vec2(.095,.15),.014,.003,aa)*.8;
  for(int j=0;j<2;j++) {
    vec2 v=q-vec2(0,.08+float(j)*.14);
    float r=.046*(1.0+.18*uKick);
    col+=uPal[1]*(disk(v,r,aa)-disk(v,r-.006,aa))*(.6+uKick);
    col+=uPal[2]*disk(v,.016,aa)*(.4+uKick);
  }
  return col;
}
void main() {
  vec2 p=P();
  // Portrait: zoom in and lower the scene so the car sits in the lower third, not mid-screen.
  float tall=clamp(uRes.y/uRes.x-1.0,0.0,1.3);
  float zoom=1.0-0.22*tall;
  p=p*zoom+vec2(0.0,0.19*tall);
  float px=1.2*zoom/min(uRes.x,uRes.y);
  float t=uSceneTime, egg=surprise(t), travel=t*.75;
  float horizon=.17;
  vec3 col=mix(uPal[0]*.15,uPal[1]*.12,exp(-abs(p.y-horizon)*4.0));
  // Star field, far mountains and a striped setting sun.
  vec2 stars=p*80.0;vec2 sid=floor(stars),sp=fract(stars)-.5;
  float star=exp(-dot(sp,sp)*180.0)*step(.975,hash12(sid));
  col+=mix(uPal[2],vec3(1),.35)*star*(.25+.12*sin(t+hash12(sid)*TAU))*smoothstep(horizon,.3,p.y);
  vec2 sunp=p-vec2(.12,.38);
  float sun=disk(sunp,.135,px);
  float stripe=smoothstep(.15,.24,fract(sunp.y*45.0));
  col+=mix(uPal[3],uPal[2],smoothstep(-.13,.13,sunp.y))*sun*stripe*.8*(1.0-egg*.8);
  col+=uPal[3]*exp(-length(sunp)*9.0)*.12;
  float ridge=horizon+.015+abs(sin(p.x*7.0+t*.008))*.075+abs(sin(p.x*19.0))*.023;
  col=mix(col,uPal[0]*.3,1.0-smoothstep(ridge-px,ridge+px,p.y));
  // Skyline: each tower subtly stretches with a different rhythm band.
  float cell=floor(p.x*22.0),fx=fract(p.x*22.0);
  float bh=.035+hash12(vec2(cell,3))*.11+band(fract(cell*.17))*.025;
  float building=step(.12,fx)*step(fx,.87)*step(horizon,p.y)*step(p.y,horizon+bh);
  col=mix(col,uPal[0]*.65,building);
  float win=step(.7,fract(p.x*130.0))*step(.7,fract(p.y*140.0));
  col+=building*win*uPal[2]*(.25+.45*uHat);
  // Analytic perspective road; lane dashes travel towards the camera.
  if(p.y<horizon) {
    float depth=max(.015,horizon-p.y),z=.14/depth;
    float center=bend(z,t);float halfW=.85*depth;
    float x=p.x-center;
    float road=1.0-smoothstep(halfW-px,halfW+px,abs(x));
    vec3 ground=uPal[0]*.5;
    float grid=gridLine(p.x/depth*2.0,.012)+gridLine(z-travel,.018);
    ground+=uPal[1]*grid*.045;
    ground+=uPal[3]*egg*exp(-depth*14.0)*.12;
    col=mix(ground,uPal[0]*.13,road);
    float edge=exp(-abs(abs(x)-halfW)*160.0);
    col+=mix(uPal[1],uPal[3],egg)*edge*(.45+.35*uKick);
    float lane=exp(-abs(abs(x)-halfW*.34)*220.0)*step(.42,fract(z*2.2-travel*2.2));
    col+=uPal[2]*lane*road*.7;
    // Reflections and occasional road rings during the secret sky route.
    col+=uPal[1]*exp(-abs(x)*8.0)*road*.07;
    col+=uPal[3]*egg*gridLine(z*1.5-travel*1.5,.025)*road*.6*smoothstep(1.2,3.0,z);
  }
  // Depth-sorted roadside props: palms, dancing speakers and curved streetlights.
  for(int i=11;i>=0;i--) {
    float n=float(i);float z=(n+1.0-fract(travel/1.8))*1.8+.16;
    float s=.25/z;float y=horizon-.14/z;
    float c=bend(z,t);
    float fade=1.0-smoothstep(14.0,22.0,z);
    for(int side=0;side<2;side++) {
      float sign_=side==0?-1.0:1.0;
      vec2 anchor=vec2(c+sign_*(.145/z+.024),y);
      vec2 q=(p-anchor)/s;float aa=px/s;
      vec3 prop=col;
      float kind=mod(n+floor(travel/1.8)+float(side)*2.0,3.0);
      if(kind<.5)prop=palm(prop,q,aa,n);
      else if(kind<1.5)prop=speaker(prop,q,aa);
      else if(abs(q.x)<.22&&q.y>-.03&&q.y<.75) {
        float pole=strokeSeg(q,vec2(0),vec2(0,.57),.007,aa);
        float arm=strokeSeg(q,vec2(0,.57),vec2(-sign_*.15,.63),.008,aa);
        prop=mix(prop,uPal[1]*.5,max(pole,arm));
        vec2 lamp=q-vec2(-sign_*.15,.63);
        prop+=uPal[2]*(disk(lamp,.024,aa)+exp(-length(lamp)*20.0)*.35)*(.65+.55*uKick);
      }
      col=mix(col,prop,fade);
    }
  }
  // 90-second reward: an overhead portal reveals an orbiting UFO and lifts the car.
  vec2 portal=p-vec2(0,.33);
  float pr=length(portal/vec2(1,.72));
  col+=uPal[3]*egg*exp(-abs(pr-.22)*100.0)*(1.0+.25*sin(atan(portal.y,portal.x)*12.0-t*2.0));
  vec2 ufoPos=vec2(sin((t-90.0)*.5)*.06,.36+sin(t)*.012);
  vec2 uf=p-ufoPos;
  float lift=egg*.10;vec2 carPos=vec2(sin(t*.28)*.025,-.29+lift+.004*uKick);
  // Tractor beam: a widening cone from the saucer down to the car.
  vec2 bv=p-ufoPos;float span=ufoPos.y-carPos.y;
  float bt=clamp(-bv.y/span,0.0,1.0);
  float bw=.03+bt*.12;
  float beam=(1.0-smoothstep(bw-.012,bw,abs(bv.x-(carPos.x-ufoPos.x)*bt)))*step(bv.y,0.0)*step(-span,bv.y);
  col+=uPal[2]*beam*egg*(.12+.08*sin(bv.y*90.0-t*8.0)+.1*uKick);
  float saucer=boxMask(uf,vec2(.075,.012),.012,px);
  float dome=disk((uf-vec2(0,.016))*vec2(1,1.5),.034,px)*step(.008,uf.y);
  col=mix(col,uPal[0]*.25,egg*max(saucer,dome));
  col+=egg*uPal[2]*boxLine(uf,vec2(.075,.012),.012,.0018,px)*1.3;
  col+=egg*uPal[1]*(disk((uf-vec2(0,.016))*vec2(1,1.5),.034,px)-disk((uf-vec2(0,.016))*vec2(1,1.5),.028,px))*step(.008,uf.y);
  for(int k=0;k<5;k++){float lx=(float(k)-2.0)*.03;float on=step(.5,fract(uSceneBeat*.5+float(k)*.2));
    col+=egg*mix(uPal[1],uPal[3],on)*disk(uf-vec2(lx,-.002),.0045,px)*(.6+on);}
  // Car: rear silhouette, glass roof, spoiler, tyres, plate and full-width taillights.
  vec2 car=p-carPos;
  vec2 sh=(car-vec2(0,-.065))*vec2(1,3);
  float shadow=exp(-dot(sh,sh)*90.0);
  col*=1.0-shadow*.75;
  float under=exp(-length(car*vec2(1,3))*22.0);
  col+=uPal[3]*under*(.25+.2*uKick);
  float wheels=boxMask(vec2(abs(car.x)-.112,car.y+.037),vec2(.018,.037),.009,px);
  col=mix(col,vec3(.003),wheels);
  vec2 roof=car-vec2(0,.033);float roofWidth=.075-roof.y*.38;
  float cabin=boxMask(vec2(roof.x/max(roofWidth,.02)*.075,roof.y),vec2(.075,.045),.009,px);
  col=mix(col,uPal[1]*.25,cabin);
  float glass=boxMask(roof-vec2(0,.006),vec2(.056,.027),.006,px);
  col=mix(col,uPal[0]*.35+uPal[2]*.12,glass);
  col+=uPal[2]*strokeSeg(car,vec2(-.056,.06),vec2(.052,.06),.002,px)*.7;
  float body=boxMask(car-vec2(0,-.026),vec2(.12,.044),.014,px);
  col=mix(col,uPal[0]*.8+uPal[1]*.12,body);
  col+=uPal[1]*boxLine(car-vec2(0,-.026),vec2(.12,.044),.014,.002,px)*.7;
  col+=uPal[3]*boxMask(car-vec2(0,-.02),vec2(.103,.006),.002,px)*(1.1+.5*uKick);
  col+=uPal[2]*boxMask(car-vec2(0,-.049),vec2(.023,.007),.002,px)*.6;
  col=mix(col,uPal[1]*.3,boxMask(car-vec2(0,.015),vec2(.13,.006),.003,px));
  fragColor=vec4(max(col,vec3(0)),1);
}`,
};
