import { useState } from "react";

export default function LoginPage({ appName, tenantId, businessName }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");

  function handleSubmit(event) {
    event.preventDefault();
    setMessage("Login submit captured. Auth wiring comes next.");
  }

  return (
    <main className="page">
      <section className="card">
        <h1>{appName}</h1>
        {businessName ? <p className="subtitle">Business: {businessName}</p> : null}
        <p className="subtitle">Tenant: {tenantId}</p>
        <p className="subtitle">Sign in to continue</p>

        <form className="form" onSubmit={handleSubmit}>
          <label htmlFor="email">Email</label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@company.com"
            required
          />

          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Enter password"
            required
          />

          <button type="submit">Log In</button>
        </form>

        {message ? <p className="message">{message}</p> : null}
      </section>
    </main>
  );
}
