import { NextResponse } from "next/server";
import { requirePermission } from "@/lib/auth/current";
import { searchCustomers } from "@/lib/services/customers";

export async function GET(req: Request) {
  try {
    await requirePermission("view:customers");
  } catch {
    return NextResponse.json({ error: "Not allowed" }, { status: 403 });
  }
  const q = new URL(req.url).searchParams.get("q") ?? "";
  const rows = await searchCustomers(q);
  return NextResponse.json({
    customers: rows.slice(0, 12).map((c) => ({ id: c.id, businessName: c.businessName, primaryContact: c.primaryContact, phone: c.phone, email: c.email, sites: c.sites.map((s) => ({ id: s.id, name: s.name, address: s.address })), openJobs: c.jobs.length })),
  });
}
