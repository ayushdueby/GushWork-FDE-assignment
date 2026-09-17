import { PhoneIncoming, PhoneMissed, PhoneOutgoing } from "lucide-react";
import { formatTimestamp } from "@/lib/rules/dates";

export interface CallRow {
  id: string;
  direction: string;
  number: string;
  startedAt: string;
  durationSec: number;
  status: string;
  transcript: string | null;
  summary: string | null;
  extractedJson: string | null;
  applied: boolean;
  jobId: string | null;
  recordingPath: string | null;
}

/** Read-only call card (list contexts). The interactive review/apply flow is the dialer's in Phase 3. */
export function CallSummaryCard({ call, compact, canWrite }: { call: CallRow; compact?: boolean; canWrite?: boolean }) {
  const Icon = call.status === "missed" ? PhoneMissed : call.direction === "inbound" ? PhoneIncoming : PhoneOutgoing;
  const mins = Math.round(call.durationSec / 60);
  return (
    <div className={`rounded-lg border p-3 text-sm ${call.status === "missed" ? "border-red-200 bg-red-50/60" : "border-border bg-muted/40"}`}>
      <p className="flex items-center gap-2 text-xs text-muted-foreground">
        <Icon className={`size-3.5 ${call.status === "missed" ? "text-red-700" : ""}`} />
        {call.status === "missed" ? "Missed call" : `${call.direction === "inbound" ? "Inbound" : "Outbound"} call`} · {call.number} · {formatTimestamp(call.startedAt)}
        {call.status !== "missed" && ` · ${mins} min`}
        {call.applied && <span className="rounded-full bg-emerald-100 px-2 py-0.5 text-emerald-900">applied</span>}
      </p>
      {call.summary && <p className="mt-1 font-medium">{call.summary}</p>}
      {call.transcript && (
        <details className="mt-1">
          <summary className="cursor-pointer text-xs text-primary">Transcript</summary>
          <p className={`mt-1 whitespace-pre-wrap text-muted-foreground ${compact ? "max-h-40 overflow-auto" : ""}`}>{call.transcript}</p>
        </details>
      )}
      {canWrite && !call.applied && call.extractedJson && call.jobId && (
        <a href={`/dialer?review=${call.id}`} className="mt-2 inline-block text-xs text-primary underline">
          Review proposed changes
        </a>
      )}
    </div>
  );
}
