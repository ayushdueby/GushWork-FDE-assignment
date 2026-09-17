"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { Phone } from "lucide-react";
import { DialerSheet } from "./dialer-sheet";

/**
 * Global dialer state so "Call" works from anywhere (Today, jobs, customers),
 * plus the slide-over itself and a floating phone button.
 */
export interface DialTarget {
  number: string;
  customerId?: string | null;
  jobId?: string | null;
  label?: string;
}

interface DialerCtx {
  enabled: boolean;
  open: boolean;
  target: DialTarget | null;
  openDialer: (t?: DialTarget) => void;
  closeDialer: () => void;
}

const Ctx = createContext<DialerCtx>({ enabled: false, open: false, target: null, openDialer: () => {}, closeDialer: () => {} });

export function useDialer() {
  return useContext(Ctx);
}

export function DialerProvider({ enabled, children }: { enabled: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<DialTarget | null>(null);
  const pathname = usePathname();
  const openDialer = useCallback((t?: DialTarget) => {
    setTarget(t ?? null);
    setOpen(true);
  }, []);
  const closeDialer = useCallback(() => setOpen(false), []);
  const value = useMemo(() => ({ enabled, open, target, openDialer, closeDialer }), [enabled, open, target, openDialer, closeDialer]);
  return (
    <Ctx.Provider value={value}>
      {children}
      {enabled && <DialerSheet />}
      {enabled && !open && pathname !== "/dialer" && (
        <button
          type="button"
          onClick={() => openDialer()}
          aria-label="Open dialer"
          className="fixed bottom-20 right-4 z-30 grid size-14 place-items-center rounded-full bg-emerald-700 text-white shadow-lg hover:bg-emerald-800 md:bottom-6"
          data-testid="open-dialer"
        >
          <Phone className="size-6" />
        </button>
      )}
    </Ctx.Provider>
  );
}
