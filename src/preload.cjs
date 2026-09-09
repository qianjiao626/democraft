"use strict";
const { contextBridge, ipcRenderer } = require("electron");
const call =
  (channel) =>
  (...args) =>
    ipcRenderer.invoke(channel, ...args);
contextBridge.exposeInMainWorld("studio", {
  demo: call("demo"),
  importVideo: call("import"),
  sources: call("sources"),
  selectSource: call("select-source"),
  saveRecording: call("record-save"),
  saveProject: call("project-save"),
  openProject: call("project-open"),
  autosave: call("autosave"),
  recover: call("recover"),
  exportStart: call("export-start"),
  exportFrame: call("export-frame"),
  exportFinish: call("export-finish"),
  exportCancel: call("export-cancel"),
  environment: call("environment"),
  onProgress: (fn) => ipcRenderer.on("export-progress", (_, p) => fn(p)),
  onClose: (fn) => ipcRenderer.on("before-close", () => fn()),
});
