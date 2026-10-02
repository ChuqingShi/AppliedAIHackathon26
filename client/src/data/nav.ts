import type { IconName } from "@/components/Icon";

export type Role = "firm" | "provider" | "client";
export interface NavItem { id: string; label: string; icon: IconName }

export const ROLE_LABEL: Record<Role, string> = {
  firm: "Law firm",
  provider: "Medical provider",
  client: "Client",
};

// Routes are /<view>, e.g. /overview, /financials. Which views exist depends on
// the signed-in user's role; a view that isn't in their list is a 404.
export const NAV: Record<Role, NavItem[]> = {
  firm: [
    { id: "overview", label: "Overview", icon: "grid" },
    { id: "financials", label: "Financials", icon: "dollar" },
    { id: "client", label: "Client", icon: "user" },
    { id: "documents", label: "Documents", icon: "doc" },
    { id: "todo", label: "To-do", icon: "task" },
    { id: "providers", label: "Medical providers", icon: "users" },
    { id: "updates", label: "Updates", icon: "clock" },
  ],
  provider: [
    { id: "overview", label: "Overview", icon: "grid" },
    { id: "patient", label: "Patient & injuries", icon: "user" },
    { id: "records", label: "Records & bills", icon: "doc" },
    { id: "progress", label: "Case progress", icon: "clock" },
    { id: "team", label: "Legal team", icon: "users" },
  ],
  // The client's overview has every one of their tiles; "My information" is
  // where they see and correct what the firm holds about them.
  client: [
    { id: "overview", label: "Overview", icon: "grid" },
    { id: "profile", label: "My information", icon: "user" },
  ],
};
