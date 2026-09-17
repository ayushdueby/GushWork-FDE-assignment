"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw, Link2 } from "lucide-react";
import { toast } from "sonner";
import { syncGmailAction } from "@/lib/actions/inbox";
import { Button } from "@/components/ui/button";

/** "Connect mailbox" starts Google OAuth; once connected, "Sync" pulls unread mail into the pipeline. */
export function GmailSyncButton({ configured }: { configured: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  if (!configured) {
    return (
      <Button variant="ghost" render={<a href="/api/gmail/connect" />} className="text-muted-foreground" title="Needs GMAIL_CLIENT_ID and GMAIL_CLIENT_SECRET">
        <Link2 /> Connect mailbox
      </Button>
    );
  }
  return (
    <Button
      variant="outline"
      disabled={pending}
      onClick={() =>
        start(async () => {
          const res = await syncGmailAction();
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else toast.error(res.error);
        })
      }
    >
      <RefreshCw className={pending ? "animate-spin" : ""} /> Sync Gmail
    </Button>
  );
}
