"use client";

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { DialerPanel } from "./dialer-panel";
import { useDialer } from "./dialer-provider";

/** The slide-over dialer, reachable from anywhere via the Call buttons or the floating phone button. */
export function DialerSheet() {
  const d = useDialer();
  if (!d.enabled) return null;
  return (
    <Sheet open={d.open} onOpenChange={(o) => (o ? d.openDialer(d.target ?? undefined) : d.closeDialer())}>
      <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
        <SheetHeader>
          <SheetTitle>Dialer</SheetTitle>
          <SheetDescription>Calls are recorded from your mic and turned into job updates.</SheetDescription>
        </SheetHeader>
        <div className="px-4 pb-6">{d.open && <DialerPanel />}</div>
      </SheetContent>
    </Sheet>
  );
}
