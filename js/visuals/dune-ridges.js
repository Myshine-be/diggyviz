// A bounded, world-anchored memory of music. Old dunes do not flatten when a song becomes quiet.
export const DUNE_SAMPLES=512, DUNE_RANGE=48;
const clamp=(v,a=0,b=1)=>Math.min(b,Math.max(a,v));
const hash=n=>{const h=Math.sin(n*127.1)*43758.5453;return h-Math.floor(h);};
export function createDunes() {return {time:0,travel:0,kick:0,snare:0,ridges:[],profile:new Float32Array(DUNE_SAMPLES)};}
export function advanceDunes(s,a,dt) {
  dt=clamp(dt||0,0,.1);s.time+=dt;s.travel+=dt*.22;
  const hit=(a.beatIdx||0)>s.kick||(a.snareN||0)>s.snare;
  s.kick=a.beatIdx||0;s.snare=a.snareN||0;
  if(hit&&Math.max(a.kick||0,a.snare||0,a.hit||0)>.05) {
    const strength=clamp(Math.max(a.kick||0,(a.snare||0)*.65,a.hit||0));
    // Close hits combine. The world cell remains fixed after its brief growth phase.
    const z=Math.round((s.travel+12)/1.3)*1.3,last=s.ridges.at(-1);
    if(last && (s.time-last.at<.3 || (Math.abs(last.z-z)<.8 && s.time-last.born<.8))) {
      last.strength=Math.max(last.strength,strength);last.at=s.time;
    } else if(!last||Math.abs(last.z-z)>=.8) s.ridges.push({z,strength,born:s.time,at:s.time});
  }
  s.ridges=s.ridges.filter(r=>r.z>s.travel-6).slice(-32);
  return s;
}
export function duneHeight(s,z) {
  const id=Math.floor(z/4.5),u=(z/4.5-id),crest=.68;
  const width=u<crest?.36:.15;
  const baseline=.12+(.53+.15*hash(id+99))*Math.exp(-Math.pow((u-crest)/width,2)*2);
  let raised=0;
  for(const r of s.ridges) {
    const growth=clamp((s.time-r.born)/.8),ease=growth*growth*(3-2*growth);
    const width= .45+r.strength*.65, d=z-r.z;
    raised=Math.max(raised,(.06+r.strength*.45)*ease*Math.exp(-d*d/(width*width)));
  }
  return Math.min(1.3,baseline+raised);
}
export function bakeDunes(s) {
  const start=s.travel-4;
  for(let i=0;i<DUNE_SAMPLES;i++)s.profile[i]=duneHeight(s,start+i/(DUNE_SAMPLES-1)*DUNE_RANGE);
  return s.profile;
}
