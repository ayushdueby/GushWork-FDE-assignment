"use client";

import { useState } from "react";
import { ChevronDown, FlaskConical } from "lucide-react";
import type { AdapterStatus } from "@/integrations/types";
import { cn } from "@/lib/utils";

/** Honest about what's wired to the outside world and what's simulated. */
export function DemoBanner({ status }: { status: AdapterStatus }) {
  const [open, setOpen] = useState(false);
  const entries = Object.entries(status) as [keyof AdapterStatus, { name: string; kind: string }][];
  const simulated = entries.filter(([, v]) => v.kind === "simulated").length;
  return (
    <div className="border-b border-amber-200 bg-amber-50 text-amber-900">
      <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="flex min-h-10 w-full items-center gap-2 px-4 text-left text-sm">
        <FlaskConical className="size-4 shrink-0" />
        <span className="flex-1">
          <strong>Demo mode.</strong> {simulated} of {entries.length} integrations are simulated — everything else is real.
        </span>
        <ChevronDown className={cn("size-4 transition", open && "rotate-180")} />
      </button>
      {open && (
        <ul className="grid gap-x-6 gap-y-1 px-4 pb-3 text-xs sm:grid-cols-2 lg:grid-cols-4">
          {entries.map(([key, v]) => (
            <li key={key} className="flex items-center gap-2">
              <span className={cn("inline-block size-2 rounded-full", v.kind === "real" ? "bg-emerald-500" : "bg-amber-500")} />
              <span className="capitalize">{key}:</span>
              <span className="font-medium">{v.name}</span>
              <span className="text-amber-700/70">({v.kind})</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
