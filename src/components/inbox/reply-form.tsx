"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { sendMessageAction } from "@/lib/actions/messaging";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function ReplyForm({ channel, to, jobId, customerId, subject, replyTo }: { channel: "sms" | "email"; to: string; jobId: string | null; customerId: string | null; subject?: string | null; replyTo: string }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <div className="space-y-2">
      <form
        ref={ref}
        action={(fd) =>
          start(async () => {
            const res = await sendMessageAction(fd);
            if (res.ok) {
              toast.success(res.message);
              ref.current?.reset();
              if (res.simulated && res.preview) setPreview(res.preview);
              router.refresh();
            } else toast.error(res.error);
          })
        }
        className="flex flex-col gap-2 sm:flex-row"
      >
        <input type="hidden" name="channel" value={channel} />
        <input type="hidden" name="to" value={to} />
        <input type="hidden" name="jobId" value={jobId ?? ""} />
        <input type="hidden" name="customerId" value={customerId ?? ""} />
        <input type="hidden" name="replyTo" value={replyTo} />
        {channel === "email" && <input type="hidden" name="subject" value={subject ? (subject.startsWith("Re:") ? subject : `Re: ${subject}`) : "Re: your request"} />}
        <Textarea name="text" rows={2} required placeholder={`Reply by ${channel === "sms" ? "text" : "email"} to ${to}`} aria-label="Reply" className="flex-1" data-testid="reply-text" />
        <Button type="submit" disabled={pending} className="sm:self-end">
          {pending ? "Sending…" : "Reply"}
        </Button>
      </form>
      {preview && <pre className="whitespace-pre-wrap rounded-lg bg-muted p-3 text-xs text-muted-foreground">Simulated send — would have gone out as:\n\n{preview}</pre>}
    </div>
  );
}
