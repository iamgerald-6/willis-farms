"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type AppraisalFormProgressContextValue = {
  completionPct: number | null;
  setCompletionPct: (pct: number | null) => void;
};

const AppraisalFormProgressContext =
  createContext<AppraisalFormProgressContextValue | null>(null);

export function AppraisalFormProgressProvider({ children }: { children: ReactNode }) {
  const [completionPct, setCompletionPctState] = useState<number | null>(null);
  const setCompletionPct = useCallback((pct: number | null) => {
    setCompletionPctState(pct);
  }, []);

  const value = useMemo(
    () => ({ completionPct, setCompletionPct }),
    [completionPct, setCompletionPct],
  );

  return (
    <AppraisalFormProgressContext.Provider value={value}>
      {children}
    </AppraisalFormProgressContext.Provider>
  );
}

export function useAppraisalFormProgress() {
  const ctx = useContext(AppraisalFormProgressContext);
  if (!ctx) {
    throw new Error(
      "useAppraisalFormProgress must be used within AppraisalFormProgressProvider",
    );
  }
  return ctx;
}

export function useAppraisalFormProgressOptional() {
  return useContext(AppraisalFormProgressContext);
}
