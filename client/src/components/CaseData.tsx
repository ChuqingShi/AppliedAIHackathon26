"use client";

// Hands the case record loaded in app/[role]/layout.tsx to the cards.

import { createContext, useContext } from "react";
import type { ReactNode } from "react";
import type { CaseData } from "@/data/api";
import type { Case, ProviderCase } from "@/data/case";

const CaseContext = createContext<CaseData | null>(null);

export function CaseProvider({ value, children }: { value: CaseData; children: ReactNode }) {
  return <CaseContext.Provider value={value}>{children}</CaseContext.Provider>;
}

export function useCaseData(): CaseData {
  const data = useContext(CaseContext);
  if (!data) throw new Error("useCaseData must be used inside <CaseProvider>");
  return data;
}

export function useFirmCase(): Case {
  const data = useCaseData();
  if (data.role !== "firm") throw new Error("Firm-only card rendered for a provider");
  return data.case;
}

export function useProviderCase(): ProviderCase {
  const data = useCaseData();
  if (data.role !== "provider") throw new Error("Provider card rendered for the firm");
  return data.case;
}
