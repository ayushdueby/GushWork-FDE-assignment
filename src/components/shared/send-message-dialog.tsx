"use client";

import { useState, useTransition } from "react";
import { Mail, MessageSquare } from "lucide-react";
import { toast } from "sonner";
import { useRouter } from "next/navigation";
import { sendMessageAction } from "@/lib/actions/messaging";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

export interface MessageTarget {
  channel: "sms" | "email";
  to: string | null;
  jobId?: string | null;
  customerId?: string | null;
  subject?: string;
  text?: string;
  replyTo?: string;
}

/** Text / Email compose. In simulated mode the exact outgoing message is shown after "send". */
export function SendMessageDialog({ target, open, onOpenChange }: { target: MessageTarget | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const router = useRouter();
  const t = target;
  if (!t) return null;
  const Icon = t.channel === "sms" ? MessageSquare : Mail;

  function submit(fd: FormData) {
    start(async () => {
      const res = await sendMessageAction(fd);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
        if (res.simulated && res.preview) setPreview(res.preview);
        else onOpenChange(false);
      } else toast.error(res.error);
    });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (!o) setPreview(null);
        onOpenChange(o);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Icon className="size-4" /> {t.channel === "sms" ? "Send a text" : "Send an email"}
          </DialogTitle>
          <DialogDescription>{t.to ? `To ${t.to}` : `No ${t.channel === "sms" ? "phone number" : "email"} on file — add one on the customer first.`}</DialogDescription>
        </DialogHeader>
        {preview ? (
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">Simulated send — this is exactly what would have gone out:</p>
            <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{preview}</pre>
            <div className="flex justify-end">
              <Button onClick={() => onOpenChange(false)}>Done</Button>
            </div>
          </div>
        ) : (
          <form action={submit} className="space-y-3">
            <input type="hidden" name="channel" value={t.channel} />
            <input type="hidden" name="to" value={t.to ?? ""} />
            <input type="hidden" name="jobId" value={t.jobId ?? ""} />
            <input type="hidden" name="customerId" value={t.customerId ?? ""} />
            <input type="hidden" name="replyTo" value={t.replyTo ?? ""} />
            {t.channel === "email" && (
              <div>
                <Label htmlFor="msg-subject">Subject</Label>
                <Input id="msg-subject" name="subject" defaultValue={t.subject ?? ""} required />
              </div>
            )}
            <div>
              <Label htmlFor="msg-text">Message</Label>
              <Textarea id="msg-text" name="text" rows={t.channel === "sms" ? 4 : 8} defaultValue={t.text ?? ""} required maxLength={t.channel === "sms" ? 1000 : 10000} />
            </div>
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending || !t.to}>
                {pending ? "Sending…" : "Send"}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
