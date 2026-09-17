"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { SOURCES, SOURCE_LABEL, STAGES, STAGE_LABEL } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export function JobFilters({ techs, view }: { techs: { id: string; name: string }[]; view: "board" | "list" }) {
  const router = useRouter();
  const sp = useSearchParams();
  const [q, setQ] = useState(sp.get("q") ?? "");

  function set(key: string, value: string) {
    const next = new URLSearchParams(sp.toString());
    if (value) next.set(key, value);
    else next.delete(key);
    router.replace(`/jobs?${next.toString()}`);
  }

  const sel = "native h-11 rounded-lg border border-input bg-background px-3 text-sm";
  return (
    <div className="flex flex-wrap items-center gap-2">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          set("q", q);
        }}
        className="relative w-full sm:w-64"
      >
        <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Name, business or phone" className="pl-9" aria-label="Search jobs" />
      </form>
      <select className={sel} value={sp.get("stage") ?? ""} onChange={(e) => set("stage", e.target.value)} aria-label="Stage">
        <option value="">All open stages</option>
        {STAGES.map((s) => (
          <option key={s} value={s}>
            {STAGE_LABEL[s]}
          </option>
        ))}
      </select>
      <select className={sel} value={sp.get("source") ?? ""} onChange={(e) => set("source", e.target.value)} aria-label="Source">
        <option value="">Any source</option>
        {SOURCES.map((s) => (
          <option key={s} value={s}>
            {SOURCE_LABEL[s]}
          </option>
        ))}
      </select>
      <select className={sel} value={sp.get("tech") ?? ""} onChange={(e) => set("tech", e.target.value)} aria-label="Tech">
        <option value="">Any tech</option>
        {techs.map((t) => (
          <option key={t.id} value={t.id}>
            {t.name}
          </option>
        ))}
      </select>
      <label className="flex h-11 items-center gap-2 rounded-lg border border-input px-3 text-sm">
        <input type="checkbox" checked={sp.get("urgent") === "1"} onChange={(e) => set("urgent", e.target.checked ? "1" : "")} /> Urgent only
      </label>
      <div className="ml-auto flex rounded-lg border border-input p-0.5" role="tablist" aria-label="View">
        {(["board", "list"] as const).map((v) => (
          <button key={v} role="tab" aria-selected={view === v} onClick={() => set("view", v === "board" ? "" : v)} className={cn("h-9 rounded-md px-3 text-sm font-medium capitalize", view === v ? "bg-primary text-primary-foreground" : "text-muted-foreground")}>
            {v}
          </button>
        ))}
      </div>
    </div>
  );
}
