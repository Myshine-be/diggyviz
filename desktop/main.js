// DiggyViz for Windows — a thin Electron shell around the DiggyViz web app.
// What the shell adds: the computer's own sound (WASAPI loopback) without Stereo-mix, sharing, prompts or bars.
// The page asks getDisplayMedia(); this process answers it itself with a screen source + audio "loopback".
// The page keeps only the audio track (js/desktop-audio.js). Nothing is recorded or sent.
const { app, BrowserWindow, session, desktopCapturer, shell, Menu } = require("electron");
const path = require("node:path");

const START_URL = process.env.DIGGYVIZ_URL || "https://myshine-be.github.io/diggyviz/";
const startOrigin = new URL(START_URL).origin;
// pages the window itself may show: the app and the Spotify login; everything else opens in the normal browser
const allowed = (url) => {
  try {
    const u = new URL(url);
    return u.origin === startOrigin || u.hostname === "accounts.spotify.com" || u.hostname.endsWith(".spotify.com");
  } catch { return false; }
};

app.commandLine.appendSwitch("autoplay-policy", "no-user-gesture-required");
app.commandLine.appendSwitch("disable-renderer-backgrounding");
app.commandLine.appendSwitch("disable-background-timer-throttling");

let win = null, handlerCalls = 0;
const log = (...a) => { if (process.env.DIGGYVIZ_DEBUG) console.log("[diggyviz]", ...a); };

function createWindow() {
  win = new BrowserWindow({
    width: 1280, height: 760, backgroundColor: "#050506", title: "DiggyViz", autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, "build", "icon.png"),
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });
  Menu.setApplicationMenu(null);
  win.once("ready-to-show", () => win.show());

  // F11 / Escape for full screen even when the page has no focus on a button
  win.webContents.on("before-input-event", (e, input) => {
    if (input.type !== "keyDown") return;
    if (input.key === "F11") { win.setFullScreen(!win.isFullScreen()); e.preventDefault(); }
    else if (input.key === "F5" || (input.control && input.key.toLowerCase() === "r")) { win.webContents.reloadIgnoringCache(); e.preventDefault(); }
    else if (input.key === "Escape" && win.isFullScreen()) { win.setFullScreen(false); }
  });

  // links and pop-ups outside the app open in the normal browser
  win.webContents.setWindowOpenHandler(({ url }) => { if (/^https?:/.test(url)) shell.openExternal(url); return { action: "deny" }; });
  win.webContents.on("will-navigate", (e, url) => { if (!allowed(url)) { e.preventDefault(); if (/^https?:/.test(url)) shell.openExternal(url); } });

  // start the system sound as soon as the app has loaded (the call counts as a user gesture)
  win.webContents.on("did-finish-load", () => {
    const url = win.webContents.getURL();
    if (!url.startsWith(startOrigin)) return;
    setTimeout(() => {
      win.webContents.executeJavaScript("window.diggy && window.diggy.startDesktopAudio ? window.diggy.startDesktopAudio() : false", true)
        .then((ok) => log("desktop audio started:", ok)).catch((err) => log("start failed:", err && err.message));
    }, 400);
  });
  win.webContents.on("did-fail-load", (_e, code, desc, url) => {
    if (code === -3) return;                      // aborted (e.g. redirect)
    log("load failed", code, desc, url);
    win.loadFile(path.join(__dirname, "offline.html"));
  });
  win.loadURL(START_URL);
  // test hook (tests/desktop-smoke.sh): report the app state and quit
  if (process.env.DIGGYVIZ_SMOKE) setTimeout(async () => {
    const state = await win.webContents.executeJavaScript(`JSON.stringify({ desktop: !!window.diggyDesktop, hasDiggy: !!window.diggy,
      input: window.diggy?.soundInput ?? null, deskStarting: window.diggy?.deskIn?.starting, deskActive: window.diggy?.deskIn?.active,
      status: document.getElementById('status')?.textContent, deskNote: !document.getElementById('deskNote')?.hidden,
      sysRowHidden: document.getElementById('sysRow')?.hidden, bottomButtonsVisible: [...document.querySelectorAll('.hud-bottom .controls, .hud-bottom .chips')].some(e => e.offsetParent) })`).catch((e) => JSON.stringify({ error: e.message }));
    console.log("SMOKE " + state + " handlerCalls=" + handlerCalls);
    app.quit();
  }, Number(process.env.DIGGYVIZ_SMOKE) || 9000);
}

app.whenReady().then(() => {
  // always start from the newest version of the site (GitHub Pages caches for 10 minutes)
  session.defaultSession.clearCache().catch(() => {});
  // Answer every getDisplayMedia() of the app with the whole screen + Windows loopback audio, without a picker.
  session.defaultSession.setDisplayMediaRequestHandler((request, callback) => {
    if (!allowed(request.securityOrigin || request.frame?.url || START_URL)) { callback({}); return; }
    handlerCalls++;
    desktopCapturer.getSources({ types: ["screen"] }).then((sources) => {
      log("display media request → loopback", sources.length);
      callback(sources.length ? { video: sources[0], audio: "loopback" } : {});
    }).catch(() => callback({}));
  }, { useSystemPicker: false });
  // microphone etc. are not needed in the app; display capture is handled above
  session.defaultSession.setPermissionRequestHandler((wc, permission, cb) => cb(["media", "display-capture", "fullscreen", "clipboard-sanitized-write"].includes(permission)));
  createWindow();
});

app.on("window-all-closed", () => app.quit());
