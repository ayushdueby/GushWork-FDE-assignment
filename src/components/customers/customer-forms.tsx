"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Pencil, Plus } from "lucide-react";
import { toast } from "sonner";
import { addEquipmentAction, addSiteAction, createCustomerAction, updateCustomerAction } from "@/lib/actions/customers";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOMER_TYPES, EQUIPMENT_TYPES } from "@/lib/domain/types";

const sel = "native h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";

function useRun(onDone?: () => void) {
  const [pending, start] = useTransition();
  const router = useRouter();
  const run = (action: (fd: FormData) => Promise<{ ok: boolean; message?: string; error?: string; customerId?: string }>, fd: FormData, after?: (r: { customerId?: string }) => void) =>
    start(async () => {
      const res = await action(fd);
      if (res.ok) {
        toast.success(res.message ?? "Saved");
        router.refresh();
        onDone?.();
        after?.(res);
      } else toast.error(res.error ?? "Something went wrong");
    });
  return { pending, run, router };
}

export function CustomerFields({ c }: { c?: { businessName: string; primaryContact: string; phone: string | null; email: string | null; type: string; notes: string } }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div>
        <Label htmlFor="cf-biz">Business</Label>
        <Input id="cf-biz" name="businessName" defaultValue={c?.businessName ?? ""} required />
      </div>
      <div>
        <Label htmlFor="cf-contact">Primary contact</Label>
        <Input id="cf-contact" name="primaryContact" defaultValue={c?.primaryContact ?? ""} />
      </div>
      <div>
        <Label htmlFor="cf-phone">Phone</Label>
        <Input id="cf-phone" name="phone" defaultValue={c?.phone ?? ""} inputMode="tel" />
      </div>
      <div>
        <Label htmlFor="cf-email">Email</Label>
        <Input id="cf-email" name="email" defaultValue={c?.email ?? ""} inputMode="email" />
      </div>
      <div>
        <Label htmlFor="cf-type">Type</Label>
        <select id="cf-type" name="type" defaultValue={c?.type ?? "restaurant"} className={sel}>
          {CUSTOMER_TYPES.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
      </div>
      {!c && (
        <div>
          <Label htmlFor="cf-addr">Address</Label>
          <Input id="cf-addr" name="address" placeholder="Street, city" />
        </div>
      )}
      <div className="sm:col-span-2">
        <Label htmlFor="cf-notes">Notes</Label>
        <Textarea id="cf-notes" name="notes" defaultValue={c?.notes ?? ""} rows={2} placeholder="Gate codes, who to ask for, billing quirks" />
      </div>
    </div>
  );
}

export function NewCustomerDialog() {
  const [open, setOpen] = useState(false);
  const { pending, run, router } = useRun(() => setOpen(false));
  return (
    <>
      <Button onClick={() => setOpen(true)}>
        <Plus /> New customer
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>New customer</DialogTitle>
          </DialogHeader>
          <form action={(fd) => run(createCustomerAction, fd, (r) => r.customerId && router.push(`/customers/${r.customerId}`))} className="space-y-4">
            <CustomerFields />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Create"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function EditCustomerDialog({ c }: { c: { id: string; businessName: string; primaryContact: string; phone: string | null; email: string | null; type: string; notes: string } }) {
  const [open, setOpen] = useState(false);
  const { pending, run } = useRun(() => setOpen(false));
  return (
    <>
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        <Pencil /> Edit
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Edit customer</DialogTitle>
          </DialogHeader>
          <form action={(fd) => run(updateCustomerAction, fd)} className="space-y-4">
            <input type="hidden" name="customerId" value={c.id} />
            <CustomerFields c={c} />
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Saving…" : "Save"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}

export function AddSiteForm({ customerId }: { customerId: string }) {
  const { pending, run } = useRun();
  return (
    <form action={(fd) => run(addSiteAction, fd)} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="customerId" value={customerId} />
      <Input name="name" placeholder="Site name (e.g. Downtown)" required aria-label="Site name" />
      <Input name="address" placeholder="Address" required aria-label="Address" className="sm:flex-[2]" />
      <Button type="submit" variant="outline" disabled={pending}>
        Add site
      </Button>
    </form>
  );
}

export function AddEquipmentForm({ siteId }: { siteId: string }) {
  const { pending, run } = useRun();
  return (
    <form action={(fd) => run(addEquipmentAction, fd)} className="flex flex-col gap-2 sm:flex-row">
      <input type="hidden" name="siteId" value={siteId} />
      <select name="type" className={sel} aria-label="Equipment type" defaultValue="walk-in cooler">
        {EQUIPMENT_TYPES.map((e) => (
          <option key={e}>{e}</option>
        ))}
      </select>
      <Input name="makeModel" placeholder="Make / model" aria-label="Make and model" />
      <Button type="submit" variant="outline" size="sm" disabled={pending} className="h-11">
        Add equipment
      </Button>
    </form>
  );
}
