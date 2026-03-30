const { BrowserWindow, ipcMain } = require("electron");
const path = require("path");

let chatWindow = null;

function registerChatIpc(loadRendererWindow) {
  ipcMain.handle("window:open-chat", async (_event, payload) => {
    if (chatWindow && !chatWindow.isDestroyed()) {
      if (chatWindow.isMinimized()) chatWindow.restore();
      chatWindow.focus();
      return { ok: true };
    }

    chatWindow = new BrowserWindow({
      width: 420,
      height: 640,
      minWidth: 360,
      minHeight: 520,
      webPreferences: {
        preload: path.join(__dirname, "preload.js"),
        contextIsolation: true,
        nodeIntegration: false,
      },
    });

    chatWindow.on("closed", () => { chatWindow = null; });
    loadRendererWindow(chatWindow, "chat", {
      tenantId: payload.tenantId,
      businessName: payload.businessName,
      userEmail: payload.userEmail,
      userId: payload.userId,
    });

    return { ok: true };
  });
}

module.exports = { registerChatIpc };