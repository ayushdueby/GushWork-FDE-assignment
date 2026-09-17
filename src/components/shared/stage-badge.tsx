import { STAGE_LABEL, type Stage } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

export const STAGE_STYLE: Record<Stage, string> = {
  needs_quote: "bg-sky-100 text-sky-900 ring-sky-200",
  waiting_on_yes: "bg-violet-100 text-violet-900 ring-violet-200",
  approved: "bg-emerald-100 text-emerald-900 ring-emerald-200",
  scheduled: "bg-teal-100 text-teal-900 ring-teal-200",
  done: "bg-slate-100 text-slate-700 ring-slate-200",
  lost: "bg-rose-100 text-rose-800 ring-rose-200",
};

export const STAGE_DOT: Record<Stage, string> = {
  needs_quote: "bg-sky-500",
  waiting_on_yes: "bg-violet-500",
  approved: "bg-emerald-500",
  scheduled: "bg-teal-500",
  done: "bg-slate-400",
  lost: "bg-rose-500",
};

export function StageBadge({ stage, className }: { stage: string; className?: string }) {
  const s = (stage in STAGE_LABEL ? stage : "needs_quote") as Stage;
  return (
    <span className={cn("inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset", STAGE_STYLE[s], className)}>
      <span className={cn("size-1.5 rounded-full", STAGE_DOT[s])} />
      {STAGE_LABEL[s]}
    </span>
  );
}

export function UrgentBadge({ className }: { className?: string }) {
  return <span className={cn("inline-flex items-center rounded-full bg-red-600 px-2.5 py-0.5 text-xs font-bold uppercase tracking-wide text-white", className)}>Urgent</span>;
}
