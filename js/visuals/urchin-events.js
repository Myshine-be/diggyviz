// Measured-hit choreography. Deterministic, bounded and independent of renderer frame rate.
export const SPIKES = 420;
const PHI = (1 + Math.sqrt(5)) / 2;
const clamp = (x, lo=0, hi=1) => Math.min(hi,Math.max(lo,x));
const hash = n => { const x=Math.sin(n*127.1+311.7)*43758.5453; return x-Math.floor(x); };
export function spikePoint(i) {
  const z=1-1/SPIKES-2*i/SPIKES, r=Math.sqrt(Math.max(0,1-z*z)), a=2*Math.PI*((i*PHI)%1);
  return [Math.cos(a)*r,Math.sin(a)*r,z];
}
const points=Array.from({length:SPIKES},(_,i)=>spikePoint(i));
function orient([x,y,z],t,song) {
  const a=t*.13+song*.05,b=t*.09, X=Math.cos(a)*x-Math.sin(a)*z,Z=Math.sin(a)*x+Math.cos(a)*z;
  return [X,Math.cos(b)*y+Math.sin(b)*Z,-Math.sin(b)*y+Math.cos(b)*Z];
}
function sample(values,f) {
  if(!values?.length)return 0; const p=clamp(f)*(values.length-1),i=Math.floor(p);
  return clamp((values[i]||0)*(1-(p-i))+(values[Math.min(i+1,values.length-1)]||0)*(p-i));
}
export function createUrchinMotion() {
  return { time:0, kick:0, snare:0, count:0, events:[], lengths:new Float32Array(SPIKES).fill(.09), memory:new Float32Array(SPIKES) };
}
export function updateUrchin(m,a,dt,time=0,song=0) {
  dt=clamp(dt||0,0,.1); m.time+=dt;
  if((a.beatIdx??0)<m.kick || (a.snareN??0)<m.snare) m.events=[];
  const kick=(a.beatIdx??0)>m.kick, snare=(a.snareN??0)>m.snare;
  m.kick=a.beatIdx??0; m.snare=a.snareN??0;
  if((kick||snare) && Math.max(a.kick||0,a.snare||0,a.hit||0)>.05) {
    let low=0,high=0;for(let i=0;i<8;i++)low+=a.bands?.[i]||0;for(let i=12;i<28;i++)high+=(a.bands?.[i]||0)*.5;
    const bass=kick&&(!snare||low>high*1.15), n=++m.count;
    const y=(bass ? -.58 : .45)+(hash(n+3)-.5)*.45, x=(hash(n+7)-.5)*1.2;
    const d=orient([x,y,Math.sqrt(Math.max(.05,1-x*x-y*y))],time,song);
    const length=Math.hypot(...d);
    m.events.push({born:m.time,dir:d.map(v=>v/length),strength:clamp(Math.max(bass?a.kick:a.snare,a.hit||0,.25)),bass,wave:n%3===0});
  }
  m.events=m.events.filter(e=>m.time-e.born<1.2).slice(-6);
  for(let i=0;i<SPIKES;i++) {
    const q=points[i], screenY=Math.cos(time*.09)*q[1]-Math.sin(time*.09)*q[2];
    const f=clamp((screenY+1)*.48+(hash(i)-.5)*.08), sensitivity=.75+.5*hash(i+101);
    let drive=(sample(a.bands,f)*.20+sample(a.flux,f)*.28)*(1-.85*(a.rest||0));
    for(const e of m.events) {
      const age=m.time-e.born, cos=clamp(q.reduce((sum,v,j)=>sum+v*e.dir[j],0),-1,1), angle=Math.acos(cos);
      const width=e.bass?.9:.36, cluster=Math.exp(-Math.pow(angle/width,4));
      const decay=Math.exp(-age/(.15+.30*hash(i+41)));
      const front=e.wave?Math.exp(-Math.pow((angle-age*3.4)/.20,2))*Math.exp(-age*2.5)*(1-Math.exp(-age*24)):0;
      drive+=e.strength*(cluster*decay*.94+front*.64);
    }
    drive*=sensitivity;
    m.memory[i]=Math.max(drive,m.memory[i]*Math.exp(-dt/(.15+.3*hash(i+41))));
    m.lengths[i]=.075+.785*(1-Math.exp(-m.memory[i]*1.8));
  }
  return m.lengths;
}
