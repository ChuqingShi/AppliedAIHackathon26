import { notFound } from "next/navigation";
import { SignedInAs } from "@/components/AppShell";
import { View } from "@/components/views";
import { NAV } from "@/data/nav";
import { requireSession } from "@/lib/session";

// Only the views in the signed-in role's NAV exist; anything else is a 404.
export default async function ViewPage({ params }: PageProps<"/[view]">) {
  const { view } = await params;
  const { id, role } = await requireSession();
  if (!NAV[role].some((item) => item.id === view)) notFound();
  return <SignedInAs user={id}><View view={view} /></SignedInAs>;
}
