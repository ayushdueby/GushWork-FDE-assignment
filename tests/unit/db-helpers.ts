import { db } from "@/lib/db";

/** Wipe every table between tests (order respects foreign keys). */
export async function resetDb() {
  await db.$transaction([
    db.notification.deleteMany(),
    db.activity.deleteMany(),
    db.quoteItem.deleteMany(),
    db.quote.deleteMany(),
    db.call.deleteMany(),
    db.message.deleteMany(),
    db.job.deleteMany(),
    db.equipment.deleteMany(),
    db.site.deleteMany(),
    db.customer.deleteMany(),
    db.user.deleteMany(),
    db.tech.deleteMany(),
    db.priceListItem.deleteMany(),
    db.setting.deleteMany(),
  ]);
}
