"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ClipboardPaste, Search, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { createJobAction } from "@/lib/actions/jobs";
import { parseMessage } from "@/lib/parse/parseMessage";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CUSTOMER_TYPES, EQUIPMENT_TYPES, SOURCES, SOURCE_LABEL, formatPhone } from "@/lib/domain/types";
import { cn } from "@/lib/utils";

interface CustomerHit {
  id: string;
  businessName: string;
  primaryContact: string;
  phone: string | null;
  email: string | null;
  sites: { id: string; name: string; address: string }[];
  openJobs: number;
}

const SOURCE_FROM_PARSER: Record<string, string> = { "web form": "web_form", text: "sms", call: "call", referral: "referral", repeat: "repeat" };

export function NewJobForm({ initialCustomerId }: { initialCustomerId?: string }) {
  const [mode, setMode] = useState<"existing" | "new">(initialCustomerId ? "existing" : "new");
  const [q, setQ] = useState("");
  const [hits, setHits] = useState<CustomerHit[]>([]);
  const [picked, setPicked] = useState<CustomerHit | null>(null);
  const [paste, setPaste] = useState("");
  const [f, setF] = useState({ businessName: "", primaryContact: "", phone: "", email: "", type: "restaurant", address: "", equipmentType: "walk-in cooler", issue: "", source: "call", urgent: false });
  const [pending, start] = useTransition();
  const router = useRouter();

  useEffect(() => {
    if (mode !== "existing") return;
    const t = setTimeout(() => {
      fetch(`/api/customers/search?q=${encodeURIComponent(q)}`)
        .then((r) => r.json())
        .then((d) => setHits(d.customers ?? []))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(t);
  }, [q, mode]);

  useEffect(() => {
    if (initialCustomerId) {
      fetch(`/api/customers/search?q=`)
        .then((r) => r.json())
        .then((d) => setPicked((d.customers as CustomerHit[]).find((c) => c.id === initialCustomerId) ?? null))
        .catch(() => {});
    }
  }, [initialCustomerId]);

  function fillFromPaste() {
    const p = parseMessage(paste);
    setF((cur) => ({
      ...cur,
      businessName: p.businessName ?? cur.businessName,
      primaryContact: p.customerName ?? cur.primaryContact,
      phone: p.phone ?? cur.phone,
      equipmentType: p.equipment ?? cur.equipmentType,
      issue: p.issue ?? cur.issue,
      urgent: p.urgent ?? cur.urgent,
      source: p.source ? SOURCE_FROM_PARSER[p.source] ?? cur.source : cur.source,
    }));
    if (!p.phone && !p.customerName && !p.businessName && !p.issue) toast.info("Couldn't find much in that — fill in the rest by hand.");
    else toast.success("Filled in from the message. Check it before saving.");
  }

  function submit(fd: FormData) {
    if (mode === "existing") {
      if (!picked) {
        toast.error("Pick a customer or switch to 'New customer'.");
        return;
      }
      fd.set("customerId", picked.id);
    }
    start(async () => {
      const res = await createJobAction(fd);
      if (res.ok) {
        toast.success(res.message);
        router.push(`/jobs/${res.jobId}`);
        router.refresh();
      } else toast.error(res.error);
    });
  }

  const sel = "native h-11 w-full rounded-lg border border-input bg-background px-3 text-sm";
  const set = (k: keyof typeof f) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => setF((cur) => ({ ...cur, [k]: e.target.value }));

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_20rem]">
      <form action={submit} className="space-y-5">
        <section className="rounded-2xl border border-border bg-card p-4">
          <div className="mb-3 flex gap-2" role="tablist">
            {(["existing", "new"] as const).map((m) => (
              <button key={m} type="button" role="tab" aria-selected={mode === m} onClick={() => setMode(m)} className={cn("h-10 rounded-lg px-3 text-sm font-medium", mode === m ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground")}>
                {m === "existing" ? "Existing customer" : "New customer"}
              </button>
            ))}
          </div>
          {mode === "existing" ? (
            <div className="space-y-2">
              {picked ? (
                <div className="flex items-center justify-between rounded-lg border border-primary/30 bg-primary/5 px-3 py-2 text-sm">
                  <span>
                    <strong>{picked.businessName}</strong> {picked.primaryContact && `· ${picked.primaryContact}`} {picked.phone && `· ${formatPhone(picked.phone)}`}
                    {picked.openJobs > 0 && <span className="ml-2 rounded-full bg-amber-100 px-2 py-0.5 text-xs text-amber-900">{picked.openJobs} open job{picked.openJobs === 1 ? "" : "s"}</span>}
                  </span>
                  <button type="button" className="text-primary underline" onClick={() => setPicked(null)}>
                    Change
                  </button>
                </div>
              ) : (
                <>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
                    <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by business, name or phone" className="pl-9" aria-label="Search customers" autoFocus />
                  </div>
                  <ul className="max-h-56 divide-y divide-border overflow-auto rounded-lg border border-border">
                    {hits.map((h) => (
                      <li key={h.id}>
                        <button type="button" onClick={() => setPicked(h)} className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-muted">
                          <span>
                            <strong>{h.businessName}</strong> <span className="text-muted-foreground">{h.primaryContact}</span>
                          </span>
                          <span className="text-xs text-muted-foreground">{formatPhone(h.phone)}</span>
                        </button>
                      </li>
                    ))}
                    {hits.length === 0 && <li className="px-3 py-3 text-sm text-muted-foreground">No matches.</li>}
                  </ul>
                </>
              )}
              {picked && picked.sites.length > 1 && (
                <div>
                  <Label htmlFor="nj-site">Site</Label>
                  <select id="nj-site" name="siteId" className={sel} defaultValue={picked.sites[0].id}>
                    {picked.sites.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.name} — {s.address}
                      </option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <Label htmlFor="nj-biz">Business</Label>
                <Input id="nj-biz" name="businessName" value={f.businessName} onChange={set("businessName")} placeholder="Rosa's Taqueria" />
              </div>
              <div>
                <Label htmlFor="nj-contact">Contact name</Label>
                <Input id="nj-contact" name="primaryContact" value={f.primaryContact} onChange={set("primaryContact")} placeholder="Rosa Delgado" />
              </div>
              <div>
                <Label htmlFor="nj-phone">Phone</Label>
                <Input id="nj-phone" name="phone" value={f.phone} onChange={set("phone")} inputMode="tel" placeholder="(512) 555-0199" />
              </div>
              <div>
                <Label htmlFor="nj-email">Email</Label>
                <Input id="nj-email" name="email" value={f.email} onChange={set("email")} inputMode="email" placeholder="rosa@…" />
              </div>
              <div>
                <Label htmlFor="nj-type">Type</Label>
                <select id="nj-type" name="type" className={sel} value={f.type} onChange={set("type")}>
                  {CUSTOMER_TYPES.map((t) => (
                    <option key={t} value={t} className="capitalize">
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <Label htmlFor="nj-addr">Address</Label>
                <Input id="nj-addr" name="address" value={f.address} onChange={set("address")} placeholder="Street, city" />
              </div>
            </div>
          )}
        </section>

        <section className="rounded-2xl border border-border bg-card p-4">
          <h2 className="mb-3 font-semibold">The job</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="sm:col-span-2">
              <Label htmlFor="nj-issue">What&apos;s wrong</Label>
              <Textarea id="nj-issue" name="issue" value={f.issue} onChange={set("issue")} rows={3} placeholder="Walk-in freezer stopped cooling, product thawing" />
            </div>
            <div>
              <Label htmlFor="nj-eq">Equipment</Label>
              <select id="nj-eq" name="equipmentType" className={sel} value={f.equipmentType} onChange={set("equipmentType")}>
                {EQUIPMENT_TYPES.map((e) => (
                  <option key={e}>{e}</option>
                ))}
              </select>
            </div>
            <div>
              <Label htmlFor="nj-src">Came in by</Label>
              <select id="nj-src" name="source" className={sel} value={f.source} onChange={set("source")}>
                {SOURCES.map((s) => (
                  <option key={s} value={s}>
                    {SOURCE_LABEL[s]}
                  </option>
                ))}
              </select>
            </div>
            <label className="flex min-h-11 items-center gap-2 text-sm font-medium sm:col-span-2">
              <input type="checkbox" name="urgent" checked={f.urgent} onChange={(e) => setF((c) => ({ ...c, urgent: e.target.checked }))} className="size-4" /> Urgent — equipment is down
            </label>
          </div>
        </section>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={() => router.back()}>
            Cancel
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Create job"}
          </Button>
        </div>
      </form>

      <aside className="h-fit rounded-2xl border border-dashed border-border bg-muted/30 p-4">
        <h2 className="flex items-center gap-2 font-semibold">
          <ClipboardPaste className="size-4" /> Paste a message
        </h2>
        <p className="mb-2 text-sm text-muted-foreground">A text, a voicemail transcript or a website-form email. We&apos;ll fill in what we can.</p>
        <Textarea value={paste} onChange={(e) => setPaste(e.target.value)} rows={8} placeholder={"Hi this is Jake from Harbor Grill, our ice machine stopped making ice. 555.402.1188"} aria-label="Pasted message" />
        <Button type="button" variant="outline" className="mt-2 w-full" onClick={fillFromPaste} disabled={!paste.trim()}>
          <UserPlus /> Fill in
        </Button>
        <p className="mt-2 text-xs text-muted-foreground">Uses the rule-based parser; the Inbox uses the AI one.</p>
      </aside>
    </div>
  );
}
