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
  const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
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
  await send('Network.setBlockedURLs', { urls: ['https://fonts.googleapis.com/*', 'https://fonts.gstatic.com/*'] });
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  // Deterministic frames: UI and all production shaders still run unmodified.
  await send('Page.addScriptToEvaluateOnNewDocument', { source: `
    window.__frames = []; window.__time = performance.now();
    window.requestAnimationFrame = cb => { window.__frames.push(cb); return window.__frames.length; };
    window.__step = dt => { window.__time += dt * 1000; const q = window.__frames; window.__frames = []; q.forEach(cb => cb(window.__time)); };
  ` });
  await send('Page.navigate', { url });
  await waitFor('!!window.diggy?.engine && window.__frames.length > 0');
  await evaluate(`document.querySelector('[data-pick="demo"]').click(); document.querySelector('#autoBtn').click(); window.__step(1/60);`);
  const ids = await evaluate('window.diggy.engine.visuals.map(v => v.id)');
  assert.equal(ids.length, 8);
  for (const id of ids) {
    const result = await evaluate(`(async()=>{
      const e=window.diggy.engine;
      e.setVisual(${JSON.stringify(id)},{instant:true}); window.diggy.setVisual(${JSON.stringify(id)});
      await window.diggy.onTrack({id:'qa',name:'Visuele test',artists:'DiggyViz',art:'',dur:180000,prog:16000,playing:true});
      window.__step(1/60);
      const gl=e.gl, pixels=new Uint8Array(e.W*e.H*4);gl.readPixels(0,0,e.W,e.H,gl.RGBA,gl.UNSIGNED_BYTE,pixels);
      let lit=0;for(let i=0;i<pixels.length;i+=4)if(pixels[i]+pixels[i+1]+pixels[i+2]>30)lit++;
      return {id:e.currentVisual.id,compiled:!!e.programs.get(${JSON.stringify(id)}),glError:gl.getError(),litPixels:lit};
    })()`);
    assert.ok(result.compiled && result.glError === 0 && result.litPixels > 100, JSON.stringify(result));
    results.push(result); await screenshot(id);
  }
  const rapid = await evaluate(`(()=>{const e=window.diggy.engine;
    window.diggy.setVisual('glass'); window.__step(1/60); window.diggy.setVisual('soulbeat'); window.__step(1/60);
    return {snapshot:!!e.old?.frozen,glError:e.gl.getError()};})()`);
  assert.ok(rapid.snapshot && rapid.glError === 0); results.push({test:'rapid crossfade',...rapid});
  await send('Emulation.setDeviceMetricsOverride', { width: 844, height: 390, deviceScaleFactor: 1, mobile: true });
  await evaluate('window.__step(1/60)');
  assert.equal(await evaluate('window.diggy.engine.gl.getError()'), 0);
  await screenshot('landscape'); results.push({test:'landscape resize',passed:true});
  const restored = await evaluate(`new Promise(resolve=>{const e=window.diggy.engine,cv=e.canvas,ext=e.gl.getExtension('WEBGL_lose_context');
    if(!ext){resolve(false);return;}
    cv.addEventListener('webglcontextlost',()=>setTimeout(()=>{
      cv.addEventListener('webglcontextrestored',()=>{window.__step(1/60);resolve(e.currentVisual.id==='soulbeat'&&e.gl.getError()===0);},{once:true}); ext.restoreContext();
    },100),{once:true}); ext.loseContext();})`);
  assert.ok(restored);results.push({test:'context restoration',passed:true});
  // A stale saved visual must still pick a working fallback on reload.
  await evaluate(`localStorage.setItem('rv.visual', JSON.stringify('removed-visual'));`);
  await send('Page.reload'); await waitFor('!!window.diggy?.engine && window.__frames.length > 0');
  await evaluate('window.__step(1/60)');
  assert.equal(await evaluate('window.diggy.engine.currentVisual.id'), 'urchin');
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
