import { db } from "@/lib/db";
import { STAGES, STAGE_LABEL, SOURCES, SOURCE_LABEL, type Stage, type Source } from "@/lib/domain/types";
import { startOfWeek, toDateKey } from "@/lib/rules/dates";

/** "My husband keeps asking me for numbers" — everything the bookkeeper wants, from one query pass. */

export interface DateRange {
  from: Date;
  to: Date; // exclusive
}

export interface Reports {
  range: DateRange;
  pipelineByStage: { stage: Stage; label: string; count: number; value: number }[];
  leadsBySource: { source: Source; label: string; count: number }[];
  quotes: { sent: number; accepted: number; declined: number; open: number; winRate: number | null; acceptedValue: number; sentValue: number };
  firstResponse: { avgHours: number | null; medianHours: number | null; measured: number };
  neverResponded: { id: string; business: string; issue: string; createdAt: Date; urgent: boolean; stage: string }[];
  revenueByWeek: { week: string; label: string; revenue: number; jobs: number }[];
  revenueByMonth: { month: string; label: string; revenue: number; jobs: number }[];
  jobsPerTech: { techId: string; name: string; color: string; done: number; scheduled: number; revenue: number }[];
  totals: { newLeads: number; completed: number; revenue: number; lost: number };
}

export function parseRange(from?: string | null, to?: string | null, now = new Date()): DateRange {
  const end = to && /^\d{4}-\d{2}-\d{2}$/.test(to) ? new Date(`${to}T00:00:00`) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  end.setDate(end.getDate() + 1); // inclusive end day
  const start = from && /^\d{4}-\d{2}-\d{2}$/.test(from) ? new Date(`${from}T00:00:00`) : new Date(end.getTime() - 90 * 86_400_000);
  return { from: start, to: end };
}

export async function buildReports(range: DateRange): Promise<Reports> {
  const [jobsInRange, openJobs, quotesInRange, doneInRange, techs, contactActs] = await Promise.all([
    db.job.findMany({ where: { createdAt: { gte: range.from, lt: range.to } }, include: { customer: { select: { businessName: true } } } }),
    db.job.findMany({ where: { stage: { notIn: ["done", "lost"] } }, include: { quotes: { orderBy: { createdAt: "desc" }, take: 1, select: { total: true } } } }),
    db.quote.findMany({ where: { sentAt: { gte: range.from, lt: range.to } }, select: { status: true, total: true } }),
    db.job.findMany({ where: { stage: "done", completedAt: { gte: range.from, lt: range.to } }, include: { quotes: { where: { status: "accepted" }, orderBy: { createdAt: "desc" }, take: 1, select: { total: true } }, tech: true } }),
    db.tech.findMany({ orderBy: { name: "asc" } }),
    db.activity.findMany({ where: { type: { in: ["contact", "call", "message_out", "quote", "schedule"] }, at: { gte: range.from } }, orderBy: { at: "asc" }, select: { jobId: true, at: true, text: true } }),
  ]);

  const pipelineByStage = STAGES.filter((s) => s !== "done" && s !== "lost").map((stage) => {
    const rows = openJobs.filter((j) => j.stage === stage);
    return { stage, label: STAGE_LABEL[stage], count: rows.length, value: rows.reduce((s, j) => s + (j.quotes[0]?.total ?? 0), 0) };
  });

  const leadsBySource = SOURCES.map((source) => ({ source, label: SOURCE_LABEL[source], count: jobsInRange.filter((j) => j.source === source).length })).filter((r) => r.count > 0);

  const accepted = quotesInRange.filter((q) => q.status === "accepted");
  const declined = quotesInRange.filter((q) => q.status === "declined");
  const decided = accepted.length + declined.length;
  const quotes = {
    sent: quotesInRange.length,
    accepted: accepted.length,
    declined: declined.length,
    open: quotesInRange.filter((q) => q.status === "sent").length,
    winRate: decided ? accepted.length / decided : null,
    acceptedValue: accepted.reduce((s, q) => s + q.total, 0),
    sentValue: quotesInRange.reduce((s, q) => s + q.total, 0),
  };

  // First response: created → first outbound touch that isn't the "Job created" system line.
  const firstTouch = new Map<string, Date>();
  for (const a of contactActs) if (a.jobId && !firstTouch.has(a.jobId)) firstTouch.set(a.jobId, a.at);
  const hours = jobsInRange
    .map((j) => {
      const t = firstTouch.get(j.id) ?? j.lastContactAt;
      return t ? (t.getTime() - j.createdAt.getTime()) / 3_600_000 : null;
    })
    .filter((h): h is number => h != null && h >= 0)
    .sort((a, b) => a - b);
  const firstResponse = { avgHours: hours.length ? hours.reduce((s, h) => s + h, 0) / hours.length : null, medianHours: hours.length ? hours[Math.floor(hours.length / 2)] : null, measured: hours.length };

  const neverResponded = jobsInRange.filter((j) => !j.lastContactAt && j.stage !== "done" && j.stage !== "lost").map((j) => ({ id: j.id, business: j.customer.businessName, issue: j.issue, createdAt: j.createdAt, urgent: j.urgent, stage: j.stage })).sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime());

  const byWeek = new Map<string, { revenue: number; jobs: number }>();
  const byMonth = new Map<string, { revenue: number; jobs: number }>();
  const perTech = new Map<string, { done: number; scheduled: number; revenue: number }>();
  for (const j of doneInRange) {
    const rev = j.quotes[0]?.total ?? 0;
    const w = toDateKey(startOfWeek(j.completedAt!));
    const m = `${j.completedAt!.getFullYear()}-${String(j.completedAt!.getMonth() + 1).padStart(2, "0")}`;
    byWeek.set(w, { revenue: (byWeek.get(w)?.revenue ?? 0) + rev, jobs: (byWeek.get(w)?.jobs ?? 0) + 1 });
    byMonth.set(m, { revenue: (byMonth.get(m)?.revenue ?? 0) + rev, jobs: (byMonth.get(m)?.jobs ?? 0) + 1 });
    if (j.techId) {
      const t = perTech.get(j.techId) ?? { done: 0, scheduled: 0, revenue: 0 };
      t.done++;
      t.revenue += rev;
      perTech.set(j.techId, t);
    }
  }
  const scheduledNow = await db.job.groupBy({ by: ["techId"], where: { stage: "scheduled", techId: { not: null } }, _count: { _all: true } });
  for (const s of scheduledNow) {
    if (!s.techId) continue;
    const t = perTech.get(s.techId) ?? { done: 0, scheduled: 0, revenue: 0 };
    t.scheduled = s._count._all;
    perTech.set(s.techId, t);
  }

  const revenueByWeek = [...byWeek.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([week, v]) => ({ week, label: `Wk of ${new Date(`${week}T00:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`, ...v }));
  const revenueByMonth = [...byMonth.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([month, v]) => ({ month, label: new Date(`${month}-01T00:00:00`).toLocaleDateString("en-US", { month: "short", year: "numeric" }), ...v }));
  const jobsPerTech = techs.map((t) => ({ techId: t.id, name: t.name, color: t.color, ...(perTech.get(t.id) ?? { done: 0, scheduled: 0, revenue: 0 }) }));
  const lost = await db.job.count({ where: { stage: "lost", updatedAt: { gte: range.from, lt: range.to } } });

  return {
    range,
    pipelineByStage,
    leadsBySource,
    quotes,
    firstResponse,
    neverResponded,
    revenueByWeek,
    revenueByMonth,
    jobsPerTech,
    totals: { newLeads: jobsInRange.length, completed: doneInRange.length, revenue: doneInRange.reduce((s, j) => s + (j.quotes[0]?.total ?? 0), 0), lost },
  };
}

/** Flat rows for the bookkeeper's spreadsheet. */
export async function jobsCsv(range: DateRange): Promise<string> {
  const jobs = await db.job.findMany({ where: { createdAt: { gte: range.from, lt: range.to } }, include: { customer: true, tech: true, site: true, quotes: { orderBy: { createdAt: "desc" }, take: 1 } }, orderBy: { createdAt: "asc" } });
  const headers = ["Created", "Business", "Contact", "Phone", "Email", "Site", "Equipment", "Issue", "Source", "Urgent", "Stage", "Lost reason", "Tech", "Scheduled", "Completed", "Last contact", "Quote status", "Quote total"];
  const rows = jobs.map((j) => [
    j.createdAt.toISOString(),
    j.customer.businessName,
    j.customer.primaryContact,
    j.customer.phone ?? "",
    j.customer.email ?? "",
    j.site?.address ?? "",
    j.equipmentType,
    j.issue,
    j.source,
    j.urgent ? "yes" : "no",
    j.stage,
    j.lostReason ?? "",
    j.tech?.name ?? "",
    j.scheduledFor?.toISOString() ?? "",
    j.completedAt?.toISOString() ?? "",
    j.lastContactAt?.toISOString() ?? "",
    j.quotes[0]?.status ?? "",
    j.quotes[0] ? j.quotes[0].total.toFixed(2) : "",
  ]);
  return toCsv(headers, rows);
}

export function csvCell(value: unknown): string {
  if (value == null) return "";
  let s = String(value);
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`; // never let a cell become a spreadsheet formula
  if (/[",\n\r]/.test(s)) s = `"${s.replace(/"/g, '""')}"`;
  return s;
}

export function toCsv(headers: string[], rows: unknown[][]): string {
  return `﻿${[headers, ...rows].map((r) => r.map(csvCell).join(",")).join("\r\n")}\r\n`;
}
