import { useState } from "react";

const HEX_256_PATTERN = /^[a-fA-F0-9]{64}$/;

export default function ActivatePage({ appName, onActivated }) {
  const [tenantKey, setTenantKey] = useState("");
  const [status, setStatus] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);

  async function handleSubmit(event) {
    event.preventDefault();

    if (!HEX_256_PATTERN.test(tenantKey)) {
      setStatus("Enter a valid 64-character hex tenant key.");
      return;
    }

    setIsSubmitting(true);
    setStatus("Validating tenant key...");

    try {
      const result = await window.electronAPI.bootstrap.activate(tenantKey);

      if (!result.ok) {
        setStatus(result.error || "Activation failed.");
        return;
      }

      setStatus("Activation successful.");
      onActivated(result.data);
    } catch (_error) {
      setStatus("Activation failed. Try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <main className="page">
      <section className="card">
        <h1>{appName}</h1>
        <p className="subtitle">Activate this installation for your business</p>

        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="tenantKey">Tenant key</label>
          <textarea
            id="tenantKey"
            name="tenantKey"
            rows="4"
            value={tenantKey}
            onChange={(event) => setTenantKey(event.target.value.trim())}
            placeholder="Paste 64-character hex key"
            required
          />

          <button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Activating..." : "Activate"}
          </button>
        </form>

        {status ? <p className="message">{status}</p> : null}
      </section>
    </main>
  );
}
