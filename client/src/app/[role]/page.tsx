import { redirect } from "next/navigation";
import { NAV } from "@/data/nav";

export const dynamicParams = false;

export function generateStaticParams() {
  return Object.keys(NAV).map((role) => ({ role }));
}

export default async function RoleHome({ params }: PageProps<"/[role]">) {
  const { role } = await params;
  redirect(`/${role}/overview`);
}
