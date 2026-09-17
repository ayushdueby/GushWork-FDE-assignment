"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { advanceStageAction } from "@/lib/actions/jobs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { STAGE_LABEL, type Stage } from "@/lib/domain/types";

export interface TechOption {
  id: string;
  name: string;
}

/** Collects the one thing a forward move needs: a quote amount or a schedule date. */
export function AdvanceStageDialog({ jobId, from, next, needs, techs, open, onOpenChange, business }: { jobId: string; from: Stage; next: Stage; needs: "quote" | "schedule"; techs: TechOption[]; open: boolean; onOpenChange: (o: boolean) => void; business: string }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  function submit(fd: FormData) {
    start(async () => {
      const res = await advanceStageAction(fd);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
        onOpenChange(false);
      } else toast.error(res.error);
    });
  }
  const [tomorrow9] = useState(() => defaultVisitTime());
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{needs === "quote" ? "Send the quote" : "Schedule the visit"}</DialogTitle>
          <DialogDescription>
            {business} · {STAGE_LABEL[from]} → {STAGE_LABEL[next]}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="jobId" value={jobId} />
          <input type="hidden" name="from" value={from} />
          {needs === "quote" ? (
            <>
              <div>
                <Label htmlFor="adv-amount">Quote amount ($)</Label>
                <Input id="adv-amount" name="amount" inputMode="decimal" placeholder="1,250" required autoFocus />
              </div>
              <div>
                <Label htmlFor="adv-desc">What&apos;s included (optional)</Label>
                <Input id="adv-desc" name="description" placeholder="Condenser fan motor + labor" />
              </div>
              <p className="text-xs text-muted-foreground">Creates a one-line quote and marks it sent. Build a full itemised quote from the job page any time.</p>
            </>
          ) : (
            <>
              <div>
                <Label htmlFor="adv-when">Date and time</Label>
                <Input id="adv-when" type="datetime-local" name="scheduledFor" defaultValue={tomorrow9} required />
              </div>
              <div>
                <Label htmlFor="adv-tech">Tech</Label>
                <select id="adv-tech" name="techId" className="native h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" defaultValue="">
                  <option value="">Not assigned yet</option>
                  {techs.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </div>
            </>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : needs === "quote" ? "Send quote" : "Schedule"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** Tomorrow 9:00 local, formatted for <input type="datetime-local">. */
export function defaultVisitTime(): string {
  const d = new Date(Date.now() + 86_400_000);
  d.setHours(9, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}
