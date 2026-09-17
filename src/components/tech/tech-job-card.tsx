"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Camera, Check, MapPin, Navigation, Phone } from "lucide-react";
import { toast } from "sonner";
import { markDoneAction, onMyWayAction } from "@/lib/actions/tech";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { formatPhone } from "@/lib/domain/types";
import { formatTime, formatShortDate } from "@/lib/rules/dates";
import { cn } from "@/lib/utils";

export interface TechJob {
  id: string;
  business: string;
  contact: string;
  phone: string | null;
  address: string | null;
  equipment: string;
  issue: string;
  urgent: boolean;
  scheduledFor: string | null;
  stage: string;
  notes: string;
  completedAt: string | null;
}

export function TechJobCard({ job, canAct }: { job: TechJob; canAct: boolean }) {
  const [done, setDone] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  const isDone = job.stage === "done";

  function onMyWay() {
    const fd = new FormData();
    fd.set("jobId", job.id);
    start(async () => {
      const res = await onMyWayAction(fd);
      if (res.ok) {
        toast.success(res.message, res.preview ? { description: res.preview.split("\n\n")[1]?.slice(0, 140) } : undefined);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  return (
    <article className={cn("rounded-2xl border bg-card p-4 shadow-sm", job.urgent && !isDone ? "border-red-300 urgent-ring" : "border-border")} data-testid="tech-job" data-job-id={job.id}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-semibold text-primary">
            {job.scheduledFor ? `${formatShortDate(job.scheduledFor)} · ${formatTime(job.scheduledFor)}` : "No time set"}
            {job.urgent && !isDone && <span className="ml-2 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Urgent</span>}
          </p>
          <h3 className="text-lg font-bold leading-tight">{job.business}</h3>
          {job.contact && <p className="text-sm text-muted-foreground">Ask for {job.contact}</p>}
        </div>
        {isDone && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-xs font-semibold text-emerald-900">Done</span>}
      </div>
      <p className="mt-2 text-sm">
        <span className="font-medium">{job.equipment}</span>
        {job.issue && <span className="text-muted-foreground"> — {job.issue}</span>}
      </p>
      {job.notes && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-900">{job.notes}</p>}
      <div className="mt-3 flex flex-wrap gap-2">
        {job.address && (
          <a href={`https://maps.google.com/?q=${encodeURIComponent(job.address)}`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
            <MapPin className="size-4" /> {job.address}
          </a>
        )}
        {job.phone && (
          <a href={`tel:${job.phone.replace(/[^\d+]/g, "")}`} className="inline-flex min-h-11 items-center gap-1.5 rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
            <Phone className="size-4" /> {formatPhone(job.phone)}
          </a>
        )}
      </div>
      {canAct && !isDone && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button variant="outline" onClick={onMyWay} disabled={pending} data-testid="on-my-way">
            <Navigation /> On my way
          </Button>
          <Button onClick={() => setDone(true)} className="bg-emerald-700 hover:bg-emerald-800" data-testid="mark-done">
            <Check /> Mark done
          </Button>
        </div>
      )}
      {isDone && job.completedAt && <p className="mt-2 text-xs text-muted-foreground">Completed {formatShortDate(job.completedAt)} {formatTime(job.completedAt)}</p>}

      <Dialog open={done} onOpenChange={setDone}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mark {job.business} done</DialogTitle>
            <DialogDescription>Add what you did. A photo is optional.</DialogDescription>
          </DialogHeader>
          <form
            action={(fd) =>
              start(async () => {
                const res = await markDoneAction(fd);
                if (res.ok) {
                  toast.success(res.message);
                  setDone(false);
                  router.refresh();
                } else toast.error(res.error);
              })
            }
            className="space-y-3"
          >
            <input type="hidden" name="jobId" value={job.id} />
            <div>
              <Label htmlFor={`notes-${job.id}`}>Work notes</Label>
              <Textarea id={`notes-${job.id}`} name="notes" rows={3} placeholder="Replaced evaporator fan motor, unit back to 36°F." data-testid="done-notes" />
            </div>
            <div>
              <Label htmlFor={`photo-${job.id}`} className="flex items-center gap-1">
                <Camera className="size-4" /> Photo (optional, under 2 MB)
              </Label>
              <Input id={`photo-${job.id}`} type="file" name="photo" accept="image/*" capture="environment" />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setDone(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending} className="bg-emerald-700 hover:bg-emerald-800" data-testid="confirm-done">
                {pending ? "Saving…" : "Done"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </article>
  );
}
