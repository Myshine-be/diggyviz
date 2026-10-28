// Tells the web app it runs inside the DiggyViz Windows app (js/desktop-audio.js → isDesktop()).
const { contextBridge } = require("electron");
contextBridge.exposeInMainWorld("diggyDesktop", { platform: process.platform, version: "0.1.0" });
