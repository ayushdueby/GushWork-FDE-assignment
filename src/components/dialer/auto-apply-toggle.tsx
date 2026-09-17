"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { setAutoApplyAction } from "@/lib/actions/admin";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/** Owner setting: apply call-transcript updates without review. */
export function AutoApplyToggle({ enabled }: { enabled: boolean }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  return (
    <div className="flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2">
      <Switch
        id="auto-apply"
        checked={enabled}
        disabled={pending}
        onCheckedChange={(v) => {
          const fd = new FormData();
          fd.set("value", v ? "1" : "0");
          start(async () => {
            const res = await setAutoApplyAction(fd);
            if (res.ok) {
              toast.success(v ? "Call updates will be applied automatically" : "Call updates now need your review");
              router.refresh();
            } else toast.error(res.error);
          });
        }}
      />
      <Label htmlFor="auto-apply" className="text-sm">
        Auto-apply call updates
      </Label>
    </div>
  );
}
