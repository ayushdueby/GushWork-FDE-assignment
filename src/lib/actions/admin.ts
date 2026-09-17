"use server";

import { db } from "@/lib/db";
import { resetAndSeed } from "@/lib/seed/seed";
import { setSetting } from "@/lib/services/settings";
import { guarded, refreshAll, str } from "./util";

export async function resetDemoDataAction() {
  return guarded("admin", async () => {
    await resetAndSeed(db);
    refreshAll();
    return { message: "Demo data reset" };
  });
}

export async function setAutoApplyAction(fd: FormData) {
  return guarded("admin", async () => {
    await setSetting("autoApplyCalls", str(fd, "value") === "1");
    refreshAll();
    return { message: "Setting saved" };
  });
}
