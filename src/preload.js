const { clipboard, contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("installer", {
  run: (platform, action, options) => ipcRenderer.invoke("installer:run", { platform, action, options }),
  getConfig: () => ipcRenderer.invoke("installer:getConfig"),
  getRecentReleases: (platform) => ipcRenderer.invoke("installer:getRecentReleases", platform),
  getLgDevices: () => ipcRenderer.invoke("installer:getLgDevices"),
  onLog: (callback) => ipcRenderer.on("installer:log", (event, payload) => callback(payload)),
  copyText: (text) => clipboard.writeText(String(text || "")),
  selectFile: () => ipcRenderer.invoke("installer:selectFile")
});
