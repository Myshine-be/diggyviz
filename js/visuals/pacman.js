import { STORY_SHAPES } from "./story-shapes.js";

export default {
  id: "pacman", name: "Pac-Man", story: true, duration: 120, bloom: 0.38,
  frag: STORY_SHAPES + /* glsl */ `
// A closed, wall-free outer corridor. One pellet per beat; no random teleporting.
vec2 route(float step_) {
  float k=mod(step_,32.0);
  if(k<8.0)return vec2(-.32+k*.08,.32);
  if(k<16.0)return vec2(.32,.32-(k-8.0)*.08);
  if(k<24.0)return vec2(.32-(k-16.0)*.08,-.32);
  return vec2(-.32,-.32+(k-24.0)*.08);
}
vec2 runner(float b) {float f=fract(b);return mix(route(floor(b)),route(floor(b)+1.0),f*f*(3.0-2.0*f));}
vec3 pac(vec3 col,vec2 q,float angle,float r,float aa) {
  q=rot(angle)*q;
  float mouth=.12+.7*pow(sin(PI*uSceneBeat),2.0);
  float a=abs(atan(q.y,q.x));
  float wedge=smoothstep(mouth-.06,mouth+.06,a);
  float body=disk(q,r,aa)*wedge;
  vec3 gold=mix(uPal[2],vec3(1),.25);
  col=mix(col,gold*.95,body);
  col+=gold*exp(-abs(length(q)-r)*240.0)*wedge*.12;
  float eye=disk(q-vec2(.002,r*.5),r*.105,aa);
  col=mix(col,uPal[0]*.2,eye*body);
  return col;
}
vec3 ghost(vec3 col,vec2 q,vec3 tint,float aa,float phase) {
  q.y-=sin(uSceneBeat*TAU+phase)*.0025;
  q.x+=sin(uSceneBeat*PI+phase)*q.y*.12;
  float top=disk(q-vec2(0,.006),.022,aa)*step(.006,q.y);
  float hem=-.018+sin(q.x*360.0+uSceneBeat*TAU)*.003;
  float skirt=boxMask(q-vec2(0,-.004),vec2(.022,.012),.002,aa)*smoothstep(hem-aa,hem+aa,q.y);
  float body=max(top,skirt);
  col=mix(col,tint*(.85+.15*uKick),body);
  for(int eye=0;eye<2;eye++) {
    vec2 e=q-vec2((float(eye)*2.0-1.0)*.008,.008);
    col=mix(col,vec3(.95),disk(e*vec2(1, .8),.006,aa));
    col=mix(col,uPal[0]*.12,disk(e-vec2(.0015,0),.0028,aa));
  }
  return col;
}
vec3 wall(vec3 col,vec2 p,vec2 c,vec2 b,float egg,float aa) {
  vec2 q=p-c*(1.0+egg*.3);
  q=rot(egg*sin(uSceneBeat*PI*.5+c.x*10.0)*.18)*q;
  float d=boxSDF(q,b,.009);
  col=mix(col,uPal[0]*.55,(1.0-smoothstep(-aa,aa,d))*(1.0-egg*.75));
  float edge=1.0-smoothstep(.002-aa,.002+aa,abs(d));
  col+=mix(uPal[1],uPal[3],egg)*edge*(.7+.12*uKick)*(1.0-egg*.85);
  col+=uPal[1]*exp(-abs(d)*150.0)*.045*(1.0-egg);
  return col;
}
void main() {
  vec2 p=P();float aa=1.1/min(uRes.x,uRes.y);
  float t=uSceneTime,b=uSceneBeat,egg=surprise(t);
  float chapter=floor(t/120.0);
  vec3 col=uPal[0]*.2;
  // The cabinet's stars and concentric rings stay subtle until the hidden disco.
  float radius=length(p);
  col+=uPal[1]*exp(-radius*4.0)*.045;
  float ring=gridLine(radius*12.0-t*.4,.025);
  col+=mix(uPal[1],uPal[3],.5)*egg*ring*.1;
  vec2 stars=p*50.0;
  col+=uPal[2]*exp(-dot(fract(stars)-.5,fract(stars)-.5)*130.0)*step(.96,hash12(floor(stars)))*(.06+.5*egg);
  // Double cabinet frame; the border opens into four dancing arcs for the reward.
  col+=uPal[1]*boxLine(p,vec2(.405),.036,.0025,aa)*(.5+.12*uKick)*(1.0-egg*.8);
  col+=uPal[3]*boxLine(p,vec2(.39),.026,.001,aa)*.35*(1.0-egg);
  // Interior maze: clear outer corridor for the actual animated route.
  for(int x=0;x<2;x++)for(int y=0;y<2;y++) {
    vec2 sign_=vec2(float(x)*2.0-1.0,float(y)*2.0-1.0);
    col=wall(col,p,sign_*vec2(.205,.205),vec2(.055,.055),egg,aa);
    col=wall(col,p,sign_*vec2(.09,.205),vec2(.027,.055),egg,aa);
    col=wall(col,p,sign_*vec2(.205,.075),vec2(.055,.026),egg,aa);
    col=wall(col,p,sign_*vec2(.09,.075),vec2(.027,.026),egg,aa);
  }
  // Ghost pen becomes a tiny equalizer dance floor.
  col=wall(col,p,vec2(0,-.08),vec2(.075,.03),egg,aa);
  for(int i=0;i<9;i++) {
    float x=(float(i)-4.0)*.015;
    float h=.009+band(float(i)/8.0)*.03;
    float led=boxMask(p-vec2(x,-.084+h*.5),vec2(.004,h*.5),.001,aa);
    col+=pal(.4+float(i)*.06)*led*(.25+egg*.7);
  }
  // Pills disappear behind the runner and refill on the next circuit.
  float progress=mod(b,32.0);
  for(int i=0;i<32;i++) {
    float fi=float(i);vec2 node=route(fi);
    float eaten=1.0-smoothstep(fi-.7,fi-.1,progress);
    // During the reward the pills escape the maze as an orbit of light.
    float a=fi*TAU/32.0+t*.25;
    vec2 orbit=vec2(cos(a),sin(a))*(.24+.025*sin(b*PI*.5+fi));
    node=mix(node,orbit,egg);
    float big=1.0-step(.5,mod(fi,8.0));
    float r=mix(.0035,.009,big)*(1.0+big*uKick*.35);
    col+=uPal[2]*disk(p-node,r,aa)*mix(eaten,1.0,egg)*.9;
  }
  // Score lights: a full row fills as each lap completes, without fake song analysis.
  for(int i=0;i<8;i++) {
    vec2 q=p-vec2((float(i)-3.5)*.032,.46);
    col+=mix(uPal[1]*.08,uPal[2]*.6,step(float(i),floor(progress/4.0)))*boxMask(q,vec2(.011,.0035),.002,aa);
  }
  // A short shooting star every 24 seconds rewards attention between the big events.
  float comet=mod(t,24.0);float cv=smoothstep(16.0,16.4,comet)*(1.0-smoothstep(18.5,19.0,comet));
  vec2 cp=vec2(-.7+(comet-16.0)*.5,.53-(comet-16.0)*.05);
  col+=uPal[3]*strokeSeg(p,cp,cp-vec2(.07,-.008),.0015,aa)*cv;
  // Ghosts follow at a readable distance, then form an orbiting dance troupe.
  for(int i=3;i>=0;i--) {
    float fi=float(i);
    vec2 pos=runner(b-3.0-fi*2.8);
    float a=fi*TAU/4.0+t*.7+chapter*PI*.5;
    vec2 party=vec2(cos(a),sin(a))*(.145+.022*sin(b*PI));
    pos=mix(pos,party,egg);
    vec3 tint=i==0?uPal[3]:i==1?uPal[1]:i==2?uPal[2]:mix(uPal[1],vec3(1),.45);
    if(length(p-pos)<.07)col=ghost(col,p-pos,tint,aa,fi);
  }
  vec2 pos=mix(runner(b),vec2(0,.025*sin(b*PI)),egg);
  vec2 dir=route(floor(b)+1.0)-route(floor(b));
  float angle=atan(dir.y,dir.x);
  // rot() maps into sprite space. The pac always faces its direction of travel.
  angle=mix(angle,t*.8,egg);
  col=pac(col,p-pos,angle,mix(.024,.065,egg),aa);
  fragColor=vec4(max(col,vec3(0)),1);
}`,
};
