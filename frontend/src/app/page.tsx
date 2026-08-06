"use client";

import { useEffect, useState } from "react";

const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8080";

type Ping = {
  service: string;
  status: string;
  database: string;
  timestamp: string;
};

export default function Home() {
  const [ping, setPing] = useState<Ping | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch(`${API_BASE_URL}/api/ping`)
      .then((res) => {
        if (!res.ok) throw new Error(`Backend returned HTTP ${res.status}`);
        return res.json();
      })
      .then(setPing)
      .catch((e: Error) => setError(e.message));
  }, []);

  const dbConnected = ping?.database.startsWith("connected");

  return (
    <main style={{ maxWidth: 640, margin: "0 auto", padding: "4rem 1.5rem" }}>
      <h1 style={{ fontSize: "1.75rem", margin: 0 }}>Flash-Sale Commerce</h1>
      <p style={{ color: "var(--muted)", marginTop: ".25rem" }}>
        Development environment check
      </p>

      <div
        style={{
          marginTop: "2rem",
          border: "1px solid var(--border)",
          borderRadius: 12,
          background: "var(--panel)",
          padding: "1.25rem 1.5rem",
        }}
      >
        <Row label="Frontend" value="running" ok />
        <Row
          label="Backend"
          value={error ? `unreachable — ${error}` : ping ? ping.status : "checking…"}
          ok={!error && ping !== null}
        />
        <Row
          label="Database"
          value={error ? "unknown" : (ping?.database ?? "checking…")}
          ok={!!dbConnected}
        />
      </div>
    </main>
  );
}

function Row({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "1rem",
        alignItems: "baseline",
        padding: ".5rem 0",
        borderTop: "1px solid var(--border)",
      }}
    >
      <span style={{ width: 90, color: "var(--muted)", flexShrink: 0 }}>{label}</span>
      <span style={{ color: ok ? "var(--ok)" : "var(--bad)", wordBreak: "break-word" }}>
        {value}
      </span>
    </div>
  );
}
