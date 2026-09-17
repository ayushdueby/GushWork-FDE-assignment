import Link from "next/link";
import { TechJobCard, type TechJob } from "@/components/tech/tech-job-card";
import { DeniedNotice } from "@/components/shell/denied-notice";
import { requirePage } from "@/lib/auth/current";
import { db } from "@/lib/db";
import { startOfDay } from "@/lib/rules/dates";
import { cn } from "@/lib/utils";

export const metadata = { title: "Tech view" };

/** Mobile-first: a tech's own jobs today and upcoming. Owners can preview any tech. */
export default async function TechPage({ searchParams }: { searchParams: Promise<{ tech?: string; denied?: string }> }) {
  const user = await requirePage("view:tech");
  const sp = await searchParams;
  const techs = await db.tech.findMany({ where: { active: true }, orderBy: { name: "asc" } });
  const techId = user.role === "tech" ? user.techId : (sp.tech ?? techs[0]?.id ?? null);
  const tech = techs.find((t) => t.id === techId) ?? null;
  const now = new Date();
  const today = startOfDay(now);
  const tomorrow = new Date(today.getTime() + 86_400_000);
  const jobs = techId
    ? await db.job.findMany({ where: { techId, OR: [{ stage: "scheduled" }, { stage: "done", completedAt: { gte: new Date(today.getTime() - 7 * 86_400_000) } }] }, include: { customer: true, site: true }, orderBy: [{ scheduledFor: "asc" }] })
    : [];
  const toCard = (j: (typeof jobs)[number]): TechJob => ({ id: j.id, business: j.customer.businessName, contact: j.customer.primaryContact, phone: j.customer.phone, address: j.site?.address ?? null, equipment: j.equipmentType, issue: j.issue, urgent: j.urgent, scheduledFor: j.scheduledFor?.toISOString() ?? null, stage: j.stage, notes: j.customer.notes, completedAt: j.completedAt?.toISOString() ?? null });
  const scheduled = jobs.filter((j) => j.stage === "scheduled");
  const todays = scheduled.filter((j) => j.scheduledFor && j.scheduledFor >= today && j.scheduledFor < tomorrow);
  const overdue = scheduled.filter((j) => j.scheduledFor && j.scheduledFor < today);
  const upcoming = scheduled.filter((j) => !j.scheduledFor || j.scheduledFor >= tomorrow);
  const recent = jobs.filter((j) => j.stage === "done").sort((a, b) => (b.completedAt?.getTime() ?? 0) - (a.completedAt?.getTime() ?? 0));
  const canAct = user.role === "tech" || user.role === "owner";

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <DeniedNotice show={sp.denied} />
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{tech ? `${tech.name.split(" ")[0]}'s jobs` : "Tech view"}</h1>
          <p className="text-sm text-muted-foreground">{now.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}</p>
        </div>
        {user.role === "owner" && (
          <nav className="flex flex-wrap gap-1" aria-label="Pick a tech">
            {techs.map((t) => (
              <Link key={t.id} href={`/tech?tech=${t.id}`} className={cn("rounded-full px-3 py-1.5 text-sm font-medium", t.id === techId ? "text-white" : "bg-muted text-muted-foreground")} style={t.id === techId ? { background: t.color } : undefined}>
                {t.name.split(" ")[0]}
              </Link>
            ))}
          </nav>
        )}
      </header>

      {overdue.length > 0 && (
        <Section title="Not closed out" hint="These dates have passed. Mark them done or tell the office.">
          {overdue.map((j) => (
            <TechJobCard key={j.id} job={toCard(j)} canAct={canAct} />
          ))}
        </Section>
      )}
      <Section title="Today" hint={todays.length === 0 ? "Nothing on the calendar today." : undefined}>
        {todays.map((j) => (
          <TechJobCard key={j.id} job={toCard(j)} canAct={canAct} />
        ))}
      </Section>
      <Section title="Upcoming" hint={upcoming.length === 0 ? "Nothing scheduled yet." : undefined}>
        {upcoming.map((j) => (
          <TechJobCard key={j.id} job={toCard(j)} canAct={canAct} />
        ))}
      </Section>
      {recent.length > 0 && (
        <Section title="Done this week">
          {recent.map((j) => (
            <TechJobCard key={j.id} job={toCard(j)} canAct={false} />
          ))}
        </Section>
      )}
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold">{title}</h2>
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
      {children}
    </section>
  );
}
