const { ipcMain } = require("electron");

const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

async function loginWithBackend(payload) {
  const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
  const loginUrl = new URL("/auth/login", backendUrl).toString();
  const response = await fetch(loginUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    let detail = "Login failed.";
    try {
      const errorPayload = await response.json();
      detail = errorPayload?.detail || detail;
    } catch (_error) {
      detail = `Login failed with HTTP ${response.status}.`;
    }
    return { ok: false, error: detail };
  }

  const data = await response.json();
  return { ok: true, data };
}

function registerAuthIpc() {
  ipcMain.handle("auth:login", async (_event, payload) => {
    const tenantId = String(payload?.tenantId || "").trim();
    const email = String(payload?.email || "").trim().toLowerCase();
    const password = String(payload?.password || "");

    if (!tenantId || !email || !password) {
      return { ok: false, error: "Tenant, email, and password are required." };
    }

    try {
      return await loginWithBackend({
        tenant_id: tenantId,
        email,
        password,
      });
    } catch (_error) {
      return {
        ok: false,
        error: "Could not reach authentication service at http://127.0.0.1:8000.",
      };
    }
  });
}

module.exports = { registerAuthIpc };
