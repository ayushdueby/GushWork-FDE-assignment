import { db } from "@/lib/db";
import { callToday, type CallItem } from "@/lib/rules/callToday";
import { startOfWeek } from "@/lib/rules/dates";
import type { JobWithCustomer } from "./jobs";

export type TodayJob = JobWithCustomer & { missedCallAt: Date | null; quoteTotal: number | null; quoteId: string | null; quoteStatus: string | null };
export type TodayItem = CallItem<TodayJob>;

/** Open jobs + the data the rules and the row UI need, in one query. */
export async function loadTodayJobs(now = new Date()): Promise<TodayJob[]> {
  const jobs = await db.job.findMany({
    where: { stage: { notIn: ["done", "lost"] } },
    include: {
      customer: true,
      tech: true,
      site: true,
      calls: { where: { direction: "inbound", status: "missed" }, orderBy: { startedAt: "desc" }, take: 1, select: { startedAt: true } },
      quotes: { orderBy: { createdAt: "desc" }, take: 1, select: { id: true, total: true, status: true } },
    },
  });
  void now;
  return jobs.map((j) => {
    const { calls, quotes, ...rest } = j;
    return { ...rest, missedCallAt: calls[0]?.startedAt ?? null, quoteTotal: quotes[0]?.total ?? null, quoteId: quotes[0]?.id ?? null, quoteStatus: quotes[0]?.status ?? null };
  });
}

export async function buildCallList(now = new Date()): Promise<TodayItem[]> {
  const jobs = await loadTodayJobs(now);
  return callToday(jobs, now);
}

export interface Kpis {
  openJobs: number;
  waitingOnYesTotal: number;
  callsToday: number;
  doneThisWeek: number;
  noResponse24h: number;
}

export async function kpis(now = new Date()): Promise<Kpis> {
  const [open, quotes, doneThisWeek, items] = await Promise.all([
    db.job.count({ where: { stage: { notIn: ["done", "lost"] } } }),
    db.quote.findMany({ where: { status: "sent", job: { stage: "waiting_on_yes" } }, select: { total: true } }),
    db.job.count({ where: { stage: "done", completedAt: { gte: startOfWeek(now) } } }),
    buildCallList(now),
  ]);
  const dayAgo = new Date(now.getTime() - 24 * 3600 * 1000);
  const noResponse24h = await db.job.count({ where: { stage: { notIn: ["done", "lost"] }, lastContactAt: null, createdAt: { lte: dayAgo } } });
  return {
    openJobs: open,
    waitingOnYesTotal: quotes.reduce((s, q) => s + q.total, 0),
    callsToday: items.length,
    doneThisWeek,
    noResponse24h,
  };
}
