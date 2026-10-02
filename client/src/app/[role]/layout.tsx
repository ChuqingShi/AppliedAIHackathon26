import { notFound } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { CaseProvider } from "@/components/CaseData";
import { loadCase } from "@/data/api";
import type { CaseData } from "@/data/api";
import { isRole } from "@/data/nav";

// Loads the case from the backend on every request, so the dashboard always
// shows the latest synced Clio data.
export default async function RoleLayout({ children, params }: LayoutProps<"/[role]">) {
  const { role } = await params;
  if (!isRole(role)) notFound();

  let data: CaseData;
  try {
    data = await loadCase(role);
  } catch (e) {
    return <BackendError message={e instanceof Error ? e.message : String(e)} />;
  }

  return (
    <CaseProvider value={data}>
      <AppShell>{children}</AppShell>
    </CaseProvider>
  );
}

function BackendError({ message }: { message: string }) {
  return (
    <div className="content" style={{ maxWidth: 640, margin: "64px auto" }}>
      <div className="card">
        <div className="hd"><h3>Can&apos;t load the case</h3></div>
        <p style={{ fontSize: 14 }}>The dashboard reads everything from the Sapini backend, and it didn&apos;t answer.</p>
        <p className="ink2" style={{ fontSize: 13, marginTop: 8 }}>{message}</p>
        <p style={{ fontSize: 13.5, marginTop: 12 }}>
          Start the backend (<code>uvicorn main:app --port 8000</code>), make sure a matter is synced
          (<code>python sync.py &lt;matter_id&gt;</code>), then reload this page.
        </p>
      </div>
    </div>
  );
}
