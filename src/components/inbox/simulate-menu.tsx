"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { simulateInboundAction } from "@/lib/actions/inbox";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { EMAIL_SAMPLES, SMS_SAMPLES } from "@/lib/pipeline/samples";
import { cn } from "@/lib/utils";

export function SimulateMenu({ kind }: { kind: "email" | "sms" }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const samples = kind === "email" ? EMAIL_SAMPLES : SMS_SAMPLES;
  const Icon = kind === "email" ? Mail : MessageSquare;
  return (
    <DropdownMenu>
      <DropdownMenuTrigger className={cn("inline-flex h-11 items-center gap-2 rounded-lg border border-input bg-background px-3 text-sm font-medium hover:bg-muted", pending && "opacity-60")} disabled={pending} data-testid={`simulate-${kind}`}>
        <Icon className="size-4" /> {pending ? "Receiving…" : `Simulate incoming ${kind === "email" ? "email" : "text"}`}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground">Pick a realistic sample</div>
        <DropdownMenuSeparator />
        {samples.map((s) => (
          <DropdownMenuItem
            key={s.key}
            data-testid={`sample-${s.key}`}
            onClick={() => {
              const fd = new FormData();
              fd.set("key", s.key);
              start(async () => {
                const res = await simulateInboundAction(fd);
                if (res.ok) {
                  toast.success(res.message, { action: res.result.jobId ? { label: "Open job", onClick: () => router.push(`/jobs/${res.result.jobId}`) } : undefined });
                  router.push(`/inbox?m=${res.result.messageId}`);
                  router.refresh();
                } else toast.error(res.error);
              });
            }}
          >
            {s.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
