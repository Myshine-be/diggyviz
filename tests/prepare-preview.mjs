// Real music -> deterministic analyser frames. This is a QA approximation of Web Audio's FFT,
// not a measurement of capture/display latency. Nothing is added to the production audio path.
import {mkdir,writeFile,readFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {makeDetector,processSpectrum,waveFrom} from '../js/listen.js';
const root=new URL('../test-results/previews/',import.meta.url);await mkdir(root,{recursive:true});
const url='https://librosa.org/data/audio/Kevin_MacLeod_-_Vibe_Ace.ogg';
const r=await fetch(url,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw Error('Music fixture: '+r.status);
await writeFile(new URL('source.ogg',root),Buffer.from(await r.arrayBuffer()));
let license='';for(const ext of ['txt','toml']){try{const l=await fetch(url.replace('.ogg','.'+ext),{signal:AbortSignal.timeout(10000)});if(l.ok){license=await l.text();break;}}catch{}}
await writeFile(new URL('CREDITS.txt',root),'Music: Vibe Ace — Kevin MacLeod. Source: '+url+'\nPreview edit: excerpt, reduced volume, bass EQ and inserted silence.\n'+license+'\nRendering: software WebGL at 480×270 / 270×480, 24 fps. Not a phone FPS or end-to-end latency measurement. Text is original QA copy, not the instrumental track’s lyrics.\n');
execFileSync('ffmpeg',['-v','error','-y','-i',new URL('source.ogg',root).pathname,'-t','12','-af',"bass=g=9:f=85,volume='if(lt(t,4),0.35,if(between(t,8,10),0,0.8))':eval=frame",'-ac','1','-ar','48000','-f','s16le',new URL('preview.pcm',root).pathname]);
execFileSync('ffmpeg',['-v','error','-y','-f','s16le','-ar','48000','-ac','1','-i',new URL('preview.pcm',root).pathname,new URL('audio.wav',root).pathname]);
const raw=await readFile(new URL('preview.pcm',root)),samples=new Float32Array(raw.length/2);
for(let i=0;i<samples.length;i++)samples[i]=raw.readInt16LE(i*2)/32768;
const N=2048,re=new Float64Array(N),im=new Float64Array(N),smooth=new Float64Array(N/2),spec=new Uint8Array(N/2),window=new Float32Array(N);
function fft(){
 for(let i=1,j=0;i<N;i++){let bit=N>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
 for(let len=2;len<=N;len<<=1){const a=-Math.PI*2/len,wr0=Math.cos(a),wi0=Math.sin(a);for(let i=0;i<N;i+=len){let wr=1,wi=0;for(let j=0;j<len/2;j++){const k=i+j,h=k+len/2,rr=re[h]*wr-im[h]*wi,ii=re[h]*wi+im[h]*wr;re[h]=re[k]-rr;im[h]=im[k]-ii;re[k]+=rr;im[k]+=ii;const next=wr*wr0-wi*wi0;wi=wr*wi0+wi*wr0;wr=next;}}}
}
const detector=makeDetector(48000,N),a={bands:new Float32Array(32),peaks:new Float32Array(32),flux:new Float32Array(32)},wave=new Float32Array(128),gain={peak:.02},frames=[];
for(let n=0;n<12*120;n++){
 const end=Math.floor(n/120*48000);
 for(let j=0;j<N;j++){window[j]=samples[end-N+j]||0;re[j]=window[j]*(.42-.5*Math.cos(2*Math.PI*j/N)+.08*Math.cos(4*Math.PI*j/N));im[j]=0;}
 fft();for(let j=0;j<N/2;j++){smooth[j]=smooth[j]*.3+Math.hypot(re[j],im[j])/N*.7;const db=20*Math.log10(Math.max(1e-12,smooth[j]));spec[j]=Math.max(0,Math.min(255,(db+90)/75*255));}
 processSpectrum(detector,spec,1/120,a);waveFrom(window,wave,gain,1/120);
 if(n%5===0)frames.push({...a,bands:[...a.bands],peaks:[...a.peaks],flux:[...a.flux],wave:[...wave],bpm:detector.bpm});
}
await writeFile(new URL('frames.json',root),JSON.stringify(frames));
console.log(JSON.stringify({frames:frames.length,kicks:detector.beatIdx,snares:detector.snareN,source:url,licenseAvailable:!!license}));
