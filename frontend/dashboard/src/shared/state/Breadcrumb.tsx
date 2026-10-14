import { createContext, useContext, useEffect, useMemo, useState } from 'react';
import type { ReactNode } from 'react';

interface CrumbValue {
  /** The last crumb, when a page knows a better name than its route: an elder's name. */
  current: string | null;
  setCurrent: (label: string | null) => void;
}

const CrumbContext = createContext<CrumbValue>({ current: null, setCurrent: () => undefined });

export function CrumbProvider({ children }: { children: ReactNode }) {
  const [current, setCurrent] = useState<string | null>(null);
  const value = useMemo(() => ({ current, setCurrent }), [current]);
  return <CrumbContext.Provider value={value}>{children}</CrumbContext.Provider>;
}

/** Names the current page in the breadcrumb for as long as the page is on screen. */
export function useCrumb(label: string | null): void {
  const { setCurrent } = useContext(CrumbContext);
  useEffect(() => {
    setCurrent(label);
    return () => setCurrent(null);
  }, [label, setCurrent]);
}

export function useCurrentCrumb(): string | null {
  return useContext(CrumbContext).current;
}
