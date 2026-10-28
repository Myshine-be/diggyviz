import test from 'node:test';
import assert from 'node:assert/strict';
import {createUrchinMotion,updateUrchin,spikePoint} from '../js/visuals/urchin-events.js';
import {createDunes,advanceDunes,duneHeight,bakeDunes} from '../js/visuals/dune-ridges.js';
const audio=()=>({bands:new Float32Array(32),flux:new Float32Array(32),kick:0,snare:0,hit:0,rest:0,beatIdx:0,snareN:0});
test('Urchin: a bass hit selects a connected lower patch, not identical lengths everywhere',()=>{
 const s=createUrchinMotion(),a=audio();a.kick=1;a.hit=1;a.beatIdx=1;a.bands.fill(.8,0,8);
 updateUrchin(s,a,1/60);assert.equal(s.events.length,1);assert.ok(s.events[0].dir[1]<0);
 const long=[...s.lengths].map((l,i)=>({l,i})).filter(x=>x.l>.45);
 assert.ok(long.length>5&&long.length<200);assert.ok(long.reduce((t,x)=>t+spikePoint(x.i)[1],0)/long.length<0);
 assert.ok(s.lengths.every(l=>l>=.075&&l<.861));
});
test('Urchin: high hits select upper compact clusters; no double events from held counters',()=>{
 const s=createUrchinMotion(),a=audio();a.snare=1;a.hit=1;a.snareN=1;a.bands.fill(.8,16);
 updateUrchin(s,a,1/60);assert.ok(s.events[0].dir[1]>0);assert.equal(s.events[0].bass,false);
 for(let i=0;i<10;i++)updateUrchin(s,a,1/60);assert.equal(s.events.length,1);
});
test('Urchin: waves alternate, events are bounded, silence releases all spikes',()=>{
 const s=createUrchinMotion(),a=audio();let prev=false,waves=0;
 for(let i=1;i<22;i++){a.beatIdx=i;a.kick=1;a.hit=1;updateUrchin(s,a,.1);const w=s.events.at(-1).wave;assert.ok(!(prev&&w));prev=w;waves+=w;assert.ok(s.events.length<=6);}
 assert.ok(waves>0);a.kick=0;a.hit=0;a.rest=1;
 for(let i=0;i<300;i++)updateUrchin(s,a,1/60);
 assert.equal(s.events.length,0);assert.ok(s.lengths.every(l=>l<.077));
});
test('Urchin: release duration does not depend on refresh rate',()=>{
 const simulate=fps=>{const s=createUrchinMotion(),a=audio();a.beatIdx=1;a.kick=1;a.hit=1;updateUrchin(s,a,0);a.kick=0;a.hit=0;for(let i=0;i<fps;i++)updateUrchin(s,a,1/fps);return s.lengths;};
 const a=simulate(30),b=simulate(120);assert.ok(a.every((v,i)=>Math.abs(v-b[i])<.012));
});
test('Dunes: quick hits merge, strong hits produce taller ridges, settled terrain survives silence',()=>{
 const make=strength=>{const s=createDunes(),a=audio();a.beatIdx=1;a.kick=strength;advanceDunes(s,a,.01);return {s,a};};
 const low=make(.2),high=make(1);
 high.a.beatIdx++;advanceDunes(high.s,high.a,.1);assert.equal(high.s.ridges.length,1);
 for(const {s,a} of [low,high]){a.kick=0;for(let i=0;i<20;i++)advanceDunes(s,a,.1);}
 const z=high.s.ridges[0].z;assert.ok(duneHeight(high.s,z)>duneHeight(low.s,z)+.25);
 const before=duneHeight(high.s,z);high.a.rest=1;for(let i=0;i<30;i++)advanceDunes(high.s,high.a,.1);
 assert.equal(duneHeight(high.s,z),before);assert.ok(bakeDunes(high.s).every(v=>Number.isFinite(v)&&v<=1.3));
});
test('Dunes: camera speed is steady under different beats and rest states',()=>{
 const a=createDunes(),b=createDunes(),l=audio(),r=audio();
 for(let i=0;i<300;i++){r.beatIdx=i;r.kick=1;r.rest=i>150?1:0;advanceDunes(a,l,1/30);advanceDunes(b,r,1/30);}
 assert.equal(a.travel,b.travel);assert.ok(b.ridges.length<=32);
});
