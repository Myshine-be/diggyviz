import test from 'node:test';
import assert from 'node:assert/strict';
import {makeDetector,processSpectrum} from '../js/listen.js';
import {audio,analyse} from '../js/rhythm.js';
const fresh=()=>({bands:new Float32Array(32),peaks:new Float32Array(32)});
test('steady tones settle; a new frequency creates a local onset',()=>{const st=makeDetector(48000,2048),out=fresh(),s=new Uint8Array(1024);s.fill(150,20,30);for(let i=0;i<360;i++)processSpectrum(st,s,1/60,out);assert.ok(Math.max(...out.flux)<.001);s.fill(220,100,120);processSpectrum(st,s,1/60,out);assert.ok(Math.max(...out.flux)>.7);assert.ok(Number.isFinite(out.hit)&&out.hit>0&&out.hit<=1);});
test('snare counter increments on separated claps, not a sustained midrange',()=>{const st=makeDetector(48000,2048),out=fresh(),s=new Uint8Array(1024);for(let n=0;n<180;n++){s.fill(0);if(n%30<3)s.fill(220,65,170);processSpectrum(st,s,1/60,out);}assert.equal(out.snareN,6);const count=out.snareN;s.fill(220,65,170);for(let n=0;n<120;n++)processSpectrum(st,s,1/60,out);assert.ok(out.snareN<=count+1);});
test('simulated rhythm supplies finite onsets and clears hits when paused',()=>{analyse(30000,true,7,120,0,1/60);assert.equal(audio.flux.length,32);assert.ok(Math.max(...audio.flux)>.1);assert.ok(audio.flux.every(v=>Number.isFinite(v)&&v>=0&&v<=1));assert.ok(Number.isInteger(audio.snareN));assert.ok(audio.hit>0);analyse(30000,false,7,120,0,1/60);assert.equal(audio.hit,0);assert.ok(audio.flux.every(v=>v===0));});
