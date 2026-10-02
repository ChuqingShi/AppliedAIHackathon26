import type { IconName } from "@/components/Icon";

export type Role = "firm" | "provider";
export interface NavItem { id: string; label: string; icon: IconName }

// Routes are /<role>/<view>, e.g. /firm/overview, /provider/team.
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
};

export const isRole = (role: unknown): role is Role => role === "firm" || role === "provider";
