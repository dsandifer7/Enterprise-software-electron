const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  appName: "Enterprise Software Electron",
  bootstrap: {
    getState: () => ipcRenderer.invoke("bootstrap:get-state"),
    activate: (activationCode) =>
      ipcRenderer.invoke("bootstrap:activate", activationCode),
    reset: () => ipcRenderer.invoke("bootstrap:reset"),
  },
});
