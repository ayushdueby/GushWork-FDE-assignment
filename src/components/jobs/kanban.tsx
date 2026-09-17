"use client";

import Link from "next/link";
import { useState } from "react";
import { GripVertical } from "lucide-react";
import { STAGES, STAGE_LABEL, formatPhone, type Stage } from "@/lib/domain/types";
import { daysAgoLabel, daysBetween } from "@/lib/rules/dates";
import { cn } from "@/lib/utils";
import { MoveStageDialog, type MoveRequest } from "@/components/shared/move-stage-dialog";
import type { TechOption } from "@/components/shared/advance-stage-dialog";
import { STAGE_DOT } from "@/components/shared/stage-badge";

export interface KanbanJob {
  id: string;
  stage: Stage;
  urgent: boolean;
  business: string;
  contact: string;
  phone: string | null;
  equipment: string;
  issue: string;
  lastContactAt: string | null;
  createdAt: string;
  quoteTotal: number | null;
  techName: string | null;
  scheduledFor: string | null;
}

const COLUMNS: Stage[] = ["needs_quote", "waiting_on_yes", "approved", "scheduled", "done"];

/** Drag-and-drop between stages with a keyboard/touch fallback ("Move to…" on every card). */
export function Kanban({ jobs, techs, canWrite, showLost }: { jobs: KanbanJob[]; techs: TechOption[]; canWrite: boolean; showLost: boolean }) {
  const [move, setMove] = useState<MoveRequest | null>(null);
  const [dragOver, setDragOver] = useState<Stage | null>(null);
  const [dragging, setDragging] = useState<string | null>(null);
  const now = new Date();
  const cols = showLost ? [...COLUMNS, "lost" as Stage] : COLUMNS;

  function drop(to: Stage) {
    setDragOver(null);
    if (!dragging || !canWrite) return;
    const job = jobs.find((j) => j.id === dragging);
    setDragging(null);
    if (!job || job.stage === to) return;
    setMove({ jobId: job.id, from: job.stage, to, business: job.business });
  }

  return (
    <>
      <div className="relative flex max-w-full snap-x gap-3 overflow-x-auto pb-4" role="list" aria-label="Jobs by stage">
        {cols.map((stage) => {
          const items = jobs.filter((j) => j.stage === stage);
          return (
            <section
              key={stage}
              role="listitem"
              aria-label={`${STAGE_LABEL[stage]} (${items.length})`}
              onDragOver={(e) => {
                if (!canWrite) return;
                e.preventDefault();
                if (dragOver !== stage) setDragOver(stage);
              }}
              onDragLeave={() => setDragOver((s) => (s === stage ? null : s))}
              onDrop={(e) => {
                e.preventDefault();
                drop(stage);
              }}
              className={cn("flex w-72 shrink-0 snap-start flex-col rounded-2xl border bg-muted/40 transition", dragOver === stage ? "border-primary bg-primary/5" : "border-border")}
              data-testid={`column-${stage}`}
            >
              <header className="flex items-center gap-2 px-3 py-2.5">
                <span className={cn("size-2 rounded-full", STAGE_DOT[stage])} />
                <h2 className="text-sm font-semibold">{STAGE_LABEL[stage]}</h2>
                <span className="ml-auto rounded-full bg-background px-2 py-0.5 text-xs font-medium text-muted-foreground">{items.length}</span>
              </header>
              <div className="flex min-h-24 flex-1 flex-col gap-2 px-2 pb-2">
                {items.length === 0 && <p className="px-2 py-6 text-center text-xs text-muted-foreground">Nothing here</p>}
                {items.map((j) => {
                  const days = daysBetween(j.lastContactAt ?? j.createdAt, now);
                  return (
                    <article
                      key={j.id}
                      draggable={canWrite}
                      onDragStart={(e) => {
                        setDragging(j.id);
                        e.dataTransfer.effectAllowed = "move";
                        e.dataTransfer.setData("text/plain", j.id);
                      }}
                      onDragEnd={() => setDragging(null)}
                      className={cn("relative rounded-xl border bg-card p-3 text-sm shadow-sm", j.urgent ? "border-red-300 urgent-ring" : "border-border", dragging === j.id && "opacity-50")}
                      data-testid="kanban-card"
                      data-job-id={j.id}
                    >
                      <div className="flex items-start gap-1.5">
                        {canWrite && <GripVertical className="mt-0.5 size-4 shrink-0 cursor-grab text-muted-foreground" aria-hidden />}
                        <div className="min-w-0 flex-1">
                          <Link href={`/jobs/${j.id}`} className="font-semibold leading-tight hover:underline">
                            {j.business}
                          </Link>
                          {j.urgent && <span className="ml-1.5 rounded-full bg-red-600 px-1.5 py-0.5 text-[10px] font-bold uppercase text-white">Urgent</span>}
                          <p className="mt-0.5 truncate text-muted-foreground">
                            <span className="text-foreground/80">{j.equipment}</span>
                            {j.issue && ` — ${j.issue}`}
                          </p>
                          <p className="mt-1 flex flex-wrap gap-x-2 text-xs text-muted-foreground">
                            <span>{j.lastContactAt ? `contact ${daysAgoLabel(days)} ago` : `no contact · ${daysAgoLabel(days)}`}</span>
                            {j.quoteTotal != null && <span>${Math.round(j.quoteTotal).toLocaleString()}</span>}
                            {j.techName && <span>{j.techName}</span>}
                            {j.scheduledFor && <span>{new Date(j.scheduledFor).toLocaleDateString("en-US", { month: "short", day: "numeric" })}</span>}
                          </p>
                          {j.phone && <p className="mt-0.5 text-xs text-muted-foreground">{formatPhone(j.phone)}</p>}
                        </div>
                      </div>
                      {canWrite && (
                        <label className="mt-2 block">
                          <span className="sr-only">Move {j.business} to</span>
                          <select
                            className="native h-9 w-full rounded-md border border-input bg-background px-2 text-xs"
                            value={j.stage}
                            onChange={(e) => {
                              const to = e.target.value as Stage;
                              if (to !== j.stage) setMove({ jobId: j.id, from: j.stage, to, business: j.business });
                            }}
                            aria-label={`Move ${j.business} to another stage`}
                          >
                            {STAGES.map((s) => (
                              <option key={s} value={s}>
                                {s === j.stage ? `${STAGE_LABEL[s]} (current)` : `Move to ${STAGE_LABEL[s]}`}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                    </article>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>
      <MoveStageDialog req={move} techs={techs} onDone={() => setMove(null)} />
    </>
  );
}
