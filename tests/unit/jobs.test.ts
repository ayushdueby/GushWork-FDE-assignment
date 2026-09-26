import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/lib/db";
import { createCustomer } from "@/lib/services/customers";
import { addJobNote, completeJob, createJob, markContacted, nextStageRequirement, scheduleJob, setStage, updateJob } from "@/lib/services/jobs";
import { resetDb } from "./db-helpers";

/** The stage machine is what keeps Denise's board honest; these are its rules. */
describe("job stage machine", () => {
  let customerId: string;
  let techId: string;

  beforeEach(async () => {
    await resetDb();
    const c = await createCustomer({ businessName: "Rosa's Taqueria", phone: "(512) 555-0199", primaryContact: "Rosa" });
    customerId = c.id;
    const t = await db.tech.create({ data: { name: "Marcus Lee", phone: "(512) 555-0141" } });
    techId = t.id;
    await db.tech.create({ data: { name: "Jenna Ortiz" } });
  });

  const newJob = (over: Partial<Parameters<typeof createJob>[0]> = {}) => createJob({ customerId, issue: "Freezer down", equipmentType: "walk-in freezer", source: "call", ...over });
  const acts = (jobId: string, type?: string) => db.activity.findMany({ where: { jobId, ...(type ? { type } : {}) }, orderBy: { at: "asc" } });

  it("a forward move counts as contact; a backward move does not", async () => {
    const job = await newJob();
    expect(job.lastContactAt).toBeNull();
    const forward = await setStage(job.id, "waiting_on_yes", { actor: "Denise" });
    expect(forward.lastContactAt).not.toBeNull();
    const stamp = forward.lastContactAt!.getTime();
    const back = await setStage(job.id, "needs_quote", { actor: "Denise" });
    expect(back.lastContactAt?.getTime()).toBe(stamp); // unchanged: going back is not a touch
  });

  it("marking lost does not count as contact and requires a reason", async () => {
    const job = await newJob();
    await expect(setStage(job.id, "lost", { actor: "Denise" })).rejects.toThrow(/reason/i);
    await expect(setStage(job.id, "lost", { actor: "Denise", lostReason: "   " })).rejects.toThrow(/reason/i);
    const lost = await setStage(job.id, "lost", { actor: "Denise", lostReason: "Went with someone else" });
    expect(lost.stage).toBe("lost");
    expect(lost.lostReason).toBe("Went with someone else");
    expect(lost.lastContactAt).toBeNull();
    expect((await acts(job.id, "stage"))[0].text).toContain("Went with someone else");
  });

  it("reopening a lost job clears the reason", async () => {
    const job = await newJob();
    await setStage(job.id, "lost", { lostReason: "Too expensive" });
    const reopened = await setStage(job.id, "needs_quote", {});
    expect(reopened.stage).toBe("needs_quote");
    expect(reopened.lostReason).toBeNull();
  });

  it("scheduling needs a date, and done stamps completedAt", async () => {
    const job = await newJob();
    await expect(setStage(job.id, "scheduled", {})).rejects.toThrow(/date/i);
    const when = new Date(Date.now() + 86_400_000);
    const scheduled = await setStage(job.id, "scheduled", { scheduledFor: when });
    expect(scheduled.scheduledFor?.getTime()).toBe(when.getTime());
    const done = await setStage(job.id, "done", {});
    expect(done.completedAt).not.toBeNull();
    // Reopening clears the completion stamp so "done this week" stays truthful.
    const reopened = await setStage(job.id, "scheduled", {});
    expect(reopened.completedAt).toBeNull();
  });

  it("moving to the stage it is already in is a no-op: no duplicate activity, no skipped stage", async () => {
    const job = await newJob();
    await setStage(job.id, "waiting_on_yes", {});
    const first = await acts(job.id, "stage");
    const again = await setStage(job.id, "waiting_on_yes", {});
    expect(again.stage).toBe("waiting_on_yes");
    expect(await acts(job.id, "stage")).toHaveLength(first.length);
  });

  it("rejects an unknown stage and a missing job", async () => {
    const job = await newJob();
    await expect(setStage(job.id, "archived" as never, {})).rejects.toThrow(/unknown stage/i);
    await expect(setStage("does-not-exist", "approved", {})).rejects.toThrow(/not found/i);
  });

  it("nextStageRequirement asks for exactly what the next stage needs", () => {
    expect(nextStageRequirement("needs_quote")).toEqual({ next: "waiting_on_yes", needs: "quote" });
    expect(nextStageRequirement("waiting_on_yes")).toEqual({ next: "approved", needs: null });
    expect(nextStageRequirement("approved")).toEqual({ next: "scheduled", needs: "schedule" });
    expect(nextStageRequirement("scheduled")).toEqual({ next: "done", needs: null });
    expect(nextStageRequirement("done")).toEqual({ next: null, needs: null });
  });

  it("markContacted stamps the clock and writes the right verb per channel", async () => {
    const job = await newJob();
    await markContacted(job.id, { via: "call", actor: "Denise" });
    await markContacted(job.id, { via: "sms", actor: "Denise" });
    await markContacted(job.id, { via: "email", actor: "Denise" });
    await markContacted(job.id, { actor: "Denise" });
    const texts = (await acts(job.id, "contact")).map((a) => a.text);
    expect(texts).toEqual(["Called customer", "Texted customer", "Emailed customer", "Marked contacted"]);
    expect((await db.job.findUnique({ where: { id: job.id } }))!.lastContactAt).not.toBeNull();
  });

  it("notes need content and land on the timeline", async () => {
    const job = await newJob();
    await expect(addJobNote(job.id, "   ", "Denise")).rejects.toThrow(/empty/i);
    await addJobNote(job.id, "Gate code is 4471", "Denise");
    expect((await acts(job.id, "note"))[0].text).toBe("Gate code is 4471");
  });

  it("editing a job logs only what actually changed", async () => {
    const job = await newJob({ urgent: false });
    await updateJob(job.id, { issue: "Freezer down", equipmentType: "walk-in freezer" }, "Denise"); // same values
    expect(await acts(job.id, "system")).toHaveLength(1); // just "Job created"
    await updateJob(job.id, { urgent: true, techId }, "Denise");
    const system = (await acts(job.id, "system")).map((a) => a.text);
    expect(system.at(-1)).toContain("marked urgent");
    expect(system.at(-1)).toContain("assigned to Marcus Lee");
  });
});

describe("scheduling and double-booking", () => {
  let customerId: string;
  let techId: string;

  beforeEach(async () => {
    await resetDb();
    customerId = (await createCustomer({ businessName: "Big Sky Grocery", phone: "(512) 555-0134" })).id;
    techId = (await db.tech.create({ data: { name: "Marcus Lee" } })).id;
  });

  const at = (h: number) => {
    const d = new Date();
    d.setDate(d.getDate() + 3);
    d.setHours(h, 0, 0, 0);
    return d;
  };

  it("booking sets the stage, the window, the tech, and notifies", async () => {
    const job = await createJob({ customerId, issue: "Walk-in warm", equipmentType: "walk-in cooler", source: "email", stage: "approved" });
    let notified: string | null = null;
    const { job: updated, conflict } = await scheduleJob(job.id, { scheduledFor: at(9), techId, durationMin: 90, actor: "Denise", notifyTech: async (j) => void (notified = j.tech?.name ?? null) });
    expect(updated.stage).toBe("scheduled");
    expect(updated.scheduledEnd!.getTime() - updated.scheduledFor!.getTime()).toBe(90 * 60_000);
    expect(updated.lastContactAt).not.toBeNull(); // forward move = contact
    expect(conflict).toBeNull();
    expect(notified).toBe("Marcus Lee");
  });

  it("flags an overlap for the same tech but allows a touching slot or a different tech", async () => {
    const a = await createJob({ customerId, issue: "A", source: "call", stage: "approved" });
    const b = await createJob({ customerId, issue: "B", source: "call", stage: "approved" });
    const c = await createJob({ customerId, issue: "C", source: "call", stage: "approved" });
    await scheduleJob(a.id, { scheduledFor: at(9), techId, durationMin: 120 }); // 9–11

    // Starts exactly as A ends: back-to-back is allowed.
    const touching = await scheduleJob(c.id, { scheduledFor: at(11), techId, durationMin: 60 }); // 11–12
    expect(touching.conflict).toBeNull();

    // Straddles both: flagged, but still saved — Denise decides.
    const overlapping = await scheduleJob(b.id, { scheduledFor: at(10), techId, durationMin: 120 }); // 10–12
    expect(overlapping.conflict).not.toBeNull();
    expect([a.id, c.id]).toContain(overlapping.conflict!.id);
    expect(overlapping.job.stage).toBe("scheduled");

    const otherTech = (await db.tech.create({ data: { name: "Jenna Ortiz" } })).id;
    const d = await createJob({ customerId, issue: "D", source: "call", stage: "approved" });
    expect((await scheduleJob(d.id, { scheduledFor: at(9), techId: otherTech, durationMin: 120 })).conflict).toBeNull();
  });

  it("an unassigned booking can't double-book, and rescheduling doesn't conflict with itself", async () => {
    const a = await createJob({ customerId, issue: "A", source: "call", stage: "approved" });
    const b = await createJob({ customerId, issue: "B", source: "call", stage: "approved" });
    expect((await scheduleJob(a.id, { scheduledFor: at(9), techId: null })).conflict).toBeNull();
    expect((await scheduleJob(b.id, { scheduledFor: at(9), techId: null })).conflict).toBeNull();
    await scheduleJob(a.id, { scheduledFor: at(13), techId });
    const moved = await scheduleJob(a.id, { scheduledFor: at(14), techId });
    expect(moved.conflict).toBeNull();
    expect(moved.job.scheduledFor!.getHours()).toBe(14);
  });

  it("rejects an invalid date and logs 'Rescheduled' the second time", async () => {
    const job = await createJob({ customerId, issue: "A", source: "call", stage: "approved" });
    await expect(scheduleJob(job.id, { scheduledFor: new Date("nonsense") })).rejects.toThrow(/valid date/i);
    await scheduleJob(job.id, { scheduledFor: at(9), techId });
    await scheduleJob(job.id, { scheduledFor: at(15), techId });
    const texts = (await db.activity.findMany({ where: { jobId: job.id, type: "schedule" }, orderBy: { at: "asc" } })).map((a) => a.text);
    expect(texts[0]).toMatch(/^Scheduled for/);
    expect(texts[1]).toMatch(/^Rescheduled for/);
    // Only one "Stage → Scheduled" even though it was booked twice.
    expect(await db.activity.count({ where: { jobId: job.id, type: "stage" } })).toBe(1);
  });

  it("completing is idempotent and notifies the owner once", async () => {
    const job = await createJob({ customerId, issue: "A", source: "call", stage: "scheduled" });
    const done = await completeJob(job.id, { notes: "Replaced fan motor", actor: "Marcus Lee" });
    expect(done.stage).toBe("done");
    expect(done.completionNotes).toBe("Replaced fan motor");
    expect(done.completedAt).not.toBeNull();
    const again = await completeJob(job.id, { notes: "Replaced fan motor", actor: "Marcus Lee" });
    expect(again.completedAt!.getTime()).toBe(done.completedAt!.getTime());
    expect(await db.notification.count()).toBe(1);
    expect(await db.activity.count({ where: { jobId: job.id, type: "stage" } })).toBe(1);
  });
});
