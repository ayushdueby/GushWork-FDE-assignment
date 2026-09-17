import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { WeekBoard, type BoardJob } from "@/components/schedule/week-board";
import { requirePage } from "@/lib/auth/current";
import { can } from "@/lib/auth/permissions";
import { db } from "@/lib/db";
import { addDays, startOfWeek, toDateKey } from "@/lib/rules/dates";

export const metadata = { title: "Schedule" };

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const user = await requirePage("view:schedule");
  const sp = await searchParams;
  const anchor = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? new Date(`${sp.week}T00:00:00`) : new Date();
  const start = startOfWeek(anchor);
  const end = addDays(start, 7);
  const days = Array.from({ length: 7 }, (_, i) => toDateKey(addDays(start, i)));
  const [techs, scheduled, unscheduled] = await Promise.all([
    db.tech.findMany({ where: { active: true }, orderBy: { name: "asc" } }),
    db.job.findMany({ where: { stage: "scheduled", scheduledFor: { gte: start, lt: end } }, include: { customer: true, site: true }, orderBy: { scheduledFor: "asc" } }),
    db.job.findMany({ where: { OR: [{ stage: "approved" }, { stage: "scheduled", techId: null }] }, include: { customer: true, site: true }, orderBy: [{ urgent: "desc" }, { updatedAt: "asc" }] }),
  ]);
  const toBoard = (j: (typeof scheduled)[number]): BoardJob => ({ id: j.id, business: j.customer.businessName, issue: j.issue, equipment: j.equipmentType, urgent: j.urgent, techId: j.techId, scheduledFor: j.scheduledFor?.toISOString() ?? null, scheduledEnd: j.scheduledEnd?.toISOString() ?? null, stage: j.stage, address: j.site?.address ?? null });
  const prev = toDateKey(addDays(start, -7));
  const next = toDateKey(addDays(start, 7));
  return (
    <div className="space-y-4">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Schedule</h1>
          <p className="text-sm text-muted-foreground">
            Week of {start.toLocaleDateString("en-US", { month: "long", day: "numeric" })}. Booking a job texts the tech; overlaps are flagged.
          </p>
        </div>
        <nav className="flex items-center gap-1" aria-label="Week">
          <Link href={`/schedule?week=${prev}`} className="grid size-11 place-items-center rounded-lg border border-border hover:bg-muted" aria-label="Previous week">
            <ChevronLeft className="size-4" />
          </Link>
          <Link href="/schedule" className="flex h-11 items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-muted">
            This week
          </Link>
          <Link href={`/schedule?week=${next}`} className="grid size-11 place-items-center rounded-lg border border-border hover:bg-muted" aria-label="Next week">
            <ChevronRight className="size-4" />
          </Link>
        </nav>
      </header>
      <WeekBoard days={days} techs={techs.map((t) => ({ id: t.id, name: t.name, color: t.color }))} jobs={scheduled.filter((j) => j.techId).map(toBoard)} unscheduled={unscheduled.map(toBoard)} canWrite={can(user.role, "write:crm")} />
    </div>
  );
}
