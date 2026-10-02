"use client";

// Shown when a page can't load, most often because the Sapini backend isn't
// running. The dashboard never falls back to made-up data.
export default function Error({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <main className="login">
      <div className="login-card">
        <h1>Can&apos;t load the case</h1>
        <p>The dashboard reads everything from the Sapini backend, and it didn&apos;t answer.</p>
        {process.env.NODE_ENV !== "production" && <p className="ink2" style={{ fontSize: 13 }}>{error.message}</p>}
        <p style={{ fontSize: 13.5 }}>
          Start the backend (<code>uvicorn main:app --port 8000</code>), make sure a matter is synced
          (<code>python sync.py &lt;matter_id&gt;</code>), then try again.
        </p>
        <button className="btn" onClick={reset}>Try again</button>
      </div>
    </main>
  );
}
