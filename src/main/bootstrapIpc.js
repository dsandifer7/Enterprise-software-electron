const { ipcMain } = require("electron");
const crypto = require("crypto");
const {
  readBootstrapState,
  writeBootstrapState,
  clearBootstrapState,
} = require("./bootstrapStore");

const HEX_256_PATTERN = /^[a-fA-F0-9]{64}$/;
const DEFAULT_BACKEND_URL = "http://127.0.0.1:8000";

function normalizeTenantKey(tenantKey) {
  return String(tenantKey || "").trim().toLowerCase();
}

function makeKeyFingerprint(normalizedTenantKey) {
  return crypto.createHash("sha256").update(normalizedTenantKey).digest("hex");
}

async function validateTenantKeyWithBackend(normalizedTenantKey) {
  const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
  const activationUrl = new URL("/activation/validate", backendUrl).toString();
  const response = await fetch(activationUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ tenant_key: normalizedTenantKey }),
  });

  if (!response.ok) {
    let detail = "Activation failed.";
    try {
      const errorPayload = await response.json();
      detail = errorPayload?.detail || detail;
    } catch (_error) {
      detail = `Activation failed with HTTP ${response.status}.`;
    }
    return { ok: false, error: detail };
  }

  const payload = await response.json();
  return { ok: true, data: payload };
}

function registerBootstrapIpc() {
  ipcMain.handle("bootstrap:get-state", async () => {
    const state = await readBootstrapState();
    return state;
  });

  ipcMain.handle("bootstrap:activate", async (_event, tenantKey) => {
    const normalizedTenantKey = normalizeTenantKey(tenantKey);

    if (!HEX_256_PATTERN.test(normalizedTenantKey)) {
      return {
        ok: false,
        error: "Tenant key must be a 64-character hex string.",
      };
    }

    let validationResult;
    try {
      validationResult = await validateTenantKeyWithBackend(normalizedTenantKey);
    } catch (_error) {
      return {
        ok: false,
        error: "Could not reach activation service at http://127.0.0.1:8000.",
      };
    }

    if (!validationResult.ok) {
      return validationResult;
    }

    const config = {
      tenantId: validationResult.data.tenant_id,
      businessName: validationResult.data.business_name,
      apiBaseUrl: validationResult.data.api_base_url,
      keyFingerprint: makeKeyFingerprint(normalizedTenantKey),
      activatedAt: new Date().toISOString(),
    };
    await writeBootstrapState(config);

    return {
      ok: true,
      data: config,
    };
  });

  ipcMain.handle("bootstrap:reset", async () => {
    await clearBootstrapState();
    return { ok: true };
  });
}

module.exports = { registerBootstrapIpc };
