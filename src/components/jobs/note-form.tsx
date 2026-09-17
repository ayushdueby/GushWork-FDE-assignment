"use client";

import { useRef, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { addNoteAction } from "@/lib/actions/jobs";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

export function NoteForm({ jobId }: { jobId: string }) {
  const [pending, start] = useTransition();
  const ref = useRef<HTMLFormElement>(null);
  const router = useRouter();
  return (
    <form
      ref={ref}
      action={(fd) =>
        start(async () => {
          const res = await addNoteAction(fd);
          if (res.ok) {
            toast.success(res.message);
            ref.current?.reset();
            router.refresh();
          } else toast.error(res.error);
        })
      }
      className="flex flex-col gap-2 sm:flex-row"
    >
      <input type="hidden" name="jobId" value={jobId} />
      <Textarea name="text" rows={2} placeholder="Add a note to the timeline" required aria-label="Note" className="flex-1" />
      <Button type="submit" disabled={pending} className="sm:self-end">
        Add note
      </Button>
    </form>
  );
}
