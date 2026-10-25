import { STORY_SHAPES } from "./story-shapes.js";
import { SPECTRUM_HISTORY } from "./spectrum-history.js";

export default {
  id: "nightdrive", name: "Night Drive", story: true, duration: 120, bloom: 0.48,
  frag: STORY_SHAPES + SPECTRUM_HISTORY + /* glsl */ `
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
// ---------- Convoy (90-second reward): cars that each carry one of the DiggyViz visuals ----------
// Car seen from behind; q in car units (1 = the player's car), feet of the tyres at y ~ -0.075.
vec3 drawCar(vec3 col, vec2 car, float px, float kick) {
  if(abs(car.x)>.2||car.y<-.12||car.y>.12)return col;
  vec2 sh=(car-vec2(0,-.065))*vec2(1,3);
  col*=1.0-exp(-dot(sh,sh)*90.0)*.75;
  col+=uPal[3]*exp(-length(car*vec2(1,3))*22.0)*(.25+.2*kick);
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
  col+=uPal[3]*boxMask(car-vec2(0,-.02),vec2(.103,.006),.002,px)*(1.1+.5*kick);
  col+=uPal[2]*boxMask(car-vec2(0,-.049),vec2(.023,.007),.002,px)*.6;
  col=mix(col,uPal[1]*.3,boxMask(car-vec2(0,.015),vec2(.13,.006),.003,px));
  return col;
}
// Strings: glowing wave lines streaming above the roof like a banner.
vec3 attrStrings(vec3 col, vec2 q, float px, float B) {
  if(abs(q.x)>.2||q.y<.08||q.y>.32)return col;
  float u=clamp(q.x/.36+.5,0.0,1.0),env=pow(sin(PI*u),1.2);
  float lines=0.0;
  for(int i=0;i<6;i++){float fi=float(i);
    float w=sin(u*(3.0+fi)*PI+uTime*(1.2+.2*fi)+fi)*.6+sin(u*7.0*PI-uTime*1.7+fi*2.0)*.4;
    float y=.2+env*w*(.012+.05*specAt(u,B-fi*.08));
    lines+=lineAt(q.y-y,dFdx(y)/max(dFdx(q.x),1e-5),px)*(.5+.08*fi);}
  return col+lineCol(.3)*lines*.7;
}
// Bubbles: a little swarm turning round the car.
vec3 attrBubbles(vec3 col, vec2 q, float px, float B) {
  vec2 c=q-vec2(0,.06);
  if(length(c*vec2(.8,1.1))>.32)return col;
  float r=length(c),a=atan(c.y,c.x);
  float R=.19+.03*specAt(.1,B);
  float dens=exp(-pow((r-R)/.045,2.0))*(.35+.65*pow(.5+.5*cos(a-uTime*1.2),2.0));
  vec2 g=(rot(uTime*.3)*c+vec2(0,uTime*.02))/.022;vec2 id=floor(g);
  float b=0.0;
  for(int j=-1;j<=1;j++)for(int i=-1;i<=1;i++){vec2 cid=id+vec2(i,j);
    if(hash12(cid+3.0)<.4)continue;
    vec2 pos=cid+.2+.6*hash22(cid);float d=length(g-pos)*.022,rad=.022*(.18+.2*hash12(cid));
    b+=1.0-smoothstep(rad-max(px,rad*.4),rad+max(px,rad*.4),d);}
  return col+lineCol(.55)*b*dens*.9+uPal[1]*dens*.05;
}
// Halo: spectrum circles hovering over the car; a new one grows out every half beat.
vec3 attrHalo(vec3 col, vec2 q, float px, float B) {
  vec2 c=q-vec2(0,.2);
  if(abs(c.x)>.2||abs(c.y)>.1)return col;
  float B2=B*2.0,fr=fract(B2);
  for(int k=0;k<6;k++){float fk=float(k);
    float R=.05+(fk+fr)*.022;float th=atan(c.y/.33,c.x);
    float f=abs(fract((th+uTime*.3)/TAU+.5)*2.0-1.0);
    float sp=specAt(f,(floor(B2)-fk)*.5);
    vec2 e=vec2(c.x,c.y-sp*.035);
    col+=lineCol(f)*ellipseLine(e,R,R*.33,px)*exp(-fk*.25)*smoothstep(0.0,.7,fk+fr)*(e.y<0.0?.9:.5);}
  return col;
}
// Orbit: a small turning sphere of lines on the roof.
vec3 attrOrbit(vec3 col, vec2 q, float px, float B) {
  vec2 c=q-vec2(0,.16);
  if(length(c)>.1)return col;
  float R=.075,sT=sin(.42),cT=cos(.42),rot_=uTime*.8;
  for(int k=0;k<7;k++){float lat=mix(-1.2,1.2,(float(k)+.5)/7.0);float r=R*cos(lat);
    vec2 e=vec2(c.x,c.y-R*sin(lat)*cT);
    float lam=atan(-e.y/sT,e.x),lon=lam+rot_,f=abs(lat)/1.2;
    float rr=r*(1.0+specAt(f,B-fract(lon/TAU)*2.0)*.12*(.6+.4*sin(lon*5.0)));
    float zf=R*sin(lat)*sT+rr*sin(lam)*cT;
    col+=lineCol(f)*ellipseLine(e,rr,rr*sT,px)*(zf>0.0?.95:.3);}
  return col;
}
// Vanish: light trails from a car's taillights to the road's vanishing point, rippling on the beat.
float trail(vec2 p, vec2 a, vec2 b, float px, float B, float seed) {
  vec2 v=b-a;float u=clamp(dot(p-a,v)/dot(v,v),0.0,1.0);
  vec2 n=normalize(vec2(-v.y,v.x));
  float off=(1.0-u)*specAt(.15+seed*.3,B-u*6.0)*.035*sin(u*30.0-uTime*4.0+seed*3.0);
  float d=abs(dot(p-a-v*u,n)-off);
  return exp(-d/(px*1.2))*(1.0-u)*.35;
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
    float center=bend(z,t);float halfW=.85*depth*(1.0+egg*1.7);
    float x=p.x-center;
    float road=1.0-smoothstep(halfW-px,halfW+px,abs(x));
    vec3 ground=uPal[0]*.5;
    float grid=gridLine(p.x/depth*2.0,.012)+gridLine(z-travel,.018);
    ground+=uPal[1]*grid*.045;
    ground+=uPal[3]*egg*exp(-depth*14.0)*.12;
    col=mix(ground,uPal[0]*.13,road);
    float edge=exp(-abs(abs(x)-halfW)*160.0);
    col+=mix(uPal[1],uPal[3],egg)*edge*(.45+.35*uKick);
    float lane=(exp(-abs(abs(x)-halfW*.34)*220.0)+egg*exp(-abs(abs(x)-halfW*.67)*220.0))*step(.42,fract(z*2.2-travel*2.2));
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
      vec2 anchor=vec2(c+sign_*(.145/z*(1.0+egg*1.7)+.024),y);
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
  // 90-second reward: a convoy of four cars joins you, each carrying one of the DiggyViz visuals.
  float c120=mod(t,120.0), B=beatNow();
  vec2 carPos=vec2(sin(t*.28)*.025,-.29+.004*uKick);
  float halfV=.5*uRes.x/min(uRes.x,uRes.y)*zoom;          // visible half-width in scene units
  vec2 vp=vec2(bend(30.0,t),horizon+.004);                  // where the road meets the horizon
  // slot: x (fraction of the visible half-width), y, scale; kinds 0 strings, 1 bubbles, 2 halo, 3 orbit
  vec4 slots[4]=vec4[4](vec4(-.42,-.13,.62,2.0),vec4(.42,-.13,.62,3.0),vec4(-.62,-.37,.88,0.0),vec4(.62,-.37,.88,1.0));
  vec3 cars[4];float shown[4];
  for(int i=0;i<4;i++){float fi=float(i);vec4 s=slots[i];
    float enter=smoothstep(90.0+fi*.6,91.9+fi*.6,c120),leave=smoothstep(101.0+fi*.5,104.5+fi*.5,c120);
    enter=enter*enter*(3.0-2.0*enter);
    vec2 pos=vec2(s.x*min(halfV,.62)+sin(t*.6+fi*1.7)*.015,mix(-1.1,s.y,enter)+.004*uKick);
    float sc=s.z;
    pos=mix(pos,vp,leave*leave);sc*=mix(1.0,.06,leave);
    cars[i]=vec3(pos,sc);shown[i]=enter*(1.0-step(.999,leave));}
  if(egg>0.0){   // Vanish: taillight trails into the vanishing point, behind all cars
    float tr=trail(p,carPos+vec2(-.1,-.02),vp,px,B,0.0)+trail(p,carPos+vec2(.1,-.02),vp,px,B,1.0);
    for(int i=0;i<4;i++)if(shown[i]>0.0){vec3 cr=cars[i];
      tr+=(trail(p,cr.xy+vec2(-.1,-.02)*cr.z,vp,px,B,float(i)+2.0)+trail(p,cr.xy+vec2(.1,-.02)*cr.z,vp,px,B,float(i)+2.5))*shown[i];}
    col+=lineCol(.75)*tr*egg;
  }
  // far pair first, then you, then the near pair (they are closer to the camera)
  for(int pass=0;pass<3;pass++){
    if(pass==1){col=drawCar(col,p-carPos,px,uKick);continue;}
    for(int j=0;j<2;j++){int i=pass==0?j:j+2;if(shown[i]<=0.0)continue;
      vec3 cr=cars[i];vec2 q=(p-cr.xy)/cr.z;float pq=px/cr.z;int kind=int(slots[i].w);
      vec3 before=col;
      col=drawCar(col,q,pq,uKick);
      if(kind==0)col=attrStrings(col,q,pq,B);
      else if(kind==1)col=attrBubbles(col,q,pq,B);
      else if(kind==2)col=attrHalo(col,q,pq,B);
      else col=attrOrbit(col,q,pq,B);
      col=mix(before,col,clamp(shown[i]*1.5,0.0,1.0));}
  }
  fragColor=vec4(max(col,vec3(0)),1);
}`,
};
