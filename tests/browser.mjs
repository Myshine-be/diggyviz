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
  '--headless=new', '--no-sandbox', '--disable-dev-shm-usage', '--no-first-run', '--no-default-browser-check',
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
      message.error ? p.reject(new Error(JSON.stringify(message.error))) : p.resolve(message.result);
    } else events.push(message);
  }
});
function send(method, params = {}, sessionId = session) {
  return new Promise((resolve, reject) => {
    const id = ++seq;
    const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 60000);
    pending.set(id, { resolve, reject, timer });
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
const results = [];
try {
  const { targetId } = await send('Target.createTarget', { url: 'about:blank' }, null);
  ({ sessionId: session } = await send('Target.attachToTarget', { targetId, flatten: true }, null));
  await send('Page.enable'); await send('Runtime.enable'); await send('Log.enable');
  await send('Network.enable');
  await send('Network.setBlockedURLs', { urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*', 'https://api.deezer.com/*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // Deterministic frames: UI and all production shaders still run unmodified.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__frames = []; window.__time = performance.now();
    window.setInterval = () => 0; // Keep the demo fixture stable between screenshots.
    window.requestAnimationFrame = cb => { window.__frames.push(cb); return window.__frames.length; };
    window.__step = dt => { window.__time += dt * 1000; const q = window.__frames; window.__frames = []; q.forEach(cb => cb(window.__time)); };
  ` });
  await send('Page.navigate', { url });
  await waitFor('!!window.diggy?.engine && window.__frames.length > 0');
  await evaluate(`window.__time = performance.now(); document.querySelector('[data-pick="demo"]').click(); document.querySelector('#autoBtn').click(); window.__step(1/60);`);
  const ids = await evaluate('window.diggy.engine.visuals.map(v => v.id)');
  assert.equal(ids.length, 13);
  assert.ok(['chrome','moire','glass'].every(id=>!ids.includes(id)));
  await evaluate(`(async()=>{const d=await import('./js/audio-data.js');const bands=new Float32Array(32);for(let n=0;n<70;n++){for(let i=0;i<32;i++)bands[i]=.5+.4*Math.sin(n*.2+i*.5);d.pushHistory(bands);}d.setWave(new Float32Array(128).map((_,i)=>Math.sin(i*.2)*.7));})()`);
  for (const id of ids) {
    const result = await evaluate(`(async()=>{
      const e=window.diggy.engine;
      e.setVisual(${JSON.stringify(id)},{instant:true}); window.diggy.setVisual(${JSON.stringify(id)});
      await window.diggy.onTrack({id:'qa',name:'Visuele test',artists:'DiggyViz',art:'',dur:180000,prog:16000,playing:true,bpm:120});
      window.__step(1/60);
      const gl=e.gl, pixels=new Uint8Array(e.W*e.H*4);gl.readPixels(0,0,e.W,e.H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let lit=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>30)lit++;
      return {id:e.currentVisual.id,compiled:!!e.programs.get(${JSON.stringify(id)}),glError:gl.getError(),litPixels:lit};
    })()`);
    assert.ok(result.compiled && result.glError === 0 && result.litPixels > 100, JSON.stringify(result));
    results.push(result); await new Promise(r => setTimeout(r, 300)); await screenshot(id);
  }
  // Story clocks must survive a real onTrack callback, pause, and the 45-second carousel boundary.
  for (const id of ['nightdrive','bloop']) {
    const result = await evaluate(`(async()=>{
      const e=window.diggy.engine;e.setVisual('${id}',{instant:true});window.diggy.setVisual('${id}');
      if(document.querySelector('#autoBtn').getAttribute('aria-pressed')!=='true')document.querySelector('#autoBtn').click();
      e.cur.clock.seconds=89;e.cur.clock.beats=178;
      await window.diggy.onTrack({id:'story-track-${id}',name:'Nachtrit',artists:'DiggyViz',art:'',bpm:120,dur:200000,prog:0,playing:true});
      const kept=e.currentVisual.id==='${id}'&&e.cur.clock.seconds===89;
      window.__step(.5);
      const elapsed=e.cur.clock.seconds;
      await window.diggy.onTrack({id:'story-track-${id}',name:'Nachtrit',artists:'DiggyViz',art:'',bpm:120,dur:200000,prog:0,playing:false});
      window.__step(5);
      const paused=e.cur.clock.seconds===elapsed;
      document.querySelector('#autoBtn').click();
      return {kept,paused,id:e.currentVisual.id};
    })()`);
    assert.ok(result.kept&&result.paused&&result.id===id,JSON.stringify(result));
    results.push({test:id+' story lifecycle',...result});
    for (const time of [35,89.9,94.5,96,100,106,118,121,180]) {
      await evaluate(`(async()=>{
        await window.diggy.onTrack({id:'frame-${id}',name:'Nachtrit',artists:'DiggyViz',art:'',bpm:120,dur:200000,prog:16000,playing:false});
        const e=window.diggy.engine;e.cur.clock.seconds=${time};e.cur.clock.beats=${time}*2;
        window.__step(1/60); document.querySelector('#app').classList.add('idle');
      })()`);
      assert.equal(await evaluate('window.diggy.engine.gl.getError()'),0);
      await new Promise(r=>setTimeout(r,600));
      await screenshot(id+'-'+String(time).replace('.','_'));
    }
  }
  const rapid = await evaluate(`(()=>{const e=window.diggy.engine;
    window.diggy.setVisual('urchin'); window.__step(1/60); window.diggy.setVisual('soulbeat'); window.__step(1/60);
    return {snapshot:!!e.old?.frozen,glError:e.gl.getError()};})()`);
  assert.ok(rapid.snapshot && rapid.glError === 0); results.push({test:'rapid crossfade',...rapid});
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.__step(1/60)');
  assert.equal(await evaluate('window.diggy.engine.gl.getError()'), 0);
  await screenshot('landscape'); results.push({test:'landscape resize',passed:true});
  for(const id of ['nightdrive','bloop']) {
    await evaluate(`window.diggy.engine.setVisual('${id}',{instant:true});window.diggy.setVisual('${id}');window.diggy.engine.cur.clock.seconds=96;window.diggy.engine.cur.clock.beats=192;window.__step(1/60);`);
    assert.equal(await evaluate('window.diggy.engine.gl.getError()'),0);
    await screenshot(id+'-landscape');
  }
  await evaluate(`window.diggy.engine.setVisual('soulbeat',{instant:true});window.__step(1/60);`);

  const restored = await evaluate(`new Promise(resolve=>{const e=window.diggy.engine,cv=e.canvas,ext=e.gl.getExtension('WEBGL_lose_context');
    if(!ext){resolve(false);return;}
    cv.addEventListener('webglcontextlost',()=>setTimeout(()=>{
      cv.addEventListener('webglcontextrestored',()=>{window.__step(1/60);resolve(e.currentVisual.id==='soulbeat'&&e.gl.getError()===0);},{once:true}); ext.restoreContext();
    },100),{once:true}); ext.loseContext();})`);
  assert.ok(restored);results.push({test:'context restoration',passed:true});
  // Verify JS ring writes against actual production GLSL reads after context restoration.
  const ring = await evaluate(`(async()=>{
    const {pushHistory,setWave,WAVE_N,HIST_ROWS}=await import('./js/audio-data.js');
    const d={bytes:new Uint8Array(WAVE_N*(HIST_ROWS+1)),head:0,live:true,acc:0};
    for(let n=1;n<=70;n++){const b=new Float32Array(32);b[0]=n/100;b[31]=n/200;pushHistory(b,d);}
    setWave(new Float32Array(128).fill(.25),d);
    const e=window.diggy.engine;e.visuals.push({id:'qa-audio',name:'QA',frag:'void main(){fragColor=vec4(histAt(0.0,0.0),histAt(1.0,2.1),waveAt(0.5)*.5+.5,1.0);}'});
    e.setVisual('qa-audio',{instant:true});
    e.render({time:10,dt:1/60,sceneDt:0,bpm:120,songTime:10,audio:window.diggy.audio,pal:{dark:[0,0,0],mid:[0,255,0],hi:[255,255,255],hot:[255,0,255]},drop:0,seed:1,sound:d});
    const gl=e.gl;gl.bindFramebuffer(gl.FRAMEBUFFER,e.cur.t[e.cur.i].fb);
    const pix=e.hdr?new Float32Array(4):new Uint8Array(4);
    gl.readPixels(0,0,1,1,gl.RGBA,e.hdr?gl.FLOAT:gl.UNSIGNED_BYTE,pix);
    const values=Array.from(pix).map(v=>e.hdr?v:v/255),error=gl.getError();
    e.setVisual('nightdrive',{instant:true});e.visuals.pop();
    return {values,error};
  })()`);
  assert.equal(ring.error,0);
  [Math.round(Math.fround(.7)*255)/255,Math.round(.035*255)/255,Math.round(.625*255)/255].forEach((v,i)=>assert.ok(Math.abs(ring.values[i]-v)<.002,JSON.stringify(ring)));
  results.push({test:'JS history ring and waveform agree with GLSL after WebGL restore',...ring});
  const sandbox = await evaluate(`(async()=>{
    const {jsonp}=await import('./js/tempo-lookup.js');
    const result=await jsonp(location.origin+'/qa-jsonp');
    return {...result,remaining:document.querySelectorAll('iframe').length};
  })()`);
  assert.equal(sandbox.bpm,128);assert.equal(sandbox.isolated,true);assert.equal(sandbox.remaining,0);
  results.push({test:'JSONP works but cannot read parent storage',...sandbox});

  // Exercise the production tempo UI with deterministic responses, including stale song results.
  await evaluate(`window.__srcdoc=Object.getOwnPropertyDescriptor(HTMLIFrameElement.prototype,'srcdoc');
    Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',{configurable:true,get:window.__srcdoc.get,set(v){window.__srcdoc.set.call(this,v.replaceAll('https://api.deezer.com',location.origin+'/qa-deezer'));}});`);
  await evaluate(`window.diggy.onTrack({id:'tempo-found',isrc:'USUM71703861',name:'Found',artists:'Fixture',dur:200000,prog:10000,playing:true})`);
  await waitFor("window.diggy.tempo.bpm===128");
  assert.equal(await evaluate("document.querySelector('#tap small').textContent"),'AUTO');
  await evaluate("document.querySelector('#tap').click()");
  assert.equal(await evaluate("document.querySelector('#tap small').textContent"),'BPM');
  await evaluate(`window.diggy.onTrack({id:'tempo-missing',name:'missing',artists:'Fixture',dur:200000,prog:10000,playing:true})`);
  await waitFor("document.querySelector('#tap small').textContent==='SCHAT'");
  assert.match(await evaluate("document.querySelector('#tempoStatus').textContent"),/Geen tempo/);
  await evaluate("Object.defineProperty(HTMLIFrameElement.prototype,'srcdoc',window.__srcdoc)");
  results.push({test:'tempo source, unknown fallback and manual override',passed:true});

  // Real Web Audio pipeline with a local oscillator MediaStream (no microphone/hardware claim).
  await evaluate(`(async()=>{
    const ctx=new AudioContext();await ctx.resume();const osc=ctx.createOscillator(),gain=ctx.createGain(),dest=ctx.createMediaStreamDestination();
    osc.frequency.value=110;gain.gain.value=.08;osc.connect(gain);gain.connect(dest);osc.start();
    window.__tone={ctx,osc,dest,get:navigator.mediaDevices.getUserMedia};
    navigator.mediaDevices.getUserMedia=()=>Promise.resolve(dest.stream);
    await window.diggy.setListen(true);
  })()`);
  await new Promise(r=>setTimeout(r,350));
  for(let i=0;i<15;i++){await evaluate('window.__step(1/60)');await new Promise(r=>setTimeout(r,20));}
  const mic=await evaluate(`(async()=>{const d=(await import('./js/audio-data.js')).audioData;
    return {on:window.diggy.listening,live:d.live,range:Math.max(...d.bytes.slice(0,128))-Math.min(...d.bytes.slice(0,128)),level:window.diggy.audio.level};})()`);
  assert.ok(mic.on&&mic.live&&mic.range>30&&mic.level>0,JSON.stringify(mic));
  await evaluate(`(async()=>{await window.diggy.setListen(false);window.__step(1/60);window.__tone.osc.stop();await window.__tone.ctx.close();navigator.mediaDevices.getUserMedia=window.__tone.get;})()`);
  assert.equal(await evaluate('window.diggy.listening'),false);
  results.push({test:'oscillator MediaStream through actual Web Audio and waveform texture',...mic});

  // Every removed visual preference falls back without reviving an old shader.
  for (const removed of ['chrome','moire','glass']) {
    await evaluate(`localStorage.setItem('rv.visual',JSON.stringify('${removed}'));`);
    await send('Page.reload');await waitFor('!!window.diggy?.engine && window.__frames.length > 0');
    assert.equal(await evaluate('window.diggy.engine.currentVisual.id'),'nightdrive');
  }
  // A stale saved visual must still pick a working fallback on reload.
  await evaluate(`localStorage.setItem('rv.visual', JSON.stringify('removed-visual'));`);
  await send('Page.reload'); await waitFor('!!window.diggy?.engine && window.__frames.length > 0');
  await evaluate('window.__time = performance.now(); window.__step(1/60)');
  assert.equal(await evaluate('window.diggy.engine.currentVisual.id'), 'nightdrive');
  assert.equal(await evaluate(`document.querySelector('[data-pick="lastfm"]').disabled`), true);
  results.push({test:'saved visual fallback and unavailable Last.fm',passed:true});
  const exceptions = events.filter(e => e.method === 'Runtime.exceptionThrown');
  const errors = events.filter(e => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error');
  assert.deepEqual(exceptions, []); assert.deepEqual(errors, []);
  console.log(JSON.stringify(results, null, 2));
} finally {
  await writeFile(resolve(root, 'test-results/report.json'), JSON.stringify({results,events},null,2));
  chrome.kill(); server.close();
  for (const p of pending.values()) clearTimeout(p.timer);
  await rm(profile, { recursive: true, force: true }).catch(()=>{});
}
