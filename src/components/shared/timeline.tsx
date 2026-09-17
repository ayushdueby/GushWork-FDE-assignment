import { ArrowRightCircle, FileText, Mail, MessageSquare, Phone, PhoneMissed, StickyNote, CalendarDays, Wrench, Info } from "lucide-react";
import { formatTimestamp } from "@/lib/rules/dates";

interface Act {
  id: string;
  type: string;
  text: string;
  actor: string;
  at: Date | string;
}

const ICON: Record<string, typeof Info> = {
  stage: ArrowRightCircle,
  contact: Phone,
  note: StickyNote,
  message_in: MessageSquare,
  message_out: Mail,
  call: Phone,
  missed_call: PhoneMissed,
  quote: FileText,
  schedule: CalendarDays,
  tech: Wrench,
  system: Info,
};

/** The one timeline everything writes to. Rendered newest-first. */
export function Timeline({ items, emptyText = "Nothing has happened yet." }: { items: Act[]; emptyText?: string }) {
  if (items.length === 0) return <p className="py-6 text-center text-sm text-muted-foreground">{emptyText}</p>;
  return (
    <ol className="relative space-y-4 border-l border-border pl-5" aria-label="Activity">
      {items.map((a) => {
        const Icon = ICON[a.type] ?? Info;
        return (
          <li key={a.id} className="relative">
            <span className={`absolute -left-[1.6rem] top-0.5 grid size-5 place-items-center rounded-full ring-2 ring-background ${a.type === "missed_call" ? "bg-red-100 text-red-700" : "bg-muted text-muted-foreground"}`}>
              <Icon className="size-3" />
            </span>
            <p className="text-sm">{a.text}</p>
            <p className="text-xs text-muted-foreground">
              {formatTimestamp(a.at)} · {a.actor}
            </p>
          </li>
        );
      })}
    </ol>
  );
}
