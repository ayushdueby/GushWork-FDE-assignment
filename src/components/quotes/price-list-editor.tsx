"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { deletePriceItemAction, savePriceItemAction } from "@/lib/actions/quotes";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { money } from "@/lib/domain/types";
import type { PriceItem } from "./quote-builder";

/** Small editable parts/labor list. Click a row to add it to the quote. */
export function PriceListEditor({ items, canEdit, onPick }: { items: PriceItem[]; canEdit: boolean; onPick: (p: PriceItem) => void }) {
  const [adding, setAdding] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (action: (fd: FormData) => Promise<{ ok: boolean; message?: string; error?: string }>, fd: FormData) =>
    start(async () => {
      const res = await action(fd);
      if (res.ok) {
        toast.success(res.message);
        setAdding(false);
        router.refresh();
      } else toast.error(res.error);
    });
  return (
    <div className="rounded-2xl border border-border bg-card">
      <div className="flex items-center justify-between border-b border-border px-3 py-2">
        <p className="text-sm font-semibold">Price list</p>
        {canEdit && (
          <button type="button" onClick={() => setAdding((a) => !a)} className="text-xs text-primary hover:underline">
            {adding ? "Cancel" : "+ Add"}
          </button>
        )}
      </div>
      {adding && (
        <form action={(fd) => run(savePriceItemAction, fd)} className="space-y-2 border-b border-border p-2">
          <Input name="description" placeholder="Description" required aria-label="Description" />
          <div className="flex gap-2">
            <select name="kind" className="native h-11 rounded-lg border border-input bg-background px-2 text-sm" aria-label="Kind" defaultValue="part">
              <option value="part">Part</option>
              <option value="labor">Labor</option>
            </select>
            <Input name="unitPrice" type="number" min={0} step={0.01} placeholder="Price" required aria-label="Price" />
            <Button type="submit" size="sm" disabled={pending} className="h-11">
              Save
            </Button>
          </div>
        </form>
      )}
      <ul className="max-h-[28rem] divide-y divide-border overflow-auto">
        {items.map((p) => (
          <li key={p.id} className="flex items-center gap-1 px-2 py-1">
            <button type="button" onClick={() => onPick(p)} className="flex min-h-10 min-w-0 flex-1 items-center gap-2 rounded-lg px-1 text-left text-sm hover:bg-muted" aria-label={`Add ${p.description} to quote`}>
              <Plus className="size-3.5 shrink-0 text-muted-foreground" />
              <span className="min-w-0 flex-1 truncate">
                {p.description} <span className="text-xs text-muted-foreground">({p.kind})</span>
              </span>
              <span className="tabular-nums text-muted-foreground">{money(p.unitPrice)}</span>
            </button>
            {canEdit && (
              <form action={(fd) => run(deletePriceItemAction, fd)}>
                <input type="hidden" name="id" value={p.id} />
                <button type="submit" className="grid size-9 place-items-center rounded-lg text-muted-foreground hover:bg-muted hover:text-destructive" aria-label={`Remove ${p.description} from price list`} disabled={pending}>
                  <Trash2 className="size-3.5" />
                </button>
              </form>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
