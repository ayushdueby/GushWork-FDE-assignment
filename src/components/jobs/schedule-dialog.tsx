"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarDays } from "lucide-react";
import { toast } from "sonner";
import { scheduleJobAction } from "@/lib/actions/jobs";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

function toLocalInput(d: Date | string | null): string {
  const date = d ? new Date(d) : new Date(Date.now() + 86_400_000);
  if (!d) date.setHours(9, 0, 0, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}T${p(date.getHours())}:${p(date.getMinutes())}`;
}

export function ScheduleDialog({ jobId, scheduledFor, techId, techs, label }: { jobId: string; scheduledFor: string | null; techId: string | null; techs: { id: string; name: string }[]; label?: string }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <>
      <Button variant={scheduledFor ? "outline" : "default"} onClick={() => setOpen(true)}>
        <CalendarDays /> {label ?? (scheduledFor ? "Reschedule" : "Schedule")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{scheduledFor ? "Reschedule visit" : "Schedule visit"}</DialogTitle>
            <DialogDescription>Moves the job to Scheduled and texts the tech (simulated unless Twilio is configured).</DialogDescription>
          </DialogHeader>
          <form
            action={(fd) =>
              start(async () => {
                const res = await scheduleJobAction(fd);
                if (res.ok) {
                  if (res.conflict) toast.warning(res.message);
                  else toast.success(res.message);
                  setOpen(false);
                  router.refresh();
                } else toast.error(res.error);
              })
            }
            className="space-y-3"
          >
            <input type="hidden" name="jobId" value={jobId} />
            <div>
              <Label htmlFor="sd-when">Date and time</Label>
              <Input id="sd-when" type="datetime-local" name="scheduledFor" defaultValue={toLocalInput(scheduledFor)} required />
            </div>
            <div>
              <Label htmlFor="sd-dur">Duration (minutes)</Label>
              <Input id="sd-dur" type="number" name="durationMin" defaultValue={120} min={15} step={15} />
            </div>
            <div>
              <Label htmlFor="sd-tech">Tech</Label>
              <select id="sd-tech" name="techId" defaultValue={techId ?? ""} className="native h-11 w-full rounded-lg border border-input bg-background px-3 text-sm">
                <option value="">Not assigned yet</option>
                {techs.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
