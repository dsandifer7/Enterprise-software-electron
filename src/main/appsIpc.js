const { ipcMain } = require("electron");

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

function getBackendUrl() {
  return process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
}

async function requestJson(url, options = {}) {
  const response = await fetch(url, options);
  if (!response.ok) {
    let detail = "Request failed.";
    try {
      const payload = await response.json();
      detail = payload?.detail || detail;
    } catch (_error) {
      detail = `Request failed with HTTP ${response.status}.`;
    }
    return { ok: false, error: detail };
  }
  return { ok: true, data: await response.json() };
}

function registerAppsIpc() {
  ipcMain.handle("apps:list-catalog", async () => {
    try {
      const url = new URL("/apps/catalog", getBackendUrl()).toString();
      return await requestJson(url);
    } catch (_error) {
      return { ok: false, error: "Could not reach backend app catalog." };
    }
  });

  ipcMain.handle("apps:list-installed", async (_event, tenantId) => {
    const normalizedTenantId = String(tenantId || "").trim();
    if (!normalizedTenantId) {
      return { ok: false, error: "tenantId is required." };
    }

    try {
      const url = new URL("/apps/installed", getBackendUrl());
      url.searchParams.set("tenant_id", normalizedTenantId);
      return await requestJson(url.toString());
    } catch (_error) {
      return { ok: false, error: "Could not reach backend installed apps endpoint." };
    }
  });

  ipcMain.handle("apps:install", async (_event, payload) => {
    const tenantId = String(payload?.tenantId || "").trim();
    const appKey = String(payload?.appKey || "").trim();
    if (!tenantId || !appKey) {
      return { ok: false, error: "tenantId and appKey are required." };
    }

    try {
      const url = new URL("/apps/install", getBackendUrl()).toString();
      return await requestJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tenant_id: tenantId, app_key: appKey }),
      });
    } catch (_error) {
      return { ok: false, error: "Could not reach backend app install endpoint." };
    }
  });
}

module.exports = { registerAppsIpc };
