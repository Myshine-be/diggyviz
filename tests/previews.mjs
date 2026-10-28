// Dependency-free browser regression runner. Requires Node 22+ and an installed Chrome.
// Run: CHROME_BIN=/path/to/chrome node tests/browser.mjs
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { readFile, mkdir, writeFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, extname } from 'node:path';
import assert from 'node:assert/strict';

const root = resolve(import.meta.dirname, '..');
const server = createServer(async (req, res) => {
  try {
    const route = new URL(req.url, 'http://localhost').pathname;
    if (route.startsWith('/qa-jsonp') || route.startsWith('/qa-deezer')) {
      res.setHeader('Content-Type','text/javascript');
      res.end(route.includes('missing') || route.includes('/search') ? '__tempo({data:[]})' :
        'let isolated=false;try{parent.localStorage.getItem("rv.tok")}catch(e){isolated=true}__tempo({bpm:128,isolated})');return;
    }
    const path = resolve(root, '.' + (new URL(req.url, 'http://localhost').pathname === '/' ? '/index.html' : new URL(req.url, 'http://localhost').pathname));
    if (!path.startsWith(root + '/')) { res.writeHead(403).end(); return; }
    res.setHeader('Content-Type', ({ '.js': 'text/javascript', '.css': 'text/css', '.html': 'text/html' })[extname(path)] || 'application/octet-stream');
    res.end(await readFile(path));
  } catch { res.writeHead(404).end(); }
});
await new Promise(r => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}/`;
const profile = await mkdtemp(resolve(tmpdir(), 'diggy-qa-'));
await mkdir(resolve(root, 'test-results'), { recursive: true });
const chrome = spawn(process.env.CHROME_BIN || 'google-chrome', [
  '--headless=new', '--autoplay-policy=no-user-gesture-required', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
  '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--remote-debugging-pipe', `--user-data-dir=${profile}`,
], { stdio: ['ignore', 'ignore', 'pipe', 'pipe', 'pipe'] });
let seq = 0, buffer = '', session;
const pending = new Map(), events = [];
chrome.stderr.on('data', b => { if (process.env.DEBUG_BROWSER) process.stderr.write(b); });
chrome.on('error', e => { for (const p of pending.values()) p.reject(e); });
chrome.on('exit', () => { for (const p of pending.values()) p.reject(new Error('Chrome stopped')); });
chrome.stdio[4].on('data', bytes => {
  buffer += bytes.toString();
  let end;
  while ((end = buffer.indexOf('\0')) >= 0) {
    const message = JSON.parse(buffer.slice(0, end)); buffer = buffer.slice(end + 1);
    if (message.id) {
      const p = pending.get(message.id); if (!p) continue;
      clearTimeout(p.timer); pending.delete(message.id);
      message.error ? p.reject(new Error(p.method+": "+JSON.stringify(message.error))) : p.resolve(message.result);
    } else events.push(message);
  }
});
function send(method, params = {}, sessionId = session) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer, method });
    chrome.stdio[3].write(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }) + '\0');
  });
}
async function evaluate(expression) {
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true, userGesture: true });
  if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails));
  return r.result.value;
}
async function waitFor(expression) {
  for (let n = 0; n < 120; n++) {
    if (await evaluate(expression)) return;
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('Not ready: ' + expression);
}
async function screenshot(name) {
  const r = await send('Page.captureScreenshot', { format: 'png' });
  await writeFile(resolve(root, 'test-results', name + '.png'), Buffer.from(r.data, 'base64'));
}

const results=[];
try {
 const {targetId}=await send('Target.createTarget',{url:'about:blank'},null);
 ({sessionId:session}=await send('Target.attachToTarget',{targetId,flatten:true},null));
 await send('Page.enable');await send('Runtime.enable');await send('Network.enable');
 await send('Network.setBlockedURLs',{urls:['https://fonts.googleapis.com/*','https://fonts.gstatic.com/*','https://api.deezer.com/*']});
 await send('Page.addScriptToEvaluateOnNewDocument',{source:`window.requestAnimationFrame=()=>0;window.setInterval=()=>0;`});
 await send('Emulation.setDeviceMetricsOverride',{width:480,height:270,deviceScaleFactor:1,mobile:false});
 await send('Page.navigate',{url});await waitFor('!!window.diggy?.engine');
 // Probe real transport, retain only status/metadata, never save third-party lyric text.
 const probe=await evaluate(`(async()=>{try{const r=await fetch('https://lrclib.net/api/get?artist_name=Rick%20Astley&track_name=Never%20Gonna%20Give%20You%20Up&duration=213',{credentials:'omit',referrerPolicy:'no-referrer',signal:AbortSignal.timeout(10000)});const d=r.ok?await r.json():{};return {origin:location.origin,status:r.status,synced:!!d.syncedLyrics,duration:d.duration||null};}catch(e){return {origin:location.origin,error:e.message};}})()`);
 await writeFile(resolve(root,'test-results','lyrics-live-probe.json'),JSON.stringify(probe,null,2));
 await evaluate(`(async()=>{
 const {audioData,feedHistory,setWave,resetAudioData}=await import('./js/audio-data.js');
 const {createLyricsLayer}=await import('./js/lyrics-layer.js');
 window.preview={frames:await(await fetch('./test-results/previews/frames.json')).json(),audioData,feedHistory,setWave,resetAudioData,layer:createLyricsLayer()};
 document.querySelectorAll('.hud,#welcome,#settings,#caption').forEach(e=>e.style.display='none');
 window.preview.lines=[{t:0,text:'De muziek tekent het landschap'},{t:3,text:'Elke klank krijgt zijn eigen vorm'},{t:6,text:'Een golf beweegt door het beeld'},{t:8,text:''},{t:10,text:'En alles komt weer tot leven'}];
 const e=diggy.engine;window.preview.errors=[];e.onError=m=>{if(m)preview.errors.push(m)};
 })()`);
 for(const [label,width,height] of [['landscape',480,270],['portrait',270,480]]) {
  await send('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:label==='portrait'});
  for(const id of ['nightdrive','soulbeat','tunnel','landscape','urchin']) {
   const dir=resolve(root,'test-results','previews',id+'-'+label);await mkdir(dir,{recursive:true});
   await evaluate(`{const e=diggy.engine;e.setVisual('bubbles',{instant:true});e.setVisual('${id}',{instant:true});preview.resetAudioData();e.scale=1;e.minScale=1;e.maxScale=1;}`);
   for(let n=0;n<288;n++) {
    const img=await evaluate(`(()=>{
      const p=preview,a=p.frames[${n}],e=diggy.engine,t=${n}/24;
      p.feedHistory(a.bands,1/24);p.setWave(a.wave);
      const pal={dark:[8,11,18],mid:[38,170,146],hi:[209,169,91],hot:[190,76,111]};
      const lyric=p.layer.frame({id:'original-qa-copy',lines:p.lines,sec:t,posKnown:true,style:e.currentVisual.lyrics});
      e.render({time:30+t,dt:1/24,sceneDt:1/24,bpm:a.bpm,beatPhase:a.beat,songTime:t,audio:a,pal,drop:0,seed:11,sound:p.audioData,songs:16,lyricLayer:lyric});
      if(e.gl.getError()!==0)throw Error('GL error');
      return e.canvas.toDataURL('image/png').split(',')[1];
    })()`);
    await writeFile(resolve(dir,String(n).padStart(4,'0')+'.png'),Buffer.from(img,'base64'));
   }
   const errors=await evaluate('preview.errors');assert.deepEqual(errors,[]);
   console.log(id+' '+label+' captured');results.push({id,label,frames:288});
  }
 }
} finally {
 await writeFile(resolve(root,'test-results','previews','report.json'),JSON.stringify({results,exceptions:events.filter(e=>e.method==='Runtime.exceptionThrown')},null,2));
 chrome.kill();server.close();for(const p of pending.values())clearTimeout(p.timer);await rm(profile,{recursive:true,force:true}).catch(()=>{});
}
