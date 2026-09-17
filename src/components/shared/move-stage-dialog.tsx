"use client";

import { useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { moveStageAction } from "@/lib/actions/jobs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { LOST_REASONS, STAGE_LABEL, type Stage } from "@/lib/domain/types";
import { defaultVisitTime, type TechOption } from "./advance-stage-dialog";

export interface MoveRequest {
  jobId: string;
  from: Stage;
  to: Stage;
  business: string;
}

/**
 * Generic "move this job to stage X". Tries the move; if the server says it needs a quote
 * amount / date / lost reason, asks for exactly that and retries.
 */
export function MoveStageDialog({ req, techs, onDone }: { req: MoveRequest | null; techs: TechOption[]; onDone: () => void }) {
  if (!req) return null;
  // Keyed so every new request starts with fresh state.
  return <MoveStageInner key={`${req.jobId}:${req.to}`} req={req} techs={techs} onDone={onDone} />;
}

function MoveStageInner({ req, techs, onDone }: { req: MoveRequest; techs: TechOption[]; onDone: () => void }) {
  const [needs, setNeeds] = useState<"quote" | "schedule" | "lostReason" | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const [tomorrow9] = useState(() => defaultVisitTime());

  useEffect(() => {
    // First attempt with no extra info; the action tells us what it needs.
    const fd = new FormData();
    fd.set("jobId", req.jobId);
    fd.set("stage", req.to);
    let alive = true;
    moveStageAction(fd).then((res) => {
      if (!alive) return;
      if (!res.ok) {
        toast.error(res.error);
        onDone();
      } else if ("needs" in res && res.needs) setNeeds(res.needs);
      else {
        toast.success(res.message ?? "Moved");
        router.refresh();
        onDone();
      }
    });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!needs) return null;

  function submit(fd: FormData) {
    start(async () => {
      const res = await moveStageAction(fd);
      if (!res.ok) toast.error(res.error);
      else if ("needs" in res && res.needs) setNeeds(res.needs);
      else {
        toast.success(res.message ?? "Moved");
        router.refresh();
        onDone();
      }
    });
  }
  return (
    <Dialog open onOpenChange={(o) => !o && onDone()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{needs === "quote" ? "Send the quote" : needs === "schedule" ? "Schedule the visit" : "Why was it lost?"}</DialogTitle>
          <DialogDescription>
            {req.business} · {STAGE_LABEL[req.from]} → {STAGE_LABEL[req.to]}
          </DialogDescription>
        </DialogHeader>
        <form action={submit} className="space-y-3">
          <input type="hidden" name="jobId" value={req.jobId} />
          <input type="hidden" name="stage" value={req.to} />
          {needs === "quote" && (
            <>
              <div>
                <Label htmlFor="mv-amount">Quote amount ($)</Label>
                <Input id="mv-amount" name="amount" inputMode="decimal" placeholder="1,250" required autoFocus />
              </div>
              <div>
                <Label htmlFor="mv-desc">What&apos;s included (optional)</Label>
                <Input id="mv-desc" name="description" placeholder="Condenser fan motor + labor" />
              </div>
            </>
          )}
          {needs === "schedule" && (
            <>
              <div>
                <Label htmlFor="mv-when">Date and time</Label>
                <Input id="mv-when" type="datetime-local" name="scheduledFor" defaultValue={tomorrow9} required />
              </div>
              <div>
                <Label htmlFor="mv-tech">Tech</Label>
                <select id="mv-tech" name="techId" className="native h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" defaultValue="">
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
          {needs === "lostReason" && (
            <div>
              <Label htmlFor="mv-lost">Reason</Label>
              <select id="mv-lost" name="lostReason" className="native h-11 w-full rounded-lg border border-input bg-background px-3 text-sm" defaultValue={LOST_REASONS[0]}>
                {LOST_REASONS.map((r) => (
                  <option key={r}>{r}</option>
                ))}
              </select>
            </div>
          )}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onDone}>
              Cancel
            </Button>
            <Button type="submit" disabled={pending} variant={needs === "lostReason" ? "destructive" : "default"}>
              {pending ? "Saving…" : needs === "quote" ? "Send quote" : needs === "schedule" ? "Schedule" : "Mark lost"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
