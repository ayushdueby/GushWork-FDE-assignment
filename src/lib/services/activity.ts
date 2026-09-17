import { db } from "@/lib/db";

export type ActivityType = "stage" | "contact" | "note" | "message_in" | "message_out" | "call" | "missed_call" | "quote" | "schedule" | "system" | "tech";

/** The single timeline everything writes to. */
export async function logActivity(input: { customerId?: string | null; jobId?: string | null; type: ActivityType; text: string; actor?: string; at?: Date }) {
  return db.activity.create({
    data: {
      customerId: input.customerId ?? null,
      jobId: input.jobId ?? null,
      type: input.type,
      text: input.text.slice(0, 2000),
      actor: input.actor ?? "system",
      at: input.at ?? new Date(),
    },
  });
}

export async function notify(input: { text: string; href?: string; forRole?: string }) {
  return db.notification.create({ data: { text: input.text.slice(0, 500), href: input.href ?? null, forRole: input.forRole ?? "owner" } });
}
