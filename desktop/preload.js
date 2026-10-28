// Tells the web app it runs inside the DiggyViz Windows app (js/desktop-audio.js → isDesktop()) and gives the
// frameless window its controls (minimise, maximise/restore, close).
const { contextBridge, ipcRenderer } = require("electron");
contextBridge.exposeInMainWorld("diggyDesktop", {
  platform: process.platform, version: "0.1.2",
  minimize: () => ipcRenderer.send("win", "min"),
  toggleMaximize: () => ipcRenderer.send("win", "max"),
  close: () => ipcRenderer.send("win", "close"),
});
