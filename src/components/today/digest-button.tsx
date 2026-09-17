"use client";

import { useState, useTransition } from "react";
import { Send } from "lucide-react";
import { toast } from "sonner";
import { sendDigestAction } from "@/lib/actions/messaging";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function DigestButton() {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState<{ to: string; text: string; simulated: boolean } | null>(null);
  const [pending, start] = useTransition();

  function send(channel: "sms" | "email") {
    const fd = new FormData();
    fd.set("channel", channel);
    start(async () => {
      const res = await sendDigestAction(fd);
      if (res.ok) {
        toast.success(res.message);
        setPreview({ to: res.to, text: res.preview, simulated: res.simulated });
      } else toast.error(res.error);
    });
  }

  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        <Send /> Send morning digest
      </Button>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setPreview(null);
        }}
      >
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Morning digest</DialogTitle>
            <DialogDescription>The call list as a message, the way a 7am cron job would send it.</DialogDescription>
          </DialogHeader>
          {preview ? (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {preview.simulated ? "Simulated send" : "Sent"} to <strong>{preview.to}</strong>:
              </p>
              <pre className="max-h-80 overflow-auto whitespace-pre-wrap rounded-lg bg-muted p-3 text-sm">{preview.text}</pre>
              <div className="flex justify-end">
                <Button onClick={() => setOpen(false)}>Done</Button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button className="flex-1" onClick={() => send("sms")} disabled={pending}>
                Send as text
              </Button>
              <Button className="flex-1" variant="outline" onClick={() => send("email")} disabled={pending}>
                Send as email
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
