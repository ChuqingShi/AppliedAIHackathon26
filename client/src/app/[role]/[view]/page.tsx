import { View } from "@/components/views";
import { NAV } from "@/data/nav";
import type { Role } from "@/data/nav";

// Only the role/view pairs in NAV exist; anything else is a 404.
export const dynamicParams = false;

export function generateStaticParams() {
  return Object.entries(NAV).flatMap(([role, items]) => items.map(({ id }) => ({ role, view: id })));
}

export default async function ViewPage({ params }: PageProps<"/[role]/[view]">) {
  const { role, view } = await params;
  return <View role={role as Role} view={view} />;
}
