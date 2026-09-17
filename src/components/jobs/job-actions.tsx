"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, Mail, MessageSquare, Phone } from "lucide-react";
import { toast } from "sonner";
import { markContactedAction } from "@/lib/actions/jobs";
import { Button } from "@/components/ui/button";
import { useDialer } from "@/components/dialer/dialer-provider";
import { MoveStageDialog, type MoveRequest } from "@/components/shared/move-stage-dialog";
import { SendMessageDialog, type MessageTarget } from "@/components/shared/send-message-dialog";
import type { TechOption } from "@/components/shared/advance-stage-dialog";
import { STAGES, STAGE_LABEL, type Stage } from "@/lib/domain/types";

export interface JobActionsProps {
  jobId: string;
  customerId: string;
  stage: Stage;
  business: string;
  contact: string;
  phone: string | null;
  email: string | null;
  equipment: string;
  techs: TechOption[];
  ownerName: string;
}

/** Call / Text / Email / Mark contacted / Stage select — shared by the job page and customer page. */
export function JobActions(p: JobActionsProps) {
  const [msg, setMsg] = useState<MessageTarget | null>(null);
  const [move, setMove] = useState<MoveRequest | null>(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const dialer = useDialer();
  const first = p.contact.split(" ")[0] || "there";
  const template = `Hi ${first}, ${p.ownerName} here about the ${p.equipment} at ${p.business}. `;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button variant="outline" onClick={() => (p.phone ? dialer.openDialer({ number: p.phone, jobId: p.jobId, customerId: p.customerId, label: p.business }) : toast.error("No phone on file"))}>
        <Phone /> Call
      </Button>
      <Button variant="outline" onClick={() => setMsg({ channel: "sms", to: p.phone, jobId: p.jobId, customerId: p.customerId, text: template })}>
        <MessageSquare /> Text
      </Button>
      <Button variant="outline" onClick={() => setMsg({ channel: "email", to: p.email, jobId: p.jobId, customerId: p.customerId, subject: `${p.equipment} at ${p.business}`, text: template })}>
        <Mail /> Email
      </Button>
      <Button
        variant="outline"
        disabled={pending}
        onClick={() => {
          const fd = new FormData();
          fd.set("jobId", p.jobId);
          start(async () => {
            const res = await markContactedAction(fd);
            if (res.ok) {
              toast.success(res.message);
              router.refresh();
            } else toast.error(res.error);
          });
        }}
      >
        <Check /> Mark contacted
      </Button>
      <label className="flex items-center gap-2 text-sm">
        <span className="sr-only">Stage</span>
        <select
          className="native h-11 rounded-lg border border-input bg-background px-3 text-sm font-medium"
          value={p.stage}
          onChange={(e) => {
            const to = e.target.value as Stage;
            if (to !== p.stage) setMove({ jobId: p.jobId, from: p.stage, to, business: p.business });
          }}
          aria-label="Change stage"
        >
          {STAGES.map((s) => (
            <option key={s} value={s}>
              {STAGE_LABEL[s]}
            </option>
          ))}
        </select>
      </label>
      <SendMessageDialog target={msg} open={!!msg} onOpenChange={(o) => !o && setMsg(null)} />
      <MoveStageDialog req={move} techs={p.techs} onDone={() => setMove(null)} />
    </div>
  );
}
