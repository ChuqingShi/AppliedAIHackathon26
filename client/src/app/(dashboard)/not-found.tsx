"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { checkSignedInAs, useApp } from "@/components/AppShell";

// A view the signed-in role doesn't have. Next builds this along with the shell,
// so it can be as out of date as the sidebar that led here: check who is signed
// in before saying the page is missing.
export default function NotFound() {
  const user = useApp().dashboard.user.id;
  const pathname = usePathname();
  const [checked, setChecked] = useState<string>();
  useEffect(() => {
    checkSignedInAs(user).then((ok) => { if (ok) setChecked(pathname); }, () => setChecked(pathname));
  }, [user, pathname]);
  if (checked !== pathname) return null;
  return (
    <div className="card">
      <div className="empty">
        That page isn&rsquo;t part of your dashboard. <Link href="/overview" className="link">Back to the overview</Link>
      </div>
    </div>
  );
}
