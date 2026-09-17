"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GripVertical } from "lucide-react";
import { toast } from "sonner";
import { scheduleJobAction } from "@/lib/actions/jobs";
import { ScheduleDialog } from "@/components/jobs/schedule-dialog";
import { formatTime } from "@/lib/rules/dates";
import { cn } from "@/lib/utils";

export interface BoardJob {
  id: string;
  business: string;
  issue: string;
  equipment: string;
  urgent: boolean;
  techId: string | null;
  scheduledFor: string | null;
  scheduledEnd: string | null;
  stage: string;
  address: string | null;
}
export interface BoardTech {
  id: string;
  name: string;
  color: string;
}

const SLOTS = [8, 10, 13, 15]; // 8am, 10am, 1pm, 3pm — a trades day in four blocks

function slotLabel(h: number) {
  return `${h > 12 ? h - 12 : h}${h >= 12 ? "pm" : "am"}`;
}

/**
 * Week calendar: a lane per tech, a column per day, four drop slots per cell.
 * Drag an approved job (left rail) or a scheduled one (to move it). Mobile uses the
 * "Schedule…" dialog instead of drag-and-drop.
 */
export function WeekBoard({ days, techs, jobs, unscheduled, canWrite }: { days: string[]; techs: BoardTech[]; jobs: BoardJob[]; unscheduled: BoardJob[]; canWrite: boolean }) {
  const [dragging, setDragging] = useState<string | null>(null);
  const [over, setOver] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();

  function drop(techId: string, dayKey: string, hour: number) {
    setOver(null);
    if (!dragging || !canWrite) return;
    const id = dragging;
    setDragging(null);
    const [y, m, d] = dayKey.split("-").map(Number);
    const when = new Date(y, m - 1, d, hour, 0, 0, 0);
    const fd = new FormData();
    fd.set("jobId", id);
    fd.set("scheduledFor", `${dayKey}T${String(hour).padStart(2, "0")}:00`);
    fd.set("techId", techId);
    void when;
    start(async () => {
      const res = await scheduleJobAction(fd);
      if (!res.ok) toast.error(res.error);
      else if (res.conflict) toast.warning(`Double-booked: ${res.message}`, { duration: 8000 });
      else toast.success(res.message);
      router.refresh();
    });
  }

  const onDragOver = (key: string) => (e: React.DragEvent) => {
    if (!canWrite || !dragging) return;
    e.preventDefault();
    if (over !== key) setOver(key);
  };

  const conflicts = new Set<string>();
  for (const a of jobs) {
    for (const b of jobs) {
      if (a.id >= b.id || !a.techId || a.techId !== b.techId || !a.scheduledFor || !b.scheduledFor) continue;
      const aS = new Date(a.scheduledFor).getTime();
      const aE = a.scheduledEnd ? new Date(a.scheduledEnd).getTime() : aS + 2 * 3600_000;
      const bS = new Date(b.scheduledFor).getTime();
      const bE = b.scheduledEnd ? new Date(b.scheduledEnd).getTime() : bS + 2 * 3600_000;
      if (aS < bE && bS < aE) {
        conflicts.add(a.id);
        conflicts.add(b.id);
      }
    }
  }

  const todayKey = (() => {
    const t = new Date();
    return `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, "0")}-${String(t.getDate()).padStart(2, "0")}`;
  })();

  const Card = ({ j, compact }: { j: BoardJob; compact?: boolean }) => (
    <div
      draggable={canWrite}
      onDragStart={(e) => {
        setDragging(j.id);
        e.dataTransfer.effectAllowed = "move";
        e.dataTransfer.setData("text/plain", j.id);
      }}
      onDragEnd={() => setDragging(null)}
      className={cn("rounded-lg border bg-card p-2 text-xs shadow-sm", j.urgent ? "border-red-300 urgent-ring" : "border-border", dragging === j.id && "opacity-50", conflicts.has(j.id) && "ring-2 ring-amber-400")}
      data-testid="schedule-card"
      data-job-id={j.id}
      title={conflicts.has(j.id) ? "Overlaps another job for this tech" : undefined}
    >
      <div className="flex items-start gap-1">
        {canWrite && <GripVertical className="mt-0.5 size-3.5 shrink-0 cursor-grab text-muted-foreground" aria-hidden />}
        <div className="min-w-0 flex-1">
          <Link href={`/jobs/${j.id}`} className="block truncate font-semibold hover:underline">
            {j.scheduledFor && !compact ? `${formatTime(j.scheduledFor)} · ` : ""}
            {j.business}
          </Link>
          <p className="truncate text-muted-foreground">
            {j.equipment} — {j.issue}
          </p>
          {conflicts.has(j.id) && <p className="font-semibold text-amber-700">Double-booked</p>}
        </div>
      </div>
      {canWrite && compact && (
        <div className="mt-1">
          <ScheduleDialog jobId={j.id} scheduledFor={j.scheduledFor} techId={j.techId} techs={techs} label="Schedule…" />
        </div>
      )}
    </div>
  );

  return (
    <div className="grid gap-4 lg:grid-cols-[16rem_1fr]">
      <aside className="space-y-2">
        <h2 className="text-sm font-semibold">Ready to book ({unscheduled.length})</h2>
        <p className="text-xs text-muted-foreground">Approved jobs. Drag one onto a tech&apos;s day, or use Schedule…</p>
        <div className="space-y-2" data-testid="unscheduled">
          {unscheduled.length === 0 && <p className="rounded-lg border border-dashed border-border p-3 text-xs text-muted-foreground">Nothing waiting to be booked.</p>}
          {unscheduled.map((j) => (
            <Card key={j.id} j={j} compact />
          ))}
        </div>
      </aside>

      <div className={cn("-mx-4 overflow-x-auto px-4 md:mx-0 md:px-0", pending && "opacity-70")}>
        <table className="w-full min-w-[56rem] border-separate border-spacing-0 text-xs">
          <thead>
            <tr>
              <th className="sticky left-0 z-10 w-28 bg-background p-2 text-left text-muted-foreground">Tech</th>
              {days.map((d) => {
                const date = new Date(`${d}T00:00:00`);
                return (
                  <th key={d} className={cn("border-b border-border p-2 text-left font-semibold", d === todayKey && "text-primary")}>
                    {date.toLocaleDateString("en-US", { weekday: "short" })} <span className="font-normal text-muted-foreground">{date.getDate()}</span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {techs.map((t) => (
              <tr key={t.id}>
                <th scope="row" className="sticky left-0 z-10 bg-background p-2 text-left align-top">
                  <span className="inline-flex items-center gap-1.5 font-semibold">
                    <span className="size-2.5 rounded-full" style={{ background: t.color }} /> {t.name.split(" ")[0]}
                  </span>
                </th>
                {days.map((d) => (
                  <td key={d} className={cn("border-b border-l border-border align-top", d === todayKey && "bg-primary/5")}>
                    <div className="flex min-h-28 flex-col">
                      {SLOTS.map((h) => {
                        const key = `${t.id}|${d}|${h}`;
                        const here = jobs.filter((j) => j.techId === t.id && j.scheduledFor && `${new Date(j.scheduledFor).getFullYear()}-${String(new Date(j.scheduledFor).getMonth() + 1).padStart(2, "0")}-${String(new Date(j.scheduledFor).getDate()).padStart(2, "0")}` === d && bucket(new Date(j.scheduledFor).getHours()) === h);
                        return (
                          <div
                            key={h}
                            onDragOver={onDragOver(key)}
                            onDragLeave={() => setOver((o) => (o === key ? null : o))}
                            onDrop={(e) => {
                              e.preventDefault();
                              drop(t.id, d, h);
                            }}
                            className={cn("flex-1 border-t border-dashed border-border/60 p-1 first:border-t-0", over === key && "bg-primary/10", dragging && "min-h-6")}
                            data-testid={`slot-${t.id}-${d}-${h}`}
                            aria-label={`${t.name} ${d} ${slotLabel(h)}`}
                          >
                            {here.length === 0 && dragging && <span className="text-[10px] text-muted-foreground">{slotLabel(h)}</span>}
                            {here.map((j) => (
                              <Card key={j.id} j={j} />
                            ))}
                          </div>
                        );
                      })}
                    </div>
                  </td>
                ))}
              </tr>
            ))}
            {techs.length === 0 && (
              <tr>
                <td colSpan={days.length + 1} className="p-6 text-center text-muted-foreground">
                  No active techs.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function bucket(hour: number): number {
  let best = SLOTS[0];
  for (const s of SLOTS) if (hour >= s) best = s;
  return best;
}
