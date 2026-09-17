import { db } from "@/lib/db";
import { phoneDigits, type CustomerType } from "@/lib/domain/types";
import { matchCustomer, type MatchInput, type MatchResult } from "@/lib/pipeline/match";
import { logActivity } from "./activity";

function clean(v: string | null | undefined, max = 200): string {
  return (v ?? "").replace(/\s+/g, " ").trim().slice(0, max);
}

export async function findMatchingCustomer(input: MatchInput): Promise<MatchResult> {
  // 15–20 leads a week: scanning every customer is fine and keeps the matcher pure.
  const candidates = await db.customer.findMany({ select: { id: true, businessName: true, phoneDigits: true, email: true } });
  return matchCustomer(input, candidates);
}

export interface CustomerInput {
  businessName: string;
  type?: CustomerType | string | null;
  primaryContact?: string | null;
  phone?: string | null;
  email?: string | null;
  notes?: string | null;
  siteName?: string | null;
  address?: string | null;
}

export async function createCustomer(input: CustomerInput, actor = "system") {
  const businessName = clean(input.businessName, 160) || clean(input.primaryContact, 160) || "Unknown customer";
  const phone = clean(input.phone, 40) || null;
  const email = clean(input.email, 160).toLowerCase() || null;
  const customer = await db.customer.create({
    data: {
      businessName,
      type: ["restaurant", "grocery", "warehouse", "other"].includes(input.type ?? "") ? (input.type as string) : "other",
      primaryContact: clean(input.primaryContact, 120),
      phone,
      phoneDigits: phone ? phoneDigits(phone) || null : null,
      email,
      notes: clean(input.notes, 4000),
      sites: input.address || input.siteName ? { create: { name: clean(input.siteName, 120) || "Main location", address: clean(input.address, 240) } } : undefined,
    },
    include: { sites: true },
  });
  await logActivity({ customerId: customer.id, type: "system", text: `Customer created: ${customer.businessName}`, actor });
  return customer;
}

export async function updateCustomer(id: string, input: Partial<CustomerInput>, actor = "system") {
  const data: Record<string, unknown> = {};
  if (input.businessName !== undefined) data.businessName = clean(input.businessName, 160) || "Unknown customer";
  if (input.type !== undefined) data.type = ["restaurant", "grocery", "warehouse", "other"].includes(input.type ?? "") ? input.type : "other";
  if (input.primaryContact !== undefined) data.primaryContact = clean(input.primaryContact, 120);
  if (input.phone !== undefined) {
    const phone = clean(input.phone, 40) || null;
    data.phone = phone;
    data.phoneDigits = phone ? phoneDigits(phone) || null : null;
  }
  if (input.email !== undefined) data.email = clean(input.email, 160).toLowerCase() || null;
  if (input.notes !== undefined) data.notes = clean(input.notes, 4000);
  const customer = await db.customer.update({ where: { id }, data });
  await logActivity({ customerId: id, type: "system", text: "Customer details updated", actor });
  return customer;
}

/** Fill blanks on an existing customer from a new message; never overwrite what Denise typed. */
export async function enrichCustomer(id: string, input: { primaryContact?: string | null; phone?: string | null; email?: string | null; address?: string | null }) {
  const c = await db.customer.findUnique({ where: { id }, include: { sites: true } });
  if (!c) return null;
  const data: Record<string, unknown> = {};
  if (!c.primaryContact && clean(input.primaryContact)) data.primaryContact = clean(input.primaryContact, 120);
  if (!c.phone && clean(input.phone)) {
    data.phone = clean(input.phone, 40);
    data.phoneDigits = phoneDigits(input.phone) || null;
  }
  if (!c.email && clean(input.email)) data.email = clean(input.email, 160).toLowerCase();
  if (Object.keys(data).length) await db.customer.update({ where: { id }, data });
  if (clean(input.address) && c.sites.length === 0) {
    await db.site.create({ data: { customerId: id, name: "Main location", address: clean(input.address, 240) } });
  }
  return c;
}

export async function searchCustomers(q: string) {
  const term = q.trim();
  const where = term
    ? {
        OR: [
          { businessName: { contains: term } },
          { primaryContact: { contains: term } },
          { email: { contains: term.toLowerCase() } },
          ...(phoneDigits(term).length >= 3 ? [{ phoneDigits: { contains: phoneDigits(term) } }] : []),
          { sites: { some: { address: { contains: term } } } },
        ],
      }
    : {};
  return db.customer.findMany({
    where,
    orderBy: { businessName: "asc" },
    include: { sites: true, _count: { select: { jobs: true } }, jobs: { where: { stage: { notIn: ["done", "lost"] } }, select: { id: true, stage: true, urgent: true } } },
    take: 200,
  });
}

export async function getCustomerDetail(id: string) {
  return db.customer.findUnique({
    where: { id },
    include: {
      sites: { include: { equipment: true }, orderBy: { createdAt: "asc" } },
      jobs: { orderBy: { createdAt: "desc" }, include: { tech: true, quotes: { select: { id: true, status: true, total: true } } } },
      calls: { orderBy: { startedAt: "desc" }, take: 50 },
      messages: { orderBy: { receivedAt: "desc" }, take: 50 },
      quotes: { orderBy: { createdAt: "desc" }, include: { job: { select: { id: true, issue: true } } } },
      activities: { orderBy: { at: "desc" }, take: 200 },
    },
  });
}

export async function addSite(customerId: string, input: { name: string; address: string }, actor = "system") {
  const site = await db.site.create({ data: { customerId, name: clean(input.name, 120) || "Location", address: clean(input.address, 240) } });
  await logActivity({ customerId, type: "system", text: `Site added: ${site.name}`, actor });
  return site;
}

export async function addEquipment(siteId: string, input: { type: string; makeModel?: string; notes?: string }, actor = "system") {
  const site = await db.site.findUnique({ where: { id: siteId } });
  if (!site) throw new Error("Site not found");
  const eq = await db.equipment.create({ data: { siteId, type: clean(input.type, 40) || "other", makeModel: clean(input.makeModel, 120), notes: clean(input.notes, 1000) } });
  await logActivity({ customerId: site.customerId, type: "system", text: `Equipment added at ${site.name}: ${eq.type}${eq.makeModel ? ` (${eq.makeModel})` : ""}`, actor });
  return eq;
}

export function customerLabel(c: { businessName: string; primaryContact?: string | null }): string {
  return c.primaryContact ? `${c.businessName} · ${c.primaryContact}` : c.businessName;
}
