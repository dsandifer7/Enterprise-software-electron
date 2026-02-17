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

function registerInventoryIpc() {
  ipcMain.handle("inventory:list-items", async (_event, payload) => {
    const tenantId = String(payload?.tenantId || "").trim();
    const lowStockOnly = Boolean(payload?.lowStockOnly);
    if (!tenantId) {
      return { ok: false, error: "tenantId is required." };
    }

    try {
      const url = new URL("/inventory/items", getBackendUrl());
      url.searchParams.set("tenant_id", tenantId);
      if (lowStockOnly) {
        url.searchParams.set("low_stock_only", "true");
      }
      return await requestJson(url.toString());
    } catch (_error) {
      return { ok: false, error: "Could not reach inventory endpoint." };
    }
  });

  ipcMain.handle("inventory:create-item", async (_event, payload) => {
    const tenantId = String(payload?.tenantId || "").trim();
    if (!tenantId) {
      return { ok: false, error: "tenantId is required." };
    }

    try {
      const url = new URL("/inventory/items", getBackendUrl()).toString();
      return await requestJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          sku: payload?.sku,
          name: payload?.name,
          description: payload?.description || "",
          quantity_on_hand: payload?.quantityOnHand ?? 0,
          reorder_point: payload?.reorderPoint ?? 0,
        }),
      });
    } catch (_error) {
      return { ok: false, error: "Could not reach inventory create endpoint." };
    }
  });

  ipcMain.handle("inventory:adjust-item", async (_event, payload) => {
    const tenantId = String(payload?.tenantId || "").trim();
    if (!tenantId) {
      return { ok: false, error: "tenantId is required." };
    }

    try {
      const url = new URL("/inventory/adjust", getBackendUrl()).toString();
      return await requestJson(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tenant_id: tenantId,
          item_id: payload?.itemId,
          change_amount: payload?.changeAmount,
          reason: payload?.reason || "manual-adjustment",
          performed_by: payload?.performedBy || "",
        }),
      });
    } catch (_error) {
      return { ok: false, error: "Could not reach inventory adjust endpoint." };
    }
  });
}

module.exports = { registerInventoryIpc };
