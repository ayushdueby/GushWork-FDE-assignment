"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { updateJobAction } from "@/lib/actions/jobs";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { EQUIPMENT_TYPES, SOURCES, SOURCE_LABEL } from "@/lib/domain/types";

export function JobDetailsForm({ job, sites, techs }: { job: { id: string; issue: string; equipmentType: string; source: string; urgent: boolean; siteId: string | null; techId: string | null }; sites: { id: string; name: string; address: string }[]; techs: { id: string; name: string }[] }) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const sel = "native h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";
  return (
    <form
      action={(fd) =>
        start(async () => {
          const res = await updateJobAction(fd);
          if (res.ok) {
            toast.success(res.message);
            router.refresh();
          } else toast.error(res.error);
        })
      }
      className="grid gap-3 sm:grid-cols-2"
    >
      <input type="hidden" name="jobId" value={job.id} />
      <div className="sm:col-span-2">
        <Label htmlFor="jd-issue">Issue</Label>
        <Textarea id="jd-issue" name="issue" defaultValue={job.issue} rows={3} maxLength={2000} />
      </div>
      <div>
        <Label htmlFor="jd-eq">Equipment</Label>
        <select id="jd-eq" name="equipmentType" defaultValue={job.equipmentType} className={sel}>
          {EQUIPMENT_TYPES.map((e) => (
            <option key={e}>{e}</option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="jd-src">Source</Label>
        <select id="jd-src" name="source" defaultValue={job.source} className={sel}>
          {SOURCES.map((s) => (
            <option key={s} value={s}>
              {SOURCE_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="jd-site">Site</Label>
        <select id="jd-site" name="siteId" defaultValue={job.siteId ?? ""} className={sel}>
          <option value="">Not set</option>
          {sites.map((s) => (
            <option key={s.id} value={s.id}>
              {s.name} — {s.address}
            </option>
          ))}
        </select>
      </div>
      <div>
        <Label htmlFor="jd-tech">Assigned tech</Label>
        <select id="jd-tech" name="techId" defaultValue={job.techId ?? ""} className={sel}>
          <option value="">Unassigned</option>
          {techs.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
      </div>
      <label className="flex min-h-11 items-center gap-2 text-sm font-medium sm:col-span-2">
        <input type="checkbox" name="urgent" defaultChecked={job.urgent} className="size-4" /> Urgent — equipment is down
      </label>
      <div className="sm:col-span-2">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save details"}
        </Button>
      </div>
    </form>
  );
}
