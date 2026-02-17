import { useEffect, useState } from "react";
import ActivatePage from "./pages/ActivatePage.jsx";
import LoginPage from "./pages/LoginPage.jsx";

export default function App() {
  const appName = window.electronAPI?.appName ?? "Enterprise Software Electron";
  const [isLoading, setIsLoading] = useState(true);
  const [bootstrapState, setBootstrapState] = useState(null);

  useEffect(() => {
    let mounted = true;

    async function loadBootstrapState() {
      try {
        const state = await window.electronAPI.bootstrap.getState();
        if (mounted) {
          setBootstrapState(state);
        }
      } catch (_error) {
        if (mounted) {
          setBootstrapState(null);
        }
      } finally {
        if (mounted) {
          setIsLoading(false);
        }
      }
    }

    loadBootstrapState();

    return () => {
      mounted = false;
    };
  }, []);

  if (isLoading) {
    return (
      <main className="page">
        <section className="card">
          <h1>{appName}</h1>
          <p className="subtitle">Loading application state...</p>
        </section>
      </main>
    );
  }

  if (!bootstrapState?.tenantId) {
    return <ActivatePage appName={appName} onActivated={setBootstrapState} />;
  }

  return (
    <LoginPage
      appName={appName}
      tenantId={bootstrapState.tenantId}
      businessName={bootstrapState.businessName}
    />
  );
}
